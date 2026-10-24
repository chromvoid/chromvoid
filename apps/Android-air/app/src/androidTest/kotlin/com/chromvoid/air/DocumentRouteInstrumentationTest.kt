package com.chromvoid.air

import android.app.Activity
import android.app.Instrumentation
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.provider.MediaStore
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.click
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextInputSelection
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.text.TextRange
import androidx.test.espresso.intent.Intents
import androidx.test.espresso.intent.Intents.intending
import androidx.test.espresso.intent.matcher.IntentMatchers.hasAction
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.bridge.wire.CatalogFolderPageRequest
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.documents.DOCUMENT_CLOSE_TAG
import com.chromvoid.air.ui.documents.DOCUMENT_IMAGE_PROGRESS_TAG
import com.chromvoid.air.ui.documents.DOCUMENT_INSERT_IMAGE_TAG
import com.chromvoid.air.ui.documents.DOCUMENT_PREVIEW_MODE_TAG
import com.chromvoid.air.ui.documents.DOCUMENT_SAVED_TAG
import com.chromvoid.air.ui.documents.DOCUMENT_SAVED_VERSION_TAG
import com.chromvoid.air.ui.documents.DOCUMENT_SAVE_TAG
import com.chromvoid.air.ui.documents.DOCUMENT_SOURCE_MODE_TAG
import com.chromvoid.air.ui.documents.DOCUMENT_SOURCE_TAG
import com.chromvoid.air.ui.documents.DOCUMENT_TAG
import com.chromvoid.air.ui.documents.DOCUMENT_USE_DRAFT_TAG
import com.chromvoid.air.ui.documents.MARKDOWN_PREVIEW_TAG
import com.chromvoid.air.ui.files.CHOOSER_NEW_FOLDER_TAG
import com.chromvoid.air.ui.files.CHOOSER_TAG
import com.chromvoid.air.ui.files.CHOOSER_UP_TAG
import com.chromvoid.air.ui.files.CHOOSER_USE_TAG
import com.chromvoid.air.ui.files.FILE_NAME_SAVE_TAG
import com.chromvoid.air.ui.files.FILE_NAME_TAG
import com.chromvoid.air.ui.files.chooserFolderTag
import com.chromvoid.air.ui.files.fileRowTag
import com.chromvoid.air.ui.media.GALLERY_CLOSE_TAG
import com.chromvoid.air.ui.media.GALLERY_TAG
import com.chromvoid.air.ui.settings.SETTINGS_ATTACHMENT_FOLDER_TAG
import java.io.ByteArrayOutputStream
import java.io.File
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Routes A27 and A28 against real Core: a note opens in the preview Core
 * parsed, a task ticks through Core's task editor and saves at the revision
 * read, a note link resolves to the other note and Back returns, and a save
 * after another writer changed the file shows the conflict until the draft is
 * kept. Core's stored text is the proof of each save.
 */
@RunWith(AndroidJUnit4::class)
public class DocumentRouteInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun notesArePreviewedTickedLinkedAndSavedThroughConflicts() {
        val generation = unlocked()
        val plan = runBlocking {
            session.files.createNote(PACKING, "# Socks\n\nWool, two pairs.\n", "/", generation)
            session.files.createNote(PLAN, PLAN_TEXT, "/", generation).nodeID
        }
        rule.onNodeWithTag("root-files").performClick()
        awaitNode(fileRowTag(PLAN))
        rule.onNodeWithTag(fileRowTag(PLAN)).performClick()
        awaitNode(MARKDOWN_PREVIEW_TAG)
        awaitText("Trip")

        // A28: the task box ticks the source through Core, and Save stores it.
        val task = tagged("markdown-task-")
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { rule.onAllNodes(task).fetchSemanticsNodes().isNotEmpty() }
        rule.onAllNodes(task)[0].performClick()
        awaitText("Unsaved changes")
        rule.onNodeWithTag(DOCUMENT_SAVE_TAG).performClick()
        awaitNode(DOCUMENT_SAVED_TAG)
        assertTrue(stored(plan, generation).contains("- [x] Passport"))

        // A27: a note link resolves through Core; Back returns to the first note.
        rule.onNode(hasText(LINK_TEXT, substring = true)).performTouchInput { click(Offset(8f, center.y)) }
        awaitText(PACKING)
        awaitText("Socks")
        rule.onNodeWithTag(DOCUMENT_CLOSE_TAG).performClick()
        awaitText(PLAN)

        // A28, conflict: another writer saves first; the draft is kept on purpose.
        rule.onNodeWithTag(DOCUMENT_SOURCE_MODE_TAG).performClick()
        awaitNode(DOCUMENT_SOURCE_TAG)
        rule.onNodeWithTag(DOCUMENT_SOURCE_TAG).performTextReplacement(DRAFT)
        runBlocking {
            val current = session.files.readDocument(plan, generation)
            session.files.saveDocument(plan, current.sourceRevision, "# Elsewhere\n", generation)
        }
        rule.onNodeWithTag(DOCUMENT_SAVE_TAG).performClick()
        awaitNode(DOCUMENT_USE_DRAFT_TAG)
        rule.onNodeWithTag(DOCUMENT_SAVED_VERSION_TAG).performClick()
        awaitText("# Elsewhere")
        rule.onNodeWithTag(DOCUMENT_USE_DRAFT_TAG).performClick()
        awaitNode(DOCUMENT_SAVED_TAG)
        assertEquals(DRAFT, stored(plan, generation))

        rule.onNodeWithTag(DOCUMENT_CLOSE_TAG).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { rule.onAllNodesWithTag(DOCUMENT_TAG).fetchSemanticsNodes().isEmpty() }
        awaitNode(fileRowTag(PACKING))
    }

    /**
     * Route A28, images: the attachment folder is created and chosen from
     * Settings, a photo from the picker (stubbed with a JPEG) is imported
     * through `catalog:attachment:prepare` and linked in the source, the saved
     * note shows it decoded in its preview, and a tap opens it in the gallery.
     */
    @Test
    public fun imagesGoIntoTheChosenFolderAndShowInThePreview() {
        val generation = unlocked()
        val note = runBlocking { session.files.createNote(TRIP, TRIP_TEXT, "/", generation).nodeID }
        val photo = File(rule.activity.cacheDir, "beach.jpg").apply { writeBytes(jpeg()) }
        Intents.init()
        try {
            val picked = Instrumentation.ActivityResult(
                Activity.RESULT_OK,
                Intent().apply { clipData = ClipData.newRawUri(null, Uri.fromFile(photo)) },
            )
            intending(hasAction(MediaStore.ACTION_PICK_IMAGES)).respondWith(picked)
            intending(hasAction(Intent.ACTION_OPEN_DOCUMENT)).respondWith(picked)

            chooseAttachmentFolder()
            // The note's source: Insert image, from the (stubbed) photo picker.
            openSource()
            rule.onNodeWithTag(DOCUMENT_INSERT_IMAGE_TAG).performClick()
            // Core writes the destination in angle brackets, so any file name stays one link.
            awaitText("$TRIP_TEXT![beach](</$PHOTOS/beach-")
            rule.waitUntil(NODE_TIMEOUT_MILLIS) {
                rule.onAllNodesWithTag(DOCUMENT_IMAGE_PROGRESS_TAG).fetchSemanticsNodes().isEmpty()
            }
            rule.onNodeWithTag(DOCUMENT_SAVE_TAG).performClick()
            awaitNode(DOCUMENT_SAVED_TAG)

            val attachments = runBlocking {
                session.files.filePage(CatalogFolderPageRequest(limit = 50, offset = 0, path = "/$PHOTOS"), generation)
                    .items
            }
            val attachment = attachments.single()
            assertTrue(attachment.name.startsWith("beach-") && attachment.name.endsWith(".jpg"))
            assertEquals(photo.length(), attachment.size)
            assertEquals("$TRIP_TEXT![beach](</$PHOTOS/${attachment.name}>)", stored(note, generation))

            // The preview draws it, decoded, where the note puts it; a tap opens the gallery.
            rule.onNodeWithTag(DOCUMENT_PREVIEW_MODE_TAG).performClick()
            val drawn = SemanticsMatcher.keyIsDefined(SemanticsProperties.ContentDescription) and
                hasAnyAncestor(tagged("markdown-image-"))
            rule.waitUntil(NODE_TIMEOUT_MILLIS) {
                rule.onAllNodes(drawn, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()
            }
            rule.onAllNodes(drawn, useUnmergedTree = true)[0].performClick()
            awaitNode(GALLERY_TAG)
            rule.onNodeWithTag(GALLERY_CLOSE_TAG).performClick()
            rule.waitUntil(NODE_TIMEOUT_MILLIS) { rule.onAllNodesWithTag(GALLERY_TAG).fetchSemanticsNodes().isEmpty() }
            awaitNode(MARKDOWN_PREVIEW_TAG)
        } finally {
            Intents.release()
            photo.delete()
        }
    }

    /**
     * Route A28, pasted images, as iOS takes them: an image on the clipboard pasted into the
     * source is imported into the attachment folder and linked where the cursor is.
     */
    @Test
    public fun anImagePastedIntoTheSourceIsImportedAndLinked() {
        val generation = unlocked()
        val note = runBlocking { session.files.createNote(TRIP, TRIP_TEXT, "/", generation).nodeID }
        val resolver = rule.activity.contentResolver
        val photo = checkNotNull(
            resolver.insert(
                MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY),
                ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, "pasted.jpg")
                    put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg")
                },
            ),
        )
        try {
            resolver.openOutputStream(photo).use { checkNotNull(it).write(jpeg()) }
            chooseAttachmentFolder()
            openSource()
            rule.runOnUiThread {
                val clipboard = rule.activity.getSystemService(ClipboardManager::class.java)
                clipboard.setPrimaryClip(ClipData.newUri(resolver, "photo", photo))
            }
            rule.onNodeWithTag(DOCUMENT_SOURCE_TAG).performSemanticsAction(SemanticsActions.PasteText)

            awaitText("$TRIP_TEXT![pasted](</$PHOTOS/pasted-")
            rule.waitUntil(NODE_TIMEOUT_MILLIS) {
                rule.onAllNodesWithTag(DOCUMENT_IMAGE_PROGRESS_TAG).fetchSemanticsNodes().isEmpty()
            }
            rule.onNodeWithTag(DOCUMENT_SAVE_TAG).performClick()
            awaitNode(DOCUMENT_SAVED_TAG)
            val attachment = runBlocking {
                session.files.filePage(CatalogFolderPageRequest(limit = 50, offset = 0, path = "/$PHOTOS"), generation)
                    .items.single()
            }
            assertEquals("$TRIP_TEXT![pasted](</$PHOTOS/${attachment.name}>)", stored(note, generation))
        } finally {
            rule.runOnUiThread { rule.activity.getSystemService(ClipboardManager::class.java).clearPrimaryClip() }
            resolver.delete(photo, null, null)
        }
    }

    /** Settings: a new attachment folder made in the chooser, then chosen. */
    private fun chooseAttachmentFolder() {
        rule.onNodeWithTag("root-settings").performClick()
        awaitNode(SETTINGS_ATTACHMENT_FOLDER_TAG)
        rule.onNodeWithTag(SETTINGS_ATTACHMENT_FOLDER_TAG).performScrollTo().performClick()
        awaitNode(CHOOSER_NEW_FOLDER_TAG)
        rule.onNodeWithTag(CHOOSER_NEW_FOLDER_TAG).performClick()
        awaitNode(FILE_NAME_TAG)
        rule.onNodeWithTag(FILE_NAME_TAG).performTextInput(PHOTOS)
        rule.onNodeWithTag(FILE_NAME_SAVE_TAG).performClick()
        awaitNode(chooserFolderTag(PHOTOS))
        rule.onNodeWithTag(chooserFolderTag(PHOTOS)).performClick()
        awaitNode(CHOOSER_UP_TAG)
        rule.waitForIdle()
        rule.onNodeWithTag(CHOOSER_USE_TAG).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            rule.onAllNodesWithTag(CHOOSER_TAG).fetchSemanticsNodes().isEmpty()
        }
        awaitText("/$PHOTOS")
    }

    /** The trip note's source, the cursor after its heading. */
    private fun openSource() {
        rule.onNodeWithTag("root-files").performClick()
        awaitNode(fileRowTag(TRIP))
        rule.onNodeWithTag(fileRowTag(TRIP)).performClick()
        awaitNode(DOCUMENT_SOURCE_MODE_TAG)
        rule.onNodeWithTag(DOCUMENT_SOURCE_MODE_TAG).performClick()
        awaitNode(DOCUMENT_SOURCE_TAG)
        rule.onNodeWithTag(DOCUMENT_SOURCE_TAG).performTextInputSelection(TextRange(TRIP_TEXT.length))
    }

    private fun tagged(prefix: String): SemanticsMatcher = SemanticsMatcher("a tag starting $prefix") {
        it.config.getOrNull(SemanticsProperties.TestTag)?.startsWith(prefix) == true
    }

    private fun jpeg(): ByteArray {
        val pixels = IntArray(PHOTO_SIDE * PHOTO_SIDE) { index ->
            Color.rgb(index % PHOTO_SIDE * 255 / PHOTO_SIDE, index / PHOTO_SIDE * 255 / PHOTO_SIDE, 160)
        }
        val bitmap = Bitmap.createBitmap(pixels, PHOTO_SIDE, PHOTO_SIDE, Bitmap.Config.ARGB_8888)
        return ByteArrayOutputStream().use { out ->
            bitmap.compress(Bitmap.CompressFormat.JPEG, 90, out)
            out.toByteArray()
        }
    }

    private fun stored(id: Long, generation: ULong): String =
        runBlocking { session.files.readDocument(id, generation).text }

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

    private fun awaitText(text: String) {
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            rule.onAllNodes(hasText(text, substring = true)).fetchSemanticsNodes().isNotEmpty()
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
        const val PLAN = "Plan.md"
        const val TRIP = "Trip.md"
        const val TRIP_TEXT = "# Trip\n\n"
        const val PHOTOS = "Photos"
        const val PHOTO_SIDE = 320
        const val PACKING = "Packing.md"
        const val LINK_TEXT = "The packing list"
        const val PLAN_TEXT = "# Trip\n\n- [ ] Passport\n\n[The packing list](Packing.md#socks) is separate.\n"
        const val DRAFT = "# Trip\n\nMy draft wins.\n"
        const val NODE_TIMEOUT_MILLIS = 10_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
