package com.chromvoid.app.autofill

import android.app.PendingIntent
import android.content.Context
import android.service.autofill.Dataset
import android.service.autofill.Field
import android.service.autofill.FillResponse
import android.service.autofill.Presentations
import android.view.View
import android.view.autofill.AutofillId
import android.widget.RemoteViews
import com.chromvoid.app.AutofillTrace
import com.chromvoid.app.ChromVoidAutofillAuthActivity
import com.chromvoid.app.ChromVoidAutofillService
import com.chromvoid.app.R
import com.chromvoid.app.credentialprovider.AutofillCandidate
import com.chromvoid.app.shared.ActivityIntentFactory

internal class AutofillDatasetFactory(
    private val context: Context,
) {
    fun buildAuthenticatedDataset(
        parsed: ParsedAutofillRequest,
        sessionId: String,
        candidate: AutofillCandidate,
    ): Dataset {
        val credentialId = candidate.credentialId
        val username = candidate.username.ifBlank { candidate.label }
        val subtitle = candidate.label.ifBlank {
            candidate.domain?.takeIf { it.isNotBlank() } ?: parsed.domain
        }

        val presentation =
            RemoteViews(context.packageName, R.layout.autofill_dataset_presentation).apply {
                setTextViewText(R.id.autofill_title, username)
                setTextViewText(R.id.autofill_subtitle, subtitle)
                setViewVisibility(
                    R.id.autofill_subtitle,
                    if (subtitle.isBlank()) View.GONE else View.VISIBLE,
                )
            }
        val dialogPresentation = presentation
        val menuPresentation = presentation

        val authIntent =
            ActivityIntentFactory
                .activityIntent(
                    context = context,
                    target = ChromVoidAutofillAuthActivity::class.java,
                    action = ACTION_AUTOFILL_AUTH,
                    uniquePath = "autofill/auth/$sessionId/$credentialId/${parsed.stepKind.wireValue}",
                )
                .putExtra(ChromVoidAutofillService.EXTRA_SESSION_ID, sessionId)
                .putExtra(ChromVoidAutofillService.EXTRA_CREDENTIAL_ID, credentialId)
                .putExtra(ChromVoidAutofillService.EXTRA_DOMAIN, parsed.domain)
                .putExtra(ChromVoidAutofillService.EXTRA_STEP_KIND, parsed.stepKind.wireValue)
                .putExtra(ChromVoidAutofillService.EXTRA_AUTOFILL_SESSION_KEY, parsed.sessionKey)
                .putExtra(ChromVoidAutofillService.EXTRA_AUTOFILL_STRATEGY_KIND, parsed.strategyKind.wireValue)
                .putParcelableArrayListExtra(ChromVoidAutofillService.EXTRA_USERNAME_IDS, ArrayList(parsed.usernameFieldIds))
                .putParcelableArrayListExtra(ChromVoidAutofillService.EXTRA_PASSWORD_IDS, ArrayList(parsed.passwordFieldIds))
                .putParcelableArrayListExtra(ChromVoidAutofillService.EXTRA_OTP_IDS, ArrayList(parsed.otpFieldIds))
                .putStringArrayListExtra(
                    ChromVoidAutofillService.EXTRA_OTP_OPTION_IDS,
                    ArrayList(candidate.otpOptions.map { it.id }),
                )
                .putStringArrayListExtra(
                    ChromVoidAutofillService.EXTRA_OTP_OPTION_LABELS,
                    ArrayList(candidate.otpOptions.map { it.label.orEmpty() }),
                )
                .putStringArrayListExtra(
                    ChromVoidAutofillService.EXTRA_OTP_OPTION_TYPES,
                    ArrayList(candidate.otpOptions.map { it.otpType.orEmpty() }),
                )

        val pendingIntent =
            PendingIntent.getActivity(
                context,
                0,
                authIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
            )

        val builder = Dataset.Builder()
        val boundIds =
            if (parsed.stepKind == ParsedStepKind.OTP) {
                parsed.otpAnchorFieldIds
            } else {
                parsed.credentialAnchorFieldIds
            }

        AutofillTrace.important(
            "datasetAuthPrompt",
            "domain" to parsed.domain,
            "session" to sessionId,
            "credential" to credentialId,
            "strategy" to parsed.strategyKind.wireValue,
            "sessionKey" to parsed.sessionKey,
            "stepKind" to parsed.stepKind.wireValue,
            "usernameIds" to AutofillTrace.ids(parsed.usernameFieldIds),
            "passwordIds" to AutofillTrace.ids(parsed.passwordFieldIds),
            "otpIds" to AutofillTrace.ids(parsed.otpFieldIds),
            "credentialAnchorIds" to AutofillTrace.ids(parsed.credentialAnchorFieldIds),
            "otpAnchorIds" to AutofillTrace.ids(parsed.otpAnchorFieldIds),
            "boundIds" to AutofillTrace.ids(boundIds),
            "otpOptionCount" to candidate.otpOptions.size,
        )

        boundIds.forEach { autofillId ->
            setDatasetField(builder, autofillId, menuPresentation, dialogPresentation)
        }
        builder.setAuthentication(pendingIntent.intentSender)
        return builder.build()
    }

    @Suppress("UNUSED_PARAMETER")
    fun maybeConfigureFillDialog(
        _responseBuilder: FillResponse.Builder,
        _parsed: ParsedAutofillRequest,
    ) {
        return
    }

    private fun setDatasetField(
        builder: Dataset.Builder,
        autofillId: AutofillId,
        menuPresentation: RemoteViews,
        dialogPresentation: RemoteViews?,
    ) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            val presentationsBuilder = Presentations.Builder().setMenuPresentation(menuPresentation)
            dialogPresentation?.let { presentationsBuilder.setDialogPresentation(it) }
            val field =
                Field.Builder()
                    .setPresentations(presentationsBuilder.build())
                    .build()
            builder.setField(autofillId, field)
            return
        }
        builder.setValue(autofillId, null, menuPresentation)
    }
    companion object {
        private const val ACTION_AUTOFILL_AUTH = "com.chromvoid.app.action.AUTOFILL_AUTH"
    }
}
