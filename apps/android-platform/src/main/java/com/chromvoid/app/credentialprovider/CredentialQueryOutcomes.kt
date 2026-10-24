package com.chromvoid.app.credentialprovider

import androidx.credentials.exceptions.GetCredentialException

internal sealed interface PasskeyQueryOutcome {
    data object NoEntries : PasskeyQueryOutcome

    data class EntriesAdded(
        val count: Int,
    ) : PasskeyQueryOutcome

    data class Error(
        val exception: GetCredentialException,
        /** The bridge's code, when the error came from it. */
        val code: String? = null,
    ) : PasskeyQueryOutcome
}

internal sealed interface PasswordQueryOutcome {
    data object NoEntries : PasswordQueryOutcome

    data class EntriesAdded(
        val count: Int,
    ) : PasswordQueryOutcome

    data class Error(
        val exception: GetCredentialException,
        /** The bridge's code, when the error came from it. */
        val code: String? = null,
    ) : PasswordQueryOutcome
}
