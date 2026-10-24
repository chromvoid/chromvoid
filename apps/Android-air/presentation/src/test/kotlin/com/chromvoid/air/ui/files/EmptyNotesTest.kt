package com.chromvoid.air.ui.files

import androidx.activity.ComponentActivity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.ui.AirTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class EmptyNotesTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    @Test
    public fun `empty Notes offers a named create action in the current folder`() {
        val files = show(FakeFileStore().apply { folder("Trips") })
        rule.onNodeWithTag(fileRowTag("Trips")).performClick()
        rule.onNodeWithTag(FILES_NOTES_TAG).performClick()

        rule.onNodeWithText("New note")
            .assertIsDisplayed()
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
            .assert(hasAnyAncestor(hasTestTag(FILES_EMPTY_TAG)))
            .performClick()

        assertNotNull(files.note.value)
        assertEquals("/Trips", files.note.value?.parent)
        rule.onNodeWithTag(NOTE_NAME_TAG).assertIsDisplayed().performTextInput("Packing")
        rule.onNodeWithTag(NOTE_TEXT_TAG).performTextInput("Passport")
        rule.onNodeWithTag(NOTE_SAVE_TAG).performClick()
        rule.onNodeWithTag(fileRowTag("Packing.md")).assertIsDisplayed()
        assertTrue(files.top.state.value.notesOnly)
    }

    @Test
    public fun `a note search with no matches offers no create action`() {
        show(FakeFileStore())
        rule.onNodeWithTag(FILES_NOTES_TAG).performClick()
        rule.onNodeWithTag(FILES_SEARCH_TAG).performTextInput("missing")

        rule.onNodeWithTag(FILES_EMPTY_TAG).assertIsDisplayed()
        rule.onNodeWithText("Try another search.").assertIsDisplayed()
        rule.onNode(hasAnyAncestor(hasTestTag(FILES_EMPTY_TAG)) and
            SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button)).assertDoesNotExist()
    }

    @Test
    public fun `Core read-only refusal explains why and preserves the note draft`() {
        val store = FakeFileStore()
        val files = show(store)
        rule.onNodeWithTag(FILES_NOTES_TAG).performClick()
        rule.onNodeWithText("New note").performClick()
        rule.onNodeWithTag(NOTE_NAME_TAG).performTextInput("Packing")
        rule.onNodeWithTag(NOTE_TEXT_TAG).performTextInput("Passport")
        store.failNext = CoreRefusal("ACCESS_DENIED", "file_create_note")

        rule.onNodeWithTag(NOTE_SAVE_TAG).performClick()

        rule.onNodeWithTag(NOTE_ISSUE_TAG)
            .assertIsDisplayed().assertTextContains("This vault does not allow new notes. Your draft is kept.")
        rule.onNodeWithTag(NOTE_NAME_TAG).assertTextContains("Packing")
        rule.onNodeWithTag(NOTE_TEXT_TAG).assertTextContains("Passport")
        assertEquals(FileIssue.DENIED, files.note.value?.state?.value?.refusal)
        assertTrue(store.nodes.isEmpty())
    }

    private fun show(store: FakeFileStore): FilesScope {
        val files = FilesScope(
            store, generation = 1uL, settings = FileSettings(MemoryFilePreferences()), searchDelayMillis = 0,
        )
        rule.setContent { AirTheme { FilesRoot(files) } }
        rule.waitForIdle()
        return files
    }
}
