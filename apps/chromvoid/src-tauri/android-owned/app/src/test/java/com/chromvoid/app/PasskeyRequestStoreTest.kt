package com.chromvoid.app

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.app.passkey.PersistentPasskeyRequestRegistry
import com.chromvoid.app.shared.AndroidClock
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PasskeyRequestStoreTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val clock = MutableClock()

    @After
    fun tearDown() {
        PersistentPasskeyRequestRegistry(context, clock).clear()
    }

    @Test
    fun persistedRegistry_survivesRecreation() {
        val first = PersistentPasskeyRequestRegistry(context, clock)
        val request = PendingPasskeyRequest(requestId = "req-1", command = "get", rpId = "example.com", createdAtEpochMs = clock.now())

        first.put(request)

        val recreated = PersistentPasskeyRequestRegistry(context, clock)
        assertEquals(request, recreated.get("req-1"))
    }

    @Test
    fun expiredEntries_areCleanedOnRead() {
        val registry = PersistentPasskeyRequestRegistry(context, clock)
        registry.put(PendingPasskeyRequest(requestId = "req-expired", command = "create", rpId = "example.org", createdAtEpochMs = clock.now()))

        clock.nowMs += 6 * 60 * 1000

        assertNull(registry.get("req-expired"))
        assertEquals(emptyList<PendingPasskeyRequest>(), registry.values())
    }

    private class MutableClock(
        var nowMs: Long = 1_000L,
    ) : AndroidClock {
        override fun now(): Long = nowMs
    }
}
