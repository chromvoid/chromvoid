package com.chromvoid.air.ui

import androidx.activity.ComponentActivity
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.compose.ui.test.performSemanticsAction
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.roundToInt

/** Supplies real Android insets to Compose, including their consumption by ancestor modifiers. */
internal fun AndroidComposeTestRule<*, ComponentActivity>.dispatchSystemInsets(
    navigationBottomDp: Int = 48,
    imeBottomDp: Int = 0,
) {
    runOnUiThread {
        WindowCompat.setDecorFitsSystemWindows(activity.window, false)
        val density = activity.resources.displayMetrics.density
        val navigation = (navigationBottomDp * density).roundToInt()
        val ime = (imeBottomDp * density).roundToInt()
        val insets = WindowInsetsCompat.Builder()
            .setInsets(WindowInsetsCompat.Type.navigationBars(), Insets.of(0, 0, 0, navigation))
            .setVisible(WindowInsetsCompat.Type.navigationBars(), true)
            .setInsets(WindowInsetsCompat.Type.ime(), Insets.of(0, 0, 0, ime))
            .setVisible(WindowInsetsCompat.Type.ime(), imeBottomDp > 0)
            .build()
        ViewCompat.dispatchApplyWindowInsets(activity.window.decorView, insets)
    }
    waitForIdle()
}

internal fun SemanticsNodeInteraction.scrollToEnd(): SemanticsNodeInteraction =
    performSemanticsAction(SemanticsActions.ScrollBy) { scroll -> scroll(0f, 100_000f) }
