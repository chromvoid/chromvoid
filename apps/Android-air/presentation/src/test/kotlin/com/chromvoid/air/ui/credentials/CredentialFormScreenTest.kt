package com.chromvoid.air.ui.credentials

import androidx.activity.ComponentActivity
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasScrollToIndexAction
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.presentation.R
import com.chromvoid.air.bridge.wire.PaymentCardMetadata
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.credentials.CredentialFormModel.Field
import com.chromvoid.air.ui.credentials.CredentialFormModel.Kind
import com.chromvoid.air.ui.credentials.CredentialFormModel.Status
import com.chromvoid.air.ui.credentials.FakeCredentialStore.Companion.detailOf
import com.chromvoid.air.ui.credentials.FakeCredentialStore.Companion.summary
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.junit.Assert.assertTrue
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w360dp-h420dp")
public class CredentialFormScreenTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    private val store = FakeCredentialStore()

    private fun show(kind: Kind, values: Map<Field, String> = emptyMap()): CredentialFormModel {
        val model = CredentialFormModel.create(
            kind,
            store,
            generation = 1uL,
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
            prefill = values,
            cards = FakeCardRules,
        ) {}
        rule.setContent { AirTheme { CredentialFormScreen(model, onDismiss = {}, onDiscard = {}) } }
        rule.waitForIdle()
        return model
    }

    @Test
    public fun `a refused save brings the missing name into view instead of seeming to do nothing`() {
        show(Kind.LOGIN)
        rule.onNode(hasScrollToIndexAction()).performScrollToIndex(4)
        rule.waitForIdle()
        assertTrue(
            "the name has scrolled out of the list",
            rule.onAllNodesWithTag(formFieldTag(Field.TITLE)).fetchSemanticsNodes().isEmpty(),
        )

        rule.onNodeWithTag(FORM_SAVE_TAG).performClick()
        rule.waitUntil(5_000) {
            rule.onAllNodesWithTag(formFieldTag(Field.TITLE)).fetchSemanticsNodes().isNotEmpty()
        }

        rule.onNodeWithTag(formFieldTag(Field.TITLE)).assertIsDisplayed().assertIsFocused()
            .assertContentDescriptionEquals(rule.activity.getString(R.string.form_name))
            .assert(SemanticsMatcher.expectValue(
                SemanticsProperties.Error,
                rule.activity.getString(R.string.form_error_required),
            ))
        rule.onNodeWithTag(formErrorTag(Field.TITLE)).assertIsDisplayed()
        assertTrue(store.creates.isEmpty())

        rule.onNodeWithTag(formFieldTag(Field.TITLE)).performTextInput("Mail")
        rule.onNodeWithTag(formFieldTag(Field.TITLE))
            .assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Error))
        rule.onNodeWithText(rule.activity.getString(R.string.form_name)).assertIsDisplayed()
    }

    @Test
    public fun `a card's empty name shows the one Core will give it`() {
        val model = show(Kind.CARD)
        rule.onNodeWithTag(formPlaceholderTag(Field.TITLE)).assertTextEquals("Optional")

        model.change(Field.CARD_NUMBER, "4111111111111111")
        rule.waitForIdle()

        rule.onNodeWithTag(formPlaceholderTag(Field.TITLE)).assertTextEquals("Visa •••• 1111")
    }

    @Test
    @Config(qualifiers = "w393dp-h900dp")
    public fun `empty login fields keep one caption without repeating it as a hint`() {
        show(Kind.LOGIN)

        listOf(
            Field.TITLE to R.string.form_name,
            Field.USERNAME to R.string.form_username,
            Field.PASSWORD to R.string.form_password,
            Field.NOTE to R.string.form_note,
        ).forEach { (field, label) ->
            val caption = rule.activity.getString(label)
            rule.onNodeWithText(caption).assertIsDisplayed()
            rule.onNodeWithTag(formPlaceholderTag(field)).assertDoesNotExist()
            rule.onNodeWithTag(formFieldTag(field)).assertContentDescriptionEquals(caption)
        }
    }

    @Test
    @Config(qualifiers = "w393dp-h900dp")
    public fun `an empty card note keeps its caption without a duplicate hint`() {
        show(Kind.CARD)

        val caption = rule.activity.getString(R.string.form_note)
        rule.onNodeWithText(caption).assertIsDisplayed()
        rule.onNodeWithTag(formPlaceholderTag(Field.NOTE)).assertDoesNotExist()
        rule.onNodeWithTag(formFieldTag(Field.NOTE)).assertContentDescriptionEquals(caption)
    }

    @Test
    @Config(qualifiers = "w393dp-h900dp")
    public fun `populated login fields keep their labels and name the editable node`() {
        show(
            Kind.LOGIN,
            mapOf(Field.TITLE to "Mail", Field.USERNAME to "alice", Field.PASSWORD to "secret", Field.NOTE to "Note"),
        )

        listOf(
            Field.TITLE to R.string.form_name,
            Field.USERNAME to R.string.form_username,
            Field.PASSWORD to R.string.form_password,
            Field.NOTE to R.string.form_note,
        ).forEach { (field, label) ->
            val caption = rule.activity.getString(label)
            rule.onNodeWithTag(formFieldTag(field)).assert(hasSetTextAction()).assertContentDescriptionEquals(caption)
            rule.onNodeWithText(caption).assertIsDisplayed()
        }
    }

    @Test
    @Config(qualifiers = "w393dp-h900dp")
    public fun `populated card fields keep a visible name for every editable value`() {
        show(
            Kind.CARD,
            mapOf(
                Field.TITLE to "Visa",
                Field.CARD_NUMBER to "4111111111111111",
                Field.CARDHOLDER to "ALICE",
                Field.CARD_CODE to "123",
                Field.MONTH to "12",
                Field.YEAR to "31",
                Field.NOTE to "Note",
            ),
        )

        listOf(
            Field.CARD_NUMBER to R.string.form_card_number,
            Field.CARDHOLDER to R.string.form_cardholder,
            Field.CARD_CODE to R.string.form_card_code,
            Field.MONTH to R.string.form_month,
            Field.YEAR to R.string.form_year,
        ).forEach { (field, label) ->
            val caption = rule.activity.getString(label)
            rule.onNodeWithTag(formFieldTag(field)).assert(hasSetTextAction()).assertContentDescriptionEquals(caption)
            val visibleCaption = if (field == Field.CARD_CODE) {
                rule.activity.getString(R.string.card_face_cvv)
            } else {
                caption
            }
            rule.onNodeWithText(visibleCaption.uppercase()).assertIsDisplayed()
        }
    }

    @Test
    @Config(qualifiers = "w393dp-h900dp")
    public fun `a card save reports errors on editable nodes and focuses the first visible field`() {
        show(Kind.CARD)

        rule.onNodeWithTag(FORM_SAVE_TAG).performClick()

        rule.onNodeWithTag(formFieldTag(Field.CARD_NUMBER)).assertIsFocused()
        listOf(Field.CARD_NUMBER, Field.CARDHOLDER, Field.MONTH, Field.YEAR).forEach { field ->
            rule.onNodeWithTag(formFieldTag(field)).assert(SemanticsMatcher.expectValue(
                SemanticsProperties.Error,
                rule.activity.getString(R.string.form_error_required),
            ))
        }
    }

    private fun showEditingCard(): CredentialFormModel {
        val entry = summary("card", "Visa").copy(entryType = Kind.CARD.wire)
        store.entries += entry
        store.secrets["card" to CredentialDetailModel.CARD_NUMBER] = "4111111111111111"
        store.secrets["card" to CredentialDetailModel.CARD_CODE] = "123"
        val detail = detailOf(entry).copy(
            paymentCard = PaymentCardMetadata(brand = "visa", cardholderName = "ALICE", expMonth = 12, expYear = 2031),
        )
        val model = checkNotNull(CredentialFormModel.edit(
            detail,
            store,
            generation = 1uL,
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
            cards = FakeCardRules,
        ) {})
        rule.setContent { AirTheme { CredentialFormScreen(model, onDismiss = {}, onDiscard = {}) } }
        rule.waitUntil(5_000) { model.state.value.status == Status.EDITING }
        return model
    }

    private fun assertRefusedCardField(field: Field, value: String, error: Int) {
        val model = showEditingCard()
        rule.runOnIdle {
            model.change(field, value)
            store.failSecretWritesWith = "INVALID_INPUT"
        }
        rule.onNodeWithTag(formFieldTag(Field.TITLE)).performClick()

        rule.onNodeWithTag(FORM_SAVE_TAG).performClick()
        rule.waitForIdle()

        rule.waitUntil(5_000) { model.state.value.status == Status.EDITING && model.state.value.errors[field] != null }
        rule.onNodeWithTag(formFieldTag(field)).assertIsFocused().assert(SemanticsMatcher.expectValue(
            SemanticsProperties.Error,
            rule.activity.getString(error),
        ))
        rule.onNodeWithTag(formErrorTag(field)).assertIsDisplayed()
        assertTrue("a refused field was not written", store.secretWrites.isEmpty())
    }

    @Test
    @Config(qualifiers = "w393dp-h900dp")
    public fun `a card number refused by Core reports the error on and focuses its editor`() {
        assertRefusedCardField(Field.CARD_NUMBER, "4111111111111112", R.string.form_issue_invalid_card_number)
    }

    @Test
    @Config(qualifiers = "w393dp-h900dp")
    public fun `a security code refused by Core reports the error on and focuses its editor`() {
        assertRefusedCardField(Field.CARD_CODE, "456", R.string.form_issue_invalid_card_code)
    }

    private fun assertRefusedGroup(code: String) {
        val model = show(Kind.LOGIN, mapOf(Field.TITLE to "Mail", Field.PASSWORD to "hunter2"))
        rule.runOnIdle {
            model.setGroup("/Work/..")
            store.failWith = CoreRefusal(code, "passmanager:entry:create")
        }
        rule.onNodeWithTag(formFieldTag(Field.TITLE)).performClick()

        rule.onNodeWithTag(FORM_SAVE_TAG).performClick()
        rule.waitUntil(5_000) { model.state.value.errors[Field.GROUP] != null }
        rule.waitForIdle()

        rule.onNodeWithTag(formFieldTag(Field.GROUP)).assertIsDisplayed().assertIsFocused()
            .assertContentDescriptionEquals(rule.activity.getString(R.string.form_group_path))
            .assert(SemanticsMatcher.expectValue(
                SemanticsProperties.Error,
                rule.activity.getString(R.string.form_group_invalid),
            ))
        rule.onNodeWithTag(formErrorTag(Field.GROUP)).assertIsDisplayed()
        assertEquals("Mail", model.state.value.value(Field.TITLE))
        assertEquals("hunter2", model.state.value.value(Field.PASSWORD))
        assertTrue(store.groups.isEmpty())

        rule.onNodeWithTag(formFieldTag(Field.GROUP)).performTextReplacement("/Work/Travel")
        rule.onNodeWithTag(formFieldTag(Field.GROUP))
            .assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Error))
        rule.onNodeWithTag(formErrorTag(Field.GROUP)).assertDoesNotExist()
        rule.runOnIdle { store.failWith = null }
        rule.onNodeWithTag(FORM_SAVE_TAG).performClick()
        rule.waitUntil(5_000) { model.state.value.status == Status.SAVED }

        assertEquals("/Work/Travel", store.entries.single().groupPath)
        assertTrue(store.ensuredGroups.isEmpty())
    }

    @Test
    @Config(qualifiers = "w393dp-h900dp")
    public fun `Core invalid path is announced on the group input with focus and allows correction`() {
        assertRefusedGroup("INVALID_PATH")
    }

    @Test
    @Config(qualifiers = "w393dp-h900dp")
    public fun `Core empty group payload is announced on the group input with focus and allows correction`() {
        assertRefusedGroup("EMPTY_PAYLOAD")
    }
}
