package com.chromvoid.air

import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateSecrets
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.credentials.CATALOG_CREATE_TAG
import com.chromvoid.air.ui.credentials.CredentialFormModel
import com.chromvoid.air.ui.credentials.DETAIL_BACK_TAG
import com.chromvoid.air.ui.credentials.DETAIL_EDIT_TAG
import com.chromvoid.air.ui.credentials.DETAIL_TITLE_TAG
import com.chromvoid.air.ui.credentials.FORM_CLOSE_TAG
import com.chromvoid.air.ui.credentials.FORM_LIST_TAG
import com.chromvoid.air.ui.credentials.FORM_SAVE_TAG
import com.chromvoid.air.ui.credentials.FORM_WEBSITES_TAG
import com.chromvoid.air.ui.credentials.WEBSITES_ADD_TAG
import com.chromvoid.air.ui.credentials.WEBSITES_SAVE_TAG
import com.chromvoid.air.ui.credentials.catalogRowTag
import com.chromvoid.air.ui.credentials.createKindTag
import com.chromvoid.air.ui.credentials.formFieldTag
import com.chromvoid.air.ui.credentials.websiteErrorTag
import com.chromvoid.air.ui.credentials.websiteValueTag
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Websites against real Core: a saved login's rules are edited from its page
 * (an invalid one is pointed at, then fixed), and a new login is created with
 * the websites Core validated in the form.
 */
@RunWith(AndroidJUnit4::class)
public class WebsitesRouteInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun websitesAreEditedOnARecordAndGivenToANewOne() {
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState { it is AirSessionState.Unlocked }
        val generation = (session.state.value as AirSessionState.Unlocked).generation
        val id = runBlocking {
            session.credentials.createCredential(
                PassmanagerEntryCreateRequest(
                    entryID = UUID.randomUUID().toString(),
                    entryType = "login",
                    secrets = PassmanagerEntryCreateSecrets(password = "synthetic"),
                    title = "Почта",
                ),
                generation,
            ).entryID
        }
        awaitNode(catalogRowTag(id))
        rule.onNodeWithTag(catalogRowTag(id)).performClick()
        awaitNode(DETAIL_EDIT_TAG)
        rule.onNodeWithTag(DETAIL_EDIT_TAG).performClick()
        awaitNode(FORM_WEBSITES_TAG)
        rule.onNodeWithTag(FORM_LIST_TAG).performScrollToNode(hasTestTag(FORM_WEBSITES_TAG))
        rule.onNodeWithTag(FORM_WEBSITES_TAG).performClick()
        awaitNode(WEBSITES_ADD_TAG)
        rule.onNodeWithTag(WEBSITES_ADD_TAG).performClick()
        awaitNode(websiteValueTag(0))
        rule.onNodeWithTag(websiteValueTag(0)).performTextInput("alice@example.com")
        rule.onNodeWithTag(WEBSITES_SAVE_TAG).performClick()
        awaitNode(websiteErrorTag(0))
        rule.onNodeWithTag(websiteValueTag(0)).performTextReplacement("mail.example.com")
        rule.onNodeWithTag(WEBSITES_SAVE_TAG).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { count(WEBSITES_SAVE_TAG) == 0 }
        val stored = runBlocking { session.credentials.websiteRules(id, generation).rules }
        assertEquals(listOf("https://mail.example.com"), stored.map { it.value })
        rule.onNodeWithTag(FORM_CLOSE_TAG).performClick()
        awaitNode(DETAIL_BACK_TAG)
        rule.onNodeWithTag(DETAIL_BACK_TAG).performClick()

        awaitNode(CATALOG_CREATE_TAG)
        rule.onNodeWithTag(CATALOG_CREATE_TAG).performClick()
        awaitNode(createKindTag(CredentialFormModel.Kind.LOGIN))
        rule.onNodeWithTag(createKindTag(CredentialFormModel.Kind.LOGIN)).performClick()
        awaitNode(formFieldTag(CredentialFormModel.Field.TITLE))
        rule.onNodeWithTag(formFieldTag(CredentialFormModel.Field.TITLE)).performTextInput("Git")
        rule.hideKeyboard()
        rule.onNodeWithTag(FORM_LIST_TAG).performScrollToNode(hasTestTag(FORM_WEBSITES_TAG))
        rule.onNodeWithTag(FORM_WEBSITES_TAG).performClick()
        awaitNode(WEBSITES_ADD_TAG)
        rule.onNodeWithTag(WEBSITES_ADD_TAG).performClick()
        awaitNode(websiteValueTag(0))
        rule.onNodeWithTag(websiteValueTag(0)).performTextInput("github.com")
        rule.onNodeWithTag(WEBSITES_SAVE_TAG).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { count(WEBSITES_SAVE_TAG) == 0 }
        rule.onNodeWithTag(FORM_SAVE_TAG).performClick()
        awaitNode(DETAIL_TITLE_TAG)
        val created = runBlocking {
            val entries = session.credentials.credentialPage(
                com.chromvoid.air.bridge.wire.PassmanagerEntryPageRequest(limit = 50L, offset = 0L, query = "Git"),
                generation,
            ).entries
            session.credentials.websiteRules(entries.single { it.title == "Git" }.id, generation).rules
        }
        assertEquals(listOf("https://github.com"), created.map { it.value })
    }

    private fun count(tag: String): Int = rule.onAllNodesWithTag(tag, useUnmergedTree = true).fetchSemanticsNodes().size

    private fun awaitNode(tag: String) {
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { count(tag) > 0 }
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
        const val NODE_TIMEOUT_MILLIS = 20_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
