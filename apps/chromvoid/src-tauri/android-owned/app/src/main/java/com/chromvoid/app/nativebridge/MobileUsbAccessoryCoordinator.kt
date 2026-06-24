package com.chromvoid.app.nativebridge

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.hardware.usb.UsbAccessory
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Log

internal enum class MobileUsbAccessoryCoordinatorState {
    Idle,
    PermissionRequested,
    Opening,
    Open,
    Detached,
    Error,
}

internal data class MobileUsbAccessoryCoordinatorStatus(
    val state: MobileUsbAccessoryCoordinatorState,
    val activeIdentity: MobileUsbAccessoryIdentity?,
    val errorCode: String?,
)

internal sealed interface MobileUsbAccessoryCoordinatorResult {
    data object Ignored : MobileUsbAccessoryCoordinatorResult
    data object PermissionRequested : MobileUsbAccessoryCoordinatorResult
    data object Opened : MobileUsbAccessoryCoordinatorResult
    data object Detached : MobileUsbAccessoryCoordinatorResult
    data object Disconnected : MobileUsbAccessoryCoordinatorResult
    data class Error(val code: String) : MobileUsbAccessoryCoordinatorResult
}

internal interface MobileUsbAccessoryPermissionGateway {
    fun hasPermission(accessory: UsbAccessory): Boolean

    fun requestPermission(accessory: UsbAccessory)
}

internal interface MobileUsbAccessorySessionHandle {
    val sessionId: String

    fun close()
}

internal interface MobileUsbAccessorySessionOpener {
    fun open(
        accessory: UsbAccessory,
        identity: MobileUsbAccessoryIdentity,
    ): MobileUsbAccessorySessionHandle
}

internal class AndroidMobileUsbAccessoryPermissionGateway(
    context: Context,
) : MobileUsbAccessoryPermissionGateway {
    private val appContext = context.applicationContext
    private val usbManager: UsbManager? = appContext.getSystemService(UsbManager::class.java)

    override fun hasPermission(accessory: UsbAccessory): Boolean =
        usbManager?.hasPermission(accessory) == true

    override fun requestPermission(accessory: UsbAccessory) {
        val manager = usbManager ?: throw IllegalStateException("UsbManager is unavailable")
        manager.requestPermission(accessory, permissionIntent())
    }

    private fun permissionIntent(): PendingIntent {
        val flags =
            PendingIntent.FLAG_UPDATE_CURRENT or
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    PendingIntent.FLAG_IMMUTABLE
                } else {
                    0
                }
        return PendingIntent.getBroadcast(
            appContext,
            REQUEST_CODE_USB_ACCESSORY_PERMISSION,
            Intent(MobileUsbAccessoryIntentContract.ACTION_USB_ACCESSORY_PERMISSION)
                .setPackage(appContext.packageName),
            flags,
        )
    }

    private companion object {
        private const val REQUEST_CODE_USB_ACCESSORY_PERMISSION = 3101
    }
}

internal class MobileUsbAccessoryCoordinator(
    private val permissionGateway: MobileUsbAccessoryPermissionGateway,
    private val sessionOpener: MobileUsbAccessorySessionOpener,
) {
    private val lock = Any()
    private var state = MobileUsbAccessoryCoordinatorState.Idle
    private var pending: PendingAccessory? = null
    private var openSession: OpenAccessorySession? = null
    private var lastErrorCode: String? = null

    val status: MobileUsbAccessoryCoordinatorStatus
        get() =
            synchronized(lock) {
                MobileUsbAccessoryCoordinatorStatus(
                    state = state,
                    activeIdentity = openSession?.identity ?: pending?.identity,
                    errorCode = lastErrorCode,
                )
            }

    fun onIntentEvent(event: MobileUsbAccessoryIntentEvent): MobileUsbAccessoryCoordinatorResult =
        when (event) {
            is MobileUsbAccessoryIntentEvent.Attached -> onAccessoryAttached(event.accessory)
            is MobileUsbAccessoryIntentEvent.Detached -> onAccessoryDetached(event.accessory)
            is MobileUsbAccessoryIntentEvent.PermissionResult ->
                onPermissionResult(event.accessory, event.granted)
            is MobileUsbAccessoryIntentEvent.Malformed -> fail(ERR_USB_MOBILE_NO_ACCESSORY)
            MobileUsbAccessoryIntentEvent.Ignored -> MobileUsbAccessoryCoordinatorResult.Ignored
        }

    fun onAccessoryAttached(accessory: UsbAccessory): MobileUsbAccessoryCoordinatorResult =
        synchronized(lock) {
            if (!MobileUsbAccessoryIntentContract.isChromVoidAccessory(accessory)) {
                return@synchronized MobileUsbAccessoryCoordinatorResult.Ignored
            }
            if (state == MobileUsbAccessoryCoordinatorState.PermissionRequested ||
                state == MobileUsbAccessoryCoordinatorState.Opening ||
                state == MobileUsbAccessoryCoordinatorState.Open
            ) {
                return@synchronized MobileUsbAccessoryCoordinatorResult.Error(ERR_USB_MOBILE_BUSY)
            }

            val identity = MobileUsbAccessoryIntentContract.identityOf(accessory)
            if (permissionGateway.hasPermission(accessory)) {
                return@synchronized openAfterPermission(accessory, identity)
            }

            pending = PendingAccessory(accessory, identity)
            openSession = null
            state = MobileUsbAccessoryCoordinatorState.PermissionRequested
            lastErrorCode = null

            try {
                permissionGateway.requestPermission(accessory)
                MobileUsbAccessoryCoordinatorResult.PermissionRequested
            } catch (_: Throwable) {
                pending = null
                failLocked(ERR_USB_MOBILE_PERMISSION_DENIED)
            }
        }

    fun onPermissionResult(
        accessory: UsbAccessory,
        granted: Boolean,
    ): MobileUsbAccessoryCoordinatorResult =
        synchronized(lock) {
            val current = pending
                ?: return@synchronized failLocked(ERR_USB_MOBILE_INVALID_STATE)
            if (!sameAccessoryIdentity(current.accessory, accessory)) {
                return@synchronized failLocked(ERR_USB_MOBILE_INVALID_STATE)
            }
            if (!granted) {
                pending = null
                return@synchronized failLocked(ERR_USB_MOBILE_PERMISSION_DENIED)
            }

            pending = null
            openAfterPermission(accessory, current.identity)
        }

    fun onAccessoryDetached(accessory: UsbAccessory): MobileUsbAccessoryCoordinatorResult =
        synchronized(lock) {
            val detachedIdentity = MobileUsbAccessoryIntentContract.identityOf(accessory)
            val activeIdentity = openSession?.identity ?: pending?.identity
            if (activeIdentity != null &&
                !MobileUsbAccessoryIntentContract.sameAccessoryIdentity(activeIdentity, detachedIdentity)
            ) {
                return@synchronized MobileUsbAccessoryCoordinatorResult.Ignored
            }

            closeOpenSessionLocked()
            pending = null
            state = MobileUsbAccessoryCoordinatorState.Detached
            lastErrorCode = null
            MobileUsbAccessoryCoordinatorResult.Detached
        }

    fun disconnect(): MobileUsbAccessoryCoordinatorResult =
        synchronized(lock) {
            closeOpenSessionLocked()
            pending = null
            state = MobileUsbAccessoryCoordinatorState.Idle
            lastErrorCode = null
            MobileUsbAccessoryCoordinatorResult.Disconnected
        }

    fun onSessionEnded(sessionId: String): MobileUsbAccessoryCoordinatorResult =
        onSessionEndedWithAccessory(sessionId).result

    fun onSessionEndedWithAccessory(sessionId: String): MobileUsbAccessorySessionEnd =
        synchronized(lock) {
            val session = openSession
                ?: return@synchronized MobileUsbAccessorySessionEnd(
                    result = MobileUsbAccessoryCoordinatorResult.Ignored,
                    accessory = null,
                )
            if (session.handle.sessionId != sessionId) {
                return@synchronized MobileUsbAccessorySessionEnd(
                    result = MobileUsbAccessoryCoordinatorResult.Ignored,
                    accessory = null,
                )
            }

            openSession = null
            pending = null
            state = MobileUsbAccessoryCoordinatorState.Idle
            lastErrorCode = null
            MobileUsbAccessorySessionEnd(
                result = MobileUsbAccessoryCoordinatorResult.Disconnected,
                accessory = session.accessory,
            )
        }

    private fun openAfterPermission(
        accessory: UsbAccessory,
        identity: MobileUsbAccessoryIdentity,
    ): MobileUsbAccessoryCoordinatorResult {
        state = MobileUsbAccessoryCoordinatorState.Opening
        lastErrorCode = null
        return try {
            val handle = sessionOpener.open(accessory, identity)
            openSession = OpenAccessorySession(accessory, identity, handle)
            state = MobileUsbAccessoryCoordinatorState.Open
            MobileUsbAccessoryCoordinatorResult.Opened
        } catch (error: Throwable) {
            Log.w(TAG, "accessory_open failed", error)
            openSession = null
            failLocked(ERR_USB_MOBILE_OPEN_FAILED)
        }
    }

    private fun fail(code: String): MobileUsbAccessoryCoordinatorResult =
        synchronized(lock) {
            failLocked(code)
        }

    private fun failLocked(code: String): MobileUsbAccessoryCoordinatorResult {
        closeOpenSessionLocked()
        pending = null
        state = MobileUsbAccessoryCoordinatorState.Error
        lastErrorCode = code
        return MobileUsbAccessoryCoordinatorResult.Error(code)
    }

    private fun closeOpenSessionLocked() {
        val session = openSession ?: return
        openSession = null
        runCatching { session.handle.close() }
    }

    private fun sameAccessoryIdentity(
        left: UsbAccessory,
        right: UsbAccessory,
    ): Boolean =
        MobileUsbAccessoryIntentContract.sameAccessoryIdentity(
            MobileUsbAccessoryIntentContract.identityOf(left),
            MobileUsbAccessoryIntentContract.identityOf(right),
        )

    private data class PendingAccessory(
        val accessory: UsbAccessory,
        val identity: MobileUsbAccessoryIdentity,
    )

    private data class OpenAccessorySession(
        val accessory: UsbAccessory,
        val identity: MobileUsbAccessoryIdentity,
        val handle: MobileUsbAccessorySessionHandle,
    )

    data class MobileUsbAccessorySessionEnd(
        val result: MobileUsbAccessoryCoordinatorResult,
        val accessory: UsbAccessory?,
    )

    private companion object {
        private const val TAG = "ChromVoid/MobileUsb"
        private const val ERR_USB_MOBILE_BUSY = "ERR_USB_MOBILE_BUSY"
        private const val ERR_USB_MOBILE_INVALID_STATE = "ERR_USB_MOBILE_INVALID_STATE"
        private const val ERR_USB_MOBILE_NO_ACCESSORY = "ERR_USB_MOBILE_NO_ACCESSORY"
        private const val ERR_USB_MOBILE_OPEN_FAILED = "ERR_USB_MOBILE_OPEN_FAILED"
        private const val ERR_USB_MOBILE_PERMISSION_DENIED = "ERR_USB_MOBILE_PERMISSION_DENIED"
    }
}
