package com.chromvoid.air.ui.settings

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class SessionSettingsModelTest {
    private class Preferences(
        override var autoLockSeconds: Long = 0,
        override var keepScreenAwake: Boolean = false,
        override var lockOnLeave: Boolean = false,
        override var lockOnScreenOff: Boolean = false,
        override var lockNotification: Boolean = true,
    ) : SessionPreferences

    @Test
    public fun `the stored choices are what the screen starts with, leaving unlocked by default`(): Unit = runTest {
        val model = SessionSettingsModel({ true }, Preferences(autoLockSeconds = 900), backgroundScope)

        val state = model.state.value
        assertEquals(AutoLockTimeout.FIFTEEN_MINUTES, state.autoLock)
        assertFalse(state.lockOnLeave)
        assertFalse(state.lockOnScreenOff)
        assertFalse(state.keepScreenAwake)
    }

    @Test
    public fun `an inactivity lock is kept only once the runtime took it`(): Unit = runTest {
        val preferences = Preferences()
        var accept = false
        val model = SessionSettingsModel({ accept }, preferences, backgroundScope)

        model.setAutoLock(AutoLockTimeout.FIVE_MINUTES)
        runCurrent()
        assertEquals(AutoLockTimeout.NEVER, model.state.value.autoLock)
        assertTrue(model.state.value.failed)
        assertEquals(0L, preferences.autoLockSeconds)

        accept = true
        model.setAutoLock(AutoLockTimeout.FIVE_MINUTES)
        runCurrent()
        assertEquals(AutoLockTimeout.FIVE_MINUTES, model.state.value.autoLock)
        assertFalse(model.state.value.failed)
        assertEquals(300L, preferences.autoLockSeconds)
    }

    @Test
    public fun `the lock notification is on by default and its choice is stored`(): Unit = runTest {
        val preferences = Preferences()
        val model = SessionSettingsModel({ true }, preferences, backgroundScope)
        assertTrue(model.state.value.lockNotification)

        model.setLockNotification(false)
        assertFalse(preferences.lockNotification)
        assertFalse(model.state.value.lockNotification)
    }

    @Test
    public fun `the Lock tile is offered only where Android can add it`(): Unit = runTest {
        assertFalse(SessionSettingsModel({ true }, Preferences(), backgroundScope).offersLockTile)
        var requests = 0
        val model = SessionSettingsModel({ true }, Preferences(), backgroundScope) { requests++ }
        assertTrue(model.offersLockTile)
        model.addLockTile()
        assertEquals(1, requests)
    }

    @Test
    public fun `leaving, screen-off and keep-awake choices are stored at once`(): Unit = runTest {
        val preferences = Preferences()
        val model = SessionSettingsModel({ true }, preferences, backgroundScope)

        model.setLockOnLeave(true)
        model.setLockOnScreenOff(true)
        model.setKeepScreenAwake(true)

        assertTrue(preferences.lockOnLeave && preferences.keepScreenAwake)
        assertTrue(model.state.value.lockOnLeave && model.state.value.keepScreenAwake)
        assertTrue(preferences.lockOnScreenOff)
        assertTrue(model.state.value.lockOnScreenOff)
    }

    @Test
    public fun `a stored length the list does not offer reads as the nearest shorter one`() {
        assertEquals(AutoLockTimeout.NEVER, AutoLockTimeout.of(0))
        assertEquals(AutoLockTimeout.ONE_MINUTE, AutoLockTimeout.of(120))
        assertEquals(AutoLockTimeout.ONE_HOUR, AutoLockTimeout.of(86_400))
        assertEquals(AutoLockTimeout.ONE_MINUTE, AutoLockTimeout.of(10))
    }
}
