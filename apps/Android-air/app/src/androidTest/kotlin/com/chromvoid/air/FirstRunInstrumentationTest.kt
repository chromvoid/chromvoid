package com.chromvoid.air

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.bridge.wire.PassmanagerEntryPageRequest
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.access.ACCESS_CONFIRMATION_TAG
import com.chromvoid.air.ui.access.ACCESS_ERROR_TAG
import com.chromvoid.air.ui.access.ACCESS_PASSWORD_TAG
import com.chromvoid.air.ui.access.ACCESS_SUBMIT_TAG
import com.chromvoid.air.ui.access.WELCOME_CONTINUE_TAG
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Routes A01 and A02 against real Core, through the screens rather than the
 * session: the welcome, the administrative password with its mismatch, the
 * locked screen, and a vault that opens empty - which is a new vault, not a
 * wrong password.
 */
@RunWith(AndroidJUnit4::class)
public class FirstRunInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun theFirstRunSetsUpAndOpensAnEmptyVault() {
        awaitState("first run") { it == AirSessionState.NeedsAdministrator }

        // The welcome comes first; the password screen is behind it.
        awaitNode(WELCOME_CONTINUE_TAG)
        assertEquals(0, count(ACCESS_PASSWORD_TAG))
        rule.onNodeWithTag(WELCOME_CONTINUE_TAG).performScrollTo().performClick()

        awaitNode(ACCESS_CONFIRMATION_TAG)
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG).performTextInput(ADMINISTRATOR)
        rule.onNodeWithTag(ACCESS_CONFIRMATION_TAG).performTextInput("$ADMINISTRATOR-typo")
        rule.onNodeWithTag(ACCESS_SUBMIT_TAG).performScrollTo().performClick()

        // A mismatch is explained here and never reaches Core.
        awaitNode(ACCESS_ERROR_TAG)
        assertEquals(AirSessionState.NeedsAdministrator, session.state.value)

        rule.onNodeWithTag(ACCESS_CONFIRMATION_TAG).performTextReplacement(ADMINISTRATOR)
        rule.onNodeWithTag(ACCESS_SUBMIT_TAG).performScrollTo().performClick()
        awaitState("locked after setup") { it == AirSessionState.Locked }

        // The locked screen asks for the vault password, with no confirmation.
        awaitNode(ACCESS_PASSWORD_TAG)
        assertEquals(0, count(ACCESS_CONFIRMATION_TAG))
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG).performTextInput(VAULT)
        rule.onNodeWithTag(ACCESS_SUBMIT_TAG).performScrollTo().performClick()
        awaitState("unlocked") { it is AirSessionState.Unlocked }

        // A new vault opens empty: a vault password over an empty vault is
        // accepted, never reported as wrong. What that empty vault looks like
        // is `VaultRootTest`; here the route itself is what is proven.
        val generation = (session.state.value as AirSessionState.Unlocked).generation
        val page = runBlocking {
            session.credentials.credentialPage(
                PassmanagerEntryPageRequest(limit = 50, offset = 0, query = ""),
                generation,
            )
        }
        assertEquals(0, page.entries.size)
    }

    private fun count(tag: String): Int = rule.onAllNodesWithTag(tag).fetchSemanticsNodes().size

    private fun awaitNode(tag: String) {
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { count(tag) > 0 }
    }

    private fun awaitState(what: String, accept: (AirSessionState) -> Boolean) {
        val deadline = System.nanoTime() + STATE_TIMEOUT_NANOS
        while (!accept(session.state.value)) {
            check(System.nanoTime() < deadline) { "$what: session still ${session.state.value}" }
            Thread.sleep(POLL_MILLIS)
        }
    }

    private companion object {
        const val ADMINISTRATOR = "air-instrumentation-administrator"
        const val VAULT = "air-instrumentation-vault"
        const val NODE_TIMEOUT_MILLIS = 15_000L
        const val STATE_TIMEOUT_NANOS = 20_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
