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
import com.chromvoid.app.autofill.AutofillFieldClassifier
import com.chromvoid.app.autofill.AutofillRequestContext
import com.chromvoid.app.autofill.AutofillSessionMetadata
import com.chromvoid.app.autofill.AutofillStrategyKind
import com.chromvoid.app.autofill.AutofillStructureParser
import com.chromvoid.app.shared.IntentCompat

class ChromVoidAutofillAuthActivity : Activity() {
    private lateinit var controller: AutofillAuthController

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
        val parser = AutofillStructureParser()
        for (windowIndex in 0 until structure.windowNodeCount) {
            parser.visit(structure.getWindowNodeAt(windowIndex).rootViewNode)
        }
        val snapshot = parser.buildSnapshot()
        val requestContext =
            AutofillRequestContext(
                requestId = 0,
                compatMode = args.strategyKind == AutofillStrategyKind.COMPAT,
                activityComponent = structure.activityComponent,
                normalizedDomain =
                    AutofillFieldClassifier.normalizeDomain(snapshot.webDomain)
                        ?: AutofillFieldClassifier.normalizeDomain(args.domain),
                focusedId = findFocusedAutofillId(structure),
                previousFocusedIds = emptyList(),
                usernameFieldIds = snapshot.usernameFieldIds,
                passwordFieldIds = snapshot.passwordFieldIds,
                otpCandidates = snapshot.otpCandidates,
                focusedFieldCandidates = snapshot.focusedFieldCandidates,
                pageHintBlobs = snapshot.pageHintBlobs,
            )
        AutofillTrace.important(
            "authAssistStructure",
            "present" to true,
            "activity" to structure.activityComponent?.flattenToShortString(),
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

    private fun findFocusedAutofillId(structure: AssistStructure): android.view.autofill.AutofillId? {
        for (windowIndex in 0 until structure.windowNodeCount) {
            val focused = findFocusedAutofillId(structure.getWindowNodeAt(windowIndex).rootViewNode)
            if (focused != null) {
                return focused
            }
        }
        return null
    }

    private fun findFocusedAutofillId(node: AssistStructure.ViewNode?): android.view.autofill.AutofillId? {
        if (node == null) {
            return null
        }
        if (node.isFocused && node.autofillId != null) {
            return node.autofillId
        }
        for (index in 0 until node.childCount) {
            val focused = findFocusedAutofillId(node.getChildAt(index))
            if (focused != null) {
                return focused
            }
        }
        return null
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
        if (args.stepKind != ChromVoidAutofillService.STEP_OTP) return
        if (args.strategyKind != AutofillStrategyKind.COMPAT) return

        val otp = result.otpValue ?: return
        val clipboard = getSystemService(ClipboardManager::class.java) ?: return
        clipboard.setPrimaryClip(ClipData.newPlainText("otp", otp))
        AutofillTrace.important("otpClipboardFallback", "otpLength" to otp.length)
        Toast.makeText(this, getString(R.string.autofill_otp_copied), Toast.LENGTH_SHORT).show()
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
            ChromVoidAutofillService.STEP_PASSWORD -> store.markPasswordFilled(args.sessionKey, metadata)
            ChromVoidAutofillService.STEP_OTP -> store.markOtpResponseShown(args.sessionKey, metadata)
        }
    }

    private fun finishCancelled(reason: String) {
        AutofillTrace.important("authCancel", "reason" to reason)
        setResult(RESULT_CANCELED)
        finish()
    }
}
