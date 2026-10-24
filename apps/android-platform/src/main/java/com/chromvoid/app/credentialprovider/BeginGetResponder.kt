package com.chromvoid.app.credentialprovider

import android.content.Context
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.provider.BeginGetCredentialRequest
import androidx.credentials.provider.BeginGetCredentialResponse
import androidx.credentials.provider.BeginGetPasswordOption
import androidx.credentials.provider.BeginGetPublicKeyCredentialOption
import com.chromvoid.app.androidAppGraph
import com.chromvoid.app.shared.ProviderUnlock

internal sealed interface BeginGetOutcome {
    data class Response(val response: BeginGetCredentialResponse) : BeginGetOutcome

    data class Failure(val exception: GetCredentialException) : BeginGetOutcome

    /** Nothing was offered because the vault is locked, or the app has not opened it yet. */
    data class Locked(val exception: GetCredentialException) : BeginGetOutcome

    data object Canceled : BeginGetOutcome
}

/**
 * The entries Credential Manager is offered for one sign-in: the vault's passwords and
 * passkeys for the asking app or site. The provider service answers with it, and so does the
 * host's unlock screen once it has opened the vault, so both offer exactly the same entries.
 */
@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
internal class BeginGetResponder(private val context: Context) {
    fun respond(
        request: BeginGetCredentialRequest,
        isCanceled: () -> Boolean = { false },
    ): BeginGetOutcome {
        val graph = context.androidAppGraph()
        val builder = BeginGetCredentialResponse.Builder()
        val entryFactory = CredentialProviderEntryFactory(context)
        val passwords = PasswordQueryHandler(bridgeGateway = graph.bridgeGateway, entryFactory = entryFactory)
        val passkeys =
            PasskeyQueryHandler(
                bridgeGateway = graph.bridgeGateway,
                requestRegistry = graph.passkeyRequestRegistry,
                entryFactory = entryFactory,
            )

        var added = 0
        var deferredError: GetCredentialException? = null
        var deferredCode: String? = null

        request.beginGetCredentialOptions.filterIsInstance<BeginGetPasswordOption>().forEach { option ->
            if (isCanceled()) return BeginGetOutcome.Canceled
            when (val outcome = passwords.addEntries(builder, request, option)) {
                is PasswordQueryOutcome.EntriesAdded -> added += outcome.count
                is PasswordQueryOutcome.Error -> if (deferredError == null) {
                    deferredError = outcome.exception
                    deferredCode = outcome.code
                }
                PasswordQueryOutcome.NoEntries -> Unit
            }
        }

        request.beginGetCredentialOptions.filterIsInstance<BeginGetPublicKeyCredentialOption>().forEach { option ->
            if (isCanceled()) return BeginGetOutcome.Canceled
            when (val outcome = passkeys.addEntries(builder, request, option)) {
                is PasskeyQueryOutcome.EntriesAdded -> added += outcome.count
                is PasskeyQueryOutcome.Error -> if (deferredError == null) {
                    deferredError = outcome.exception
                    deferredCode = outcome.code
                }
                PasskeyQueryOutcome.NoEntries -> Unit
            }
        }

        val error = deferredError
        return when {
            added > 0 || error == null -> BeginGetOutcome.Response(builder.build())
            ProviderUnlock.asksForUnlock(deferredCode) -> BeginGetOutcome.Locked(error)
            else -> BeginGetOutcome.Failure(error)
        }
    }
}
