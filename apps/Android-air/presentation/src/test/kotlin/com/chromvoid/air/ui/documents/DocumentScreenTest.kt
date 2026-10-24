package com.chromvoid.air.ui.documents

import androidx.activity.ComponentActivity
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.click
import androidx.compose.ui.test.isToggleable
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.performTouchInput
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.files.FakeFileStore
import com.chromvoid.air.ui.files.FileDestination
import com.chromvoid.air.ui.files.FileDevice
import com.chromvoid.air.ui.files.FileSettings
import com.chromvoid.air.ui.files.FileSource
import com.chromvoid.air.ui.files.MemoryFilePreferences
import com.chromvoid.air.ui.files.MemorySource
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Routes A27–A28 over the document screen: source edits, the preview, conflicts, closing and links. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class DocumentScreenTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    private val markdown = FakeMarkdown()
    private var closed = 0

    private fun FakeFileStore.note(name: String, text: String): FakeFileStore.Node =
        file(name, text.encodeToByteArray(), mimeType = if (name.endsWith(".md")) "text/markdown" else "text/plain")

    private val settings = FileSettings(MemoryFilePreferences())

    private fun show(store: FakeFileStore, name: String): DocumentNavigator {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
        val navigator = DocumentNavigator(store, store.named(name).id, 1uL, scope) { id, anchor ->
            DocumentModel(
                store,
                id,
                1uL,
                scope,
                anchor,
                parse = markdown::parse,
                toggle = markdown::toggle,
                settings = settings,
            )
        }
        val device = object : FileDevice {
            override fun source(document: android.net.Uri): FileSource = error("no picker in this test")

            override fun openImageNow(document: android.net.Uri): FileSource? = null

            override fun destination(document: android.net.Uri): FileDestination = error("no export in this test")

            override fun destination(folder: android.net.Uri, name: String, mimeType: String?): FileDestination =
                error("no export in this test")

            override fun gallery(name: String, mimeType: String?): FileDestination? = null
        }
        rule.setContent {
            AirTheme { DocumentScreen(navigator, onClose = { closed++ }, onLock = {}, device = device) }
        }
        rule.waitForIdle()
        return navigator
    }

    private fun exists(tag: String): Boolean = rule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()

    @Test
    @Config(qualifiers = "ru-w360dp-h800dp")
    public fun `a document exposes its complete heading with translated save and lock actions`() {
        val name = "План путешествия и список вещей.md"
        val store = FakeFileStore().apply { note(name, "Packing") }
        show(store, name)

        rule.onNodeWithText(name)
            .assertIsDisplayed()
            .assert(SemanticsMatcher.keyIsDefined(SemanticsProperties.Heading))
        rule.onNodeWithTag(DOCUMENT_SAVE_TAG).assertTextContains("Сохранить")
        rule.onNodeWithContentDescription("Закрыть хранилище").assertIsDisplayed()
    }

    @Test
    public fun `a text document is edited as its source and saved`() {
        val store = FakeFileStore().apply { note("todo.txt", "milk") }
        show(store, "todo.txt")

        rule.onNodeWithTag(DOCUMENT_SOURCE_TAG).assertTextContains("milk")
        rule.onNodeWithTag(DOCUMENT_SOURCE_TAG).performTextReplacement("milk, eggs")
        rule.onNodeWithText("Unsaved changes").assertIsDisplayed()
        rule.onNodeWithTag(DOCUMENT_SAVE_TAG).performClick()
        rule.waitForIdle()

        rule.onNodeWithTag(DOCUMENT_SAVED_TAG).assertIsDisplayed()
        assertEquals("milk, eggs", store.named("todo.txt").content.decodeToString())
    }

    @Test
    public fun `a note opens in its preview and a task ticks into the source`() {
        val store = FakeFileStore().apply { note("List.md", "# Trip\n- [ ] milk") }
        show(store, "List.md")

        rule.onNodeWithTag(MARKDOWN_PREVIEW_TAG).assertIsDisplayed()
        rule.onNodeWithText("Trip").assertIsDisplayed()
        // Nodes: heading, its text, the list, the item, then the task.
        rule.onNodeWithTag(markdownTaskTag(4)).performClick()
        rule.waitForIdle()
        rule.onNodeWithText("Unsaved changes").assertIsDisplayed()

        rule.onNodeWithTag(DOCUMENT_PREVIEW_MODE_TAG).assertIsSelected()
        rule.onNodeWithTag(DOCUMENT_SOURCE_MODE_TAG)
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.RadioButton))
            .assertIsNotSelected().performClick().assertIsSelected()
        rule.onNodeWithTag(DOCUMENT_PREVIEW_MODE_TAG).assertIsNotSelected()
        rule.waitForIdle()
        rule.onNodeWithTag(DOCUMENT_SOURCE_TAG).assertTextContains("- [x] milk", substring = true)
    }

    @Test
    public fun `each task is one named checkbox and its text toggles it`() {
        val store = FakeFileStore().apply { note("List.md", "- [ ] milk\n- [x] eggs") }
        show(store, "List.md")

        rule.onAllNodes(isToggleable()).assertCountEquals(2)
        rule.onNodeWithTag(markdownTaskTag(2))
            .assertTextContains("milk")
            .assertIsOff()
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Checkbox))
        rule.onNodeWithTag(markdownTaskTag(7))
            .assertTextContains("eggs")
            .assertIsOn()
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Checkbox))

        rule.onNodeWithText("milk").performClick()
        rule.onNodeWithTag(markdownTaskTag(2)).assertIsOn()
        rule.onNodeWithText("eggs").performClick()
        rule.onNodeWithTag(markdownTaskTag(7)).assertIsOff()
        rule.onNodeWithTag(DOCUMENT_SOURCE_MODE_TAG).performClick()
        rule.onNodeWithTag(DOCUMENT_SOURCE_TAG).assertTextContains("- [x] milk\n- [ ] eggs", substring = true)
    }

    @Test
    public fun `Done with a changed draft asks before discarding it`() {
        val store = FakeFileStore().apply { note("todo.txt", "milk") }
        show(store, "todo.txt")

        rule.onNodeWithTag(DOCUMENT_CLOSE_TAG).performClick()
        rule.waitForIdle()
        assertEquals(1, closed)

        rule.onNodeWithTag(DOCUMENT_SOURCE_TAG).performTextReplacement("eggs")
        rule.onNodeWithTag(DOCUMENT_CLOSE_TAG).performClick()
        rule.waitForIdle()
        assertEquals(1, closed)
        rule.onNodeWithTag(DOCUMENT_DISCARD_TAG).performClick()
        rule.waitForIdle()
        assertEquals(2, closed)
    }

    @Test
    public fun `a conflict shows the saved version and it can replace the draft`() {
        val store = FakeFileStore().apply { note("todo.txt", "milk") }
        show(store, "todo.txt")

        rule.onNodeWithTag(DOCUMENT_SOURCE_TAG).performTextReplacement("my draft")
        store.saveElsewhere(store.named("todo.txt").id, "their change")
        rule.onNodeWithTag(DOCUMENT_SAVE_TAG).performClick()
        rule.waitForIdle()

        rule.onNodeWithTag(DOCUMENT_ISSUE_TAG).assertIsDisplayed()
        rule.onNodeWithText("my draft").assertIsDisplayed()
        rule.onNodeWithTag(DOCUMENT_SAVED_VERSION_TAG).performClick()
        rule.onNodeWithText("their change").assertIsDisplayed()

        rule.onNodeWithTag(DOCUMENT_USE_SAVED_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(DOCUMENT_SOURCE_TAG).assertTextContains("their change")
        assertTrue(!exists(DOCUMENT_USE_SAVED_TAG))
    }

    @Test
    public fun `Insert image works in a note's source and shows the import until it lands`() {
        val store = FakeFileStore().apply { note("Plan.md", "# Trip") }
        val navigator = show(store, "Plan.md")
        rule.onNodeWithTag(DOCUMENT_INSERT_IMAGE_TAG).assertIsNotEnabled()

        rule.onNodeWithTag(DOCUMENT_SOURCE_MODE_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(DOCUMENT_INSERT_IMAGE_TAG).assertIsEnabled()

        // The picker's answer, as the screen hands it over.
        var landed = false
        store.onAttachment = { landed = true }
        navigator.stack.value.single().receiveImages(listOf(MemorySource("beach.png", ByteArray(8), "image/png")))
        rule.waitForIdle()

        assertTrue(landed)
        assertTrue(!exists(DOCUMENT_IMAGE_PROGRESS_TAG))
        rule.onNodeWithTag(DOCUMENT_SOURCE_TAG).assertTextContains("![beach](/attachments/beach-", substring = true)
        rule.onNodeWithText("Unsaved changes").assertIsDisplayed()
    }

    @Test
    public fun `an image of the vault shows in its place in the preview`() {
        val store = FakeFileStore().apply {
            note("Plan.md", "# Trip\n![Beach](/attachments/beach.png)")
            file("beach.png", size = 12, parent = "/attachments", mimeType = "image/png")
            links["/attachments/beach.png"] = named("beach.png").id
        }
        show(store, "Plan.md")

        // Nodes: the heading and its text, then the paragraph and its image.
        rule.onNodeWithTag(markdownImageTag(3)).assertIsDisplayed()
        assertTrue(store.calls.contains("link:/attachments/beach.png"))
    }

    @Test
    public fun `a linked note opens over the document and Back returns to it`() {
        val store = FakeFileStore().apply {
            note("Plan.md", "[Packing list](note:Packing)")
            note("Packing.md", "# Socks")
            links["Packing"] = named("Packing.md").id
        }
        show(store, "Plan.md")

        rule.onNodeWithText("Packing list").performTouchInput { click(Offset(8f, center.y)) }
        rule.waitForIdle()
        rule.onNodeWithText("Packing.md").assertIsDisplayed()
        rule.onNodeWithText("Socks").assertIsDisplayed()

        rule.onNodeWithText("Back").assertIsDisplayed()
        rule.onNodeWithTag(DOCUMENT_CLOSE_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithText("Plan.md").assertIsDisplayed()
        assertEquals(0, closed)
    }
}
