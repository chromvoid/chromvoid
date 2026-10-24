package com.chromvoid.air.ui.maintenance

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.AirTheme
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w360dp-h800dp")
public class AdoptionMaintenanceScreenTest {
    @get:Rule
    public val rule: androidx.compose.ui.test.junit4.ComposeContentTestRule = createComposeRule()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    @After
    public fun close() {
        scope.cancel()
    }

    @Test
    public fun `erase refusal asks to finish transfer instead of showing a generic failure`() {
        val store = object : EraseStore {
            override suspend fun reviewErase(generation: ULong): EraseReview =
                throw BridgeException.AdoptionActionForbidden()
        }
        val model = StorageEraseModel(store, 1uL, scope)
        rule.setContent { AirTheme { StorageEraseScreen(model, onDismiss = {}) } }

        rule.runOnIdle { model.prepare() }

        assertTransferRequired(ERASE_ISSUE_TAG)
        rule.onNodeWithTag(ERASE_SUBMIT_TAG).assertDoesNotExist()
    }

    @Test
    public fun `restore refusal asks to finish transfer and keeps confirmation unavailable`() {
        val store = object : RestoreStore {
            override suspend fun beginRestore(generation: ULong): RestoreRun =
                throw BridgeException.AdoptionActionForbidden()
        }
        val source = object : RestoreSource {
            override val label: String = "Backup"
            override suspend fun open(artifacts: List<RestoreArtifact>): Long = error("must not read")
            override suspend fun read(artifact: Int, maximum: Int): ByteArray? = error("must not read")
            override suspend fun close() = Unit
        }
        val model = StorageRestoreModel(store, 1uL, scope)
        rule.setContent { AirTheme { StorageRestoreScreen(model, onDismiss = {}) } }

        rule.runOnIdle {
            model.chooseSource(source)
            model.changePassword("synthetic backup password")
            model.submit()
        }

        assertTransferRequired(RESTORE_ISSUE_TAG)
        rule.onNodeWithTag(RESTORE_CONFIRM_TAG).assertDoesNotExist()
    }

    @Test
    @Config(qualifiers = "ru-rRU-w360dp-h800dp")
    public fun `reset refusal explains unfinished transfer in Russian without crashing`() {
        val model = AppResetModel(AppReset { throw BridgeException.AdoptionActionForbidden() })
        rule.setContent { AirTheme { AppResetScreen(model, onDismiss = {}) } }

        click(APP_RESET_ACKNOWLEDGE_TAG)
        click(APP_RESET_REVIEW_TAG)
        rule.onNodeWithTag(APP_RESET_CONFIRM_TAG).performClick()

        assertTransferRequired(APP_RESET_ISSUE_TAG)
        rule.onNodeWithTag(APP_RESET_CONFIRMATION_TAG).assertDoesNotExist()
    }

    private fun click(tag: String) {
        rule.onNodeWithTag(MAINTENANCE_LIST_TAG).performScrollToNode(hasTestTag(tag))
        rule.onNodeWithTag(tag).performClick()
    }

    private fun assertTransferRequired(tag: String) {
        val context = ApplicationProvider.getApplicationContext<Context>()
        rule.onNodeWithTag(MAINTENANCE_LIST_TAG).performScrollToNode(hasTestTag(tag))
        rule.onNodeWithTag(tag).assertIsDisplayed()
            .assertTextEquals(context.getString(R.string.maintenance_issue_adoption_required))
    }
}
