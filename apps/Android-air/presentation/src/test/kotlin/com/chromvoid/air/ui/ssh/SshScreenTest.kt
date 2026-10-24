package com.chromvoid.air.ui.ssh

import androidx.activity.ComponentActivity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.bridge.wire.SSHKeyMetadata
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.credentials.FakeClipboard
import com.chromvoid.air.ui.credentials.FakeCredentialStore
import com.chromvoid.air.ui.ssh.SshCreationModel.Field
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w393dp-h900dp")
public class SshScreenTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    private val store = FakeCredentialStore()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    @After
    public fun tearDown() {
        scope.cancel()
    }

    private fun model(): SshModel = SshModel(store, 1uL, scope, FakeClipboard())

    private fun show(model: SshModel) {
        rule.setContent { AirTheme { SshScreen(model, onBack = {}) } }
        rule.waitForIdle()
    }

    private fun creation(mode: SshCreationModel.Mode = SshCreationModel.Mode.GENERATE): SshCreationModel {
        val model = model()
        model.beginCreation()
        val form = checkNotNull(model.creation.value)
        form.setMode(mode)
        show(model)
        return form
    }

    private fun assertField(tag: String, label: Int) {
        val caption = rule.activity.getString(label)
        rule.onNodeWithTag(tag).assert(hasSetTextAction()).assertContentDescriptionEquals(caption)
        rule.onNodeWithText(caption).assertIsDisplayed()
    }

    private fun addKey() {
        store.sshKeys["key"] = SSHKeyMetadata(
            comment = null,
            fingerprint = "SHA256:synthetic",
            id = "key",
            name = "Server",
            type = "ed25519",
        )
    }

    @Test
    public fun `a genuinely empty collection offers creation`() {
        val model = model()
        show(model)

        rule.onNodeWithTag(SSH_EMPTY_TAG).assertTextEquals(rule.activity.getString(R.string.sk_empty))
        rule.onNodeWithTag(SSH_NO_MATCH_TAG).assertDoesNotExist()
        rule.onNodeWithTag(SSH_CLEAR_FILTERS_TAG).assertDoesNotExist()
        rule.onNodeWithTag(SSH_EMPTY_ADD_TAG)
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
            .performClick()

        rule.onNodeWithTag(SSH_SAVE_TAG).assertIsDisplayed()
    }

    @Test
    public fun `an unmatched search offers clearing filters instead of empty collection creation`() {
        addKey()
        val model = model()
        model.search("Missing")
        show(model)

        rule.onNodeWithTag(SSH_NO_MATCH_TAG).assertTextEquals(rule.activity.getString(R.string.sk_no_matches))
        rule.onNodeWithTag(SSH_EMPTY_TAG).assertDoesNotExist()
        rule.onNodeWithTag(SSH_EMPTY_ADD_TAG).assertDoesNotExist()
        rule.onNodeWithTag(SSH_CLEAR_FILTERS_TAG)
            .assertTextEquals(rule.activity.getString(R.string.sk_clear_filters))
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
            .performClick()

        rule.onNodeWithTag(sshRowTag("key")).assertIsDisplayed()
        rule.onNodeWithTag(SSH_NO_MATCH_TAG).assertDoesNotExist()
        assertEquals("", model.state.value.query)
    }

    @Test
    public fun `an unmatched key type also offers clearing filters`() {
        addKey()
        val model = model()
        model.setKeyType(SshModel.KeyType.RSA)
        show(model)

        rule.onNodeWithTag(SSH_NO_MATCH_TAG).assertIsDisplayed()
        rule.onNodeWithTag(SSH_EMPTY_ADD_TAG).assertDoesNotExist()
        rule.onNodeWithTag(SSH_CLEAR_FILTERS_TAG).performClick()

        rule.onNodeWithTag(sshRowTag("key")).assertIsDisplayed()
        assertEquals(SshModel.KeyType.ALL, model.state.value.keyType)
    }

    @Test
    public fun `stale and failed collections explain their own reload and recover without an empty add action`() {
        addKey()
        store.failWith = CoreRefusal("SYNC_CONFLICT", "passmanager:ssh:page")
        val model = model()
        show(model)

        rule.onNodeWithText(rule.activity.getString(R.string.sk_stale)).assertIsDisplayed()
        rule.onNodeWithText(rule.activity.getString(R.string.ssh_failed)).assertDoesNotExist()
        rule.onNodeWithTag(SSH_EMPTY_ADD_TAG).assertDoesNotExist()
        rule.onNodeWithTag(SSH_RELOAD_TAG)
            .assertTextEquals(rule.activity.getString(R.string.sk_reload))
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))

        rule.runOnIdle { store.failWith = CoreRefusal("INTERNAL", "passmanager:ssh:page") }
        rule.onNodeWithTag(SSH_RELOAD_TAG).performClick()

        rule.onNodeWithText(rule.activity.getString(R.string.ssh_failed)).assertIsDisplayed()
        rule.onNodeWithText(rule.activity.getString(R.string.sk_stale)).assertDoesNotExist()
        rule.onNodeWithTag(SSH_EMPTY_ADD_TAG).assertDoesNotExist()

        rule.runOnIdle { store.failWith = null }
        rule.onNodeWithTag(SSH_RELOAD_TAG).performClick()

        rule.onNodeWithTag(sshRowTag("key")).assertIsDisplayed()
        rule.onNodeWithTag(SSH_RELOAD_TAG).assertDoesNotExist()
    }

    @Test
    public fun `generated and imported key fields retain labels when populated`() {
        val form = creation()
        rule.runOnIdle {
            form.change(Field.NAME, "Server")
            form.change(Field.COMMENT, "alice@laptop")
        }

        assertField(sshFieldTag(Field.NAME), R.string.sk_name)
        assertField(sshFieldTag(Field.COMMENT), R.string.sk_comment)

        rule.runOnIdle {
            form.setMode(SshCreationModel.Mode.IMPORT)
            form.change(Field.PRIVATE_KEY, "synthetic-key")
            form.change(Field.PASSPHRASE, "synthetic-passphrase")
        }

        assertField(sshFieldTag(Field.NAME), R.string.sk_name)
        assertField(sshFieldTag(Field.PRIVATE_KEY), R.string.sk_private_key)
        assertField(sshFieldTag(Field.PASSPHRASE), R.string.sk_passphrase)
    }

    @Test
    public fun `a failed import names every invalid field and refocuses the first on every submit`() {
        val form = creation(SshCreationModel.Mode.IMPORT)
        rule.runOnIdle { form.change(Field.NAME, "x".repeat(257)) }

        rule.onNodeWithTag(SSH_SAVE_TAG).performClick()

        rule.onNodeWithTag(sshFieldTag(Field.NAME)).assertIsFocused().assert(SemanticsMatcher.expectValue(
            SemanticsProperties.Error,
            rule.activity.getString(R.string.ssh_issue_too_long),
        ))
        rule.onNodeWithTag(sshFieldTag(Field.PRIVATE_KEY)).assert(SemanticsMatcher.expectValue(
            SemanticsProperties.Error,
            rule.activity.getString(R.string.ssh_issue_key_required),
        ))

        rule.onNodeWithTag(sshFieldTag(Field.NAME)).performTextReplacement("Server")
        rule.onNodeWithTag(sshFieldTag(Field.NAME)).assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Error))
        rule.onNodeWithTag(SSH_SAVE_TAG).performClick()
        rule.onNodeWithTag(sshFieldTag(Field.PRIVATE_KEY)).assertIsFocused()

        rule.onNodeWithTag(sshFieldTag(Field.NAME)).performClick()
        rule.onNodeWithTag(SSH_SAVE_TAG).performClick()
        rule.onNodeWithTag(sshFieldTag(Field.PRIVATE_KEY)).assertIsFocused()
    }

    @Test
    public fun `a refused key marks and focuses the private key editor`() {
        val form = creation(SshCreationModel.Mode.IMPORT)
        rule.runOnIdle { form.change(Field.PRIVATE_KEY, "not an OpenSSH key") }

        rule.onNodeWithTag(SSH_SAVE_TAG).performClick()
        rule.waitForIdle()

        assertEquals(SshCreationModel.Issue.REFUSED, form.state.value.issue)
        rule.onNodeWithTag(sshFieldTag(Field.PRIVATE_KEY)).assertIsFocused().assert(SemanticsMatcher.expectValue(
            SemanticsProperties.Error,
            rule.activity.getString(R.string.ssh_issue_refused),
        ))
    }

    private fun detail(): SshDetailModel {
        addKey()
        val model = model()
        show(model)
        rule.runOnIdle { model.select("key") }
        return checkNotNull(model.selected.value)
    }

    @Test
    public fun `rename and private export fields keep visible labels and editable names`() {
        val detail = detail()
        rule.runOnIdle { detail.beginEdit() }

        assertField(SSH_NAME_TAG, R.string.sk_name)

        rule.runOnIdle {
            detail.cancelEdit()
            detail.beginExport(SshDetailModel.ExportKind.PRIVATE_KEY)
            detail.changePassphrase("synthetic-passphrase")
        }

        assertField(SSH_EXPORT_PASSPHRASE_TAG, R.string.sk_export_passphrase)
    }

    @Test
    public fun `a refused rename reports the error on and focuses its editable node`() {
        val detail = detail()
        rule.runOnIdle {
            detail.beginEdit()
            detail.changeName("Renamed")
            store.failWith = CoreRefusal("ACCESS_DENIED", "passmanager:ssh:key:edit")
        }

        rule.onNodeWithTag(SSH_RENAME_SAVE_TAG).performClick()
        rule.waitForIdle()

        assertEquals(SshDetailModel.Issue.UPDATE_REFUSED, detail.state.value.issue)
        rule.onNodeWithTag(SSH_NAME_TAG).assertIsFocused().assert(SemanticsMatcher.expectValue(
            SemanticsProperties.Error,
            rule.activity.getString(R.string.ssh_issue_update_refused),
        ))
    }
}
