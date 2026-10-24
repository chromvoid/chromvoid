package com.chromvoid.air

import android.os.ParcelFileDescriptor
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import com.chromvoid.air.bridge.wire.PassmanagerEntryPageRequest
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.credentials.CATALOG_CREATE_TAG
import com.chromvoid.air.ui.credentials.CredentialFormModel.Field
import com.chromvoid.air.ui.credentials.CredentialFormModel.Kind
import com.chromvoid.air.ui.credentials.DETAIL_TITLE_TAG
import com.chromvoid.air.ui.credentials.FORM_KEEP_TAG
import com.chromvoid.air.ui.credentials.FORM_SAVE_TAG
import com.chromvoid.air.ui.credentials.createKindTag
import com.chromvoid.air.ui.credentials.formFieldTag
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Routes A42 and A51 against real Core: a login being typed keeps its draft through a
 * rotation, a recreated activity - what a configuration change the app does not handle does -
 * and a switch to the dark theme, with Save still reachable in landscape. Back on the changed
 * draft asks first and keeping it loses nothing; the saved record holds what was typed.
 */
@RunWith(AndroidJUnit4::class)
public class ConfigurationInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val device: UiDevice get() = UiDevice.getInstance(instrumentation)
    private val session get() = AirAppGraph.of(rule.activity).session
    private var night: String? = null

    @After
    public fun restore() {
        device.setOrientationNatural()
        device.unfreezeRotation()
        night?.let { shell("cmd uimode night $it") }
    }

    @Test
    public fun aDraftSurvivesRotationRecreationAndTheDarkThemeAndBackAsksFirst() {
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState { it is AirSessionState.Unlocked }
        val generation = (session.state.value as AirSessionState.Unlocked).generation

        awaitNode(CATALOG_CREATE_TAG)
        rule.onNodeWithTag(CATALOG_CREATE_TAG).performClick()
        awaitNode(createKindTag(Kind.LOGIN))
        rule.onNodeWithTag(createKindTag(Kind.LOGIN)).performClick()
        awaitNode(formFieldTag(Field.TITLE))
        rule.onNodeWithTag(formFieldTag(Field.TITLE)).performTextInput("Draft")
        rule.onNodeWithTag(formFieldTag(Field.USERNAME)).performTextInput("alice")
        rule.onNodeWithTag(formFieldTag(Field.PASSWORD)).performTextInput("typed-before-rotation")

        // Rotation: the app handles it in place; the draft and Save stay.
        device.setOrientationLandscape()
        rule.waitForIdle()
        assertDraft()
        rule.onNodeWithTag(FORM_SAVE_TAG).assertIsDisplayed()

        // A recreated activity finds the same shell, and the draft in it.
        rule.activityRule.scenario.recreate()
        awaitNode(formFieldTag(Field.TITLE))
        assertDraft()
        assertTrue("the vault stays open", session.state.value is AirSessionState.Unlocked)

        // Back on a changed draft asks first; keeping it loses nothing.
        device.setOrientationNatural()
        // The system's Back, as a person presses it; an open keyboard takes the first one.
        for (press in 1..BACK_PRESSES) {
            device.pressBack()
            if (runCatching { rule.waitUntil(BACK_SETTLE_MILLIS) { exists(FORM_KEEP_TAG) } }.isSuccess) break
        }
        awaitNode(FORM_KEEP_TAG)
        rule.onNodeWithTag(FORM_KEEP_TAG).performClick()
        assertDraft()

        // The dark theme is applied in place as well. (The shell's switch can take the window's
        // focus on some versions, so key events come before it.)
        night = shell("cmd uimode night").substringAfter(":").trim().takeIf { it == "yes" || it == "no" } ?: "no"
        shell("cmd uimode night yes")
        rule.waitForIdle()
        assertDraft()

        rule.onNodeWithTag(FORM_SAVE_TAG).performClick()
        awaitNode(DETAIL_TITLE_TAG)
        rule.onNodeWithTag(DETAIL_TITLE_TAG).assertTextContains("Draft")
        val saved = runBlocking {
            val everything = PassmanagerEntryPageRequest(limit = 10, offset = 0, query = "")
            session.credentials.credentialPage(everything, generation).entries.single()
        }
        val password = runBlocking { session.credentials.readCredentialSecret(saved.id, "password", generation) }
        assertEquals("typed-before-rotation", password)
    }

    private fun assertDraft() {
        rule.onNodeWithTag(formFieldTag(Field.TITLE)).performScrollTo().assertTextContains("Draft")
        rule.onNodeWithTag(formFieldTag(Field.USERNAME)).performScrollTo().assertTextContains("alice")
    }

    private fun exists(tag: String): Boolean = rule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()

    private fun awaitNode(tag: String) {
        rule.waitUntil(TIMEOUT_MILLIS) { rule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty() }
    }

    private fun awaitState(accept: (AirSessionState) -> Boolean) {
        runCatching { rule.waitUntil(TIMEOUT_MILLIS) { accept(session.state.value) } }
        check(accept(session.state.value)) { "session still ${session.state.value}" }
    }

    private fun shell(command: String): String {
        val output = instrumentation.uiAutomation.executeShellCommand(command)
        return ParcelFileDescriptor.AutoCloseInputStream(output).bufferedReader().use { it.readText() }
    }

    private companion object {
        const val ADMINISTRATOR = "air-instrumentation-administrator"
        const val VAULT = "air-instrumentation-vault"
        const val TIMEOUT_MILLIS = 20_000L
        const val BACK_PRESSES = 2
        const val BACK_SETTLE_MILLIS = 3_000L
    }
}
