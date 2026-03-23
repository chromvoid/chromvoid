package com.chromvoid.app

import android.content.Context
import android.os.Build
import androidx.biometric.BiometricManager
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.app.nativebridge.BiometricNativeShell
import com.chromvoid.app.nativebridge.CredentialProviderNativeShell
import com.chromvoid.app.nativebridge.PasswordSaveNativeShell
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AndroidRuntimeBridgeInstrumentationTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun credentialProviderNativeShell_autofillSelectionQueryDoesNotCrash() {
        CredentialProviderNativeShell.appAutofillProviderSelected()
    }

    @Test
    fun credentialProviderNativeShell_currentApiLevelUsesSafeAndroidRuntimePath() {
        assertEquals(Build.VERSION.SDK_INT, CredentialProviderNativeShell.currentApiLevel())
    }

    @Test
    fun passwordSaveNativeShell_completeReviewWithoutActiveRequestDoesNotCrash() {
        PasswordSaveNativeShell.completeReview(
            token = "missing-token",
            outcome = "dismissed",
            finished = false,
        )
    }

    @Test
    fun biometricNativeShell_availabilityQueryDoesNotCrash() {
        val result = BiometricNativeShell.biometricPromptAvailable(context)

        assertTrue(
            result == BiometricManager.BIOMETRIC_SUCCESS ||
                result == BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE ||
                result == BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE ||
                result == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ||
                result == BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED ||
                result == BiometricManager.BIOMETRIC_ERROR_UNSUPPORTED ||
                result == BiometricManager.BIOMETRIC_STATUS_UNKNOWN ||
                result == -1003,
        )
    }
}
