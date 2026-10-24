package com.chromvoid.air.ui

import android.content.Context
import android.graphics.Bitmap
import androidx.activity.ComponentActivity
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.UriHandler
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.lifecycle.ViewModelStore
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.access.ACCESS_HELP_TAG
import com.chromvoid.air.ui.access.AccessViewModel
import com.chromvoid.air.ui.credentials.FakeClipboard
import com.chromvoid.air.ui.credentials.FakeCredentialStore
import com.chromvoid.air.ui.maintenance.APP_RESET_ACKNOWLEDGE_TAG
import com.chromvoid.air.ui.maintenance.APP_RESET_CLOSE_TAG
import com.chromvoid.air.ui.maintenance.APP_RESET_CONFIRMATION_TAG
import com.chromvoid.air.ui.maintenance.APP_RESET_DATA_WARNING_TAG
import com.chromvoid.air.ui.maintenance.APP_RESET_REVIEW_TAG
import com.chromvoid.air.ui.maintenance.AppReset
import com.chromvoid.air.ui.maintenance.AppResetModel
import com.chromvoid.air.ui.maintenance.MAINTENANCE_LIST_TAG
import com.chromvoid.air.ui.maintenance.MaintenanceServices
import java.io.File
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w360dp-h800dp-xhdpi")
public class AdoptionScreenTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    private val viewModels = ViewModelStore()
    private val opened = mutableListOf<String>()
    private var retries = 0
    private var resets = 0
    private lateinit var session: FakeAccessSession
    private lateinit var shell: ShellViewModel

    @After
    public fun closeModels() {
        rule.runOnIdle { viewModels.clear() }
    }

    @Test
    public fun `two vaults offer only support and cannot reach reset`() {
        show(AdoptionIssue.BLOCKED)

        supportOnly(R.string.adoption_blocked_title, R.string.adoption_blocked_text)
        shot("blocked-en-light")
        rule.runOnIdle { shell.openRecoveryReset() }

        assertNull(shell.recoveryReset.value)
        assertNull(shell.maintenance.value)
        assertEquals(0, retries)
        assertEquals(0, resets)
    }

    @Test
    public fun `unverified previous vault offers only support`() {
        show(AdoptionIssue.LEGACY_ROOT_OUTSIDE_DATA_DIR)

        supportOnly(R.string.adoption_root_unverified_title, R.string.adoption_cannot_open_text)
    }

    @Test
    public fun `unavailable previous vault offers only support`() {
        show(AdoptionIssue.LEGACY_ROOT_UNAVAILABLE)

        supportOnly(R.string.adoption_root_unavailable_title, R.string.adoption_cannot_open_text)
    }

    @Test
    public fun `unavailable storage transfer offers only support`() {
        show(AdoptionIssue.STORAGE_UNAVAILABLE)

        supportOnly(R.string.adoption_storage_unavailable_title, R.string.adoption_cannot_open_text)
    }

    @Test
    public fun `unfinished transfer explains why an action cannot continue`() {
        show(AdoptionIssue.ACTION_FORBIDDEN)

        supportOnly(R.string.adoption_unfinished_title, R.string.maintenance_issue_adoption_required)
    }

    @Test
    public fun `unavailable device key offers retry support and an explicit destructive reset path`() {
        show(AdoptionIssue.PEPPER_UNAVAILABLE)

        rule.onNodeWithTag(SESSION_STATE_TAG).assertTextEquals(text(R.string.adoption_pepper_title))
        rule.onNodeWithText(text(R.string.adoption_pepper_text)).assertIsDisplayed()
        rule.onNodeWithTag(ADOPTION_RETRY_TAG).performScrollTo().performClick()
        assertEquals(1, retries)
        contactSupport()
        rule.onNodeWithTag(ADOPTION_RESET_TAG)
            .assertTextEquals(text(R.string.adoption_reset_permanently)).performScrollTo().performClick()

        // Recovery reuses the same two-step reset screen; entering it erases nothing.
        rule.onNodeWithTag(APP_RESET_DATA_WARNING_TAG).assertIsDisplayed()
        rule.onNodeWithTag(APP_RESET_CONFIRMATION_TAG).assertDoesNotExist()
        clickMaintenance(APP_RESET_ACKNOWLEDGE_TAG)
        clickMaintenance(APP_RESET_REVIEW_TAG)
        rule.onNodeWithTag(APP_RESET_CONFIRMATION_TAG).assertIsDisplayed()
        assertEquals(0, resets)
    }

    @Test
    @Config(qualifiers = "ru-rRU-w360dp-h800dp-night-xhdpi")
    public fun `Russian device key screen keeps retry and clearly names permanent deletion`() {
        show(AdoptionIssue.PEPPER_UNAVAILABLE)

        rule.onNodeWithTag(SESSION_STATE_TAG).assertTextEquals("Ключ устройства недоступен")
        rule.onNodeWithText(text(R.string.adoption_pepper_text)).assertIsDisplayed()
        rule.onNodeWithTag(ADOPTION_RETRY_TAG).performScrollTo().assertTextEquals("Повторить")
        rule.onNodeWithTag(ADOPTION_RESET_TAG)
            .performScrollTo().assertTextEquals(
                "Сбросить и безвозвратно " + "удалить хранилище",
            )
        shot("pepper-ru-dark")
        contactSupport()
    }

    @Test
    public fun `device key screen offers no reset when the platform has no reset service`() {
        show(AdoptionIssue.PEPPER_UNAVAILABLE, offersReset = false)

        rule.onNodeWithTag(ADOPTION_RETRY_TAG).assertIsDisplayed()
        rule.onNodeWithTag(ADOPTION_RESET_TAG).assertDoesNotExist()
        rule.runOnIdle { shell.openRecoveryReset() }
        assertNull(shell.recoveryReset.value)
    }

    @Test
    public fun `closing recovery reset returns to the unavailable device key without erasing`() {
        show(AdoptionIssue.PEPPER_UNAVAILABLE)
        rule.onNodeWithTag(ADOPTION_RESET_TAG).performScrollTo().performClick()
        val reset = checkNotNull(shell.recoveryReset.value)

        rule.onNodeWithTag(APP_RESET_CLOSE_TAG).performClick()

        rule.onNodeWithTag(ADOPTION_RETRY_TAG).assertIsDisplayed()
        assertNull(shell.recoveryReset.value)
        assertEquals(AppResetModel.Status.REVOKED, reset.state.value.status)
        assertEquals(0, resets)
    }

    @Test
    public fun `a changed adoption failure revokes recovery reset and leaves only support`() {
        show(AdoptionIssue.PEPPER_UNAVAILABLE)
        rule.onNodeWithTag(ADOPTION_RESET_TAG).performScrollTo().performClick()
        val reset = checkNotNull(shell.recoveryReset.value)

        rule.runOnIdle { session.move(AirSessionState.Unavailable("blocked", AdoptionIssue.BLOCKED)) }

        supportOnly(R.string.adoption_blocked_title, R.string.adoption_blocked_text)
        assertNull(shell.recoveryReset.value)
        assertEquals(AppResetModel.Status.REVOKED, reset.state.value.status)
        assertEquals(0, resets)
    }

    private fun show(issue: AdoptionIssue, offersReset: Boolean = true) {
        session = FakeAccessSession(AirSessionState.Unavailable("internal/path/must/not/show", issue))
        val access = AccessViewModel(session)
        shell = ShellViewModel(
            session,
            FakeCredentialStore(),
            FakeClipboard(),
            maintenanceServices = MaintenanceServices(
                appReset = if (offersReset) AppReset { resets += 1; true } else null,
            ),
        )
        viewModels.put("access", access)
        viewModels.put("shell", shell)
        val browser = object : UriHandler {
            override fun openUri(uri: String) { opened += uri }
        }
        rule.setContent {
            AirTheme {
                CompositionLocalProvider(LocalUriHandler provides browser) {
                    AirApp(access, shell, onRetry = { retries += 1 })
                }
            }
        }
    }

    private fun supportOnly(title: Int, message: Int) {
        rule.onNodeWithTag(SESSION_STATE_TAG).assertTextEquals(text(title))
        rule.onNodeWithText(text(message)).assertIsDisplayed()
        rule.onNodeWithText("internal/path/must/not/show", substring = true).assertDoesNotExist()
        rule.onNodeWithTag(ADOPTION_RETRY_TAG).assertDoesNotExist()
        rule.onNodeWithTag(ADOPTION_RESET_TAG).assertDoesNotExist()
        rule.onNodeWithTag(ACCESS_HELP_TAG).assertDoesNotExist()
        rule.onNodeWithTag(STORAGE_HELP_TAG).assertDoesNotExist()
        contactSupport()
    }

    private fun contactSupport() {
        rule.onNodeWithText("support@chromvoid.com").assertIsDisplayed()
        rule.onNodeWithTag(ADOPTION_SUPPORT_TAG).performScrollTo().performClick()
        assertEquals(listOf("mailto:support@chromvoid.com"), opened)
    }

    private fun clickMaintenance(tag: String) {
        rule.onNodeWithTag(MAINTENANCE_LIST_TAG).performScrollToNode(hasTestTag(tag))
        rule.onNodeWithTag(tag).performClick()
    }

    private fun text(id: Int): String = ApplicationProvider.getApplicationContext<Context>().getString(id)

    /** Render evidence stays in ignored build output and never invokes an external app or device. */
    private fun shot(name: String) {
        rule.waitForIdle()
        val view = rule.activity.window.decorView
        val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
        view.draw(android.graphics.Canvas(bitmap))
        val folder = File(System.getProperty("user.dir"), "build/adoption-ui").apply { mkdirs() }
        File(folder, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
    }
}
