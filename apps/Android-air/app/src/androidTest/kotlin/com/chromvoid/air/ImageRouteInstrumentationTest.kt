package com.chromvoid.air

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.media.MediaCodecList
import android.net.Uri
import android.os.Build
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.printToString
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.chromvoid.air.bridge.wire.CatalogFolderPageRequest
import com.chromvoid.air.bridge.wire.CatalogListItem
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.session.SafFileDevice
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.files.DerivativeTier
import com.chromvoid.air.ui.files.fileRowTag
import com.chromvoid.air.ui.media.GALLERY_CLOSE_TAG
import com.chromvoid.air.ui.media.GALLERY_INFO_TAG
import com.chromvoid.air.ui.media.GALLERY_NEXT_TAG
import com.chromvoid.air.ui.media.GALLERY_POSITION_TAG
import com.chromvoid.air.ui.media.IMAGE_DIMENSIONS_TAG
import com.chromvoid.air.ui.media.IMAGE_INFO_DONE_TAG
import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.random.Random
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Route A29 for images against real Core: JPEGs imported into the vault open
 * in the gallery, decoded on the device - a large one after Core found no
 * stored preview for it, which the viewer then asks Core to store; the
 * information sheet reads the original's pixel size; paging moves to the next
 * image and Done returns to the folder. Core makes those previews with the
 * device's own decoder.
 */
@RunWith(AndroidJUnit4::class)
public class ImageRouteInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun imagesOpenInTheGalleryDecodedOnTheDevice() {
        val generation = unlocked()
        val large = import(LARGE, jpeg(1600, 1200, noise = true), generation)
        import(SMALL, jpeg(640, 480, noise = false), generation)
        assertTrue("the large still is over the stored-preview threshold", (large.size ?: 0) > 1024 * 1024)
        assertEquals("the type comes from the name", "image/jpeg", large.mimeType)
        rule.onNodeWithTag("root-files").performClick()
        awaitNode(fileRowTag(LARGE))

        rule.onNodeWithTag(fileRowTag(LARGE)).performClick()
        awaitShown(LARGE)
        // On screen, the viewer asks Core to store its preview, as iOS does; leaving would cancel it.
        rule.waitUntil(DECODE_TIMEOUT_MILLIS) {
            runCatching { derivative(large, DerivativeTier.PREVIEW, ensure = false, generation) }.isSuccess
        }
        rule.onNodeWithTag(GALLERY_POSITION_TAG).assertTextContains("1 / 2")

        rule.onNodeWithTag(GALLERY_INFO_TAG).performClick()
        awaitNode(IMAGE_DIMENSIONS_TAG)
        rule.onNodeWithTag(IMAGE_DIMENSIONS_TAG).assertTextContains("1600 × 1200", substring = true)
        rule.onNodeWithTag(IMAGE_INFO_DONE_TAG).performClick()

        rule.onNodeWithTag(GALLERY_NEXT_TAG).performClick()
        awaitShown(SMALL)
        rule.onNodeWithTag(GALLERY_POSITION_TAG).assertTextContains("2 / 2")
        rule.onNodeWithTag(GALLERY_CLOSE_TAG).performClick()
        awaitNode(fileRowTag(SMALL))
    }

    /**
     * Core makes an image's stored preview and thumbnail itself when asked to, with the device's
     * own decoder reached from Rust, as it does with ImageIO on Apple; the next read finds them
     * stored, and bytes that are no image are refused rather than crash the decoder.
     */
    @Test
    public fun coreStoresAPreviewAndAThumbnailTheDeviceDecoded() {
        val generation = unlocked()
        val photo = import(LARGE, jpeg(1600, 1200, noise = true), generation)

        val preview = derivative(photo, DerivativeTier.PREVIEW, ensure = true, generation)
        val thumbnail = derivative(photo, DerivativeTier.THUMBNAIL, ensure = true, generation)
        // A preview keeps up to 1920 px and never upscales; a thumbnail fits 256 px.
        assertEquals(1600 to 1200, dimensions(preview))
        assertEquals(256 to 192, dimensions(thumbnail))
        assertTrue("a thumbnail is a PNG", thumbnail.isPng())
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            assertTrue("a preview is a WebP", preview.isWebp())
        } else {
            assertTrue("API 29 has no WebP encoder that keeps alpha, so a PNG", preview.isPng())
        }
        val stored = derivative(photo, DerivativeTier.PREVIEW, ensure = false, generation)
        assertArrayEquals("stored, not made again", preview, stored)

        val broken = import(BROKEN, Random(3).nextBytes(BROKEN_BYTES), generation)
        val refused = runCatching { derivative(broken, DerivativeTier.PREVIEW, ensure = true, generation) }
        assertTrue("bytes that are no image are refused", refused.isFailure)
    }

    /** A phone's own HEIC photo gets a preview too, where the device decodes HEVC. */
    @Test
    public fun aHeicPhotoGetsAPreviewWhereTheDeviceDecodesHevc() {
        assumeTrue("the device has no HEVC decoder", hevcDecoder())
        val generation = unlocked()
        val heic = InstrumentationRegistry.getInstrumentation().context.assets.open(HEIC).use { it.readBytes() }
        val photo = import(HEIC, heic, generation)

        val preview = derivative(photo, DerivativeTier.PREVIEW, ensure = true, generation)
        val (width, height) = dimensions(preview)
        assertTrue("decoded: ${width}x$height", width > 0 && height > 0)
        assertTrue("within the preview edge: ${width}x$height", maxOf(width, height) <= MAX_PREVIEW_EDGE)
    }

    private fun derivative(
        item: CatalogListItem,
        tier: DerivativeTier,
        ensure: Boolean,
        generation: ULong,
    ): ByteArray = runBlocking {
        session.files.derivative(item.nodeID, item.sourceRevision, tier, ensure, generation)
    }

    private fun dimensions(encoded: ByteArray): Pair<Int, Int> {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(encoded, 0, encoded.size, bounds)
        return bounds.outWidth to bounds.outHeight
    }

    private fun ByteArray.isPng(): Boolean = take(PNG_SIGNATURE.size) == PNG_SIGNATURE

    private fun ByteArray.isWebp(): Boolean =
        size > 12 && String(copyOfRange(0, 4)) == "RIFF" && String(copyOfRange(8, 12)) == "WEBP"

    private fun hevcDecoder(): Boolean = MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos
        .any { !it.isEncoder && it.supportedTypes.any { type -> type.equals("video/hevc", ignoreCase = true) } }

    private fun awaitShown(name: String) {
        try {
            rule.waitUntil(DECODE_TIMEOUT_MILLIS) {
                rule.onAllNodesWithContentDescription(name).fetchSemanticsNodes().isNotEmpty()
            }
        } catch (timeout: androidx.compose.ui.test.ComposeTimeoutException) {
            throw AssertionError(rule.onRoot(useUnmergedTree = true).printToString(), timeout)
        }
    }

    private fun jpeg(width: Int, height: Int, noise: Boolean): ByteArray {
        val random = Random(width)
        val pixels = IntArray(width * height) { index ->
            if (noise) {
                random.nextInt() or 0xFF000000.toInt()
            } else {
                Color.rgb(index % width * 255 / width, index / width * 255 / height, 128)
            }
        }
        val bitmap = Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888)
        return ByteArrayOutputStream().use { out ->
            bitmap.compress(Bitmap.CompressFormat.JPEG, 100, out)
            out.toByteArray()
        }
    }

    private fun import(name: String, bytes: ByteArray, generation: ULong): CatalogListItem {
        val picked = File(rule.activity.cacheDir, name).apply { writeBytes(bytes) }
        try {
            runBlocking {
                val source = SafFileDevice(rule.activity).source(Uri.fromFile(picked))
                session.files.importFile(source, "/", generation) { _, _ -> }
            }
        } finally {
            picked.delete()
        }
        return runBlocking {
            session.files.filePage(CatalogFolderPageRequest(limit = 50, offset = 0, path = "/"), generation)
                .items.single { it.name == name }
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
        const val LARGE = "a-large.jpg"
        const val SMALL = "b-small.jpg"
        const val BROKEN = "c-broken.jpg"
        const val BROKEN_BYTES = 64 * 1024
        const val HEIC = "preview-source.heic"
        const val MAX_PREVIEW_EDGE = 1920
        val PNG_SIGNATURE = listOf<Byte>(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
        const val NODE_TIMEOUT_MILLIS = 15_000L
        const val DECODE_TIMEOUT_MILLIS = 30_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
