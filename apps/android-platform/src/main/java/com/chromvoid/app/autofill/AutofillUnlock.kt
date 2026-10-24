package com.chromvoid.app.autofill

import android.app.assist.AssistStructure
import android.content.Context
import android.service.autofill.FillResponse
import android.view.View
import android.widget.RemoteViews
import com.chromvoid.app.androidAppGraph
import com.chromvoid.app.credentialprovider.BridgeResult
import com.chromvoid.app.shared.ProviderUnlock
import com.chromvoid.platform.R

/**
 * Another app asked to fill while the vault was locked, or before the app had opened it: the
 * service answers with one "Unlock ChromVoid" entry whose authentication is the host's unlock
 * screen ([ProviderUnlock]). The framework hands that screen the request's structure; once
 * the vault is open, [respond] builds from it the fill an open vault would have answered
 * with - the same per-credential entries, each still reading its secret only when chosen.
 */
internal object AutofillUnlock {
    /** The unlock entry, or null where the host offers no unlock screen or nothing can be filled. */
    fun unlockResponse(context: Context, parsed: ParsedAutofillRequest): FillResponse? {
        val ids = (parsed.credentialAnchorFieldIds + parsed.usernameFieldIds + parsed.passwordFieldIds).distinct()
        if (ids.isEmpty()) return null
        val sender = ProviderUnlock.pendingIntent(context, ProviderUnlock.FILL_REQUEST_CODE)?.intentSender
            ?: return null
        val presentation = RemoteViews(context.packageName, R.layout.autofill_dataset_presentation).apply {
            setTextViewText(R.id.autofill_title, context.getString(R.string.provider_unlock_title))
            setTextViewText(R.id.autofill_subtitle, parsed.domain)
            setViewVisibility(R.id.autofill_subtitle, if (parsed.domain.isBlank()) View.GONE else View.VISIBLE)
        }
        val response = FillResponse.Builder().setAuthentication(ids.toTypedArray(), sender, presentation)
        AutofillSaveInfo.forRequest(parsed)?.let(response::setSaveInfo)
        return response.build()
    }

    /** After the unlock: the fill for [structure], or null when the vault holds nothing for it. */
    fun respond(context: Context, structure: AssistStructure): FillResponse? {
        val graph = context.applicationContext.androidAppGraph()
        val requestContext = AutofillRequestContextFactory.fromAssistStructure(
            structure = structure,
            fallbackDomain = null,
            fallbackStrategyKind = AutofillStrategyKind.NATIVE,
        ).context
        val parsed = AutofillRequestResolver().resolve(requestContext, graph.autofillSessionStore) ?: return null
        if (parsed.stepKind == ParsedStepKind.UNSUPPORTED) return null
        return when (val listed = graph.bridgeGateway.autofillList(parsed.origin, parsed.domain)) {
            is BridgeResult.Failure -> null
            is BridgeResult.Success -> {
                val sessionId = listed.value.sessionId
                if (sessionId.isBlank() || listed.value.candidates.isEmpty()) {
                    null
                } else {
                    AutofillDatasetFactory(context).buildAuthenticatedFillResponse(
                        parsed = parsed,
                        sessionId = sessionId,
                        candidates = listed.value.candidates,
                    )
                }
            }
        }
    }
}
