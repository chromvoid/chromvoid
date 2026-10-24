package com.chromvoid.air

import android.graphics.Bitmap
import android.os.SystemClock
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.espresso.Espresso.closeSoftKeyboard
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AccessSession
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.access.ACCESS_PASSWORD_TAG
import com.chromvoid.air.ui.access.ACCESS_SUBMIT_TAG
import com.chromvoid.air.ui.access.AccessViewModel
import com.chromvoid.air.ui.access.BrandUnlockMotion
import com.chromvoid.air.ui.access.UnlockScreen
import com.chromvoid.air.ui.settings.AppearanceModel
import java.io.File
import java.util.Collections
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** A real-clock rendering check with a delayed, memory-only session; it never opens a vault. */
@RunWith(AndroidJUnit4::class)
public class BrandMotionDeviceTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    @Test
    public fun entryAndSignalRemainInteractiveAndOpenInOrder() {
        val theme = InstrumentationRegistry.getArguments().getString("captureTheme") ?: "light"
        val appearance = if (theme == "dark") AppearanceModel.Theme.DARK else AppearanceModel.Theme.LIGHT
        val session = DelayedAccessSession()
        val model = AccessViewModel(session)
        val observation = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        val phases = Collections.synchronizedList(mutableListOf<String>())
        observation.launch {
            model.unlockMotion.collect { motion ->
                when (motion) {
                    BrandUnlockMotion.Idle, BrandUnlockMotion.Rest -> Unit
                    is BrandUnlockMotion.Deriving -> phases.add("signal")
                    is BrandUnlockMotion.Finishing -> phases.add("finishing")
                    is BrandUnlockMotion.Open -> {
                        if (!phases.contains("ring")) {
                            assertEquals(AirSessionState.Locked, model.displayState.value)
                            phases.add("ring")
                        }
                    }
                }
            }
        }
        observation.launch {
            model.displayState.collect { state ->
                if (state is AirSessionState.Unlocked) phases.add("transition")
            }
        }
        try {
            // Pause at initial composition to check interaction before the first animation frame.
            rule.mainClock.autoAdvance = false
            rule.setContent {
                AirTheme(appearance) {
                    UnlockScreen(model)
                }
            }
            rule.onNodeWithTag(ACCESS_SUBMIT_TAG).assertIsEnabled()
            pumpFramesFor(500)
            capture("appearance-$theme")
            pumpFramesFor(1_500)
            rule.onNodeWithTag(ACCESS_PASSWORD_TAG).performTextInput("synthetic-motion-password")
            closeSoftKeyboard()
            rule.onNodeWithTag(ACCESS_SUBMIT_TAG).performClick()
            pumpFramesFor(650)
            assertTrue(model.unlockMotion.value is BrandUnlockMotion.Deriving)
            capture("signal-$theme")
            pumpFramesFor(3_000)
            rule.waitUntil(10_000) { phases.contains("transition") }
            val sequence = synchronized(phases) { phases.toList() }
            assertTrue(
                "signal runs before completion: $sequence",
                sequence.indexOf("signal") < sequence.indexOf("finishing"),
            )
            assertTrue(
                "signal reaches the core before the ring: $sequence",
                sequence.indexOf("finishing") < sequence.indexOf("ring"),
            )
            assertTrue(
                "the ring begins before navigation: $sequence",
                sequence.indexOf("ring") < sequence.indexOf("transition"),
            )
        } finally {
            rule.mainClock.autoAdvance = true
            observation.cancel()
        }
    }

    /** The renderer reads monotonic time; advance Compose frames alongside real elapsed time. */
    private fun pumpFramesFor(durationMillis: Long) {
        val deadline = SystemClock.uptimeMillis() + durationMillis
        while (SystemClock.uptimeMillis() < deadline) {
            rule.mainClock.advanceTimeByFrame()
            Thread.sleep(16)
        }
        rule.mainClock.advanceTimeByFrame()
    }

    private fun capture(name: String) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val folder = File(instrumentation.targetContext.getExternalFilesDir(null), "brand-motion")
        check(folder.isDirectory || folder.mkdirs())
        val bitmap = checkNotNull(instrumentation.uiAutomation.takeScreenshot())
        try {
            File(folder, "$name.png").outputStream().use { output ->
                check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output))
            }
        } finally {
            bitmap.recycle()
        }
    }
}

private class DelayedAccessSession : AccessSession {
    private val mutableState = MutableStateFlow<AirSessionState>(AirSessionState.Locked)
    override val state: StateFlow<AirSessionState> = mutableState
    override val sequence: StateFlow<ULong> = MutableStateFlow(0uL)
    override val administration: StateFlow<ULong?> = MutableStateFlow(1uL)

    override suspend fun unlock(password: String): AccessOutcome {
        check(password == "synthetic-motion-password")
        delay(3_000)
        mutableState.value = AirSessionState.Unlocked(1uL)
        return AccessOutcome.Accepted
    }

    override suspend fun setUpAdministrator(password: String, confirmation: String): AccessOutcome =
        error("the rendering fixture is already set up")

    override suspend fun lock() {
        mutableState.value = AirSessionState.Locked
    }

    override suspend fun refresh() = Unit
}
