package com.chromvoid.air.session

import android.content.Context
import com.chromvoid.air.ui.files.FilePreferenceStore
import com.chromvoid.air.ui.files.FileSettings

/** The Files settings in the app's private preferences; backups exclude them. */
internal class StoredFilePreferences(context: Context) : FilePreferenceStore {
    private val preferences = context.getSharedPreferences("air-files", Context.MODE_PRIVATE)

    override var showHidden: Boolean
        get() = preferences.getBoolean(SHOW_HIDDEN, false)
        set(value) {
            preferences.edit().putBoolean(SHOW_HIDDEN, value).apply()
        }

    override var confirmDeletion: Boolean
        get() = preferences.getBoolean(CONFIRM_DELETION, true)
        set(value) {
            preferences.edit().putBoolean(CONFIRM_DELETION, value).apply()
        }

    override var attachmentFolder: String
        get() = preferences.getString(ATTACHMENT_FOLDER, null) ?: FileSettings.DEFAULT_ATTACHMENT_FOLDER
        set(value) {
            preferences.edit().putString(ATTACHMENT_FOLDER, value).apply()
        }

    private companion object {
        const val SHOW_HIDDEN = "show-hidden"
        const val CONFIRM_DELETION = "confirm-deletion"
        const val ATTACHMENT_FOLDER = "attachment-folder"
    }
}
