package com.chromvoid.air

import android.content.pm.PackageManager
import android.os.SystemClock
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateSecrets
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.connections.USB_ALLOW_TAG
import com.chromvoid.air.ui.connections.USB_PAIRING_TAG
import com.chromvoid.air.ui.connections.USB_PIN_TAG
import com.chromvoid.air.ui.connections.USB_SESSION_TAG
import java.io.File
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Route A48 on a phone with a ChromVoid desktop on its cable, which the desktop's
 * `mobile-usb-smoke` drives: the desktop pairs, the prompt shows the PIN and the person allows
 * it, and lets the desktop in; the desktop connects again over IK, the person lets it in, and it
 * reads the vault. This test is
 * the person at the phone. It runs only with the desktop there (`usb_desktop=1`), and hands the
 * PIN to the desktop's side through the app's external files, as a person reads it off the
 * screen. The system's own prompts - which app handles the accessory, its access - are
 * answered as a person would.
 */
@RunWith(AndroidJUnit4::class)
public class UsbAccessoryInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val device: UiDevice get() = UiDevice.getInstance(instrumentation)
    private val session get() = AirAppGraph.of(rule.activity).session
    private val files get() = checkNotNull(rule.activity.getExternalFilesDir(null))

    @Test
    public fun aDesktopOnTheCablePairsAndReadsTheVaultOnceLetIn() {
        val desktop = InstrumentationRegistry.getArguments().getString("usb_desktop")
        assumeTrue("needs the desktop's smoke run", desktop == "1")
        assumeTrue(rule.activity.packageManager.hasSystemFeature(PackageManager.FEATURE_USB_ACCESSORY))
        File(files, RESULT).delete()
        unlocked()

        // The desktop pairs: the phone shows the PIN, the person allows it.
        awaitNode(USB_PAIRING_TAG)
        val pin = rule.onNodeWithTag(USB_PIN_TAG, useUnmergedTree = true).fetchSemanticsNode()
            .config[SemanticsProperties.Text].joinToString("").filter(Char::isDigit)
        assertEquals(6, pin.length)
        File(files, PIN_FILE).writeText(pin)
        rule.onNodeWithTag(USB_ALLOW_TAG).performClick()
        awaitCondition("the desktop is trusted") {
            runBlocking { session.hosts.trustedPeers() }.any { it.platform == "desktop" }
        }
        File(files, PIN_FILE).delete()

        // The smoke run leaves its pairing connection there without a word; the desktop's next
        // one is over IK with the key the pairing kept. It asks to use the vault, the person lets
        // it in, it reads.
        letIn()
        File(files, RESULT).writeText("ok")
    }

    /**
     * A trusted desktop asks to use the vault: the person lets it in, and it leaves again. The
     * pairing connection asks too, though the smoke run has left it, until the desktop's next
     * connection takes its place within milliseconds and asks again. So the person allows
     * whatever asks, and the desktop is done once nothing has been on the cable for
     * [QUIET_MILLIS]. A smoke run reads and leaves within milliseconds; what it read is the
     * desktop side's evidence.
     */
    private fun letIn() {
        var allowed = false
        var quietSince = SystemClock.elapsedRealtime()
        awaitCondition("the desktop was let in and left") {
            val usb = runBlocking { session.hosts.snapshot() }.usb
            val now = SystemClock.elapsedRealtime()
            if (usb != null) quietSince = now
            if (usb?.session != null) {
                val asked = runCatching { rule.onAllNodesWithTag(USB_SESSION_TAG).fetchSemanticsNodes() }
                if (asked.getOrNull().orEmpty().isNotEmpty()) {
                    allowed = runCatching { rule.onNodeWithTag(USB_ALLOW_TAG).performClick() }.isSuccess || allowed
                }
            }
            allowed && usb == null && now - quietSince >= QUIET_MILLIS
        }
    }

    private fun unlocked() {
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState { it is AirSessionState.Unlocked }
        val generation = (session.state.value as AirSessionState.Unlocked).generation
        runBlocking {
            session.credentials.createCredential(
                PassmanagerEntryCreateRequest(
                    entryID = UUID.randomUUID().toString(),
                    entryType = "login",
                    secrets = PassmanagerEntryCreateSecrets(password = "synthetic"),
                    title = "Over the cable",
                ),
                generation,
            )
        }
    }

    /** Waits for [tag], answering the system's accessory prompts meanwhile. */
    private fun awaitNode(tag: String) {
        awaitCondition("no $tag on screen") {
            answerSystemPrompts()
            // While a system prompt covers the app, it has no screen to search.
            runCatching { rule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty() }.getOrDefault(false)
        }
    }

    /**
     * The system asks which app handles the desktop's accessory, and whether it may: ChromVoid Air,
     * and yes to it alone - another app on the phone that knows the accessory is told no. The
     * answers are the person's, for this debug build's own accessory.
     */
    private fun answerSystemPrompts() {
        device.findObject(By.text(APP).pkg(SYSTEM_UI))?.click()
        val asked = device.findObject(By.res("android", "alertTitle").pkg(SYSTEM_UI))?.text ?: return
        val answer = if (APP in asked) "button1" else "button2"
        device.findObject(By.res("android", answer).pkg(SYSTEM_UI))?.click()
    }

    private fun awaitCondition(what: String, done: () -> Boolean) {
        runCatching { rule.waitUntil(DESKTOP_MILLIS) { done() } }
        check(done()) { what }
    }

    private fun awaitState(accept: (AirSessionState) -> Boolean) {
        val deadline = System.nanoTime() + STATE_TIMEOUT_NANOS
        while (!accept(session.state.value)) {
            check(System.nanoTime() < deadline) { "session still ${session.state.value}" }
            Thread.sleep(POLL_MILLIS)
        }
    }

    private companion object {
        const val ADMINISTRATOR = "air-instrumentation-administrator"
        const val VAULT = "air-instrumentation-vault"
        const val PIN_FILE = "usb-pin.txt"
        const val RESULT = "usb-result.txt"
        const val SYSTEM_UI = "com.android.systemui"
        const val APP = "ChromVoid Air"
        const val DESKTOP_MILLIS = 300_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
        const val QUIET_MILLIS = 3_000L
    }
}
