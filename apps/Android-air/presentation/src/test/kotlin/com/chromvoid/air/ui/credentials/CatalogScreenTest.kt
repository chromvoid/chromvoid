package com.chromvoid.air.ui.credentials

import androidx.activity.ComponentActivity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToKey
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.performSemanticsAction
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.credentials.FakeCredentialStore.Companion.summary
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Group navigation and discoverable actions remain separate accessible controls. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w411dp-h891dp")
public class CatalogScreenTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val store = FakeCredentialStore().apply { groups += "/Personal" }
    private var opened: String? = null

    @After
    public fun close() {
        scope.cancel()
    }

    private fun show(
        catalog: CatalogModel = CatalogModel(store, 1uL, scope, FakeClipboard(), searchDelayMillis = 0),
    ): GroupsModel {
        val groups = GroupsModel("/", store, 1uL, scope)
        rule.setContent {
            AirTheme {
                CatalogScreen(catalog, groups, onOpen = {}, onOpenGroup = { opened = it }, onCreate = {})
            }
        }
        rule.waitForIdle()
        return groups
    }

    @Test
    public fun `an ordinary group tap opens it without opening its actions`() {
        show()

        rule.onNodeWithTag(groupRowTag("/Personal")).performClick()

        assertEquals("/Personal", opened)
        rule.onNodeWithTag("group-rename-/Personal").assertDoesNotExist()
        rule.onNodeWithTag("group-delete-/Personal").assertDoesNotExist()
    }

    @Test
    public fun `the named overflow button opens rename without navigating`() {
        val groups = show()
        val actions = rule.activity.getString(R.string.group_actions)

        rule.onNodeWithTag(groupMenuTag("/Personal"))
            .assertIsDisplayed()
            .assertContentDescriptionEquals(actions)
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
            .assertHasClickAction()
            .performClick()

        assertNull(opened)
        // The navigation chevron is decorative; only the overflow announces actions.
        rule.onAllNodesWithContentDescription(actions).assertCountEquals(1)
        rule.onNodeWithTag("group-rename-/Personal").assertIsDisplayed().performClick()
        rule.onNodeWithTag(GROUP_NAME_TAG).assertIsDisplayed()
        assertEquals(GroupsModel.Edit.Rename("/Personal"), groups.state.value.edit)
        assertTrue("/Personal" in store.groups)

        rule.onNodeWithTag(GROUP_NAME_TAG)
            .assertContentDescriptionEquals(rule.activity.getString(R.string.group_name))
            .performTextReplacement("Private")
        rule.onNodeWithTag(GROUP_SAVE_TAG).performClick()
        rule.waitForIdle()

        assertEquals(setOf("/Private"), store.groups)
        assertNull(groups.state.value.edit)
        rule.onNodeWithTag(groupRowTag("/Private")).assertIsDisplayed()
    }

    @Test
    public fun `delete from overflow asks for confirmation before changing the group`() {
        val groups = show()

        rule.onNodeWithTag(groupMenuTag("/Personal")).performClick()
        rule.onNodeWithTag("group-delete-/Personal").assertIsDisplayed().performClick()

        assertNull(opened)
        assertEquals("/Personal", groups.state.value.deleting)
        assertTrue("/Personal" in store.groups)
        rule.onNodeWithTag(GROUP_DELETE_CONFIRM_TAG).assertIsDisplayed().performClick()
        rule.waitForIdle()
        assertTrue(store.groups.isEmpty())
    }

    @Test
    public fun `the labeled long press still opens the same group actions`() {
        show()
        val row = rule.onNodeWithTag(groupRowTag("/Personal"))
        assertEquals(
            rule.activity.getString(R.string.group_actions),
            row.fetchSemanticsNode().config[SemanticsActions.OnLongClick].label,
        )

        row.performSemanticsAction(SemanticsActions.OnLongClick) { it() }

        assertNull(opened)
        rule.onNodeWithTag("group-rename-/Personal").assertIsDisplayed()
        rule.onNodeWithTag("group-delete-/Personal").assertIsDisplayed()
    }

    @Test
    public fun `direct records precede the named nested section regardless of page order`() {
        store.entries += listOf(
            summary("nested", "Nested record").copy(groupPath = "/Personal"),
            summary("direct", "Direct record"),
        )
        show()

        val list = rule.onNodeWithTag(CATALOG_LIST_TAG)
        val indexForKey = list.fetchSemanticsNode().config[SemanticsProperties.IndexForKey]
        val headerIndex = indexForKey(CATALOG_NESTED_SECTION_TAG)
        assertTrue(indexForKey("direct") in 0 until headerIndex)
        assertTrue(indexForKey("nested") > headerIndex)
        list.performScrollToKey(CATALOG_NESTED_SECTION_TAG)
        rule.onNodeWithTag(CATALOG_NESTED_SECTION_TAG).assertIsDisplayed()
        rule.onNodeWithText("In nested groups").assertIsDisplayed()
    }

    @Test
    public fun `direct records do not show an empty nested section`() {
        store.entries += summary("direct", "Direct record")
        show()

        rule.onNodeWithTag(catalogRowTag("direct")).assertIsDisplayed()
        rule.onNodeWithTag(CATALOG_NESTED_SECTION_TAG).assertDoesNotExist()
        rule.onNodeWithText("In nested groups").assertDoesNotExist()
    }

    @Test
    public fun `a root containing only nested records shows their section without the empty vault state`() {
        store.entries += summary("nested", "Nested record").copy(groupPath = "/Personal")
        show()

        rule.onNodeWithTag(CATALOG_NESTED_SECTION_TAG).assertIsDisplayed()
        rule.onNodeWithTag(catalogRowTag("nested")).assertIsDisplayed()
        rule.onNodeWithTag(CATALOG_EMPTY_TAG).assertDoesNotExist()
    }

    @Test
    public fun `search and explicit grouping keep their existing sections`() {
        store.entries += summary("nested", "Nested record", website = "vault.example")
            .copy(groupPath = "/Personal")
        val catalog = CatalogModel(store, 1uL, scope, FakeClipboard(), searchDelayMillis = 0)
        show(catalog)
        rule.onNodeWithTag(CATALOG_NESTED_SECTION_TAG).assertIsDisplayed()

        rule.runOnIdle { catalog.search("record") }
        rule.waitForIdle()
        rule.onNodeWithTag(catalogRowTag("nested")).assertIsDisplayed()
        rule.onNodeWithTag(CATALOG_NESTED_SECTION_TAG).assertDoesNotExist()

        rule.runOnIdle {
            catalog.clearSearch()
            catalog.setOptions(CatalogOptions(grouping = CatalogOptions.Grouping.WEBSITE))
        }
        rule.waitForIdle()
        rule.onNodeWithTag(sectionTag("vault.example")).assertIsDisplayed()
        rule.onNodeWithTag(catalogRowTag("nested")).assertIsDisplayed()
        rule.onNodeWithTag(CATALOG_NESTED_SECTION_TAG).assertDoesNotExist()
    }

    @Test
    public fun `a root containing only groups does not show an empty vault`() {
        show()

        rule.onNodeWithTag(groupRowTag("/Personal")).assertIsDisplayed()
        rule.onNodeWithTag(CATALOG_EMPTY_TAG).assertDoesNotExist()
        rule.onNodeWithTag(CATALOG_NESTED_SECTION_TAG).assertDoesNotExist()
    }
}
