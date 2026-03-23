package com.chromvoid.app

import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.FillCallback
import android.service.autofill.FillContext
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.SaveCallback
import android.service.autofill.SaveRequest
import com.chromvoid.app.autofill.AutofillFieldClassifier
import com.chromvoid.app.autofill.AutofillDatasetFactory
import com.chromvoid.app.autofill.AutofillRequestContext
import com.chromvoid.app.autofill.AutofillRequestResolver
import com.chromvoid.app.autofill.AutofillSessionMetadata
import com.chromvoid.app.autofill.AutofillStructureParser
import com.chromvoid.app.autofill.ParsedAutofillRequest
import com.chromvoid.app.autofill.ParsedPasswordSaveRequest
import com.chromvoid.app.autofill.ParsedStepKind
import com.chromvoid.app.autofill.PasswordSaveLauncher
import com.chromvoid.app.credentialprovider.BridgeResult

class ChromVoidAutofillService : AutofillService() {
    override fun onFillRequest(
        request: FillRequest,
        cancellationSignal: CancellationSignal,
        callback: FillCallback,
    ) {
        if (cancellationSignal.isCanceled) {
            return
        }

        val appGraph = applicationContext.androidAppGraph()
        val bridgeGateway = appGraph.bridgeGateway
        AutofillTrace.important(
            "onFillRequest",
            "requestId" to request.id,
            "flags" to request.flags,
            "compat" to (request.flags and FillRequest.FLAG_COMPATIBILITY_MODE_REQUEST != 0),
            "contexts" to request.fillContexts.size,
        )
        if (!bridgeGateway.runtimeReady()) {
            AutofillTrace.important("fillFailure", "reason" to "runtime_not_ready")
            callback.onFailure(getString(R.string.autofill_runtime_not_ready))
            return
        }

        val requestContext = parseRequestContext(request)
        if (requestContext == null) {
            AutofillTrace.important("fillFailure", "reason" to "missing_request_context", "requestId" to request.id)
            callback.onFailure(getString(R.string.autofill_unsupported_request))
            return
        }

        AutofillTrace.important(
            "requestContext",
            "requestId" to requestContext.requestId,
            "compat" to requestContext.compatMode,
            "activity" to requestContext.activityComponent?.flattenToShortString(),
            "domain" to requestContext.normalizedDomain,
            "focusedId" to AutofillTrace.id(requestContext.focusedId),
            "previousFocusedIds" to AutofillTrace.ids(requestContext.previousFocusedIds),
        )

        val parsed = AutofillRequestResolver().resolve(requestContext, appGraph.autofillSessionStore)
        if (parsed == null || parsed.stepKind == ParsedStepKind.UNSUPPORTED) {
            AutofillTrace.important(
                "fillFailure",
                "reason" to "unsupported_request",
                "requestId" to request.id,
                "activity" to requestContext.activityComponent?.flattenToShortString(),
            )
            callback.onFailure(getString(R.string.autofill_unsupported_request))
            return
        }

        appGraph.autofillSessionStore.rememberRequestContext(
            sessionKey = parsed.sessionKey,
            metadata =
                AutofillSessionMetadata(
                    activityComponent = requestContext.activityComponent,
                    normalizedDomain = parsed.domain,
                    strategyKind = parsed.strategyKind,
                ),
            recentFocusedCredentialIds =
                if (parsed.stepKind == ParsedStepKind.PASSWORD) {
                    parsed.usernameFieldIds + parsed.passwordFieldIds
                } else {
                    emptyList()
                },
        )

        AutofillTrace.important(
            "fillParsed",
            "requestId" to requestContext.requestId,
            "domain" to parsed.domain,
            "strategy" to parsed.strategyKind.wireValue,
            "sessionKey" to parsed.sessionKey,
            "stepKind" to parsed.stepKind.wireValue,
            "usernameIds" to AutofillTrace.ids(parsed.usernameFieldIds),
            "passwordIds" to AutofillTrace.ids(parsed.passwordFieldIds),
            "credentialAnchorIds" to AutofillTrace.ids(parsed.credentialAnchorFieldIds),
            "otpIds" to AutofillTrace.ids(parsed.otpFieldIds),
            "otpAnchorIds" to AutofillTrace.ids(parsed.otpAnchorFieldIds),
        )

        when (val response = bridgeGateway.autofillList(parsed.origin, parsed.domain)) {
            is BridgeResult.Failure -> {
                AutofillTrace.important(
                    "fillFailure",
                    "reason" to "autofill_list_failed",
                    "domain" to parsed.domain,
                    "message" to response.error.message,
                )
                callback.onFailure(response.error.message)
            }
            is BridgeResult.Success -> {
                val sessionId = response.value.first
                val candidates = response.value.second
                AutofillTrace.important(
                    "fillCandidates",
                    "requestId" to requestContext.requestId,
                    "domain" to parsed.domain,
                    "strategy" to parsed.strategyKind.wireValue,
                    "sessionKey" to parsed.sessionKey,
                    "stepKind" to parsed.stepKind.wireValue,
                    "session" to sessionId,
                    "count" to candidates.size,
                )
                if (sessionId.isBlank() || candidates.isEmpty()) {
                    AutofillTrace.event(
                        "fillEmpty",
                        "domain" to parsed.domain,
                        "usernameFields" to parsed.usernameFieldIds.size,
                        "passwordFields" to parsed.passwordFieldIds.size,
                    )
                    callback.onSuccess(null)
                    return
                }

                val datasetFactory = AutofillDatasetFactory(this)
                val fillResponse = FillResponse.Builder()
                var addedDatasets = 0
                candidates.forEach { candidate ->
                    if (parsed.stepKind == ParsedStepKind.OTP && candidate.otpOptions.isEmpty()) {
                        return@forEach
                    }
                    fillResponse.addDataset(
                        datasetFactory.buildAuthenticatedDataset(
                            parsed = parsed,
                            sessionId = sessionId,
                            candidate = candidate,
                        ),
                    )
                    addedDatasets += 1
                }
                datasetFactory.maybeConfigureFillDialog(fillResponse, parsed)
                callback.onSuccess(fillResponse.build())
            }
        }
    }

    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        val parsed = parseSaveRequest(request.fillContexts)
        if (parsed == null || parsed.password.isBlank()) {
            AutofillTrace.event("saveFailure", "reason" to "missing_required_data")
            callback.onFailure(getString(R.string.autofill_save_missing_required_data))
            return
        }

        when (
            val result =
                PasswordSaveLauncher(
                    context = this,
                    bridgeGateway = applicationContext.androidAppGraph().bridgeGateway,
                ).launch(parsed)
        ) {
            is BridgeResult.Failure -> {
                AutofillTrace.event(
                    "saveFailure",
                    "reason" to "token_start_failed",
                    "domain" to parsed.domain,
                )
                callback.onFailure(result.error.message)
            }
            is BridgeResult.Success -> {
                AutofillTrace.event("saveStart", "domain" to parsed.domain)
                callback.onSuccess(result.value.intentSender)
            }
        }
    }

    private fun parseRequestContext(request: FillRequest): AutofillRequestContext? {
        val fillContexts = request.fillContexts
        val latestFillContext = fillContexts.lastOrNull() ?: return null
        val focusedAutofillId = latestFillContext.focusedId
        val previousFocusedAutofillIds = fillContexts.dropLast(1).mapNotNull { it.focusedId }.distinct()
        val parser = AutofillStructureParser()
        val latestStructure = latestFillContext.structure
        val activityComponent =
            latestStructure.activityComponent
                ?: fillContexts
                    .asReversed()
                    .mapNotNull { it.structure.activityComponent }
                    .firstOrNull()
        for (windowIndex in 0 until latestStructure.windowNodeCount) {
            parser.visit(latestStructure.getWindowNodeAt(windowIndex).rootViewNode)
        }
        val snapshot = parser.buildSnapshot()
        AutofillTrace.important(
            "requestSnapshot",
            "requestId" to request.id,
            "activity" to activityComponent?.flattenToShortString(),
            "windowCount" to latestStructure.windowNodeCount,
            "focusedId" to AutofillTrace.id(focusedAutofillId),
            "snapshotDomain" to snapshot.webDomain,
            "usernameIds" to AutofillTrace.ids(snapshot.usernameFieldIds),
            "passwordIds" to AutofillTrace.ids(snapshot.passwordFieldIds),
            "otpCandidates" to AutofillTrace.otpCandidates(snapshot.otpCandidates),
            "focusedCandidates" to AutofillTrace.focusedCandidates(snapshot.focusedFieldCandidates),
            "pageHints" to AutofillTrace.pageHints(snapshot.pageHintBlobs),
        )
        return AutofillRequestContext(
            requestId = request.id,
            compatMode = request.flags and FillRequest.FLAG_COMPATIBILITY_MODE_REQUEST != 0,
            activityComponent = activityComponent,
            normalizedDomain = AutofillFieldClassifier.normalizeDomain(snapshot.webDomain),
            focusedId = focusedAutofillId,
            previousFocusedIds = previousFocusedAutofillIds,
            usernameFieldIds = snapshot.usernameFieldIds,
            passwordFieldIds = snapshot.passwordFieldIds,
            otpCandidates = snapshot.otpCandidates,
            focusedFieldCandidates = snapshot.focusedFieldCandidates,
            pageHintBlobs = snapshot.pageHintBlobs,
        )
    }

    private fun parseSaveRequest(fillContexts: List<FillContext>): ParsedPasswordSaveRequest? {
        val structure = fillContexts.lastOrNull()?.structure ?: return null
        val parser = AutofillStructureParser()
        for (windowIndex in 0 until structure.windowNodeCount) {
            parser.visit(structure.getWindowNodeAt(windowIndex).rootViewNode)
        }
        return parser.buildSave()
    }

    companion object {
        const val EXTRA_SESSION_ID = "credential_provider.session_id"
        const val EXTRA_CREDENTIAL_ID = "credential_provider.credential_id"
        const val EXTRA_DOMAIN = "credential_provider.domain"
        const val EXTRA_STEP_KIND = "credential_provider.step_kind"
        const val EXTRA_AUTOFILL_SESSION_KEY = "credential_provider.autofill_session_key"
        const val EXTRA_AUTOFILL_STRATEGY_KIND = "credential_provider.autofill_strategy_kind"
        const val EXTRA_USERNAME_IDS = "credential_provider.username_ids"
        const val EXTRA_PASSWORD_IDS = "credential_provider.password_ids"
        const val EXTRA_OTP_IDS = "credential_provider.otp_ids"
        const val EXTRA_OTP_OPTION_IDS = "credential_provider.otp_option_ids"
        const val EXTRA_OTP_OPTION_LABELS = "credential_provider.otp_option_labels"
        const val EXTRA_OTP_OPTION_TYPES = "credential_provider.otp_option_types"
        const val STEP_PASSWORD = "password"
        const val STEP_OTP = "otp"
    }
}
