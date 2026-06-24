package com.chromvoid.app.nativebridge

import android.content.Intent
import android.hardware.usb.UsbAccessory
import android.hardware.usb.UsbManager
import android.os.Build

internal data class MobileUsbAccessoryIdentity(
    val manufacturer: String?,
    val model: String?,
    val description: String?,
    val version: String?,
    val uri: String?,
    val serial: String?,
)

internal enum class MobileUsbAccessoryIntentError {
    MissingAccessory,
}

internal sealed interface MobileUsbAccessoryIntentEvent {
    data class Attached(
        val accessory: UsbAccessory,
        val identity: MobileUsbAccessoryIdentity,
    ) : MobileUsbAccessoryIntentEvent

    data class Detached(
        val accessory: UsbAccessory,
        val identity: MobileUsbAccessoryIdentity,
    ) : MobileUsbAccessoryIntentEvent

    data class PermissionResult(
        val accessory: UsbAccessory,
        val identity: MobileUsbAccessoryIdentity,
        val granted: Boolean,
        val errorCode: String?,
    ) : MobileUsbAccessoryIntentEvent

    data class Malformed(
        val action: String?,
        val error: MobileUsbAccessoryIntentError,
    ) : MobileUsbAccessoryIntentEvent

    data object Ignored : MobileUsbAccessoryIntentEvent
}

internal object MobileUsbAccessoryIntentContract {
    const val ACTION_USB_ACCESSORY_PERMISSION =
        "com.chromvoid.app.action.USB_ACCESSORY_PERMISSION"
    const val ACTION_USB_ACCESSORY_HANDSHAKE =
        "android.hardware.usb.action.USB_ACCESSORY_HANDSHAKE"
    const val ACTION_USB_ACCESSORY_DEBUG_HANDSHAKE =
        "com.chromvoid.app.action.USB_ACCESSORY_DEBUG_HANDSHAKE"

    const val MANUFACTURER = "ChromVoid"
    const val MODEL = "ChromVoid Mobile Host"
    const val DESCRIPTION = "ChromVoid USB Remote"
    const val VERSION = "1"
    const val URI = "https://chromvoid.com"

    private const val ERR_USB_MOBILE_PERMISSION_DENIED = "ERR_USB_MOBILE_PERMISSION_DENIED"

    fun parse(intent: Intent?): MobileUsbAccessoryIntentEvent {
        val action = intent?.action ?: return MobileUsbAccessoryIntentEvent.Ignored
        return when (action) {
            UsbManager.ACTION_USB_ACCESSORY_ATTACHED,
            ACTION_USB_ACCESSORY_HANDSHAKE,
            -> parseAttached(intent)
            UsbManager.ACTION_USB_ACCESSORY_DETACHED -> parseDetached(intent)
            ACTION_USB_ACCESSORY_PERMISSION -> parsePermissionResult(intent)
            else -> MobileUsbAccessoryIntentEvent.Ignored
        }
    }

    fun identityOf(accessory: UsbAccessory): MobileUsbAccessoryIdentity =
        identityOf(accessory) { candidate -> candidate.serial }

    internal fun identityOf(
        accessory: UsbAccessory,
        serialReader: (UsbAccessory) -> String?,
    ): MobileUsbAccessoryIdentity =
        MobileUsbAccessoryIdentity(
            manufacturer = accessory.manufacturer,
            model = accessory.model,
            description = accessory.description,
            version = accessory.version,
            uri = accessory.uri,
            serial =
                try {
                    serialReader(accessory)
                } catch (_: SecurityException) {
                    null
                },
        )

    fun sameAccessoryIdentity(
        left: MobileUsbAccessoryIdentity,
        right: MobileUsbAccessoryIdentity,
    ): Boolean =
        left.manufacturer == right.manufacturer &&
            left.model == right.model &&
            left.description == right.description &&
            left.version == right.version &&
            left.uri == right.uri &&
            (left.serial == null || right.serial == null || left.serial == right.serial)

    fun isChromVoidAccessory(accessory: UsbAccessory): Boolean {
        val identity = identityOf(accessory)
        return identity.manufacturer == MANUFACTURER &&
            identity.model == MODEL &&
            identity.version == VERSION
    }

    private fun parseAttached(intent: Intent): MobileUsbAccessoryIntentEvent {
        val accessory = accessoryExtra(intent)
            ?: return MobileUsbAccessoryIntentEvent.Malformed(
                action = intent.action,
                error = MobileUsbAccessoryIntentError.MissingAccessory,
            )
        if (!isChromVoidAccessory(accessory)) return MobileUsbAccessoryIntentEvent.Ignored
        return MobileUsbAccessoryIntentEvent.Attached(
            accessory = accessory,
            identity = identityOf(accessory),
        )
    }

    private fun parseDetached(intent: Intent): MobileUsbAccessoryIntentEvent {
        val accessory = accessoryExtra(intent)
            ?: return MobileUsbAccessoryIntentEvent.Malformed(
                action = intent.action,
                error = MobileUsbAccessoryIntentError.MissingAccessory,
            )
        if (!isChromVoidAccessory(accessory)) return MobileUsbAccessoryIntentEvent.Ignored
        return MobileUsbAccessoryIntentEvent.Detached(
            accessory = accessory,
            identity = identityOf(accessory),
        )
    }

    private fun parsePermissionResult(intent: Intent): MobileUsbAccessoryIntentEvent {
        val accessory = accessoryExtra(intent)
            ?: return MobileUsbAccessoryIntentEvent.Malformed(
                action = intent.action,
                error = MobileUsbAccessoryIntentError.MissingAccessory,
            )
        if (!isChromVoidAccessory(accessory)) return MobileUsbAccessoryIntentEvent.Ignored

        val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
        return MobileUsbAccessoryIntentEvent.PermissionResult(
            accessory = accessory,
            identity = identityOf(accessory),
            granted = granted,
            errorCode = if (granted) null else ERR_USB_MOBILE_PERMISSION_DENIED,
        )
    }

    @Suppress("DEPRECATION")
    private fun accessoryExtra(intent: Intent): UsbAccessory? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(UsbManager.EXTRA_ACCESSORY, UsbAccessory::class.java)
        } else {
            intent.getParcelableExtra(UsbManager.EXTRA_ACCESSORY)
        }
}
