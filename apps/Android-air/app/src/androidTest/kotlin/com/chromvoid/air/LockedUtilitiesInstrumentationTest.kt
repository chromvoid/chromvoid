package com.chromvoid.air

import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextReplacement
import androidx.lifecycle.ViewModelProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.ShellViewModel
import com.chromvoid.air.ui.access.ACCESS_UTILITIES_TAG
import com.chromvoid.air.ui.access.utilityTag
import com.chromvoid.air.ui.maintenance.BACKUP_CLOSE_TAG
import com.chromvoid.air.ui.maintenance.BACKUP_DONE_TAG
import com.chromvoid.air.ui.maintenance.BACKUP_ISSUE_TAG
import com.chromvoid.air.ui.maintenance.BACKUP_PASSWORD_TAG
import com.chromvoid.air.ui.maintenance.MAINTENANCE_CLOSE_TAG
import com.chromvoid.air.ui.maintenance.MAINTENANCE_DONE_TAG
import com.chromvoid.air.ui.maintenance.MAINTENANCE_LIST_TAG
import com.chromvoid.air.ui.maintenance.MAINTENANCE_SUBMIT_TAG
import com.chromvoid.air.ui.maintenance.MaintenanceAction
import com.chromvoid.air.ui.maintenance.MaintenanceRoute
import com.chromvoid.air.ui.maintenance.PasswordMaintenanceModel.Field
import com.chromvoid.air.ui.maintenance.StorageBackupModel
import com.chromvoid.air.ui.maintenance.maintenanceFieldTag
import java.io.File
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The locked device's utilities against real Core, as on iOS: the
 * administrative password is changed without opening the vault, and a backup
 * then asks for the new password.
 */
@RunWith(AndroidJUnit4::class)
public class LockedUtilitiesInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun theAdministrativePasswordChangesWhileLocked() {
        awaitState { it == AirSessionState.NeedsAdministrator }
        // A backup needs a vault to have been created once; Core refuses one of bare storage.
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
            session.lock()
        }
        awaitState { it == AirSessionState.Locked }

        openUtility(MaintenanceAction.ADMINISTRATOR_PASSWORD)
        awaitNode(maintenanceFieldTag(Field.CURRENT))
        rule.onNodeWithTag(maintenanceFieldTag(Field.CURRENT)).performTextReplacement(ADMINISTRATOR)
        rule.onNodeWithTag(maintenanceFieldTag(Field.NEW)).performTextReplacement(REPLACEMENT)
        rule.onNodeWithTag(maintenanceFieldTag(Field.CONFIRMATION)).performTextReplacement(REPLACEMENT)
        rule.onNodeWithTag(maintenanceFieldTag(Field.CONFIRMATION)).performImeAction()
        // A short screen with the keyboard up keeps the button out of the list until it is reached.
        rule.onNodeWithTag(MAINTENANCE_LIST_TAG).performScrollToNode(hasTestTag(MAINTENANCE_SUBMIT_TAG))
        rule.onNodeWithTag(MAINTENANCE_SUBMIT_TAG, useUnmergedTree = true).performClick()
        awaitNode(MAINTENANCE_DONE_TAG)
        rule.onNodeWithTag(MAINTENANCE_CLOSE_TAG).performClick()
        assertEquals("the vault stayed closed throughout", AirSessionState.Locked, session.state.value)

        // A backup now takes the new administrative password and refuses the old one.
        val folder = File(rule.activity.cacheDir, "backup-${UUID.randomUUID()}")
        openUtility(MaintenanceAction.BACKUP)
        awaitNode(BACKUP_PASSWORD_TAG)
        val backup = route<MaintenanceRoute.Backup>().model
        rule.runOnUiThread { backup.chooseDestination(FolderBackupDestination(folder)) }
        rule.onNodeWithTag(BACKUP_PASSWORD_TAG).performTextReplacement(ADMINISTRATOR)
        rule.onNodeWithTag(BACKUP_PASSWORD_TAG).performImeAction()
        awaitNode(BACKUP_ISSUE_TAG)
        assertEquals(StorageBackupModel.Issue.REAUTHENTICATION, backup.state.value.issue)
        rule.onNodeWithTag(BACKUP_PASSWORD_TAG).performTextReplacement(REPLACEMENT)
        rule.onNodeWithTag(BACKUP_PASSWORD_TAG).performImeAction()
        val deadline = System.nanoTime() + NODE_TIMEOUT_MILLIS * 1_000_000
        while (backup.state.value.status == StorageBackupModel.Status.EDITING ||
            backup.state.value.status == StorageBackupModel.Status.WORKING
        ) {
            check(System.nanoTime() < deadline) { "backup still ${backup.state.value}" }
            Thread.sleep(POLL_MILLIS)
        }
        assertEquals("${backup.state.value}", StorageBackupModel.Status.DONE, backup.state.value.status)
        awaitNode(BACKUP_DONE_TAG)
        rule.onNodeWithTag(BACKUP_CLOSE_TAG).performClick()
        assertEquals(AirSessionState.Locked, session.state.value)
        folder.deleteRecursively()
    }

    private fun openUtility(action: MaintenanceAction) {
        awaitNode(ACCESS_UTILITIES_TAG)
        rule.onNodeWithTag(ACCESS_UTILITIES_TAG).performScrollTo().performClick()
        awaitNode(utilityTag(action))
        rule.onNodeWithTag(utilityTag(action)).performClick()
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
        const val REPLACEMENT = "air-instrumentation-administrator-2"
        const val VAULT = "air-instrumentation-vault"
        const val NODE_TIMEOUT_MILLIS = 30_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
