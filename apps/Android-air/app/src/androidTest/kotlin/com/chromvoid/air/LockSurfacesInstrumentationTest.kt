package com.chromvoid.air

import android.app.NotificationManager
import android.os.Build
import android.os.ParcelFileDescriptor
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.BySelector
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.UiObject2
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.app.VaultStatusNotificationController
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Route A49 against real Core: with the vault open, the status notification says only that
 * the vault is unlocked, its one action is Lock, and that action locks it and the notification
 * goes; the Quick Settings tile locks an open vault
 * from the system's own panel. The tile is added for the test and removed after it.
 */
@RunWith(AndroidJUnit4::class)
public class LockSurfacesInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val device: UiDevice get() = UiDevice.getInstance(instrumentation)
    private val session get() = AirAppGraph.of(rule.activity).session
    private val tile get() = "${rule.activity.packageName}/com.chromvoid.app.VaultQuickSettingsTileService"
    private var tileAdded = false

    @After
    public fun removeTile() {
        device.pressHome()
        if (tileAdded) shell("cmd statusbar remove-tile $tile")
    }

    @Test
    public fun theNotificationsLockLocksTheOpenVaultAndNamesNothing() {
        shell("pm grant ${rule.activity.packageName} android.permission.POST_NOTIFICATIONS")
        unlocked()

        // The shade shows it, saying only that the vault is open.
        device.openNotification()
        await(By.text("Vault unlocked"))
        assertNull(device.findObject(By.textContains(ENTRY)))
        device.pressBack()

        // Its one action is Lock; sending that action's intent is what the shade does on a tap.
        val shown = rule.activity.getSystemService(NotificationManager::class.java).activeNotifications
            .single { it.id == VaultStatusNotificationController.NOTIFICATION_ID }.notification
        assertEquals(listOf("Lock"), shown.actions.map { it.title.toString() })
        shown.actions.single().actionIntent.send()
        awaitState { it == AirSessionState.Locked }
        rule.waitUntil(TIMEOUT_MILLIS) {
            rule.activity.getSystemService(NotificationManager::class.java).activeNotifications
                .none { it.id == VaultStatusNotificationController.NOTIFICATION_ID }
        }
    }

    @Test
    public fun theQuickSettingsTileLocksTheOpenVault() {
        assumeTrue("the shell adds tiles on Android 13 and later", Build.VERSION.SDK_INT >= 33)
        unlocked()
        shell("cmd statusbar add-tile $tile")
        tileAdded = true

        // A tile just added is bound a moment later; a click before that reaches no one.
        for (attempt in 1..CLICK_ATTEMPTS) {
            shell("cmd statusbar click-tile $tile")
            runCatching { rule.waitUntil(CLICK_SETTLE_MILLIS) { session.state.value == AirSessionState.Locked } }
            if (session.state.value == AirSessionState.Locked) break
        }
        awaitState { it == AirSessionState.Locked }

        // Locked, the tile has nothing to lock and changes nothing.
        shell("cmd statusbar click-tile $tile")
        Thread.sleep(SETTLE_MILLIS)
        assertEquals(AirSessionState.Locked, session.state.value)
    }

    private fun unlocked() {
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState { it is AirSessionState.Unlocked }
    }

    private fun tap(selector: BySelector) {
        await(selector).click()
    }

    /** Waits through the compose rule, which drives every composition's clock in this process. */
    private fun await(selector: BySelector): UiObject2 {
        var found: UiObject2? = null
        runCatching {
            rule.waitUntil(TIMEOUT_MILLIS) {
                found = device.findObject(selector)
                found != null
            }
        }
        return checkNotNull(found) { "nothing matched $selector" }
    }

    private fun awaitState(accept: (AirSessionState) -> Boolean) {
        runCatching { rule.waitUntil(TIMEOUT_MILLIS) { accept(session.state.value) } }
        check(accept(session.state.value)) { "session still ${session.state.value}" }
    }

    private fun shell(command: String): String {
        val output = instrumentation.uiAutomation.executeShellCommand(command)
        return ParcelFileDescriptor.AutoCloseInputStream(output).bufferedReader().use { it.readText() }
    }

    private companion object {
        const val ADMINISTRATOR = "air-instrumentation-administrator"
        const val VAULT = "air-instrumentation-vault"
        const val ENTRY = "air-instrumentation"
        const val TIMEOUT_MILLIS = 20_000L
        const val SETTLE_MILLIS = 1_000L
        const val CLICK_ATTEMPTS = 5
        const val CLICK_SETTLE_MILLIS = 2_000L
    }
}
