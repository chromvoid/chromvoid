package com.chromvoid.app.shared

import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.app.MobileUsbApprovalActionReceiver
import org.junit.After
import org.junit.Before
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class UsbApprovalNotificationFactoryTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Before
    fun setUp() {
        // The module must not name any host's entry point, so the test plays
        // the host and asserts that the installed intent is the one used.
        PlatformHost.installLaunchIntentFactory { host ->
            Intent().setClassName(host, HOST_ENTRY_POINT)
        }
        UsbApprovalNotificationFactory.setAppInForeground(context, false)
        UsbApprovalNotificationFactory.cancel(context)
    }

    @After
    fun tearDown() {
        PlatformHost.clearForTests()
        UsbApprovalNotificationFactory.setAppInForeground(context, false)
        UsbApprovalNotificationFactory.cancel(context)
    }

    @Test
    fun appInForeground_suppressesAndDismissesExternalApprovalNotifications() {
        val manager = context.getSystemService(NotificationManager::class.java)
        UsbApprovalNotificationFactory.post(
            context,
            UsbApprovalNotificationFactory.KIND_SESSION,
            "session-attempt-1",
        )
        assertTrue(
            shadowOf(manager).getNotification(UsbApprovalNotificationFactory.NOTIFICATION_ID) != null,
        )

        UsbApprovalNotificationFactory.setAppInForeground(context, true)
        assertNull(shadowOf(manager).getNotification(UsbApprovalNotificationFactory.NOTIFICATION_ID))

        UsbApprovalNotificationFactory.post(
            context,
            UsbApprovalNotificationFactory.KIND_SESSION,
            "session-attempt-2",
        )
        assertNull(shadowOf(manager).getNotification(UsbApprovalNotificationFactory.NOTIFICATION_ID))
    }

    @Test
    fun sessionNotification_resolvesTheExactApprovalFromAllowOrDeny() {
        val notification =
            UsbApprovalNotificationFactory.build(
                context,
                UsbApprovalNotificationFactory.KIND_SESSION,
                "session-attempt-1",
            )

        assertEquals(listOf("Allow", "Deny"), notification.actions.map { it.title.toString() })
        assertDecisionAction(
            notification.actions[0],
            UsbApprovalNotificationFactory.ACTION_APPROVE,
            UsbApprovalNotificationFactory.KIND_SESSION,
            "session-attempt-1",
        )
        assertDecisionAction(
            notification.actions[1],
            UsbApprovalNotificationFactory.ACTION_DENY,
            UsbApprovalNotificationFactory.KIND_SESSION,
            "session-attempt-1",
        )
        assertEquals(
            HOST_ENTRY_POINT,
            shadowOf(checkNotNull(notification.contentIntent)).savedIntent.component?.className,
        )
    }

    @Test
    fun pairingNotification_keepsPinConfirmationInChromVoidAndAllowsDirectDeny() {
        val notification =
            UsbApprovalNotificationFactory.build(
                context,
                UsbApprovalNotificationFactory.KIND_PAIRING,
                "pairing-attempt-1",
            )

        assertEquals(listOf("Show PIN", "Deny"), notification.actions.map { it.title.toString() })
        assertEquals(
            HOST_ENTRY_POINT,
            shadowOf(notification.actions[0].actionIntent).savedIntent.component?.className,
        )
        assertDecisionAction(
            notification.actions[1],
            UsbApprovalNotificationFactory.ACTION_DENY,
            UsbApprovalNotificationFactory.KIND_PAIRING,
            "pairing-attempt-1",
        )
    }

    private fun assertDecisionAction(
        action: Notification.Action,
        expectedAction: String,
        expectedKind: String,
        expectedAttemptId: String,
    ) {
        val intent = shadowOf(action.actionIntent).savedIntent

        assertEquals(expectedAction, intent.action)
        assertEquals(MobileUsbApprovalActionReceiver::class.java.name, intent.component?.className)
        assertEquals(expectedKind, intent.getStringExtra(UsbApprovalNotificationFactory.EXTRA_KIND))
        assertEquals(expectedAttemptId, intent.getStringExtra(UsbApprovalNotificationFactory.EXTRA_ATTEMPT_ID))
        assertTrue(intent.dataString.orEmpty().contains(expectedAttemptId))
    }

    private companion object {
        const val HOST_ENTRY_POINT = "com.chromvoid.app.test.HostEntryPoint"
    }
}
