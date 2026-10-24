package com.chromvoid.air.ui.maintenance

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
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
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w411dp-h891dp")
public class StorageRestoreScreenTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    @After
    public fun close() {
        scope.cancel()
    }

    @Test
    public fun `review shows the checked folder before confirming restore`() {
        val store = object : RestoreStore {
            override suspend fun beginRestore(generation: ULong): RestoreRun = object : RestoreRun {
                override val artifacts: List<RestoreArtifact> = emptyList()
                override val chunkBytes: Int = 3
                override suspend fun append(artifact: Int, bytes: ByteArray): Unit = error("no artifacts")
                override suspend fun review(masterPassword: String): RestorePreview = RestorePreview(7)
                override suspend fun commit(): Unit = error("the screen must wait for confirmation")
                override fun cancel() = Unit
                override suspend fun close() = Unit
            }
        }
        val folder = object : RestoreSource {
            override val label: String = "chromvoid-backup-2"
            override suspend fun open(artifacts: List<RestoreArtifact>): Long = 0
            override suspend fun read(artifact: Int, maximum: Int): ByteArray? = error("no artifacts")
            override suspend fun close() = Unit
        }
        val model = StorageRestoreModel(store, 1uL, scope)
        rule.setContent { AirTheme { StorageRestoreScreen(model, onDismiss = {}) } }

        rule.runOnIdle {
            model.chooseSource(folder)
            model.changePassword("synthetic administrator password")
            model.submit()
        }
        rule.waitForIdle()

        rule.onNodeWithTag(RESTORE_REVIEW_SOURCE_TAG).assertIsDisplayed().assertTextContains(folder.label)
        rule.onNodeWithTag(RESTORE_CONFIRM_TAG).assertIsDisplayed()
        rule.onNodeWithTag(RESTORE_PASSWORD_TAG).assertDoesNotExist()
    }
}
