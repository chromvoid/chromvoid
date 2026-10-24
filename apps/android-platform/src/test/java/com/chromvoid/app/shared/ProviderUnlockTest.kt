package com.chromvoid.app.shared

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialInterruptedException
import androidx.credentials.provider.PendingIntentHandler
import com.chromvoid.app.ChromVoidCredentialProviderService
import com.chromvoid.app.ChromVoidPasskeyCreateActivity
import com.chromvoid.app.credentialprovider.BridgeResult
import com.chromvoid.app.credentialprovider.ProviderStatus
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/** A locked vault's provider requests go through the host's unlock screen, then on as asked. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ProviderUnlockTest {
    private class Bridge : BaseFakeBridgeGateway() {
        var vaultOpen = false

        override fun providerStatus(): BridgeResult<ProviderStatus> =
            BridgeResult.Success(
                ProviderStatus(
                    runtimeReady = true,
                    enabled = true,
                    vaultOpen = vaultOpen,
                    apiLevel = 34,
                    passwordProviderState = "ready",
                    passkeysLiteState = "ready",
                    autofillFallbackState = "ready",
                    unsupportedReason = null,
                ),
            )
    }

    private val bridge = Bridge()

    @Before
    fun setUp() {
        installTestAppGraph(TestAndroidAppGraph(bridgeGateway = bridge))
        PlatformHost.installProviderUnlock { context -> Intent(UNLOCK).setPackage(context.packageName) }
    }

    @After
    fun tearDown() {
        resetTestAppGraph()
        PlatformHost.clearForTests()
    }

    @Test
    fun anUnlockAskedForNothingElseAnswersPlainSuccess() {
        val context = org.robolectric.RuntimeEnvironment.getApplication()
        assertNotNull(ProviderUnlock.result(context, Intent(UNLOCK)))
    }

    @Test
    fun aPasskeyAskedOfALockedVaultOpensTheUnlockFirst() {
        val controller = Robolectric.buildActivity(ChromVoidPasskeyCreateActivity::class.java, createIntent()).setup()
        val started = shadowOf(controller.get()).nextStartedActivityForResult

        assertEquals(UNLOCK, started.intent.action)
        assertTrue("the creation waits for the unlock", !controller.get().isFinishing)
    }

    @Test
    fun leavingTheUnlockCreatesNothing() {
        val controller = Robolectric.buildActivity(ChromVoidPasskeyCreateActivity::class.java, createIntent()).setup()
        val activity = controller.get()
        val started = shadowOf(activity).nextStartedActivityForResult

        shadowOf(activity).receiveResult(started.intent, Activity.RESULT_CANCELED, null)

        assertTrue(activity.isFinishing)
        val result = checkNotNull(shadowOf(activity).resultIntent)
        assertTrue(PendingIntentHandler.retrieveCreateCredentialException(result) is CreateCredentialCancellationException)
    }

    @Test
    fun anOpenedVaultGoesOnWithTheCreation() {
        val controller = Robolectric.buildActivity(ChromVoidPasskeyCreateActivity::class.java, createIntent()).setup()
        val activity = controller.get()
        val started = shadowOf(activity).nextStartedActivityForResult
        bridge.vaultOpen = true

        shadowOf(activity).receiveResult(started.intent, Activity.RESULT_OK, Intent())

        // The coordinator ran: this test registered no request, so it ends there, not at the lock.
        val result = checkNotNull(shadowOf(activity).resultIntent)
        assertTrue(PendingIntentHandler.retrieveCreateCredentialException(result) is CreateCredentialInterruptedException)
        assertNull(shadowOf(activity).nextStartedActivityForResult)
    }

    @Test
    fun anOpenVaultCreatesWithoutAnUnlock() {
        bridge.vaultOpen = true
        val controller = Robolectric.buildActivity(ChromVoidPasskeyCreateActivity::class.java, createIntent()).setup()
        assertNull(shadowOf(controller.get()).nextStartedActivityForResult)
    }

    private fun createIntent(): Intent =
        Intent().putExtra(ChromVoidCredentialProviderService.EXTRA_REQUEST_ID, "req-create").putExtras(Bundle())

    private companion object {
        const val UNLOCK = "com.chromvoid.test.UNLOCK"
    }
}
