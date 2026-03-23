package com.chromvoid.app.credentialprovider

import android.app.PendingIntent
import android.content.Context
import androidx.credentials.provider.BeginCreatePublicKeyCredentialRequest
import androidx.credentials.provider.BeginGetPasswordOption
import androidx.credentials.provider.BeginGetPublicKeyCredentialOption
import androidx.credentials.provider.CreateEntry
import androidx.credentials.provider.PasswordCredentialEntry
import androidx.credentials.provider.PublicKeyCredentialEntry
import com.chromvoid.app.ChromVoidCredentialProviderService
import com.chromvoid.app.ChromVoidPasskeyCreateActivity
import com.chromvoid.app.ChromVoidPasskeyGetActivity
import com.chromvoid.app.ChromVoidPasswordGetActivity
import com.chromvoid.app.PasskeyMetadata
import com.chromvoid.app.R
import com.chromvoid.app.shared.ActivityIntentFactory

internal class CredentialProviderEntryFactory(
    private val context: Context,
) {
    fun buildPasskeyGetEntry(
        option: BeginGetPublicKeyCredentialOption,
        requestId: String,
        metadata: PasskeyMetadata,
    ): PublicKeyCredentialEntry {
        val pendingIntent =
            PendingIntent.getActivity(
                context,
                0,
                ActivityIntentFactory
                    .activityIntent(
                        context = context,
                        target = ChromVoidPasskeyGetActivity::class.java,
                        action = ACTION_PASSKEY_GET,
                        uniquePath = "passkey/get/$requestId/${metadata.credentialIdB64Url}",
                    )
                    .putExtra(ChromVoidCredentialProviderService.EXTRA_REQUEST_ID, requestId)
                    .putExtra(ChromVoidCredentialProviderService.EXTRA_CREDENTIAL_ID, metadata.credentialIdB64Url)
                    .putExtra(ChromVoidCredentialProviderService.EXTRA_COMMAND, "get"),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
            )
        return PublicKeyCredentialEntry.Builder(
            context,
            metadata.userName.ifBlank { metadata.userDisplayName.ifBlank { metadata.rpId } },
            pendingIntent,
            option,
        ).build()
    }

    fun buildPasswordEntry(
        option: BeginGetPasswordOption,
        sessionId: String,
        candidate: PasswordCandidate,
    ): PasswordCredentialEntry {
        val pendingIntent =
            PendingIntent.getActivity(
                context,
                0,
                ActivityIntentFactory
                    .activityIntent(
                        context = context,
                        target = ChromVoidPasswordGetActivity::class.java,
                        action = ACTION_PASSWORD_GET,
                        uniquePath = "password/get/$sessionId/${candidate.credentialId}",
                    )
                    .putExtra(ChromVoidCredentialProviderService.EXTRA_PASSWORD_SESSION_ID, sessionId)
                    .putExtra(ChromVoidCredentialProviderService.EXTRA_PASSWORD_CREDENTIAL_ID, candidate.credentialId),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
            )

        return PasswordCredentialEntry.Builder(
            context,
            candidate.username.ifBlank { candidate.label.ifBlank { candidate.domain.orEmpty() } },
            pendingIntent,
            option,
        ).apply {
            if (candidate.label.isNotBlank() && candidate.label != candidate.username) {
                setDisplayName(candidate.label)
            }
            if (!candidate.domain.isNullOrBlank()) {
                setAffiliatedDomain(candidate.domain)
            }
        }.build()
    }

    fun buildPasskeyCreateEntry(requestId: String): CreateEntry {
        val pendingIntent =
            PendingIntent.getActivity(
                context,
                0,
                ActivityIntentFactory
                    .activityIntent(
                        context = context,
                        target = ChromVoidPasskeyCreateActivity::class.java,
                        action = ACTION_PASSKEY_CREATE,
                        uniquePath = "passkey/create/$requestId",
                    )
                    .putExtra(ChromVoidCredentialProviderService.EXTRA_REQUEST_ID, requestId)
                    .putExtra(ChromVoidCredentialProviderService.EXTRA_COMMAND, "create"),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
            )
        return CreateEntry.Builder(
            context.getString(R.string.passkey_create_entry_title),
            pendingIntent,
        ).build()
    }

    companion object {
        private const val ACTION_PASSKEY_GET = "com.chromvoid.app.action.PASSKEY_GET"
        private const val ACTION_PASSWORD_GET = "com.chromvoid.app.action.PASSWORD_GET"
        private const val ACTION_PASSKEY_CREATE = "com.chromvoid.app.action.PASSKEY_CREATE"
    }
}
