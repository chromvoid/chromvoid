package com.chromvoid.app.main

import android.content.Intent
import com.chromvoid.app.ChromVoidPasswordSaveActivity

internal object PasswordSaveIntentContract {
    fun requestToken(intent: Intent?): String? {
        return intent?.getStringExtra(ChromVoidPasswordSaveActivity.EXTRA_REQUEST_TOKEN)
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
    }
}
