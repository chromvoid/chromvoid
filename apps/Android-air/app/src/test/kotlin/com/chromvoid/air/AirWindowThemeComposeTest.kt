package com.chromvoid.air

import android.app.Application
import androidx.activity.ComponentActivity
import androidx.compose.runtime.getValue
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.settings.AppearanceModel
import com.chromvoid.air.ui.settings.AppearancePreferences
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class, sdk = [29, 30, 31])
public class AirWindowThemeComposeTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    @Test
    @Config(qualifiers = "notnight")
    public fun `changing the appearance model updates both bars and returns to the light system`() {
        assertThemeChanges(systemIsDark = false)
    }

    @Test
    @Config(qualifiers = "night")
    public fun `changing the appearance model updates both bars and returns to the dark system`() {
        assertThemeChanges(systemIsDark = true)
    }

    private fun assertThemeChanges(systemIsDark: Boolean) {
        val preferences = object : AppearancePreferences {
            override var theme = AppearanceModel.Theme.SYSTEM.stored
            override var language = AppearanceModel.Language.SYSTEM.stored
        }
        val appearance = AppearanceModel(preferences)
        rule.setContent {
            val state by appearance.state.collectAsStateWithLifecycle()
            AirTheme(state.theme) { rule.activity.AirWindowTheme() }
        }
        assertDarkIcons(!systemIsDark)

        val themes = listOf(
            AppearanceModel.Theme.LIGHT to true,
            AppearanceModel.Theme.DARK to false,
            AppearanceModel.Theme.SYSTEM to !systemIsDark,
        )
        for ((theme, darkIcons) in themes) {
            rule.runOnIdle { appearance.setTheme(theme) }
            assertDarkIcons(darkIcons)
        }
    }

    private fun assertDarkIcons(expected: Boolean) {
        rule.runOnIdle {
            val window = rule.activity.window
            val insets = WindowInsetsControllerCompat(window, window.decorView)
            assertEquals("status bar follows the rendered Air theme", expected, insets.isAppearanceLightStatusBars)
            assertEquals(
                "navigation bar follows the rendered Air theme",
                expected,
                insets.isAppearanceLightNavigationBars,
            )
        }
    }
}
