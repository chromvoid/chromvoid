package com.chromvoid.app

import android.content.ComponentName
import android.view.View
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.app.autofill.AutofillSessionKeys
import com.chromvoid.app.autofill.AutofillSessionMetadata
import com.chromvoid.app.autofill.AutofillStrategyKind
import com.chromvoid.app.autofill.InMemoryAutofillSessionStore
import com.chromvoid.app.shared.AndroidClock
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AutofillSessionStoreTest {
    @Test
    fun marksAndReadsPasswordAndOtpSignals_forSameSession() {
        val clock = MutableClock()
        val store = InMemoryAutofillSessionStore(clock)
        val activityComponent = ComponentName("org.mozilla.firefox", "org.mozilla.fenix.App")
        val sessionKey = AutofillSessionKeys.create(activityComponent, "github.com")!!
        val credentialId = View(ApplicationProvider.getApplicationContext<android.content.Context>()).autofillId

        store.rememberRequestContext(
            sessionKey = sessionKey,
            metadata =
                AutofillSessionMetadata(
                    activityComponent = activityComponent,
                    normalizedDomain = "github.com",
                    strategyKind = AutofillStrategyKind.COMPAT,
                ),
            recentFocusedCredentialIds = listOf(credentialId),
        )
        store.markPasswordFilled(
            sessionKey = sessionKey,
            metadata = AutofillSessionMetadata(normalizedDomain = "github.com", strategyKind = AutofillStrategyKind.COMPAT),
        )
        clock.nowMs += 5_000
        store.markOtpResponseShown(
            sessionKey = sessionKey,
            metadata = AutofillSessionMetadata(normalizedDomain = "github.com", strategyKind = AutofillStrategyKind.COMPAT),
        )

        val state = store.read(sessionKey)
        assertNotNull(state)
        assertEquals("github.com", state!!.lastKnownDomain)
        assertTrue(credentialId.toString() in state.recentFocusedCredentialIdKeys)
        assertEquals(1_000L, state.lastCredentialContextAtMs)
        assertEquals(1_000L, state.lastSuccessfulPasswordFillAtMs)
        assertEquals(6_000L, state.lastOtpResponseShownAtMs)
    }

    @Test
    fun resolveCompatFallbackSession_returnsOnlySingleActiveSessionForActivity() {
        val clock = MutableClock()
        val store = InMemoryAutofillSessionStore(clock)
        val activityComponent = ComponentName("org.mozilla.firefox", "org.mozilla.fenix.App")

        val githubKey = AutofillSessionKeys.create(activityComponent, "github.com")!!
        store.rememberRequestContext(
            sessionKey = githubKey,
            metadata =
                AutofillSessionMetadata(
                    activityComponent = activityComponent,
                    normalizedDomain = "github.com",
                    strategyKind = AutofillStrategyKind.COMPAT,
                ),
            recentFocusedCredentialIds = emptyList(),
        )

        assertEquals("github.com", store.resolveCompatFallbackSession(activityComponent)?.lastKnownDomain)

        val gitlabKey = AutofillSessionKeys.create(activityComponent, "gitlab.com")!!
        store.rememberRequestContext(
            sessionKey = gitlabKey,
            metadata =
                AutofillSessionMetadata(
                    activityComponent = activityComponent,
                    normalizedDomain = "gitlab.com",
                    strategyKind = AutofillStrategyKind.COMPAT,
                ),
            recentFocusedCredentialIds = emptyList(),
        )

        assertNull(store.resolveCompatFallbackSession(activityComponent))
    }

    @Test
    fun clearExpired_removesStaleSessions() {
        val clock = MutableClock()
        val store = InMemoryAutofillSessionStore(clock, expiryMs = 1_000L)
        val activityComponent = ComponentName("org.mozilla.firefox", "org.mozilla.fenix.App")
        val sessionKey = AutofillSessionKeys.create(activityComponent, "github.com")!!

        store.rememberRequestContext(
            sessionKey = sessionKey,
            metadata =
                AutofillSessionMetadata(
                    activityComponent = activityComponent,
                    normalizedDomain = "github.com",
                    strategyKind = AutofillStrategyKind.COMPAT,
                ),
            recentFocusedCredentialIds = emptyList(),
        )

        clock.nowMs += 1_001L
        store.clearExpired()

        assertNull(store.read(sessionKey))
    }

    private class MutableClock(
        var nowMs: Long = 1_000L,
    ) : AndroidClock {
        override fun now(): Long = nowMs
    }
}
