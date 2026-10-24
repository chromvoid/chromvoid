package com.chromvoid.air

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.BySelector
import androidx.test.uiautomator.UiDevice
import com.chromvoid.air.bridge.wire.CatalogFolderPageRequest
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.files.CAPTURE_REVIEW_TAG
import com.chromvoid.air.ui.files.CAPTURE_SHUTTER_TAG
import com.chromvoid.air.ui.files.CAPTURE_USE_TAG
import com.chromvoid.air.ui.files.FILES_ADD_TAG
import com.chromvoid.air.ui.files.FILES_IMPORT_TAG
import com.chromvoid.air.ui.files.IMPORT_FINISHED_TAG
import com.chromvoid.air.ui.files.IMPORT_TAKE_PHOTO_TAG
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Take Photo in Files, as on iOS: the import's camera takes one photo, the person uses it, and it
 * is imported into the folder by the name iOS gives it - from memory, never through a file on the
 * device. Where the camera's frames turn the photo, it arrives upright.
 */
@RunWith(AndroidJUnit4::class)
public class PhotoCaptureInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val device: UiDevice get() = UiDevice.getInstance(instrumentation)
    private val session get() = AirAppGraph.of(rule.activity).session

    @Before
    public fun needsACamera() {
        val features = instrumentation.targetContext.packageManager
        assumeTrue("Take Photo needs a camera", features.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY))
    }

    @Test
    public fun aPhotoTakenInTheImportIsStoredInTheFolder() {
        val asked = instrumentation.targetContext.checkSelfPermission(Manifest.permission.CAMERA) !=
            PackageManager.PERMISSION_GRANTED
        val generation = unlocked()
        rule.onNodeWithTag("root-files").performClick()
        awaitNode(FILES_ADD_TAG)
        rule.onNodeWithTag(FILES_ADD_TAG).performClick()
        awaitNode(FILES_IMPORT_TAG)
        rule.onNodeWithTag(FILES_IMPORT_TAG).performClick()
        awaitNode(IMPORT_TAKE_PHOTO_TAG)
        rule.onNodeWithTag(IMPORT_TAKE_PHOTO_TAG).performClick()
        // The person allows the camera for this time only, where the system offers that.
        if (asked) awaitButton(PermissionPrompt.allow)

        rule.waitUntil(CAMERA_TIMEOUT_MILLIS) { shutterEnabled() }
        rule.onNodeWithTag(CAPTURE_SHUTTER_TAG).performClick()
        awaitNode(CAPTURE_REVIEW_TAG, CAMERA_TIMEOUT_MILLIS)
        rule.onNodeWithTag(CAPTURE_USE_TAG).performClick()
        awaitNode(IMPORT_FINISHED_TAG, CAMERA_TIMEOUT_MILLIS)

        val photo = runBlocking {
            val everything = CatalogFolderPageRequest(limit = 50, offset = 0, path = "/")
            session.files.filePage(everything, generation).items.single()
        }
        assertTrue(photo.name, Regex("""Photo \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.\d{2}\.jpg""").matches(photo.name))
        assertEquals("image/jpeg", photo.mimeType)
        val bytes = runBlocking { session.files.readFile(photo.nodeID, generation, MAX_PHOTO_BYTES) }.bytes
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        assertTrue("a JPEG the device decodes: ${bounds.outWidth}x${bounds.outHeight}", bounds.outWidth > 0)
        bytes.fill(0)
    }

    /**
     * The camera is bound and the shutter takes a photo. While the system's prompt covers the app
     * there is no screen of the app's to search.
     */
    private fun shutterEnabled(): Boolean {
        val shutter = runCatching { rule.onAllNodesWithTag(CAPTURE_SHUTTER_TAG).fetchSemanticsNodes() }
            .getOrNull()?.singleOrNull() ?: return false
        return shutter.config.getOrNull(SemanticsProperties.Disabled) == null
    }

    private fun awaitButton(selectors: List<BySelector>) {
        var clicked = false
        rule.waitUntil(CAMERA_TIMEOUT_MILLIS) {
            selectors.firstNotNullOfOrNull { device.findObject(it) }?.let {
                it.click()
                clicked = true
            }
            clicked
        }
    }

    private fun unlocked(): ULong {
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState { it is AirSessionState.Unlocked }
        return (session.state.value as AirSessionState.Unlocked).generation
    }

    private fun awaitNode(tag: String, timeout: Long = NODE_TIMEOUT_MILLIS) {
        rule.waitUntil(timeout) {
            runCatching { rule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty() }.getOrDefault(false)
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
        const val MAX_PHOTO_BYTES = 32L * 1024 * 1024
        const val NODE_TIMEOUT_MILLIS = 15_000L
        const val CAMERA_TIMEOUT_MILLIS = 20_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
