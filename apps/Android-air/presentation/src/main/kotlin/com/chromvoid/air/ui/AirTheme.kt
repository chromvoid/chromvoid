package com.chromvoid.air.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import com.chromvoid.air.ui.design.AirColors
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.DarkAirColors
import com.chromvoid.air.ui.design.LightAirColors
import com.chromvoid.air.ui.design.LocalAirColors
import com.chromvoid.air.ui.settings.AppearanceModel

/** The Air colour roles of the current composition. */
public object Air {
    public val colors: AirColors
        @Composable @ReadOnlyComposable get() = LocalAirColors.current
}

/**
 * The brand palette on every device - dynamic colour is not used - with the
 * Material roles mapped onto it so fields, switches, dialogs and menus match.
 */
@Composable
public fun AirTheme(theme: AppearanceModel.Theme = AppearanceModel.Theme.SYSTEM, content: @Composable () -> Unit) {
    val dark = when (theme) {
        AppearanceModel.Theme.SYSTEM -> isSystemInDarkTheme()
        AppearanceModel.Theme.LIGHT -> false
        AppearanceModel.Theme.DARK -> true
    }
    val colors = if (dark) DarkAirColors else LightAirColors
    val scheme = if (colors.isDark) {
        darkColorScheme(
            primary = colors.button,
            onPrimary = colors.onButton,
            primaryContainer = colors.container,
            onPrimaryContainer = colors.onContainer,
            secondaryContainer = colors.container,
            onSecondaryContainer = colors.onContainer,
            background = colors.canvas,
            onBackground = colors.text,
            surface = colors.canvas,
            onSurface = colors.text,
            surfaceVariant = colors.surfaceSecondary,
            onSurfaceVariant = colors.textSecondary,
            surfaceContainer = colors.card,
            surfaceContainerHigh = colors.card,
            surfaceContainerHighest = colors.surfaceSecondary,
            surfaceContainerLow = colors.card,
            outline = colors.separator,
            outlineVariant = colors.separator,
            error = colors.danger,
        )
    } else {
        lightColorScheme(
            primary = colors.button,
            onPrimary = colors.onButton,
            primaryContainer = colors.container,
            onPrimaryContainer = colors.onContainer,
            secondaryContainer = colors.container,
            onSecondaryContainer = colors.onContainer,
            background = colors.canvas,
            onBackground = colors.text,
            surface = colors.canvas,
            onSurface = colors.text,
            surfaceVariant = colors.surfaceSecondary,
            onSurfaceVariant = colors.textSecondary,
            surfaceContainer = colors.card,
            surfaceContainerHigh = colors.card,
            surfaceContainerHighest = colors.surfaceSecondary,
            surfaceContainerLow = colors.card,
            outline = colors.separator,
            outlineVariant = colors.separator,
            error = colors.danger,
        )
    }
    CompositionLocalProvider(LocalAirColors provides colors) {
        MaterialTheme(colorScheme = scheme, typography = AirType.material, content = content)
    }
}
