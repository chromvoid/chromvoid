package com.chromvoid.air

import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performScrollToKey
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextReplacement
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateSecrets
import com.chromvoid.air.bridge.wire.PassmanagerEntryPageRequest
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.maintenance.MAINTENANCE_CLOSE_TAG
import com.chromvoid.air.ui.maintenance.MAINTENANCE_DONE_TAG
import com.chromvoid.air.ui.maintenance.MAINTENANCE_LIST_TAG
import com.chromvoid.air.ui.maintenance.MAINTENANCE_SUBMIT_TAG
import com.chromvoid.air.ui.maintenance.PasswordMaintenanceModel.Field
import com.chromvoid.air.ui.maintenance.maintenanceFieldTag
import com.chromvoid.air.ui.settings.AppearanceModel
import com.chromvoid.air.ui.settings.SETTINGS_LIST_TAG
import com.chromvoid.air.ui.settings.SETTINGS_THEME_TAG
import com.chromvoid.air.ui.settings.SETTINGS_VAULT_PASSWORD_TAG
import com.chromvoid.air.ui.settings.themeOptionTag
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The two Settings items owed a device run, against real Core. The vault password is changed
 * from Settings: afterwards the new password opens this vault with its record, and the old
 * one no longer does - an unknown vault password opens an empty space, as ChromVoid's vaults
 * do, never this one. And the chosen theme is stored: a recreated activity starts with it.
 */
@RunWith(AndroidJUnit4::class)
public class SettingsPersistenceInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun theVaultPasswordChangesFromSettings() {
        unlocked(VAULT)
        val generation = (session.state.value as AirSessionState.Unlocked).generation
        runBlocking {
            session.credentials.createCredential(
                PassmanagerEntryCreateRequest(
                    entryID = UUID.randomUUID().toString(),
                    entryType = "login",
                    secrets = PassmanagerEntryCreateSecrets(password = "synthetic-password"),
                    title = "Example",
                ),
                generation,
            )
        }

        openSettings("passwords")
        rule.onNodeWithTag(SETTINGS_VAULT_PASSWORD_TAG).performClick()
        awaitNode(maintenanceFieldTag(Field.CURRENT))
        rule.onNodeWithTag(maintenanceFieldTag(Field.CURRENT)).performTextReplacement(VAULT)
        rule.onNodeWithTag(maintenanceFieldTag(Field.NEW)).performTextReplacement(REPLACEMENT)
        rule.onNodeWithTag(maintenanceFieldTag(Field.CONFIRMATION)).performTextReplacement(REPLACEMENT)
        rule.onNodeWithTag(maintenanceFieldTag(Field.CONFIRMATION)).performImeAction()
        // A short screen with the keyboard up keeps the button out of the list until it is reached.
        rule.onNodeWithTag(MAINTENANCE_LIST_TAG).performScrollToNode(hasTestTag(MAINTENANCE_SUBMIT_TAG))
        rule.onNodeWithTag(MAINTENANCE_SUBMIT_TAG, useUnmergedTree = true).performClick()
        awaitNode(MAINTENANCE_DONE_TAG)
        rule.onNodeWithTag(MAINTENANCE_CLOSE_TAG).performClick()

        assertEquals("the new password opens this vault", listOf("Example"), titlesAfterUnlock(REPLACEMENT))
        assertEquals("the old one no longer does", emptyList<String>(), titlesAfterUnlock(VAULT))
    }

    @Test
    public fun theChosenThemeSurvivesARestartedActivity() {
        unlocked(VAULT)
        openSettings("appearance")
        rule.onNodeWithTag(SETTINGS_THEME_TAG).performClick()
        rule.onNodeWithTag(themeOptionTag(AppearanceModel.Theme.DARK)).performClick()
        rule.onNodeWithTag(SETTINGS_THEME_TAG).assertTextContains("Dark", substring = true)

        rule.activityRule.scenario.recreate()
        openSettings("appearance")
        rule.onNodeWithTag(SETTINGS_THEME_TAG).assertTextContains("Dark", substring = true)
    }

    private fun titlesAfterUnlock(password: String): List<String> {
        runBlocking { session.lock() }
        awaitState { it == AirSessionState.Locked }
        runBlocking { assertEquals(AccessOutcome.Accepted, session.unlock(password)) }
        awaitState { it is AirSessionState.Unlocked }
        val generation = (session.state.value as AirSessionState.Unlocked).generation
        val everything = PassmanagerEntryPageRequest(limit = 10, offset = 0, query = "")
        return runBlocking { session.credentials.credentialPage(everything, generation).entries.map { it.title } }
    }

    private fun openSettings(section: String) {
        awaitNode("root-settings")
        rule.onNodeWithTag("root-settings").performClick()
        awaitNode(SETTINGS_LIST_TAG)
        rule.onNodeWithTag(SETTINGS_LIST_TAG).performScrollToKey(section)
    }

    private fun unlocked(password: String) {
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(password))
        }
        awaitState { it is AirSessionState.Unlocked }
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
        const val REPLACEMENT = "air-instrumentation-vault-replacement"
        const val TIMEOUT_MILLIS = 30_000L
    }
}
