package com.chromvoid.air.ui.files

import androidx.activity.ComponentActivity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import com.chromvoid.air.bridge.wire.CatalogListItem
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.AirTheme
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Visible file actions and the long-press shortcut share one menu and one Files scope. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class FolderRowActionsTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    private lateinit var files: FilesScope

    @After
    public fun close() {
        if (::files.isInitialized) files.close()
    }

    private fun show(store: FakeFileStore) {
        files = FilesScope(
            store,
            generation = 1uL,
            settings = FileSettings(MemoryFilePreferences()),
            searchDelayMillis = 0,
        )
        rule.setContent { AirTheme { FilesRoot(files) } }
        rule.waitForIdle()
    }

    private fun assertActions(name: String, description: String) {
        rule.onNodeWithTag(fileActionsTag(name))
            .assertIsDisplayed()
            .assertContentDescriptionEquals(description)
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
            .assertHasClickAction()
        assertEquals(
            description,
            rule.onNodeWithTag(fileRowTag(name)).fetchSemanticsNode().config[SemanticsActions.OnLongClick].label,
        )
    }

    @Test
    public fun `files and folders have separate named action buttons`() {
        show(FakeFileStore().apply {
            folder("Trips")
            file("Plan.bin")
        })

        assertActions("Trips", "Actions for Trips")
        assertActions("Plan.bin", "Actions for Plan.bin")
    }

    @Test
    @Config(qualifiers = "ru-rRU-w411dp-h891dp")
    public fun `file and folder action names and long press labels are localized`() {
        show(FakeFileStore().apply {
            folder("Поездки")
            file("План.bin")
        })

        assertActions("Поездки", "Действия: Поездки")
        assertActions("План.bin", "Действия: План.bin")
    }

    @Test
    public fun `file actions and long press open the same menu and scope flows`() {
        val store = FakeFileStore()
        val file = store.file("Plan.bin", mimeType = "application/octet-stream")
        show(store)

        listOf(false, true).forEach { longPress -> exerciseActions(store, store.item(file), longPress) }

        assertEquals(listOf("info:${file.id}", "info:${file.id}"), store.calls)
    }

    @Test
    public fun `folder actions and long press keep export and info out of the shared menu`() {
        val store = FakeFileStore()
        val folder = store.folder("Trips")
        show(store)

        listOf(false, true).forEach { longPress -> exerciseActions(store, store.item(folder), longPress) }

        assertTrue(store.calls.isEmpty())
    }

    private fun openMenu(item: CatalogListItem, longPress: Boolean) {
        if (longPress) {
            rule.onNodeWithTag(fileRowTag(item.name)).performSemanticsAction(SemanticsActions.OnLongClick) { it() }
        } else {
            rule.onNodeWithTag(fileActionsTag(item.name)).performClick()
        }
        assertEquals("/", files.top.path)
        assertNull(files.info.value)
        assertNull(files.document.value)
    }

    private fun assertMenu(item: CatalogListItem) {
        val actions = mutableListOf(
            "rename" to R.string.files_rename,
            "move" to R.string.files_move,
            "delete" to R.string.files_delete,
        )
        if (item.isDir) {
            rule.onNodeWithTag(fileMenuTag(item.name, "export")).assertDoesNotExist()
            rule.onNodeWithTag(fileMenuTag(item.name, "info")).assertDoesNotExist()
        } else {
            actions += "export" to R.string.files_export
            actions += "info" to R.string.files_info
        }
        actions.forEach { (action, label) ->
            rule.onNodeWithTag(fileMenuTag(item.name, action))
                .assertIsDisplayed().assertTextEquals(rule.activity.getString(label))
        }
    }

    private fun exerciseActions(store: FakeFileStore, item: CatalogListItem, longPress: Boolean) {
        openMenu(item, longPress)
        assertMenu(item)
        rule.onNodeWithTag(fileMenuTag(item.name, "rename")).performClick()
        assertEquals(FilesScope.NameEdit(item, item.name), files.edit.value)
        rule.onNodeWithTag(FILE_NAME_TAG).assertTextEquals(item.name)
        rule.onNodeWithTag(FILE_NAME_CANCEL_TAG).performClick()

        openMenu(item, longPress)
        rule.onNodeWithTag(fileMenuTag(item.name, "move")).performClick()
        val move = requireNotNull(files.operation.value)
        assertEquals(FileOperationModel.Kind.MOVE, move.kind)
        assertEquals(FileOperationModel.Phase.REVIEWING, move.state.value.phase)
        assertEquals(listOf(item), move.state.value.items.map { it.source })
        rule.onNodeWithTag(OPERATION_CLOSE_TAG).performClick()

        if (!item.isDir) {
            openMenu(item, longPress)
            rule.onNodeWithTag(fileMenuTag(item.name, "export")).performClick()
            val export = requireNotNull(files.export.value)
            assertEquals(FileExportModel.Phase.REVIEW, export.state.value.phase)
            assertEquals(listOf(item), export.state.value.items.map { it.source })
            rule.onNodeWithText(rule.activity.getString(R.string.files_export_text)).assertIsDisplayed()
            rule.onNodeWithText(rule.activity.getString(R.string.files_export_note)).assertIsDisplayed()
            rule.onNodeWithTag(EXPORT_CLOSE_TAG).performClick()

            openMenu(item, longPress)
            rule.onNodeWithTag(fileMenuTag(item.name, "info")).performClick()
            rule.waitForIdle()
            assertEquals(item.nodeID, files.info.value?.metadata?.nodeID)
            assertEquals(item.name, files.info.value?.metadata?.name)
            rule.onNodeWithTag(FILE_INFO_TAG).assertIsDisplayed()
            rule.onNodeWithTag(FILE_INFO_DONE_TAG).performClick()
        }

        openMenu(item, longPress)
        rule.onNodeWithTag(fileMenuTag(item.name, "delete")).performClick()
        assertEquals(item, files.deleting.value)
        val warning = if (item.isDir) R.string.files_delete_folder_text else R.string.files_delete_file_text
        rule.onNodeWithText(item.name + "\n\n" + rule.activity.getString(warning)).assertIsDisplayed()
        rule.onNodeWithTag(FILE_DELETE_CONFIRM_TAG).assertIsDisplayed()
        assertTrue(store.nodes.any { it.id == item.nodeID })
        rule.onNodeWithText(rule.activity.getString(R.string.form_keep_cancel)).performClick()
        assertNull(files.deleting.value)
    }

    @Test
    public fun `selection hides file and folder actions and row taps still choose items`() {
        val store = FakeFileStore()
        val folder = store.folder("Trips")
        val file = store.file("Plan.bin")
        show(store)

        rule.onNodeWithTag(FILES_OPTIONS_TAG).performClick()
        rule.onNodeWithTag(FILES_SELECT_TAG).performClick()

        rule.onNodeWithTag(fileActionsTag(folder.name)).assertDoesNotExist()
        rule.onNodeWithTag(fileActionsTag(file.name)).assertDoesNotExist()
        rule.onNodeWithTag(fileRowTag(folder.name)).performClick().assertIsSelected()
        rule.onNodeWithTag(fileRowTag(file.name)).performClick().assertIsSelected()
        assertEquals(setOf(folder.id, file.id), files.top.state.value.selection?.keys)
        assertEquals("/", files.top.path)
        assertNull(files.info.value)
        assertTrue(store.calls.isEmpty())

        rule.onNodeWithTag(FILES_SELECT_DONE_TAG).performClick()
        assertActions(folder.name, "Actions for Trips")
        assertActions(file.name, "Actions for Plan.bin")
    }
}
