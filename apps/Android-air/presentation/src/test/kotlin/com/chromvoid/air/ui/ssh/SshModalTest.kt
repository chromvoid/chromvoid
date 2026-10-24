package com.chromvoid.air.ui.ssh

import androidx.activity.ComponentActivity
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.chromvoid.air.bridge.wire.SSHKeyMetadata
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.credentials.FakeClipboard
import com.chromvoid.air.ui.credentials.FakeCredentialStore
import com.chromvoid.air.ui.root.RootScaffold
import com.chromvoid.air.ui.ssh.SshCreationModel.Field
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.junit.After
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class SshModalTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    @After
    public fun tearDown() {
        scope.cancel()
    }

    @Test
    public fun `SSH creation covers phone tabs and closing returns them to the list and detail`() {
        checkModalNavigation("root-tab-bar")
    }

    @Test
    @Config(qualifiers = "w1280dp-h800dp-land")
    public fun `SSH creation covers the tablet rail and closing returns it to the list and detail`() {
        checkModalNavigation("root-rail")
    }

    private fun checkModalNavigation(navigationTag: String) {
        val store = FakeCredentialStore()
        store.sshKeys["server"] = SSHKeyMetadata(
            comment = null,
            fingerprint = "SHA256:synthetic",
            id = "server",
            name = "Server",
            type = "ed25519",
        )
        val model = SshModel(store, 1uL, scope, FakeClipboard())
        rule.setContent {
            AirTheme { RootScaffold(unlocked = true, vault = { SshScreen(model, onBack = {}, modifier = it) }) }
        }
        rule.waitForIdle()
        assertNavigation(navigationTag)
        rule.onNodeWithTag(sshRowTag("server")).performClick()
        rule.onNodeWithTag(SSH_FINGERPRINT_TAG).assertIsDisplayed()
        assertNavigation(navigationTag)
        back()

        rule.onNodeWithTag(SSH_CREATE_TAG).performClick()
        assertModal()
        rule.onNodeWithText(rule.activity.getString(R.string.sk_cancel)).performClick()
        assertNull(model.creation.value)
        assertNavigation(navigationTag)

        rule.onNodeWithTag(SSH_CREATE_TAG).performClick()
        rule.onNodeWithTag(sshModeTag(SshCreationModel.Mode.IMPORT)).performClick()
        assertModal()
        rule.onNodeWithTag(sshFieldTag(Field.NAME)).performTextInput("Imported key draft")
        back()
        rule.onNodeWithText(rule.activity.getString(R.string.sk_discard_q)).assertIsDisplayed()
        rule.onNodeWithText(rule.activity.getString(R.string.sk_discard)).performClick()
        assertNull(model.creation.value)
        assertNavigation(navigationTag)

        rule.onNodeWithTag(SSH_CREATE_TAG).performClick()
        assertModal()
        rule.onNodeWithTag(sshFieldTag(Field.NAME)).performTextInput("Created key")
        rule.onNodeWithTag(SSH_SAVE_TAG).performClick()
        rule.waitUntil(5_000) { model.creation.value == null && model.state.value.status == SshModel.Status.READY }
        assertNavigation(navigationTag)
        val created = store.sshKeys.values.single { it.name == "Created key" }
        rule.onNodeWithTag(sshRowTag(created.id)).performClick()
        rule.onNodeWithTag(SSH_FINGERPRINT_TAG).assertIsDisplayed()
        assertNavigation(navigationTag)
    }

    private fun assertModal() {
        rule.waitForIdle()
        rule.onNodeWithTag("root-tab-bar", useUnmergedTree = true).assertDoesNotExist()
        rule.onNodeWithTag("root-rail", useUnmergedTree = true).assertDoesNotExist()
        rule.onNode(
            SemanticsMatcher.expectValue(SemanticsProperties.PaneTitle, rule.activity.getString(R.string.sk_add)),
            useUnmergedTree = true,
        ).assertExists()
    }

    private fun assertNavigation(tag: String) {
        rule.waitForIdle()
        rule.onNodeWithTag(tag).assertIsDisplayed()
        rule.onNodeWithTag("root-vault").assertIsSelected()
    }

    private fun back() {
        rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }
        rule.waitForIdle()
    }
}
