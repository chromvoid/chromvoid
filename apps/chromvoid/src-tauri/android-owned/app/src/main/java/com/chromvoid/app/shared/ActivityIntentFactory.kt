package com.chromvoid.app.shared

import android.content.Context
import android.content.Intent
import android.net.Uri

internal object ActivityIntentFactory {
    fun activityIntent(
        context: Context,
        target: Class<*>,
        action: String,
        uniquePath: String,
    ): Intent {
        return Intent(context, target).apply {
            this.action = action
            data = Uri.parse("chromvoid://$uniquePath")
        }
    }
}
