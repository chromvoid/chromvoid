package com.chromvoid.air

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.printToString
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateSecrets
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.credentials.codesCollectionRowTag
import com.chromvoid.air.ui.credentials.CATALOG_CODES_TAG
import com.chromvoid.air.ui.credentials.DETAIL_EDIT_TAG
import com.chromvoid.air.ui.credentials.FORM_CODES_TAG
import com.chromvoid.air.ui.credentials.FORM_CLOSE_TAG
import com.chromvoid.air.ui.credentials.CODES_MANAGER_DONE_TAG
import com.chromvoid.air.ui.credentials.CODES_ADD_TAG
import com.chromvoid.air.ui.credentials.CODE_DELETE_CONFIRM_TAG
import com.chromvoid.air.ui.credentials.CODE_KEY_TAG
import com.chromvoid.air.ui.credentials.CODE_LABEL_TAG
import com.chromvoid.air.ui.credentials.CODE_SAVE_TAG
import com.chromvoid.air.ui.credentials.DETAIL_BACK_TAG
import com.chromvoid.air.ui.credentials.DETAIL_TITLE_TAG
import com.chromvoid.air.ui.credentials.catalogRowTag
import com.chromvoid.air.ui.credentials.codeCopyTag
import com.chromvoid.air.ui.credentials.codeDeleteTag
import com.chromvoid.air.ui.credentials.codeValueTag
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Route A16 against real Core: a setup key typed by hand becomes a code on the
 * record, Core computes a six-digit code that is shown and copied, and the
 * code is removed after a confirmation.
 */
@RunWith(AndroidJUnit4::class)
public class CodesRouteInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun aTypedKeyGivesCodesThatAreShownCopiedAndRemoved() {
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
                    secrets = PassmanagerEntryCreateSecrets(password = "synthetic"),
                    title = "Почта",
                ),
                generation,
            ).entryID
        }
        awaitNode(catalogRowTag(id))
        rule.onNodeWithTag(catalogRowTag(id)).performClick()
        awaitNode(DETAIL_TITLE_TAG)

        openCodesManager()
        awaitNode(CODES_ADD_TAG)
        rule.onNodeWithTag(CODES_ADD_TAG).performClick()
        awaitNode(CODE_LABEL_TAG)
        rule.onNodeWithTag(CODE_LABEL_TAG).performTextInput(LABEL)
        rule.onNodeWithTag(CODE_KEY_TAG).performTextInput("jbsw y3dp ehpk 3pxp")
        rule.hideKeyboard()
        rule.onNodeWithTag(CODE_SAVE_TAG).performClick()
        // A saved code is shown at once, as on the record page.
        awaitNode(codeValueTag(LABEL)) {
            "Core holds " + runBlocking { session.credentials.otpRecords(id, generation).records.map { it.label } }
        }
        val saved = runBlocking { session.credentials.otpRecords(id, generation).records.single() }
        assertEquals(LABEL to "TOTP", saved.label to saved.otpType)
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { codeDigits().length == 6 }
        val code = codeDigits()
        assertTrue("a six-digit code, got $code", code.matches(Regex("\\d{6}")))
        rule.onNodeWithTag(codeCopyTag(LABEL)).performClick()
        rule.onNodeWithTag(CODES_MANAGER_DONE_TAG).performClick()
        awaitNode(FORM_CLOSE_TAG)
        rule.onNodeWithTag(FORM_CLOSE_TAG).performClick()
        // The page shows the code read only.
        awaitNode(codeValueTag(LABEL))

        // The Codes collection holds the record with a code and not the one without.
        val plain = runBlocking {
            session.credentials.createCredential(
                PassmanagerEntryCreateRequest(
                    entryID = UUID.randomUUID().toString(),
                    entryType = "login",
                    secrets = PassmanagerEntryCreateSecrets(password = "synthetic"),
                    title = "Банк",
                ),
                generation,
            ).entryID
        }
        rule.onNodeWithTag(DETAIL_BACK_TAG).performClick()
        awaitNode(catalogRowTag(plain))
        rule.onNodeWithTag(CATALOG_CODES_TAG).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            count(codesCollectionRowTag(plain)) == 0 && count(codesCollectionRowTag(id)) > 0
        }
        rule.onNodeWithTag(codesCollectionRowTag(id)).performClick()
        awaitNode(DETAIL_TITLE_TAG)

        openCodesManager()
        awaitNode(codeDeleteTag(LABEL))
        rule.onNodeWithTag(codeDeleteTag(LABEL)).performClick()
        awaitNode(CODE_DELETE_CONFIRM_TAG)
        rule.onNodeWithTag(CODE_DELETE_CONFIRM_TAG).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { count(codeValueTag(LABEL)) == 0 }
        assertTrue(runBlocking { session.credentials.otpRecords(id, generation).records.isEmpty() })
    }

    private fun codeDigits(): String = rule.onAllNodesWithTag(codeValueTag(LABEL), useUnmergedTree = true)
        .fetchSemanticsNodes().singleOrNull()?.config?.getOrNull(SemanticsProperties.ContentDescription)
        ?.joinToString("").orEmpty().filter(Char::isDigit)

    /** Codes are managed from Edit, as on iOS: record page, Edit, One-time codes. */
    private fun openCodesManager() {
        awaitNode(DETAIL_EDIT_TAG)
        rule.onNodeWithTag(DETAIL_EDIT_TAG).performClick()
        awaitNode(FORM_CODES_TAG)
        rule.onNodeWithTag(FORM_CODES_TAG).performScrollTo().performClick()
    }

    private fun count(tag: String): Int = rule.onAllNodesWithTag(tag, useUnmergedTree = true).fetchSemanticsNodes().size

    /** Waits for [tag]; a timeout reports the screen and [context] instead of only the wait. */
    private fun awaitNode(tag: String, context: () -> String = { "" }) {
        try {
            rule.waitUntil(NODE_TIMEOUT_MILLIS) { count(tag) > 0 }
        } catch (timeout: androidx.compose.ui.test.ComposeTimeoutException) {
            val screen = rule.onRoot(useUnmergedTree = true).printToString()
            throw AssertionError("no $tag on screen. ${context()}\n$screen", timeout)
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
        const val LABEL = "Почта"
        const val NODE_TIMEOUT_MILLIS = 30_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
