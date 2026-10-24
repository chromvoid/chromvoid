package com.chromvoid.air.ui.files

import androidx.activity.ComponentActivity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.root.RootScaffold
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Selection replaces root navigation with actions that remain reachable at the end of a folder. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class FileSelectionTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    @Test
    public fun `selecting the last file keeps named actions outside the scrolling folder`() {
        val store = FakeFileStore().apply { repeat(40) { file("file-%03d.bin".format(it)) } }
        val files = show(store)
        beginSelection()
        rule.onNodeWithTag(FILES_LIST_TAG).performScrollToNode(hasTestTag(fileRowTag("file-039.bin")))
        rule.onNodeWithTag(fileRowTag("file-039.bin"))
            .assertIsDisplayed().assertIsNotSelected().performClick().assertIsSelected()

        rule.onNodeWithTag(FILES_SELECTION_COUNT_TAG).assertIsDisplayed().assertTextEquals("Selected: 1")
        assertAction(FILES_MOVE_SELECTED_TAG, "Move")
        assertAction(FILES_EXPORT_SELECTED_TAG, "Export")
        assertAction(FILES_DELETE_SELECTED_TAG, "Delete")
        assertTabsHidden()
        assertEquals(setOf(store.named("file-039.bin").id), files.top.state.value.selection?.keys)
    }

    @Test
    public fun `selection without chosen files disables its actions and Done restores root navigation`() {
        val files = show(FakeFileStore().apply { file("a.bin") })
        beginSelection()

        rule.onNodeWithTag(FILES_SELECTION_COUNT_TAG).assertIsDisplayed().assertTextEquals("Selected: 0")
        for (tag in ACTION_TAGS) rule.onNodeWithTag(tag).assertIsDisplayed().assertIsNotEnabled()
        assertTabsHidden()

        rule.onNodeWithTag(FILES_SELECT_DONE_TAG).performClick()

        assertTabsVisible()
        assertMissing(FILES_SELECTION_COUNT_TAG)
        assertNull(files.top.state.value.selection)
        rule.onNodeWithTag(fileRowTag("a.bin")).assertIsDisplayed()
    }

    @Test
    public fun `Back leaves selection and preserves the folder`() {
        val files = show(FakeFileStore().apply { file("a.bin") })
        beginSelection()
        rule.onNodeWithTag(fileRowTag("a.bin")).performClick()
        assertTabsHidden()

        rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }
        rule.waitForIdle()

        assertTabsVisible()
        assertNull(files.top.state.value.selection)
        assertMissing(FILES_SELECTION_COUNT_TAG)
        rule.onNodeWithTag(fileRowTag("a.bin")).assertIsDisplayed()
    }

    @Test
    public fun `Move opens the selected batch for destination review`() {
        val files = showSelectedFile()

        rule.onNodeWithTag(FILES_MOVE_SELECTED_TAG).performClick()

        rule.onNodeWithTag(OPERATION_MOVE_HERE_TAG).assertIsDisplayed()
        val operation = checkNotNull(files.operation.value)
        assertEquals(FileOperationModel.Kind.MOVE, operation.kind)
        assertEquals(listOf("a.bin"), operation.state.value.items.map { it.source.name })
        assertEquals(FileOperationModel.Phase.REVIEWING, operation.state.value.phase)
        assertTabsHidden()
    }

    @Test
    public fun `Export opens the selected batch and closing keeps the selection`() {
        val files = showSelectedFile()

        rule.onNodeWithTag(FILES_EXPORT_SELECTED_TAG).performClick()

        rule.onNodeWithTag(exportItemTag("a.bin")).assertIsDisplayed()
        val export = checkNotNull(files.export.value)
        assertEquals(listOf("a.bin"), export.state.value.items.map { it.source.name })
        assertEquals(FileExportModel.Phase.REVIEW, export.state.value.phase)
        assertTabsHidden()

        rule.onNodeWithTag(EXPORT_CLOSE_TAG).performClick()

        assertNull(files.export.value)
        rule.onNodeWithTag(fileRowTag("a.bin")).assertIsSelected()
        rule.onNodeWithTag(FILES_SELECTION_COUNT_TAG).assertTextEquals("Selected: 1")
        assertTabsHidden()
    }

    @Test
    public fun `Delete reviews the selected batch before any file is removed`() {
        val store = FakeFileStore().apply { file("a.bin") }
        val files = show(store)
        beginSelection()
        rule.onNodeWithTag(fileRowTag("a.bin")).performClick()

        rule.onNodeWithTag(FILES_DELETE_SELECTED_TAG).performClick()

        rule.onNodeWithTag(OPERATION_CONFIRM_DELETE_TAG).assertIsDisplayed()
        val operation = checkNotNull(files.operation.value)
        assertEquals(FileOperationModel.Kind.DELETE, operation.kind)
        assertEquals(listOf("a.bin"), operation.state.value.items.map { it.source.name })
        assertEquals(FileOperationModel.Phase.REVIEWING, operation.state.value.phase)
        assertEquals(emptyList<String>(), store.calls)
        assertTabsHidden()
    }

    private fun show(store: FakeFileStore): FilesScope {
        val files = FilesScope(store, generation = 1uL, settings = FileSettings(MemoryFilePreferences()))
        rule.setContent {
            AirTheme { RootScaffold(unlocked = true, files = { FilesRoot(files, modifier = it) }) }
        }
        rule.onNodeWithTag("root-files").performClick()
        rule.waitForIdle()
        return files
    }

    private fun showSelectedFile(): FilesScope {
        val files = show(FakeFileStore().apply { file("a.bin") })
        beginSelection()
        rule.onNodeWithTag(fileRowTag("a.bin")).performClick()
        return files
    }

    private fun beginSelection() {
        rule.onNodeWithTag(FILES_OPTIONS_TAG).performClick()
        rule.onNodeWithTag(FILES_SELECT_TAG).performClick()
        rule.waitForIdle()
    }

    private fun assertAction(tag: String, label: String) {
        rule.onNodeWithTag(tag)
            .assertIsDisplayed()
            .assertIsEnabled()
            .assertTextEquals(label)
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
            .assert(!hasAnyAncestor(hasTestTag(FILES_LIST_TAG)))
    }

    private fun assertTabsHidden() {
        for (tag in ROOT_TAGS) assertMissing(tag)
    }

    private fun assertTabsVisible() {
        for (tag in ROOT_TAGS) rule.onNodeWithTag(tag).assertIsDisplayed()
        rule.onNodeWithTag("root-files").assertIsSelected()
    }

    private fun assertMissing(tag: String) {
        assertEquals(tag, 0, rule.onAllNodesWithTag(tag, useUnmergedTree = true).fetchSemanticsNodes().size)
    }

    private companion object {
        val ROOT_TAGS = listOf("root-vault", "root-files", "root-connections", "root-settings")
        val ACTION_TAGS = listOf(FILES_MOVE_SELECTED_TAG, FILES_EXPORT_SELECTED_TAG, FILES_DELETE_SELECTED_TAG)
    }
}
