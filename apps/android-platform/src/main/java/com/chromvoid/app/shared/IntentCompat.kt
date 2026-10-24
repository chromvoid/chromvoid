package com.chromvoid.app.shared

import android.content.Intent
import android.os.Build
import android.os.Parcelable

internal object IntentCompat {
    inline fun <reified T : Parcelable> parcelableExtra(
        intent: Intent,
        key: String,
    ): T? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(key, T::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(key)
        }
    }

    inline fun <reified T : Parcelable> parcelableArrayListExtra(
        intent: Intent,
        key: String,
    ): ArrayList<T> {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableArrayListExtra(key, T::class.java) ?: arrayListOf()
        } else {
            @Suppress("DEPRECATION")
            (intent.getParcelableArrayListExtra<T>(key) ?: arrayListOf())
        }
    }
}
