package com.chromvoid.air

import android.graphics.Bitmap
import android.graphics.Color
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.lifecycle.ViewModelProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateSecrets
import com.chromvoid.air.bridge.wire.PassmanagerEntryPageRequest
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.ShellViewModel
import com.chromvoid.air.ui.credentials.CATALOG_TOOLS_TAG
import com.chromvoid.air.ui.credentials.CATALOG_CLEAR_TAG
import com.chromvoid.air.ui.credentials.CATALOG_IMPORT_TAG
import com.chromvoid.air.ui.credentials.entryIconTag
import com.chromvoid.air.ui.transfer.TRANSFER_BACK_TAG
import com.chromvoid.air.ui.transfer.IMPORT_CHOOSE_TAG
import com.chromvoid.air.ui.transfer.CLEAR_CONFIRM_TAG
import com.chromvoid.air.ui.transfer.CLEAR_DONE_TAG
import com.chromvoid.air.ui.transfer.CLEAR_TAG
import com.chromvoid.air.ui.transfer.IMPORT_APPLY_TAG
import com.chromvoid.air.ui.transfer.IMPORT_DONE_TAG
import com.chromvoid.air.ui.transfer.IMPORT_REVIEW_TAG
import com.chromvoid.air.ui.transfer.ImportSource
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import java.util.Base64
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Routes A14/A15 against real Core through the transfer page: the vault is
 * exported, cleared after a confirmation, and the exported file is reviewed
 * and imported back. The system document pickers are not driven; the chosen
 * file is handed to the import as the picker would hand it.
 */
@RunWith(AndroidJUnit4::class)
public class TransferRouteInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun theVaultIsExportedClearedAndImportedBack() {
        val generation = unlocked()
        runBlocking {
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
        }
        val document = runBlocking { session.credentials.exportCredentialDocument(generation) }

        awaitNode(CATALOG_TOOLS_TAG)
        rule.onNodeWithTag(CATALOG_TOOLS_TAG).performClick()
        awaitNode(CATALOG_CLEAR_TAG)
        rule.onNodeWithTag(CATALOG_CLEAR_TAG).performClick()
        awaitNode(CLEAR_TAG)
        rule.onNodeWithTag(CLEAR_TAG).performScrollTo().performClick()
        awaitNode(CLEAR_CONFIRM_TAG)
        rule.onNodeWithTag(CLEAR_CONFIRM_TAG).performClick()
        awaitNode(CLEAR_DONE_TAG)
        assertEquals(0, titles(generation).size)
        rule.onNodeWithTag(TRANSFER_BACK_TAG).performClick()
        importDocument(document)
        assertEquals(listOf("Банк", "Почта"), titles(generation).sorted())
    }

    /** An imported login keeps its icon, and the catalog draws it from the vault. */
    @Test
    public fun anImportedLoginShowsItsStoredIcon() {
        unlocked()
        val png = ByteArrayOutputStream().use { out ->
            Bitmap.createBitmap(ICON_EDGE, ICON_EDGE, Bitmap.Config.ARGB_8888)
                .apply { eraseColor(Color.rgb(0x1A, 0x7F, 0xB0)) }
                .compress(Bitmap.CompressFormat.PNG, 100, out)
            out.toByteArray()
        }
        val encoded = Base64.getEncoder().encodeToString(png)
        val ref = "sha256:" + MessageDigest.getInstance("SHA-256").digest(png).joinToString("") { "%02x".format(it) }
        val document = """
            {"folders":[],
             "entries":[{"id":"with-icon","title":"С иконкой","icon_ref":"$ref","password":"synthetic"}],
             "icons":[{"content_base64":"$encoded","mime_type":"image/png","icon_ref":"$ref"}]}
        """.trimIndent().toByteArray()

        importDocument(document)
        rule.onNodeWithTag(TRANSFER_BACK_TAG).performClick()

        // The vault root reads the icon from the vault and draws it on the record's row.
        awaitNode(entryIconTag(ref))
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

    /** Imports [document] through Tools → Import, handed over as the system picker would. */
    private fun importDocument(document: ByteArray) {
        awaitNode(CATALOG_TOOLS_TAG)
        rule.onNodeWithTag(CATALOG_TOOLS_TAG).performClick()
        awaitNode(CATALOG_IMPORT_TAG)
        rule.onNodeWithTag(CATALOG_IMPORT_TAG).performClick()
        awaitNode(IMPORT_CHOOSE_TAG)
        val tools = ViewModelProvider(rule.activity)[ShellViewModel::class.java].vault.value!!.transfers.value!!
        rule.runOnUiThread {
            tools.import.fileChosen(
                object : ImportSource {
                    override val name = "chromvoid-credentials.json"

                    override fun open() = ByteArrayInputStream(document)
                },
            )
        }
        awaitNode(IMPORT_REVIEW_TAG)
        rule.onNodeWithTag(IMPORT_APPLY_TAG).performScrollTo().performClick()
        awaitNode(IMPORT_DONE_TAG)
    }

    private fun titles(generation: ULong): List<String> = runBlocking {
        val request = PassmanagerEntryPageRequest(limit = 50L, offset = 0L, query = "")
        session.credentials.credentialPage(request, generation).entries.map { it.title }
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
        const val NODE_TIMEOUT_MILLIS = 20_000L
        const val ICON_EDGE = 32
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
