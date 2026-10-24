package com.chromvoid.air

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

/**
 * Puts the keyboard away, as a person does before reaching further down a form. Coming up it
 * shrinks the screen under a scroll or a click - for seconds on a loaded emulator - so a row near
 * the bottom can leave the list before it is tapped; going away it only makes room.
 */
internal fun <A : ComponentActivity> AndroidComposeTestRule<*, A>.hideKeyboard() {
    runOnUiThread {
        val window = activity.window
        WindowCompat.getInsetsController(window, window.decorView).hide(WindowInsetsCompat.Type.ime())
    }
    waitForIdle()
}
