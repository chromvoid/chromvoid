package com.chromvoid.app.autofill

import android.view.autofill.AutofillId
import com.chromvoid.app.AutofillTrace

internal object AutofillOtpFieldResolver {
    fun resolveStepKind(passwordFieldIds: List<AutofillId>, otpFieldIds: List<AutofillId>): AutofillResolvedStepKind {
        if (otpFieldIds.isNotEmpty()) {
            return AutofillResolvedStepKind.OTP
        }
        return when {
            passwordFieldIds.isNotEmpty() -> AutofillResolvedStepKind.PASSWORD
            else -> AutofillResolvedStepKind.UNSUPPORTED
        }
    }

    fun resolveExplicitOtpFieldIds(otpCandidates: List<AutofillOtpCandidate>): List<AutofillId> {
        if (otpCandidates.isEmpty()) {
            AutofillTrace.important("otpExplicitResolve", "reason" to "no_candidates")
            return emptyList()
        }

        val activeCandidates = otpCandidates.filter { (it.visible && it.fillable) || it.focused }
        if (activeCandidates.isEmpty()) {
            AutofillTrace.important(
                "otpExplicitResolve",
                "reason" to "no_active_candidates",
                "candidates" to AutofillTrace.otpCandidates(otpCandidates),
            )
            return emptyList()
        }

        val visibleFillableCandidates = activeCandidates.filter { it.visible && it.fillable }
        val primaryCandidate =
            visibleFillableCandidates.firstOrNull { it.focused }
                ?: visibleFillableCandidates.minByOrNull { it.order }
                ?: activeCandidates.firstOrNull { it.focused }
                ?: activeCandidates.minByOrNull { it.order }
                ?: run {
                    AutofillTrace.important(
                        "otpExplicitResolve",
                        "reason" to "missing_primary_candidate",
                        "activeCandidates" to AutofillTrace.otpCandidates(activeCandidates),
                    )
                    return emptyList()
                }

        val contextualCandidates = activeCandidates.filter { it.parentPath == primaryCandidate.parentPath }
        val selectedCandidates =
            if (contextualCandidates.isNotEmpty()) {
                contextualCandidates
            } else {
                listOf(primaryCandidate)
            }

        val resolvedIds =
            selectedCandidates
            .sortedWith(compareByDescending<AutofillOtpCandidate> { it.focused }.thenBy { it.order })
            .map { it.autofillId }
            .distinct()
        AutofillTrace.important(
            "otpExplicitResolve",
            "candidateCount" to otpCandidates.size,
            "activeCount" to activeCandidates.size,
            "primaryId" to AutofillTrace.id(primaryCandidate.autofillId),
            "primaryParentPath" to primaryCandidate.parentPath,
            "selectedIds" to AutofillTrace.ids(resolvedIds),
            "candidates" to AutofillTrace.otpCandidates(otpCandidates),
        )
        return resolvedIds
    }

    fun resolveFallbackOtpFieldIds(
        pageHintBlob: String,
        focusedFieldCandidates: List<AutofillFocusedFieldCandidate>,
    ): List<AutofillId> {
        val looksLikeOtpContext = pageLooksLikeOtpContext(pageHintBlob)
        if (!looksLikeOtpContext || focusedFieldCandidates.isEmpty()) {
            AutofillTrace.important(
                "otpFallbackResolve",
                "reason" to if (!looksLikeOtpContext) "page_not_otp" else "no_focused_candidates",
                "pageLooksLikeOtpContext" to looksLikeOtpContext,
                "focusedCandidates" to AutofillTrace.focusedCandidates(focusedFieldCandidates),
                "pageHints" to AutofillTrace.pageHints(listOf(pageHintBlob)),
            )
            return emptyList()
        }

        val visibleFillableCandidates = focusedFieldCandidates.filter { it.visible && it.fillable }
        val primaryCandidate =
            visibleFillableCandidates.firstOrNull { it.focused }
                ?: focusedFieldCandidates.firstOrNull { it.focused }
                ?: run {
                    AutofillTrace.important(
                        "otpFallbackResolve",
                        "reason" to "missing_primary_candidate",
                        "focusedCandidates" to AutofillTrace.focusedCandidates(focusedFieldCandidates),
                    )
                    return emptyList()
                }

        val contextualCandidates = visibleFillableCandidates.filter { it.parentPath == primaryCandidate.parentPath }
        val selectedCandidates =
            if (contextualCandidates.isNotEmpty()) {
                contextualCandidates
            } else {
                listOf(primaryCandidate)
            }

        val resolvedIds =
            selectedCandidates
            .sortedWith(compareByDescending<AutofillFocusedFieldCandidate> { it.focused }.thenBy { it.order })
            .map { it.autofillId }
            .distinct()
        AutofillTrace.important(
            "otpFallbackResolve",
            "pageLooksLikeOtpContext" to looksLikeOtpContext,
            "primaryId" to AutofillTrace.id(primaryCandidate.autofillId),
            "primaryParentPath" to primaryCandidate.parentPath,
            "selectedIds" to AutofillTrace.ids(resolvedIds),
            "focusedCandidates" to AutofillTrace.focusedCandidates(focusedFieldCandidates),
            "pageHints" to AutofillTrace.pageHints(listOf(pageHintBlob)),
        )
        return resolvedIds
    }

    fun resolvePostPasswordOtpFieldIds(focusedFieldCandidates: List<AutofillFocusedFieldCandidate>): List<AutofillId> {
        if (focusedFieldCandidates.isEmpty()) {
            AutofillTrace.important("otpPostPasswordResolve", "reason" to "no_focused_candidates")
            return emptyList()
        }

        val visibleFillableCandidates = focusedFieldCandidates.filter { it.visible && it.fillable }
        val primaryCandidate =
            visibleFillableCandidates.firstOrNull { it.focused }
                ?: focusedFieldCandidates.firstOrNull { it.focused }
                ?: visibleFillableCandidates.singleOrNull()
                ?: run {
                    AutofillTrace.important(
                        "otpPostPasswordResolve",
                        "reason" to "missing_primary_candidate",
                        "focusedCandidates" to AutofillTrace.focusedCandidates(focusedFieldCandidates),
                    )
                    return emptyList()
                }

        val contextualCandidates = visibleFillableCandidates.filter { it.parentPath == primaryCandidate.parentPath }
        val selectedCandidates =
            if (contextualCandidates.isNotEmpty()) {
                contextualCandidates
            } else {
                listOf(primaryCandidate)
            }

        if (selectedCandidates.size > 8) {
            AutofillTrace.important(
                "otpPostPasswordResolve",
                "reason" to "too_many_candidates",
                "candidateCount" to selectedCandidates.size,
                "focusedCandidates" to AutofillTrace.focusedCandidates(focusedFieldCandidates),
            )
            return emptyList()
        }

        val resolvedIds =
            selectedCandidates
            .sortedWith(compareByDescending<AutofillFocusedFieldCandidate> { it.focused }.thenBy { it.order })
            .map { it.autofillId }
            .distinct()
        AutofillTrace.important(
            "otpPostPasswordResolve",
            "primaryId" to AutofillTrace.id(primaryCandidate.autofillId),
            "primaryParentPath" to primaryCandidate.parentPath,
            "selectedIds" to AutofillTrace.ids(resolvedIds),
            "focusedCandidates" to AutofillTrace.focusedCandidates(focusedFieldCandidates),
        )
        return resolvedIds
    }

    fun pageLooksLikeOtpContext(pageHintBlob: String): Boolean {
        val normalized = pageHintBlob.lowercase()
        return "one-time-code" in normalized ||
            "one time code" in normalized ||
            "otp" in normalized ||
            "totp" in normalized ||
            "2fa" in normalized ||
            "verification code" in normalized ||
            "auth code" in normalized ||
            "two-factor authentication" in normalized ||
            "two factor authentication" in normalized ||
            "authenticator app" in normalized
    }
}
