package com.chromvoid.air

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performScrollToKey
import androidx.compose.ui.test.performTextReplacement
import androidx.lifecycle.ViewModelProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateSecrets
import com.chromvoid.air.bridge.wire.PassmanagerEntryPageRequest
import com.chromvoid.air.ui.ERASE_OUTCOME_DONE_TAG
import com.chromvoid.air.ui.ERASE_OUTCOME_TAG
import com.chromvoid.air.ui.access.WELCOME_RESTORE_TAG
import com.chromvoid.air.ui.maintenance.ERASE_ACKNOWLEDGE_TAG
import com.chromvoid.air.ui.maintenance.ERASE_PASSWORD_TAG
import com.chromvoid.air.ui.maintenance.EraseOutcome
import com.chromvoid.air.ui.maintenance.RESTORE_CLOSE_TAG
import com.chromvoid.air.ui.maintenance.RESTORE_CONFIRM_TAG
import com.chromvoid.air.ui.maintenance.RESTORE_DONE_TAG
import com.chromvoid.air.ui.settings.SETTINGS_ERASE_TAG
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.ShellViewModel
import com.chromvoid.air.ui.maintenance.BACKUP_CLOSE_TAG
import com.chromvoid.air.ui.maintenance.BACKUP_DONE_TAG
import com.chromvoid.air.ui.maintenance.BACKUP_ISSUE_TAG
import com.chromvoid.air.ui.maintenance.BACKUP_PASSWORD_TAG
import com.chromvoid.air.ui.maintenance.BACKUP_SUBMIT_TAG
import com.chromvoid.air.ui.maintenance.MaintenanceRoute
import com.chromvoid.air.ui.maintenance.RESTORE_ISSUE_TAG
import com.chromvoid.air.ui.maintenance.RESTORE_PASSWORD_TAG
import com.chromvoid.air.ui.maintenance.StorageBackupModel
import com.chromvoid.air.ui.maintenance.StorageRestoreModel
import com.chromvoid.air.ui.settings.SETTINGS_BACKUP_TAG
import com.chromvoid.air.ui.settings.SETTINGS_LIST_TAG
import com.chromvoid.air.ui.settings.SETTINGS_RESTORE_TAG
import java.io.File
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Backup, erase and restore through their screens against real Core. The system
 * picker is replaced by a folder in the app's storage; everything from the
 * administrative password to Core's answer is the real route.
 */
@RunWith(AndroidJUnit4::class)
public class StorageRecoveryInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun aBackupIsSavedAndRestoreRefusesStorageThatHoldsAVault() {
        openVaultWithOneRecord()
        val folder = File(rule.activity.cacheDir, "backup-${UUID.randomUUID()}")

        rule.onNodeWithTag(ROOT_SETTINGS_TAG).performClick()
        rule.onNodeWithTag(SETTINGS_LIST_TAG).performScrollToKey("storage")
        rule.onNodeWithTag(SETTINGS_BACKUP_TAG).performClick()
        awaitNode(BACKUP_PASSWORD_TAG)
        val backup = route<MaintenanceRoute.Backup>().model
        rule.runOnUiThread { backup.chooseDestination(FolderBackupDestination(folder)) }

        // A wrong administrative password is Core's refusal, explained as such.
        rule.onNodeWithTag(BACKUP_PASSWORD_TAG).performTextReplacement("not-the-administrator")
        rule.onNodeWithTag(BACKUP_SUBMIT_TAG).performClick()
        awaitNode(BACKUP_ISSUE_TAG)
        assertEquals(StorageBackupModel.Issue.REAUTHENTICATION, backup.state.value.issue)
        assertTrue("nothing is left behind", !folder.exists() || folder.listFiles().isNullOrEmpty())

        rule.onNodeWithTag(BACKUP_PASSWORD_TAG).performTextReplacement(ADMINISTRATOR)
        rule.onNodeWithTag(BACKUP_SUBMIT_TAG).performClick()
        awaitNode(BACKUP_DONE_TAG)
        val written = folder.listFiles().orEmpty().filter { it.length() > 0 }.map { it.name }.sorted()
        assertTrue("the backup's files: $written", written.isNotEmpty())
        rule.onNodeWithTag(BACKUP_CLOSE_TAG).performClick()

        // Restore only fills empty storage: this one holds a vault, and Core says so at the check.
        rule.onNodeWithTag(SETTINGS_LIST_TAG).performScrollToKey("storage")
        rule.onNodeWithTag(SETTINGS_RESTORE_TAG).performClick()
        awaitNode(RESTORE_PASSWORD_TAG)
        val restore = route<MaintenanceRoute.Restore>().model
        rule.runOnUiThread { restore.chooseSource(FolderRestoreSource(folder)) }
        // Go on the keyboard checks the backup, as the button below it does.
        rule.onNodeWithTag(RESTORE_PASSWORD_TAG).performTextReplacement(ADMINISTRATOR)
        rule.onNodeWithTag(RESTORE_PASSWORD_TAG).performImeAction()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            restore.state.value.status != StorageRestoreModel.Status.REVIEWING
        }
        val refused = restore.state.value
        assertEquals("$refused", StorageRestoreModel.Issue.TARGET_NOT_EMPTY, refused.issue)
        assertEquals(StorageRestoreModel.Status.EDITING, refused.status)
        awaitNode(RESTORE_ISSUE_TAG)
        folder.deleteRecursively()
    }

    @Test
    public fun aBackupRestoresIntoStorageThatWasErased() {
        openVaultWithOneRecord()
        val folder = File(rule.activity.cacheDir, "backup-${UUID.randomUUID()}")
        rule.onNodeWithTag(ROOT_SETTINGS_TAG).performClick()
        rule.onNodeWithTag(SETTINGS_LIST_TAG).performScrollToKey("storage")
        rule.onNodeWithTag(SETTINGS_BACKUP_TAG).performClick()
        awaitNode(BACKUP_PASSWORD_TAG)
        val backup = route<MaintenanceRoute.Backup>().model
        rule.runOnUiThread { backup.chooseDestination(FolderBackupDestination(folder)) }
        rule.onNodeWithTag(BACKUP_PASSWORD_TAG).performTextReplacement(ADMINISTRATOR)
        rule.onNodeWithTag(BACKUP_PASSWORD_TAG).performImeAction()
        awaitNode(BACKUP_DONE_TAG)
        rule.onNodeWithTag(BACKUP_CLOSE_TAG).performClick()

        // Delete local data from Settings: Core reviews first, then the acknowledgement and the password.
        rule.onNodeWithTag(SETTINGS_LIST_TAG).performScrollToKey("erase")
        rule.onNodeWithTag(SETTINGS_ERASE_TAG).performClick()
        awaitNode(ERASE_PASSWORD_TAG)
        rule.onNodeWithTag(ERASE_ACKNOWLEDGE_TAG).performClick()
        rule.onNodeWithTag(ERASE_PASSWORD_TAG).performTextReplacement(ADMINISTRATOR)
        rule.onNodeWithTag(ERASE_PASSWORD_TAG).performImeAction()
        awaitNode(ERASE_OUTCOME_TAG)
        assertEquals(EraseOutcome.COMPLETED, shell().eraseOutcome.value)
        rule.onNodeWithTag(ERASE_OUTCOME_DONE_TAG).performClick()
        awaitState { it == AirSessionState.NeedsAdministrator }

        // The erased device offers restoring on its welcome.
        awaitNode(WELCOME_RESTORE_TAG)
        rule.onNodeWithTag(WELCOME_RESTORE_TAG).performClick()
        awaitNode(RESTORE_PASSWORD_TAG)
        val restore = route<MaintenanceRoute.Restore>().model
        rule.runOnUiThread { restore.chooseSource(FolderRestoreSource(folder)) }
        rule.onNodeWithTag(RESTORE_PASSWORD_TAG).performTextReplacement(ADMINISTRATOR)
        rule.onNodeWithTag(RESTORE_PASSWORD_TAG).performImeAction()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { restore.state.value.status != StorageRestoreModel.Status.REVIEWING }
        assertEquals("${restore.state.value}", StorageRestoreModel.Status.REVIEW, restore.state.value.status)
        awaitNode(RESTORE_CONFIRM_TAG)
        rule.onNodeWithTag(RESTORE_CONFIRM_TAG).performClick()
        awaitNode(RESTORE_DONE_TAG)
        rule.onNodeWithTag(RESTORE_CLOSE_TAG).performClick()

        // The restored storage opens with the original vault password and holds the record.
        awaitState { it == AirSessionState.Locked }
        runBlocking { assertEquals(AccessOutcome.Accepted, session.unlock(VAULT)) }
        awaitState { it is AirSessionState.Unlocked }
        val generation = (session.state.value as AirSessionState.Unlocked).generation
        val titles = runBlocking {
            session.credentials.credentialPage(
                PassmanagerEntryPageRequest(limit = 50, offset = 0, query = ""),
                generation,
            ).entries.map { it.title }
        }
        assertEquals(listOf(RECORD), titles)
        folder.deleteRecursively()
    }

    private fun shell(): ShellViewModel {
        var found: ShellViewModel? = null
        rule.runOnUiThread { found = ViewModelProvider(rule.activity)[ShellViewModel::class.java] }
        return checkNotNull(found)
    }

    private fun openVaultWithOneRecord() {
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState { it is AirSessionState.Unlocked }
        val generation = (session.state.value as AirSessionState.Unlocked).generation
        runBlocking {
            session.credentials.createCredential(
                PassmanagerEntryCreateRequest(
                    entryID = UUID.randomUUID().toString(),
                    entryType = "login",
                    secrets = PassmanagerEntryCreateSecrets(password = "synthetic"),
                    title = RECORD,
                ),
                generation,
            )
        }
        awaitNode(ROOT_SETTINGS_TAG)
    }

    private inline fun <reified T : MaintenanceRoute> route(): T {
        var found: T? = null
        rule.runOnUiThread {
            val shell = ViewModelProvider(rule.activity)[ShellViewModel::class.java]
            found = shell.maintenance.value?.route?.value as? T
        }
        return checkNotNull(found) { "no ${T::class.simpleName} screen is open" }
    }

    private fun awaitNode(tag: String) {
        try {
            rule.waitUntil(NODE_TIMEOUT_MILLIS) { rule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty() }
        } catch (error: Throwable) {
            var route: Any? = null
            rule.runOnUiThread {
                route = ViewModelProvider(rule.activity)[ShellViewModel::class.java].maintenance.value?.route?.value
            }
            val tags = mutableListOf<String>()
            fun walk(node: androidx.compose.ui.semantics.SemanticsNode) {
                node.config.getOrElseNullable(androidx.compose.ui.semantics.SemanticsProperties.TestTag) { null }
                    ?.let { tags += it }
                node.children.forEach(::walk)
            }
            walk(rule.onRoot(useUnmergedTree = true).fetchSemanticsNode())
            throw AssertionError("no $tag; route=$route session=${session.state.value} tags=$tags", error)
        }
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
        const val RECORD = "Recovery mail"
        const val ROOT_SETTINGS_TAG = "root-settings"
        const val NODE_TIMEOUT_MILLIS = 30_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
