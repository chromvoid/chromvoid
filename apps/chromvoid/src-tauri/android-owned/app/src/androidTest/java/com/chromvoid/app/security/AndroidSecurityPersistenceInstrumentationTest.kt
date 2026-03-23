package com.chromvoid.app.security

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.app.PasskeyMetadata
import com.chromvoid.app.PendingPasskeyRequest
import com.chromvoid.app.main.DefaultPasswordSaveRequestStore
import com.chromvoid.app.passkey.PersistentPasskeyRequestRegistry
import com.chromvoid.app.shared.AndroidClock
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AndroidSecurityPersistenceInstrumentationTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val pepperStore = SystemPepperStore(context)
    private val metadataStore = SystemPasskeyMetadataStore(context)
    private val clock = MutableClock()

    @After
    fun tearDown() {
        pepperStore.deletePepper()
        metadataStore.clearForTests()
        PersistentPasskeyRequestRegistry(context, clock).clear()
        DefaultPasswordSaveRequestStore(context, clock).clear()
    }

    @Test
    fun pepperStore_roundTripsOnDeviceRuntime() {
        pepperStore.storePepper(byteArrayOf(1, 2, 3, 4))

        assertArrayEquals(byteArrayOf(1, 2, 3, 4), pepperStore.loadPepper())
    }

    @Test
    fun passkeyMetadataStore_roundTripsOnDeviceRuntime() {
        val metadata =
            PasskeyMetadata(
                credentialIdB64Url = "cred-device-1",
                rpId = "example.com",
                userIdB64Url = "user-device-1",
                userName = "alice@example.com",
                userDisplayName = "Alice",
                keyAlias = "chromvoid.passkey.cred-device-1",
                signCount = 1,
                createdAtEpochMs = 10L,
                lastUsedEpochMs = 20L,
            )

        metadataStore.saveNew(metadata)

        assertEquals(metadata, metadataStore.findByCredentialId("cred-device-1"))
    }

    @Test
    fun persistentPasskeyRequestRegistry_persistsAcrossInstances() {
        val first = PersistentPasskeyRequestRegistry(context, clock)
        first.put(PendingPasskeyRequest("req-device-1", "get", "example.com", createdAtEpochMs = 100L))

        val second = PersistentPasskeyRequestRegistry(context, clock)

        assertNotNull(second.get("req-device-1"))
        assertEquals("example.com", second.get("req-device-1")?.rpId)
    }

    @Test
    fun passwordSaveRequestStore_persistsAcrossInstances() {
        val first = DefaultPasswordSaveRequestStore(context, clock)
        first.stage("token-device-1")

        val second = DefaultPasswordSaveRequestStore(context, clock)

        assertEquals("token-device-1", second.current()?.token)
        assertNull(second.remove("missing-token"))
    }

    @Test
    fun persistentPasskeyRequestRegistry_cleansExpiredEntriesAcrossInstances() {
        val first = PersistentPasskeyRequestRegistry(context, clock, expiryMs = 100L)
        first.put(PendingPasskeyRequest("req-device-expired", "create", "example.com", createdAtEpochMs = clock.now()))

        clock.nowMs += 101L

        val second = PersistentPasskeyRequestRegistry(context, clock, expiryMs = 100L)

        assertNull(second.get("req-device-expired"))
        assertEquals(emptyList<PendingPasskeyRequest>(), second.values())
    }

    @Test
    fun passwordSaveRequestStore_returnsMostRecentTokenAndExpiresOldEntries() {
        val first = DefaultPasswordSaveRequestStore(context, clock, expiryMs = 100L)
        first.stage("token-device-1")
        clock.nowMs += 10L
        first.stage("token-device-2")

        val second = DefaultPasswordSaveRequestStore(context, clock, expiryMs = 100L)
        assertEquals("token-device-2", second.current()?.token)
        assertEquals("token-device-2", second.remove("token-device-2")?.token)
        assertEquals("token-device-1", second.current()?.token)

        clock.nowMs += 101L

        val expired = DefaultPasswordSaveRequestStore(context, clock, expiryMs = 100L)
        assertNull(expired.current())
        assertNull(expired.remove("token-device-1"))
    }

    private class MutableClock(
        var nowMs: Long = 1_000L,
    ) : AndroidClock {
        override fun now(): Long = nowMs
    }
}
