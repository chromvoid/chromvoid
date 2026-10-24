package com.chromvoid.air

import android.app.Application
import android.content.res.Configuration
import androidx.activity.ComponentActivity
import androidx.core.view.WindowInsetsControllerCompat
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.air.ui.design.DarkAirColors
import com.chromvoid.air.ui.design.LightAirColors
import com.chromvoid.air.ui.settings.AppearanceModel
import com.chromvoid.air.ui.settings.AppearancePreferences
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class, sdk = [29, 30, 31])
public class AirWindowThemeTest {
    @Test
    @Config(qualifiers = "notnight")
    public fun `light Air on a light system uses dark status and navigation icons`() = withActivity {
        applyAirWindowTheme(LightAirColors)

        assertDarkIcons(true)
    }

    @Test
    @Config(qualifiers = "night")
    public fun `light Air on a dark system uses dark status and navigation icons`() = withActivity {
        applyAirWindowTheme(LightAirColors)

        assertDarkIcons(true)
    }

    @Test
    @Config(qualifiers = "notnight")
    public fun `dark Air on a light system uses light status and navigation icons`() = withActivity {
        applyAirWindowTheme(DarkAirColors)

        assertDarkIcons(false)
    }

    @Test
    @Config(qualifiers = "night")
    public fun `dark Air on a dark system uses light status and navigation icons`() = withActivity {
        applyAirWindowTheme(DarkAirColors)

        assertDarkIcons(false)
    }

    @Test
    @Config(qualifiers = "notnight")
    public fun `both system bars switch immediately when Air changes on a light system`() = withActivity {
        applyAirWindowTheme(LightAirColors)
        assertDarkIcons(true)

        applyAirWindowTheme(DarkAirColors)
        assertDarkIcons(false)

        applyAirWindowTheme(LightAirColors)
        assertDarkIcons(true)
    }

    @Test
    @Config(qualifiers = "night")
    public fun `both system bars switch immediately when Air changes on a dark system`() = withActivity {
        applyAirWindowTheme(DarkAirColors)
        assertDarkIcons(false)

        applyAirWindowTheme(LightAirColors)
        assertDarkIcons(true)

        applyAirWindowTheme(DarkAirColors)
        assertDarkIcons(false)
    }

    @Test
    @Config(qualifiers = "notnight")
    public fun `language context preserves system night mode for every Air choice on a light system`() {
        assertAppearanceContexts(Configuration.UI_MODE_NIGHT_NO)
    }

    @Test
    @Config(qualifiers = "night")
    public fun `language context preserves system night mode for every Air choice on a dark system`() {
        assertAppearanceContexts(Configuration.UI_MODE_NIGHT_YES)
    }

    @Test
    @Config(qualifiers = "notnight")
    public fun `system theme follows live night changes while keeping the chosen language`() {
        val base = ApplicationProvider.getApplicationContext<Application>()
        val originalQualifiers = RuntimeEnvironment.getQualifiers()
        val originalLocale = Locale.getDefault()
        try {
            for (selectedLanguage in listOf(AppearanceModel.Language.ENGLISH, AppearanceModel.Language.RUSSIAN)) {
                val preferences = object : AppearancePreferences {
                    override var theme = AppearanceModel.Theme.SYSTEM.stored
                    override var language = selectedLanguage.stored
                }
                val context = airAppearanceContext(base, preferences)

                for ((qualifier, expected) in listOf(
                    "+night" to Configuration.UI_MODE_NIGHT_YES,
                    "+notnight" to Configuration.UI_MODE_NIGHT_NO,
                )) {
                    RuntimeEnvironment.setQualifiers(qualifier)

                    assertEquals(
                        "a language override keeps following the system night mode",
                        expected,
                        context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK,
                    )
                    assertEquals(selectedLanguage.tags, context.resources.configuration.locales[0].language)
                }
            }
        } finally {
            RuntimeEnvironment.setQualifiers(originalQualifiers)
            Locale.setDefault(originalLocale)
        }
    }

    private fun assertAppearanceContexts(systemNightMode: Int) {
        val base = ApplicationProvider.getApplicationContext<Application>()
        val preferences = object : AppearancePreferences {
            override var theme = AppearanceModel.Theme.SYSTEM.stored
            override var language = AppearanceModel.Language.SYSTEM.stored
        }
        for (theme in AppearanceModel.Theme.entries) {
            preferences.theme = theme.stored
            val context = airAppearanceContext(base, preferences)

            assertEquals(
                "the language context does not pin night mode for ${theme.stored}",
                systemNightMode,
                context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK,
            )
            assertEquals(
                "the language context preserves the system base configuration",
                systemNightMode,
                base.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK,
            )
        }
    }

    private fun withActivity(block: ComponentActivity.() -> Unit) {
        val controller = Robolectric.buildActivity(ComponentActivity::class.java).setup().visible()
        try {
            controller.get().block()
        } finally {
            controller.pause().stop().destroy()
        }
    }

    private fun ComponentActivity.assertDarkIcons(expected: Boolean) {
        val insets = WindowInsetsControllerCompat(window, window.decorView)
        assertEquals("status bar icon appearance follows Air", expected, insets.isAppearanceLightStatusBars)
        assertEquals("navigation bar icon appearance follows Air", expected, insets.isAppearanceLightNavigationBars)
    }
}
