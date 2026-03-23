package com.chromvoid.app.credentialprovider

import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.util.Log
import android.view.autofill.AutofillManager

internal object AutofillProviderSettingsBridge {
    private const val TAG = "ChromVoid/CredentialProvider"

    fun isSelected(context: Context): Boolean {
        return try {
            val manager = context.getSystemService(AutofillManager::class.java)
            manager?.hasEnabledAutofillServices() == true
        } catch (error: Exception) {
            Log.w(TAG, "Failed to query current autofill provider selection", error)
            false
        }
    }

    fun openSettings(context: Context): Boolean {
        return try {
            val intent =
                Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            context.startActivity(intent)
            true
        } catch (error: Exception) {
            Log.w(TAG, "Failed to open Android autofill provider settings", error)
            false
        }
    }
}
