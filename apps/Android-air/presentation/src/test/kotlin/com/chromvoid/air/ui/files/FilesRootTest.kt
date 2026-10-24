package com.chromvoid.air.ui.files

import androidx.activity.ComponentActivity
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.performTouchInput
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.documents.DOCUMENT_CLOSE_TAG
import com.chromvoid.air.ui.documents.DOCUMENT_SOURCE_TAG
import com.chromvoid.air.ui.documents.DOCUMENT_TAG
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Routes A20–A24 over the Files root: folders, search, Notes, new folder, rename, move and delete. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class FilesRootTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    private fun show(store: FakeFileStore, settings: FileSettings = FileSettings(MemoryFilePreferences())): FilesScope {
        val files = FilesScope(store, generation = 1uL, settings = settings, searchDelayMillis = 0)
        rule.setContent { AirTheme { FilesRoot(files) } }
        rule.waitForIdle()
        return files
    }

    private fun exists(tag: String): Boolean = rule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()

    @Test
    public fun `a folder opens with its own title and back returns to the same list`() {
        val store = FakeFileStore().apply {
            folder("Trips")
            file("Plan.md", parent = "/Trips")
            file("Scan.pdf")
        }
        show(store)

        rule.onNodeWithTag(fileRowTag("Trips")).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(fileRowTag("Plan.md")).assertIsDisplayed()
        rule.onNodeWithTag(FILES_TOTAL_TAG).assertTextEquals("1")

        rule.onNodeWithTag(FILES_UP_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(fileRowTag("Scan.pdf")).assertIsDisplayed()
        rule.onNodeWithTag(FILES_TOTAL_TAG).assertTextEquals("2")
    }

    @Test
    public fun `search narrows the folder and an unmatched search says so`() {
        val store = FakeFileStore().apply {
            file("Passport.pdf")
            file("Taxes.pdf")
        }
        show(store)

        rule.onNodeWithTag(FILES_SEARCH_TAG).performTextInput("pass")
        rule.waitForIdle()
        rule.onNodeWithTag(fileRowTag("Passport.pdf")).assertIsDisplayed()
        assertTrue(!exists(fileRowTag("Taxes.pdf")))

        rule.onNodeWithTag(FILES_SEARCH_TAG).performTextReplacement("zzz")
        rule.waitForIdle()
        rule.onNodeWithTag(FILES_EMPTY_TAG).assertIsDisplayed()
    }

    @Test
    public fun `Notes lists the notes below the folder with where each one is`() {
        val store = FakeFileStore().apply {
            folder("Trips")
            file("Plan.md", parent = "/Trips")
            file("Scan.pdf")
        }
        show(store)

        rule.onNodeWithTag(FILES_ALL_TAG).assertIsSelected()
        rule.onNodeWithTag(FILES_NOTES_TAG)
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.RadioButton))
            .assertIsNotSelected().performClick().assertIsSelected()
        rule.onNodeWithTag(FILES_ALL_TAG).assertIsNotSelected()
        rule.waitForIdle()

        rule.onNodeWithTag(fileRowTag("Plan.md")).assertTextContains("/Trips", substring = true)
        assertTrue(!exists(fileRowTag("Scan.pdf")))
        assertTrue(!exists(fileRowTag("Trips")))
    }

    @Test
    public fun `a new folder is named in a dialog and appears in the list`() {
        val store = FakeFileStore()
        show(store)
        rule.onNodeWithTag(FILES_EMPTY_TAG).assertIsDisplayed()

        rule.onNodeWithTag(FILES_ADD_TAG).performClick()
        rule.onNodeWithTag(FILES_NEW_FOLDER_TAG).performClick()
        rule.onNodeWithTag(FILE_NAME_TAG).performTextInput("Receipts")
        rule.onNodeWithTag(FILE_NAME_SAVE_TAG).performClick()
        rule.waitForIdle()

        assertTrue(!exists(FILE_NAME_TAG))
        rule.onNodeWithTag(fileRowTag("Receipts")).assertIsDisplayed()
    }

    @Test
    public fun `a long press renames an item and a taken name is explained`() {
        val store = FakeFileStore().apply {
            file("a.txt")
            file("b.txt")
        }
        show(store)

        rule.onNodeWithTag(fileRowTag("a.txt")).performTouchInput { longClick() }
        rule.onNodeWithTag(fileMenuTag("a.txt", "rename")).performClick()
        rule.onNodeWithTag(FILE_NAME_TAG).performTextReplacement("b.txt")
        rule.onNodeWithTag(FILE_NAME_SAVE_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithText("An item with that name already exists.").assertIsDisplayed()

        rule.onNodeWithTag(FILE_NAME_TAG).performTextReplacement("c.txt")
        rule.onNodeWithTag(FILE_NAME_SAVE_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(fileRowTag("c.txt")).assertIsDisplayed()
    }

    @Test
    public fun `a file's information shows its name, place and type`() {
        val store = FakeFileStore().apply { file("Scans.zip", size = 4096, mimeType = "application/zip") }
        show(store)

        rule.onNodeWithTag(fileRowTag("Scans.zip")).performClick()
        rule.waitForIdle()

        rule.onNodeWithTag(FILE_INFO_TAG).assertIsDisplayed()
        rule.onNodeWithText("application/zip").assertIsDisplayed()
        rule.onNodeWithTag(FILE_INFO_DONE_TAG).performClick()
        rule.waitForIdle()
        assertTrue(!exists(FILE_INFO_TAG))
    }

    @Test
    public fun `a text file opens its editor and Done returns to the folder`() {
        val store = FakeFileStore().apply { file("todo.txt", "milk".encodeToByteArray(), mimeType = "text/plain") }
        show(store)

        rule.onNodeWithTag(fileRowTag("todo.txt")).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(DOCUMENT_TAG).assertIsDisplayed()
        rule.onNodeWithTag(DOCUMENT_SOURCE_TAG).assertTextContains("milk")

        rule.onNodeWithTag(DOCUMENT_CLOSE_TAG).performClick()
        rule.waitForIdle()
        assertTrue(!exists(DOCUMENT_TAG))
        rule.onNodeWithTag(fileRowTag("todo.txt")).assertIsDisplayed()
    }

    @Test
    public fun `shared files are reviewed, saved into the folder and the sheet closes`() {
        val store = FakeFileStore()
        val files = FilesScope(store, generation = 1uL, settings = FileSettings(MemoryFilePreferences()))
        var toPasswords = 0
        files.receiveShare(
            listOf(MemorySource("export.csv", "a,b".encodeToByteArray(), "text/csv")),
            onCredentials = { toPasswords++ },
        )
        rule.setContent {
            AirTheme {
                files.incoming.collectAsState().value?.let {
                    IncomingShareScreen(it, device = null, onClose = files::closeIncoming, onLock = {})
                }
            }
        }

        rule.onNodeWithTag(incomingFileTag(0)).assertTextContains("export.csv", substring = true)
        rule.onNodeWithTag(INCOMING_DESTINATION_TAG).assertTextContains("/", substring = true)
        rule.onNodeWithTag(INCOMING_PASSWORDS_TAG).assertIsDisplayed()

        rule.onNodeWithTag(INCOMING_SAVE_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(IMPORT_FINISHED_TAG).assertIsDisplayed()
        assertTrue(!exists(IMPORT_CHOOSE_FILES_TAG))
        rule.onNodeWithTag(IMPORT_CLOSE_TAG).performClick()
        rule.waitForIdle()

        assertEquals(null, files.incoming.value)
        assertEquals("/", store.named("export.csv").parent)
        assertEquals(0, toPasswords)
    }

    @Test
    public fun `a share without files says there is nothing to save`() {
        val files = FilesScope(FakeFileStore(), generation = 1uL, settings = FileSettings(MemoryFilePreferences()))
        files.receiveShare(emptyList(), onCredentials = null)
        rule.setContent {
            AirTheme { IncomingShareScreen(files.incoming.value!!, device = null, onClose = {}, onLock = {}) }
        }

        rule.onNodeWithTag(INCOMING_NOTHING_TAG).assertIsDisplayed()
        rule.onNodeWithTag(INCOMING_SAVE_TAG).assertIsNotEnabled()
        assertTrue(!exists(INCOMING_DESTINATION_TAG))
    }

    @Test
    public fun `a delete is confirmed and the item leaves the list`() {
        val store = FakeFileStore().apply { folder("Old") }
        show(store)

        rule.onNodeWithTag(fileRowTag("Old")).performTouchInput { longClick() }
        rule.onNodeWithTag(fileMenuTag("Old", "delete")).performClick()
        rule.onNodeWithText("The folder and all its contents will be permanently deleted.", substring = true)
            .assertIsDisplayed()
        rule.onNodeWithTag(FILE_DELETE_CONFIRM_TAG).performClick()
        rule.waitForIdle()

        assertTrue(!exists(fileRowTag("Old")))
        assertEquals(listOf("delete:1"), store.calls)
    }

    @Test
    public fun `a new note is written into the folder and a dirty draft asks before it goes`() {
        val store = FakeFileStore().apply { folder("Trips") }
        show(store)
        rule.onNodeWithTag(fileRowTag("Trips")).performClick()
        rule.waitForIdle()

        rule.onNodeWithTag(FILES_ADD_TAG).performClick()
        rule.onNodeWithTag(FILES_NEW_NOTE_TAG).performClick()
        rule.onNodeWithTag(NOTE_TEXT_TAG).performTextInput("draft")
        rule.onNodeWithTag(NOTE_CANCEL_TAG).performClick()
        rule.onNodeWithTag(NOTE_DISCARD_TAG).assertIsDisplayed()
        rule.onNodeWithText("Keep editing").performClick()

        rule.onNodeWithTag(NOTE_NAME_TAG).performTextInput("Packing")
        rule.onNodeWithTag(NOTE_SAVE_TAG).performClick()
        rule.waitForIdle()

        rule.onNodeWithTag(fileRowTag("Packing.md")).assertIsDisplayed()
        assertEquals("draft", store.named("Packing.md").content.decodeToString())
        assertEquals("/Trips", store.named("Packing.md").parent)
    }

    @Test
    public fun `export lists what is copied and skips a folder`() {
        val store = FakeFileStore().apply {
            folder("Docs")
            file("a.txt")
        }
        show(store)

        rule.onNodeWithTag(FILES_OPTIONS_TAG).performClick()
        rule.onNodeWithTag(FILES_SELECT_TAG).performClick()
        rule.onNodeWithTag(fileRowTag("Docs")).performClick()
        rule.onNodeWithTag(fileRowTag("a.txt")).performClick()
        rule.onNodeWithTag(FILES_EXPORT_SELECTED_TAG).performClick()
        rule.waitForIdle()

        rule.onNodeWithTag(exportItemTag("Docs")).assertIsDisplayed()
        rule.onNodeWithText("Select files inside this folder to export them.").assertIsDisplayed()
        rule.onNodeWithTag(exportItemTag("a.txt")).assertIsDisplayed()
        rule.onNodeWithTag(EXPORT_CLOSE_TAG).performClick()
        rule.waitForIdle()
        assertTrue(!exists(EXPORT_CLOSE_TAG))
    }

    @Test
    public fun `an image opens the gallery of the folder's images, paged and closed with Done`() {
        val store = FakeFileStore().apply {
            file("a.jpg", mimeType = "image/jpeg")
            file("b.png", mimeType = "image/png")
            file("c.pdf", mimeType = "application/pdf")
        }
        show(store)

        rule.onNodeWithTag(fileRowTag("a.jpg")).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(com.chromvoid.air.ui.media.GALLERY_TAG).assertIsDisplayed()
        rule.onNodeWithTag(com.chromvoid.air.ui.media.GALLERY_POSITION_TAG).assertTextEquals("1 / 2")

        rule.onNodeWithTag(com.chromvoid.air.ui.media.GALLERY_NEXT_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(com.chromvoid.air.ui.media.GALLERY_POSITION_TAG).assertTextEquals("2 / 2")

        rule.onNodeWithTag(com.chromvoid.air.ui.media.GALLERY_CLOSE_TAG).performClick()
        rule.waitForIdle()
        assertTrue(!exists(com.chromvoid.air.ui.media.GALLERY_TAG))
        rule.onNodeWithTag(fileRowTag("c.pdf")).assertIsDisplayed()
    }

    @Test
    public fun `selected items move into a folder chosen by browsing`() {
        val store = FakeFileStore().apply {
            folder("Archive")
            folder("2025", parent = "/Archive")
            file("a.txt")
            file("b.txt")
        }
        show(store)

        rule.onNodeWithTag(FILES_OPTIONS_TAG).performClick()
        rule.onNodeWithTag(FILES_SELECT_TAG).performClick()
        rule.onNodeWithTag(fileRowTag("a.txt")).performClick()
        rule.onNodeWithTag(fileRowTag("b.txt")).performClick()
        rule.onNodeWithTag(FILES_SELECTION_COUNT_TAG).assertTextEquals("Selected: 2")
        rule.onNodeWithTag(FILES_MOVE_SELECTED_TAG).performClick()
        rule.waitForIdle()

        rule.onNodeWithTag(operationFolderTag("Archive")).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(operationFolderTag("2025")).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(OPERATION_MOVE_HERE_TAG).performClick()
        rule.waitForIdle()

        rule.onNodeWithTag(OPERATION_FINISHED_TAG).assertIsDisplayed()
        rule.onNodeWithTag(OPERATION_COUNT_TAG).assertTextContains("2 / 2", substring = true)
        rule.onNodeWithTag(OPERATION_CLOSE_TAG).performClick()
        rule.waitForIdle()
        assertTrue(!exists(fileRowTag("a.txt")))
        assertTrue(!exists(FILES_SELECTION_COUNT_TAG))
        assertEquals("/Archive/2025", store.named("a.txt").parent)
    }
}
