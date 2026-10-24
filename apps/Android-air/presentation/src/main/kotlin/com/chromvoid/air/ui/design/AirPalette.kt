package com.chromvoid.air.ui.design

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.colorspace.ColorSpaces

/**
 * The ChromVoid Air colour roles, based on the iOS client's `AirPalette`.
 *
 * Both sets are authored in OKLCH on hue 232 (`packages/theme/src/brand.css`)
 * and given here in Display P3, which carries more chroma than sRGB at the
 * same lightness; a wide-gamut window shows them as authored and other
 * screens clip to sRGB. The dark set is the ice-blue family on that hue. The
 * system-like neutrals (card, text, separator) follow the iOS grouped palette
 * with stronger light secondary text for Android contrast requirements.
 */
@Immutable
public data class AirColors(
    /** Page ground behind grouped content: cool off-white. */
    val canvas: Color,
    /** A grouped section and a collection tile. */
    val card: Color,
    /** Raised secondary surface: the search field, a selected tab, inactive chips. */
    val surfaceSecondary: Color,
    /** Text, icons and links that identify an action. */
    val accent: Color,
    /** Filled primary control and the text on it. */
    val button: Color,
    val onButton: Color,
    /** Tinted container behind an avatar, a collection symbol or a selected chip. */
    val container: Color,
    val onContainer: Color,
    /** Decorative cyan for gradients and illustration only. */
    val bright: Color,
    val text: Color,
    /** Android uses a stronger light value than iOS secondaryLabel to meet WCAG AA contrast on grouped surfaces. */
    val textSecondary: Color,
    val textTertiary: Color,
    val separator: Color,
    val danger: Color,
    val warning: Color,
    val success: Color,
    val isDark: Boolean,
)

private fun p3(red: Float, green: Float, blue: Float): Color =
    Color(red, green, blue, 1f, ColorSpaces.DisplayP3)

public val LightAirColors: AirColors = AirColors(
    canvas = p3(0.9636f, 0.9725f, 0.9828f),
    card = Color.White,
    surfaceSecondary = p3(0.9323f, 0.9482f, 0.9595f),
    accent = p3(0.0181f, 0.4457f, 0.6471f),
    button = p3(0.021f, 0.4821f, 0.6982f),
    onButton = Color.White,
    container = p3(0.8778f, 0.9487f, 0.996f),
    onContainer = p3(0.0056f, 0.3284f, 0.4835f),
    bright = p3(0.0399f, 0.6195f, 0.8906f),
    text = Color(0xFF000000),
    textSecondary = Color(0xBF3C3C43),
    textTertiary = Color(0x4D3C3C43),
    separator = Color(0x4A3C3C43),
    danger = Color(0xFFFF3B30),
    warning = Color(0xFFFF9500),
    success = Color(0xFF34C759),
    isDark = false,
)

public val DarkAirColors: AirColors = AirColors(
    canvas = p3(0.0445f, 0.0506f, 0.0611f),
    card = Color(0xFF1C1C1E),
    surfaceSecondary = p3(0.1262f, 0.1594f, 0.1958f),
    accent = p3(0.5767f, 0.8302f, 0.9952f),
    button = p3(0.5767f, 0.8302f, 0.9952f),
    onButton = p3(0.0728f, 0.1701f, 0.2307f),
    container = p3(0.1157f, 0.2254f, 0.2948f),
    onContainer = p3(0.758f, 0.9f, 0.9946f),
    bright = p3(0.5767f, 0.8302f, 0.9952f),
    text = Color.White,
    textSecondary = Color(0x99EBEBF5),
    textTertiary = Color(0x4DEBEBF5),
    separator = Color(0x99545458),
    danger = Color(0xFFFF453A),
    warning = Color(0xFFFF9F0A),
    success = Color(0xFF30D158),
    isDark = true,
)

/** The wallet card gradient in the brand family: a lit corner falling into depth. */
public val CardCyan: List<Color> = listOf(
    p3(0.0399f, 0.6195f, 0.8906f),
    p3(0.0129f, 0.4218f, 0.6141f),
    p3(0.0035f, 0.2612f, 0.3891f),
)

public val LocalAirColors: androidx.compose.runtime.ProvidableCompositionLocal<AirColors> =
    staticCompositionLocalOf { LightAirColors }
