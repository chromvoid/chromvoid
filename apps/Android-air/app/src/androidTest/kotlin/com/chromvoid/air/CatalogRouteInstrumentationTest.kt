package com.chromvoid.air

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateSecrets
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.credentials.CATALOG_CLEAR_SEARCH_TAG
import com.chromvoid.air.ui.credentials.CATALOG_NO_MATCH_TAG
import com.chromvoid.air.ui.credentials.CATALOG_SEARCH_TAG
import com.chromvoid.air.ui.credentials.DETAIL_TITLE_TAG
import com.chromvoid.air.ui.credentials.DETAIL_USERNAME_TAG
import com.chromvoid.air.ui.credentials.catalogRowTag
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Route A05 against real Core: search the catalog, open a record, go back with
 * the system back gesture and find the same search and result.
 */
@RunWith(AndroidJUnit4::class)
public class CatalogRouteInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun searchOpenAndBackReturnToTheSameResults() {
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState { it is AirSessionState.Unlocked }
        val generation = (session.state.value as AirSessionState.Unlocked).generation
        val ids = runBlocking {
            listOf("Почта" to "alice", "GitHub" to "octo", "Банк" to "alice").associate { (title, login) ->
                title to session.credentials.createCredential(
                    PassmanagerEntryCreateRequest(
                        entryID = java.util.UUID.randomUUID().toString(),
                        entryType = "login",
                        secrets = PassmanagerEntryCreateSecrets(password = "synthetic"),
                        title = title,
                        username = login,
                    ),
                    generation,
                ).entryID
            }
        }
        val github = ids.getValue("GitHub")
        val mail = ids.getValue("Почта")

        // The catalog read before the records existed; the runtime's change
        // event makes it read again without anyone asking.
        awaitNode(catalogRowTag(mail))

        rule.onNodeWithTag(CATALOG_SEARCH_TAG).performTextInput("git")
        // GitHub was already listed; the search has landed when Mail is gone.
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { count(catalogRowTag(mail)) == 0 }
        awaitNode(catalogRowTag(github))

        rule.onNodeWithTag(catalogRowTag(github)).performClick()
        awaitNode(DETAIL_USERNAME_TAG)
        rule.onNodeWithTag(DETAIL_TITLE_TAG).assertTextContains("GitHub")

        rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }
        rule.waitForIdle()
        rule.onNodeWithTag(CATALOG_SEARCH_TAG).assertTextContains("git")
        rule.onNodeWithTag(catalogRowTag(github)).assertIsDisplayed()
        assertEquals(0, count(catalogRowTag(mail)))

        rule.onNodeWithTag(CATALOG_SEARCH_TAG).performTextInput("zzz")
        awaitNode(CATALOG_NO_MATCH_TAG)
        rule.onNodeWithTag(CATALOG_CLEAR_SEARCH_TAG).performClick()
        awaitNode(catalogRowTag(mail))
        rule.onNodeWithTag(catalogRowTag(ids.getValue("Банк"))).assertIsDisplayed()
    }

    private fun count(tag: String): Int = rule.onAllNodesWithTag(tag).fetchSemanticsNodes().size

    private fun awaitNode(tag: String) {
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { count(tag) > 0 }
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
        const val NODE_TIMEOUT_MILLIS = 10_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
