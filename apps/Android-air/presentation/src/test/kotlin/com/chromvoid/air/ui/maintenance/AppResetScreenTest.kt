package com.chromvoid.air.ui.maintenance

import android.content.Context
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.isToggleable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.lifecycle.ViewModelStore
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.AirApp
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.FakeAccessSession
import com.chromvoid.air.ui.ShellViewModel
import com.chromvoid.air.ui.access.ACCESS_UTILITIES_TAG
import com.chromvoid.air.ui.access.AccessViewModel
import com.chromvoid.air.ui.access.utilityTag
import com.chromvoid.air.ui.credentials.FakeClipboard
import com.chromvoid.air.ui.credentials.FakeCredentialStore
import com.chromvoid.air.ui.maintenance.AppResetModel.Status
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class AppResetScreenTest {
    @get:Rule
    public val rule: androidx.compose.ui.test.junit4.ComposeContentTestRule = createComposeRule()

    private var requests = 0
    private var accepted = true
    private var dismissals = 0
    private val model = AppResetModel(AppReset {
        requests += 1
        accepted
    })

    private fun text(id: Int): String = ApplicationProvider.getApplicationContext<Context>().getString(id)

    private fun show() {
        rule.setContent { AirTheme { AppResetScreen(model, onDismiss = { dismissals += 1 }) } }
    }

    private fun click(tag: String) {
        rule.onNodeWithTag(MAINTENANCE_LIST_TAG).performScrollToNode(hasTestTag(tag))
        rule.onNodeWithTag(tag).performClick()
    }

    private fun review() {
        click(APP_RESET_ACKNOWLEDGE_TAG)
        click(APP_RESET_REVIEW_TAG)
    }

    @Test
    public fun `the locked app opens reset through Utilities Danger and requests it only after both steps`() {
        val session = FakeAccessSession.locked()
        val access = AccessViewModel(session)
        val shell = ShellViewModel(
            session,
            FakeCredentialStore(),
            FakeClipboard(),
            maintenanceServices = MaintenanceServices(appReset = AppReset {
                requests += 1
                true
            }),
        )
        val viewModels = ViewModelStore().apply {
            put("access", access)
            put("shell", shell)
        }
        try {
            rule.setContent { AirTheme { AirApp(access, shell, onRetry = {}) } }
            rule.onNodeWithTag(ACCESS_UTILITIES_TAG).performScrollTo().performClick()
            rule.onNodeWithText(text(R.string.utilities_danger)).assertIsDisplayed()
            rule.onNodeWithTag(utilityTag(MaintenanceAction.APP_RESET)).performScrollTo().performClick()

            rule.onNodeWithTag(APP_RESET_DATA_WARNING_TAG).assertIsDisplayed()
            rule.onNodeWithTag(APP_RESET_CONFIRMATION_TAG).assertDoesNotExist()
            click(APP_RESET_ACKNOWLEDGE_TAG)
            assertEquals(0, requests)
            click(APP_RESET_REVIEW_TAG)
            rule.onNodeWithTag(APP_RESET_CONFIRMATION_TAG).assertIsDisplayed()
            assertEquals(0, requests)
            rule.onNodeWithTag(APP_RESET_CONFIRM_TAG).performClick()

            assertEquals(1, requests)
            assertEquals(AirSessionState.Locked, session.state.value)
            val route = checkNotNull(shell.maintenance.value).route.value as MaintenanceRoute.ResetApp
            assertEquals(Status.REQUESTED, route.model.state.value.status)
        } finally {
            rule.runOnIdle { viewModels.clear() }
        }
    }

    @Test
    public fun `the forgotten password row opens a fresh reset warning and releases the erase review`() {
        var cancelled = 0
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        val maintenance = MaintenanceScope(
            1uL,
            MaintenanceServices(
                erasure = object : EraseStore {
                    override suspend fun reviewErase(generation: ULong): EraseReview = object : EraseReview {
                        override suspend fun commit(masterPassword: String): EraseOutcome = error("must not delete")
                        override fun cancel() { cancelled += 1 }
                    }
                },
                appReset = AppReset {
                    requests += 1
                    true
                },
            ),
            scope,
            { AirSessionState.Locked },
        )
        try {
            maintenance.open(MaintenanceAction.ERASE)
            rule.setContent { AirTheme { MaintenanceHost(maintenance) {} } }
            rule.onNodeWithTag(MAINTENANCE_LIST_TAG).performScrollToNode(hasTestTag(ERASE_FORGOT_PASSWORD_TAG))
            rule.onNodeWithText(text(R.string.app_reset_forgot_password)).performClick()

            rule.onNodeWithTag(APP_RESET_DATA_WARNING_TAG).assertIsDisplayed()
            assertEquals(1, cancelled)
            val reset = (maintenance.route.value as MaintenanceRoute.ResetApp).model
            assertEquals(AppResetModel.State(), reset.state.value)
            review()
            rule.onNodeWithTag(APP_RESET_CANCEL_TAG).performClick()
            assertEquals(AppResetModel.State(), reset.state.value)
            rule.onNodeWithTag(APP_RESET_CLOSE_TAG).performClick()
            assertEquals(null, maintenance.route.value)
            assertEquals(0, requests)
        } finally {
            rule.runOnIdle {
                maintenance.close()
                scope.cancel()
            }
        }
    }

    @Test
    public fun `the warning explains data loss and backup passwords without requesting a password`() {
        show()

        rule.onNodeWithText(text(R.string.app_reset_data_heading)).assertIsDisplayed()
        rule.onNodeWithText(text(R.string.app_reset_warning)).assertIsDisplayed()
        rule.onNodeWithText(text(R.string.app_reset_recovery_heading)).performScrollTo().assertIsDisplayed()
        rule.onNodeWithText(text(R.string.app_reset_backup)).performScrollTo().assertIsDisplayed()
        rule.onNodeWithText(text(R.string.app_reset_passwords)).performScrollTo().assertIsDisplayed()
        rule.onNodeWithText(text(R.string.app_reset_restart)).performScrollTo().assertIsDisplayed()
        rule.onAllNodes(hasSetTextAction()).assertCountEquals(0)
        assertEquals(0, requests)
    }

    @Test
    public fun `consent is an unchecked checkbox whose label toggles the acknowledgement`() {
        assertAcknowledgement()
    }

    @Test
    @Config(qualifiers = "ru-rRU-w411dp-h891dp")
    public fun `the Russian consent row exposes its localized name and checked state`() {
        assertAcknowledgement()
    }

    private fun assertAcknowledgement() {
        show()
        rule.onNodeWithTag(MAINTENANCE_LIST_TAG).performScrollToNode(hasTestTag(APP_RESET_ACKNOWLEDGE_TAG))
        rule.onAllNodes(isToggleable(), useUnmergedTree = true).assertCountEquals(1)
        rule.onNodeWithTag(APP_RESET_ACKNOWLEDGE_TAG)
            .assertTextContains(text(R.string.app_reset_acknowledge))
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Checkbox))
            .assertHasClickAction()
            .assertIsOff()

        rule.onNodeWithText(text(R.string.app_reset_acknowledge)).performClick()
        rule.onNodeWithTag(APP_RESET_ACKNOWLEDGE_TAG).assertIsOn()
        assertEquals(true, model.state.value.acknowledged)
        rule.onNodeWithTag(APP_RESET_ACKNOWLEDGE_TAG).performClick().assertIsOff()
        assertEquals(false, model.state.value.acknowledged)
        assertEquals(0, requests)
    }

    @Test
    public fun `trying to continue without consent explains the required acknowledgement`() {
        show()

        click(APP_RESET_REVIEW_TAG)

        rule.onNodeWithTag(MAINTENANCE_LIST_TAG).performScrollToNode(hasTestTag(APP_RESET_ISSUE_TAG))
        rule.onNodeWithTag(APP_RESET_ISSUE_TAG).assertIsDisplayed()
        rule.onNodeWithTag(APP_RESET_CONFIRMATION_TAG).assertDoesNotExist()
        assertEquals(0, requests)
    }

    @Test
    public fun `the Android reset is requested only by the final destructive confirmation`() {
        show()
        review()

        rule.onNodeWithTag(APP_RESET_CONFIRMATION_TAG).assertIsDisplayed()
        rule.onNodeWithText(text(R.string.app_reset_confirm_text)).assertIsDisplayed()
        assertEquals(0, requests)
        rule.onNodeWithTag(APP_RESET_CONFIRM_TAG).performClick()

        rule.onNodeWithTag(MAINTENANCE_LIST_TAG).performScrollToNode(hasTestTag(APP_RESET_PROGRESS_TAG))
        rule.onNodeWithTag(APP_RESET_PROGRESS_TAG).assertIsDisplayed()
        rule.onNodeWithTag(APP_RESET_CONFIRMATION_TAG).assertDoesNotExist()
        rule.onNodeWithTag(APP_RESET_CLOSE_TAG).assertDoesNotExist()
        rule.onNodeWithTag(APP_RESET_REVIEW_TAG).assertDoesNotExist()
        assertEquals(Status.REQUESTED, model.state.value.status)
        assertEquals(1, requests)
    }

    @Test
    public fun `cancelling the final dialog drops the acknowledgement and preserves local data`() {
        show()
        review()

        rule.onNodeWithTag(APP_RESET_CANCEL_TAG).performClick()

        rule.onNodeWithTag(APP_RESET_CONFIRMATION_TAG).assertDoesNotExist()
        assertEquals(AppResetModel.State(), model.state.value)
        assertEquals(0, requests)
        click(APP_RESET_REVIEW_TAG)
        rule.onNodeWithTag(APP_RESET_CONFIRMATION_TAG).assertDoesNotExist()
        assertEquals(AppResetModel.Issue.ACKNOWLEDGEMENT_REQUIRED, model.state.value.issue)
    }

    @Test
    public fun `closing the warning leaves without asking Android to erase anything`() {
        show()
        click(APP_RESET_ACKNOWLEDGE_TAG)

        rule.onNodeWithTag(APP_RESET_CLOSE_TAG).performClick()

        assertEquals(1, dismissals)
        assertEquals(0, requests)
    }

    @Test
    public fun `a rejected Android request offers a fresh warning instead of immediate deletion`() {
        accepted = false
        show()
        review()
        rule.onNodeWithTag(APP_RESET_CONFIRM_TAG).performClick()

        rule.onNodeWithTag(MAINTENANCE_LIST_TAG).performScrollToNode(hasTestTag(APP_RESET_ISSUE_TAG))
        rule.onNodeWithText(text(R.string.app_reset_failed)).assertIsDisplayed()
        rule.onNodeWithText(text(R.string.app_reset_retry)).performScrollTo().performClick()

        assertEquals(AppResetModel.State(), model.state.value)
        assertEquals(1, requests)
        rule.onNodeWithTag(MAINTENANCE_LIST_TAG).performScrollToNode(hasTestTag(APP_RESET_ACKNOWLEDGE_TAG))
        rule.onNodeWithTag(APP_RESET_ACKNOWLEDGE_TAG).assertIsOff()
        click(APP_RESET_REVIEW_TAG)
        rule.onNodeWithTag(APP_RESET_CONFIRMATION_TAG).assertDoesNotExist()
    }
}
