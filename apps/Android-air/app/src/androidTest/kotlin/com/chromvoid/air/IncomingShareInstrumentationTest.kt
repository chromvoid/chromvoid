package com.chromvoid.air

import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.bridge.wire.CatalogFolderPageRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateSecrets
import com.chromvoid.air.bridge.wire.PassmanagerEntryPageRequest
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.access.ACCESS_SHARE_NOTICE_TAG
import com.chromvoid.air.ui.files.CHOOSER_TAG
import com.chromvoid.air.ui.files.CHOOSER_UP_TAG
import com.chromvoid.air.ui.files.CHOOSER_USE_TAG
import com.chromvoid.air.ui.files.IMPORT_CLOSE_TAG
import com.chromvoid.air.ui.files.IMPORT_FINISHED_TAG
import com.chromvoid.air.ui.files.INCOMING_DESTINATION_TAG
import com.chromvoid.air.ui.files.INCOMING_PASSWORDS_TAG
import com.chromvoid.air.ui.files.INCOMING_SAVE_TAG
import com.chromvoid.air.ui.files.INCOMING_TAG
import com.chromvoid.air.ui.files.chooserFolderTag
import com.chromvoid.air.ui.files.incomingFileTag
import com.chromvoid.air.ui.transfer.IMPORT_APPLY_TAG
import com.chromvoid.air.ui.transfer.IMPORT_DONE_TAG
import com.chromvoid.air.ui.transfer.IMPORT_REVIEW_TAG
import java.util.UUID
import kotlin.random.Random
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Routes A30 and A43 against real Core, with real share intents: another
 * app's document (a MediaStore item, granted as a share grants it) reaches
 * ChromVoid while it is locked, waits in memory, and is saved after the
 * unlock into a folder chosen by browsing; a credential export shared while
 * open goes to the Passwords import, which reviews and applies it.
 */
@RunWith(AndroidJUnit4::class)
public class IncomingShareInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session
    private val documents = mutableListOf<Uri>()

    @After
    public fun removeDocuments() {
        documents.forEach { runCatching { rule.activity.contentResolver.delete(it, null, null) } }
    }

    @Test
    public fun aShareWhileLockedIsSavedAfterTheUnlockIntoTheChosenFolder() {
        var generation = unlocked()
        runBlocking {
            session.files.createFolder(INBOX, "/", generation)
            session.lock()
        }
        awaitState { it == AirSessionState.Locked }
        val bytes = Random(7).nextBytes(DOCUMENT_BYTES)
        val shared = document("receipt.txt", "text/plain", bytes)

        share(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_STREAM, shared))
        awaitNode(ACCESS_SHARE_NOTICE_TAG)
        awaitText("1 shared file waits for the unlock.")

        runBlocking { assertEquals(AccessOutcome.Accepted, session.unlock(VAULT)) }
        awaitState { it is AirSessionState.Unlocked }
        generation = (session.state.value as AirSessionState.Unlocked).generation
        awaitNode(INCOMING_TAG)
        awaitNode(incomingFileTag(0))
        awaitText("receipt.txt")

        rule.onNodeWithTag(INCOMING_DESTINATION_TAG).performClick()
        awaitNode(chooserFolderTag(INBOX))
        rule.onNodeWithTag(chooserFolderTag(INBOX)).performClick()
        awaitNode(CHOOSER_UP_TAG)
        rule.waitForIdle()
        rule.onNodeWithTag(CHOOSER_USE_TAG).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { rule.onAllNodesWithTag(CHOOSER_TAG).fetchSemanticsNodes().isEmpty() }
        awaitText("/$INBOX")

        rule.onNodeWithTag(INCOMING_SAVE_TAG).performClick()
        awaitNode(IMPORT_FINISHED_TAG)
        rule.onNodeWithTag(IMPORT_CLOSE_TAG).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { rule.onAllNodesWithTag(INCOMING_TAG).fetchSemanticsNodes().isEmpty() }

        val saved = runBlocking {
            session.files.filePage(CatalogFolderPageRequest(limit = 50, offset = 0, path = "/$INBOX"), generation)
                .items.single()
        }
        assertEquals("receipt.txt", saved.name)
        val content = runBlocking { session.files.readFile(saved.nodeID, generation, DOCUMENT_BYTES.toLong()) }
        assertArrayEquals(bytes, content.bytes)
    }

    @Test
    public fun aSharedCredentialExportGoesToThePasswordsImport() {
        val generation = unlocked()
        val export = runBlocking {
            listOf("Почта", "Банк").forEach { title ->
                session.credentials.createCredential(
                    PassmanagerEntryCreateRequest(
                        entryID = UUID.randomUUID().toString(),
                        entryType = "login",
                        secrets = PassmanagerEntryCreateSecrets(password = "synthetic-$title"),
                        title = title,
                    ),
                    generation,
                )
            }
            session.credentials.exportCredentialDocument(generation).also {
                session.credentials.clearCredentials(generation)
            }
        }
        assertEquals(0, titles(generation).size)
        val shared = document("chromvoid-credentials.json", "application/json", export)

        share(Intent(Intent.ACTION_SEND).setType("application/json").putExtra(Intent.EXTRA_STREAM, shared))
        awaitNode(INCOMING_PASSWORDS_TAG)
        rule.onNodeWithTag(INCOMING_PASSWORDS_TAG).performScrollTo().performClick()
        awaitNode(IMPORT_REVIEW_TAG)
        rule.onNodeWithTag(IMPORT_APPLY_TAG).performScrollTo().performClick()
        awaitNode(IMPORT_DONE_TAG)

        assertEquals(listOf("Банк", "Почта"), titles(generation).sorted())
        val files = runBlocking {
            session.files.filePage(CatalogFolderPageRequest(limit = 50, offset = 0, path = "/"), generation).items
        }
        assertEquals(emptyList<String>(), files.map { it.name })
    }

    /** A document of another app's kind: a MediaStore download, read only through the grant a share carries. */
    private fun document(name: String, mimeType: String, bytes: ByteArray): Uri {
        val resolver = rule.activity.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
            put(MediaStore.MediaColumns.RELATIVE_PATH, "Download/ChromVoidAirTest")
        }
        val uri = checkNotNull(resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values))
        documents += uri
        checkNotNull(resolver.openOutputStream(uri)).use { it.write(bytes) }
        return uri
    }

    /** Delivered as another app's share reaches the running app: to the single task, as a new intent. */
    private fun share(intent: Intent) {
        rule.activity.startActivity(
            intent.setClass(rule.activity, MainActivity::class.java).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),
        )
    }

    private fun titles(generation: ULong): List<String> = runBlocking {
        val request = PassmanagerEntryPageRequest(limit = 50L, offset = 0L, query = "")
        session.credentials.credentialPage(request, generation).entries.map { it.title }
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

    private fun awaitText(text: String) {
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            rule.onAllNodes(hasText(text, substring = true), useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()
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
        const val INBOX = "Входящие"
        const val DOCUMENT_BYTES = 96 * 1024
        const val NODE_TIMEOUT_MILLIS = 15_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
