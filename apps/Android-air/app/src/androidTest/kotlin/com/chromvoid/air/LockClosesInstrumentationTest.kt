package com.chromvoid.air

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performScrollToKey
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.access.ACCESS_PASSWORD_TAG
import com.chromvoid.air.ui.autofill.AUTOFILL_CLOSE_TAG
import com.chromvoid.air.ui.credentials.CATALOG_CREATE_TAG
import com.chromvoid.air.ui.credentials.CredentialFormModel.Field
import com.chromvoid.air.ui.credentials.CredentialFormModel.Kind
import com.chromvoid.air.ui.credentials.FORM_SAVE_TAG
import com.chromvoid.air.ui.credentials.createKindTag
import com.chromvoid.air.ui.credentials.formFieldTag
import com.chromvoid.air.ui.settings.SETTINGS_AUTOFILL_TAG
import com.chromvoid.air.ui.settings.SETTINGS_LIST_TAG
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Route A41 against real Core: a lock closes what was open - a login being typed, a page
 * over Settings - and the unlock screen replaces it. The next unlock, typed on that screen,
 * starts clean: the draft is gone and nothing reopens.
 */
@RunWith(AndroidJUnit4::class)
public class LockClosesInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun aLockClosesTheDraftAndThePageAndTheNextUnlockStartsClean() {
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState { it is AirSessionState.Unlocked }

        // A login being typed.
        awaitNode(CATALOG_CREATE_TAG)
        rule.onNodeWithTag(CATALOG_CREATE_TAG).performClick()
        awaitNode(createKindTag(Kind.LOGIN))
        rule.onNodeWithTag(createKindTag(Kind.LOGIN)).performClick()
        awaitNode(formFieldTag(Field.TITLE))
        rule.onNodeWithTag(formFieldTag(Field.PASSWORD)).performTextInput("never-saved")
        lockAndUnlock()
        assertAbsent(FORM_SAVE_TAG)
        awaitNode(CATALOG_CREATE_TAG)

        // A page over Settings.
        rule.onNodeWithTag("root-settings").performClick()
        rule.onNodeWithTag(SETTINGS_LIST_TAG).performScrollToKey("passwords-passkeys")
        rule.onNodeWithTag(SETTINGS_AUTOFILL_TAG).performClick()
        awaitNode(AUTOFILL_CLOSE_TAG)
        lockAndUnlock()
        assertAbsent(AUTOFILL_CLOSE_TAG)
        assertTrue(session.state.value is AirSessionState.Unlocked)
    }

    /** Locks as the shell does, and unlocks again on the unlock screen the lock put up. */
    private fun lockAndUnlock() {
        runBlocking { session.lock() }
        awaitNode(ACCESS_PASSWORD_TAG)
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG).performTextReplacement(VAULT)
        // The keyboard's Go, as a person unlocking with it. The keyboard coming back after the
        // lock moves the button while it animates - for seconds on a loaded emulator - and a
        // click whose release lands off the moved button is no click.
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG).performImeAction()
        awaitState { it is AirSessionState.Unlocked }
        rule.waitForIdle()
    }

    private fun assertAbsent(tag: String) {
        assertTrue("$tag stayed open", rule.onAllNodesWithTag(tag).fetchSemanticsNodes().isEmpty())
    }

    private fun awaitNode(tag: String) {
        rule.waitUntil(TIMEOUT_MILLIS) { rule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty() }
    }

    private fun awaitState(accept: (AirSessionState) -> Boolean) {
        runCatching { rule.waitUntil(TIMEOUT_MILLIS) { accept(session.state.value) } }
        check(accept(session.state.value)) { "session still ${session.state.value}" }
    }

    private companion object {
        const val ADMINISTRATOR = "air-instrumentation-administrator"
        const val VAULT = "air-instrumentation-vault"
        const val TIMEOUT_MILLIS = 20_000L
    }
}
