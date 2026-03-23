package com.chromvoid.app.autofill

import android.content.ComponentName
import android.service.autofill.Dataset
import android.view.autofill.AutofillId
import com.chromvoid.app.credentialprovider.OtpOption

internal data class AutofillOtpCandidate(
    val autofillId: AutofillId,
    val parentPath: String,
    val order: Int,
    val visible: Boolean,
    val fillable: Boolean,
    val focused: Boolean,
)

internal data class AutofillFocusedFieldCandidate(
    val autofillId: AutofillId,
    val parentPath: String,
    val order: Int,
    val visible: Boolean,
    val fillable: Boolean,
    val focused: Boolean,
)

internal enum class AutofillResolvedStepKind {
    PASSWORD,
    OTP,
    UNSUPPORTED,
}

internal enum class ParsedStepKind(val wireValue: String) {
    PASSWORD("password"),
    OTP("otp"),
    UNSUPPORTED("unsupported"),
}

internal enum class AutofillStrategyKind(val wireValue: String) {
    NATIVE("native"),
    COMPAT("compat"),
    ;

    companion object {
        fun fromWireValue(raw: String?): AutofillStrategyKind {
            return entries.firstOrNull { it.wireValue == raw?.trim()?.lowercase() } ?: NATIVE
        }
    }
}

internal data class AutofillStructureSnapshot(
    val webDomain: String?,
    val usernameFieldIds: List<AutofillId>,
    val passwordFieldIds: List<AutofillId>,
    val otpCandidates: List<AutofillOtpCandidate>,
    val focusedFieldCandidates: List<AutofillFocusedFieldCandidate>,
    val pageHintBlobs: List<String>,
)

internal data class AutofillRequestContext(
    val requestId: Int,
    val compatMode: Boolean,
    val activityComponent: ComponentName?,
    val normalizedDomain: String?,
    val focusedId: AutofillId?,
    val previousFocusedIds: List<AutofillId>,
    val usernameFieldIds: List<AutofillId>,
    val passwordFieldIds: List<AutofillId>,
    val otpCandidates: List<AutofillOtpCandidate>,
    val focusedFieldCandidates: List<AutofillFocusedFieldCandidate>,
    val pageHintBlobs: List<String>,
)

internal data class AutofillSessionMetadata(
    val activityComponent: ComponentName? = null,
    val normalizedDomain: String? = null,
    val strategyKind: AutofillStrategyKind = AutofillStrategyKind.NATIVE,
)

internal data class AutofillSessionState(
    val sessionKey: String,
    val activityComponent: ComponentName?,
    val strategyKind: AutofillStrategyKind,
    val lastKnownDomain: String?,
    val recentFocusedCredentialIdKeys: Set<String>,
    val lastCredentialContextAtMs: Long?,
    val lastSuccessfulPasswordFillAtMs: Long?,
    val lastOtpResponseShownAtMs: Long?,
    val updatedAtMs: Long,
)

internal data class ParsedAutofillRequest(
    val origin: String,
    val domain: String,
    val sessionKey: String,
    val strategyKind: AutofillStrategyKind,
    val usernameFieldIds: List<AutofillId>,
    val passwordFieldIds: List<AutofillId>,
    val credentialAnchorFieldIds: List<AutofillId> = usernameFieldIds + passwordFieldIds,
    val otpFieldIds: List<AutofillId>,
    val otpAnchorFieldIds: List<AutofillId> = otpFieldIds,
    val stepKind: ParsedStepKind,
)

internal data class ParsedPasswordSaveRequest(
    val origin: String,
    val domain: String,
    val username: String,
    val password: String,
)

internal data class AutofillAuthArgs(
    val sessionId: String,
    val credentialId: String,
    val domain: String,
    val sessionKey: String,
    val strategyKind: AutofillStrategyKind,
    val usernameIds: List<AutofillId>,
    val passwordIds: List<AutofillId>,
    val otpIds: List<AutofillId>,
    val stepKind: String,
    val otpOptions: List<OtpOption>,
)

internal sealed interface AutofillAuthResult {
    data class Success(
        val dataset: Dataset.Builder,
        val otpValue: String? = null,
    ) : AutofillAuthResult

    data class Cancelled(
        val reason: String,
    ) : AutofillAuthResult
}

internal object AutofillIdKey {
    fun from(autofillId: AutofillId?): String? = autofillId?.toString()?.takeIf { it.isNotBlank() }

    fun from(ids: Iterable<AutofillId>): Set<String> = ids.mapNotNull(::from).toSet()
}
