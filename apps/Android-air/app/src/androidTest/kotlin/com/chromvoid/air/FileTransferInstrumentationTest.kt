package com.chromvoid.air

import android.app.Activity
import android.app.Instrumentation
import android.content.ClipData
import android.content.Intent
import android.net.Uri
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.performTouchInput
import androidx.test.espresso.intent.Intents
import androidx.test.espresso.intent.Intents.intending
import androidx.test.espresso.intent.matcher.IntentMatchers.hasAction
import com.chromvoid.air.ui.files.EXPORT_CHOOSE_TAG
import com.chromvoid.air.ui.files.EXPORT_FINISHED_TAG
import com.chromvoid.air.ui.files.FILES_IMPORT_TAG
import com.chromvoid.air.ui.files.IMPORT_CHOOSE_FILES_TAG
import com.chromvoid.air.ui.files.IMPORT_CLOSE_TAG
import com.chromvoid.air.ui.files.IMPORT_COUNT_TAG
import com.chromvoid.air.ui.files.IMPORT_FINISHED_TAG
import com.chromvoid.air.ui.files.fileMenuTag
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.bridge.wire.CatalogFolderPageRequest
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.session.SafFileDevice
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.files.FILES_ADD_TAG
import com.chromvoid.air.ui.files.FILES_NEW_NOTE_TAG
import com.chromvoid.air.ui.files.FILE_INFO_TAG
import com.chromvoid.air.ui.files.NOTE_NAME_TAG
import com.chromvoid.air.ui.files.NOTE_SAVE_TAG
import com.chromvoid.air.ui.files.NOTE_TEXT_TAG
import com.chromvoid.air.ui.files.fileRowTag
import java.io.File
import java.security.MessageDigest
import kotlin.random.Random
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Routes A21 (note, import), A23 (information), A25 and A26 (save a copy)
 * against real Core: a note is written from the form; a document larger than
 * several chunks is imported from the device and exported back into another
 * document, and the two digests match; the imported file shows its
 * information. The documents are the app's own files opened by URI, as the
 * system pickers hand documents over.
 */
@RunWith(AndroidJUnit4::class)
public class FileTransferInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun aNoteAndADocumentGoInAndTheDocumentComesBackIntact() {
        val generation = unlocked()
        rule.onNodeWithTag("root-files").performClick()
        awaitIdleFiles()

        // A21: a note from the form, written through the file writer.
        rule.onNodeWithTag(FILES_ADD_TAG).performClick()
        awaitNode(FILES_NEW_NOTE_TAG)
        rule.onNodeWithTag(FILES_NEW_NOTE_TAG).performClick()
        awaitNode(NOTE_NAME_TAG)
        rule.onNodeWithTag(NOTE_NAME_TAG).performTextInput("Сборы")
        rule.onNodeWithTag(NOTE_TEXT_TAG).performTextInput("- [ ] Паспорт")
        rule.onNodeWithTag(NOTE_SAVE_TAG).performClick()
        awaitNode(fileRowTag("Сборы.md"))

        // A25: a picked document streamed into Core, several chunks long.
        val context = rule.activity
        val bytes = Random(7).nextBytes(DOCUMENT_BYTES)
        val picked = File(context.cacheDir, "scan.bin").apply { writeBytes(bytes) }
        val device = SafFileDevice(context)
        val imported = runBlocking {
            session.files.importFile(device.source(Uri.fromFile(picked)), "/", generation) { _, _ -> }
        }
        assertTrue(imported.completed)
        picked.delete()
        awaitNode(fileRowTag("scan.bin"))

        // A23: the imported file shows its information.
        rule.onNodeWithTag(fileRowTag("scan.bin")).performClick()
        awaitNode(FILE_INFO_TAG)

        // A26: a copy saved outside the vault, streamed chunk by chunk.
        val copy = File(context.cacheDir, "copy.bin")
        val metadata = runBlocking {
            session.files.exportFile(imported.nodeID, device.destination(Uri.fromFile(copy)), generation) { _, _ -> }
        }
        assertEquals(DOCUMENT_BYTES.toLong(), metadata.size)
        assertArrayEquals("the copy has the digest of the original", digest(bytes), digest(copy.readBytes()))
        copy.delete()

        val names = runBlocking {
            session.files.filePage(CatalogFolderPageRequest(limit = 50, offset = 0, path = "/"), generation)
                .items.map { it.name }
        }
        assertEquals(listOf("scan.bin", "Сборы.md"), names.sorted())
    }

    /**
     * The same routes through the screens: the document picker's answer is
     * stubbed with two documents, the save picker's with a new document, so
     * the path from each picker through the model into Core is the app's own.
     */
    @Test
    public fun thePickersFeedTheImportAndTheExportScreens() {
        unlocked()
        val context = rule.activity
        val first = Random(11).nextBytes(FIRST_BYTES)
        val second = Random(12).nextBytes(SECOND_BYTES)
        val a = File(context.cacheDir, "receipt.jpg").apply { writeBytes(first) }
        val b = File(context.cacheDir, "contract.pdf").apply { writeBytes(second) }
        val copy = File(context.cacheDir, "exported.pdf")
        Intents.init()
        try {
            intending(hasAction(Intent.ACTION_OPEN_DOCUMENT)).respondWith(
                Instrumentation.ActivityResult(
                    Activity.RESULT_OK,
                    Intent().apply {
                        clipData = ClipData.newRawUri(null, Uri.fromFile(a))
                            .apply { addItem(ClipData.Item(Uri.fromFile(b))) }
                    },
                ),
            )
            intending(hasAction(Intent.ACTION_CREATE_DOCUMENT)).respondWith(
                Instrumentation.ActivityResult(Activity.RESULT_OK, Intent().setData(Uri.fromFile(copy))),
            )
            rule.onNodeWithTag("root-files").performClick()
            awaitIdleFiles()

            rule.onNodeWithTag(FILES_ADD_TAG).performClick()
            awaitNode(FILES_IMPORT_TAG)
            rule.onNodeWithTag(FILES_IMPORT_TAG).performClick()
            awaitNode(IMPORT_CHOOSE_FILES_TAG)
            rule.onNodeWithTag(IMPORT_CHOOSE_FILES_TAG).performClick()
            awaitNode(IMPORT_FINISHED_TAG)
            rule.onNodeWithTag(IMPORT_COUNT_TAG).assertTextContains("2 / 2", substring = true)
            rule.onNodeWithTag(IMPORT_CLOSE_TAG).performClick()
            awaitNode(fileRowTag("contract.pdf"))
            awaitNode(fileRowTag("receipt.jpg"))

            rule.onNodeWithTag(fileRowTag("contract.pdf")).performTouchInput { longClick() }
            awaitNode(fileMenuTag("contract.pdf", "export"))
            rule.onNodeWithTag(fileMenuTag("contract.pdf", "export")).performClick()
            awaitNode(EXPORT_CHOOSE_TAG)
            rule.onNodeWithTag(EXPORT_CHOOSE_TAG).performClick()
            awaitNode(EXPORT_FINISHED_TAG)
            assertArrayEquals("the saved copy has the digest of the original", digest(second), digest(copy.readBytes()))
        } finally {
            Intents.release()
            a.delete()
            b.delete()
            copy.delete()
        }
    }

    private fun digest(bytes: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(bytes)

    private fun awaitIdleFiles() {
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { rule.onAllNodesWithTag(FILES_ADD_TAG).fetchSemanticsNodes().isNotEmpty() }
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

        /** Well past one read or write chunk, and not a multiple of either. */
        const val DOCUMENT_BYTES = 3 * 1024 * 1024 + 12_345
        const val FIRST_BYTES = 180_000
        const val SECOND_BYTES = 1_200_001
        const val NODE_TIMEOUT_MILLIS = 15_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
