package com.chromvoid.air.ui.settings

import androidx.activity.ComponentActivity
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.UriHandler
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToKey
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.maintenance.FakeMaintenanceStore
import com.chromvoid.air.ui.maintenance.MAINTENANCE_CLOSE_TAG
import com.chromvoid.air.ui.maintenance.MaintenanceHost
import com.chromvoid.air.ui.maintenance.MaintenanceRoute
import com.chromvoid.air.ui.maintenance.MaintenanceScope
import com.chromvoid.air.ui.maintenance.MaintenanceServices
import com.chromvoid.air.ui.maintenance.PasswordMaintenanceModel
import com.chromvoid.air.ui.maintenance.RESTORE_CHECK_TAG
import com.chromvoid.air.ui.maintenance.RESTORE_ISSUE_TAG
import com.chromvoid.air.ui.maintenance.RestoreRun
import com.chromvoid.air.ui.maintenance.RestoreStore
import com.chromvoid.air.ui.maintenance.maintenanceFieldTag
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class SettingsRootTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    private class Preferences(
        override var autoLockSeconds: Long = 0,
        override var keepScreenAwake: Boolean = false,
        override var lockOnLeave: Boolean = false,
        override var lockOnScreenOff: Boolean = false,
        override var lockNotification: Boolean = true,
    ) : SessionPreferences

    @Test
    public fun `AutoFill opens from Passwords and passkeys`() {
        var opened = 0
        rule.setContent { AirTheme { SettingsRoot(presence = null, onAutoFill = { opened++ }) } }
        rule.onNodeWithTag(SETTINGS_AUTOFILL_TAG).performScrollTo()
            .assertTextContains("AutoFill")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
            .performClick()
        assertEquals(1, opened)
    }

    @Test
    public fun `Settings without AutoFill offers no row for it`() {
        rule.setContent { AirTheme { SettingsRoot(presence = null) } }
        assertTrue(rule.onAllNodesWithTag(SETTINGS_AUTOFILL_TAG).fetchSemanticsNodes().isEmpty())
    }

    @Test
    public fun `the Appearance choices are shown and stored`() {
        val preferences = object : AppearancePreferences {
            override var theme: String = ""
            override var language: String = ""
        }
        val restarts = mutableListOf<AppearanceModel.Language>()
        val model = AppearanceModel(preferences) { restarts += it }
        rule.setContent { AirTheme { SettingsRoot(presence = null, appearance = model) } }

        rule.onNodeWithTag(SETTINGS_THEME_TAG).performScrollTo().performClick()
        rule.onNodeWithTag(themeOptionTag(AppearanceModel.Theme.DARK)).performClick()
        rule.waitForIdle()
        assertEquals("dark", preferences.theme)
        rule.onNodeWithTag(SETTINGS_THEME_TAG).assertTextContains("Dark", substring = true)

        rule.onNodeWithTag(SETTINGS_LANGUAGE_TAG).performScrollTo().performClick()
        rule.onNodeWithTag(languageOptionTag(AppearanceModel.Language.RUSSIAN)).performClick()
        rule.waitForIdle()
        assertEquals("ru", preferences.language)
        assertEquals(listOf(AppearanceModel.Language.RUSSIAN), restarts)
    }

    @Test
    public fun `the Files choices are shown and stored, deletion confirmed by default`() {
        val preferences = com.chromvoid.air.ui.files.MemoryFilePreferences()
        val model = com.chromvoid.air.ui.files.FileSettings(preferences)
        rule.setContent { AirTheme { SettingsRoot(presence = null, files = model) } }

        rule.onNodeWithTag(SETTINGS_CONFIRM_DELETION_TAG).performScrollTo().assertIsOn()
        rule.onNodeWithTag(SETTINGS_SHOW_HIDDEN_TAG).performScrollTo()
            .assertTextContains("Show hidden files")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Switch))
            .assertIsOff()
        rule.onNodeWithText("Show hidden files").performClick()
        rule.onNodeWithTag(SETTINGS_CONFIRM_DELETION_TAG).performClick()
        rule.waitForIdle()

        assertEquals(true, preferences.showHidden)
        assertEquals(false, preferences.confirmDeletion)
        rule.onNodeWithTag(SETTINGS_SHOW_HIDDEN_TAG).assertIsOn()
    }

    @Test
    public fun `Markdown attachments shows the folder and changes it through the picker`() {
        val preferences = com.chromvoid.air.ui.files.MemoryFilePreferences()
        val model = com.chromvoid.air.ui.files.FileSettings(preferences)
        val store = com.chromvoid.air.ui.files.FakeFileStore().apply { folder("Photos") }
        val files = com.chromvoid.air.ui.files.FilesScope(store, 1uL, model, searchDelayMillis = 0)
        rule.setContent { AirTheme { SettingsRoot(presence = null, files = model, attachments = files) } }

        rule.onNodeWithTag(SETTINGS_ATTACHMENT_FOLDER_TAG).performScrollTo()
            .assertTextContains("Markdown attachments")
            .assertTextContains("/attachments", substring = true)
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
            .performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(com.chromvoid.air.ui.files.CHOOSER_USE_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(com.chromvoid.air.ui.files.CHOOSER_ISSUE_TAG).assertIsDisplayed()

        rule.onNodeWithTag(com.chromvoid.air.ui.files.chooserFolderTag("Photos")).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(com.chromvoid.air.ui.files.CHOOSER_USE_TAG).performClick()
        rule.waitForIdle()

        assertEquals("/Photos", preferences.attachmentFolder)
        rule.onNodeWithTag(SETTINGS_ATTACHMENT_FOLDER_TAG).assertTextContains("/Photos", substring = true)
    }

    @Test
    public fun `Markdown attachments is offered only with an unlocked session`() {
        val model = com.chromvoid.air.ui.files.FileSettings(com.chromvoid.air.ui.files.MemoryFilePreferences())
        rule.setContent { AirTheme { SettingsRoot(presence = null, files = model) } }

        rule.onNodeWithTag(SETTINGS_CONFIRM_DELETION_TAG).performScrollTo()
        assertTrue(rule.onAllNodesWithTag(SETTINGS_ATTACHMENT_FOLDER_TAG).fetchSemanticsNodes().isEmpty())
    }

    @Test
    public fun `About shows the installed version and build`() {
        rule.setContent { AirTheme { SettingsRoot(presence = null, version = AppVersion("0.1.0", "7")) } }

        rule.onNodeWithTag(SETTINGS_LIST_TAG).performScrollToKey("about")
        rule.onNodeWithTag(SETTINGS_VERSION_TAG).assertTextContains("0.1.0", substring = true)
    }

    @Test
    public fun `About opens the Privacy Policy and the Terms of Service in the browser`() {
        val opened = mutableListOf<String>()
        val browser = object : UriHandler {
            override fun openUri(uri: String) {
                opened += uri
            }
        }
        rule.setContent {
            AirTheme { CompositionLocalProvider(LocalUriHandler provides browser) { SettingsRoot(presence = null) } }
        }

        rule.onNodeWithTag(SETTINGS_LIST_TAG).performScrollToKey("about")
        rule.onNodeWithTag(SETTINGS_PRIVACY_POLICY_TAG).assertTextContains("Privacy Policy").performClick()
        rule.onNodeWithTag(SETTINGS_TERMS_TAG).assertTextContains("Terms of Service").performClick()

        assertEquals(
            listOf(
                "https://chromvoid.com/en/legal/privacy-policy/",
                "https://chromvoid.com/en/legal/terms-of-service-eula/",
            ),
            opened,
        )
    }

    @Test
    public fun `a device without a browser keeps Settings open when a document is tapped`() {
        val browser = object : UriHandler {
            override fun openUri(uri: String): Unit = throw IllegalArgumentException("no browser")
        }
        rule.setContent {
            AirTheme { CompositionLocalProvider(LocalUriHandler provides browser) { SettingsRoot(presence = null) } }
        }

        rule.onNodeWithTag(SETTINGS_LIST_TAG).performScrollToKey("about")
        rule.onNodeWithTag(SETTINGS_TERMS_TAG).performClick()

        rule.onNodeWithTag(SETTINGS_HELP_TAG).assertIsDisplayed()
    }

    @Test
    public fun `Storage and recovery offers a backup only when something can write one`() {
        val withoutDestination = maintenance(MaintenanceServices(passwords = FakeMaintenanceStore()))
        rule.setContent { AirTheme { SettingsRoot(presence = null, maintenance = withoutDestination) } }

        // A row that could not finish what it starts is not offered.
        rule.onNodeWithTag(SETTINGS_LIST_TAG).performScrollToKey("about")
        rule.onNodeWithTag(SETTINGS_BACKUP_TAG).assertDoesNotExist()
    }

    @Test
    public fun `Storage and recovery offers a restore beside the backup`() {
        val restores = object : RestoreStore {
            override suspend fun beginRestore(generation: ULong): RestoreRun = error("not started here")
        }
        val maintenance = maintenance(MaintenanceServices(restores = restores, restoreSources = { error("unused") }))
        rule.setContent {
            AirTheme { MaintenanceHost(maintenance) { SettingsRoot(presence = null, maintenance = maintenance) } }
        }

        rule.onNodeWithTag(SETTINGS_LIST_TAG).performScrollToKey("storage")
        rule.onNodeWithTag(SETTINGS_BACKUP_TAG).assertDoesNotExist()
        rule.onNodeWithTag(SETTINGS_RESTORE_TAG).performClick()
        rule.waitForIdle()
        assertTrue(maintenance.route.value is MaintenanceRoute.Restore)
        rule.onNodeWithTag(RESTORE_CHECK_TAG).performClick()
        rule.onNodeWithTag(RESTORE_ISSUE_TAG).assertIsDisplayed()
    }

    @Test
    public fun `the Passwords section opens the change each password asks for`() {
        val maintenance = maintenance(MaintenanceServices(passwords = FakeMaintenanceStore()))
        rule.setContent {
            AirTheme { MaintenanceHost(maintenance) { SettingsRoot(presence = null, maintenance = maintenance) } }
        }

        rule.onNodeWithTag(SETTINGS_VAULT_PASSWORD_TAG).performScrollTo().performClick()
        rule.waitForIdle()
        assertEquals(PasswordMaintenanceModel.Kind.VAULT, passwordChange(maintenance)?.kind)
        rule.onNodeWithTag(SETTINGS_LIST_TAG).assertDoesNotExist()
        rule.onNodeWithTag(MAINTENANCE_CLOSE_TAG).performClick()
        rule.waitForIdle()
        assertNull("closing leaves no draft behind", maintenance.route.value)

        rule.onNodeWithTag(SETTINGS_ADMIN_PASSWORD_TAG).performScrollTo().performClick()
        rule.waitForIdle()
        assertEquals(PasswordMaintenanceModel.Kind.ADMINISTRATOR, passwordChange(maintenance)?.kind)
        rule.onNodeWithTag(maintenanceFieldTag(PasswordMaintenanceModel.Field.CURRENT)).assertIsDisplayed()
        // Back closes the screen and returns to Settings, where the person was.
        rule.activityRule.scenario.onActivity { it.onBackPressedDispatcher.onBackPressed() }
        rule.waitForIdle()
        assertNull(maintenance.route.value)
        rule.onNodeWithTag(SETTINGS_ADMIN_PASSWORD_TAG).assertIsDisplayed()
    }

    private fun maintenance(services: MaintenanceServices): MaintenanceScope =
        MaintenanceScope(1uL, services, CoroutineScope(Dispatchers.Main), session = { AirSessionState.Unlocked(1uL) })

    private fun passwordChange(maintenance: MaintenanceScope): PasswordMaintenanceModel? =
        (maintenance.route.value as? MaintenanceRoute.Password)?.model

    @Test
    public fun `the Session and App access choices change what is stored`() {
        val preferences = Preferences()
        val applied = mutableListOf<Long>()
        val model = SessionSettingsModel(
            { seconds -> applied += seconds; true },
            preferences,
            CoroutineScope(Dispatchers.Main),
        )
        rule.setContent { AirTheme { SettingsRoot(presence = null, session = model) } }

        rule.onNodeWithTag(SETTINGS_LOCK_ON_LEAVE_TAG).assertIsOff().performClick()
        rule.onNodeWithTag(SETTINGS_LOCK_ON_LEAVE_TAG).assertIsOn()
        rule.onNodeWithTag(SETTINGS_LOCK_ON_SCREEN_OFF_TAG).assertIsOff().performClick()
        rule.onNodeWithTag(SETTINGS_LOCK_ON_SCREEN_OFF_TAG).assertIsOn()
        assertTrue(preferences.lockOnScreenOff)
        assertTrue(model.state.value.lockOnScreenOff)
        rule.onNodeWithTag(SETTINGS_KEEP_AWAKE_TAG).performClick()
        assertTrue(preferences.lockOnLeave && preferences.keepScreenAwake)

        rule.onNodeWithTag(SETTINGS_AUTO_LOCK_TAG).performScrollTo().performClick()
        rule.onNodeWithTag(autoLockOptionTag(AutoLockTimeout.FIFTEEN_MINUTES)).performClick()
        rule.waitForIdle()

        assertEquals(listOf(900L), applied)
        assertEquals(900L, preferences.autoLockSeconds)
        rule.onNodeWithTag(SETTINGS_AUTO_LOCK_TAG).assertTextContains("15", substring = true)
    }

    @Test
    public fun `the lock notification asks for notifications as it is turned on, and the tile is offered`() {
        val preferences = Preferences(lockNotification = false)
        var tiles = 0
        var asked = 0
        val model = SessionSettingsModel({ true }, preferences, CoroutineScope(Dispatchers.Main)) { tiles++ }
        rule.setContent {
            AirTheme {
                SettingsRoot(
                    presence = null,
                    session = model,
                    beforeNotifications = { proceed ->
                        asked++
                        proceed()
                    },
                )
            }
        }

        rule.onNodeWithTag(SETTINGS_LOCK_NOTIFICATION_TAG).performScrollTo().assertIsOff().performClick()
        rule.onNodeWithTag(SETTINGS_LOCK_NOTIFICATION_TAG).assertIsOn()
        assertEquals(1, asked)
        assertTrue(preferences.lockNotification)

        rule.onNodeWithTag(SETTINGS_LOCK_NOTIFICATION_TAG).performClick()
        assertEquals("turning it off asks nothing", 1, asked)

        rule.onNodeWithTag(SETTINGS_LOCK_TILE_TAG).performScrollTo().performClick()
        assertEquals(1, tiles)
    }
}
