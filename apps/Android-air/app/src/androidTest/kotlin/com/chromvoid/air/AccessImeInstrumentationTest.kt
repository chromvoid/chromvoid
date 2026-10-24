package com.chromvoid.air

import android.content.res.Configuration
import android.graphics.Bitmap
import android.os.LocaleList
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import android.view.MotionEvent
import androidx.activity.compose.setContent
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.test.espresso.Espresso.closeSoftKeyboard
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.chromvoid.air.ui.AccessInput
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AccessSession
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.access.ACCESS_CONFIRMATION_TAG
import com.chromvoid.air.ui.access.ACCESS_ERROR_TAG
import com.chromvoid.air.ui.access.ACCESS_PASSWORD_TAG
import com.chromvoid.air.ui.access.ACCESS_SUBMIT_TAG
import com.chromvoid.air.ui.access.AccessViewModel
import com.chromvoid.air.ui.access.AdministratorSetupScreen
import com.chromvoid.air.ui.access.UnlockScreen
import com.chromvoid.air.ui.access.WELCOME_CONTINUE_TAG
import com.chromvoid.air.ui.settings.AppearanceModel
import java.io.File
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Opt-in, emulator-only keyboard acceptance with an in-memory session. The real
 * activity window and real IME are used; no vault or Core access attempt is made.
 * Screen-coordinate taps prove the submit target can actually be reached while
 * the keyboard is still visible, without scrolling or dismissing it first.
 */
@RunWith(AndroidJUnit4::class)
public class AccessImeInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val arguments get() = InstrumentationRegistry.getArguments()
    private val measurements = JSONArray()
    private val requestedLocale get() = arguments.getString("accessLocale") ?: "en"
    private val viewport get() = arguments.getString("accessViewport") ?: "normal"
    private val outputDirectory: File
        get() {
            val output = arguments.getString("additionalTestOutputDir")
                ?: rule.activity.getExternalFilesDir(null)!!.path
            return File(output, "access-ime/$viewport-$requestedLocale").apply { mkdirs() }
        }

    @Test
    public fun focusedAccessFormsKeepTheSubmitAboveTheRealKeyboard() {
        assumeTrue(arguments.getString("accessIme") == "1")
        assumeTrue("only an isolated emulator", shell("getprop ro.kernel.qemu").trim() == "1")
        val originalNightMode = shell("cmd uimode night").substringAfter(":").trim()
        check(originalNightMode in setOf("no", "yes", "auto", "custom"))
        try {
            listOf(AppearanceModel.Theme.LIGHT, AppearanceModel.Theme.DARK).forEach { theme ->
                shell("cmd uimode night ${if (theme == AppearanceModel.Theme.DARK) "yes" else "no"}")
                verifyUnlock(theme)
                verifySetup(theme)
            }
        } finally {
            File(outputDirectory, "bounds.json").writeText(measurements.toString(2))
            shell("cmd uimode night $originalNightMode")
        }
    }

    private fun verifyUnlock(theme: AppearanceModel.Theme) {
        val session = InMemoryAccessSession(AirSessionState.Locked)
        render(session, theme, setup = false)
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG).performClick().performTextReplacement(PASSWORD)
        awaitIme(ACCESS_PASSWORD_TAG)
        val name = "${theme.stored}-unlock-password"
        verifyAndCapture(name, listOf(ACCESS_PASSWORD_TAG))
        tapSubmit()
        rule.waitUntil(TIMEOUT_MILLIS) { session.unlocks == 1 }
        assertEquals(0, session.setups)
    }

    private fun verifySetup(theme: AppearanceModel.Theme) {
        val session = InMemoryAccessSession(AirSessionState.NeedsAdministrator)
        render(session, theme, setup = true)
        rule.onNodeWithTag(WELCOME_CONTINUE_TAG).performScrollTo().performClick()
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG).performClick().performTextReplacement(PASSWORD)
        awaitIme(ACCESS_PASSWORD_TAG)
        val passwordName = "${theme.stored}-setup-password"
        verifyAndCapture(passwordName, listOf(ACCESS_PASSWORD_TAG, ACCESS_CONFIRMATION_TAG))
        tapSubmit()
        awaitIme(ACCESS_CONFIRMATION_TAG)
        rule.onNodeWithTag(ACCESS_ERROR_TAG).assertIsDisplayed()
        rule.onNodeWithTag(ACCESS_CONFIRMATION_TAG).assertIsFocused()
        assertEquals(0, session.setups)
        val validationName = "${theme.stored}-setup-validation"
        verifyAndCapture(validationName, listOf(ACCESS_PASSWORD_TAG, ACCESS_CONFIRMATION_TAG, ACCESS_ERROR_TAG))
        rule.onNodeWithTag(ACCESS_CONFIRMATION_TAG).performClick().performTextReplacement(PASSWORD)
        awaitIme(ACCESS_CONFIRMATION_TAG)
        val confirmationName = "${theme.stored}-setup-confirmation"
        verifyAndCapture(confirmationName, listOf(ACCESS_PASSWORD_TAG, ACCESS_CONFIRMATION_TAG))
        tapSubmit()
        rule.waitUntil(TIMEOUT_MILLIS) { session.setups == 1 }
        assertEquals(0, session.unlocks)
    }

    private fun render(session: InMemoryAccessSession, theme: AppearanceModel.Theme, setup: Boolean) {
        // A new fixture must show its own keyboard: retained insets from the
        // previous field must never count as evidence that this IME appeared.
        closeSoftKeyboard()
        rule.waitUntil(TIMEOUT_MILLIS) { !imeVisible() }
        awaitFrameCommit()
        val model = AccessViewModel(session)
        rule.runOnUiThread {
            val configuration = Configuration().apply {
                setLocales(LocaleList(Locale.forLanguageTag(requestedLocale)))
            }
            val context = rule.activity.createConfigurationContext(configuration)
            rule.activity.setContent {
                CompositionLocalProvider(
                    LocalContext provides context,
                    LocalConfiguration provides context.resources.configuration,
                ) {
                    AirTheme(theme) {
                        SideEffect {
                            val decor = rule.activity.window.decorView
                            WindowCompat.getInsetsController(rule.activity.window, decor).apply {
                                isAppearanceLightStatusBars = theme == AppearanceModel.Theme.LIGHT
                                isAppearanceLightNavigationBars = theme == AppearanceModel.Theme.LIGHT
                            }
                        }
                        if (setup) {
                            AdministratorSetupScreen(model, onHelp = {}, onRestore = {})
                        } else {
                            UnlockScreen(model, onHelp = {}, onUtilities = {}, onConnections = {})
                        }
                    }
                }
            }
        }
        rule.waitForIdle()
    }

    private fun awaitIme(focusedTag: String) {
        rule.waitForIdle()
        rule.onNodeWithTag(focusedTag).assertIsFocused()
        rule.waitUntil(TIMEOUT_MILLIS) { imeVisible() }
        rule.waitForIdle()
        awaitFrameCommit()
        instrumentation.uiAutomation.waitForIdle(500, 5_000)
    }

    private fun awaitFrameCommit() {
        val committed = CountDownLatch(1)
        rule.runOnUiThread {
            val decor = rule.activity.window.decorView
            decor.viewTreeObserver.registerFrameCommitCallback { committed.countDown() }
            decor.postInvalidateOnAnimation()
        }
        assertTrue("the updated window frame was submitted", committed.await(5, TimeUnit.SECONDS))
    }

    private fun imeVisible(): Boolean =
        ViewCompat.getRootWindowInsets(rule.activity.window.decorView)?.isVisible(WindowInsetsCompat.Type.ime()) == true

    private fun verifyAndCapture(name: String, fields: List<String>) {
        try {
            verifyBounds(name, fields)
        } finally {
            // Capture only after geometry has been read from the visible IME
            // frame. Preserve a frame even for a failing baseline assertion.
            awaitFrameCommit()
            capture(name)
        }
    }

    private fun verifyBounds(name: String, fields: List<String>) {
        assertTrue("the keyboard remains visible", imeVisible())
        val decor = rule.activity.window.decorView
        val ime = ViewCompat.getRootWindowInsets(decor)!!.getInsets(WindowInsetsCompat.Type.ime())
        val imeTop = decor.height - ime.bottom
        val density = rule.activity.resources.displayMetrics.density
        val item = JSONObject()
            .put("name", name)
            .put("density", density.toDouble())
            .put("windowHeight", decor.height)
            .put("imeTop", imeTop)
            .put("imeBottomInset", ime.bottom)
        measurements.put(item)
        (fields + ACCESS_SUBMIT_TAG).forEach { tag ->
            val node = rule.onNodeWithTag(tag).assertIsDisplayed().fetchSemanticsNode()
            val bounds = node.boundsInWindow
            item.put(tag, bounds.toJson())
            assertTrue("$tag has non-empty bounds: $bounds", bounds.width > 0 && bounds.height > 0)
            assertTrue("$tag is fully above the IME: $bounds, IME top=$imeTop", bounds.bottom <= imeTop)
        }
        val submit = rule.onNodeWithTag(ACCESS_SUBMIT_TAG).fetchSemanticsNode().boundsInWindow
        val gapDp = (imeTop - submit.bottom) / density
        item.put("submitGapDp", gapDp.toDouble())
        assertTrue("submit has breathing room above the keyboard: ${gapDp}dp", gapDp >= 19.5f)
    }

    private fun tapSubmit() {
        assertTrue("the keyboard is visible immediately before the tap", imeVisible())
        val center = rule.onNodeWithTag(ACCESS_SUBMIT_TAG).fetchSemanticsNode().boundsInWindow.center
        val origin = IntArray(2)
        rule.activity.window.decorView.getLocationOnScreen(origin)
        val x = center.x + origin[0]
        val y = center.y + origin[1]
        val downTime = SystemClock.uptimeMillis()
        val down = MotionEvent.obtain(downTime, downTime, MotionEvent.ACTION_DOWN, x, y, 0)
        val up = MotionEvent.obtain(downTime, downTime + 40, MotionEvent.ACTION_UP, x, y, 0)
        try {
            instrumentation.sendPointerSync(down)
            instrumentation.sendPointerSync(up)
        } finally {
            down.recycle()
            up.recycle()
        }
    }

    private fun capture(name: String) {
        val bitmap = instrumentation.uiAutomation.takeScreenshot()
        assertNotNull("the synthetic debug window can be captured", bitmap)
        File(outputDirectory, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
    }

    private fun Rect.toJson(): JSONObject = JSONObject()
        .put("left", left.toDouble())
        .put("top", top.toDouble())
        .put("right", right.toDouble())
        .put("bottom", bottom.toDouble())

    private fun shell(command: String): String =
        ParcelFileDescriptor.AutoCloseInputStream(instrumentation.uiAutomation.executeShellCommand(command))
            .bufferedReader().use { it.readText() }

    private class InMemoryAccessSession(initial: AirSessionState) : AccessSession {
        override val state: StateFlow<AirSessionState> = MutableStateFlow(initial)
        override val sequence: StateFlow<ULong> = MutableStateFlow(0uL)
        override val administration: StateFlow<ULong?> = MutableStateFlow(1uL)

        @Volatile var unlocks = 0
        @Volatile var setups = 0

        override suspend fun setUpAdministrator(password: String, confirmation: String): AccessOutcome {
            AccessInput.administratorProblem(password, confirmation)?.let { return AccessOutcome.Rejected(it) }
            setups += 1
            return AccessOutcome.Accepted
        }

        override suspend fun unlock(password: String): AccessOutcome {
            AccessInput.unlockProblem(password)?.let { return AccessOutcome.Rejected(it) }
            unlocks += 1
            return AccessOutcome.Accepted
        }

        override suspend fun lock() = Unit

        override suspend fun refresh() = Unit
    }

    private companion object {
        const val PASSWORD = "synthetic-access-ime-password"
        const val TIMEOUT_MILLIS = 20_000L
    }
}
