package com.chromvoid.app.nativebridge

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.usb.UsbAccessory
import android.hardware.usb.UsbManager
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.app.MainActivity
import com.chromvoid.app.MobileUsbAccessorySystemReceiver
import com.chromvoid.app.R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MobileUsbAccessoryIntentContractTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun validAttachIntent_returnsChromVoidAccessory() {
        val event =
            MobileUsbAccessoryIntentContract.parse(
                Intent(UsbManager.ACTION_USB_ACCESSORY_ATTACHED).putExtra(
                    UsbManager.EXTRA_ACCESSORY,
                    chromVoidAccessory(),
                ),
            )

        assertTrue(event is MobileUsbAccessoryIntentEvent.Attached)
        val attached = event as MobileUsbAccessoryIntentEvent.Attached
        assertEquals(MobileUsbAccessoryIntentContract.MANUFACTURER, attached.identity.manufacturer)
        assertEquals(MobileUsbAccessoryIntentContract.MODEL, attached.identity.model)
        assertEquals(MobileUsbAccessoryIntentContract.VERSION, attached.identity.version)
        assertEquals("serial-1", attached.identity.serial)
    }

    @Test
    fun accessoryHandshakeIntent_returnsChromVoidAccessory() {
        val event =
            MobileUsbAccessoryIntentContract.parse(
                Intent(MobileUsbAccessoryIntentContract.ACTION_USB_ACCESSORY_HANDSHAKE).putExtra(
                    UsbManager.EXTRA_ACCESSORY,
                    chromVoidAccessory(serial = "serial-handshake"),
                ),
            )

        assertTrue(event is MobileUsbAccessoryIntentEvent.Attached)
        val attached = event as MobileUsbAccessoryIntentEvent.Attached
        assertEquals("serial-handshake", attached.identity.serial)
    }

    @Test
    fun identityOfWhenSerialPermissionIsDenied_keepsStableAccessoryIdentity() {
        val identity =
            MobileUsbAccessoryIntentContract.identityOf(chromVoidAccessory()) {
                throw SecurityException("denied")
            }

        assertEquals(MobileUsbAccessoryIntentContract.MANUFACTURER, identity.manufacturer)
        assertEquals(MobileUsbAccessoryIntentContract.MODEL, identity.model)
        assertEquals(MobileUsbAccessoryIntentContract.VERSION, identity.version)
        assertEquals(null, identity.serial)
        assertTrue(MobileUsbAccessoryIntentContract.isChromVoidAccessory(chromVoidAccessory()))
    }

    @Test
    fun sameAccessoryIdentityAllowsMissingSerialButRejectsKnownMismatch() {
        assertTrue(
            MobileUsbAccessoryIntentContract.sameAccessoryIdentity(
                chromVoidIdentity(serial = "serial-1"),
                chromVoidIdentity(serial = null),
            ),
        )
        assertFalse(
            MobileUsbAccessoryIntentContract.sameAccessoryIdentity(
                chromVoidIdentity(serial = "serial-1"),
                chromVoidIdentity(serial = "serial-2"),
            ),
        )
    }

    @Test
    fun attachIntentWithoutAccessory_isMalformed() {
        val event =
            MobileUsbAccessoryIntentContract.parse(Intent(UsbManager.ACTION_USB_ACCESSORY_ATTACHED))

        assertEquals(
            MobileUsbAccessoryIntentEvent.Malformed(
                action = UsbManager.ACTION_USB_ACCESSORY_ATTACHED,
                error = MobileUsbAccessoryIntentError.MissingAccessory,
            ),
            event,
        )
    }

    @Test
    fun validDetachIntent_returnsChromVoidAccessory() {
        val event =
            MobileUsbAccessoryIntentContract.parse(
                Intent(UsbManager.ACTION_USB_ACCESSORY_DETACHED).putExtra(
                    UsbManager.EXTRA_ACCESSORY,
                    chromVoidAccessory(serial = "serial-detached"),
                ),
            )

        assertTrue(event is MobileUsbAccessoryIntentEvent.Detached)
        val detached = event as MobileUsbAccessoryIntentEvent.Detached
        assertEquals("serial-detached", detached.identity.serial)
    }

    @Test
    fun permissionDenied_mapsToPermissionDeniedEvent() {
        val event =
            MobileUsbAccessoryIntentContract.parse(
                Intent(MobileUsbAccessoryIntentContract.ACTION_USB_ACCESSORY_PERMISSION)
                    .putExtra(UsbManager.EXTRA_ACCESSORY, chromVoidAccessory())
                    .putExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false),
            )

        assertEquals(
            MobileUsbAccessoryIntentEvent.PermissionResult(
                accessory = chromVoidAccessory(),
                identity = chromVoidIdentity(),
                granted = false,
                errorCode = "ERR_USB_MOBILE_PERMISSION_DENIED",
            ),
            event,
        )
    }

    @Test
    fun unrelatedAccessory_isIgnored() {
        val event =
            MobileUsbAccessoryIntentContract.parse(
                Intent(UsbManager.ACTION_USB_ACCESSORY_ATTACHED).putExtra(
                    UsbManager.EXTRA_ACCESSORY,
                    accessory(manufacturer = "Other", model = "Other Host", version = "1"),
                ),
            )

        assertEquals(MobileUsbAccessoryIntentEvent.Ignored, event)
    }

    @Test
    fun generatedManifest_registersAccessoryFilterOnMainActivity() {
        val matches =
            context.packageManager.queryIntentActivities(
                Intent(UsbManager.ACTION_USB_ACCESSORY_ATTACHED),
                PackageManager.GET_META_DATA,
            )
        val mainActivity =
            matches.firstOrNull { it.activityInfo.name == MainActivity::class.java.name }

        assertTrue(matches.isNotEmpty())
        assertEquals(MainActivity::class.java.name, mainActivity?.activityInfo?.name)
        assertEquals(
            R.xml.mobile_usb_accessory_filter,
            mainActivity?.activityInfo?.metaData?.getInt(UsbManager.ACTION_USB_ACCESSORY_ATTACHED),
        )
        val handshakeMatches =
            context.packageManager.queryIntentActivities(
                Intent(MobileUsbAccessoryIntentContract.ACTION_USB_ACCESSORY_HANDSHAKE),
                PackageManager.GET_META_DATA,
            )
        val handshakeMainActivity =
            handshakeMatches.firstOrNull { it.activityInfo.name == MainActivity::class.java.name }

        assertEquals(
            R.xml.mobile_usb_accessory_filter,
            handshakeMainActivity
                ?.activityInfo
                ?.metaData
                ?.getInt(MobileUsbAccessoryIntentContract.ACTION_USB_ACCESSORY_HANDSHAKE),
        )
        val attachReceivers =
            context.packageManager.queryBroadcastReceivers(
                Intent(UsbManager.ACTION_USB_ACCESSORY_ATTACHED),
                PackageManager.GET_META_DATA,
            )

        assertTrue(
            attachReceivers.any {
                it.activityInfo.name == MobileUsbAccessorySystemReceiver::class.java.name &&
                    it.activityInfo.exported
            },
        )
        val handshakeReceivers =
            context.packageManager.queryBroadcastReceivers(
                Intent(MobileUsbAccessoryIntentContract.ACTION_USB_ACCESSORY_HANDSHAKE),
                PackageManager.GET_META_DATA,
            )

        assertTrue(
            handshakeReceivers.any {
                it.activityInfo.name == MobileUsbAccessorySystemReceiver::class.java.name &&
                    it.activityInfo.exported
            },
        )
        val debugHandshakeReceivers =
            context.packageManager.queryBroadcastReceivers(
                Intent(MobileUsbAccessoryIntentContract.ACTION_USB_ACCESSORY_DEBUG_HANDSHAKE),
                PackageManager.GET_META_DATA,
            )

        assertTrue(
            debugHandshakeReceivers.any {
                it.activityInfo.name == MobileUsbAccessorySystemReceiver::class.java.name &&
                    it.activityInfo.exported
            },
        )
        assertAccessoryFilterMatchesChromVoidContract()
    }

    private fun assertAccessoryFilterMatchesChromVoidContract() {
        val parser = context.resources.getXml(R.xml.mobile_usb_accessory_filter)
        var found = false
        while (parser.next() != org.xmlpull.v1.XmlPullParser.END_DOCUMENT) {
            if (parser.eventType != org.xmlpull.v1.XmlPullParser.START_TAG) continue
            if (parser.name != "usb-accessory") continue

            found = true
            assertEquals(
                MobileUsbAccessoryIntentContract.MANUFACTURER,
                parser.getAttributeValue(null, "manufacturer"),
            )
            assertEquals(MobileUsbAccessoryIntentContract.MODEL, parser.getAttributeValue(null, "model"))
            assertEquals(
                MobileUsbAccessoryIntentContract.VERSION,
                parser.getAttributeValue(null, "version"),
            )
        }

        assertTrue(found)
    }

    private fun chromVoidIdentity(serial: String? = "serial-1"): MobileUsbAccessoryIdentity =
        MobileUsbAccessoryIdentity(
            manufacturer = MobileUsbAccessoryIntentContract.MANUFACTURER,
            model = MobileUsbAccessoryIntentContract.MODEL,
            description = MobileUsbAccessoryIntentContract.DESCRIPTION,
            version = MobileUsbAccessoryIntentContract.VERSION,
            uri = MobileUsbAccessoryIntentContract.URI,
            serial = serial,
        )

    private fun chromVoidAccessory(serial: String = "serial-1"): UsbAccessory =
        accessory(
            manufacturer = MobileUsbAccessoryIntentContract.MANUFACTURER,
            model = MobileUsbAccessoryIntentContract.MODEL,
            description = MobileUsbAccessoryIntentContract.DESCRIPTION,
            version = MobileUsbAccessoryIntentContract.VERSION,
            uri = MobileUsbAccessoryIntentContract.URI,
            serial = serial,
        )

    private fun accessory(
        manufacturer: String,
        model: String,
        description: String = "description",
        version: String,
        uri: String = "https://chromvoid.com",
        serial: String = "serial",
    ): UsbAccessory {
        val constructor =
            UsbAccessory::class.java.getConstructor(
                String::class.java,
                String::class.java,
                String::class.java,
                String::class.java,
                String::class.java,
                String::class.java,
            )
        return constructor.newInstance(manufacturer, model, description, version, uri, serial)
    }
}
