package com.chromvoid.air

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.chromvoid.air.bridge.AirRuntimeClient
import com.chromvoid.air.bridge.perform
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateSecrets
import com.chromvoid.air.bridge.wire.PassmanagerEntryPageRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryPageResponse
import com.chromvoid.air.bridge.wire.PassmanagerEntrySaveResponse
import com.chromvoid.air.ffi.AirImportMode
import com.chromvoid.air.ffi.AirPhase
import com.chromvoid.app.KeystoreBridge
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The typed bridge against real Core: a credential is created with a generated
 * request, the vault's credentials are exported, cleared and imported back
 * through the Rust-owned import buffer, and the catalog reads the same entry
 * again. Nothing here decodes a reply by hand.
 */
@RunWith(AndroidJUnit4::class)
public class CredentialTransferInstrumentationTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Before
    @After
    public fun forgetEveryVault() {
        context.filesDir.resolve(STORAGE_ROOT).deleteRecursively()
        KeystoreBridge.deletePepper()
    }

    @Test
    public fun credentialsSurviveExportClearAndReviewedImport(): Unit = runBlocking {
        AirRuntimeClient.open(context).use { runtime ->
            runtime.setupAdministrator(ADMINISTRATOR_PASSWORD)
            runtime.unlock(VAULT_PASSWORD)
            val generation = runtime.snapshot().generation

            val created = runtime.perform<PassmanagerEntryCreateRequest, PassmanagerEntrySaveResponse>(
                "passmanager:entry:create",
                PassmanagerEntryCreateRequest(
                    entryID = UUID.randomUUID().toString(),
                    entryType = "login",
                    secrets = PassmanagerEntryCreateSecrets(password = "synthetic-secret"),
                    title = TITLE,
                    username = "alice",
                ),
                AirPhase.UNLOCKED,
                generation,
            )
            assertTrue(created.entryID.isNotEmpty())
            assertEquals(listOf(TITLE), runtime.titles(generation))

            val document = runtime.exportCredentialDocument(generation)
            assertTrue("the export carries the credential", document.isNotEmpty())

            runtime.clearCredentials(generation)
            assertEquals(emptyList<String>(), runtime.titles(generation))

            val limits = runtime.credentialImportLimits()
            val transfer = runtime.beginCredentialImport(document.size.toULong(), AirImportMode.MERGE, generation)
            val chunk = limits.chunkBytes.toInt()
            var offset = 0
            while (offset < document.size) {
                val end = minOf(offset + chunk, document.size)
                transfer.append(document.copyOfRange(offset, end))
                offset = end
            }
            val preview = transfer.review()
            assertEquals(1L, preview.entryCount)
            transfer.commit()

            assertEquals(listOf(TITLE), runtime.titles(generation))
        }
    }

    private suspend fun AirRuntimeClient.titles(generation: ULong): List<String> =
        perform<PassmanagerEntryPageRequest, PassmanagerEntryPageResponse>(
            "passmanager:entry:page",
            PassmanagerEntryPageRequest(limit = 50, offset = 0, query = ""),
            AirPhase.UNLOCKED,
            generation,
        ).entries.map { it.title }

    private companion object {
        const val STORAGE_ROOT = "ChromVoidAir"
        const val ADMINISTRATOR_PASSWORD = "air-instrumentation-administrator"
        const val VAULT_PASSWORD = "air-instrumentation-vault"
        const val TITLE = "Синтетическая почта"
    }
}
