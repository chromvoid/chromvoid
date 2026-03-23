package com.chromvoid.app.autofill

import android.view.autofill.AutofillId
import com.chromvoid.app.AutofillTrace

internal interface AutofillRequestStrategy {
    val kind: AutofillStrategyKind

    fun supports(context: AutofillRequestContext): Boolean

    fun resolve(
        context: AutofillRequestContext,
        sessionStore: AutofillSessionStore,
    ): ParsedAutofillRequest?
}

internal class AutofillRequestResolver(
    private val strategies: List<AutofillRequestStrategy> = listOf(CompatAutofillStrategy, NativeAutofillStrategy),
) {
    fun resolve(
        context: AutofillRequestContext,
        sessionStore: AutofillSessionStore,
    ): ParsedAutofillRequest? {
        val strategy = strategies.firstOrNull { it.supports(context) } ?: return null
        return strategy.resolve(context, sessionStore)
    }
}

internal object NativeAutofillStrategy : AutofillRequestStrategy {
    override val kind: AutofillStrategyKind = AutofillStrategyKind.NATIVE

    override fun supports(context: AutofillRequestContext): Boolean = !context.compatMode

    override fun resolve(
        context: AutofillRequestContext,
        sessionStore: AutofillSessionStore,
    ): ParsedAutofillRequest? {
        val normalizedDomain =
            context.normalizedDomain ?: run {
                AutofillTrace.important(
                    "nativeResolveFailure",
                    "requestId" to context.requestId,
                    "reason" to "missing_domain",
                    "activity" to context.activityComponent?.flattenToShortString(),
                    "focusedId" to AutofillTrace.id(context.focusedId),
                )
                return null
            }
        val sessionKey =
            AutofillSessionKeys.create(context.activityComponent, normalizedDomain) ?: run {
                AutofillTrace.important(
                    "nativeResolveFailure",
                    "requestId" to context.requestId,
                    "reason" to "missing_session_key",
                    "activity" to context.activityComponent?.flattenToShortString(),
                    "domain" to normalizedDomain,
                )
                return null
            }

        val usernameIds = context.usernameFieldIds.distinct()
        val passwordIds = context.passwordFieldIds.distinct()
        val credentialIds = (usernameIds + passwordIds).distinct()
        val otpFieldIds = AutofillOtpFieldResolver.resolveExplicitOtpFieldIds(context.otpCandidates)
        val stepKind =
            when (AutofillOtpFieldResolver.resolveStepKind(passwordIds, otpFieldIds)) {
                AutofillResolvedStepKind.PASSWORD -> ParsedStepKind.PASSWORD
                AutofillResolvedStepKind.OTP -> ParsedStepKind.OTP
                AutofillResolvedStepKind.UNSUPPORTED -> ParsedStepKind.UNSUPPORTED
            }
        if (stepKind == ParsedStepKind.UNSUPPORTED) {
            AutofillTrace.important(
                "nativeResolveUnsupported",
                "requestId" to context.requestId,
                "domain" to normalizedDomain,
                "focusedId" to AutofillTrace.id(context.focusedId),
                "usernameIds" to AutofillTrace.ids(usernameIds),
                "passwordIds" to AutofillTrace.ids(passwordIds),
                "otpIds" to AutofillTrace.ids(otpFieldIds),
            )
        }

        return ParsedAutofillRequest(
            origin = "https://$normalizedDomain",
            domain = normalizedDomain,
            sessionKey = sessionKey,
            strategyKind = kind,
            usernameFieldIds = if (stepKind == ParsedStepKind.PASSWORD) usernameIds else emptyList(),
            passwordFieldIds = if (stepKind == ParsedStepKind.PASSWORD) passwordIds else emptyList(),
            credentialAnchorFieldIds = if (stepKind == ParsedStepKind.PASSWORD) credentialIds else emptyList(),
            otpFieldIds = if (stepKind == ParsedStepKind.OTP) otpFieldIds else emptyList(),
            otpAnchorFieldIds = if (stepKind == ParsedStepKind.OTP) otpFieldIds else emptyList(),
            stepKind = stepKind,
        )
    }
}

internal object CompatAutofillStrategy : AutofillRequestStrategy {
    override val kind: AutofillStrategyKind = AutofillStrategyKind.COMPAT

    private const val PASSWORD_TO_OTP_WINDOW_MS = 2 * 60 * 1000L
    private const val OTP_PROXY_WINDOW_MS = 30 * 1000L

    override fun supports(context: AutofillRequestContext): Boolean = context.compatMode

    override fun resolve(
        context: AutofillRequestContext,
        sessionStore: AutofillSessionStore,
    ): ParsedAutofillRequest? {
        val directDomain = context.normalizedDomain
        val normalizedDomain =
            resolveDomain(context, sessionStore) ?: run {
                AutofillTrace.important(
                    "compatResolveFailure",
                    "requestId" to context.requestId,
                    "reason" to "missing_domain",
                    "activity" to context.activityComponent?.flattenToShortString(),
                    "focusedId" to AutofillTrace.id(context.focusedId),
                    "previousFocusedIds" to AutofillTrace.ids(context.previousFocusedIds),
                )
                return null
            }
        val sessionKey =
            AutofillSessionKeys.create(context.activityComponent, normalizedDomain) ?: run {
                AutofillTrace.important(
                    "compatResolveFailure",
                    "requestId" to context.requestId,
                    "reason" to "missing_session_key",
                    "activity" to context.activityComponent?.flattenToShortString(),
                    "domain" to normalizedDomain,
                )
                return null
            }
        val sessionState = sessionStore.read(sessionKey)

        val rawCredentialTargetIds =
            resolveCredentialTargetIds(
                focusedAutofillId = context.focusedId,
                usernameFieldIds = context.usernameFieldIds,
                passwordFieldIds = context.passwordFieldIds,
            )
        val credentialIdKeys = AutofillIdKey.from(rawCredentialTargetIds.allIds)
        val focusedIdKey = AutofillIdKey.from(context.focusedId)
        val hasCredentialFields =
            rawCredentialTargetIds.usernameIds.isNotEmpty() || rawCredentialTargetIds.passwordIds.isNotEmpty()
        val hasHistoricalCredentialFocus =
            AutofillIdKey.from(context.previousFocusedIds).any { it in credentialIdKeys } ||
                sessionState
                    ?.recentFocusedCredentialIdKeys
                    ?.any { it in credentialIdKeys }
                    ?: false
        val now = sessionStore.now()
        val hasRecentCredentialContext =
            sessionState?.lastCredentialContextAtMs?.let { now - it <= PASSWORD_TO_OTP_WINDOW_MS } == true
        val hasRecentPasswordFill =
            sessionState?.lastSuccessfulPasswordFillAtMs?.let { now - it <= PASSWORD_TO_OTP_WINDOW_MS } == true
        val hasRecentCredentialSignal =
            hasRecentPasswordFill || hasRecentCredentialContext || hasHistoricalCredentialFocus
        val hasRecentOtpResponse =
            sessionState?.lastOtpResponseShownAtMs?.let { now - it <= OTP_PROXY_WINDOW_MS } == true
        val focusedResolvedAsCredential = focusedIdKey != null && focusedIdKey in credentialIdKeys

        val explicitOtpFieldIds = AutofillOtpFieldResolver.resolveExplicitOtpFieldIds(context.otpCandidates)
        val fallbackOtpFieldIds =
            AutofillOtpFieldResolver.resolveFallbackOtpFieldIds(
                pageHintBlob = context.pageHintBlobs.joinToString(" "),
                focusedFieldCandidates = context.focusedFieldCandidates,
            )
        val postPasswordOtpFieldIds =
            if (explicitOtpFieldIds.isEmpty() &&
                fallbackOtpFieldIds.isEmpty() &&
                !focusedResolvedAsCredential &&
                (!hasCredentialFields || hasHistoricalCredentialFocus) &&
                hasRecentCredentialSignal
            ) {
                AutofillOtpFieldResolver.resolvePostPasswordOtpFieldIds(context.focusedFieldCandidates)
            } else {
                emptyList()
            }

        val baseOtpFieldIds =
            when {
                explicitOtpFieldIds.isNotEmpty() -> explicitOtpFieldIds
                fallbackOtpFieldIds.isNotEmpty() -> fallbackOtpFieldIds
                postPasswordOtpFieldIds.isNotEmpty() -> postPasswordOtpFieldIds
                else -> emptyList()
            }
        val otpTargetIds =
            resolveOtpTargetIds(
                baseOtpFieldIds = baseOtpFieldIds,
                focusedAutofillId = context.focusedId,
                hasCredentialFields = hasCredentialFields,
                hasRecentPasswordSignal = hasRecentCredentialSignal,
                hasRecentOtpResponse = hasRecentOtpResponse,
            )

        val rawStepKind =
            when (AutofillOtpFieldResolver.resolveStepKind(rawCredentialTargetIds.passwordIds, otpTargetIds.fillIds)) {
                AutofillResolvedStepKind.PASSWORD -> ParsedStepKind.PASSWORD
                AutofillResolvedStepKind.OTP -> ParsedStepKind.OTP
                AutofillResolvedStepKind.UNSUPPORTED -> ParsedStepKind.UNSUPPORTED
            }
        // After a recent password fill, GeckoView re-triggers onFillRequest on the same page
        // with a new focused proxy field. Suppress the repeated PASSWORD prompt so the popup
        // doesn't reappear after successful fill. Only suppress when there is historical
        // credential focus (proving the user already interacted with credential fields in this
        // session) — otherwise this might be a legitimate first-time proxy request.
        val stepKind =
            if (rawStepKind == ParsedStepKind.PASSWORD &&
                hasRecentPasswordFill &&
                hasHistoricalCredentialFocus &&
                !focusedResolvedAsCredential &&
                otpTargetIds.fillIds.isEmpty()
            ) {
                ParsedStepKind.UNSUPPORTED
            } else {
                rawStepKind
            }
        val credentialTargetIds =
            if (stepKind == ParsedStepKind.PASSWORD) {
                maybeExtendCredentialFillTargetsForFocusedProxy(
                    targets = rawCredentialTargetIds,
                    focusedAutofillId = context.focusedId,
                    previousFocusedIds = context.previousFocusedIds,
                )
            } else {
                rawCredentialTargetIds
            }
        if (stepKind == ParsedStepKind.UNSUPPORTED) {
            AutofillTrace.important(
                "compatResolveUnsupported",
                "requestId" to context.requestId,
                "domain" to normalizedDomain,
                "focusedId" to AutofillTrace.id(context.focusedId),
                "usernameIds" to AutofillTrace.ids(credentialTargetIds.usernameIds),
                "passwordIds" to AutofillTrace.ids(credentialTargetIds.passwordIds),
                "explicitOtpIds" to AutofillTrace.ids(explicitOtpFieldIds),
                "fallbackOtpIds" to AutofillTrace.ids(fallbackOtpFieldIds),
                "postPasswordOtpIds" to AutofillTrace.ids(postPasswordOtpFieldIds),
                "hasHistoricalCredentialFocus" to hasHistoricalCredentialFocus,
                "hasRecentCredentialContext" to hasRecentCredentialContext,
                "hasRecentPasswordFill" to hasRecentPasswordFill,
                "hasRecentOtpResponse" to hasRecentOtpResponse,
            )
        }

        AutofillTrace.important(
            "compatResolve",
            "requestId" to context.requestId,
            "activity" to context.activityComponent?.flattenToShortString(),
            "domain" to normalizedDomain,
            "usedDomainFallback" to directDomain.isNullOrBlank(),
            "sessionKey" to sessionKey,
            "focusedId" to AutofillTrace.id(context.focusedId),
            "previousFocusedIds" to AutofillTrace.ids(context.previousFocusedIds),
            "usernameIds" to AutofillTrace.ids(credentialTargetIds.usernameIds),
            "passwordIds" to AutofillTrace.ids(credentialTargetIds.passwordIds),
            "credentialAnchorIds" to AutofillTrace.ids(credentialTargetIds.anchorIds),
            "explicitOtpIds" to AutofillTrace.ids(explicitOtpFieldIds),
            "fallbackOtpIds" to AutofillTrace.ids(fallbackOtpFieldIds),
            "postPasswordOtpIds" to AutofillTrace.ids(postPasswordOtpFieldIds),
            "otpFillIds" to AutofillTrace.ids(otpTargetIds.fillIds),
            "otpAnchorIds" to AutofillTrace.ids(otpTargetIds.anchorIds),
            "hasCredentialFields" to hasCredentialFields,
            "hasHistoricalCredentialFocus" to hasHistoricalCredentialFocus,
            "hasRecentCredentialContext" to hasRecentCredentialContext,
            "hasRecentPasswordFill" to hasRecentPasswordFill,
            "hasRecentOtpResponse" to hasRecentOtpResponse,
            "focusedResolvedAsCredential" to focusedResolvedAsCredential,
            "stepKind" to stepKind.wireValue,
        )

        return ParsedAutofillRequest(
            origin = "https://$normalizedDomain",
            domain = normalizedDomain,
            sessionKey = sessionKey,
            strategyKind = kind,
            usernameFieldIds = if (stepKind == ParsedStepKind.PASSWORD) credentialTargetIds.usernameIds else emptyList(),
            passwordFieldIds = if (stepKind == ParsedStepKind.PASSWORD) credentialTargetIds.passwordIds else emptyList(),
            credentialAnchorFieldIds =
                if (stepKind == ParsedStepKind.PASSWORD) {
                    credentialTargetIds.anchorIds
                } else {
                    emptyList()
                },
            otpFieldIds = if (stepKind == ParsedStepKind.OTP) otpTargetIds.fillIds else emptyList(),
            otpAnchorFieldIds = if (stepKind == ParsedStepKind.OTP) otpTargetIds.anchorIds else emptyList(),
            stepKind = stepKind,
        )
    }

    private fun resolveDomain(
        context: AutofillRequestContext,
        sessionStore: AutofillSessionStore,
    ): String? {
        val normalizedDomain = context.normalizedDomain
        if (!normalizedDomain.isNullOrBlank()) {
            return normalizedDomain
        }
        val activityComponent = context.activityComponent ?: return null
        return sessionStore.resolveCompatFallbackSession(activityComponent)?.lastKnownDomain
    }

    private data class CredentialTargetIds(
        val usernameIds: List<AutofillId>,
        val passwordIds: List<AutofillId>,
        val anchorIds: List<AutofillId>,
    ) {
        val allIds: Set<AutofillId> = (usernameIds + passwordIds).toSet()
    }

    private data class OtpTargetIds(
        val fillIds: List<AutofillId>,
        val anchorIds: List<AutofillId>,
    )

    private fun resolveCredentialTargetIds(
        focusedAutofillId: AutofillId?,
        usernameFieldIds: List<AutofillId>,
        passwordFieldIds: List<AutofillId>,
    ): CredentialTargetIds {
        val usernameIds = usernameFieldIds.distinct()
        val passwordIds = passwordFieldIds.distinct()
        val realCredentialIds = (usernameIds + passwordIds).distinct()
        if (realCredentialIds.isEmpty()) {
            return CredentialTargetIds(
                usernameIds = emptyList(),
                passwordIds = emptyList(),
                anchorIds = emptyList(),
            )
        }

        return CredentialTargetIds(
            usernameIds = usernameIds,
            passwordIds = passwordIds,
            anchorIds = focusedAutofillId?.let { listOf(it) } ?: realCredentialIds,
        )
    }

    private fun maybeExtendCredentialFillTargetsForFocusedProxy(
        targets: CredentialTargetIds,
        focusedAutofillId: AutofillId?,
        previousFocusedIds: List<AutofillId>,
    ): CredentialTargetIds {
        if (focusedAutofillId == null || focusedAutofillId in targets.allIds) {
            return targets
        }

        val previousFocusedKeys = AutofillIdKey.from(previousFocusedIds)
        val usernameKeys = AutofillIdKey.from(targets.usernameIds)
        val passwordKeys = AutofillIdKey.from(targets.passwordIds)
        val sawUsernameFocus = previousFocusedKeys.any { it in usernameKeys }
        val sawPasswordFocus = previousFocusedKeys.any { it in passwordKeys }

        val extendedUsernameIds =
            if (sawPasswordFocus && !sawUsernameFocus) {
                (targets.usernameIds + focusedAutofillId).distinct()
            } else {
                targets.usernameIds
            }
        val extendedPasswordIds =
            if (sawUsernameFocus && !sawPasswordFocus) {
                (targets.passwordIds + focusedAutofillId).distinct()
            } else {
                targets.passwordIds
            }

        return CredentialTargetIds(
            usernameIds = extendedUsernameIds,
            passwordIds = extendedPasswordIds,
            anchorIds = listOf(focusedAutofillId),
        )
    }

    private fun resolveOtpTargetIds(
        baseOtpFieldIds: List<AutofillId>,
        focusedAutofillId: AutofillId?,
        hasCredentialFields: Boolean,
        hasRecentPasswordSignal: Boolean,
        hasRecentOtpResponse: Boolean,
    ): OtpTargetIds {
        if (baseOtpFieldIds.isEmpty()) {
            if (focusedAutofillId == null || hasCredentialFields) {
                return OtpTargetIds(fillIds = emptyList(), anchorIds = emptyList())
            }
            if (!hasRecentPasswordSignal && !hasRecentOtpResponse) {
                return OtpTargetIds(fillIds = emptyList(), anchorIds = emptyList())
            }
            return OtpTargetIds(
                fillIds = listOf(focusedAutofillId),
                anchorIds = listOf(focusedAutofillId),
            )
        }

        if (focusedAutofillId == null) {
            return OtpTargetIds(fillIds = baseOtpFieldIds, anchorIds = baseOtpFieldIds)
        }
        if (baseOtpFieldIds.any { it == focusedAutofillId }) {
            return OtpTargetIds(fillIds = baseOtpFieldIds, anchorIds = baseOtpFieldIds)
        }
        if (!hasRecentPasswordSignal && !hasRecentOtpResponse) {
            return OtpTargetIds(fillIds = baseOtpFieldIds, anchorIds = baseOtpFieldIds)
        }
        return OtpTargetIds(
            fillIds = (baseOtpFieldIds + focusedAutofillId).distinct(),
            anchorIds = listOf(focusedAutofillId),
        )
    }
}
