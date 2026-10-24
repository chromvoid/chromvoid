package com.chromvoid.air

import android.graphics.Bitmap
import android.os.SystemClock
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.espresso.Espresso.closeSoftKeyboard
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.chromvoid.air.bridge.wire.PassmanagerEntryPageResponse
import com.chromvoid.air.bridge.wire.PassmanagerGroupPageResponse
import com.chromvoid.air.bridge.wire.PassmanagerIconGetManyResponse
import com.chromvoid.air.bridge.wire.PassmanagerSSHPageResponse
import com.chromvoid.air.bridge.wire.PassmanagerTagPageResponse
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AccessSession
import com.chromvoid.air.ui.AirApp
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.ShellViewModel
import com.chromvoid.air.ui.access.ACCESS_PASSWORD_TAG
import com.chromvoid.air.ui.access.ACCESS_SUBMIT_TAG
import com.chromvoid.air.ui.access.AccessViewModel
import com.chromvoid.air.ui.access.BRAND_MARK_RETAINED_TAG
import com.chromvoid.air.ui.access.BRAND_MARK_TAG
import com.chromvoid.air.ui.access.BrandUnlockMotion
import com.chromvoid.air.ui.credentials.CredentialClipboard
import com.chromvoid.air.ui.credentials.CredentialStore
import com.chromvoid.air.ui.settings.AppearanceModel
import java.io.File
import java.lang.reflect.Proxy
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Exercises AirApp's actual entry-to-vault branch replacement with no native runtime or stored data. */
@RunWith(AndroidJUnit4::class)
public class BrandRingNavigationDeviceTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    @Test
    public fun ringRemainsRenderedAfterVaultNavigationAndLeavesAtItsEnd() {
        val theme = InstrumentationRegistry.getArguments().getString("captureTheme") ?: "light"
        val appearance = if (theme == "dark") AppearanceModel.Theme.DARK else AppearanceModel.Theme.LIGHT
        val session = RingAccessSession()
        val model = AccessViewModel(session)
        val shell = ShellViewModel(session, emptyCredentialStore(), RingClipboard)
        try {
            rule.mainClock.autoAdvance = false
            rule.setContent { AirTheme(appearance) { AirApp(model, shell, onRetry = {}) } }
            pumpFramesFor(1_500)
            rule.onNodeWithTag(ACCESS_PASSWORD_TAG).performTextInput("synthetic-ring-password")
            closeSoftKeyboard()
            rule.onNodeWithTag(ACCESS_SUBMIT_TAG).performClick()
            pumpFramesFor(200)
            assertTrue(model.unlockMotion.value is BrandUnlockMotion.Deriving)
            session.result.complete(Unit)
            pumpUntil { model.unlockMotion.value is BrandUnlockMotion.Open }
            val openedAt = (model.unlockMotion.value as BrandUnlockMotion.Open).startedAt
            pumpUntil { monotonicMillis() >= openedAt + 270 }
            assertTrue((model.unlockMotion.value as BrandUnlockMotion.Open).transitionStarted)
            rule.onNodeWithTag("root-vault").assertIsDisplayed()
            rule.onNodeWithTag(ACCESS_PASSWORD_TAG).assertDoesNotExist()
            rule.onNodeWithTag(BRAND_MARK_RETAINED_TAG, useUnmergedTree = true).assertIsDisplayed()
            rule.onNodeWithTag(BRAND_MARK_TAG, useUnmergedTree = true).assertIsDisplayed()
            capture("ring-$theme")
            pumpUntil { monotonicMillis() >= openedAt + 650 }
            rule.onNodeWithTag(BRAND_MARK_RETAINED_TAG, useUnmergedTree = true).assertDoesNotExist()
            rule.onNodeWithTag(BRAND_MARK_TAG, useUnmergedTree = true).assertDoesNotExist()
            rule.onNodeWithTag("root-vault").assertIsDisplayed()
        } finally {
            rule.mainClock.autoAdvance = true
            model.lock()
        }
    }

    /** Both renderer and model read monotonic real time, so frame pumping follows that same clock. */
    private fun pumpFramesFor(durationMillis: Long) {
        val deadline = monotonicMillis() + durationMillis
        pumpUntil { monotonicMillis() >= deadline }
    }

    private fun pumpUntil(condition: () -> Boolean) {
        val deadline = SystemClock.uptimeMillis() + 10_000
        while (!condition() && SystemClock.uptimeMillis() < deadline) {
            rule.mainClock.advanceTimeByFrame()
            Thread.sleep(16)
        }
        assertTrue("motion did not reach its next phase within 10 seconds", condition())
        rule.mainClock.advanceTimeByFrame()
    }

    private fun capture(name: String) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val folder = File(instrumentation.targetContext.getExternalFilesDir(null), "brand-motion-review")
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

private fun monotonicMillis(): Long = System.nanoTime() / 1_000_000

/** The catalog requests only empty metadata; every unexpected operation fails the fixture. */
private fun emptyCredentialStore(): CredentialStore = Proxy.newProxyInstance(
    CredentialStore::class.java.classLoader,
    arrayOf(CredentialStore::class.java),
) { _, method, args ->
    when (method.name.substringBefore('-')) {
        "credentialPage" -> PassmanagerEntryPageResponse(emptyList(), totalCount = 0)
        "groupPage" -> PassmanagerGroupPageResponse(emptyList(), parent = args[0] as String)
        "tagPage" -> PassmanagerTagPageResponse(tags = emptyList())
        "credentialIcons" -> PassmanagerIconGetManyResponse(emptyList(), emptyList())
        "sshPage" -> PassmanagerSSHPageResponse(emptyList(), revision = "synthetic", totalCount = 0)
        else -> error("unexpected catalog operation: ${method.name}")
    }
} as CredentialStore

private object RingClipboard : CredentialClipboard {
    override fun copy(value: String, sensitive: Boolean) = error("the ring fixture never copies values")
    override fun clearOwned() = Unit
}

private class RingAccessSession : AccessSession {
    val result = CompletableDeferred<Unit>()
    private val mutableState = MutableStateFlow<AirSessionState>(AirSessionState.Locked)
    override val state: StateFlow<AirSessionState> = mutableState
    override val sequence: StateFlow<ULong> = MutableStateFlow(0uL)
    override val administration: StateFlow<ULong?> = MutableStateFlow(1uL)

    override suspend fun unlock(password: String): AccessOutcome {
        check(password == "synthetic-ring-password")
        result.await()
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
