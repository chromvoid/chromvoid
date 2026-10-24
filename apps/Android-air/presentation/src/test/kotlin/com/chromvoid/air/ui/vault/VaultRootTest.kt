package com.chromvoid.air.ui.vault

import androidx.activity.ComponentActivity
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.performTextInput
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.credentials.CATALOG_CLEAR_SEARCH_TAG
import com.chromvoid.air.ui.credentials.CATALOG_LIST_TAG
import com.chromvoid.air.ui.credentials.groupingTag
import com.chromvoid.air.ui.credentials.CatalogOptions
import com.chromvoid.air.ui.credentials.CATALOG_OPTIONS_TAG
import com.chromvoid.air.ui.credentials.formFieldTag
import com.chromvoid.air.ui.credentials.createKindTag
import com.chromvoid.air.ui.credentials.FORM_SAVE_TAG
import com.chromvoid.air.ui.credentials.FORM_KEEP_TAG
import com.chromvoid.air.ui.credentials.FORM_DISCARD_TAG
import com.chromvoid.air.ui.credentials.DETAIL_EDIT_TAG
import com.chromvoid.air.ui.credentials.CODES_MANAGER_DONE_TAG
import com.chromvoid.air.ui.credentials.FORM_CLOSE_TAG
import com.chromvoid.air.ui.credentials.FORM_CODES_TAG
import com.chromvoid.air.ui.credentials.codeValueTag
import com.chromvoid.air.ui.credentials.CredentialFormModel
import com.chromvoid.air.ui.credentials.CATALOG_CREATE_TAG
import com.chromvoid.air.ui.credentials.CATALOG_EMPTY_TAG
import com.chromvoid.air.ui.credentials.CATALOG_FAILED_TAG
import com.chromvoid.air.ui.credentials.CATALOG_NO_MATCH_TAG
import com.chromvoid.air.ui.credentials.CATALOG_SEARCH_TAG
import com.chromvoid.air.ui.credentials.DETAIL_BACK_TAG
import com.chromvoid.air.ui.credentials.DETAIL_TITLE_TAG
import com.chromvoid.air.ui.credentials.DETAIL_USERNAME_TAG
import com.chromvoid.air.ui.credentials.FakeClipboard
import com.chromvoid.air.ui.credentials.FakeCredentialStore
import com.chromvoid.air.ui.credentials.FakeCredentialStore.Companion.many
import com.chromvoid.air.ui.credentials.FakeCredentialStore.Companion.summary
import com.chromvoid.air.ui.credentials.catalogRowTag
import com.chromvoid.air.ui.credentials.secretRevealTag
import com.chromvoid.air.ui.credentials.secretValueTag
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Route A05: search → record → back returns to the same filtered, scrolled list. */
@RunWith(RobolectricTestRunner::class)
// A current phone: the rows sit under the search field and the collection tiles.
@Config(qualifiers = "w411dp-h891dp")
public class VaultRootTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    private fun show(store: FakeCredentialStore): VaultScope {
        val vault = VaultScope(store, generation = 1uL, clipboard = FakeClipboard(), searchDelayMillis = 0)
        rule.setContent { AirTheme { VaultRoot(vault) } }
        rule.waitForIdle()
        return vault
    }

    private fun rows(id: String): Int = rule.onAllNodesWithTag(catalogRowTag(id)).fetchSemanticsNodes().size

    @Test
    public fun `back from a searched record returns to the same search`() {
        show(
            FakeCredentialStore(
                listOf(
                    summary("mail", "Mail", "alice"),
                    summary("git", "GitHub", "octo", "github.com"),
                    summary("bank", "Bank", "alice"),
                ),
            ),
        )

        rule.onNodeWithTag(CATALOG_SEARCH_TAG).performTextInput("git")
        rule.waitForIdle()
        assertEquals(0, rows("mail"))
        rule.onNodeWithTag(catalogRowTag("git")).performClick()
        rule.waitForIdle()

        rule.onNodeWithTag(DETAIL_TITLE_TAG).assertTextContains("GitHub")
        rule.onNodeWithTag(DETAIL_USERNAME_TAG).assertIsDisplayed()

        rule.onNodeWithTag(DETAIL_BACK_TAG).performClick()
        rule.waitForIdle()

        rule.onNodeWithTag(CATALOG_SEARCH_TAG).assertTextContains("git")
        rule.onNodeWithTag(catalogRowTag("git")).assertIsDisplayed()
        assertEquals(0, rows("mail"))
    }

    @Test
    public fun `system back closes the record and keeps the scroll position`() {
        show(FakeCredentialStore(many(40)))

        rule.onNodeWithTag(CATALOG_LIST_TAG).performScrollToIndex(30)
        rule.onNodeWithTag(catalogRowTag("id-31")).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(DETAIL_TITLE_TAG).assertTextContains("Record 31")

        rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }
        rule.waitForIdle()

        rule.onNodeWithTag(catalogRowTag("id-31")).assertIsDisplayed()
        assertEquals("the list did not jump back to the top", 0, rows("id-1"))
    }

    @Test
    public fun `a search that matches nothing offers to clear it`() {
        show(FakeCredentialStore(listOf(summary("mail", "Mail"))))

        rule.onNodeWithTag(CATALOG_SEARCH_TAG).performTextInput("zzz")
        rule.waitForIdle()
        rule.onNodeWithTag(CATALOG_NO_MATCH_TAG).assertIsDisplayed()

        rule.onNodeWithTag(CATALOG_CLEAR_SEARCH_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(catalogRowTag("mail")).assertIsDisplayed()
    }

    @Test
    public fun `a revealed password does not survive leaving the record`() {
        val store = FakeCredentialStore(listOf(summary("mail", "Mail", "alice")))
        store.secrets["mail" to "password"] = "hunter2"
        show(store)

        rule.onNodeWithTag(catalogRowTag("mail")).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(secretRevealTag("password")).performClick()
        rule.waitForIdle()
        passwordValue().assertTextEquals("hunter2")

        rule.onNodeWithTag(DETAIL_BACK_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(catalogRowTag("mail")).performClick()
        rule.waitForIdle()

        passwordValue().assertTextEquals("••••••••")
    }

    @Test
    public fun `a new login opens as a record and back leads to the list, not the form`() {
        show(FakeCredentialStore())

        rule.onNodeWithTag(CATALOG_CREATE_TAG).performClick()
        rule.onNodeWithTag(createKindTag(CredentialFormModel.Kind.LOGIN)).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(formFieldTag(CredentialFormModel.Field.TITLE)).performTextInput("Mail")
        rule.onNodeWithTag(FORM_SAVE_TAG).performClick()
        rule.waitForIdle()

        rule.onNodeWithTag(DETAIL_TITLE_TAG).assertTextContains("Mail")
        rule.onNodeWithTag(DETAIL_BACK_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(CATALOG_SEARCH_TAG).assertIsDisplayed()
        assertEquals(0, rule.onAllNodesWithTag(FORM_SAVE_TAG).fetchSemanticsNodes().size)
    }

    @Test
    public fun `back from a changed edit asks, and keeping it keeps the draft`() {
        show(FakeCredentialStore(listOf(summary("mail", "Mail", "alice"))))
        rule.onNodeWithTag(catalogRowTag("mail")).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(DETAIL_EDIT_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(formFieldTag(CredentialFormModel.Field.TITLE)).performTextInput(" at work")

        rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }
        rule.waitForIdle()
        rule.onNodeWithTag(FORM_KEEP_TAG).performClick()
        rule.waitForIdle()

        rule.onNodeWithTag(formFieldTag(CredentialFormModel.Field.TITLE))
            .assertTextContains(" at work", substring = true)

        rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }
        rule.waitForIdle()
        rule.onNodeWithTag(FORM_DISCARD_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(DETAIL_TITLE_TAG).assertTextContains("Mail")
    }

    @Test
    public fun `choosing a grouping in the sort menu applies it`() {
        val vault = show(FakeCredentialStore(listOf(summary("mail", "Mail"))))

        rule.onNodeWithTag(CATALOG_OPTIONS_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(groupingTag(CatalogOptions.Grouping.WEBSITE)).performScrollTo().performClick()
        rule.waitForIdle()

        assertEquals(CatalogOptions.Grouping.WEBSITE, vault.catalog.state.value.options.grouping)
    }

    private fun passwordValue() = rule.onNodeWithTag(secretValueTag("password"), useUnmergedTree = true)

    @Test
    @Config(qualifiers = "w1280dp-h800dp")
    public fun `the open tablet record is marked by ID even when two records have the same title`() {
        val vault = show(
            FakeCredentialStore(listOf(summary("first", "Mail", "alice"), summary("second", "Mail", "bob"))),
        )
        rule.onNodeWithTag(VAULT_PANE_EMPTY_TAG).assertIsDisplayed()

        rule.onNodeWithTag(catalogRowTag("second")).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(DETAIL_TITLE_TAG).assertTextContains("Mail")
        rule.onNodeWithTag(DETAIL_USERNAME_TAG).assertTextContains("bob")
        rule.onNodeWithTag(catalogRowTag("second")).assertIsSelected()
        rule.onNodeWithTag(catalogRowTag("first")).assertIsNotSelected()
        assertNull(vault.catalog.state.value.selection)

        rule.onNodeWithTag(catalogRowTag("first")).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(DETAIL_USERNAME_TAG).assertTextContains("alice")
        rule.onNodeWithTag(catalogRowTag("first")).assertIsSelected()
        rule.onNodeWithTag(catalogRowTag("second")).assertIsNotSelected()

        rule.onNodeWithTag(DETAIL_EDIT_TAG).performClick()
        rule.waitForIdle()
        assertEquals("the form covers the catalog", 0, rows("first"))
        rule.onNodeWithTag(FORM_CLOSE_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(catalogRowTag("first")).assertIsSelected()
        rule.onNodeWithTag(catalogRowTag("second")).assertIsNotSelected()

        rule.onNodeWithTag(DETAIL_BACK_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(VAULT_PANE_EMPTY_TAG).assertIsDisplayed()
        for (id in listOf("first", "second")) {
            rule.onNodeWithTag(catalogRowTag(id)).assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Selected))
        }
    }

    @Test
    @Config(qualifiers = "w1280dp-h800dp")
    public fun `tablet bulk selection is independent from the open record`() {
        val vault = show(
            FakeCredentialStore(listOf(summary("first", "Mail", "alice"), summary("second", "Mail", "bob"))),
        )
        rule.onNodeWithTag(catalogRowTag("second")).performClick()
        rule.waitForIdle()

        rule.runOnIdle { vault.catalog.beginSelection("first") }
        rule.waitForIdle()
        rule.onNodeWithTag(catalogRowTag("first")).assertIsSelected()
        rule.onNodeWithTag(catalogRowTag("second")).assertIsNotSelected()
        rule.onNodeWithTag(DETAIL_USERNAME_TAG).assertTextContains("bob")
        assertEquals(setOf("first"), vault.catalog.state.value.selection)

        rule.onNodeWithTag(catalogRowTag("second")).performClick()
        rule.waitForIdle()
        assertEquals(setOf("first", "second"), vault.catalog.state.value.selection)
        rule.onNodeWithTag(catalogRowTag("first")).assertIsSelected()
        rule.onNodeWithTag(catalogRowTag("second")).assertIsSelected()
        rule.onNodeWithTag(DETAIL_USERNAME_TAG).assertTextContains("bob")

        rule.runOnIdle { vault.catalog.endSelection() }
        rule.waitForIdle()
        assertNull(vault.catalog.state.value.selection)
        rule.onNodeWithTag(catalogRowTag("first")).assertIsNotSelected()
        rule.onNodeWithTag(catalogRowTag("second")).assertIsSelected()
        rule.onNodeWithTag(DETAIL_USERNAME_TAG).assertTextContains("bob")
    }

    @Test
    public fun `on a phone the record replaces the catalog`() {
        val vault = show(
            FakeCredentialStore(listOf(summary("mail", "Mail", "alice"), summary("bank", "Bank", "alice"))),
        )
        for (id in listOf("mail", "bank")) {
            rule.onNodeWithTag(catalogRowTag(id)).assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Selected))
        }

        rule.onNodeWithTag(catalogRowTag("mail")).performClick()
        rule.waitForIdle()

        assertEquals(0, rows("bank"))
        assertEquals(0, rule.onAllNodesWithTag(VAULT_PANE_TAG).fetchSemanticsNodes().size)

        rule.onNodeWithTag(DETAIL_BACK_TAG).performClick()
        rule.waitForIdle()
        for (id in listOf("mail", "bank")) {
            rule.onNodeWithTag(catalogRowTag(id)).assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Selected))
        }
        rule.runOnIdle { vault.catalog.beginSelection("bank") }
        rule.waitForIdle()
        assertEquals(setOf("bank"), vault.catalog.state.value.selection)
        for (id in listOf("mail", "bank")) {
            rule.onNodeWithTag(catalogRowTag(id)).assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Selected))
        }
    }

    @Test
    public fun `an empty vault says so instead of looking like a failed read`() {
        show(FakeCredentialStore(emptyList()))

        rule.onNodeWithTag(CATALOG_EMPTY_TAG).assertIsDisplayed()
        assertEquals(0, rule.onAllNodesWithTag(CATALOG_FAILED_TAG).fetchSemanticsNodes().size)
    }

    @Test
    public fun `a code added in Edit shows on the page after Cancel`() {
        val store = FakeCredentialStore(listOf(summary("mail", "Mail", "alice")))
        val vault = show(store)
        rule.onNodeWithTag(catalogRowTag("mail")).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(DETAIL_EDIT_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(FORM_CODES_TAG).performScrollTo().performClick()
        rule.waitForIdle()
        // The draft is filled through its model: Robolectric runs out of memory on the draft dialog.
        val manager = checkNotNull(vault.codesManager.value)
        rule.runOnIdle {
            manager.beginAdd()
            manager.changeDraft { it.copy(label = "Main", secret = "JBSWY3DPEHPK3PXP") }
            manager.saveDraft()
        }
        rule.waitUntil(5_000) { store.otps["mail"].orEmpty().isNotEmpty() }
        rule.onNodeWithTag(CODES_MANAGER_DONE_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(FORM_CLOSE_TAG).performClick()
        rule.waitForIdle()

        rule.onNodeWithTag(codeValueTag("Main")).assertIsDisplayed()
    }

}
