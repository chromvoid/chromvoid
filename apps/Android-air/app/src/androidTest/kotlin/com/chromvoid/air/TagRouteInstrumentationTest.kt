package com.chromvoid.air

import com.chromvoid.air.ui.credentials.CATALOG_TOOLS_TAG
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateSecrets
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.credentials.CATALOG_CREATE_TAG
import com.chromvoid.air.ui.credentials.CATALOG_TAGS_TAG
import com.chromvoid.air.ui.credentials.CATALOG_TAG_FILTER_TAG
import com.chromvoid.air.ui.credentials.CredentialFormModel
import com.chromvoid.air.ui.credentials.DETAIL_BACK_TAG
import com.chromvoid.air.ui.credentials.DETAIL_TITLE_TAG
import com.chromvoid.air.ui.credentials.FORM_SAVE_TAG
import com.chromvoid.air.ui.credentials.FORM_TAGS_TAG
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.performScrollToNode
import com.chromvoid.air.ui.credentials.FORM_LIST_TAG
import com.chromvoid.air.ui.credentials.TAGS_DONE_TAG
import com.chromvoid.air.ui.credentials.TAGS_NEW_TAG
import com.chromvoid.air.ui.credentials.TAG_LABEL_TAG
import com.chromvoid.air.ui.credentials.TAG_SAVE_TAG
import com.chromvoid.air.ui.credentials.catalogRowTag
import com.chromvoid.air.ui.credentials.createKindTag
import com.chromvoid.air.ui.credentials.formFieldTag
import com.chromvoid.air.ui.credentials.tagColorTag
import com.chromvoid.air.ui.credentials.TAG_DELETE_CONFIRM_TAG
import com.chromvoid.air.ui.credentials.tagActionsTag
import com.chromvoid.air.ui.credentials.tagDeleteTag
import com.chromvoid.air.ui.credentials.tagRowTag
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Route A11 against real Core: a tag is created in the tag catalog, a record is
 * created carrying it, and the catalog narrows to the tag and back.
 */
@RunWith(AndroidJUnit4::class)
public class TagRouteInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun aTagIsCreatedAssignedAndFilteredBy() {
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState { it is AirSessionState.Unlocked }
        val generation = (session.state.value as AirSessionState.Unlocked).generation
        val untagged = runBlocking {
            session.credentials.createCredential(
                PassmanagerEntryCreateRequest(
                    entryID = UUID.randomUUID().toString(),
                    entryType = "login",
                    secrets = PassmanagerEntryCreateSecrets(password = "synthetic"),
                    title = "Банк",
                ),
                generation,
            ).entryID
        }
        awaitNode(catalogRowTag(untagged))

        rule.onNodeWithTag(CATALOG_CREATE_TAG).performClick()
        awaitNode(createKindTag(CredentialFormModel.Kind.LOGIN))
        rule.onNodeWithTag(createKindTag(CredentialFormModel.Kind.LOGIN)).performClick()
        awaitNode(formFieldTag(CredentialFormModel.Field.TITLE))
        rule.onNodeWithTag(formFieldTag(CredentialFormModel.Field.TITLE)).performTextInput("Почта")
        rule.hideKeyboard()
        rule.onNodeWithTag(FORM_LIST_TAG).performScrollToNode(hasTestTag(FORM_TAGS_TAG))
        rule.onNodeWithTag(FORM_TAGS_TAG).performClick()
        awaitNode(TAGS_NEW_TAG)
        rule.onNodeWithTag(TAGS_NEW_TAG).performClick()
        awaitNode(TAG_LABEL_TAG)
        rule.onNodeWithTag(TAG_LABEL_TAG).performTextInput(TAG)
        rule.onNodeWithTag(tagColorTag("amber")).performClick()
        rule.onNodeWithTag(TAG_SAVE_TAG).performClick()
        val key = awaitTagKey(generation)
        rule.onNodeWithTag(tagRowTag(key)).performClick()
        rule.onNodeWithTag(TAGS_DONE_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(FORM_SAVE_TAG).performClick()
        awaitNode(DETAIL_TITLE_TAG)
        rule.onNodeWithTag(DETAIL_BACK_TAG).performClick()

        rule.onNodeWithTag(CATALOG_TOOLS_TAG).performClick()
        awaitNode(CATALOG_TAGS_TAG)
        rule.onNodeWithTag(CATALOG_TAGS_TAG).performClick()
        awaitNode(tagRowTag(key))
        rule.onNodeWithTag(tagRowTag(key)).performClick()
        awaitNode(CATALOG_TAG_FILTER_TAG)
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { count(catalogRowTag(untagged)) == 0 }

        rule.onNodeWithTag(CATALOG_TAG_FILTER_TAG).performClick()
        awaitNode(catalogRowTag(untagged))

        val tag = runBlocking { session.credentials.tagPage(0, generation).tags.single() }
        assertEquals(TAG to "amber", tag.label to tag.colorID)
        assertEquals(1L, tag.count)
    }

    /** A11, the rest: the tag row's menu deletes a tag after one confirmation. */
    @Test
    public fun aTagIsDeletedFromItsRow() {
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState { it is AirSessionState.Unlocked }
        val generation = (session.state.value as AirSessionState.Unlocked).generation
        val key = runBlocking { session.credentials.saveTag(null, TAG, "amber", generation).key }

        rule.onNodeWithTag(CATALOG_TOOLS_TAG).performClick()
        awaitNode(CATALOG_TAGS_TAG)
        rule.onNodeWithTag(CATALOG_TAGS_TAG).performClick()
        awaitNode(tagRowTag(key))

        rule.onNodeWithTag(tagActionsTag(key)).performClick()
        awaitNode(tagDeleteTag(key))
        rule.onNodeWithTag(tagDeleteTag(key)).performClick()
        awaitNode(TAG_DELETE_CONFIRM_TAG)
        rule.onNodeWithTag(TAG_DELETE_CONFIRM_TAG).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { count(tagRowTag(key)) == 0 }

        assertTrue(runBlocking { session.credentials.tagPage(0, generation).tags.isEmpty() })
    }

    private fun awaitTagKey(generation: ULong): String {
        var key: String? = null
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            key = runBlocking { session.credentials.tagPage(0, generation).tags.firstOrNull()?.key }
            key != null && count(tagRowTag(key!!)) > 0
        }
        return checkNotNull(key)
    }

    private fun count(tag: String): Int = rule.onAllNodesWithTag(tag).fetchSemanticsNodes().size

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
        const val TAG = "Работа"
        const val NODE_TIMEOUT_MILLIS = 10_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
