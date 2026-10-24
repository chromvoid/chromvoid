package com.chromvoid.air

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToKey
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateSecrets
import com.chromvoid.air.bridge.wire.PassmanagerEntryPageRequest
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.credentials.CATALOG_EMPTY_TAG
import com.chromvoid.air.ui.credentials.CATALOG_SELECT_TAG
import com.chromvoid.air.ui.credentials.CATALOG_TOOLS_TAG
import com.chromvoid.air.ui.credentials.DETAIL_DELETE_CONFIRM_TAG
import com.chromvoid.air.ui.credentials.DETAIL_DELETE_TAG
import com.chromvoid.air.ui.credentials.DETAIL_LIST_TAG
import com.chromvoid.air.ui.credentials.SELECTION_CONFIRM_TAG
import com.chromvoid.air.ui.credentials.SELECTION_DELETE_TAG
import com.chromvoid.air.ui.credentials.catalogRowTag
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Route A13 against real Core: two records deleted together, the third from its page. */
@RunWith(AndroidJUnit4::class)
public class DeleteRouteInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun recordsAreDeletedTogetherAndOneByOne() {
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState { it is AirSessionState.Unlocked }
        val generation = (session.state.value as AirSessionState.Unlocked).generation
        val ids = listOf("Почта", "Банк", "Карта").map { title -> create(generation, title) }
        ids.forEach { awaitNode(catalogRowTag(it)) }

        rule.onNodeWithTag(CATALOG_TOOLS_TAG).performClick()
        rule.waitUntil(10_000) { rule.onAllNodesWithTag(CATALOG_SELECT_TAG).fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithTag(CATALOG_SELECT_TAG).performClick()
        rule.onNodeWithTag(catalogRowTag(ids[0])).performClick()
        rule.onNodeWithTag(catalogRowTag(ids[1])).performClick()
        rule.onNodeWithTag(SELECTION_DELETE_TAG).performClick()
        awaitNode(SELECTION_CONFIRM_TAG)
        rule.onNodeWithTag(SELECTION_CONFIRM_TAG).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            count(catalogRowTag(ids[0])) == 0 && count(catalogRowTag(ids[1])) == 0
        }

        rule.onNodeWithTag(catalogRowTag(ids[2])).performClick()
        awaitNode(DETAIL_LIST_TAG)
        // Reach the action itself; expanded layouts reserve only the system navigation inset
        // after this row, while phone layouts also clear the floating tab bar.
        rule.onNodeWithTag(DETAIL_LIST_TAG).performScrollToKey("delete")
        rule.onNodeWithTag(DETAIL_DELETE_TAG).performClick()
        awaitNode(DETAIL_DELETE_CONFIRM_TAG)
        rule.onNodeWithTag(DETAIL_DELETE_CONFIRM_TAG).performClick()
        awaitNode(CATALOG_EMPTY_TAG)

        val left = runBlocking {
            val everything = PassmanagerEntryPageRequest(limit = 50, offset = 0, query = "")
            session.credentials.credentialPage(everything, generation).entries
        }
        assertEquals(emptyList<Any>(), left)
    }

    private fun create(generation: ULong, title: String): String = runBlocking {
        session.credentials.createCredential(
            PassmanagerEntryCreateRequest(
                entryID = UUID.randomUUID().toString(),
                entryType = "login",
                secrets = PassmanagerEntryCreateSecrets(password = "synthetic"),
                title = title,
            ),
            generation,
        ).entryID
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
