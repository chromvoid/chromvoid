package com.chromvoid.air

import android.content.ContentValues
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
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
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import com.chromvoid.air.bridge.wire.MasterRekeyRequest
import com.chromvoid.air.bridge.wire.CatalogFolderPageRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateSecrets
import com.chromvoid.air.bridge.wire.PassmanagerEntryPageRequest
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.session.SafFileDevice
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.ShellViewModel
import com.chromvoid.air.ui.access.ACCESS_UTILITIES_TAG
import com.chromvoid.air.ui.access.WELCOME_RESTORE_TAG
import com.chromvoid.air.ui.maintenance.BACKUP_CLOSE_TAG
import com.chromvoid.air.ui.maintenance.BACKUP_DESTINATION_TAG
import com.chromvoid.air.ui.maintenance.BACKUP_DONE_TAG
import com.chromvoid.air.ui.maintenance.BACKUP_PASSWORD_TAG
import com.chromvoid.air.ui.maintenance.ERASE_ACKNOWLEDGE_TAG
import com.chromvoid.air.ui.maintenance.ERASE_ISSUE_TAG
import com.chromvoid.air.ui.maintenance.ERASE_PASSWORD_TAG
import com.chromvoid.air.ui.maintenance.MAINTENANCE_LIST_TAG
import com.chromvoid.air.ui.maintenance.MaintenanceRoute
import com.chromvoid.air.ui.maintenance.StorageEraseModel
import com.chromvoid.air.ui.maintenance.RESTORE_CLOSE_TAG
import com.chromvoid.air.ui.maintenance.RESTORE_CONFIRM_TAG
import com.chromvoid.air.ui.maintenance.RESTORE_DONE_TAG
import com.chromvoid.air.ui.maintenance.RESTORE_ISSUE_TAG
import com.chromvoid.air.ui.maintenance.RESTORE_PASSWORD_TAG
import com.chromvoid.air.ui.maintenance.RESTORE_SOURCE_TAG
import java.io.File
import java.util.UUID
import java.util.regex.Pattern
import kotlin.random.Random
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Explicit stages run by test-reset-recovery.sh, without the test orchestrator.
 * The OS reset kills this instrumentation process; the host starts the next
 * stage afterward. Every secret and file below is a disposable test fixture.
 * Ordinary instrumentation runs skip these stages.
 */
@RunWith(AndroidJUnit4::class)
public class AppResetRecoveryInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val arguments get() = InstrumentationRegistry.getArguments()
    private val session get() = AirAppGraph.of(rule.activity).session
    private val device get() = UiDevice.getInstance(instrumentation)

    @Before
    public fun requireOwnedEmulator() {
        assumeTrue(arguments.getString("resetRecovery") == "owned-emulator")
        check(device.executeShellCommand("getprop ro.kernel.qemu").trim() == "1") {
            "reset recovery stages require a disposable emulator"
        }
        val avd = arguments.getString("recoveryAvd").orEmpty()
        check(avd.startsWith("CHROMVOID_RESET_RECOVERY_"))
        check(device.executeShellCommand("getprop ro.boot.qemu.avd_name").trim() == avd)
    }

    @Test
    public fun prepareExternalBackup() {
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState { it is AirSessionState.Unlocked }
        val generation = generation()
        runBlocking {
            session.credentials.createCredential(
                PassmanagerEntryCreateRequest(
                    entryID = UUID.randomUUID().toString(),
                    entryType = "login",
                    secrets = PassmanagerEntryCreateSecrets(password = RECORD_SECRET),
                    title = RECORD,
                ),
                generation,
            )
        }
        val source = File(rule.activity.cacheDir, FILE_NAME).apply { writeBytes(fileBytes()) }
        try {
            val imported = runBlocking {
                session.files.importFile(
                    SafFileDevice(rule.activity).source(Uri.fromFile(source)), "/", generation,
                ) { _, _ -> }
            }
            assertTrue("the synthetic document was imported", imported.completed)
        } finally {
            source.delete()
        }
        runBlocking { session.lock() }
        awaitState { it == AirSessionState.Locked }
        openUtility("backup")
        awaitNode(BACKUP_DESTINATION_TAG)
        rule.onNodeWithTag(BACKUP_DESTINATION_TAG).performClick()
        chooseSystemFolder(listOf("Documents", EXTERNAL_FOLDER))
        awaitNode(BACKUP_PASSWORD_TAG)
        rule.onNodeWithTag(BACKUP_PASSWORD_TAG).performTextReplacement(ADMINISTRATOR)
        rule.onNodeWithTag(BACKUP_PASSWORD_TAG).performImeAction()
        awaitNode(BACKUP_DONE_TAG)
        rule.onNodeWithTag(BACKUP_CLOSE_TAG).performClick()
        assertEquals(AirSessionState.Locked, session.state.value)
        // The known backup password becomes stale on the device, matching the forgotten-current-password case.
        runBlocking {
            session.maintenance.rekeyMaster(
                MasterRekeyRequest(currentPassword = ADMINISTRATOR, newMasterPassword = CURRENT_ADMINISTRATOR),
                checkNotNull(session.administration.value),
            )
        }
    }

    @Test
    public fun cancelResetPreservesVaultAndFile() {
        awaitState { it == AirSessionState.Locked }
        if (arguments.getString("captureLocale") == "ru") {
            AirAppGraph.of(rule.activity).appearancePreferences.language = "ru"
            rule.activityRule.scenario.recreate()
        }
        if (arguments.getString("captureTheme") == "dark") {
            openUtility("app_reset")
        } else {
            // This is the original dead end: the authenticated erase still asks for a password.
            openUtility("erase")
            awaitNode(ERASE_PASSWORD_TAG)
            rule.onNodeWithTag(ERASE_ACKNOWLEDGE_TAG).performScrollTo().performClick()
            rule.onNodeWithTag(ERASE_PASSWORD_TAG).performTextReplacement(ADMINISTRATOR)
            val erase = eraseModel()
            rule.onNodeWithTag(ERASE_PASSWORD_TAG).performImeAction()
            rule.waitUntil(NODE_TIMEOUT_MILLIS) {
                erase.state.value.issue == StorageEraseModel.Issue.INVALID_PASSWORD
            }
            rule.hideKeyboard()
            rule.onNodeWithTag(MAINTENANCE_LIST_TAG).performScrollToNode(hasTestTag(ERASE_ISSUE_TAG))
            awaitNode(ERASE_ISSUE_TAG)
            assertEquals("Core refused the stale administrative password", AirSessionState.Locked, session.state.value)
            rule.hideKeyboard()
            rule.onNodeWithTag(MAINTENANCE_LIST_TAG)
                .performScrollToNode(hasTestTag("erase-forgot-password"))
            rule.onNodeWithTag("erase-forgot-password").performClick()
        }
        awaitNode("app-reset-close")
        capture("warning")
        rule.onNodeWithTag(MAINTENANCE_LIST_TAG)
            .performScrollToNode(hasTestTag("app-reset-acknowledge"))
        rule.onNodeWithTag("app-reset-acknowledge").performScrollTo().performClick()
        rule.onNodeWithTag(MAINTENANCE_LIST_TAG).performScrollToNode(hasTestTag("app-reset-review"))
        rule.onNodeWithTag("app-reset-review").performClick()
        awaitNode("app-reset-confirmation")
        capture("confirmation")
        rule.onNodeWithTag("app-reset-cancel").performClick()
        rule.onNodeWithTag("app-reset-close").performClick()
        assertEquals("cancelling stays locked", AirSessionState.Locked, session.state.value)
        runBlocking { assertEquals(AccessOutcome.Accepted, session.unlock(VAULT)) }
        awaitState { it is AirSessionState.Unlocked }
        verifyData()
    }

    @Test
    public fun confirmResetTerminatesItsOwnProcess() {
        awaitState { it == AirSessionState.Locked }
        openUtility("app_reset")
        awaitNode("app-reset-close")
        rule.onNodeWithTag(MAINTENANCE_LIST_TAG)
            .performScrollToNode(hasTestTag("app-reset-acknowledge"))
        rule.onNodeWithTag("app-reset-acknowledge").performClick()
        rule.onNodeWithTag(MAINTENANCE_LIST_TAG).performScrollToNode(hasTestTag("app-reset-review"))
        rule.onNodeWithTag("app-reset-review").performClick()
        awaitNode("app-reset-confirmation")
        // The host requires this marker, then requires a new process at the welcome.
        instrumentation.sendStatus(0, Bundle().apply {
            putString("stream", "RESET_RECOVERY_FINAL_CONFIRMATION_REACHED\n")
        })
        rule.onNodeWithTag("app-reset-confirm").performClick()
        Thread.sleep(RESET_DEATH_WAIT_MILLIS)
        throw AssertionError("clearApplicationUserData did not terminate the target process")
    }

    @Test
    public fun restoreExternalBackupAndVerifyContents() {
        awaitState { it == AirSessionState.NeedsAdministrator }
        assertEquals(
            "the reset removed the pre-reset app language preference",
            "",
            AirAppGraph.of(rule.activity).appearancePreferences.language,
        )
        awaitNode(WELCOME_RESTORE_TAG)
        capture("startup-after-reset")
        rule.onNodeWithTag(WELCOME_RESTORE_TAG).performScrollTo().performClick()
        awaitNode(RESTORE_SOURCE_TAG)
        rule.onNodeWithTag(RESTORE_SOURCE_TAG).performClick()
        val backupFolder = checkNotNull(arguments.getString("backupFolder"))
        chooseSystemFolder(listOf("Documents", EXTERNAL_FOLDER, backupFolder))
        awaitNode(RESTORE_PASSWORD_TAG)
        rule.onNodeWithTag(RESTORE_PASSWORD_TAG).performTextReplacement("wrong-synthetic-administrator")
        rule.onNodeWithTag(RESTORE_PASSWORD_TAG).performImeAction()
        awaitNode(RESTORE_ISSUE_TAG)
        assertEquals(
            "an incorrect backup password changes no local data",
            AirSessionState.NeedsAdministrator,
            session.state.value,
        )
        rule.onNodeWithTag(RESTORE_PASSWORD_TAG).performTextReplacement(ADMINISTRATOR)
        rule.onNodeWithTag(RESTORE_PASSWORD_TAG).performImeAction()
        awaitNode(RESTORE_CONFIRM_TAG)
        rule.onNodeWithTag(RESTORE_CONFIRM_TAG).performClick()
        awaitNode(RESTORE_DONE_TAG)
        rule.onNodeWithTag(RESTORE_CLOSE_TAG).performClick()
        awaitState { it == AirSessionState.Locked }
        runBlocking { assertEquals(AccessOutcome.Accepted, session.unlock(VAULT)) }
        awaitState { it is AirSessionState.Unlocked }
        verifyData()
        // The known administrative password in the backup also becomes the device password again.
        runBlocking {
            val proof = session.backups.prepareBackup(ADMINISTRATOR, generation())
            try {
                assertTrue("the restored administrator authorizes Core", proof.artifacts().isNotEmpty())
            } finally {
                proof.close()
            }
        }
        capture("restored-vault")
        instrumentation.sendStatus(0, Bundle().apply {
            putString("stream", "RESET_RECOVERY_RESTORED_RECORD_AND_FILE_VERIFIED\n")
        })
    }

    private fun verifyData() {
        val generation = generation()
        val entries = runBlocking {
            session.credentials.credentialPage(
                PassmanagerEntryPageRequest(limit = 50, offset = 0, query = ""), generation,
            ).entries
        }
        assertEquals(listOf(RECORD), entries.map { it.title })
        val secret = runBlocking {
            session.credentials.readCredentialSecret(entries.single().id, "password", generation)
        }
        assertEquals(RECORD_SECRET, secret)
        val files = runBlocking {
            session.files.filePage(CatalogFolderPageRequest(limit = 50, offset = 0, path = "/"), generation).items
        }
        assertEquals(listOf(FILE_NAME), files.map { it.name })
        val exported = File(rule.activity.cacheDir, "verified-restored-file.bin")
        try {
            runBlocking {
                session.files.exportFile(
                    files.single().nodeID,
                    SafFileDevice(rule.activity).destination(Uri.fromFile(exported)),
                    generation,
                ) { _, _ -> }
            }
            assertArrayEquals(
                "every restored file byte equals the pre-reset fixture", fileBytes(), exported.readBytes(),
            )
        } finally {
            exported.delete()
        }
    }

    /** Uses the actual DocumentsUI chooser and its grant, including after reset revoked old grants. */
    private fun chooseSystemFolder(segments: List<String>) {
        val root = By.res("com.google.android.documentsui:id/breadcrumb_text").text(Build.MODEL)
        assertTrue(
            "the real Android folder picker opened", device.wait(Until.hasObject(root), NODE_TIMEOUT_MILLIS),
        )
        device.findObject(root).click()
        for (segment in segments) {
            val folder = By.text(segment)
            assertTrue(
                "folder $segment is shown by DocumentsUI",
                device.wait(Until.hasObject(folder), NODE_TIMEOUT_MILLIS),
            )
            device.findObjects(folder).last().click()
        }
        val useFolder = By.res("android:id/button1").text("USE THIS FOLDER")
        assertTrue("the picker allows this folder", device.wait(Until.hasObject(useFolder), NODE_TIMEOUT_MILLIS))
        device.findObject(useFolder).click()
        val allow = By.res("android:id/button1").text(Pattern.compile("(?i)allow"))
        assertTrue(
            "Android asks to grant the selected folder", device.wait(Until.hasObject(allow), NODE_TIMEOUT_MILLIS),
        )
        device.findObject(allow).click()
    }

    private fun capture(name: String) {
        rule.waitForIdle()
        val theme = arguments.getString("captureTheme") ?: "light"
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, "$name-$theme.png")
            put(MediaStore.Images.Media.MIME_TYPE, "image/png")
            put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/ChromVoidResetRecovery")
        }
        val resolver = rule.activity.contentResolver
        val target = checkNotNull(resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values))
        val bitmap = checkNotNull(instrumentation.uiAutomation.takeScreenshot())
        try {
            checkNotNull(resolver.openOutputStream(target)).use { output ->
                check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output))
            }
        } finally {
            bitmap.recycle()
        }
    }

    private fun openUtility(name: String) {
        awaitNode(ACCESS_UTILITIES_TAG)
        rule.onNodeWithTag(ACCESS_UTILITIES_TAG).performScrollTo().performClick()
        awaitNode("utility-$name")
        rule.onNodeWithTag("utility-$name").performScrollTo().performClick()
    }

    private fun eraseModel(): StorageEraseModel {
        var model: StorageEraseModel? = null
        rule.runOnUiThread {
            val shell = ViewModelProvider(rule.activity)[ShellViewModel::class.java]
            model = (shell.maintenance.value?.route?.value as? MaintenanceRoute.Erase)?.model
        }
        return checkNotNull(model)
    }

    private fun generation(): ULong = (session.state.value as AirSessionState.Unlocked).generation

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

    private fun fileBytes(): ByteArray = Random(831).nextBytes(180_117)

    private companion object {
        const val ADMINISTRATOR = "air-reset-recovery-original-administrator"
        const val CURRENT_ADMINISTRATOR = "air-reset-recovery-current-administrator"
        const val VAULT = "air-reset-recovery-vault"
        const val RECORD = "Reset recovery mail"
        const val RECORD_SECRET = "synthetic-reset-recovery-secret"
        const val FILE_NAME = "reset-recovery-document.bin"
        const val EXTERNAL_FOLDER = "ChromVoidResetRecovery"
        const val NODE_TIMEOUT_MILLIS = 30_000L
        const val STATE_TIMEOUT_NANOS = 30_000_000_000L
        const val RESET_DEATH_WAIT_MILLIS = 15_000L
        const val POLL_MILLIS = 50L
    }
}
