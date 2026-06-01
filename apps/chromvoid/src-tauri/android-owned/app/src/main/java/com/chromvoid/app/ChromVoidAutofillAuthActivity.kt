package com.chromvoid.app

import android.app.Activity
import android.app.AlertDialog
import android.app.assist.AssistStructure
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.os.Bundle
import android.view.autofill.AutofillManager
import android.widget.Toast
import com.chromvoid.app.autofill.AutofillAuthController
import com.chromvoid.app.autofill.AutofillAuthResult
import com.chromvoid.app.autofill.AutofillRequestContext
import com.chromvoid.app.autofill.AutofillRequestContextFactory
import com.chromvoid.app.autofill.AutofillSessionMetadata
import com.chromvoid.app.autofill.AutofillStrategyKind
import com.chromvoid.app.shared.IntentCompat

class ChromVoidAutofillAuthActivity : Activity() {
    private lateinit var controller: AutofillAuthController
    private var currentArgs: com.chromvoid.app.autofill.AutofillAuthArgs? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val appGraph = applicationContext.androidAppGraph()
        controller = AutofillAuthController(appGraph.bridgeGateway)

        val parsedArgs = controller.parseArgs(intent)
        val args =
            controller.reconcileArgs(
                args = parsedArgs,
                requestContext = parseRequestContextFromIntent(parsedArgs),
                sessionStore = appGraph.autofillSessionStore,
            )
        currentArgs = args
        AutofillTrace.important(
            "authStart",
            "session" to args.sessionId,
            "credential" to args.credentialId,
            "sessionKey" to args.sessionKey,
            "strategy" to args.strategyKind.wireValue,
            "step" to args.stepKind,
            "usernameIds" to AutofillTrace.ids(args.usernameIds),
            "passwordIds" to AutofillTrace.ids(args.passwordIds),
            "otpIds" to AutofillTrace.ids(args.otpIds),
            "otpOptionCount" to args.otpOptions.size,
        )

        when (args.stepKind) {
            ChromVoidAutofillService.STEP_PASSWORD -> {
                val result = controller.handlePassword(args)
                finishWithAuthResult(args, result)
            }
            ChromVoidAutofillService.STEP_OTP -> handleOtp(args)
            else -> finishCancelled("unknown_step_kind")
        }
    }

    private fun parseRequestContextFromIntent(args: com.chromvoid.app.autofill.AutofillAuthArgs): AutofillRequestContext? {
        val structure =
            IntentCompat.parcelableExtra<AssistStructure>(
                intent,
                AutofillManager.EXTRA_ASSIST_STRUCTURE,
            )
        if (structure == null) {
            AutofillTrace.important(
                "authAssistStructure",
                "present" to false,
                "strategy" to args.strategyKind.wireValue,
                "domain" to args.domain,
                "sessionKey" to args.sessionKey,
                "originalStep" to args.stepKind,
            )
            return null
        }
        val requestContextResult =
            AutofillRequestContextFactory.fromAssistStructure(
                structure = structure,
                fallbackDomain = args.domain,
                fallbackStrategyKind = args.strategyKind,
            )
        val requestContext = requestContextResult.context
        AutofillTrace.important(
            "authAssistStructure",
            "present" to true,
            "activity" to requestContext.activityComponent?.flattenToShortString(),
            "compat" to requestContext.compatMode,
            "domain" to requestContext.normalizedDomain,
            "focusedId" to AutofillTrace.id(requestContext.focusedId),
            "usernameIds" to AutofillTrace.ids(requestContext.usernameFieldIds),
            "passwordIds" to AutofillTrace.ids(requestContext.passwordFieldIds),
            "otpCandidates" to AutofillTrace.otpCandidates(requestContext.otpCandidates),
            "focusedCandidates" to AutofillTrace.focusedCandidates(requestContext.focusedFieldCandidates),
            "pageHints" to AutofillTrace.pageHints(requestContext.pageHintBlobs),
        )
        return requestContext
    }

    private fun handleOtp(args: com.chromvoid.app.autofill.AutofillAuthArgs) {
        val otpOptions = args.otpOptions
        if (otpOptions.isEmpty()) {
            finishCancelled("missing_otp_options")
            return
        }
        if (otpOptions.size == 1) {
            finishWithAuthResult(args, controller.handleOtp(args, otpOptions.first()))
            return
        }

        AutofillTrace.important("otpSelectorShown", "options" to otpOptions.size)
        val labels = otpOptions.mapIndexed { index, option -> option.label ?: "OTP ${index + 1}" }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle(R.string.autofill_choose_otp)
            .setItems(labels) { _: android.content.DialogInterface, which: Int ->
                val option = otpOptions[which]
                AutofillTrace.important("otpSelected", "otpId" to option.id, "type" to option.otpType)
                finishWithAuthResult(args, controller.handleOtp(args, option))
            }
            .setOnCancelListener {
                finishCancelled("otp_selector_cancelled")
            }
            .show()
    }

    private fun finishWithAuthResult(
        args: com.chromvoid.app.autofill.AutofillAuthArgs,
        result: AutofillAuthResult,
    ) {
        when (result) {
            is AutofillAuthResult.Cancelled -> finishCancelled(result.reason)
            is AutofillAuthResult.Success -> {
                maybeMarkSessionState(args)
                maybeCopyOtpToClipboard(args, result)
                val resultIntent =
                    Intent().putExtra(
                        AutofillManager.EXTRA_AUTHENTICATION_RESULT,
                        result.dataset.build(),
                    )
                setResult(RESULT_OK, resultIntent)
                finish()
            }
        }
    }

    private fun maybeCopyOtpToClipboard(
        args: com.chromvoid.app.autofill.AutofillAuthArgs,
        result: AutofillAuthResult.Success,
    ) {
        if (args.strategyKind != AutofillStrategyKind.COMPAT) return
        if (!shouldCopyOtpToClipboard(args)) return

        val otp = result.otpValue ?: return
        val clipboard = getSystemService(ClipboardManager::class.java) ?: return
        clipboard.setPrimaryClip(ClipData.newPlainText("otp", otp))
        AutofillTrace.important(
            "otpClipboardFallback",
            "step" to args.stepKind,
            "otpLength" to otp.length,
        )
        Toast.makeText(this, getString(R.string.autofill_otp_copied), Toast.LENGTH_SHORT).show()
    }

    private fun shouldCopyOtpToClipboard(args: com.chromvoid.app.autofill.AutofillAuthArgs): Boolean {
        if (args.stepKind == ChromVoidAutofillService.STEP_OTP) {
            return true
        }
        if (args.stepKind != ChromVoidAutofillService.STEP_PASSWORD) {
            return false
        }
        if (args.otpOptions.size != 1) {
            return false
        }
        return args.otpOptions.first().otpType != "HOTP"
    }

    private fun maybeMarkSessionState(args: com.chromvoid.app.autofill.AutofillAuthArgs) {
        if (args.sessionKey.isBlank()) {
            return
        }
        val metadata =
            AutofillSessionMetadata(
                normalizedDomain = args.domain.ifBlank { null },
                strategyKind = args.strategyKind,
            )
        val store = applicationContext.androidAppGraph().autofillSessionStore
        when (args.stepKind) {
            ChromVoidAutofillService.STEP_PASSWORD ->
                if (args.passwordIds.isNotEmpty()) {
                    store.markPasswordFilled(args.sessionKey, metadata)
                }
            ChromVoidAutofillService.STEP_OTP -> store.markOtpResponseShown(args.sessionKey, metadata)
        }
    }

    private fun finishCancelled(reason: String) {
        val sessionClosed = currentArgs?.let { controller.closeSession(it.sessionId) } ?: false
        AutofillTrace.important("authCancel", "reason" to reason, "closed" to sessionClosed)
        AutofillTrace.important("authSessionClosed", "closed" to sessionClosed, "reason" to reason)
        setResult(RESULT_CANCELED)
        finish()
    }
}
