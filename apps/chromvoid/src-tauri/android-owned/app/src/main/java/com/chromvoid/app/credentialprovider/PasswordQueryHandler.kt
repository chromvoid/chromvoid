package com.chromvoid.app.credentialprovider

import androidx.credentials.provider.BeginGetCredentialRequest
import androidx.credentials.provider.BeginGetCredentialResponse
import androidx.credentials.provider.BeginGetPasswordOption
import com.chromvoid.app.PasswordGetExceptionMapper
import com.chromvoid.app.passwordProviderContext

internal class PasswordQueryHandler(
    private val bridgeGateway: AndroidBridgeGateway,
    private val entryFactory: CredentialProviderEntryFactory,
) {
    fun addEntries(
        builder: BeginGetCredentialResponse.Builder,
        request: BeginGetCredentialRequest,
        option: BeginGetPasswordOption,
    ): PasswordQueryOutcome {
        val passwordContext = passwordProviderContext(request.callingAppInfo)
            ?: return PasswordQueryOutcome.NoEntries

        return when (val response = bridgeGateway.passwordList(passwordContext.origin, passwordContext.domain)) {
            is BridgeResult.Failure -> {
                PasswordQueryOutcome.Error(
                    PasswordGetExceptionMapper.fromBridgeError(
                        response.error,
                        "ChromVoid password provider is unavailable.",
                    ),
                )
            }
            is BridgeResult.Success -> {
                val candidates =
                    response.value.second.filter { candidate ->
                        option.allowedUserIds.isEmpty() || candidate.username in option.allowedUserIds
                    }
                if (response.value.first.isBlank() || candidates.isEmpty()) {
                    PasswordQueryOutcome.NoEntries
                } else {
                    candidates.forEach { candidate ->
                        builder.addCredentialEntry(
                            entryFactory.buildPasswordEntry(
                                option = option,
                                sessionId = response.value.first,
                                candidate = candidate,
                            ),
                        )
                    }
                    PasswordQueryOutcome.EntriesAdded(candidates.size)
                }
            }
        }
    }
}
