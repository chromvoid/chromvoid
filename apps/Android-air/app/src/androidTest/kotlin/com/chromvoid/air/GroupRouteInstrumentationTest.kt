package com.chromvoid.air

import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.performScrollToNode
import com.chromvoid.air.ui.credentials.FORM_LIST_TAG
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateSecrets
import com.chromvoid.air.bridge.wire.PassmanagerEntryPageRequest
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.credentials.CATALOG_CREATE_TAG
import com.chromvoid.air.ui.credentials.CATALOG_NEW_GROUP_TAG
import com.chromvoid.air.ui.credentials.CATALOG_UP_TAG
import com.chromvoid.air.ui.credentials.CredentialFormModel
import com.chromvoid.air.ui.credentials.DETAIL_BACK_TAG
import com.chromvoid.air.ui.credentials.DETAIL_EDIT_TAG
import com.chromvoid.air.ui.credentials.FORM_GROUP_TAG
import com.chromvoid.air.ui.credentials.DETAIL_TITLE_TAG
import com.chromvoid.air.ui.credentials.FORM_SAVE_TAG
import com.chromvoid.air.ui.credentials.GROUP_DELETE_CONFIRM_TAG
import com.chromvoid.air.ui.credentials.GROUP_NAME_TAG
import com.chromvoid.air.ui.credentials.GROUP_SAVE_TAG
import com.chromvoid.air.ui.credentials.PICKER_HERE_TAG
import com.chromvoid.air.ui.credentials.catalogRowTag
import com.chromvoid.air.ui.credentials.createKindTag
import com.chromvoid.air.ui.credentials.formFieldTag
import com.chromvoid.air.ui.credentials.groupRowTag
import com.chromvoid.air.ui.credentials.groupMenuTag
import com.chromvoid.air.ui.credentials.pickerGroupTag
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Routes A09 and A10 against real Core: a group is created and opened, a
 * record is created inside it, and another record is moved into it by browsing
 * the group tree. The moved record keeps its id.
 */
@RunWith(AndroidJUnit4::class)
public class GroupRouteInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun aGroupIsCreatedFilledAndMovedInto() {
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState { it is AirSessionState.Unlocked }
        val generation = (session.state.value as AirSessionState.Unlocked).generation
        val loose = runBlocking {
            session.credentials.createCredential(
                PassmanagerEntryCreateRequest(
                    entryID = UUID.randomUUID().toString(),
                    entryType = "login",
                    secrets = PassmanagerEntryCreateSecrets(password = "synthetic"),
                    title = "GitHub",
                ),
                generation,
            ).entryID
        }
        awaitNode(catalogRowTag(loose))

        rule.onNodeWithTag(CATALOG_CREATE_TAG).performClick()
        awaitNode(CATALOG_NEW_GROUP_TAG)
        rule.onNodeWithTag(CATALOG_NEW_GROUP_TAG).performClick()
        awaitNode(GROUP_NAME_TAG)
        rule.onNodeWithTag(GROUP_NAME_TAG).performTextInput(GROUP)
        rule.onNodeWithTag(GROUP_SAVE_TAG).performClick()
        awaitNode(groupRowTag("/$GROUP"))

        rule.onNodeWithTag(groupRowTag("/$GROUP")).performClick()
        awaitNode(CATALOG_UP_TAG)
        rule.onNodeWithTag(CATALOG_CREATE_TAG).performClick()
        awaitNode(createKindTag(CredentialFormModel.Kind.LOGIN))
        rule.onNodeWithTag(createKindTag(CredentialFormModel.Kind.LOGIN)).performClick()
        awaitNode(formFieldTag(CredentialFormModel.Field.TITLE))
        rule.onNodeWithTag(formFieldTag(CredentialFormModel.Field.TITLE)).performTextInput("Jira")
        rule.onNodeWithTag(FORM_SAVE_TAG).performClick()
        awaitNode(DETAIL_TITLE_TAG)
        rule.onNodeWithTag(DETAIL_BACK_TAG).performClick()
        rule.onNodeWithTag(CATALOG_UP_TAG).performClick()

        awaitNode(catalogRowTag(loose))
        rule.onNodeWithTag(catalogRowTag(loose)).performClick()
        awaitNode(DETAIL_EDIT_TAG)
        rule.onNodeWithTag(DETAIL_EDIT_TAG).performClick()
        awaitNode(FORM_GROUP_TAG)
        rule.onNodeWithTag(FORM_LIST_TAG).performScrollToNode(hasTestTag(FORM_GROUP_TAG))
        rule.onNodeWithTag(FORM_GROUP_TAG).performClick()
        awaitNode(pickerGroupTag("/$GROUP"))
        // Tapping a group chooses it, as on iOS.
        rule.onNodeWithTag(pickerGroupTag("/$GROUP")).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { rule.onAllNodesWithTag(PICKER_HERE_TAG).fetchSemanticsNodes().isEmpty() }
        rule.onNodeWithTag(FORM_SAVE_TAG).performClick()
        awaitNode(DETAIL_TITLE_TAG)

        val inGroup = runBlocking {
            val request = PassmanagerEntryPageRequest(limit = 50, offset = 0, query = "", groupPath = "/$GROUP")
            session.credentials.credentialPage(request, generation).entries.associate { it.title to it.id }
        }
        assertEquals(setOf("Jira", "GitHub"), inGroup.keys)
        assertEquals("the moved record keeps its id", loose, inGroup.getValue("GitHub"))
    }

    /** A09, the rest: the row's menu renames a group and deletes an empty one. */
    @Test
    public fun aGroupIsRenamedAndAnEmptyOneDeleted() {
        val generation = unlocked()
        runBlocking {
            session.credentials.ensureGroup("/$GROUP", generation)
            session.credentials.ensureGroup("/$SPARE", generation)
        }

        awaitNode(groupRowTag("/$GROUP"))
        rule.onNodeWithTag(groupMenuTag("/$GROUP")).performScrollTo().performClick()
        awaitNode("group-rename-/$GROUP")
        rule.onNodeWithTag("group-rename-/$GROUP").performClick()
        awaitNode(GROUP_NAME_TAG)
        rule.onNodeWithTag(GROUP_NAME_TAG).performTextReplacement(RENAMED)
        rule.onNodeWithTag(GROUP_SAVE_TAG).performClick()
        awaitNode(groupRowTag("/$RENAMED"))

        rule.onNodeWithTag(groupMenuTag("/$SPARE")).performScrollTo().performClick()
        awaitNode("group-delete-/$SPARE")
        rule.onNodeWithTag("group-delete-/$SPARE").performClick()
        awaitNode(GROUP_DELETE_CONFIRM_TAG)
        rule.onNodeWithTag(GROUP_DELETE_CONFIRM_TAG).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            rule.onAllNodesWithTag(groupRowTag("/$SPARE")).fetchSemanticsNodes().isEmpty()
        }

        val paths = runBlocking {
            session.credentials.groupPage("/", 0, generation).groups.map { it.path }
        }
        assertEquals("the renamed group and no deleted one", listOf("/$RENAMED"), paths)
    }

    private fun unlocked(): ULong {
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState { it is AirSessionState.Unlocked }
        return (session.state.value as AirSessionState.Unlocked).generation
    }

    private fun awaitNode(tag: String) {
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { rule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty() }
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
        const val GROUP = "Работа"
        const val RENAMED = "Проекты"
        const val SPARE = "Черновики"
        const val NODE_TIMEOUT_MILLIS = 10_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
