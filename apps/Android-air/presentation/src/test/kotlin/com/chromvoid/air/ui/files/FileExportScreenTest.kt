package com.chromvoid.air.ui.files

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.activity.compose.LocalActivityResultRegistryOwner
import androidx.activity.result.ActivityResultRegistry
import androidx.activity.result.ActivityResultRegistryOwner
import androidx.activity.result.contract.ActivityResultContract
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.core.app.ActivityOptionsCompat
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.AirTheme
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** The real Activity Result boundary, with the system picker replaced by an in-memory registry. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class FileExportScreenTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private class PickerRegistry(private val context: Context) : ActivityResultRegistry() {
        var failure: RuntimeException? = null
        val launches = mutableListOf<Intent>()
        private var requestCode: Int? = null

        override fun <I, O> onLaunch(
            requestCode: Int,
            contract: ActivityResultContract<I, O>,
            input: I,
            options: ActivityOptionsCompat?,
        ) {
            this.requestCode = requestCode
            launches += contract.createIntent(context, input)
            failure?.let { throw it }
        }

        fun answer(uri: Uri?) {
            dispatchResult(
                requireNotNull(requestCode),
                if (uri == null) Activity.RESULT_CANCELED else Activity.RESULT_OK,
                uri?.let { Intent().setData(it) },
            )
        }
    }

    @After
    public fun cancelWork() {
        scope.cancel()
    }

    private fun show(model: FileExportModel, device: ExportTestDevice, registry: PickerRegistry) {
        val owner = object : ActivityResultRegistryOwner {
            override val activityResultRegistry: ActivityResultRegistry = registry
        }
        rule.setContent {
            CompositionLocalProvider(LocalActivityResultRegistryOwner provides owner) {
                AirTheme { FileExportScreen(model, device, onClose = {}, onLock = {}) }
            }
        }
    }

    @Test
    public fun `an unavailable save picker explains retry and cancelling that retry keeps the draft`() {
        val store = FakeFileStore().apply { file("Report.pdf", mimeType = "application/pdf") }
        val model = FileExportModel(store.nodes.map(store::item), store, 1uL, scope)
        val draft = model.state.value.items
        val device = ExportTestDevice()
        val registry = PickerRegistry(rule.activity).apply { failure = ActivityNotFoundException() }
        show(model, device, registry)

        rule.onNodeWithTag(EXPORT_CHOOSE_TAG).performClick()

        assertEquals(FileExportModel.PickerIssue.UNAVAILABLE, model.state.value.pickerIssue)
        rule.onNodeWithTag(EXPORT_PICKER_ISSUE_TAG)
            .assertTextEquals(rule.activity.getString(R.string.files_export_picker_unavailable))
            .assertIsDisplayed()
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
        rule.onNodeWithTag(EXPORT_CHOOSE_TAG)
            .assertTextContains("Try again")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
            .assertIsEnabled()
        rule.onNodeWithTag(exportItemTag("Report.pdf")).assertIsDisplayed()
        assertEquals(draft, model.state.value.items)
        assertTrue(store.calls.isEmpty())

        registry.failure = null
        rule.onNodeWithTag(EXPORT_CHOOSE_TAG).performClick()
        rule.onNodeWithTag(EXPORT_PICKER_ISSUE_TAG).assertDoesNotExist()
        assertEquals(2, registry.launches.size)
        val intent = registry.launches.last()
        assertEquals(Intent.ACTION_CREATE_DOCUMENT, intent.action)
        assertEquals("application/pdf", intent.type)
        assertEquals("Report.pdf", intent.getStringExtra(Intent.EXTRA_TITLE))
        rule.runOnIdle { registry.answer(null) }

        assertEquals(FileExportModel.Phase.REVIEW, model.state.value.phase)
        assertNull(model.state.value.pickerIssue)
        assertEquals(draft, model.state.value.items)
        assertTrue(device.saved.isEmpty())
        assertTrue(store.calls.isEmpty())
        rule.onNodeWithTag(EXPORT_CHOOSE_TAG).assertIsEnabled()
    }

    @Test
    public fun `a folder picker that cannot open can be retried and exports every selected file`() {
        val first = byteArrayOf(1, 2, 3)
        val second = byteArrayOf(4, 5)
        val store = FakeFileStore().apply {
            file("a.txt", first, mimeType = "text/plain")
            file("b.txt", second, mimeType = "text/plain")
        }
        val model = FileExportModel(store.nodes.map(store::item), store, 1uL, scope)
        val draft = model.state.value.items
        val device = ExportTestDevice()
        val registry = PickerRegistry(rule.activity).apply { failure = SecurityException("picker blocked") }
        show(model, device, registry)

        rule.onNodeWithTag(EXPORT_CHOOSE_TAG).performClick()

        assertEquals(FileExportModel.PickerIssue.NOT_OPENED, model.state.value.pickerIssue)
        rule.onNodeWithTag(EXPORT_PICKER_ISSUE_TAG)
            .assertTextEquals(rule.activity.getString(R.string.files_export_picker_not_opened))
            .assertIsDisplayed()
        assertEquals(draft, model.state.value.items)
        assertTrue(store.calls.isEmpty())

        registry.failure = null
        rule.onNodeWithTag(EXPORT_CHOOSE_TAG).performClick()
        assertEquals(2, registry.launches.size)
        assertTrue(registry.launches.all { it.action == Intent.ACTION_OPEN_DOCUMENT_TREE })
        val tree = Uri.parse("content://files/tree/export")
        rule.runOnIdle { registry.answer(tree) }
        rule.waitForIdle()

        rule.onNodeWithTag(EXPORT_PICKER_ISSUE_TAG).assertDoesNotExist()
        rule.onNodeWithTag(EXPORT_FINISHED_TAG).assertIsDisplayed()
        assertEquals(FileExportModel.Phase.FINISHED, model.state.value.phase)
        assertEquals(listOf(tree to "a.txt", tree to "b.txt"), device.folderDestinations)
        assertArrayEquals(first, device.saved.getValue("a.txt").written.toByteArray())
        assertArrayEquals(second, device.saved.getValue("b.txt").written.toByteArray())
        assertTrue(device.saved.values.all { it.finished })
    }

    @Test
    @Config(qualifiers = "ru-w411dp-h891dp")
    public fun `the unavailable picker explanation and retry are localized in Russian`() {
        val store = FakeFileStore().apply { file("Report.pdf", mimeType = "application/pdf") }
        val model = FileExportModel(store.nodes.map(store::item), store, 1uL, scope)
        val registry = PickerRegistry(rule.activity).apply { failure = ActivityNotFoundException() }
        show(model, ExportTestDevice(), registry)

        rule.onNodeWithTag(EXPORT_CHOOSE_TAG).performClick()

        rule.onNodeWithTag(EXPORT_PICKER_ISSUE_TAG).assertTextEquals(
            "Системный выбор места сохранения недоступен. " +
                "Выбор файлов сохранён.",
        ).assertIsDisplayed()
        rule.onNodeWithTag(EXPORT_CHOOSE_TAG).assertTextContains("Повторить").assertIsEnabled()
    }
}

/** No picker, URI grant or device storage is touched in Compose tests or survey captures. */
internal class ExportTestDevice : FileDevice {
    val saved = mutableMapOf<String, MemoryDestination>()
    val folderDestinations = mutableListOf<Pair<Uri, String>>()

    override fun source(document: Uri): FileSource = error("not used")

    override fun openImageNow(document: Uri): FileSource? = null

    override fun destination(document: Uri): FileDestination =
        MemoryDestination().also { saved["single"] = it }

    override fun destination(folder: Uri, name: String, mimeType: String?): FileDestination {
        folderDestinations += folder to name
        return MemoryDestination().also { saved[name] = it }
    }

    override fun gallery(name: String, mimeType: String?): FileDestination? = null
}
