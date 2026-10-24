package com.chromvoid.app.shared

import android.app.PendingIntent
import android.app.assist.AssistStructure
import android.content.Context
import android.content.Intent
import android.os.Build
import android.view.autofill.AutofillManager
import androidx.annotation.RequiresApi
import androidx.credentials.provider.AuthenticationAction
import androidx.credentials.provider.PendingIntentHandler
import com.chromvoid.app.androidAppGraph
import com.chromvoid.app.autofill.AutofillUnlock
import com.chromvoid.app.credentialprovider.BeginGetOutcome
import com.chromvoid.app.credentialprovider.BeginGetResponder
import com.chromvoid.app.credentialprovider.BridgeResult
import com.chromvoid.platform.R

/**
 * Another app's request that found the vault locked - a fill, a Credential Manager sign-in, a
 * passkey to create - goes through the host's unlock screen ([PlatformHost.installProviderUnlock]).
 * The screen only opens the vault; [result] then answers what was asked, exactly as an open
 * vault would have: the same entries, each still reading its secret only when chosen.
 */
object ProviderUnlock {
    /** The codes that mean "open the vault first", not "nothing here". */
    private val UNLOCK_CODES = setOf("VAULT_REQUIRED", "SESSION_REVOKED", "PROVIDER_UNAVAILABLE", "RUNTIME_UNAVAILABLE")

    internal fun asksForUnlock(code: String?): Boolean = code in UNLOCK_CODES

    /** Whether a provider request would reach an open vault now. */
    internal fun vaultOpen(context: Context): Boolean =
        (context.androidAppGraph().bridgeGateway.providerStatus() as? BridgeResult.Success)
            ?.value
            ?.let { it.runtimeReady && it.vaultOpen } == true

    /**
     * The host's unlock screen as a pending intent the system may complete: it adds the
     * request it is answering - the fill's structure, the sign-in's options - so it stays mutable.
     */
    internal fun pendingIntent(context: Context, requestCode: Int): PendingIntent? {
        val intent = PlatformHost.providerUnlockIntent(context) ?: return null
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_CANCEL_CURRENT or PendingIntent.FLAG_MUTABLE,
        )
    }

    /** "Unlock ChromVoid" in Credential Manager's sheet; null where the host offers no unlock. */
    @RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
    internal fun authenticationAction(context: Context): AuthenticationAction? {
        val pending = pendingIntent(context, SIGN_IN_REQUEST_CODE) ?: return null
        return AuthenticationAction(context.getString(R.string.provider_unlock_title), pending)
    }

    /**
     * Once the vault is open, the answer to [request] - the intent the unlock screen was
     * started with: a fill, Credential Manager's entries, or plain success where only the
     * unlock was asked. Null when nothing can be answered; the screen then cancels. It reads
     * the vault, so it runs off the main thread.
     */
    fun result(context: Context, request: Intent): Intent? {
        assistStructure(request)?.let { structure ->
            val fill = AutofillUnlock.respond(context, structure) ?: return null
            return Intent().putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, fill)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            PendingIntentHandler.retrieveBeginGetCredentialRequest(request)?.let { signIn ->
                val outcome = BeginGetResponder(context.applicationContext).respond(signIn)
                val response = (outcome as? BeginGetOutcome.Response)?.response ?: return null
                return Intent().also { PendingIntentHandler.setBeginGetCredentialResponse(it, response) }
            }
        }
        return Intent()
    }

    private fun assistStructure(intent: Intent): AssistStructure? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(AutofillManager.EXTRA_ASSIST_STRUCTURE, AssistStructure::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(AutofillManager.EXTRA_ASSIST_STRUCTURE)
        }

    internal const val FILL_REQUEST_CODE = 4211
    private const val SIGN_IN_REQUEST_CODE = 4212
}
