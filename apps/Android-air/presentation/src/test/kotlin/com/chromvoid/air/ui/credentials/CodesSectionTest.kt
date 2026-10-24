package com.chromvoid.air.ui.credentials

import androidx.activity.ComponentActivity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import com.chromvoid.air.bridge.CoreRefusal
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

/** A failed read of the codes is said on both screens, never drawn as a record without codes. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class CodesSectionTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    @After
    public fun close() {
        scope.cancel()
    }

    private fun failing(): CodesModel {
        val store = FakeCredentialStore(emptyList())
        store.failWith = CoreRefusal("INTERNAL", "passmanager:otp:records")
        return CodesModel("mail", store, 1uL, scope, FakeClipboard(), null)
    }

    @Test
    public fun `the record page says the codes could not be read`() {
        val model = failing()
        rule.setContent { AirTheme { androidx.compose.foundation.layout.Column { CodesPageSection(model) } } }
        rule.waitForIdle()
        rule.onNodeWithTag(CODES_FAILED_TAG).assertIsDisplayed()
        assertRetry()
    }

    @Test
    public fun `the code manager says the codes could not be read`() {
        val model = failing()
        rule.setContent { AirTheme { CodesManagerScreen(model, onDone = {}) } }
        rule.waitForIdle()
        rule.onNodeWithTag(CODES_FAILED_TAG).assertIsDisplayed()
        assertRetry()
    }

    private fun assertRetry() {
        rule.onNodeWithTag(CODES_RETRY_TAG).assertIsDisplayed()
            .assertTextEquals(rule.activity.getString(R.string.vault_try_again))
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
    }
}
