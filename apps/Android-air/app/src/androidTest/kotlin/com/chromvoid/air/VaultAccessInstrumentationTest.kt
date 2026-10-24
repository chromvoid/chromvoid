package com.chromvoid.air

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.chromvoid.air.bridge.AirRuntimeClient
import com.chromvoid.air.bridge.perform
import com.chromvoid.air.bridge.wire.VaultStatusResponse
import com.chromvoid.air.ffi.AirPhase
import com.chromvoid.app.KeystoreBridge
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The real runtime, not the fixture: Core creates and opens a vault on this
 * device's storage, and stores its pepper through the Android keystore it
 * reaches by JNI name. The W1 probe never touched the keystore, so this is the
 * first check that a vault can exist in this client at all.
 *
 * It runs under the development identity on synthetic storage and clears both
 * the storage root and the pepper before and after, so it never inherits or
 * leaves a vault behind.
 */
@RunWith(AndroidJUnit4::class)
public class VaultAccessInstrumentationTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Before
    @After
    public fun forgetEveryVault() {
        context.filesDir.resolve(STORAGE_ROOT).deleteRecursively()
        KeystoreBridge.deletePepper()
    }

    @Test
    public fun aVaultIsCreatedOpenedAndLockedThroughTheAndroidKeystore(): Unit = runBlocking {
        AirRuntimeClient.open(context).use { runtime ->
            assertFalse(runtime.snapshot().masterConfigured)

            runtime.setupAdministrator(ADMINISTRATOR_PASSWORD)
            assertTrue(runtime.snapshot().masterConfigured)

            runtime.unlock(VAULT_PASSWORD)
            assertEquals(AirPhase.UNLOCKED, runtime.snapshot().phase)
            assertNotNull("Core keeps its pepper in the Android keystore", KeystoreBridge.loadPepper())
            // The app reads its phase from the snapshot; Core's own status answers the same.
            assertTrue(runtime.status(AirPhase.UNLOCKED).isUnlocked)

            // Lock answers at once and finishes behind the answer: the
            // contract is that nothing is delivered after it returns, not that
            // the vault is already closed.
            runtime.lock()
            val deadline = System.nanoTime() + LOCK_TIMEOUT_NANOS
            while (runtime.snapshot().phase != AirPhase.LOCKED && System.nanoTime() < deadline) {
                delay(LOCK_POLL_MILLIS)
            }
            assertEquals(AirPhase.LOCKED, runtime.snapshot().phase)
            assertFalse(runtime.status(AirPhase.LOCKED).isUnlocked)
        }
    }

    private suspend fun AirRuntimeClient.status(phase: AirPhase): VaultStatusResponse =
        perform<JsonObject, VaultStatusResponse>("vault:status", JsonObject(emptyMap()), phase, snapshot().generation)

    private companion object {
        const val STORAGE_ROOT = "ChromVoidAir"
        const val ADMINISTRATOR_PASSWORD = "air-instrumentation-administrator"
        const val VAULT_PASSWORD = "air-instrumentation-vault"
        const val LOCK_TIMEOUT_NANOS = 10_000_000_000L
        const val LOCK_POLL_MILLIS = 50L
    }
}
