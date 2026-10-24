package com.chromvoid.air

import android.app.Activity
import android.app.Instrumentation
import android.content.ContentUris
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.ParcelFileDescriptor
import android.provider.MediaStore
import android.provider.OpenableColumns
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.core.content.IntentCompat
import androidx.test.espresso.intent.Intents
import androidx.test.espresso.intent.Intents.intended
import androidx.test.espresso.intent.Intents.intending
import androidx.test.espresso.intent.matcher.IntentMatchers.hasAction
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.bridge.wire.CatalogFolderPageRequest
import com.chromvoid.air.bridge.wire.CatalogListItem
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.session.FileShares
import com.chromvoid.air.session.SafFileDevice
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.files.fileMenuTag
import com.chromvoid.air.ui.files.fileRowTag
import java.io.File
import java.io.FileNotFoundException
import java.security.MessageDigest
import kotlin.random.Random
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Routes A26 (share, open in another app) and A47 (save to the gallery)
 * against real Core. A copy offered to another app is read back through the
 * provider, as the receiving app would read it: from memory, seekable, and
 * from a pipe for a file above the memory limit; both have the original's
 * digest, and a lock withdraws the offer. An image saved to the gallery is
 * published complete in the ChromVoid album.
 */
@RunWith(AndroidJUnit4::class)
public class FileSharingInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val graph get() = AirAppGraph.of(rule.activity)
    private val session get() = graph.session

    @Test
    public fun aSharedCopyIsReadBackWholeAndWithdrawnOnLock() {
        val generation = unlocked()
        val bytes = Random(21).nextBytes(COPY_BYTES)
        val item = import("statement.pdf", bytes, generation)
        val resolver = rule.activity.contentResolver

        // The share sheet's copy, read as the receiving app reads it.
        val chooser = graph.shares.share(listOf(item), generation)
        val send = sent(chooser)
        val shared = stream(send)
        assertTrue(send.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
        resolver.query(shared, null, null, null, null)!!.use { cursor ->
            cursor.moveToFirst()
            assertEquals("statement.pdf", cursor.getString(cursor.getColumnIndexOrThrow(OpenableColumns.DISPLAY_NAME)))
            assertEquals(COPY_BYTES.toLong(), cursor.getLong(cursor.getColumnIndexOrThrow(OpenableColumns.SIZE)))
        }
        assertArrayEquals(digest(bytes), digest(resolver.openInputStream(shared)!!.use { it.readBytes() }))

        // The viewer's copy can be read from any position: it is in memory, not a pipe. Android 10
        // has no anonymous memory file, so there it streams through a pipe, whole.
        val viewed = checkNotNull(graph.shares.view(item, generation).data)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            resolver.openFileDescriptor(viewed, "r")!!.use { assertEquals(COPY_BYTES.toLong(), it.statSize) }
        } else {
            assertArrayEquals(digest(bytes), digest(resolver.openInputStream(viewed)!!.use { it.readBytes() }))
        }

        // Above the memory limit the copy streams through a pipe, whole.
        val streaming = FileShares(
            rule.activity,
            { session.files },
            CoroutineScope(SupervisorJob()),
            memoryLimitBytes = 0,
        )
        val piped = stream(sent(streaming.share(listOf(item), generation)))
        val copy = ParcelFileDescriptor.AutoCloseInputStream(streaming.open(piped)).use { it.readBytes() }
        assertArrayEquals(digest(bytes), digest(copy))

        // A lock withdraws every offer.
        runBlocking { session.lock() }
        awaitState { it == AirSessionState.Locked }
        try {
            resolver.openInputStream(shared)!!.use { it.read() }
            fail("a copy was served after the lock")
        } catch (_: FileNotFoundException) {
            Unit
        }
    }

    @Test
    public fun theRowMenuSharesAndAnImageGoesToTheGallery() {
        val generation = unlocked()
        val bytes = Random(22).nextBytes(IMAGE_BYTES)
        val image = import(IMAGE_NAME, bytes, generation, mimeType = "image/jpeg")
        rule.onNodeWithTag("root-files").performClick()
        awaitNode(fileRowTag(IMAGE_NAME))

        Intents.init()
        try {
            intending(hasAction(Intent.ACTION_CHOOSER))
                .respondWith(Instrumentation.ActivityResult(Activity.RESULT_OK, null))
            rule.onNodeWithTag(fileRowTag(IMAGE_NAME)).performTouchInput { longClick() }
            awaitNode(fileMenuTag(IMAGE_NAME, "share"))
            rule.onNodeWithTag(fileMenuTag(IMAGE_NAME, "share")).performClick()
            rule.waitForIdle()
            intended(hasAction(Intent.ACTION_CHOOSER))
        } finally {
            Intents.release()
        }

        // A47: the gallery holds the finished copy, published, in its album.
        val destination = checkNotNull(SafFileDevice(rule.activity).gallery(IMAGE_NAME, "image/jpeg"))
        runBlocking { session.files.exportFile(image.nodeID, destination, generation) { _, _ -> } }
        val resolver = rule.activity.contentResolver
        val collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val saved = resolver.query(
            collection,
            arrayOf(
                MediaStore.MediaColumns._ID,
                MediaStore.MediaColumns.IS_PENDING,
                MediaStore.MediaColumns.RELATIVE_PATH,
            ),
            "${MediaStore.MediaColumns.DISPLAY_NAME} = ?",
            arrayOf(IMAGE_NAME),
            null,
        )!!.use { cursor ->
            assertTrue("the image is in the gallery", cursor.moveToFirst())
            assertEquals("published, not pending", 0, cursor.getInt(1))
            assertEquals("Pictures/ChromVoid/", cursor.getString(2))
            ContentUris.withAppendedId(collection, cursor.getLong(0))
        }
        try {
            assertArrayEquals(digest(bytes), digest(resolver.openInputStream(saved)!!.use { it.readBytes() }))
        } finally {
            resolver.delete(saved, null, null)
        }
    }

    /** The send intent a share sheet carries, read on every Android the client supports. */
    private fun sent(chooser: Intent): Intent =
        checkNotNull(IntentCompat.getParcelableExtra(chooser, Intent.EXTRA_INTENT, Intent::class.java))

    private fun stream(send: Intent): Uri =
        checkNotNull(IntentCompat.getParcelableExtra(send, Intent.EXTRA_STREAM, Uri::class.java))

    private fun import(name: String, bytes: ByteArray, generation: ULong, mimeType: String? = null): CatalogListItem {
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
        }.let { if (mimeType != null) it.copy(mimeType = it.mimeType ?: mimeType) else it }
    }

    private fun digest(bytes: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(bytes)

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
        const val COPY_BYTES = 2 * 1024 * 1024 + 777
        const val IMAGE_BYTES = 90_000
        const val IMAGE_NAME = "air-gallery-check.jpg"
        const val NODE_TIMEOUT_MILLIS = 15_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
