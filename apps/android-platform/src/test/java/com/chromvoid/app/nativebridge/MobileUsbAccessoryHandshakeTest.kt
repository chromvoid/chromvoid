package com.chromvoid.app.nativebridge

import android.content.Context
import android.content.Intent
import android.hardware.usb.UsbAccessory
import android.hardware.usb.UsbManager
import android.os.SystemClock
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.app.ConnectionForegroundService
import com.chromvoid.app.MobileUsbAccessorySystemReceiver
import com.chromvoid.app.shared.ForegroundServiceSupport
import java.time.Duration
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowLog
import org.robolectric.shadows.ShadowSystemClock

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MobileUsbAccessoryHandshakeTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @After
    fun tearDown() {
        ForegroundServiceSupport.resetForTests()
        ConnectionForegroundService.resetOwnerForTests()
        MobileUsbAccessoryForegroundRuntime.resetForTests()
        ShadowLog.clear()
    }

    @Test
    fun systemHandshakeWithoutPermissionPreservesCoordinatorAndSession() {
        for (state in listOf(
            MobileUsbAccessoryCoordinatorState.Idle,
            MobileUsbAccessoryCoordinatorState.Detached,
            MobileUsbAccessoryCoordinatorState.Error,
            MobileUsbAccessoryCoordinatorState.Open,
        )) {
            val fixture = fixture(hasPermission = false, initialState = state)
            val previousStatus = fixture.coordinator.status
            val previousOpenCount = fixture.opener.handles.size

            MobileUsbAccessorySystemReceiver().onReceive(
                context,
                handshakeIntent(SystemClock.elapsedRealtime()),
            )

            assertEquals(state.name, previousStatus, fixture.coordinator.status)
            assertTrue(state.name, fixture.gateway.permissionRequests.isEmpty())
            assertEquals(state.name, previousOpenCount, fixture.opener.handles.size)
            assertTrue(state.name, fixture.opener.handles.all { it.closeReasons.isEmpty() })
            assertTrue(state.name, fixture.startedIntents.isEmpty())
            assertTrue(
                state.name,
                ShadowLog.getLogsForTag("ChromVoid/MobileUsb").any {
                    it.msg.contains("accessory_system_handshake_ignored") &&
                        it.msg.contains("reason=no_permission")
                },
            )
        }
    }

    @Test
    fun handshakeForAttachedEntryPreservesSessionThroughBothIntentPaths() {
        for (systemBroadcast in listOf(true, false)) {
            val fixture = fixture(hasPermission = true)
            val entryStartedAt = SystemClock.elapsedRealtime()
            val attachResult = MobileUsbAccessoryForegroundRuntime.handleIntent(
                context,
                Intent(UsbManager.ACTION_USB_ACCESSORY_ATTACHED)
                    .putExtra(UsbManager.EXTRA_ACCESSORY, fixture.accessory),
            )
            assertEquals(MobileUsbAccessoryCoordinatorResult.Opened, attachResult)
            val firstHandle = fixture.opener.handles.single()
            val previousStatus = fixture.coordinator.status
            ShadowSystemClock.advanceBy(Duration.ofMillis(5))
            val intent = handshakeIntent(entryStartedAt)

            if (systemBroadcast) {
                // Real system HANDSHAKE has metadata but no UsbAccessory extra.
                MobileUsbAccessorySystemReceiver().onReceive(context, intent)
            } else {
                val result = MobileUsbAccessoryForegroundRuntime.handleIntent(
                    context,
                    intent.putExtra(UsbManager.EXTRA_ACCESSORY, fixture.accessory),
                )
                assertEquals(MobileUsbAccessoryCoordinatorResult.Ignored, result)
            }

            assertEquals(previousStatus, fixture.coordinator.status)
            assertEquals(1, fixture.opener.handles.size)
            assertTrue(firstHandle.closeReasons.isEmpty())
            assertTrue(fixture.gateway.permissionRequests.isEmpty())
            assertEquals(1, fixture.startedIntents.size)
            assertTrue(
                ShadowLog.getLogsForTag("ChromVoid/MobileUsb").any {
                    it.msg.contains("accessory_system_handshake_ignored reason=same_accessory_entry")
                },
            )
        }
    }

    @Test
    fun systemHandshakeForNewEntryReplacesOldSessionAndIgnoresRedelivery() {
        val fixture = fixture(
            hasPermission = true,
            initialState = MobileUsbAccessoryCoordinatorState.Open,
        )
        val firstHandle = fixture.opener.handles.single()
        ShadowSystemClock.advanceBy(Duration.ofMillis(5))
        val intent = handshakeIntent(SystemClock.elapsedRealtime())
        ShadowSystemClock.advanceBy(Duration.ofSeconds(1))

        MobileUsbAccessorySystemReceiver().onReceive(context, intent)

        assertEquals(MobileUsbAccessoryCoordinatorState.Open, fixture.coordinator.status.state)
        assertEquals(2, fixture.opener.handles.size)
        assertEquals(listOf(MobileUsbAccessorySessionStopReason.SessionReplaced), firstHandle.closeReasons)
        assertTrue(fixture.opener.handles.last().closeReasons.isEmpty())
        assertTrue(fixture.gateway.permissionRequests.isEmpty())
        assertEquals(1, fixture.startedIntents.size)

        MobileUsbAccessorySystemReceiver().onReceive(context, intent)

        assertEquals(2, fixture.opener.handles.size)
        assertTrue(fixture.opener.handles.last().closeReasons.isEmpty())
        assertEquals(1, fixture.startedIntents.size)
    }

    @Test
    fun handshakeIntentWithoutPermissionIsIgnoredWithoutRequestingOrOpening() {
        val fixture = fixture(hasPermission = false)
        val previousStatus = fixture.coordinator.status

        val result = MobileUsbAccessoryForegroundRuntime.handleIntent(
            context,
            Intent(MobileUsbAccessoryIntentContract.ACTION_USB_ACCESSORY_HANDSHAKE)
                .putExtra(UsbManager.EXTRA_ACCESSORY, fixture.accessory),
        )

        assertEquals(MobileUsbAccessoryCoordinatorResult.Ignored, result)
        assertEquals(previousStatus, fixture.coordinator.status)
        assertTrue(fixture.gateway.permissionRequests.isEmpty())
        assertTrue(fixture.opener.handles.isEmpty())
        assertTrue(fixture.startedIntents.isEmpty())
    }

    @Test
    fun systemHandshakeWithPermissionOpensFromIdleDetachedAndError() {
        for (state in listOf(
            MobileUsbAccessoryCoordinatorState.Idle,
            MobileUsbAccessoryCoordinatorState.Detached,
            MobileUsbAccessoryCoordinatorState.Error,
        )) {
            val fixture = fixture(hasPermission = true, initialState = state)

            MobileUsbAccessorySystemReceiver().onReceive(
                context,
                Intent(MobileUsbAccessoryIntentContract.ACTION_USB_ACCESSORY_HANDSHAKE),
            )

            assertEquals(state.name, MobileUsbAccessoryCoordinatorState.Open, fixture.coordinator.status.state)
            assertEquals(state.name, 1, fixture.opener.handles.size)
            assertTrue(state.name, fixture.gateway.permissionRequests.isEmpty())
            assertEquals(
                state.name,
                ConnectionForegroundService.ACTION_START_USB_ACCESSORY,
                fixture.startedIntents.single().action,
            )
        }
    }

    @Test
    fun systemHandshakeWithPermissionReplacesOpenSession() {
        val fixture = fixture(
            hasPermission = true,
            initialState = MobileUsbAccessoryCoordinatorState.Open,
        )
        val firstHandle = fixture.opener.handles.single()

        MobileUsbAccessorySystemReceiver().onReceive(
            context,
            Intent(MobileUsbAccessoryIntentContract.ACTION_USB_ACCESSORY_HANDSHAKE),
        )

        assertEquals(MobileUsbAccessoryCoordinatorState.Open, fixture.coordinator.status.state)
        assertEquals(2, fixture.opener.handles.size)
        assertEquals(listOf(MobileUsbAccessorySessionStopReason.SessionReplaced), firstHandle.closeReasons)
        assertTrue(fixture.opener.handles.last().closeReasons.isEmpty())
        assertTrue(fixture.gateway.permissionRequests.isEmpty())
        assertEquals(1, fixture.startedIntents.size)
    }

    @Test
    fun handshakeDoesNotFallBackToPermissionRequestWhenPermissionChangesAfterCheck() {
        val fixture = fixture(hasPermission = true)
        fixture.gateway.revokeAfterNextCheck = true

        val result = MobileUsbAccessoryForegroundRuntime.handleSystemAccessoryHandshake(
            context,
            Intent(MobileUsbAccessoryIntentContract.ACTION_USB_ACCESSORY_HANDSHAKE),
        )

        assertEquals(MobileUsbAccessoryCoordinatorResult.Opened, result)
        assertEquals(MobileUsbAccessoryCoordinatorState.Open, fixture.coordinator.status.state)
        assertEquals(1, fixture.opener.handles.size)
        assertTrue(fixture.gateway.permissionRequests.isEmpty())
        assertEquals(1, fixture.startedIntents.size)
    }

    @Test
    fun handshakeIntentForNewEntryReplacesOpenSession() {
        val fixture = fixture(
            hasPermission = true,
            initialState = MobileUsbAccessoryCoordinatorState.Open,
        )
        val firstHandle = fixture.opener.handles.single()
        ShadowSystemClock.advanceBy(Duration.ofMillis(5))

        val result = MobileUsbAccessoryForegroundRuntime.handleIntent(
            context,
            handshakeIntent(SystemClock.elapsedRealtime())
                .putExtra(UsbManager.EXTRA_ACCESSORY, fixture.accessory),
        )

        assertEquals(MobileUsbAccessoryCoordinatorResult.Opened, result)
        assertEquals(MobileUsbAccessoryCoordinatorState.Open, fixture.coordinator.status.state)
        assertEquals(2, fixture.opener.handles.size)
        assertEquals(listOf(MobileUsbAccessorySessionStopReason.SessionReplaced), firstHandle.closeReasons)
        assertTrue(fixture.opener.handles.last().closeReasons.isEmpty())
        assertTrue(fixture.gateway.permissionRequests.isEmpty())
        assertEquals(1, fixture.startedIntents.size)
    }

    @Test
    fun handshakeWithoutUsableEntryMetadataPreservesReplacementRecovery() {
        for (metadata in listOf(
            true to 0L,
            true to -1L,
            false to 1L,
            null to 1L,
            true to null,
        )) {
            val fixture = fixture(
                hasPermission = true,
                initialState = MobileUsbAccessoryCoordinatorState.Open,
            )
            val firstHandle = fixture.opener.handles.single()
            val intent = Intent(MobileUsbAccessoryIntentContract.ACTION_USB_ACCESSORY_HANDSHAKE)
            metadata.first?.let { intent.putExtra(MobileUsbAccessoryIntentContract.EXTRA_ACCESSORY_START, it) }
            metadata.second?.let { intent.putExtra(MobileUsbAccessoryIntentContract.EXTRA_ACCESSORY_UEVENT_TIME, it) }

            MobileUsbAccessorySystemReceiver().onReceive(context, intent)

            assertEquals(MobileUsbAccessoryCoordinatorState.Open, fixture.coordinator.status.state)
            assertEquals(2, fixture.opener.handles.size)
            assertEquals(listOf(MobileUsbAccessorySessionStopReason.SessionReplaced), firstHandle.closeReasons)
            assertTrue(fixture.opener.handles.last().closeReasons.isEmpty())
            assertTrue(fixture.gateway.permissionRequests.isEmpty())
            assertEquals(1, fixture.startedIntents.size)
        }
    }

    @Test
    fun attachedIntentWithoutPermissionStillRequestsPermission() {
        val fixture = fixture(hasPermission = false)

        val result = MobileUsbAccessoryForegroundRuntime.handleIntent(
            context,
            Intent(UsbManager.ACTION_USB_ACCESSORY_ATTACHED)
                .putExtra(UsbManager.EXTRA_ACCESSORY, fixture.accessory),
        )

        assertEquals(MobileUsbAccessoryCoordinatorResult.PermissionRequested, result)
        assertPermissionRequestedWithoutOpening(fixture)
    }

    @Test
    fun attachedBroadcastWithoutPermissionStillRequestsPermission() {
        val fixture = fixture(hasPermission = false)

        MobileUsbAccessorySystemReceiver().onReceive(
            context,
            Intent(UsbManager.ACTION_USB_ACCESSORY_ATTACHED)
                .putExtra(UsbManager.EXTRA_ACCESSORY, fixture.accessory),
        )

        assertPermissionRequestedWithoutOpening(fixture)
    }

    @Test
    fun currentAccessoryWithoutPermissionStillRequestsPermission() {
        val fixture = fixture(hasPermission = false)

        val result = MobileUsbAccessoryForegroundRuntime.handleCurrentAccessory(context)

        assertEquals(MobileUsbAccessoryCoordinatorResult.PermissionRequested, result)
        assertPermissionRequestedWithoutOpening(fixture)
    }

    private fun assertPermissionRequestedWithoutOpening(fixture: Fixture) {
        assertEquals(MobileUsbAccessoryCoordinatorState.PermissionRequested, fixture.coordinator.status.state)
        assertEquals(listOf(fixture.accessory), fixture.gateway.permissionRequests)
        assertTrue(fixture.opener.handles.isEmpty())
        assertTrue(fixture.startedIntents.isEmpty())
    }

    private fun fixture(
        hasPermission: Boolean,
        initialState: MobileUsbAccessoryCoordinatorState = MobileUsbAccessoryCoordinatorState.Idle,
    ): Fixture {
        tearDown()
        ShadowSystemClock.advanceBy(Duration.ofSeconds(1))
        val accessory = chromVoidAccessory()
        val gateway = FakeGateway(hasPermission = true)
        val opener = FakeOpener()
        val coordinator = MobileUsbAccessoryCoordinator(gateway, opener)
        when (initialState) {
            MobileUsbAccessoryCoordinatorState.Idle -> Unit
            MobileUsbAccessoryCoordinatorState.Detached -> coordinator.onAccessoryDetached(accessory)
            MobileUsbAccessoryCoordinatorState.Error -> coordinator.onIntentEvent(
                MobileUsbAccessoryIntentEvent.Malformed(
                    action = UsbManager.ACTION_USB_ACCESSORY_ATTACHED,
                    error = MobileUsbAccessoryIntentError.MissingAccessory,
                ),
            )
            MobileUsbAccessoryCoordinatorState.Open -> coordinator.onAccessoryAttached(accessory)
            else -> error("Unsupported initial state $initialState")
        }
        assertEquals(initialState, coordinator.status.state)
        gateway.hasPermission = hasPermission
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        MobileUsbAccessoryForegroundRuntime.setCurrentAccessoryProviderForTests { accessory }
        val startedIntents = mutableListOf<Intent>()
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, intent ->
            startedIntents += Intent(intent)
        }
        return Fixture(accessory, gateway, opener, coordinator, startedIntents)
    }

    private fun handshakeIntent(entryStartedAt: Long): Intent =
        Intent(MobileUsbAccessoryIntentContract.ACTION_USB_ACCESSORY_HANDSHAKE)
            .putExtra(MobileUsbAccessoryIntentContract.EXTRA_ACCESSORY_START, true)
            .putExtra(MobileUsbAccessoryIntentContract.EXTRA_ACCESSORY_UEVENT_TIME, entryStartedAt)

    private fun chromVoidAccessory(): UsbAccessory {
        val constructor = UsbAccessory::class.java.getConstructor(
            String::class.java,
            String::class.java,
            String::class.java,
            String::class.java,
            String::class.java,
            String::class.java,
        )
        return constructor.newInstance(
            MobileUsbAccessoryIntentContract.MANUFACTURER,
            MobileUsbAccessoryIntentContract.MODEL,
            MobileUsbAccessoryIntentContract.DESCRIPTION,
            MobileUsbAccessoryIntentContract.VERSION,
            MobileUsbAccessoryIntentContract.URI,
            "serial-1",
        )
    }

    private data class Fixture(
        val accessory: UsbAccessory,
        val gateway: FakeGateway,
        val opener: FakeOpener,
        val coordinator: MobileUsbAccessoryCoordinator,
        val startedIntents: List<Intent>,
    )

    private class FakeGateway(
        var hasPermission: Boolean,
    ) : MobileUsbAccessoryPermissionGateway {
        val permissionRequests = mutableListOf<UsbAccessory>()
        var revokeAfterNextCheck = false

        override fun hasPermission(accessory: UsbAccessory): Boolean {
            val granted = hasPermission
            if (revokeAfterNextCheck) {
                hasPermission = false
                revokeAfterNextCheck = false
            }
            return granted
        }

        override fun requestPermission(accessory: UsbAccessory) {
            permissionRequests += accessory
        }
    }

    private class FakeOpener : MobileUsbAccessorySessionOpener {
        val handles = mutableListOf<FakeHandle>()

        override fun open(
            accessory: UsbAccessory,
            identity: MobileUsbAccessoryIdentity,
        ): MobileUsbAccessorySessionHandle = FakeHandle("session-${handles.size + 1}").also(handles::add)
    }

    private class FakeHandle(
        override val sessionId: String,
    ) : MobileUsbAccessorySessionHandle {
        val closeReasons = mutableListOf<MobileUsbAccessorySessionStopReason>()

        override fun close(reason: MobileUsbAccessorySessionStopReason) {
            closeReasons += reason
        }
    }
}
