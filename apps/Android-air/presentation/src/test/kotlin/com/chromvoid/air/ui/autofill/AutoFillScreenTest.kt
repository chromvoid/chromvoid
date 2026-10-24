package com.chromvoid.air.ui.autofill

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.ui.AirTheme
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/** Route A19 over the AutoFill page: the status, a failed read, and the way to the system setting. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class AutoFillScreenTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    private var closed = 0

    private fun show(store: FakeAutoFillStore): AutoFillModel {
        val model = AutoFillModel(store, 1uL, CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate))
        rule.setContent { AirTheme { AutoFillScreen(model, onDismiss = { closed++ }) } }
        rule.waitForIdle()
        return model
    }

    private fun exists(tag: String): Boolean = rule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()

    @Test
    public fun `the page reads the status as it comes on screen and says where things stand`() {
        val store = FakeAutoFillStore()
        store.status = store.status.copy(
            system = AutoFillSystem.NOT_SELECTED,
            vaultOpen = false,
            passkeys = PasskeyProvider.NOT_ENABLED,
        )
        show(store)

        assertEquals(1, store.reads)
        rule.onNodeWithTag(AUTOFILL_SYSTEM_TAG).assertTextEquals("ChromVoid Air is not selected")
        rule.onNodeWithTag(AUTOFILL_PASSKEYS_TAG).assertTextEquals("ChromVoid Air is not turned on")
        rule.onNodeWithTag(AUTOFILL_ACCESS_TAG).assertTextEquals("Vault is closed")

        store.status = store.status.copy(
            system = AutoFillSystem.SELECTED,
            vaultOpen = true,
            passkeys = PasskeyProvider.ENABLED,
        )
        rule.onNodeWithTag(AUTOFILL_REFRESH_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(AUTOFILL_SYSTEM_TAG).assertTextEquals("ChromVoid Air is the autofill service")
        rule.onNodeWithTag(AUTOFILL_PASSKEYS_TAG).assertTextEquals("ChromVoid Air provides passkeys and passwords")
        rule.onNodeWithTag(AUTOFILL_ACCESS_TAG).assertTextEquals("Local vault authorized")

        rule.onNodeWithTag(AUTOFILL_CLOSE_TAG).performClick()
        assertEquals(1, closed)
    }

    @Test
    public fun `a failed read says so and can be tried again`() {
        val store = FakeAutoFillStore(failWith = CoreRefusal("INTERNAL", "credential_provider:status"))
        show(store)
        rule.onNodeWithTag(AUTOFILL_FAILED_TAG).assertIsDisplayed()

        store.failWith = null
        rule.onNodeWithTag(AUTOFILL_REFRESH_TAG).performClick()
        rule.waitForIdle()
        assertTrue(!exists(AUTOFILL_FAILED_TAG))
        rule.onNodeWithTag(AUTOFILL_ACCESS_TAG).assertTextEquals("Local vault authorized")
    }

    @Test
    public fun `the system setting opens from the page`() {
        val store = FakeAutoFillStore()
        show(store)
        rule.onNodeWithTag(AUTOFILL_SETTINGS_TAG).performScrollTo().performClick()
        rule.waitForIdle()

        val started = shadowOf(rule.activity).nextStartedActivityForResult
        assertEquals("com.chromvoid.test.AUTOFILL_SETTINGS", started.intent.action)
        assertTrue(!exists(AUTOFILL_SETTINGS_FAILED_TAG))
    }

    @Test
    public fun `the passkey setting opens from the page`() {
        show(FakeAutoFillStore())
        rule.onNodeWithTag(AUTOFILL_PASSKEY_SETTINGS_TAG).performScrollTo().performClick()
        rule.waitForIdle()

        val started = shadowOf(rule.activity).nextStartedActivityForResult
        assertEquals("com.chromvoid.test.PASSKEY_SETTINGS", started.intent.action)
    }

    @Test
    public fun `before Android 14 the page says passkeys need it and offers no passkey setting`() {
        val store = FakeAutoFillStore(passkeySettings = null)
        store.status = store.status.copy(passkeys = PasskeyProvider.UNSUPPORTED)
        show(store)
        rule.onNodeWithTag(AUTOFILL_PASSKEYS_TAG).assertTextEquals("Needs Android 14 or later")
        assertTrue(!exists(AUTOFILL_PASSKEY_SETTINGS_TAG))
    }

    @Test
    public fun `a device without autofill says so instead of offering the setting`() {
        show(FakeAutoFillStore(settings = null))
        assertTrue(!exists(AUTOFILL_SETTINGS_TAG))
        rule.onNodeWithText("This device does not offer autofill, or a policy has turned it off.")
            .performScrollTo()
            .assertIsDisplayed()
    }
}
