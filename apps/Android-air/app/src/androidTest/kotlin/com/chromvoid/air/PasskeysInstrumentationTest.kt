package com.chromvoid.air

import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.bridge.AirRuntimeClient
import com.chromvoid.air.bridge.preparePasskeyFixture
import com.chromvoid.air.bridge.wire.VaultPasskeySummary
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.credentials.CATALOG_PASSKEYS_TAG
import com.chromvoid.air.ui.passkeys.PASSKEYS_BACK_TAG
import com.chromvoid.air.ui.passkeys.PASSKEYS_SEARCH_TAG
import com.chromvoid.air.ui.passkeys.PASSKEYS_TAG
import com.chromvoid.air.ui.passkeys.PASSKEY_DELETE_CONFIRM_TAG
import com.chromvoid.air.ui.passkeys.PASSKEY_DELETE_TAG
import com.chromvoid.air.ui.passkeys.PASSKEY_DETAIL_TAG
import com.chromvoid.air.ui.passkeys.passkeyRowTag
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.ExternalResource
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.RunWith

/**
 * Route A18 against real Core. Before the app opens, Core's own provider
 * owner creates two synthetic passkeys in a separate seeding runtime; the app
 * then opens its ordinary runtime on the same storage. The vault shows them
 * on its Passkeys tile; the page finds one by its account, shows its details
 * and deletes it from the vault after the person confirms, which Core's list
 * and the tile then agree with.
 */
@RunWith(AndroidJUnit4::class)
public class PasskeysInstrumentationTest {
    private val seeded: TestRule = object : ExternalResource() {
        override fun before() {
            runBlocking {
                AirRuntimeClient.preparePasskeyFixture(ApplicationProvider.getApplicationContext(), VAULT)
            }
        }
    }

    private val compose = createAndroidComposeRule<MainActivity>()

    @get:Rule
    public val rules: RuleChain = RuleChain.outerRule(seeded).around(compose)

    private val rule get() = compose
    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun seededPasskeysAreListedFoundAndOneIsDeleted() {
        awaitState { it == AirSessionState.Locked }
        runBlocking { assertEquals(AccessOutcome.Accepted, session.unlock(VAULT)) }
        awaitState { it is AirSessionState.Unlocked }
        val generation = (session.state.value as AirSessionState.Unlocked).generation
        val passkeys = runBlocking { session.passkeys.listPasskeys(generation).passkeys }
        assertEquals(setOf("login.example.test", "docs.example.test"), passkeys.map { it.rpID }.toSet())
        val docs = passkeys.single { it.rpID == "docs.example.test" }

        awaitNode(CATALOG_PASSKEYS_TAG)
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { tileSays("2") }
        rule.onNodeWithTag(CATALOG_PASSKEYS_TAG).performScrollTo().performClick()
        awaitNode(PASSKEYS_TAG)
        awaitNode(passkeyRowTag(docs.credentialIDB64URL))

        // Found by the account, whatever script it is written in.
        rule.onNodeWithTag(PASSKEYS_SEARCH_TAG).performTextInput("bob@")
        val login = passkeyRowTag(other(passkeys, docs))
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { rule.onAllNodesWithTag(login).fetchSemanticsNodes().isEmpty() }
        val row = rule.onNodeWithTag(passkeyRowTag(docs.credentialIDB64URL))
        row.assertTextContains("docs.example.test", substring = true)
        row.performClick()
        awaitNode(PASSKEY_DETAIL_TAG)
        rule.onNodeWithText("Боб").assertExists()

        // Deleted from this vault after confirming; Core's list agrees.
        rule.onNodeWithTag(PASSKEY_DELETE_TAG).performScrollTo().performClick()
        awaitNode(PASSKEY_DELETE_CONFIRM_TAG)
        rule.onNodeWithTag(PASSKEY_DELETE_CONFIRM_TAG).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            val left = runBlocking { session.passkeys.listPasskeys(generation).passkeys }
            left.map { it.rpID } == listOf("login.example.test")
        }
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            rule.onAllNodes(hasText("Passkey deleted from this vault.")).fetchSemanticsNodes().isNotEmpty()
        }
        rule.onNodeWithTag(PASSKEYS_BACK_TAG).performClick()
        awaitNode(CATALOG_PASSKEYS_TAG)
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { tileSays("1") }
    }

    private fun other(all: List<VaultPasskeySummary>, one: VaultPasskeySummary): String =
        all.single { it != one }.credentialIDB64URL

    private fun tileSays(count: String): Boolean =
        runCatching {
            rule.onNodeWithTag(CATALOG_PASSKEYS_TAG).assertTextContains(count)
        }.isSuccess

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
        const val VAULT = "air-instrumentation-vault"
        const val NODE_TIMEOUT_MILLIS = 20_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
