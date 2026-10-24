package com.chromvoid.app.credentialprovider

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.view.autofill.AutofillManager
import androidx.credentials.CredentialManager
import com.chromvoid.app.ChromVoidCredentialProviderService

internal object AutofillProviderSettingsBridge {
    private const val TAG = "ChromVoid/CredentialProvider"
    private const val ACTION_CREDENTIAL_PROVIDER = "android.settings.CREDENTIAL_PROVIDER"

    fun isSelected(context: Context): Boolean {
        val credentialProviderSelected = isCredentialProviderSelected(context)
        if (credentialProviderSelected != null) {
            return credentialProviderSelected
        }
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
            if (!openCredentialProviderSettings(context)) {
                context.startActivity(createAutofillSettingsIntent(context))
            }
            true
        } catch (error: Exception) {
            Log.w(TAG, "Failed to open Android credential provider settings", error)
            false
        }
    }

    internal fun createSettingsIntent(context: Context): Intent =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            createCredentialProviderSettingsIntent(context)
        } else {
            createAutofillSettingsIntent(context)
        }

    private fun createCredentialProviderSettingsIntent(context: Context): Intent =
        Intent(ACTION_CREDENTIAL_PROVIDER).apply {
            data = Uri.parse("package:${context.packageName}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

    private fun createAutofillSettingsIntent(context: Context): Intent =
        Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE).apply {
            data = Uri.parse("package:${context.packageName}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

    private fun openCredentialProviderSettings(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            return false
        }
        return try {
            CredentialManager.create(context).createSettingsPendingIntent().send()
            true
        } catch (canceled: PendingIntent.CanceledException) {
            Log.w(TAG, "Credential provider settings pending intent was cancelled", canceled)
            false
        } catch (error: Exception) {
            Log.w(TAG, "Failed to open Credential Manager provider settings", error)
            false
        }
    }

    private fun isCredentialProviderSelected(context: Context): Boolean? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            return null
        }
        return try {
            val managerClass = Class.forName("android.credentials.CredentialManager")
            val manager = context.getSystemService(managerClass) ?: return null
            val method =
                managerClass.getMethod("isEnabledCredentialProviderService", ComponentName::class.java)
            method.invoke(
                manager,
                ComponentName(context, ChromVoidCredentialProviderService::class.java),
            ) as? Boolean
        } catch (_: NoSuchMethodException) {
            null
        } catch (_: ClassNotFoundException) {
            null
        } catch (error: Exception) {
            Log.w(TAG, "Failed to query current credential provider selection", error)
            null
        }
    }
}
