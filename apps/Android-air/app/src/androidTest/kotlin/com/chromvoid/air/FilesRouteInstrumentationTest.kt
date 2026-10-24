package com.chromvoid.air

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.performTouchInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.bridge.wire.CatalogFolderPageRequest
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.files.FILES_ADD_TAG
import com.chromvoid.air.ui.files.FILES_DELETE_SELECTED_TAG
import com.chromvoid.air.ui.files.FILES_EXPORT_SELECTED_TAG
import com.chromvoid.air.ui.files.FILES_MOVE_SELECTED_TAG
import com.chromvoid.air.ui.files.FILES_NEW_FOLDER_TAG
import com.chromvoid.air.ui.files.FILES_OPTIONS_TAG
import com.chromvoid.air.ui.files.FILES_SELECT_TAG
import com.chromvoid.air.ui.files.FILES_SELECTION_COUNT_TAG
import com.chromvoid.air.ui.files.FILES_UP_TAG
import com.chromvoid.air.ui.files.FILE_DELETE_CONFIRM_TAG
import com.chromvoid.air.ui.files.FILE_NAME_SAVE_TAG
import com.chromvoid.air.ui.files.FILE_NAME_TAG
import com.chromvoid.air.ui.files.OPERATION_CLOSE_TAG
import com.chromvoid.air.ui.files.OPERATION_FINISHED_TAG
import com.chromvoid.air.ui.files.OPERATION_MOVE_HERE_TAG
import com.chromvoid.air.ui.files.fileActionsTag
import com.chromvoid.air.ui.files.fileMenuTag
import com.chromvoid.air.ui.files.fileRowTag
import com.chromvoid.air.ui.files.operationFolderTag
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Routes A20, A21 (folder), A23 and A24 against real Core: a folder is created
 * from the add menu, another is opened and left, one is renamed from its menu,
 * a selection is moved into a folder chosen by browsing, and a folder is
 * deleted after confirmation. Core's own listing is the proof of each.
 */
@RunWith(AndroidJUnit4::class)
public class FilesRouteInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun foldersAreCreatedOpenedRenamedMovedAndDeleted() {
        val generation = unlocked()
        runBlocking {
            session.files.createFolder(ARCHIVE, "/", generation)
            session.files.createFolder(DRAFTS, "/", generation)
            session.files.createFolder(OLD, "/", generation)
        }
        rule.onNodeWithTag("root-files").performClick()
        awaitNode(fileRowTag(ARCHIVE))

        // A21: a new folder from the add menu, in the folder on screen.
        rule.onNodeWithTag(FILES_ADD_TAG).performClick()
        awaitNode(FILES_NEW_FOLDER_TAG)
        rule.onNodeWithTag(FILES_NEW_FOLDER_TAG).performClick()
        awaitNode(FILE_NAME_TAG)
        rule.onNodeWithTag(FILE_NAME_TAG).performTextInput(WORK)
        rule.onNodeWithTag(FILE_NAME_SAVE_TAG).performClick()
        awaitNode(fileRowTag(WORK))

        // A20: into a folder and back to the same list.
        rule.onNodeWithTag(fileRowTag(ARCHIVE)).performClick()
        awaitNode(FILES_UP_TAG)
        rule.onNodeWithTag(FILES_UP_TAG).performClick()
        awaitNode(fileRowTag(WORK))

        // A23: rename from the row's visible actions button.
        rule.onNodeWithTag(fileActionsTag(DRAFTS)).performClick()
        awaitNode(fileMenuTag(DRAFTS, "rename"))
        rule.onNodeWithTag(fileMenuTag(DRAFTS, "rename")).performClick()
        awaitNode(FILE_NAME_TAG)
        rule.onNodeWithTag(FILE_NAME_TAG).performTextReplacement(RENAMED)
        rule.onNodeWithTag(FILE_NAME_SAVE_TAG).performClick()
        awaitNode(fileRowTag(RENAMED))

        // A24: two folders chosen and moved into another by browsing.
        rule.onNodeWithTag(FILES_OPTIONS_TAG).performClick()
        awaitNode(FILES_SELECT_TAG)
        rule.onNodeWithTag(FILES_SELECT_TAG).performClick()
        rule.onNodeWithTag(fileRowTag(WORK)).performClick()
        rule.onNodeWithTag(fileRowTag(RENAMED)).performClick()
        rule.onNodeWithTag(FILES_SELECTION_COUNT_TAG).assertIsDisplayed().assertTextEquals(
            rule.activity.getString(com.chromvoid.air.presentation.R.string.files_selected_count, 2),
        )
        rule.onNodeWithTag(FILES_EXPORT_SELECTED_TAG).assertIsDisplayed()
        rule.onNodeWithTag(FILES_DELETE_SELECTED_TAG).assertIsDisplayed()
        for (tag in listOf("root-vault", "root-files", "root-connections", "root-settings")) {
            assertEquals(tag, 0, rule.onAllNodesWithTag(tag).fetchSemanticsNodes().size)
        }
        rule.onNodeWithTag(FILES_MOVE_SELECTED_TAG).assertIsDisplayed().performClick()
        awaitNode(operationFolderTag(ARCHIVE))
        rule.onNodeWithTag(operationFolderTag(ARCHIVE)).performClick()
        awaitNode(OPERATION_MOVE_HERE_TAG)
        rule.waitForIdle()
        rule.onNodeWithTag(OPERATION_MOVE_HERE_TAG).performClick()
        awaitNode(OPERATION_FINISHED_TAG)
        rule.onNodeWithTag(OPERATION_CLOSE_TAG).performClick()
        awaitNode(fileRowTag(OLD))
        rule.onNodeWithTag("root-files").assertIsDisplayed()

        // A24, delete: the one left at the root, confirmed first.
        rule.onNodeWithTag(fileRowTag(OLD)).performTouchInput { longClick() }
        awaitNode(fileMenuTag(OLD, "delete"))
        rule.onNodeWithTag(fileMenuTag(OLD, "delete")).performClick()
        awaitNode(FILE_DELETE_CONFIRM_TAG)
        rule.onNodeWithTag(FILE_DELETE_CONFIRM_TAG).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            rule.onAllNodesWithTag(fileRowTag(OLD)).fetchSemanticsNodes().isEmpty()
        }

        val (root, archive) = runBlocking {
            listing("/", generation) to listing("/$ARCHIVE", generation)
        }
        assertEquals(listOf(ARCHIVE), root)
        assertEquals(listOf(RENAMED, WORK).sorted(), archive.sorted())
    }

    private suspend fun listing(path: String, generation: ULong): List<String> =
        session.files.filePage(CatalogFolderPageRequest(limit = 50, offset = 0, path = path), generation)
            .items.map { it.name }

    private fun unlocked(): ULong {
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState { it is AirSessionState.Unlocked }
        return (session.state.value as AirSessionState.Unlocked).generation
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
        const val ARCHIVE = "Архив"
        const val DRAFTS = "Черновики"
        const val RENAMED = "Старые черновики"
        const val OLD = "Удалить"
        const val WORK = "Работа"
        const val NODE_TIMEOUT_MILLIS = 10_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
