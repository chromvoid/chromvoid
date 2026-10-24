package com.chromvoid.air.ui.design

import androidx.activity.ComponentActivity
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.chromvoid.air.ui.AirTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class AirFeedbackTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    @Test
    public fun `a busy command retains its name and reports its state as one button`() {
        showBusyCommand("Open vault")
        assertBusyCommand("Open vault", "In progress")
    }

    @Test
    @Config(qualifiers = "ru-rRU-w411dp-h891dp")
    public fun `the busy state is localized in Russian`() {
        showBusyCommand("Открыть хранилище")
        assertBusyCommand("Открыть хранилище", "Выполняется")
    }

    @Test
    public fun `a finished command loses the busy state and accepts another action`() {
        val busy = mutableStateOf(true)
        var commands = 0
        rule.setContent {
            AirTheme { PrimaryButton("Save", { commands++ }, busy = busy.value) }
        }

        rule.onNodeWithText("Save").assertIsNotEnabled()
        rule.runOnIdle { busy.value = false }
        rule.onNodeWithText("Save")
            .assertIsEnabled()
            .assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.StateDescription))
            .performClick()
        assertEquals(1, commands)
    }

    @Test
    public fun `a short result is one polite live announcement`() {
        val result = mutableStateOf("Copied")
        rule.setContent {
            AirTheme { AirToast(result.value, Icons.Rounded.Check, tag = "result") }
        }

        rule.onNodeWithTag("result")
            .assertTextEquals("Copied")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
        rule.runOnIdle { result.value = "Saved" }
        rule.onNodeWithTag("result").assertTextEquals("Saved")
        rule.onAllNodes(
            SemanticsMatcher.keyIsDefined(SemanticsProperties.LiveRegion),
            useUnmergedTree = true,
        ).assertCountEquals(1)
    }

    private fun showBusyCommand(text: String) {
        rule.setContent {
            AirTheme { PrimaryButton(text, {}, Modifier.testTag("command"), busy = true) }
        }
    }

    private fun assertBusyCommand(text: String, state: String) {
        rule.onNodeWithTag("command")
            .assertTextEquals(text)
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, state))
            .assertIsNotEnabled()
        // The spinner is decorative: the button already names the work and its status.
        rule.onAllNodes(
            SemanticsMatcher.keyIsDefined(SemanticsProperties.ProgressBarRangeInfo),
            useUnmergedTree = true,
        ).assertCountEquals(0)
    }
}
