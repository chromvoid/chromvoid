package com.chromvoid.air

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.ui.BRIDGE_PROBE_STATUS_TAG
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The W1 acceptance check on a real device or emulator: the application loads
 * the native library, hands over the process context, agrees with its bindings
 * and completes one synthetic round trip. A failure surfaces the bridge error
 * code on screen, so this test fails with a diagnosable reason rather than a
 * bare timeout.
 */
@RunWith(AndroidJUnit4::class)
public class BridgeProbeInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<BridgeProbeActivity>()

    @Test
    public fun theNativeBridgeReportsItselfReady() {
        val ready = rule.activity.getString(R.string.bridge_probe_ready)
        rule.waitUntil(timeoutMillis = READY_TIMEOUT_MILLIS) {
            rule.onAllNodesWithText(ready).fetchSemanticsNodes().isNotEmpty()
        }
        rule.onNodeWithTag(BRIDGE_PROBE_STATUS_TAG).assertIsDisplayed()
    }

    private companion object {
        const val READY_TIMEOUT_MILLIS = 30_000L
    }
}
