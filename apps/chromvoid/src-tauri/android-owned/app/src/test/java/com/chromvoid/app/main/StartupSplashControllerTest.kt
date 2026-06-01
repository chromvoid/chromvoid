package com.chromvoid.app.main

import android.app.Activity
import android.os.Looper
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

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
        assertTrue(logs.any { it.first == "native_splash.overlay.installed" })

        controller.dispose()

        assertFalse(controller.hasOverlayForTests())
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

    private fun recordLog(
        label: String,
        detail: String?,
    ) {
        logs += label to detail
    }
}
