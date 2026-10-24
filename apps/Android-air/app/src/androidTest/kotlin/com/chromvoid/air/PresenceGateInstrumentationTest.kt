package com.chromvoid.air

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToKey
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.settings.SETTINGS_PRESENCE_ISSUE_TAG
import com.chromvoid.air.ui.settings.SETTINGS_LIST_TAG
import com.chromvoid.air.ui.settings.SETTINGS_PRESENCE_TAG
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The app-presence gate on a device with no screen lock: turning it on reaches
 * the system's biometric check through the shared platform, which reports that
 * the device cannot authenticate, and the gate stays off and says why. Devices
 * with a screen lock are skipped - their prompt needs a person.
 */
@RunWith(AndroidJUnit4::class)
public class PresenceGateInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun aDeviceWithoutAuthenticationKeepsTheGateOff() {
        val available = BiometricManager.from(rule.activity).canAuthenticate(BIOMETRIC_STRONG or DEVICE_CREDENTIAL)
        assumeTrue(available != BiometricManager.BIOMETRIC_SUCCESS)
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState { it is AirSessionState.Unlocked }
        awaitNode("root-settings")
        rule.onNodeWithTag("root-settings").performClick()
        // App access sits below the fold of a lazy list; bring its section into composition.
        awaitNode(SETTINGS_LIST_TAG)
        rule.onNodeWithTag(SETTINGS_LIST_TAG).performScrollToKey("app-access")
        awaitNode(SETTINGS_PRESENCE_TAG)
        // The row may start under the floating tab bar; bring it up before tapping it.
        rule.onNodeWithTag(SETTINGS_PRESENCE_TAG).performScrollTo().performClick()

        awaitNode(SETTINGS_PRESENCE_ISSUE_TAG)
        rule.onNodeWithTag(SETTINGS_PRESENCE_TAG).assertIsOff()
    }

    private fun awaitNode(tag: String) {
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            rule.onAllNodesWithTag(tag, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()
        }
    }

    private fun awaitState(accept: (AirSessionState) -> Boolean) {
        val deadline = System.nanoTime() + STATE_TIMEOUT_NANOS
        while (!accept(session.state.value)) {
            check(System.nanoTime() < deadline) { "session still ${session.state.value}" }
            Thread.sleep(POLL_MILLIS)
        }
    }

    private companion object {
        const val ADMINISTRATOR = "air-instrumentation-administrator"
        const val VAULT = "air-instrumentation-vault"
        const val NODE_TIMEOUT_MILLIS = 20_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
