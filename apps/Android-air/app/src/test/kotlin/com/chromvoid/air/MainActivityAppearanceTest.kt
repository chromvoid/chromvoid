package com.chromvoid.air

import android.app.Activity
import android.app.Application
import android.graphics.drawable.ColorDrawable
import android.os.Bundle
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToKey
import androidx.core.view.WindowInsetsControllerCompat
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.session.FakeSessionRuntime
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.design.AirColors
import com.chromvoid.air.ui.design.DarkAirColors
import com.chromvoid.air.ui.design.LightAirColors
import com.chromvoid.air.ui.settings.AppearanceModel
import com.chromvoid.air.ui.settings.SETTINGS_LIST_TAG
import com.chromvoid.air.ui.settings.SETTINGS_THEME_TAG
import com.chromvoid.air.ui.settings.themeOptionTag
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class, sdk = [29, 30, 31], qualifiers = "w411dp-h891dp-night")
public class MainActivityAppearanceTest {
    @get:Rule
    public val rule = createEmptyComposeRule()

    @Test
    public fun `changing themes preserves the foreground session and returns to live system night`() {
        val application = ApplicationProvider.getApplicationContext<Application>()
        val originalQualifiers = RuntimeEnvironment.getQualifiers()
        val runtime = FakeSessionRuntime()
        shadowOf(application).grantPermissions("${application.packageName}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION")
        AirAppGraph.testRuntime = { runtime }
        val graph = AirAppGraph.of(application)
        graph.appearancePreferences.theme = AppearanceModel.Theme.LIGHT.stored
        graph.sessionPreferences.lockOnLeave = true
        graph.sessionPreferences.lockNotification = false
        runBlocking {
            graph.session.start()
            assertEquals(AccessOutcome.Accepted, graph.session.unlock("synthetic-test-vault"))
        }

        val controller = Robolectric.buildActivity(MainActivity::class.java).create()
        val activity = controller.get()
        val lifecycle = ForegroundLifecycle()
        try {
            assertWindowTheme(activity, LightAirColors)
            controller.start().postCreate(null).resume().visible().topActivityResumed(true)
            application.registerActivityLifecycleCallbacks(lifecycle)
            rule.waitForIdle()
            assertWindowTheme(activity, LightAirColors)
            rule.onNodeWithTag("root-settings").performClick()
            rule.onNodeWithTag(SETTINGS_LIST_TAG).performScrollToKey("appearance")

            fun assertForegroundSession() {
                rule.runOnIdle {
                    assertSame("theme changes keep the Activity instance", activity, controller.get())
                    assertFalse("the Activity remains alive", activity.isDestroyed)
                    assertEquals("theme changes do not leave the foreground", emptyList<String>(), lifecycle.events)
                    assertEquals("lock-on-leave never deactivates the runtime", 0, runtime.deactivateCount)
                    assertEquals("lock-on-leave never locks the runtime", 0, runtime.lockCount)
                    assertTrue("the vault remains open", graph.session.state.value is AirSessionState.Unlocked)
                }
            }

            fun selectTheme(theme: AppearanceModel.Theme, colors: AirColors) {
                rule.onNodeWithTag(SETTINGS_THEME_TAG).performClick()
                rule.onNodeWithTag(themeOptionTag(theme)).performClick()
                rule.onNodeWithTag(SETTINGS_THEME_TAG).assertTextContains(
                    activity.getString(theme.label),
                    substring = true,
                )
                rule.runOnIdle { assertWindowTheme(activity, colors) }
                assertForegroundSession()
            }

            selectTheme(AppearanceModel.Theme.DARK, DarkAirColors)
            selectTheme(AppearanceModel.Theme.SYSTEM, DarkAirColors)

            rule.runOnIdle {
                RuntimeEnvironment.setQualifiers("+notnight")
                controller.configurationChange()
            }
            rule.runOnIdle { assertWindowTheme(activity, LightAirColors) }
            assertForegroundSession()

            selectTheme(AppearanceModel.Theme.LIGHT, LightAirColors)
            selectTheme(AppearanceModel.Theme.DARK, DarkAirColors)
            selectTheme(AppearanceModel.Theme.SYSTEM, LightAirColors)

            rule.runOnIdle {
                RuntimeEnvironment.setQualifiers("+night")
                controller.configurationChange()
            }
            rule.runOnIdle { assertWindowTheme(activity, DarkAirColors) }
            assertForegroundSession()
        } finally {
            application.unregisterActivityLifecycleCallbacks(lifecycle)
            controller.close()
            AirAppGraph.testRuntime = null
            RuntimeEnvironment.setQualifiers(originalQualifiers)
        }
    }

    private fun assertWindowTheme(activity: MainActivity, colors: AirColors) {
        val background = activity.window.decorView.background as ColorDrawable
        assertEquals(
            "the native window canvas follows the active Air theme",
            colors.canvas.toArgb(),
            background.color,
        )
        val darkIcons = !colors.isDark
        val insets = WindowInsetsControllerCompat(activity.window, activity.window.decorView)
        assertEquals("status bar icons follow the active Air theme", darkIcons, insets.isAppearanceLightStatusBars)
        assertEquals(
            "navigation bar icons follow the active Air theme",
            darkIcons,
            insets.isAppearanceLightNavigationBars,
        )
    }

    private class ForegroundLifecycle : Application.ActivityLifecycleCallbacks {
        val events = mutableListOf<String>()

        override fun onActivityPaused(activity: Activity) {
            if (activity is MainActivity) events += "paused"
        }

        override fun onActivityStopped(activity: Activity) {
            if (activity is MainActivity) events += "stopped"
        }

        override fun onActivityDestroyed(activity: Activity) {
            if (activity is MainActivity) events += "destroyed"
        }

        override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
        override fun onActivityStarted(activity: Activity) = Unit
        override fun onActivityResumed(activity: Activity) = Unit
        override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
    }
}
