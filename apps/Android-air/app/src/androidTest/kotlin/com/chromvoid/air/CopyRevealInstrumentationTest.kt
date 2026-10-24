package com.chromvoid.air

import android.content.ClipboardManager
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.lifecycle.Lifecycle
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateSecrets
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.credentials.CATALOG_SEARCH_TAG
import com.chromvoid.air.ui.credentials.catalogRowTag
import com.chromvoid.air.ui.credentials.quickCopyTag
import com.chromvoid.air.ui.credentials.secretRevealTag
import com.chromvoid.air.ui.credentials.secretValueTag
import java.util.UUID
import com.chromvoid.air.presentation.R as PR
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Route A06 against real Core: one-tap copy from the list, reveal on the
 * record page, and a lock that takes back both - the revealed value and what
 * was copied.
 */
@RunWith(AndroidJUnit4::class)
public class CopyRevealInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun copyAndRevealAreTakenBackByALock() {
        // Leaving the app is what locks here; the setting is off by default.
        AirAppGraph.of(rule.activity).sessionPreferences.lockOnLeave = true
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState { it is AirSessionState.Unlocked }
        val generation = (session.state.value as AirSessionState.Unlocked).generation
        val id = runBlocking {
            session.credentials.createCredential(
                PassmanagerEntryCreateRequest(
                    entryID = UUID.randomUUID().toString(),
                    entryType = "login",
                    secrets = PassmanagerEntryCreateSecrets(password = SECRET),
                    title = "Почта",
                    username = "alice",
                ),
                generation,
            ).entryID
        }
        rule.onNodeWithTag(CATALOG_SEARCH_TAG).performTextInput("поч")
        awaitNode(catalogRowTag(id))

        rule.onNodeWithTag(quickCopyTag(id)).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { feedback().isNotEmpty() }
        assertEquals("the catalog confirmed the copy: ${feedback()}", SECRET, clipText())

        rule.onNodeWithTag(catalogRowTag(id)).performClick()
        awaitNode(secretRevealTag("password"))
        rule.onNodeWithTag(secretRevealTag("password")).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            rule.onAllNodesWithTag(secretValueTag("password"), useUnmergedTree = true)
                .fetchSemanticsNodes()
                .any { node -> node.config.toString().contains(SECRET) }
        }

        rule.activityRule.scenario.moveToState(Lifecycle.State.CREATED)
        awaitState { it == AirSessionState.Locked }
        rule.activityRule.scenario.moveToState(Lifecycle.State.RESUMED)
        rule.waitForIdle()

        assertNotEquals("the copied password is taken back", SECRET, clipText())
        assertEquals("nothing of the record is left on screen", 0, revealedNodes())
    }

    /** The catalog's confirmation or its explanation, whichever it showed. */
    private fun feedback(): String = listOf(
        PR.string.vault_copied,
        PR.string.secret_issue_empty,
        PR.string.secret_issue_too_large,
        PR.string.secret_issue_failed,
    ).map { rule.activity.getString(it) }
        .firstOrNull { text -> rule.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() }
        .orEmpty()

    private fun revealedNodes(): Int =
        rule.onAllNodesWithTag(secretValueTag("password"), useUnmergedTree = true).fetchSemanticsNodes().size

    private fun clipText(): String? {
        var text: String? = null
        rule.runOnUiThread {
            val manager = rule.activity.getSystemService(ClipboardManager::class.java)
            text = manager.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.text?.toString()
        }
        return text
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
        const val SECRET = "synthetic-password-1"
        const val NODE_TIMEOUT_MILLIS = 10_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
