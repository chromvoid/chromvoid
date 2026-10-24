package com.chromvoid.air

import android.Manifest
import android.app.Activity
import android.app.Instrumentation
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.content.pm.PackageManager
import android.os.ParcelFileDescriptor
import android.view.View
import android.view.ViewGroup
import androidx.camera.view.PreviewView
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.test.espresso.intent.Intents
import androidx.test.espresso.intent.Intents.intending
import androidx.test.espresso.intent.matcher.IntentMatchers.hasAction
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import androidx.test.uiautomator.By
import androidx.test.uiautomator.BySelector
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.UiObject2
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateSecrets
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.credentials.CODES_ADD_TAG
import com.chromvoid.air.ui.credentials.CODES_ISSUE_TAG
import com.chromvoid.air.ui.credentials.CODE_KEY_TAG
import com.chromvoid.air.ui.credentials.CODE_SAVE_TAG
import com.chromvoid.air.ui.credentials.CODE_SCAN_TAG
import com.chromvoid.air.ui.credentials.DETAIL_EDIT_TAG
import com.chromvoid.air.ui.credentials.FORM_CODES_TAG
import com.chromvoid.air.ui.credentials.catalogRowTag
import com.chromvoid.app.OtpQrScannerActivity
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import java.io.File
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Route A46 on the device's own camera: scanning a code opens the back camera
 * behind the scanner, its preview streams, and Cancel hands the camera back
 * and leaves the setup key to type. A camera the person refuses leaves the
 * typed key too, with the reason. Pointing the camera at a real code is a
 * person's job; reading a code is the scanner's shared decoder, not this route.
 */
@RunWith(AndroidJUnit4::class)
public class CameraScanInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val device: UiDevice get() = UiDevice.getInstance(instrumentation)
    private val session get() = AirAppGraph.of(rule.activity).session
    private val packageName get() = rule.activity.packageName

    @Before
    public fun needsABackCamera() {
        val features = instrumentation.targetContext.packageManager
        assumeTrue("the scanner needs a back camera", features.hasSystemFeature(PackageManager.FEATURE_CAMERA))
    }

    @Test
    public fun theBackCameraStreamsForTheScanAndCancelHandsItBack() {
        val asked = !allowed()
        openAddCode()
        rule.onNodeWithTag(CODE_SCAN_TAG).performClick()
        // The person allows it for this time only, where the system offers that.
        if (asked) await(PermissionPrompt.allow).click()

        val scanner = awaitScanner()
        rule.waitUntil(CAMERA_TIMEOUT_MILLIS) {
            onMain { preview(scanner)?.previewStreamState?.value == PreviewView.StreamState.STREAMING }
        }
        rule.waitUntil(CAMERA_TIMEOUT_MILLIS) { cameraOpen() }

        val cancel = rule.activity.getString(com.chromvoid.platform.R.string.otp_qr_cancel)
        await(listOf(By.text(cancel).pkg(packageName))).click()
        rule.waitUntil(CAMERA_TIMEOUT_MILLIS) { scannerResumed() == null }
        awaitNode(CODE_KEY_TAG)
        assertEquals("a cancelled scan is no issue", 0, count(CODES_ISSUE_TAG))
        rule.waitUntil(CAMERA_TIMEOUT_MILLIS) { !cameraOpen() }
    }

    @Test
    public fun aRefusedCameraLeavesTheKeyToTypeAndSaysWhy() {
        assumeTrue("the camera was allowed earlier on this install", !allowed())
        openAddCode()
        rule.onNodeWithTag(CODE_SCAN_TAG).performClick()

        await(listOf(PermissionPrompt.deny)).click()
        awaitNode(CODES_ISSUE_TAG)
        awaitNode(CODE_KEY_TAG)
        assertFalse(cameraOpen())
    }

    /**
     * A code read from a picture instead of the lens: the scanner's own "Choose image" is handed a
     * picture of a QR code as the system picker hands it, and Core parses the URI the scanner read
     * into the draft, which saves as the record's code.
     */
    @Test
    public fun aChosenPictureOfACodeFillsTheKeyThroughCore() {
        val asked = !allowed()
        val (id, generation) = openAddCode()
        val picture = File(rule.activity.cacheDir, "code.png").apply { writeBytes(qrPicture(OTP_URI)) }
        Intents.init()
        try {
            intending(hasAction(Intent.ACTION_GET_CONTENT)).respondWith(
                Instrumentation.ActivityResult(Activity.RESULT_OK, Intent().setData(Uri.fromFile(picture))),
            )
            rule.onNodeWithTag(CODE_SCAN_TAG).performClick()
            // The scanner opens on the camera; the person allows it for this time only.
            if (asked) await(PermissionPrompt.allow).click()
            awaitScanner()
            val choose = rule.activity.getString(com.chromvoid.platform.R.string.otp_qr_choose_image)
            await(listOf(By.text(choose).pkg(packageName))).click()
            rule.waitUntil(CAMERA_TIMEOUT_MILLIS) { scannerResumed() == null }
        } finally {
            Intents.release()
            picture.delete()
        }

        rule.waitUntil(NODE_TIMEOUT_MILLIS) { typed(CODE_KEY_TAG).filterNot(Char::isWhitespace) == SECRET }
        assertEquals("a read code is no issue", 0, count(CODES_ISSUE_TAG))
        rule.onNodeWithTag(CODE_SAVE_TAG).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            runBlocking { session.credentials.otpRecords(id, generation) }.records.size == 1
        }
    }

    private fun qrPicture(text: String): ByteArray {
        val matrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, QR_EDGE, QR_EDGE)
        val bitmap = Bitmap.createBitmap(QR_EDGE, QR_EDGE, Bitmap.Config.ARGB_8888)
        for (x in 0 until QR_EDGE) {
            for (y in 0 until QR_EDGE) bitmap.setPixel(x, y, if (matrix[x, y]) Color.BLACK else Color.WHITE)
        }
        return java.io.ByteArrayOutputStream().use { out ->
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
            out.toByteArray()
        }
    }

    /** What a text field shows now. */
    private fun typed(tag: String): String =
        rule.onAllNodesWithTag(tag, useUnmergedTree = true).fetchSemanticsNodes().firstOrNull()
            ?.config?.getOrNull(SemanticsProperties.EditableText)?.text.orEmpty()

    /** Record page → Edit → One-time codes → Add code, with the vault open; the record and its generation. */
    private fun openAddCode(): Pair<String, ULong> {
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState { it is AirSessionState.Unlocked }
        val generation = (session.state.value as AirSessionState.Unlocked).generation
        val id = runBlocking {
            session.credentials.createCredential(
                PassmanagerEntryCreateRequest(
                    entryID = UUID.randomUUID().toString(),
                    entryType = "login",
                    secrets = PassmanagerEntryCreateSecrets(password = "synthetic"),
                    title = "Mail",
                ),
                generation,
            ).entryID
        }
        awaitNode(catalogRowTag(id))
        rule.onNodeWithTag(catalogRowTag(id)).performClick()
        awaitNode(DETAIL_EDIT_TAG)
        rule.onNodeWithTag(DETAIL_EDIT_TAG).performClick()
        awaitNode(FORM_CODES_TAG)
        rule.onNodeWithTag(FORM_CODES_TAG).performScrollTo().performClick()
        awaitNode(CODES_ADD_TAG)
        rule.onNodeWithTag(CODES_ADD_TAG).performClick()
        awaitNode(CODE_SCAN_TAG)
        return id to generation
    }

    private fun allowed(): Boolean =
        instrumentation.targetContext.checkSelfPermission(Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED

    private fun awaitScanner(): OtpQrScannerActivity {
        rule.waitUntil(CAMERA_TIMEOUT_MILLIS) { scannerResumed() != null }
        return checkNotNull(scannerResumed())
    }

    private fun scannerResumed(): OtpQrScannerActivity? = onMain {
        ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED)
            .filterIsInstance<OtpQrScannerActivity>().firstOrNull()
    }

    private fun preview(activity: Activity): PreviewView? = find(activity.window.decorView)

    private fun find(view: View): PreviewView? = when (view) {
        is PreviewView -> view
        is ViewGroup -> (0 until view.childCount).firstNotNullOfOrNull { find(view.getChildAt(it)) }
        else -> null
    }

    /**
     * Whether this app holds a camera now, by the camera service's own event log: its latest event
     * for the app, the log being newest first. A device's dump of past client instances is not read.
     */
    private fun cameraOpen(): Boolean {
        val events = shell("dumpsys media.camera").substringAfter(EVENTS_LOG, "")
        val latest = Regex(": (CONNECT|DISCONNECT) device \\S+ client for package ${Regex.escape(packageName)} ")
            .find(events)
        return latest?.groupValues?.get(1) == "CONNECT"
    }

    private fun shell(command: String): String {
        val output = instrumentation.uiAutomation.executeShellCommand(command)
        return ParcelFileDescriptor.AutoCloseInputStream(output).bufferedReader().use { it.readText() }
    }

    /**
     * The first of [selectors] on screen. Waits through the compose rule, which drives the frame clock of
     * every composition in this process; a timeout names what could be tapped instead.
     */
    private fun await(selectors: List<BySelector>): UiObject2 {
        var found: UiObject2? = null
        runCatching {
            rule.waitUntil(CAMERA_TIMEOUT_MILLIS) {
                found = selectors.firstNotNullOfOrNull { device.findObject(it) }
                found != null
            }
        }
        return found ?: run {
            val onScreen = device.findObjects(By.clickable(true)).joinToString { "${it.resourceName} '${it.text}'" }
            error("nothing matched $selectors; on screen: $onScreen")
        }
    }

    private fun <T> onMain(block: () -> T): T {
        var result: Result<T>? = null
        instrumentation.runOnMainSync { result = runCatching(block) }
        return checkNotNull(result).getOrThrow()
    }

    private fun count(tag: String): Int = rule.onAllNodesWithTag(tag, useUnmergedTree = true).fetchSemanticsNodes().size

    private fun awaitNode(tag: String) {
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { count(tag) > 0 }
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
        const val NODE_TIMEOUT_MILLIS = 15_000L
        const val CAMERA_TIMEOUT_MILLIS = 15_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
        const val EVENTS_LOG = "Camera service events log"
        const val SECRET = "JBSWY3DPEHPK3PXP"
        const val ISSUER = "ChromVoid"
        const val OTP_URI = "otpauth://totp/$ISSUER:alice?secret=$SECRET&issuer=$ISSUER"
        const val QR_EDGE = 480
    }
}
