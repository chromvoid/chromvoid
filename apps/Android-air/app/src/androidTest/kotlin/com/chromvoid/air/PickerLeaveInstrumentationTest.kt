package com.chromvoid.air

import android.accessibilityservice.AccessibilityService
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToKey
import androidx.lifecycle.Lifecycle
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.maintenance.BACKUP_DESTINATION_TAG
import com.chromvoid.air.ui.maintenance.BACKUP_PASSWORD_TAG
import com.chromvoid.air.ui.settings.SETTINGS_BACKUP_TAG
import com.chromvoid.air.ui.settings.SETTINGS_LIST_TAG
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * With "Lock when leaving the app" on, the system folder picker the backup
 * screen opens is part of the backup, not leaving the app: the vault stays
 * open and the screen is still there on return. Leaving for the home screen
 * still locks.
 */
@RunWith(AndroidJUnit4::class)
public class PickerLeaveInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val graph get() = AirAppGraph.of(rule.activity)
    private val session get() = graph.session
    private val automation get() = InstrumentationRegistry.getInstrumentation().uiAutomation

    @Test
    public fun theFolderPickerIsNotLeavingTheApp() {
        graph.sessionPreferences.lockOnLeave = true
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState { it is AirSessionState.Unlocked }
        val open = session.state.value
        awaitNode(ROOT_SETTINGS_TAG)
        rule.onNodeWithTag(ROOT_SETTINGS_TAG).performClick()
        rule.onNodeWithTag(SETTINGS_LIST_TAG).performScrollToKey("storage")
        rule.onNodeWithTag(SETTINGS_BACKUP_TAG).performClick()
        awaitNode(BACKUP_DESTINATION_TAG)

        rule.onNodeWithTag(BACKUP_DESTINATION_TAG).performClick()
        awaitResumed(false)
        Thread.sleep(PICKER_SETTLE_MILLIS)
        assertEquals("the picker did not lock the vault", open, session.state.value)

        leavePicker()
        assertEquals("the vault is still open on return", open, session.state.value)
        awaitNode(BACKUP_PASSWORD_TAG)

        // Leaving for the home screen is still leaving.
        automation.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)
        awaitResumed(false)
        awaitState { it == AirSessionState.Locked }
        assertTrue(session.state.value == AirSessionState.Locked)
    }

    /** Back out of the picker; a slow device may take the first press before the picker has focus. */
    private fun leavePicker() {
        repeat(BACK_ATTEMPTS) {
            automation.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
            val deadline = System.nanoTime() + BACK_WAIT_NANOS
            while (System.nanoTime() < deadline) {
                if (resumed()) return
                Thread.sleep(POLL_MILLIS)
            }
        }
        check(resumed()) { "the app is still away" }
    }

    private fun resumed(): Boolean {
        var current = false
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            current = rule.activity.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
        }
        return current
    }

    private fun awaitResumed(resumed: Boolean) {
        val deadline = System.nanoTime() + STATE_TIMEOUT_NANOS
        while (true) {
            var current = false
            InstrumentationRegistry.getInstrumentation().runOnMainSync {
                current = rule.activity.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
            }
            if (current == resumed) return
            check(System.nanoTime() < deadline) { "the app is still ${if (resumed) "away" else "in front"}" }
            Thread.sleep(POLL_MILLIS)
        }
    }

    private fun awaitNode(tag: String) {
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { rule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty() }
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
        const val ROOT_SETTINGS_TAG = "root-settings"
        const val PICKER_SETTLE_MILLIS = 2_000L
        const val BACK_ATTEMPTS = 3
        const val BACK_WAIT_NANOS = 5_000_000_000L
        const val NODE_TIMEOUT_MILLIS = 30_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
