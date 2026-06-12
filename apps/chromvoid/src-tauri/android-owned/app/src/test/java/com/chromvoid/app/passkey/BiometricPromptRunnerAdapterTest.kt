package com.chromvoid.app.passkey

import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.CreateCredentialInterruptedException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialInterruptedException
import androidx.fragment.app.FragmentActivity
import com.chromvoid.app.security.BiometricPromptRunner
import com.chromvoid.app.shared.CurrentActivityRegistry
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BiometricPromptRunnerAdapterTest {
    @Test
    fun authenticateAssertion_returnsInterruptedWhenPromptAlreadyActive() {
        val runner = BiometricPromptRunner(CurrentActivityRegistry())
        val adapter = BiometricPromptRunnerAdapter(runner)
        val activity = Robolectric.buildActivity(FragmentActivity::class.java).setup().get()
        var error: GetCredentialException? = null

        runner.withPromptLock {
            adapter.authenticateAssertion(
                activity = activity,
                onSuccess = {},
                onError = { error = it },
            )
            0
        }
        runner.finishPrompt()

        assertTrue(error is GetCredentialInterruptedException)
    }

    @Test
    fun authenticateCreate_returnsInterruptedWhenPromptAlreadyActive() {
        val runner = BiometricPromptRunner(CurrentActivityRegistry())
        val adapter = BiometricPromptRunnerAdapter(runner)
        val activity = Robolectric.buildActivity(FragmentActivity::class.java).setup().get()
        var error: CreateCredentialException? = null

        runner.withPromptLock {
            adapter.authenticateCreate(
                activity = activity,
                onSuccess = {},
                onError = { error = it },
            )
            0
        }
        runner.finishPrompt()

        assertTrue(error is CreateCredentialInterruptedException)
    }
}
