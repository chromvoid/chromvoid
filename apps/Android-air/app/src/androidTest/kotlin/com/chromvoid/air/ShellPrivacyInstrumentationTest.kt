package com.chromvoid.air

import android.os.PowerManager
import android.view.WindowManager
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.lifecycle.Lifecycle
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.access.ACCESS_PASSWORD_TAG
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.ExternalResource
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.RunWith

/**
 * The shell's privacy on a real device, under the release build's capture
 * policy: the window is secure from the first frame; with "Lock when leaving the app" on, leaving the foreground locks
 * the vault and coming back shows the unlock screen rather than whatever was
 * open before; with it off (the default, as on iOS) the vault stays open and
 * the window stays secure. Screen-off locking has its own default-off choice.
 * The orchestrator gives each test its own process and empty app data.
 */
@RunWith(AndroidJUnit4::class)
public class ShellPrivacyInstrumentationTest {
    /** The release policy, which the dev build relaxes so its screens can be captured. */
    private val released: TestRule = object : ExternalResource() {
        override fun before() {
            ScreenCapture.allowed = false
        }

        override fun after() {
            ScreenCapture.allowed = BuildConfig.SCREEN_CAPTURE_ALLOWED
        }
    }

    private val rule = createAndroidComposeRule<MainActivity>()

    @get:Rule
    public val rules: RuleChain = RuleChain.outerRule(released).around(rule)

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun theWindowIsSecureAndLeavingTheForegroundLocksTheVault() {
        assertTrue("vault content must never reach a screenshot or recents", windowIsSecure())
        AirAppGraph.of(rule.activity).sessionPreferences.lockOnLeave = true

        awaitState("first run") { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState("unlocked") { it is AirSessionState.Unlocked }
        rule.waitForIdle()
        rule.onNodeWithTag(VAULT_ROOT_TAG).assertIsDisplayed()

        rule.activityRule.scenario.moveToState(Lifecycle.State.CREATED)
        awaitState("locked after leaving the foreground") { it == AirSessionState.Locked }

        rule.activityRule.scenario.moveToState(Lifecycle.State.RESUMED)
        rule.waitForIdle()
        assertEquals(AirSessionState.Locked, session.state.value)
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG).assertIsDisplayed()
        assertEquals(
            "a locked shell shows no vault root",
            0,
            rule.onAllNodesWithTag(VAULT_ROOT_TAG).fetchSemanticsNodes().size,
        )
        assertTrue("the window stays secure after returning", windowIsSecure())
    }

    @Test
    public fun byDefaultLeavingTheForegroundKeepsTheVaultOpenBehindASecureWindow() {
        awaitState("first run") { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState("unlocked") { it is AirSessionState.Unlocked }
        val open = session.state.value

        rule.activityRule.scenario.moveToState(Lifecycle.State.CREATED)
        rule.activityRule.scenario.moveToState(Lifecycle.State.RESUMED)
        rule.waitForIdle()

        assertEquals("the same session is still open", open, session.state.value)
        assertTrue("the window stays secure", windowIsSecure())
        rule.onNodeWithTag(VAULT_ROOT_TAG).assertIsDisplayed()
    }

    @Test
    public fun turningTheScreenOffLocksTheVaultWhenEnabled() {
        val preferences = AirAppGraph.of(rule.activity).sessionPreferences
        val previousLockOnLeave = preferences.lockOnLeave
        val previousLockOnScreenOff = preferences.lockOnScreenOff
        val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
        try {
            preferences.lockOnLeave = false
            preferences.lockOnScreenOff = true
            awaitState("first run") { it == AirSessionState.NeedsAdministrator }
            runBlocking {
                assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
                assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
            }
            awaitState("unlocked") { it is AirSessionState.Unlocked }

            automation.executeShellCommand("input keyevent KEYCODE_SLEEP").close()
            awaitState("locked after the screen went off") { it == AirSessionState.Locked }
        } finally {
            automation.executeShellCommand("input keyevent KEYCODE_WAKEUP").close()
            preferences.lockOnLeave = previousLockOnLeave
            preferences.lockOnScreenOff = previousLockOnScreenOff
        }
    }

    @Test
    public fun byDefaultTurningTheScreenOffAndOnKeepsTheVaultOpen() {
        val preferences = AirAppGraph.of(rule.activity).sessionPreferences
        val previousLockOnLeave = preferences.lockOnLeave
        val previousLockOnScreenOff = preferences.lockOnScreenOff
        val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
        try {
            preferences.lockOnLeave = false
            preferences.lockOnScreenOff = false
            awaitState("first run") { it == AirSessionState.NeedsAdministrator }
            runBlocking {
                assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
                assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
            }
            awaitState("unlocked") { it is AirSessionState.Unlocked }
            val open = session.state.value

            automation.executeShellCommand("input keyevent KEYCODE_SLEEP").close()
            awaitScreenState(false)
            automation.executeShellCommand("input keyevent KEYCODE_WAKEUP").close()
            awaitScreenState(true)

            assertEquals("the same session is still open after the screen wakes", open, session.state.value)
        } finally {
            automation.executeShellCommand("input keyevent KEYCODE_WAKEUP").close()
            preferences.lockOnLeave = previousLockOnLeave
            preferences.lockOnScreenOff = previousLockOnScreenOff
        }
    }

    private fun windowIsSecure(): Boolean {
        var flags = 0
        rule.activityRule.scenario.onActivity { flags = it.window.attributes.flags }
        return flags and WindowManager.LayoutParams.FLAG_SECURE != 0
    }

    private fun awaitState(what: String, accept: (AirSessionState) -> Boolean) {
        val deadline = System.nanoTime() + STATE_TIMEOUT_NANOS
        while (!accept(session.state.value)) {
            check(System.nanoTime() < deadline) { "expected $what, still ${session.state.value}" }
            Thread.sleep(STATE_POLL_MILLIS)
        }
    }

    private fun awaitScreenState(active: Boolean) {
        val powerManager = rule.activity.getSystemService(PowerManager::class.java)
        val deadline = System.nanoTime() + STATE_TIMEOUT_NANOS
        while (true) {
            var foreground = false
            InstrumentationRegistry.getInstrumentation().runOnMainSync {
                foreground = rule.activity.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
            }
            val screenOn = powerManager.isInteractive
            // Waking may leave the app in the background behind the device's keyguard.
            if (screenOn == active && (active || !foreground)) return
            check(System.nanoTime() < deadline) {
                "expected screen=$active (background when asleep), still screen=$screenOn, foreground=$foreground"
            }
            Thread.sleep(STATE_POLL_MILLIS)
        }
    }

    private companion object {
        const val ADMINISTRATOR = "air-instrumentation-administrator"
        const val VAULT = "air-instrumentation-vault"
        const val VAULT_ROOT_TAG = "root-vault"
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val STATE_POLL_MILLIS = 50L
    }
}
