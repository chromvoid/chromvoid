package com.chromvoid.air.ui.design

import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.unit.dp

/** One window breakpoint for root navigation and the vault's list/detail layout. */
public val EXPANDED_WIDTH: androidx.compose.ui.unit.Dp = 840.dp

/** The shell's width class before navigation takes space; null for standalone screens. */
internal val LocalAirWindowExpanded: ProvidableCompositionLocal<Boolean?> = staticCompositionLocalOf { null }
