package com.chromvoid.air.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.UriHandler
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performFirstLinkClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import com.chromvoid.air.ui.access.ACCESS_CONFIRMATION_TAG
import com.chromvoid.air.ui.access.ACCESS_CONNECTIONS_TAG
import com.chromvoid.air.ui.access.ACCESS_ERROR_TAG
import com.chromvoid.air.ui.access.ACCESS_HELP_TAG
import com.chromvoid.air.ui.access.ACCESS_LEGAL_TAG
import com.chromvoid.air.ui.access.ACCESS_PASSWORD_TAG
import com.chromvoid.air.ui.access.ACCESS_RESTORE_TAG
import com.chromvoid.air.ui.access.ACCESS_SUBMIT_TAG
import com.chromvoid.air.ui.access.AccessViewModel
import com.chromvoid.air.ui.access.AdministratorSetupScreen
import com.chromvoid.air.ui.access.UnlockScreen
import com.chromvoid.air.ui.access.WELCOME_CONTINUE_TAG
import com.chromvoid.air.ui.access.WELCOME_RESTORE_TAG
import com.chromvoid.air.ui.access.ACCESS_UTILITIES_TAG
import com.chromvoid.air.ui.access.DeviceUtilitiesSheet
import com.chromvoid.air.ui.access.utilityTag
import com.chromvoid.air.ui.maintenance.MaintenanceAction
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class AccessScreenTest {
    @get:Rule
    public val rule: androidx.compose.ui.test.junit4.ComposeContentTestRule = createComposeRule()

    @Test
    public fun `submitting an empty password explains instead of doing nothing`() {
        val model = model(locked = true)
        rule.setContent { AirTheme { UnlockScreen(model) } }

        rule.onNodeWithTag(ACCESS_SUBMIT_TAG).performClick()
        rule.waitForIdle()

        rule.onNodeWithTag(ACCESS_ERROR_TAG).assertIsDisplayed()
    }

    @Test
    public fun `the submit action stays available while an error is shown`() {
        val model = model(locked = true)
        rule.setContent { AirTheme { UnlockScreen(model) } }

        rule.onNodeWithTag(ACCESS_SUBMIT_TAG).performClick()
        rule.waitForIdle()

        // A disabled control would explain nothing; the user must be able to
        // correct the field and try again without leaving the screen.
        rule.onNodeWithTag(ACCESS_SUBMIT_TAG).assertIsDisplayed().performClick()
    }

    @Test
    public fun `unlock can submit from the button while the password has focus`() {
        val session = FakeAccessSession.locked()
        val model = AccessViewModel(session)
        rule.setContent { AirTheme { UnlockScreen(model) } }

        rule.onNodeWithTag(ACCESS_PASSWORD_TAG).performClick().performTextInput("synthetic-password")
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG).assertIsFocused()
        rule.onNodeWithTag(ACCESS_SUBMIT_TAG).performClick()

        rule.runOnIdle {
            org.junit.Assert.assertEquals(AirSessionState.Unlocked(generation = 1uL), session.state.value)
            org.junit.Assert.assertEquals("", model.form.value.password)
        }
    }

    @Test
    public fun `setup keeps Next and Go actions when focus moves between the fields`() {
        val session = FakeAccessSession.firstRun()
        val model = AccessViewModel(session)
        rule.setContent { AirTheme { AdministratorSetupScreen(model) } }

        rule.onNodeWithTag(WELCOME_CONTINUE_TAG).performClick()
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG).performClick().performTextInput("synthetic-administrator")
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG).performImeAction()
        rule.onNodeWithTag(ACCESS_CONFIRMATION_TAG).assertIsFocused().performTextInput("synthetic-administrator")
        rule.onNodeWithTag(ACCESS_CONFIRMATION_TAG).performImeAction()

        rule.runOnIdle { org.junit.Assert.assertEquals(AirSessionState.Locked, session.state.value) }
    }

    @Test
    public fun `first run asks for a confirmation and refuses a mismatch`() {
        val model = model(locked = false)
        rule.setContent { AirTheme { AdministratorSetupScreen(model) } }

        // The welcome comes first, as on iOS.
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG).assertDoesNotExist()
        rule.onNodeWithTag(WELCOME_CONTINUE_TAG).performClick()
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG).performTextInput("first")
        rule.onNodeWithTag(ACCESS_CONFIRMATION_TAG).performTextInput("second")
        rule.onNodeWithTag(ACCESS_SUBMIT_TAG).performClick()
        rule.waitForIdle()

        rule.onNodeWithTag(ACCESS_ERROR_TAG).assertIsDisplayed()
    }

    @Test
    public fun `files shared while locked are counted and can be let go`() {
        var discarded = false
        rule.setContent {
            AirTheme { UnlockScreen(model(locked = true), pendingShare = 2, onDiscardShare = { discarded = true }) }
        }

        rule.onNodeWithTag(com.chromvoid.air.ui.access.ACCESS_SHARE_NOTICE_TAG).performScrollTo()
        rule.onNodeWithText("2 shared files wait for the unlock.").assertIsDisplayed()
        rule.onNodeWithTag(com.chromvoid.air.ui.access.ACCESS_SHARE_DISCARD_TAG).performClick()

        org.junit.Assert.assertTrue(discarded)
    }

    @Test
    public fun `a login offered while locked names its site and can be let go`() {
        var discarded = false
        rule.setContent {
            AirTheme {
                UnlockScreen(model(locked = true), pendingLogin = "example.com", onDiscardLogin = { discarded = true })
            }
        }

        rule.onNodeWithTag(com.chromvoid.air.ui.access.ACCESS_LOGIN_NOTICE_TAG).performScrollTo()
        rule.onNodeWithText("A login for example.com waits to be saved.").assertIsDisplayed()
        rule.onNodeWithTag(com.chromvoid.air.ui.access.ACCESS_LOGIN_DISCARD_TAG).performClick()

        org.junit.Assert.assertTrue(discarded)
        rule.onNodeWithTag(com.chromvoid.air.ui.access.ACCESS_SHARE_NOTICE_TAG).assertDoesNotExist()
    }

    @Test
    public fun `nothing about shares shows when none waits`() {
        rule.setContent { AirTheme { UnlockScreen(model(locked = true)) } }

        rule.onNodeWithTag(com.chromvoid.air.ui.access.ACCESS_SHARE_NOTICE_TAG).assertDoesNotExist()
    }

    @Test
    public fun `the lock screen offers help`() {
        var opened = false
        rule.setContent { AirTheme { UnlockScreen(model(locked = true), onHelp = { opened = true }) } }

        rule.onNodeWithTag(ACCESS_HELP_TAG).performClick()

        org.junit.Assert.assertTrue(opened)
    }

    @Test
    public fun `first run offers restoring a backup instead, on the welcome and under the form`() {
        var restores = 0
        rule.setContent { AirTheme { AdministratorSetupScreen(model(locked = false), onRestore = { restores += 1 }) } }

        rule.onNodeWithTag(WELCOME_RESTORE_TAG).performClick()
        rule.onNodeWithTag(WELCOME_CONTINUE_TAG).performClick()
        rule.onNodeWithTag(ACCESS_RESTORE_TAG).performScrollTo().performClick()

        org.junit.Assert.assertEquals(2, restores)
    }

    @Test
    public fun `without anything to restore with, first run offers no restore`() {
        rule.setContent { AirTheme { AdministratorSetupScreen(model(locked = false)) } }

        rule.onNodeWithTag(WELCOME_RESTORE_TAG).assertDoesNotExist()
        rule.onNodeWithTag(WELCOME_CONTINUE_TAG).performClick()
        rule.onNodeWithTag(ACCESS_RESTORE_TAG).assertDoesNotExist()
    }

    @Test
    public fun `Connections open from the lock screen's bar, as on iOS`() {
        var connections = 0
        rule.setContent {
            AirTheme { UnlockScreen(model(locked = true), onConnections = { connections += 1 }) }
        }

        rule.onNodeWithTag(ACCESS_CONNECTIONS_TAG).performClick()

        org.junit.Assert.assertEquals(1, connections)
    }

    @Test
    public fun `the lock screen keeps rare actions behind one row`() {
        var utilities = 0
        rule.setContent {
            AirTheme { UnlockScreen(model(locked = true), onUtilities = { utilities += 1 }) }
        }

        rule.onNodeWithTag(ACCESS_UTILITIES_TAG).performScrollTo().performClick()

        org.junit.Assert.assertEquals(1, utilities)
    }

    @Test
    public fun `the device utilities offer only what the device can do, deletion and reset under Danger`() {
        val chosen = mutableListOf<MaintenanceAction>()
        val offered = setOf(MaintenanceAction.RESTORE, MaintenanceAction.ERASE, MaintenanceAction.APP_RESET)
        rule.setContent {
            AirTheme { DeviceUtilitiesSheet(offers = { it in offered }, onChoose = { chosen += it }, onClose = {}) }
        }

        rule.onNodeWithTag(utilityTag(MaintenanceAction.BACKUP)).assertDoesNotExist()
        rule.onNodeWithTag(utilityTag(MaintenanceAction.RESTORE)).performClick()
        rule.onNodeWithTag(utilityTag(MaintenanceAction.ERASE)).performClick()
        rule.onNodeWithTag(utilityTag(MaintenanceAction.APP_RESET)).performScrollTo().performClick()

        org.junit.Assert.assertEquals(
            listOf(MaintenanceAction.RESTORE, MaintenanceAction.ERASE, MaintenanceAction.APP_RESET),
            chosen,
        )
    }

    @Test
    public fun `first run says the Terms of Service and the Privacy Policy apply, each a link`() {
        val opened = mutableListOf<String>()
        rule.setContent { AirTheme { WithBrowser(opened) { AdministratorSetupScreen(model(locked = false)) } } }

        // The welcome only introduces; the line sits under the action that creates the storage.
        rule.onNodeWithTag(ACCESS_LEGAL_TAG).assertDoesNotExist()
        rule.onNodeWithTag(WELCOME_CONTINUE_TAG).performClick()
        val notice = rule.onNodeWithTag(ACCESS_LEGAL_TAG).performScrollTo().assertIsDisplayed()
        val text = notice.text()
        org.junit.Assert.assertEquals(
            "By continuing, you agree to the Terms of Service and acknowledge the Privacy Policy.",
            text.text,
        )
        org.junit.Assert.assertEquals(listOf("Terms of Service" to TERMS, "Privacy Policy" to PRIVACY), text.links())

        notice.performFirstLinkClick { (it.item as LinkAnnotation.Url).url == PRIVACY }
        notice.performFirstLinkClick { (it.item as LinkAnnotation.Url).url == TERMS }
        org.junit.Assert.assertEquals(listOf(PRIVACY, TERMS), opened)
    }

    @Test
    @Config(qualifiers = "ru-w411dp-h891dp")
    public fun `the Russian line declines both names inside its own sentence`() {
        rule.setContent { AirTheme { AdministratorSetupScreen(model(locked = false)) } }

        rule.onNodeWithTag(WELCOME_CONTINUE_TAG).performClick()
        val text = rule.onNodeWithTag(ACCESS_LEGAL_TAG).performScrollTo().text()

        org.junit.Assert.assertEquals(
            listOf(
                "Условиями использования" to TERMS,
                "Политикой конфиденциальности" to PRIVACY,
            ),
            text.links(),
        )
        org.junit.Assert.assertFalse(text.text.contains("%"))
    }

    @Test
    public fun `the line asks for nothing, matching passwords set up without touching it`() {
        val session = FakeAccessSession.firstRun()
        rule.setContent { AirTheme { AdministratorSetupScreen(AccessViewModel(session)) } }

        rule.onNodeWithTag(WELCOME_CONTINUE_TAG).performClick()
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG).performTextInput("first")
        rule.onNodeWithTag(ACCESS_CONFIRMATION_TAG).performTextInput("first")
        rule.onNodeWithTag(ACCESS_SUBMIT_TAG).performClick()
        rule.waitForIdle()

        org.junit.Assert.assertEquals(AirSessionState.Locked, session.state.value)
    }

    @Test
    public fun `the lock screen carries no legal line`() {
        rule.setContent { AirTheme { UnlockScreen(model(locked = true)) } }

        rule.onNodeWithTag(ACCESS_LEGAL_TAG).assertDoesNotExist()
    }

    @Composable
    private fun WithBrowser(opened: MutableList<String>, content: @Composable () -> Unit) {
        val browser = object : UriHandler {
            override fun openUri(uri: String) {
                opened += uri
            }
        }
        CompositionLocalProvider(LocalUriHandler provides browser, content = content)
    }

    private fun SemanticsNodeInteraction.text(): AnnotatedString =
        fetchSemanticsNode().config[SemanticsProperties.Text].single()

    private fun AnnotatedString.links(): List<Pair<String, String>> =
        getLinkAnnotations(0, length).map { substring(it.start, it.end) to (it.item as LinkAnnotation.Url).url }

    private fun model(locked: Boolean): AccessViewModel =
        AccessViewModel(if (locked) FakeAccessSession.locked() else FakeAccessSession.firstRun())

    private companion object {
        const val PRIVACY = "https://chromvoid.com/en/legal/privacy-policy/"
        const val TERMS = "https://chromvoid.com/en/legal/terms-of-service-eula/"
    }
}
