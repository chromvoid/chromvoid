package com.chromvoid.air

import android.view.View
import androidx.compose.ui.test.ComposeAccessibilityValidator
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToKey
import androidx.compose.ui.test.tryPerformAccessibilityChecks
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateSecrets
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.autofill.AUTOFILL_ACCESS_TAG
import com.chromvoid.air.ui.autofill.AUTOFILL_CLOSE_TAG
import com.chromvoid.air.ui.credentials.CATALOG_CREATE_TAG
import com.chromvoid.air.ui.credentials.CATALOG_PASSKEYS_TAG
import com.chromvoid.air.ui.credentials.CredentialFormModel.Kind
import com.chromvoid.air.ui.credentials.DETAIL_BACK_TAG
import com.chromvoid.air.ui.credentials.DETAIL_TITLE_TAG
import com.chromvoid.air.ui.credentials.FORM_CLOSE_TAG
import com.chromvoid.air.ui.credentials.catalogRowTag
import com.chromvoid.air.ui.credentials.createKindTag
import com.chromvoid.air.ui.help.HELP_BACK_TAG
import com.chromvoid.air.ui.passkeys.PASSKEYS_BACK_TAG
import com.chromvoid.air.ui.settings.SETTINGS_AUTOFILL_TAG
import com.chromvoid.air.ui.settings.SETTINGS_HELP_TAG
import com.chromvoid.air.ui.settings.SETTINGS_LIST_TAG
import com.google.android.apps.common.testing.accessibility.framework.integrations.espresso.AccessibilityValidator
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Route A42's accessibility, with Android's Accessibility Test Framework on every screen the
 * main journeys pass: first run, the lock screen, the vault with a record, the record, Passkeys,
 * the new login form, Files, Connections, Settings, its AutoFill page and Help. Every
 * interaction runs the checks too - touch target size, labels, contrast - and any error fails
 * the test.
 */
@RunWith(AndroidJUnit4::class)
public class AccessibilityInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun theMainScreensPassTheAccessibilityChecks() {
        // What ComposeUiTest.enableAccessibilityChecks does, on the JUnit rule: ATF from the root view.
        val validator = AccessibilityValidator().setRunChecksFromRootView(true)
        rule.setComposeAccessibilityValidator(
            object : ComposeAccessibilityValidator {
                override fun check(view: View) {
                    validator.check(view)
                }
            },
        )
        awaitState { it == AirSessionState.NeedsAdministrator }
        audit("first run")
        runBlocking { assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR)) }
        awaitState { it == AirSessionState.Locked }
        audit("lock screen")
        runBlocking { assertEquals(AccessOutcome.Accepted, session.unlock(VAULT)) }
        awaitState { it is AirSessionState.Unlocked }
        val generation = (session.state.value as AirSessionState.Unlocked).generation
        val id = UUID.randomUUID().toString()
        runBlocking {
            session.credentials.createCredential(
                PassmanagerEntryCreateRequest(
                    entryID = id,
                    entryType = "login",
                    secrets = PassmanagerEntryCreateSecrets(password = "synthetic-password"),
                    title = "Example",
                    username = "alice@example.com",
                ),
                generation,
            )
        }

        awaitNode(catalogRowTag(id))
        audit("vault")
        rule.onNodeWithTag(catalogRowTag(id)).performClick()
        awaitNode(DETAIL_TITLE_TAG)
        audit("record")
        rule.onNodeWithTag(DETAIL_BACK_TAG).performClick()

        rule.onNodeWithTag(CATALOG_PASSKEYS_TAG).performClick()
        awaitNode(PASSKEYS_BACK_TAG)
        audit("passkeys")
        rule.onNodeWithTag(PASSKEYS_BACK_TAG).performClick()

        awaitNode(CATALOG_CREATE_TAG)
        rule.onNodeWithTag(CATALOG_CREATE_TAG).performClick()
        awaitNode(createKindTag(Kind.LOGIN))
        rule.onNodeWithTag(createKindTag(Kind.LOGIN)).performClick()
        awaitNode(FORM_CLOSE_TAG)
        audit("new login")
        rule.onNodeWithTag(FORM_CLOSE_TAG).performClick()

        for (root in listOf("files", "connections", "settings")) {
            awaitNode("root-$root")
            rule.onNodeWithTag("root-$root").performClick()
            rule.waitForIdle()
            audit(root)
        }
        rule.onNodeWithTag(SETTINGS_LIST_TAG).performScrollToKey("passwords-passkeys")
        rule.onNodeWithTag(SETTINGS_AUTOFILL_TAG).performClick()
        awaitNode(AUTOFILL_ACCESS_TAG)
        audit("autofill")
        rule.onNodeWithTag(AUTOFILL_CLOSE_TAG).performClick()
        // Reach Help's section rather than the trailing phone tab-bar clearance: expanded
        // layouts use a rail and keep only the system navigation inset after the content.
        rule.onNodeWithTag(SETTINGS_LIST_TAG).performScrollToKey("about")
        rule.onNodeWithTag(SETTINGS_HELP_TAG).performClick()
        awaitNode(HELP_BACK_TAG)
        audit("help")
    }

    /** The checks over the whole screen as it stands; an error names the screen it is on. */
    private fun audit(screen: String) {
        rule.waitForIdle()
        try {
            rule.onRoot().tryPerformAccessibilityChecks()
        } catch (error: Throwable) {
            throw AssertionError("accessibility on $screen: ${error.message}", error)
        }
    }

    private fun awaitNode(tag: String) {
        rule.waitUntil(TIMEOUT_MILLIS) { rule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty() }
    }

    private fun awaitState(accept: (AirSessionState) -> Boolean) {
        runCatching { rule.waitUntil(TIMEOUT_MILLIS) { accept(session.state.value) } }
        check(accept(session.state.value)) { "session still ${session.state.value}" }
    }

    private companion object {
        const val ADMINISTRATOR = "air-instrumentation-administrator"
        const val VAULT = "air-instrumentation-vault"
        const val TIMEOUT_MILLIS = 20_000L
    }
}
