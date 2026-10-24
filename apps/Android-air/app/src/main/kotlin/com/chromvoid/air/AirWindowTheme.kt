package com.chromvoid.air

import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.LocaleList
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.AirColors
import com.chromvoid.air.ui.settings.AppearanceModel
import com.chromvoid.air.ui.settings.AppearancePreferences
import java.util.Locale

/** The chosen language is applied before the window is created; night mode stays with the system. */
internal fun airAppearanceContext(base: Context, preferences: AppearancePreferences): Context {
    val language = AppearanceModel.Language.of(preferences.language)
    if (language == AppearanceModel.Language.SYSTEM) return base
    // Override only the person's choices; system changes still reach every other field.
    val configuration = Configuration()
    val locale = Locale.forLanguageTag(language.tags)
    Locale.setDefault(locale)
    configuration.setLocales(LocaleList(locale))
    return base.createConfigurationContext(configuration)
}

/** Keep the window synchronized with the same palette that Compose is rendering. */
@Composable
internal fun ComponentActivity.AirWindowTheme() {
    val colors = Air.colors
    SideEffect { applyAirWindowTheme(colors) }
}

/** Both bars follow the rendered Air theme, independently of the device's night mode. */
internal fun ComponentActivity.applyAirWindowTheme(colors: AirColors) {
    window.setBackgroundDrawable(ColorDrawable(colors.canvas.toArgb()))
    val bars = if (colors.isDark) {
        SystemBarStyle.dark(Color.TRANSPARENT)
    } else {
        SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
    }
    enableEdgeToEdge(statusBarStyle = bars, navigationBarStyle = bars)
}
