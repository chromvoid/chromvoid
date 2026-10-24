package com.chromvoid.app.nativebridge

import android.Manifest
import android.content.Context
import android.os.Build
import android.os.Looper
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContract
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityOptionsCompat
import androidx.test.core.app.ApplicationProvider
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Shadows.shadowOf
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.concurrent.TimeUnit

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

    @Test
    fun mediaLocationPermissionRequest_waitsForPermissionResultWithoutTimeoutFallback() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val pickerLauncher = RecordingLauncher(ActivityResultContracts.OpenMultipleDocuments())
        val permissionLauncher = RecordingLauncher(ActivityResultContracts.RequestPermission())
        NativeUploadNativeShell.bindPickerLauncher(context, pickerLauncher, permissionLauncher)

        NativeUploadNativeShell.requestMediaLocationPermissionForTests(context)
        shadowOf(Looper.getMainLooper()).idle()

        assertEquals(listOf(Manifest.permission.ACCESS_MEDIA_LOCATION), permissionLauncher.launches)
        assertTrue(NativeUploadNativeShell.hasPendingMediaLocationStreamForTests())

        shadowOf(Looper.getMainLooper()).idleFor(2, TimeUnit.SECONDS)

        assertTrue(NativeUploadNativeShell.hasPendingMediaLocationStreamForTests())
        NativeUploadNativeShell.handleMediaLocationPermissionResult(false)
        assertFalse(NativeUploadNativeShell.hasPendingMediaLocationStreamForTests())
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
