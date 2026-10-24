package com.chromvoid.app.nativebridge

import android.content.Context
import android.content.Intent
import android.hardware.usb.UsbAccessory
import android.hardware.usb.UsbManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.chromvoid.app.ConnectionForegroundService
import com.chromvoid.app.shared.TracePrivacy

object MobileUsbAccessoryForegroundRuntime {
    private const val TAG = "ChromVoid/MobileUsb"
    private const val RECOVERABLE_REOPEN_MAX_ATTEMPTS = 10
    private const val RECOVERABLE_REOPEN_DELAY_MS = 200L

    private val lock = Any()
    private val mainHandler = Handler(Looper.getMainLooper())
    private var productionCoordinator: MobileUsbAccessoryCoordinator? = null
    private var reopenRetryGeneration = 0

    @Volatile
    private var coordinatorForTests: MobileUsbAccessoryCoordinator? = null

    @Volatile
    private var disconnectForTests: (() -> MobileUsbAccessoryCoordinatorResult)? = null

    @Volatile
    private var currentAccessoryProviderForTests: ((Context) -> UsbAccessory?)? = null

    fun handleIntent(
        context: Context,
        intent: Intent?,
    ): MobileUsbAccessoryCoordinatorResult {
        val event = MobileUsbAccessoryIntentContract.parse(intent)
        val coordinator = coordinator(context)
        return handleEvent(context, coordinator, event)
    }

    fun handleSystemAccessoryHandshake(
        context: Context,
        intent: Intent,
    ): MobileUsbAccessoryCoordinatorResult {
        val accessory = currentAccessory(context) ?: return MobileUsbAccessoryCoordinatorResult.Ignored
        return handleEvent(
            context,
            coordinator(context),
            MobileUsbAccessoryIntentEvent.Handshake(
                accessory = accessory,
                identity = MobileUsbAccessoryIntentContract.identityOf(accessory),
                accessoryStartElapsedRealtime = MobileUsbAccessoryIntentContract.accessoryStartElapsedRealtime(intent),
            ),
        )
    }

    fun handleCurrentAccessory(context: Context): MobileUsbAccessoryCoordinatorResult {
        val coordinator = coordinator(context)
        val state = coordinator.status.state
        when (state) {
            MobileUsbAccessoryCoordinatorState.PermissionRequested,
            MobileUsbAccessoryCoordinatorState.Opening,
            MobileUsbAccessoryCoordinatorState.Open
            -> {
                return MobileUsbAccessoryCoordinatorResult.Ignored
            }
            MobileUsbAccessoryCoordinatorState.Idle,
            MobileUsbAccessoryCoordinatorState.Detached,
            MobileUsbAccessoryCoordinatorState.Error
            -> Unit
        }

        val accessory = currentAccessory(context)
        if (accessory == null) {
            return MobileUsbAccessoryCoordinatorResult.Ignored
        }
        return handleEvent(
            context,
            coordinator,
            MobileUsbAccessoryIntentEvent.Attached(
                accessory = accessory,
                identity = MobileUsbAccessoryIntentContract.identityOf(accessory),
            ),
        )
    }

    private fun handleEvent(
        context: Context,
        coordinator: MobileUsbAccessoryCoordinator,
        event: MobileUsbAccessoryIntentEvent,
    ): MobileUsbAccessoryCoordinatorResult {
        val result = coordinator.onIntentEvent(event)
        Log.i(
            TAG,
            "accessory_event=${event.eventName()} result=${result.resultName()} state=${coordinator.status.state}",
        )
        when (result) {
            MobileUsbAccessoryCoordinatorResult.Opened -> {
                val label = coordinator.status.activeIdentity?.let(::labelFor) ?: "USB Mobile"
                val started = ConnectionForegroundService.startUsbAccessory(context, label)
                Log.i(
                    TAG,
                    "accessory_foreground_start label=${TracePrivacy.redactIdentifier(label)} started=$started",
                )
                if (!started) {
                    coordinator.disconnect()
                }
            }
            MobileUsbAccessoryCoordinatorResult.Detached -> {
                val currentAccessory = currentAccessory(context)
                if (currentAccessory != null) {
                    Log.i(TAG, "accessory_detached_but_current_present_reopen")
                    val reopenResult = reopenAccessorySession(
                        context = context,
                        coordinator = coordinator,
                        accessory = currentAccessory,
                        reasonCode = "detached_current_present",
                    )
                    if (reopenResult != MobileUsbAccessoryCoordinatorResult.Opened) {
                        scheduleRecoverableReopenRetry(
                            context = context.applicationContext,
                            sessionAccessory = currentAccessory,
                            reasonCode = "detached_current_present",
                        )
                    }
                    return reopenResult ?: result
                }
                cancelRecoverableReopenRetries()
                ConnectionForegroundService.stopUsbAccessory(context)
            }
            else -> Unit
        }
        return result
    }

    fun disconnectActive(context: Context): MobileUsbAccessoryCoordinatorResult {
        disconnectForTests?.let { return it() }
        cancelRecoverableReopenRetries()
        val coordinator = synchronized(lock) { coordinatorForTests ?: productionCoordinator }
            ?: return MobileUsbAccessoryCoordinatorResult.Disconnected
        val result = coordinator.disconnect()
        Log.i(TAG, "accessory_disconnect result=${result.resultName()} state=${coordinator.status.state}")
        return result
    }

    fun handleNativeSessionEnded(
        context: Context,
        sessionId: String,
    ): MobileUsbAccessoryCoordinatorResult = handleNativeSessionEnded(
        context = context,
        sessionId = sessionId,
        reasonCode = "unknown",
    )

    fun handleNativeSessionEnded(
        context: Context,
        sessionId: String,
        reasonCode: String,
    ): MobileUsbAccessoryCoordinatorResult {
        val coordinator = coordinator(context)
        val endedSession = coordinator.onSessionEndedWithAccessory(sessionId)
        val result = endedSession.result
        Log.i(
            TAG,
            "accessory_session_ended reason=$reasonCode result=${result.resultName()} state=${coordinator.status.state}",
        )
        if (result != MobileUsbAccessoryCoordinatorResult.Disconnected) {
            return result
        }

        val reopenAccessory = endedSession.accessory ?: currentAccessory(context)
        if (shouldReopenAfterNativeSessionEnd(reasonCode, reopenAccessory)) {
            val reopenResult = reopenAccessorySession(
                context = context,
                coordinator = coordinator,
                accessory = reopenAccessory,
                reasonCode = reasonCode,
            )
            if (reopenResult == MobileUsbAccessoryCoordinatorResult.Opened) {
                return reopenResult
            }
            scheduleRecoverableReopenRetry(
                context = context.applicationContext,
                sessionAccessory = endedSession.accessory,
                reasonCode = reasonCode,
            )
            return reopenResult ?: result
        }

        cancelRecoverableReopenRetries()
        ConnectionForegroundService.stopUsbAccessory(context)
        return result
    }

    internal fun setCoordinatorForTests(coordinator: MobileUsbAccessoryCoordinator?) {
        coordinatorForTests = coordinator
    }

    internal fun setDisconnectForTests(disconnect: (() -> MobileUsbAccessoryCoordinatorResult)?) {
        disconnectForTests = disconnect
    }

    internal fun setCurrentAccessoryProviderForTests(provider: ((Context) -> UsbAccessory?)?) {
        currentAccessoryProviderForTests = provider
    }

    internal fun resetForTests() {
        coordinatorForTests = null
        disconnectForTests = null
        currentAccessoryProviderForTests = null
        cancelRecoverableReopenRetries()
        synchronized(lock) {
            productionCoordinator = null
        }
    }

    private fun reopenAccessorySession(
        context: Context,
        coordinator: MobileUsbAccessoryCoordinator,
        accessory: UsbAccessory?,
        reasonCode: String,
    ): MobileUsbAccessoryCoordinatorResult? {
        if (accessory == null) return null
        Log.i(TAG, "accessory_session_reopen reason=$reasonCode")
        val reopenResult = handleEvent(
            context,
            coordinator,
            MobileUsbAccessoryIntentEvent.Attached(
                accessory = accessory,
                identity = MobileUsbAccessoryIntentContract.identityOf(accessory),
            ),
        )
        if (reopenResult != MobileUsbAccessoryCoordinatorResult.Opened) {
            Log.w(
                TAG,
                "accessory_session_reopen_failed reason=$reasonCode result=${reopenResult.resultName()} state=${coordinator.status.state}",
            )
        }
        return reopenResult
    }

    private fun scheduleRecoverableReopenRetry(
        context: Context,
        sessionAccessory: UsbAccessory?,
        reasonCode: String,
    ) {
        val generation = synchronized(lock) {
            reopenRetryGeneration += 1
            reopenRetryGeneration
        }
        postRecoverableReopenRetry(
            context = context,
            sessionAccessory = sessionAccessory,
            reasonCode = reasonCode,
            generation = generation,
            attempt = 1,
        )
    }

    private fun postRecoverableReopenRetry(
        context: Context,
        sessionAccessory: UsbAccessory?,
        reasonCode: String,
        generation: Int,
        attempt: Int,
    ) {
        mainHandler.postDelayed(
            {
                if (synchronized(lock) { reopenRetryGeneration } != generation) return@postDelayed
                val coordinator = coordinator(context)
                val state = coordinator.status.state
                if (state == MobileUsbAccessoryCoordinatorState.Open ||
                    state == MobileUsbAccessoryCoordinatorState.Opening ||
                    state == MobileUsbAccessoryCoordinatorState.PermissionRequested
                ) {
                    return@postDelayed
                }

                val reopenResult = reopenAccessorySession(
                    context = context,
                    coordinator = coordinator,
                    accessory = currentAccessory(context) ?: sessionAccessory,
                    reasonCode = reasonCode,
                )
                if (reopenResult == MobileUsbAccessoryCoordinatorResult.Opened) {
                    return@postDelayed
                }
                if (attempt >= RECOVERABLE_REOPEN_MAX_ATTEMPTS) {
                    cancelRecoverableReopenRetries()
                    ConnectionForegroundService.stopUsbAccessory(context)
                    return@postDelayed
                }
                postRecoverableReopenRetry(
                    context = context,
                    sessionAccessory = sessionAccessory,
                    reasonCode = reasonCode,
                    generation = generation,
                    attempt = attempt + 1,
                )
            },
            RECOVERABLE_REOPEN_DELAY_MS,
        )
    }

    private fun cancelRecoverableReopenRetries() {
        synchronized(lock) {
            reopenRetryGeneration += 1
        }
    }

    private fun coordinator(context: Context): MobileUsbAccessoryCoordinator =
        coordinatorForTests ?: synchronized(lock) {
            productionCoordinator ?: MobileUsbAccessoryCoordinator(
                permissionGateway = AndroidMobileUsbAccessoryPermissionGateway(context),
                sessionOpener = MobileUsbAccessoryNativeShell.createSessionOpener(context),
            ).also { productionCoordinator = it }
        }

    private fun currentAccessory(context: Context): UsbAccessory? {
        currentAccessoryProviderForTests?.let { return it(context) }
        val manager = context.applicationContext.getSystemService(UsbManager::class.java)
            ?: return null
        return manager.accessoryList?.firstOrNull(MobileUsbAccessoryIntentContract::isChromVoidAccessory)
    }

    private fun labelFor(identity: MobileUsbAccessoryIdentity): String =
        identity.serial
            ?.takeIf { it.isNotBlank() }
            ?: identity.model
                ?.takeIf { it.isNotBlank() }
            ?: "USB Mobile"

    private fun shouldReopenAfterNativeSessionEnd(
        reasonCode: String,
        accessory: UsbAccessory?,
    ): Boolean =
        when (reasonCode) {
            // The accessory stays in AOA mode after a desktop disconnect or
            // transient detach and Android may not re-deliver ATTACHED without
            // a cable replug, so the host must re-arm itself or the next
            // desktop connect fails its IK handshake against a dead listener.
            "accessory_detached",
            "client_disconnected",
            "pairing_cancelled",
            "peer_closed",
            "pairing_complete",
            "vault_locked",
            "stream_timeout",
            "transport_closed",
            "data_plane_error",
            "error" -> accessory != null
            else -> false
        }

    private fun MobileUsbAccessoryIntentEvent.eventName(): String =
        when (this) {
            is MobileUsbAccessoryIntentEvent.Attached -> "attached"
            is MobileUsbAccessoryIntentEvent.Handshake -> "handshake"
            is MobileUsbAccessoryIntentEvent.Detached -> "detached"
            is MobileUsbAccessoryIntentEvent.PermissionResult -> "permission_result"
            is MobileUsbAccessoryIntentEvent.Malformed -> "malformed"
            MobileUsbAccessoryIntentEvent.Ignored -> "ignored"
        }

    private fun MobileUsbAccessoryCoordinatorResult.resultName(): String =
        when (this) {
            MobileUsbAccessoryCoordinatorResult.Ignored -> "ignored"
            MobileUsbAccessoryCoordinatorResult.PermissionRequested -> "permission_requested"
            MobileUsbAccessoryCoordinatorResult.Deferred -> "deferred"
            MobileUsbAccessoryCoordinatorResult.Opened -> "opened"
            MobileUsbAccessoryCoordinatorResult.Detached -> "detached"
            MobileUsbAccessoryCoordinatorResult.Disconnected -> "disconnected"
            is MobileUsbAccessoryCoordinatorResult.Error -> "error:$code"
        }
}
