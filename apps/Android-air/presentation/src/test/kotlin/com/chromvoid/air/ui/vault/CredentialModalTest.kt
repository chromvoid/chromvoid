package com.chromvoid.air.ui.vault

import androidx.activity.ComponentActivity
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.performScrollToKey
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.credentials.AUDIT_BACK_TAG
import com.chromvoid.air.ui.credentials.CATALOG_SEARCH_TAG
import com.chromvoid.air.ui.credentials.CODES_COLLECTION_BACK_TAG
import com.chromvoid.air.ui.credentials.CODES_MANAGER_DONE_TAG
import com.chromvoid.air.ui.credentials.CredentialFormModel
import com.chromvoid.air.ui.credentials.CredentialFormModel.Field
import com.chromvoid.air.ui.credentials.CredentialFormModel.Kind
import com.chromvoid.air.ui.credentials.DETAIL_BACK_TAG
import com.chromvoid.air.ui.credentials.DETAIL_EDIT_TAG
import com.chromvoid.air.ui.credentials.DETAIL_TITLE_TAG
import com.chromvoid.air.ui.credentials.FORM_CLOSE_TAG
import com.chromvoid.air.ui.credentials.FORM_DISCARD_TAG
import com.chromvoid.air.ui.credentials.FORM_KEEP_TAG
import com.chromvoid.air.ui.credentials.FORM_LIST_TAG
import com.chromvoid.air.ui.credentials.FORM_SAVE_TAG
import com.chromvoid.air.ui.credentials.FORM_TAGS_TAG
import com.chromvoid.air.ui.credentials.FakeCardRules
import com.chromvoid.air.ui.credentials.FakeClipboard
import com.chromvoid.air.ui.credentials.FakeCredentialStore
import com.chromvoid.air.ui.credentials.FakeCredentialStore.Companion.summary
import com.chromvoid.air.ui.credentials.GENERATOR_CLOSE_TAG
import com.chromvoid.air.ui.credentials.PICKER_CLOSE_TAG
import com.chromvoid.air.ui.credentials.TAGS_CLOSE_TAG
import com.chromvoid.air.ui.credentials.TAGS_NEW_TAG
import com.chromvoid.air.ui.credentials.TagsModel
import com.chromvoid.air.ui.credentials.WEBSITES_CLOSE_TAG
import com.chromvoid.air.ui.credentials.catalogRowTag
import com.chromvoid.air.ui.credentials.formFieldTag
import com.chromvoid.air.ui.root.RootScaffold
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** R03: credential tasks cover root navigation and expose only their active pane. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class CredentialModalTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    @Test
    public fun `every credential task covers the tabs and names its pane on a phone`() {
        checkEveryTask()
    }

    @Test
    @Config(qualifiers = "w1280dp-h800dp")
    public fun `every credential task covers the tabs and names its pane on a tablet`() {
        checkEveryTask()
    }

    @Test
    public fun `back from a helper keeps the changed form and back from the form asks to discard`() {
        checkChangedDraft()
    }

    @Test
    @Config(qualifiers = "w1280dp-h800dp")
    public fun `a tablet helper also isolates the changed draft and preserves discard navigation`() {
        checkChangedDraft()
    }

    @Test
    public fun `returning from a helper does not replay an already handled validation focus request`() {
        val vault = show(FakeCredentialStore())
        rule.runOnIdle { vault.beginCreate(Kind.LOGIN) }
        rule.onNodeWithTag(FORM_SAVE_TAG).performClick()
        rule.waitForIdle()
        val draft = checkNotNull(vault.form.value)
        assertTrue("validation issued a focus request", draft.state.value.focusRequest > 0)
        rule.onNodeWithTag(formFieldTag(Field.TITLE)).assertIsFocused()

        rule.onNodeWithTag(FORM_LIST_TAG).performScrollToKey("organize")
        rule.onNodeWithTag(FORM_TAGS_TAG).assertIsDisplayed().performClick()
        assertHelper(R.string.tags_title)
        back()

        assertTask(R.string.form_new_login)
        rule.onNodeWithTag(FORM_TAGS_TAG).assertIsDisplayed()
        rule.onAllNodes(
            hasTestTag(formFieldTag(Field.TITLE)) and
                SemanticsMatcher.expectValue(SemanticsProperties.Focused, true),
            useUnmergedTree = true,
        ).assertCountEquals(0)
    }

    @Test
    public fun `closing a task preserves the selected root and the searched group and record stack`() {
        val store = FakeCredentialStore(listOf(summary("mail", "Mail").copy(groupPath = "/Work")))
        store.groups += "/Work"
        val vault = show(store)
        rule.runOnIdle { vault.openGroup("/Work") }
        rule.onNodeWithTag(CATALOG_SEARCH_TAG).performTextInput("Mail")
        rule.onNodeWithTag(catalogRowTag("mail")).performClick()
        awaitDetail(vault)
        rule.onNodeWithTag(DETAIL_EDIT_TAG).performClick()
        awaitForm(vault)
        assertTask(R.string.form_edit_title)
        rule.onNodeWithTag(FORM_CLOSE_TAG).performClick()
        assertTabs()
        rule.onNodeWithTag(DETAIL_TITLE_TAG).assertTextContains("Mail")

        rule.onNodeWithTag("root-settings").performClick()
        rule.onNodeWithTag("root-settings").assertIsSelected()
        rule.onNodeWithTag("root-vault").performClick()
        rule.onNodeWithTag("root-vault").assertIsSelected()
        rule.onNodeWithTag(DETAIL_TITLE_TAG).assertTextContains("Mail")
        back()
        rule.onNodeWithTag(CATALOG_SEARCH_TAG).assertTextContains("Mail")
        rule.onNodeWithTag(catalogRowTag("mail")).assertIsDisplayed()
        assertEquals("/Work", vault.levels.value.last().path)
        back()
        assertEquals(1, vault.levels.value.size)
        rule.onNodeWithTag(CATALOG_SEARCH_TAG).assertTextEquals("")
        assertTabs()
    }

    @Test
    public fun `saving a new modal returns tabs and back reaches the catalog without another form`() {
        val vault = show(FakeCredentialStore())
        rule.runOnIdle { vault.beginCreate(Kind.LOGIN) }
        assertTask(R.string.form_new_login)
        rule.onNodeWithTag(formFieldTag(Field.TITLE)).performTextInput("Created login")
        rule.onNodeWithTag(FORM_SAVE_TAG).performClick()
        rule.waitUntil(5_000) { vault.form.value == null && vault.detail.value?.state?.value?.detail != null }
        assertTabs()
        rule.onNodeWithTag(DETAIL_TITLE_TAG).assertTextContains("Created login")
        back()
        rule.onNodeWithTag(CATALOG_SEARCH_TAG).assertIsDisplayed()
        assertNull(vault.detail.value)
        assertNull(vault.form.value)
        assertMissing(FORM_SAVE_TAG)
        assertTabs()
    }

    private fun checkEveryTask() {
        val store = FakeCredentialStore(
            listOf(summary("mail", "Mail", "alice"), summary("card", "Card").copy(entryType = "payment_card")),
        )
        store.tags["work"] = "Work" to "blue"
        val vault = show(store)
        assertTabs()

        for ((kind, title) in listOf(Kind.LOGIN to R.string.form_new_login, Kind.CARD to R.string.form_new_card)) {
            rule.runOnIdle { vault.beginCreate(kind) }
            assertTask(title)
            assertMissing(CATALOG_SEARCH_TAG)
            rule.onNodeWithTag(FORM_CLOSE_TAG).performClick()
            assertTabs()
            assertNull(vault.form.value)
        }

        rule.runOnIdle { vault.open("card") }
        awaitDetail(vault)
        rule.onNodeWithTag(DETAIL_EDIT_TAG).performClick()
        awaitForm(vault)
        assertTask(R.string.form_edit_title)
        assertMissing(CATALOG_SEARCH_TAG)
        rule.onNodeWithTag(FORM_CLOSE_TAG).performClick()
        assertTabs()
        rule.onNodeWithTag(DETAIL_BACK_TAG).performClick()

        rule.runOnIdle { vault.open("mail") }
        awaitDetail(vault)
        rule.onNodeWithTag(DETAIL_EDIT_TAG).performClick()
        awaitForm(vault)
        assertTask(R.string.form_edit_title)

        rule.runOnIdle { vault.openTagChoice() }
        rule.waitUntil(5_000) { vault.tags.value?.model?.state?.value?.status == TagsModel.Status.READY }
        assertHelper(R.string.tags_title)
        rule.onNodeWithTag(TAGS_NEW_TAG).performClick()
        assertHelper(R.string.tags_new)
        rule.onNodeWithTag(TAGS_CLOSE_TAG).performClick()
        assertHelper(R.string.tags_title)
        rule.runOnIdle {
            val tags = checkNotNull(vault.tags.value).model
            tags.beginChange(tags.state.value.tags.single())
        }
        assertHelper(R.string.tags_change)
        rule.onNodeWithTag(TAGS_CLOSE_TAG).performClick()
        rule.onNodeWithTag(TAGS_CLOSE_TAG).performClick()
        assertTask(R.string.form_edit_title)

        for ((open, title, close) in listOf(
            Triple(vault::openGenerator, R.string.gen_title, GENERATOR_CLOSE_TAG),
            Triple(vault::chooseGroup, R.string.picker_title, PICKER_CLOSE_TAG),
            Triple(vault::openWebsites, R.string.websites_title, WEBSITES_CLOSE_TAG),
            Triple(vault::openCodesManager, R.string.codes_title, CODES_MANAGER_DONE_TAG),
        )) {
            rule.runOnIdle { open() }
            assertHelper(title)
            rule.onNodeWithTag(close).performClick()
            assertTask(R.string.form_edit_title)
        }
        rule.onNodeWithTag(FORM_CLOSE_TAG).performClick()
        assertTabs()
        rule.onNodeWithTag(DETAIL_BACK_TAG).performClick()

        rule.runOnIdle { vault.openTagFilter() }
        assertHelper(R.string.tags_title)
        rule.onNodeWithTag(TAGS_CLOSE_TAG).performClick()
        assertTabs()

        rule.runOnIdle { vault.openAudit() }
        assertTask(R.string.au_title)
        rule.onNodeWithTag(AUDIT_BACK_TAG).performClick()
        assertTabs()

        rule.runOnIdle { vault.openCodesCollection() }
        assertTask(R.string.vault_codes)
        rule.onNodeWithTag(CODES_COLLECTION_BACK_TAG).performClick()
        assertTabs()
        rule.onNodeWithTag(CATALOG_SEARCH_TAG).assertIsDisplayed()
        assertNull(vault.form.value)
        assertNull(vault.detail.value)
    }

    private fun checkChangedDraft() {
        val vault = show(FakeCredentialStore(listOf(summary("mail", "Mail", "alice"))))
        rule.onNodeWithTag(catalogRowTag("mail")).performClick()
        awaitDetail(vault)
        rule.onNodeWithTag(DETAIL_EDIT_TAG).performClick()
        awaitForm(vault)
        val draft = checkNotNull(vault.form.value)
        rule.onNodeWithTag(formFieldTag(Field.TITLE)).performTextReplacement("Mail at work")
        rule.onNodeWithTag(FORM_LIST_TAG).performScrollToKey("organize")
        rule.onNodeWithTag(FORM_TAGS_TAG).assertIsDisplayed().performClick()
        assertHelper(R.string.tags_title)
        back()
        assertSame(draft, vault.form.value)
        assertTask(R.string.form_edit_title)
        rule.onNodeWithTag(FORM_TAGS_TAG).assertIsDisplayed()
        assertEquals("Mail at work", draft.state.value.value(Field.TITLE))

        back()
        rule.onNodeWithTag(FORM_DISCARD_TAG).assertIsDisplayed()
        rule.onNodeWithTag(FORM_KEEP_TAG).performClick()
        assertTask(R.string.form_edit_title)
        rule.onNodeWithTag(FORM_LIST_TAG).performScrollToIndex(0)
        rule.onNodeWithTag(formFieldTag(Field.TITLE)).assertTextContains("Mail at work")
        back()
        rule.onNodeWithTag(FORM_DISCARD_TAG).performClick()
        assertTabs()
        rule.onNodeWithTag(DETAIL_TITLE_TAG).assertTextContains("Mail")
        assertNull(vault.form.value)
        back()
        rule.onNodeWithTag(CATALOG_SEARCH_TAG).assertIsDisplayed()
        assertNull(vault.detail.value)
        assertTabs()
    }

    private fun show(store: FakeCredentialStore): VaultScope {
        val vault = VaultScope(store, 1uL, FakeClipboard(), searchDelayMillis = 0, cards = FakeCardRules)
        rule.setContent {
            AirTheme { RootScaffold(unlocked = true, vault = { VaultRoot(vault, modifier = it) }) }
        }
        rule.waitForIdle()
        return vault
    }

    private fun awaitDetail(vault: VaultScope) {
        rule.waitUntil(5_000) { vault.detail.value?.state?.value?.detail != null }
    }

    private fun awaitForm(vault: VaultScope) {
        rule.waitUntil(5_000) { vault.form.value?.state?.value?.status == CredentialFormModel.Status.EDITING }
    }

    private fun assertTask(titleRes: Int) {
        rule.waitForIdle()
        for (root in ROOT_TAGS) assertMissing(root)
        rule.onNode(
            SemanticsMatcher.expectValue(SemanticsProperties.PaneTitle, rule.activity.getString(titleRes)),
            useUnmergedTree = true,
        ).assertExists()
    }

    private fun assertHelper(titleRes: Int) {
        assertTask(titleRes)
        // Removing the covered form also removes its accessibility and click actions.
        assertMissing(FORM_SAVE_TAG)
        assertMissing(formFieldTag(Field.TITLE))
        assertMissing(CATALOG_SEARCH_TAG)
    }

    private fun assertTabs() {
        rule.waitForIdle()
        for (root in ROOT_TAGS) rule.onNodeWithTag(root).assertIsDisplayed()
        rule.onNodeWithTag("root-vault").assertIsSelected()
    }

    private fun assertMissing(tag: String) {
        assertEquals(tag, 0, rule.onAllNodesWithTag(tag, useUnmergedTree = true).fetchSemanticsNodes().size)
    }

    private fun back() {
        rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }
        rule.waitForIdle()
    }
}

private val ROOT_TAGS = listOf("root-vault", "root-files", "root-connections", "root-settings")
