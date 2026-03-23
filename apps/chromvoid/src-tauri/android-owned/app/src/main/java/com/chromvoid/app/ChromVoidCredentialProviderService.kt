package com.chromvoid.app

import android.os.Build
import android.os.CancellationSignal
import android.os.OutcomeReceiver
import androidx.annotation.RequiresApi
import androidx.credentials.exceptions.ClearCredentialException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.provider.BeginCreateCredentialRequest
import androidx.credentials.provider.BeginCreateCredentialResponse
import androidx.credentials.provider.BeginGetCredentialRequest
import androidx.credentials.provider.BeginGetCredentialResponse
import androidx.credentials.provider.BeginGetPasswordOption
import androidx.credentials.provider.BeginGetPublicKeyCredentialOption
import androidx.credentials.provider.CredentialProviderService
import com.chromvoid.app.credentialprovider.CredentialProviderEntryFactory
import com.chromvoid.app.credentialprovider.PasskeyCreateEntryHandler
import com.chromvoid.app.credentialprovider.PasskeyQueryHandler
import com.chromvoid.app.credentialprovider.PasskeyQueryOutcome
import com.chromvoid.app.credentialprovider.PasswordQueryHandler
import com.chromvoid.app.credentialprovider.PasswordQueryOutcome

@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
class ChromVoidCredentialProviderService : CredentialProviderService() {
    override fun onBeginGetCredentialRequest(
        request: BeginGetCredentialRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<BeginGetCredentialResponse, GetCredentialException>,
    ) {
        if (cancellationSignal.isCanceled) {
            return
        }
        val graph = applicationContext.androidAppGraph()
        val builder = BeginGetCredentialResponse.Builder()
        val entryFactory = CredentialProviderEntryFactory(applicationContext)
        val passwordQueryHandler =
            PasswordQueryHandler(
                bridgeGateway = graph.bridgeGateway,
                entryFactory = entryFactory,
            )
        val passkeyQueryHandler =
            PasskeyQueryHandler(
                bridgeGateway = graph.bridgeGateway,
                passkeyStore = graph.passkeyMetadataStore,
                requestRegistry = graph.passkeyRequestRegistry,
                entryFactory = entryFactory,
            )

        var addedEntries = 0
        var deferredError: GetCredentialException? = null

        request.beginGetCredentialOptions.filterIsInstance<BeginGetPasswordOption>().forEach { option ->
            if (cancellationSignal.isCanceled) {
                return
            }
            when (val outcome = passwordQueryHandler.addEntries(builder, request, option)) {
                is PasswordQueryOutcome.EntriesAdded -> {
                    addedEntries += outcome.count
                }
                is PasswordQueryOutcome.Error -> {
                    deferredError = deferredError ?: outcome.exception
                }
                PasswordQueryOutcome.NoEntries -> Unit
            }
        }

        request.beginGetCredentialOptions.filterIsInstance<BeginGetPublicKeyCredentialOption>().forEach { option ->
            if (cancellationSignal.isCanceled) {
                return
            }
            when (val outcome = passkeyQueryHandler.addEntries(builder, option)) {
                is PasskeyQueryOutcome.EntriesAdded -> {
                    addedEntries += outcome.count
                }
                is PasskeyQueryOutcome.Error -> {
                    deferredError = deferredError ?: outcome.exception
                }
                PasskeyQueryOutcome.NoEntries -> Unit
            }
        }

        if (addedEntries > 0) {
            callback.onResult(builder.build())
            return
        }
        if (deferredError != null) {
            callback.onError(deferredError!!)
            return
        }
        callback.onResult(builder.build())
    }

    override fun onBeginCreateCredentialRequest(
        request: BeginCreateCredentialRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<BeginCreateCredentialResponse, CreateCredentialException>,
    ) {
        if (cancellationSignal.isCanceled) {
            return
        }
        val graph = applicationContext.androidAppGraph()
        val builder = BeginCreateCredentialResponse.Builder()
        val exception =
            PasskeyCreateEntryHandler(
                bridgeGateway = graph.bridgeGateway,
                passkeyStore = graph.passkeyMetadataStore,
                requestRegistry = graph.passkeyRequestRegistry,
                entryFactory = CredentialProviderEntryFactory(applicationContext),
            ).handle(request, builder)
        if (exception != null) {
            callback.onError(exception)
            return
        }
        callback.onResult(builder.build())
    }

    override fun onClearCredentialStateRequest(
        request: androidx.credentials.provider.ProviderClearCredentialStateRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<Void?, ClearCredentialException>,
    ) {
        if (cancellationSignal.isCanceled) {
            return
        }
        val graph = applicationContext.androidAppGraph()
        graph.passkeyMetadataStore.clearTransientState(graph.passkeyRequestRegistry)
        callback.onResult(null)
    }

    companion object {
        const val EXTRA_REQUEST_ID = "com.chromvoid.app.EXTRA_REQUEST_ID"
        const val EXTRA_CREDENTIAL_ID = "com.chromvoid.app.EXTRA_CREDENTIAL_ID"
        const val EXTRA_COMMAND = "com.chromvoid.app.EXTRA_COMMAND"
        const val EXTRA_PASSWORD_SESSION_ID = "com.chromvoid.app.EXTRA_PASSWORD_SESSION_ID"
        const val EXTRA_PASSWORD_CREDENTIAL_ID = "com.chromvoid.app.EXTRA_PASSWORD_CREDENTIAL_ID"
    }
}
