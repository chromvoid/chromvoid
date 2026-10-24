package com.chromvoid.air

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.bridge.wire.PassmanagerSSHExportRequest
import com.chromvoid.air.bridge.wire.PassmanagerSSHPageRequest
import com.chromvoid.air.bridge.wire.SSHKeyMetadata
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.credentials.CATALOG_SEARCH_TAG
import com.chromvoid.air.ui.credentials.CATALOG_SSH_TAG
import com.chromvoid.air.ui.ssh.SSH_BACK_TAG
import com.chromvoid.air.ui.ssh.SSH_COPY_PUBLIC_TAG
import com.chromvoid.air.ui.ssh.SSH_CREATE_TAG
import com.chromvoid.air.ui.ssh.SSH_DELETE_CONFIRM_TAG
import com.chromvoid.air.ui.ssh.SSH_DELETE_TAG
import com.chromvoid.air.ui.ssh.SSH_EMPTY_TAG
import com.chromvoid.air.ui.ssh.SSH_FINGERPRINT_TAG
import com.chromvoid.air.ui.ssh.SSH_NAME_TAG
import com.chromvoid.air.ui.ssh.SSH_RENAME_SAVE_TAG
import com.chromvoid.air.ui.ssh.SSH_RENAME_TAG
import com.chromvoid.air.ui.ssh.SSH_SAVE_TAG
import com.chromvoid.air.ui.ssh.SshCreationModel
import com.chromvoid.air.ui.ssh.sshFieldTag
import com.chromvoid.air.ui.ssh.sshModeTag
import com.chromvoid.air.ui.ssh.sshRowTag
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Route A17 against real Core: a key is generated from the SSH screen, renamed
 * and its public key copied; a second key is imported from the first one's
 * private export; both are deleted and the list is empty again.
 */
@RunWith(AndroidJUnit4::class)
public class SshRouteInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun aKeyIsGeneratedRenamedCopiedImportedAndDeleted() {
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState { it is AirSessionState.Unlocked }
        val generation = (session.state.value as AirSessionState.Unlocked).generation
        awaitNode(CATALOG_SSH_TAG)
        rule.onNodeWithTag(CATALOG_SSH_TAG).performClick()
        awaitNode(SSH_EMPTY_TAG)

        rule.onNodeWithTag(SSH_CREATE_TAG).performClick()
        awaitNode(sshFieldTag(SshCreationModel.Field.NAME))
        rule.onNodeWithTag(sshFieldTag(SshCreationModel.Field.NAME)).performTextInput("Сервер")
        rule.hideKeyboard()
        rule.onNodeWithTag(SSH_SAVE_TAG).performClick()
        val generated = awaitKeys(generation, 1).single()
        assertEquals("ed25519", generated.type)

        rule.onNodeWithTag(sshRowTag(generated.id)).performClick()
        awaitNode(SSH_FINGERPRINT_TAG)
        rule.onNodeWithTag(SSH_RENAME_TAG).performClick()
        awaitNode(SSH_NAME_TAG)
        rule.onNodeWithTag(SSH_NAME_TAG).performTextReplacement("Прод")
        rule.onNodeWithTag(SSH_RENAME_SAVE_TAG).performClick()
        rule.hideKeyboard()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { keysNow(generation).singleOrNull()?.name == "Прод" }
        rule.onNodeWithTag(SSH_COPY_PUBLIC_TAG).performClick()
        rule.waitForIdle()

        val private = runBlocking {
            session.credentials.exportSsh(
                PassmanagerSSHExportRequest(format = "openssh_private", keyID = generated.id),
                generation,
            ).content
        }
        assertTrue(private.startsWith("-----BEGIN OPENSSH PRIVATE KEY-----"))
        rule.onNodeWithTag(SSH_DELETE_TAG).performClick()
        awaitNode(SSH_DELETE_CONFIRM_TAG)
        rule.onNodeWithTag(SSH_DELETE_CONFIRM_TAG).performClick()
        awaitNode(SSH_EMPTY_TAG)

        rule.onNodeWithTag(SSH_CREATE_TAG).performClick()
        awaitNode(sshModeTag(SshCreationModel.Mode.IMPORT))
        rule.onNodeWithTag(sshModeTag(SshCreationModel.Mode.IMPORT)).performClick()
        awaitNode(sshFieldTag(SshCreationModel.Field.PRIVATE_KEY))
        rule.onNodeWithTag(sshFieldTag(SshCreationModel.Field.PRIVATE_KEY)).performTextInput(private)
        rule.hideKeyboard()
        rule.onNodeWithTag(SSH_SAVE_TAG).performClick()
        val imported = awaitKeys(generation, 1).single()
        assertEquals("the same key comes back", generated.fingerprint, imported.fingerprint)

        rule.onNodeWithTag(sshRowTag(imported.id)).performClick()
        awaitNode(SSH_DELETE_TAG)
        rule.onNodeWithTag(SSH_DELETE_TAG).performClick()
        awaitNode(SSH_DELETE_CONFIRM_TAG)
        rule.onNodeWithTag(SSH_DELETE_CONFIRM_TAG).performClick()
        awaitNode(SSH_EMPTY_TAG)
        rule.onNodeWithTag(SSH_BACK_TAG).performClick()
        awaitNode(CATALOG_SEARCH_TAG)
    }

    private fun keysNow(generation: ULong): List<SSHKeyMetadata> = runBlocking {
        session.credentials.sshPage(PassmanagerSSHPageRequest(limit = 50, offset = 0), generation).keys.map { it.key }
    }

    /** Waits until Core holds [expected] keys and each is on screen. */
    private fun awaitKeys(generation: ULong, expected: Int): List<SSHKeyMetadata> {
        var keys = emptyList<SSHKeyMetadata>()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            keys = keysNow(generation)
            keys.size == expected && keys.all { count(sshRowTag(it.id)) > 0 }
        }
        return keys
    }

    private fun count(tag: String): Int = rule.onAllNodesWithTag(tag, useUnmergedTree = true).fetchSemanticsNodes().size

    private fun awaitNode(tag: String) {
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { count(tag) > 0 }
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
        const val NODE_TIMEOUT_MILLIS = 20_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
