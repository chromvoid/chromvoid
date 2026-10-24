package com.chromvoid.air.session

import android.content.Context
import com.chromvoid.air.ui.settings.AppearancePreferences

/**
 * The appearance choices in the app's private preferences. They are read
 * before the vault is open - the locked screens follow them too - and are
 * excluded from backups with the rest of this file.
 */
internal class StoredAppearancePreferences(context: Context) : AppearancePreferences {
    private val preferences = context.getSharedPreferences("air-appearance", Context.MODE_PRIVATE)

    override var theme: String
        get() = preferences.getString(THEME, null).orEmpty()
        set(value) {
            preferences.edit().putString(THEME, value).apply()
        }

    override var language: String
        get() = preferences.getString(LANGUAGE, null).orEmpty()
        set(value) {
            preferences.edit().putString(LANGUAGE, value).apply()
        }

    private companion object {
        const val THEME = "theme"
        const val LANGUAGE = "language"
    }
}
