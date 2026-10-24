package com.chromvoid.air

import android.app.Application
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.app.shared.PlatformHost
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
public class LauncherIdentityTest {
    private val application = ApplicationProvider.getApplicationContext<Application>()
    private val packageManager = application.packageManager
    private val launcher = "com.chromvoid.app.MainActivity"
    private val target = "com.chromvoid.air.MainActivity"

    @Before
    public fun resetPlatformHost() {
        PlatformHost.clearForTests()
    }

    @After
    public fun clearPlatformHost() {
        PlatformHost.clearForTests()
    }

    @Test
    public fun `only the previous client's launcher component appears on the home screen`() {
        val intent = Intent(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .setPackage(application.packageName)
        val activities = packageManager.queryIntentActivities(intent, 0).map { it.activityInfo }

        assertEquals(listOf(launcher), activities.map { it.name })
        assertEquals(target, activities.single().targetActivity)
        assertTrue(activities.single().exported)
    }

    @Test
    public fun `the platform's notification and tile launch intent resolves through the alias`() {
        val intent = requireNotNull(PlatformHost.launchIntent(application))

        assertEquals(ComponentName(application.packageName, launcher), intent.component)
        val activity = requireNotNull(packageManager.resolveActivity(intent, 0)).activityInfo
        assertEquals(target, activity.targetActivity)
    }

    @Test
    public fun `explicit main activity launches remain available to providers and instrumentation`() {
        val component = ComponentName(application.packageName, target)
        val activity = packageManager.getActivityInfo(component, 0)

        assertEquals(target, activity.name)
        assertTrue(activity.exported)
    }

    @Test
    public fun `incoming files and USB requests still resolve to the main activity`() {
        val intents = listOf(
            Intent(Intent.ACTION_SEND).setType("application/pdf"),
            Intent(Intent.ACTION_SEND_MULTIPLE).setType("image/png"),
            Intent(Intent.ACTION_VIEW).setDataAndType(
                Uri.parse("content://sharing.app/vault.kdbx"),
                "application/x-keepass2",
            ),
            Intent("android.hardware.usb.action.USB_ACCESSORY_ATTACHED"),
            Intent("android.hardware.usb.action.USB_ACCESSORY_HANDSHAKE"),
        )

        intents.forEach { intent ->
            intent.setPackage(application.packageName)
            val activities = packageManager.queryIntentActivities(intent, 0).map { it.activityInfo.name }
            assertEquals("${intent.action} keeps its original entry point", listOf(target), activities)
        }
        val component = ComponentName(application.packageName, target)
        val metadata = packageManager.getActivityInfo(component, PackageManager.GET_META_DATA).metaData
        assertTrue(metadata.containsKey("android.hardware.usb.action.USB_ACCESSORY_ATTACHED"))
        assertTrue(metadata.containsKey("android.hardware.usb.action.USB_ACCESSORY_HANDSHAKE"))
    }
}
