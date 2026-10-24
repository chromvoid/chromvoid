package com.chromvoid.air.probe;

import android.app.Activity;
import android.graphics.Insets;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;

/**
 * The probes draw as an ordinary app does. From Android 15 a window is drawn edge to edge, and a
 * page that ignores the system bars puts its first field under them, where a tap never reaches.
 */
final class ProbeWindow {
    private ProbeWindow() {}

    /** No title bar; called before the content is set. */
    static void untitled(Activity activity) {
        activity.requestWindowFeature(Window.FEATURE_NO_TITLE);
    }

    /** Keeps [root]'s content clear of the system bars and a cutout. */
    static void clearOfBars(View root) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return;
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return insets;
        });
    }
}
