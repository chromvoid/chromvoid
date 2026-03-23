package com.chromvoid.app.autofill

import android.content.ComponentName
import android.view.autofill.AutofillId
import com.chromvoid.app.shared.AndroidClock
import java.util.concurrent.ConcurrentHashMap

internal interface AutofillSessionStore {
    fun rememberRequestContext(
        sessionKey: String,
        metadata: AutofillSessionMetadata,
        recentFocusedCredentialIds: List<AutofillId>,
    )

    fun markPasswordFilled(
        sessionKey: String,
        metadata: AutofillSessionMetadata,
    )

    fun markOtpResponseShown(
        sessionKey: String,
        metadata: AutofillSessionMetadata,
    )

    fun read(sessionKey: String): AutofillSessionState?

    fun resolveCompatFallbackSession(activityComponent: ComponentName): AutofillSessionState?

    fun clearExpired()

    fun now(): Long
}

internal object AutofillSessionKeys {
    fun create(
        activityComponent: ComponentName?,
        normalizedDomain: String?,
    ): String? {
        if (activityComponent == null && normalizedDomain.isNullOrBlank()) {
            return null
        }
        val activity = activityComponent?.flattenToShortString().orEmpty()
        val domain = normalizedDomain.orEmpty()
        return "activity=$activity|domain=$domain"
    }
}

internal class InMemoryAutofillSessionStore(
    private val clock: AndroidClock,
    private val expiryMs: Long = DEFAULT_EXPIRY_MS,
) : AutofillSessionStore {
    private val sessions = ConcurrentHashMap<String, AutofillSessionState>()

    override fun rememberRequestContext(
        sessionKey: String,
        metadata: AutofillSessionMetadata,
        recentFocusedCredentialIds: List<AutofillId>,
    ) {
        if (sessionKey.isBlank()) {
            return
        }
        clearExpired()
        val now = now()
        val existing = sessions[sessionKey]
        sessions[sessionKey] =
            buildState(
                sessionKey = sessionKey,
                metadata = mergeMetadata(existing, metadata),
                existing = existing,
                now = now,
                recentFocusedCredentialIdKeys = existing
                    ?.recentFocusedCredentialIdKeys
                    ?.plus(AutofillIdKey.from(recentFocusedCredentialIds))
                    ?.toSet()
                    ?: AutofillIdKey.from(recentFocusedCredentialIds),
                lastCredentialContextAtMs =
                    if (recentFocusedCredentialIds.isNotEmpty()) {
                        now
                    } else {
                        existing?.lastCredentialContextAtMs
                    },
                lastSuccessfulPasswordFillAtMs = existing?.lastSuccessfulPasswordFillAtMs,
                lastOtpResponseShownAtMs = existing?.lastOtpResponseShownAtMs,
            )
    }

    override fun markPasswordFilled(
        sessionKey: String,
        metadata: AutofillSessionMetadata,
    ) {
        updateSignal(
            sessionKey = sessionKey,
            metadata = metadata,
            update = { existing, now ->
                existing.copy(
                    lastSuccessfulPasswordFillAtMs = now,
                    updatedAtMs = now,
                )
            },
        )
    }

    override fun markOtpResponseShown(
        sessionKey: String,
        metadata: AutofillSessionMetadata,
    ) {
        updateSignal(
            sessionKey = sessionKey,
            metadata = metadata,
            update = { existing, now ->
                existing.copy(
                    lastOtpResponseShownAtMs = now,
                    updatedAtMs = now,
                )
            },
        )
    }

    override fun read(sessionKey: String): AutofillSessionState? {
        clearExpired()
        return sessions[sessionKey]
    }

    override fun resolveCompatFallbackSession(activityComponent: ComponentName): AutofillSessionState? {
        clearExpired()
        val matching =
            sessions.values.filter { state ->
                state.strategyKind == AutofillStrategyKind.COMPAT &&
                    state.activityComponent == activityComponent &&
                    !state.lastKnownDomain.isNullOrBlank()
            }
        return matching.singleOrNull()
    }

    override fun clearExpired() {
        val now = now()
        sessions.entries.removeIf { (_, value) ->
            now - value.updatedAtMs > expiryMs
        }
    }

    override fun now(): Long = clock.now()

    private fun updateSignal(
        sessionKey: String,
        metadata: AutofillSessionMetadata,
        update: (AutofillSessionState, Long) -> AutofillSessionState,
    ) {
        if (sessionKey.isBlank()) {
            return
        }
        clearExpired()
        val now = now()
        val existing = sessions[sessionKey]
        val mergedMetadata = mergeMetadata(existing, metadata)
        val baseline =
            buildState(
                sessionKey = sessionKey,
                metadata = mergedMetadata,
                existing = existing,
                now = now,
                recentFocusedCredentialIdKeys = existing?.recentFocusedCredentialIdKeys ?: emptySet(),
                lastCredentialContextAtMs = existing?.lastCredentialContextAtMs,
                lastSuccessfulPasswordFillAtMs = existing?.lastSuccessfulPasswordFillAtMs,
                lastOtpResponseShownAtMs = existing?.lastOtpResponseShownAtMs,
            )
        sessions[sessionKey] = update(baseline, now)
    }

    private fun mergeMetadata(
        existing: AutofillSessionState?,
        metadata: AutofillSessionMetadata,
    ): AutofillSessionMetadata {
        return AutofillSessionMetadata(
            activityComponent = metadata.activityComponent ?: existing?.activityComponent,
            normalizedDomain = metadata.normalizedDomain ?: existing?.lastKnownDomain,
            strategyKind =
                if (metadata.strategyKind == AutofillStrategyKind.NATIVE && existing != null) {
                    existing.strategyKind
                } else {
                    metadata.strategyKind
                },
        )
    }

    private fun buildState(
        sessionKey: String,
        metadata: AutofillSessionMetadata,
        existing: AutofillSessionState?,
        now: Long,
        recentFocusedCredentialIdKeys: Set<String>,
        lastCredentialContextAtMs: Long?,
        lastSuccessfulPasswordFillAtMs: Long?,
        lastOtpResponseShownAtMs: Long?,
    ): AutofillSessionState {
        return AutofillSessionState(
            sessionKey = sessionKey,
            activityComponent = metadata.activityComponent ?: existing?.activityComponent,
            strategyKind = metadata.strategyKind,
            lastKnownDomain = metadata.normalizedDomain ?: existing?.lastKnownDomain,
            recentFocusedCredentialIdKeys = recentFocusedCredentialIdKeys,
            lastCredentialContextAtMs = lastCredentialContextAtMs,
            lastSuccessfulPasswordFillAtMs = lastSuccessfulPasswordFillAtMs,
            lastOtpResponseShownAtMs = lastOtpResponseShownAtMs,
            updatedAtMs = now,
        )
    }

    companion object {
        const val DEFAULT_EXPIRY_MS: Long = 5 * 60 * 1000
    }
}
