package com.chromvoid.air

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.bridge.wire.PassmanagerEntryPageRequest
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.credentials.CATALOG_CREATE_TAG
import com.chromvoid.air.ui.credentials.CredentialFormModel.Field
import com.chromvoid.air.ui.credentials.CredentialFormModel.Kind
import com.chromvoid.air.ui.credentials.DETAIL_BACK_TAG
import com.chromvoid.air.ui.credentials.DETAIL_EDIT_TAG
import com.chromvoid.air.ui.credentials.DETAIL_TITLE_TAG
import com.chromvoid.air.ui.credentials.FORM_CARD_BRAND_TAG
import com.chromvoid.air.ui.credentials.FORM_GENERATE_TAG
import com.chromvoid.air.ui.credentials.FORM_SAVE_TAG
import com.chromvoid.air.ui.credentials.GENERATOR_RUN_TAG
import com.chromvoid.air.ui.credentials.GENERATOR_USE_TAG
import com.chromvoid.air.ui.credentials.PAYMENT_CARD_BRAND_TAG
import com.chromvoid.air.ui.credentials.PAYMENT_CARD_NUMBER_TAG
import com.chromvoid.air.ui.credentials.PasswordGeneratorModel
import com.chromvoid.air.ui.credentials.createKindTag
import com.chromvoid.air.ui.credentials.formFieldTag
import com.chromvoid.air.ui.credentials.formPlaceholderTag
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Routes A07 and A08 against real Core, through the screens: a login and a
 * payment card are created from the catalog, the login is edited, and Core
 * holds exactly what the form saved. The card is typed on its face with
 * Core's grouping and hand-over of focus, saved without a name for Core to
 * name, and its page draws it masked.
 */
@RunWith(AndroidJUnit4::class)
public class CredentialFormInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun aLoginAndACardAreCreatedAndTheLoginEdited() {
        val generation = unlocked()

        startCreating(Kind.LOGIN)
        type(Field.TITLE, "Почта")
        type(Field.USERNAME, "alice")
        type(Field.PASSWORD, "first-password")
        save()
        rule.onNodeWithTag(DETAIL_TITLE_TAG).assertTextContains("Почта")

        rule.onNodeWithTag(DETAIL_EDIT_TAG).performClick()
        awaitNode(formFieldTag(Field.TITLE))
        rule.onNodeWithTag(formFieldTag(Field.TITLE)).performTextClearance()
        type(Field.TITLE, "Рабочая почта")
        rule.onNodeWithTag(formFieldTag(Field.PASSWORD)).performTextClearance()
        type(Field.PASSWORD, "second-password")
        save()
        rule.onNodeWithTag(DETAIL_TITLE_TAG).assertTextContains("Рабочая почта")
        rule.onNodeWithTag(DETAIL_BACK_TAG).performClick()

        // A card needs no name: Core names it from its network and last four digits.
        startCreating(Kind.CARD)
        type(Field.CARDHOLDER, "ALICE")
        type(Field.CARD_NUMBER, "4111-1111 1111 1111")
        // Typed on the face in the clear, grouped as Visa prints it; the draft keeps the digits.
        rule.onNodeWithTag(formFieldTag(Field.CARD_NUMBER))
            .assert(shows("4111 1111 1111 1111"))
            .assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Password))
        rule.onNodeWithTag(FORM_CARD_BRAND_TAG).assertTextEquals("Visa")
        rule.onNodeWithTag(formPlaceholderTag(Field.TITLE)).assertTextEquals("Visa •••• 1111")
        // A whole number hands focus on, as a card is read out: month, year, code.
        awaitFocus(Field.MONTH)
        type(Field.MONTH, "3")
        rule.onNodeWithTag(formFieldTag(Field.MONTH))
            .assert(shows("03"))
        awaitFocus(Field.YEAR)
        type(Field.YEAR, "35")
        awaitFocus(Field.CARD_CODE)
        type(Field.CARD_CODE, "1234")
        rule.onNodeWithTag(formFieldTag(Field.CARD_CODE))
            .assert(shows("123"))
        save()
        rule.onNodeWithTag(DETAIL_TITLE_TAG).assertTextEquals("Visa •••• 1111")
        // The page draws the card itself, masked to its last four.
        rule.onNodeWithTag(PAYMENT_CARD_NUMBER_TAG).assertTextEquals("•••• •••• •••• 1111")
        rule.onNodeWithTag(PAYMENT_CARD_BRAND_TAG).assertTextEquals("VISA")

        val stored = runBlocking {
            val everything = PassmanagerEntryPageRequest(limit = 50, offset = 0, query = "")
            session.credentials.credentialPage(everything, generation).entries.associateBy { it.title }
        }
        assertEquals(setOf("Рабочая почта", "Visa •••• 1111"), stored.keys)
        val login = stored.getValue("Рабочая почта").id
        val card = stored.getValue("Visa •••• 1111").id
        runBlocking {
            assertEquals("second-password", session.credentials.readCredentialSecret(login, "password", generation))
            assertEquals("4111111111111111", session.credentials.readCredentialSecret(card, "card_pan", generation))
            assertEquals("123", session.credentials.readCredentialSecret(card, "card_cvv", generation))
            val detail = session.credentials.credentialDetail(card, generation)
            assertEquals("visa", detail.paymentCard?.brand)
            assertEquals(2035L, detail.paymentCard?.expYear)
        }
    }

    /** A login whose password Core's generator made: the form takes it, the save stores it. */
    @Test
    public fun aGeneratedPasswordIsSavedWithTheLogin() {
        val generation = unlocked()
        startCreating(Kind.LOGIN)
        type(Field.TITLE, "Сгенерированный")
        rule.onNodeWithTag(FORM_GENERATE_TAG).performClick()
        awaitNode(GENERATOR_RUN_TAG)
        rule.onNodeWithTag(GENERATOR_RUN_TAG).performClick()
        // Use takes the candidate once Core has answered; until then the sheet stays.
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            runCatching { rule.onNodeWithTag(GENERATOR_USE_TAG).performClick() }
            rule.onAllNodesWithTag(GENERATOR_USE_TAG).fetchSemanticsNodes().isEmpty()
        }
        save()

        runBlocking {
            val everything = PassmanagerEntryPageRequest(limit = 50, offset = 0, query = "")
            val login = session.credentials.credentialPage(everything, generation).entries.single().id
            val password = session.credentials.readCredentialSecret(login, "password", generation)
            assertEquals(PasswordGeneratorModel.DEFAULT_LENGTH, password.length)
        }
    }

    private fun unlocked(): ULong {
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState { it is AirSessionState.Unlocked }
        return (session.state.value as AirSessionState.Unlocked).generation
    }

    private fun startCreating(kind: Kind) {
        awaitNode(CATALOG_CREATE_TAG)
        rule.onNodeWithTag(CATALOG_CREATE_TAG).performClick()
        awaitNode(createKindTag(kind))
        rule.onNodeWithTag(createKindTag(kind)).performClick()
        awaitNode(formFieldTag(Field.TITLE))
    }

    private fun type(field: Field, text: String) {
        rule.onNodeWithTag(formFieldTag(field)).performTextInput(text)
    }

    private fun save() {
        rule.onNodeWithTag(FORM_SAVE_TAG).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            rule.onAllNodesWithTag(FORM_SAVE_TAG).fetchSemanticsNodes().isEmpty() &&
                rule.onAllNodesWithTag(DETAIL_TITLE_TAG).fetchSemanticsNodes().isNotEmpty()
        }
    }

    /** The text a field shows, separators included. */
    private fun shows(text: String): SemanticsMatcher =
        SemanticsMatcher.expectValue(SemanticsProperties.EditableText, AnnotatedString(text))

    private fun awaitFocus(field: Field) {
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            rule.onAllNodesWithTag(formFieldTag(field)).fetchSemanticsNodes()
                .singleOrNull()?.config?.getOrNull(SemanticsProperties.Focused) == true
        }
    }

    private fun awaitNode(tag: String) {
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { rule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty() }
    }

    private fun awaitState(accept: (AirSessionState) -> Boolean) {
        val deadline = System.nanoTime() + STATE_TIMEOUT_NANOS
        while (!accept(session.state.value)) {
            check(System.nanoTime() < deadline) { "session still ${session.state.value}" }
            Thread.sleep(POLL_MILLIS)
        }
    }

    private companion object {
        const val ADMINISTRATOR = "air-instrumentation-administrator"
        const val VAULT = "air-instrumentation-vault"
        const val NODE_TIMEOUT_MILLIS = 10_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
