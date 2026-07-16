package com.chromvoid.app.main

import android.app.Activity
import android.os.Looper
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.util.concurrent.TimeUnit

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StartupSplashControllerTest {
    private val logs = mutableListOf<Pair<String, String?>>()

    @After
    fun tearDown() {
        shadowOf(Looper.getMainLooper()).idle()
        logs.clear()
    }

    @Test
    fun installCreatesOverlayAndDisposeClearsIt() {
        val activity = Robolectric.buildActivity(Activity::class.java).setup().get()
        val controller = StartupSplashController(activity, ::recordLog)

        controller.install()

        assertTrue(controller.hasOverlayForTests())
        assertTrue(controller.hasIconViewForTests())
        assertTrue(logs.any { it.first == "native_splash.overlay.installed" })

        controller.dispose()

        assertFalse(controller.hasOverlayForTests())
        assertFalse(controller.hasIconViewForTests())
    }

    @Test
    fun requestReleaseBeforeInstallIsNoop() {
        val activity = Robolectric.buildActivity(Activity::class.java).setup().get()
        val controller = StartupSplashController(activity, ::recordLog)

        controller.requestRelease()

        assertFalse(controller.releaseQueuedForTests())
        assertTrue(logs.any { it.first == "native_splash.release.request.ignored" })
    }

    @Test
    fun requestReleaseQueuesReleaseAfterInstall() {
        val activity = Robolectric.buildActivity(Activity::class.java).setup().get()
        val controller = StartupSplashController(activity, ::recordLog)

        controller.install()
        controller.requestRelease()

        assertTrue(controller.releaseQueuedForTests())
        assertTrue(logs.any { it.first == "native_splash.release.requested" })

        controller.dispose()
    }

    @Test
    fun installStartsIntroAndThenHeartbeat() {
        val activity = Robolectric.buildActivity(Activity::class.java).setup().get()
        val controller = StartupSplashController(activity, ::recordLog)

        controller.install()

        assertEquals(0f, controller.introProgressForTests() ?: -1f, 0.01f)
        assertEquals(0f, controller.spiralRevealProgressForTests() ?: -1f, 0.01f)
        assertEquals(0f, controller.coreProgressForTests() ?: -1f, 0.01f)
        assertFalse(controller.hasRunningIntroAnimatorForTests())
        assertFalse(logs.any { it.first == "native_splash.animation.intro.started" })

        controller.dispatchIconFirstDrawForTests()
        shadowOf(Looper.getMainLooper()).idleFor(16, TimeUnit.MILLISECONDS)

        assertTrue(logs.any { it.first == "native_splash.animation.intro.started" })

        shadowOf(Looper.getMainLooper()).idleFor(600, TimeUnit.MILLISECONDS)

        assertTrue((controller.spiralRevealProgressForTests() ?: 0f) > 0f)

        shadowOf(Looper.getMainLooper()).idleFor(700, TimeUnit.MILLISECONDS)

        assertEquals(1f, controller.introProgressForTests() ?: -1f, 0.01f)
        assertEquals(1f, controller.coreProgressForTests() ?: -1f, 0.01f)
        assertFalse(controller.hasRunningIntroAnimatorForTests())
        assertTrue(logs.any { it.first == "native_splash.animation.intro.completed" })

        shadowOf(Looper.getMainLooper()).idleFor(100, TimeUnit.MILLISECONDS)

        assertTrue(controller.hasHeartbeatAnimatorForTests())
        assertTrue(logs.any { it.first == "native_splash.heartbeat.started" })

        controller.dispose()
    }

    @Test
    fun disposeCancelsIntroAndHeartbeat() {
        val activity = Robolectric.buildActivity(Activity::class.java).setup().get()
        val controller = StartupSplashController(activity, ::recordLog)

        controller.install()
        controller.dispatchIconFirstDrawForTests()
        shadowOf(Looper.getMainLooper()).idleFor(16, TimeUnit.MILLISECONDS)
        shadowOf(Looper.getMainLooper()).idleFor(1_300, TimeUnit.MILLISECONDS)
        shadowOf(Looper.getMainLooper()).idleFor(100, TimeUnit.MILLISECONDS)

        assertNotNull(controller.heartbeatProgressForTests())

        controller.dispose()

        assertFalse(controller.hasRunningIntroAnimatorForTests())
        assertFalse(controller.hasHeartbeatAnimatorForTests())
        assertFalse(controller.hasOverlayForTests())
    }

    private fun recordLog(
        label: String,
        detail: String?,
    ) {
        logs += label to detail
    }
}
