package com.chromvoid.app.nativebridge

import android.content.Context
import android.os.Build
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContract
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityOptionsCompat
import androidx.test.core.app.ApplicationProvider
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.Q])
class NativeUploadNativeShellTest {
    @After
    fun tearDown() {
        NativeUploadNativeShell.resetForTests()
    }

    @Test
    fun startFilePicker_launchesPickerBeforeMediaLocationPermission() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val pickerLauncher = RecordingLauncher(ActivityResultContracts.OpenMultipleDocuments())
        val permissionLauncher = RecordingLauncher(ActivityResultContracts.RequestPermission())
        NativeUploadNativeShell.bindPickerLauncher(context, pickerLauncher, permissionLauncher)

        val result = NativeUploadNativeShell.startFilePicker("upload-1", 512 * 1024)

        assertEquals(0, result)
        assertEquals(1, pickerLauncher.launches.size)
        assertEquals(listOf("*/*"), pickerLauncher.launches.single().toList())
        assertTrue(permissionLauncher.launches.isEmpty())
    }

    private class RecordingLauncher<I>(
        override val contract: ActivityResultContract<I, *>,
    ) : ActivityResultLauncher<I>() {
        val launches = mutableListOf<I>()

        override fun launch(
            input: I,
            options: ActivityOptionsCompat?,
        ) {
            launches.add(input)
        }

        override fun unregister() = Unit

    }
}
