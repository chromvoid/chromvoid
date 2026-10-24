package com.chromvoid.app.credentialprovider

import android.content.Context
import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AutofillProviderSettingsBridgeTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun createSettingsIntent_targetsCurrentPackageCredentialProviderSettings() {
        val intent = AutofillProviderSettingsBridge.createSettingsIntent(context)

        assertEquals("android.settings.CREDENTIAL_PROVIDER", intent.action)
        assertEquals("package:${context.packageName}", intent.dataString)
        assertTrue(intent.flags and Intent.FLAG_ACTIVITY_NEW_TASK != 0)
    }
}
