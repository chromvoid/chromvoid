package com.chromvoid.air

import android.view.Window
import android.view.WindowManager
import androidx.annotation.VisibleForTesting

/**
 * Whether the app's windows may be captured. A release build keeps vault content out of every
 * screenshot, screen recording, the recents preview and an external display, from the first
 * frame. The dev build holds only synthetic vaults and allows capture, so its screens - password
 * entry included - can be shown and reported. Dialogs inherit what their window says.
 */
internal object ScreenCapture {
    @VisibleForTesting
    @Volatile
    internal var allowed: Boolean = BuildConfig.SCREEN_CAPTURE_ALLOWED

    /** Called before the window's first frame. */
    fun apply(window: Window) {
        if (!allowed) window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
    }
}
