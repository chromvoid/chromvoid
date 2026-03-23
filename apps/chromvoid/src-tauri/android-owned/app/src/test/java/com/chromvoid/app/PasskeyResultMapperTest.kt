package com.chromvoid.app

import androidx.credentials.exceptions.CreateCredentialInterruptedException
import androidx.credentials.exceptions.CreateCredentialNoCreateOptionException
import androidx.credentials.exceptions.CreateCredentialUnknownException
import androidx.credentials.exceptions.CreateCredentialUnsupportedException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialInterruptedException
import androidx.credentials.exceptions.GetCredentialUnknownException
import androidx.credentials.exceptions.NoCredentialException
import com.chromvoid.app.credentialprovider.BridgeError
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PasskeyResultMapperTest {
    @Test
    fun getException_mapsUnsupportedToNoCredential() {
        val exception = PasskeyResultMapper.getException(response("UNSUPPORTED", "unsupported"))

        assertTrue(exception is NoCredentialException)
    }

    @Test
    fun getException_mapsPolicyAndVaultFailuresToInterrupted() {
        val policy = PasskeyResultMapper.getException(response("POLICY_DENIED", "policy"))
        val locked = PasskeyResultMapper.getException(response("VAULT_REQUIRED", "locked"))

        assertTrue(policy is GetCredentialInterruptedException)
        assertTrue(locked is GetCredentialInterruptedException)
    }

    @Test
    fun getException_mapsCancellationAndUnknown() {
        val cancelled = PasskeyResultMapper.getException(response("USER_CANCELLED", "cancelled"))
        val unknown = PasskeyResultMapper.getException(response("SOMETHING_ELSE", ""))

        assertTrue(cancelled is GetCredentialCancellationException)
        assertTrue(unknown is GetCredentialUnknownException)
    }

    @Test
    fun createException_mapsExpectedFailureTypes() {
        val unsupported = PasskeyResultMapper.createException(response("UNSUPPORTED", "unsupported"))
        val noCreateOptions = PasskeyResultMapper.createException(response("NO_CREATE_OPTIONS", "excluded"))
        val interrupted = PasskeyResultMapper.createException(response("PROVIDER_UNAVAILABLE", "down"))
        val unknown = PasskeyResultMapper.createException(response("UNKNOWN", ""))

        assertTrue(unsupported is CreateCredentialUnsupportedException)
        assertTrue(noCreateOptions is CreateCredentialNoCreateOptionException)
        assertTrue(interrupted is CreateCredentialInterruptedException)
        assertTrue(unknown is CreateCredentialUnknownException)
    }

    @Test
    fun getException_usesFallbackMessageForUnknownFailures() {
        val exception = PasskeyResultMapper.getException(response("UNKNOWN", ""))

        assertTrue(exception is GetCredentialUnknownException)
        assertEquals("ChromVoid passkey retrieval failed.", exception.message)
    }

    @Test
    fun createException_usesFallbackMessageForUnknownFailures() {
        val exception = PasskeyResultMapper.createException(response("UNKNOWN", ""))

        assertTrue(exception is CreateCredentialUnknownException)
        assertEquals("ChromVoid passkey creation failed.", exception.message)
    }

    @Test
    fun getException_mapsProviderUnavailableAndDisabledToInterrupted() {
        val unavailable = PasskeyResultMapper.getException(response("PROVIDER_UNAVAILABLE", "down"))
        val disabled = PasskeyResultMapper.getException(response("PROVIDER_DISABLED", "disabled"))

        assertTrue(unavailable is GetCredentialInterruptedException)
        assertTrue(disabled is GetCredentialInterruptedException)
    }

    @Test
    fun createException_mapsVaultRequiredAndDisabledToInterrupted() {
        val locked = PasskeyResultMapper.createException(response("VAULT_REQUIRED", "locked"))
        val disabled = PasskeyResultMapper.createException(response("PROVIDER_DISABLED", "disabled"))

        assertTrue(locked is CreateCredentialInterruptedException)
        assertTrue(disabled is CreateCredentialInterruptedException)
    }

    private fun response(code: String, message: String): BridgeError {
        return BridgeError(
            code = code,
            message = message,
        )
    }
}
