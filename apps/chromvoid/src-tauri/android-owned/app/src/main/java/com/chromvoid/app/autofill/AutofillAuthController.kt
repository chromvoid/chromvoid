package com.chromvoid.app.autofill

import android.service.autofill.Dataset
import android.view.autofill.AutofillValue
import com.chromvoid.app.AutofillTrace
import com.chromvoid.app.ChromVoidAutofillService
import com.chromvoid.app.credentialprovider.AndroidBridgeGateway
import com.chromvoid.app.credentialprovider.BridgeResult
import com.chromvoid.app.credentialprovider.OtpOption
import com.chromvoid.app.shared.IntentCompat

internal class AutofillAuthController(
    private val bridgeGateway: AndroidBridgeGateway,
) {
    fun parseArgs(intent: android.content.Intent): AutofillAuthArgs {
        return AutofillAuthArgs(
            sessionId = intent.getStringExtra(ChromVoidAutofillService.EXTRA_SESSION_ID).orEmpty(),
            credentialId = intent.getStringExtra(ChromVoidAutofillService.EXTRA_CREDENTIAL_ID).orEmpty(),
            domain = intent.getStringExtra(ChromVoidAutofillService.EXTRA_DOMAIN).orEmpty(),
            sessionKey = intent.getStringExtra(ChromVoidAutofillService.EXTRA_AUTOFILL_SESSION_KEY).orEmpty(),
            strategyKind =
                AutofillStrategyKind.fromWireValue(
                    intent.getStringExtra(ChromVoidAutofillService.EXTRA_AUTOFILL_STRATEGY_KIND),
                ),
            usernameIds = IntentCompat.parcelableArrayListExtra(intent, ChromVoidAutofillService.EXTRA_USERNAME_IDS),
            passwordIds = IntentCompat.parcelableArrayListExtra(intent, ChromVoidAutofillService.EXTRA_PASSWORD_IDS),
            otpIds = IntentCompat.parcelableArrayListExtra(intent, ChromVoidAutofillService.EXTRA_OTP_IDS),
            stepKind = intent.getStringExtra(ChromVoidAutofillService.EXTRA_STEP_KIND).orEmpty().trim(),
            otpOptions =
                parseOtpOptions(
                    ids = intent.getStringArrayListExtra(ChromVoidAutofillService.EXTRA_OTP_OPTION_IDS),
                    labels = intent.getStringArrayListExtra(ChromVoidAutofillService.EXTRA_OTP_OPTION_LABELS),
                    types = intent.getStringArrayListExtra(ChromVoidAutofillService.EXTRA_OTP_OPTION_TYPES),
                ),
        )
    }

    fun reconcileArgs(
        args: AutofillAuthArgs,
        requestContext: AutofillRequestContext?,
        sessionStore: AutofillSessionStore,
    ): AutofillAuthArgs {
        val context = requestContext ?: return args
        val parsed = AutofillRequestResolver().resolve(context, sessionStore) ?: return args
        if (parsed.stepKind == ParsedStepKind.UNSUPPORTED) {
            return args
        }
        // In compat mode (Firefox), GeckoView regenerates virtual AutofillIds when the auth
        // activity opens (e.g. i4627 → i55) and reverts them when it closes. If we adopt the
        // transient IDs from the auth-time AssistStructure, the returned Dataset targets IDs
        // that no longer exist once Firefox resumes. Preserve the original OTP IDs so the
        // framework can match them against the restored view hierarchy.
        val preserveOriginalOtpIds =
            args.strategyKind == AutofillStrategyKind.COMPAT &&
                args.otpIds.isNotEmpty() &&
                parsed.stepKind == ParsedStepKind.OTP
        val resolvedArgs =
            args.copy(
                domain = parsed.domain,
                sessionKey = parsed.sessionKey,
                strategyKind = parsed.strategyKind,
                usernameIds = parsed.usernameFieldIds,
                passwordIds = parsed.passwordFieldIds,
                otpIds = if (preserveOriginalOtpIds) args.otpIds else parsed.otpFieldIds,
                stepKind = parsed.stepKind.wireValue,
            )
        AutofillTrace.important(
            "authArgsResolved",
            "originalStep" to args.stepKind,
            "resolvedStep" to resolvedArgs.stepKind,
            "domain" to resolvedArgs.domain,
            "strategy" to resolvedArgs.strategyKind.wireValue,
            "sessionKey" to resolvedArgs.sessionKey,
            "usernameIds" to AutofillTrace.ids(resolvedArgs.usernameIds),
            "passwordIds" to AutofillTrace.ids(resolvedArgs.passwordIds),
            "otpIds" to AutofillTrace.ids(resolvedArgs.otpIds),
        )
        return resolvedArgs
    }

    fun handlePassword(args: AutofillAuthArgs): AutofillAuthResult {
        if (args.sessionId.isBlank() || args.credentialId.isBlank() || args.passwordIds.isEmpty()) {
            return AutofillAuthResult.Cancelled("missing_required_extras")
        }

        return when (val response = bridgeGateway.autofillGetSecret(args.sessionId, args.credentialId)) {
            is BridgeResult.Failure -> AutofillAuthResult.Cancelled("secret_lookup_failed")
            is BridgeResult.Success -> {
                val password = response.value.password.orEmpty()
                if (password.isBlank()) {
                    AutofillAuthResult.Cancelled("blank_password")
                } else {
                    AutofillTrace.important(
                        "authPasswordResolved",
                        "session" to args.sessionId,
                        "credential" to args.credentialId,
                        "usernameIds" to AutofillTrace.ids(args.usernameIds),
                        "passwordIds" to AutofillTrace.ids(args.passwordIds),
                        "usernamePresent" to response.value.username.isNotBlank(),
                        "passwordLength" to password.length,
                    )
                    val dataset = Dataset.Builder()
                    args.usernameIds.forEach { autofillId ->
                        dataset.setValue(autofillId, AutofillValue.forText(response.value.username))
                    }
                    args.passwordIds.forEach { autofillId ->
                        dataset.setValue(autofillId, AutofillValue.forText(password))
                    }
                    AutofillAuthResult.Success(dataset)
                }
            }
        }
    }

    fun handleOtp(args: AutofillAuthArgs): AutofillAuthResult {
        if (args.sessionId.isBlank() || args.credentialId.isBlank() || args.otpIds.isEmpty()) {
            return AutofillAuthResult.Cancelled("missing_required_extras")
        }

        val otpOptions = args.otpOptions
        if (otpOptions.isEmpty()) {
            return AutofillAuthResult.Cancelled("missing_otp_options")
        }
        if (otpOptions.size > 1) {
            return AutofillAuthResult.Cancelled("otp_selector_required")
        }
        val option = otpOptions.first()
        if (option.otpType == "HOTP") {
            return AutofillAuthResult.Cancelled("hotp_unsupported")
        }

        return when (val response = bridgeGateway.autofillGetSecret(args.sessionId, args.credentialId, option.id)) {
            is BridgeResult.Failure -> AutofillAuthResult.Cancelled("otp_lookup_failed")
            is BridgeResult.Success -> {
                val otp = response.value.otp.orEmpty().trim()
                if (otp.isBlank()) {
                    AutofillAuthResult.Cancelled("blank_otp")
                } else {
                    AutofillTrace.important(
                        "authOtpResolved",
                        "session" to args.sessionId,
                        "credential" to args.credentialId,
                        "otpIds" to AutofillTrace.ids(args.otpIds),
                        "otpOptionId" to option.id,
                        "otpType" to option.otpType,
                        "otpLength" to otp.length,
                    )
                    val dataset = Dataset.Builder()
                    args.otpIds.forEach { autofillId ->
                        dataset.setValue(autofillId, AutofillValue.forText(otp))
                    }
                    AutofillAuthResult.Success(dataset, otpValue = otp)
                }
            }
        }
    }

    fun handleOtp(
        args: AutofillAuthArgs,
        option: OtpOption,
    ): AutofillAuthResult {
        if (args.sessionId.isBlank() || args.credentialId.isBlank() || args.otpIds.isEmpty()) {
            return AutofillAuthResult.Cancelled("missing_required_extras")
        }
        if (option.otpType == "HOTP") {
            return AutofillAuthResult.Cancelled("hotp_unsupported")
        }

        return when (val response = bridgeGateway.autofillGetSecret(args.sessionId, args.credentialId, option.id)) {
            is BridgeResult.Failure -> AutofillAuthResult.Cancelled("otp_lookup_failed")
            is BridgeResult.Success -> {
                val otp = response.value.otp.orEmpty().trim()
                if (otp.isBlank()) {
                    AutofillAuthResult.Cancelled("blank_otp")
                } else {
                    AutofillTrace.important(
                        "authOtpResolved",
                        "session" to args.sessionId,
                        "credential" to args.credentialId,
                        "otpIds" to AutofillTrace.ids(args.otpIds),
                        "otpOptionId" to option.id,
                        "otpType" to option.otpType,
                        "otpLength" to otp.length,
                    )
                    val dataset = Dataset.Builder()
                    args.otpIds.forEach { autofillId ->
                        dataset.setValue(autofillId, AutofillValue.forText(otp))
                    }
                    AutofillAuthResult.Success(dataset, otpValue = otp)
                }
            }
        }
    }

    fun parseOtpOptions(
        ids: List<String>?,
        labels: List<String>?,
        types: List<String>?,
    ): List<OtpOption> {
        val requestIds = ids ?: return emptyList()
        return buildList {
            requestIds.forEachIndexed { index, rawId ->
                val id = rawId.trim()
                if (id.isBlank()) {
                    return@forEachIndexed
                }
                add(
                    OtpOption(
                        id = id,
                        label = labels?.getOrNull(index)?.trim()?.ifEmpty { null },
                        otpType = types?.getOrNull(index)?.trim()?.ifBlank { null }?.uppercase(),
                    ),
                )
            }
        }
    }
}
