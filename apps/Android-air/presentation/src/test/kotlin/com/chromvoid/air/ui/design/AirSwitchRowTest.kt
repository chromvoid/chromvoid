package com.chromvoid.air.ui.design

import androidx.activity.ComponentActivity
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.click
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import com.chromvoid.air.ui.AirTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class AirSwitchRowTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    @Test
    public fun `the labelled row is the only switch action and its whole surface toggles`() {
        val checked = mutableStateOf(false)
        var changes = 0
        rule.setContent {
            AirTheme {
                AirSwitchRow("Lock when leaving", checked.value, {
                    checked.value = it
                    changes++
                })
            }
        }

        rule.onAllNodes(
            SemanticsMatcher.keyIsDefined(SemanticsProperties.ToggleableState),
            useUnmergedTree = true,
        ).assertCountEquals(1)
        rule.onAllNodes(hasClickAction(), useUnmergedTree = true).assertCountEquals(1)
        rule.onNodeWithText("Lock when leaving")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Switch))
            .assertIsOff()
            .performClick()
            .assertIsOn()
            .performTouchInput { click(Offset(1f, centerY)) }
            .assertIsOff()
        assertEquals(2, changes)
    }

    @Test
    public fun `a disabled switch row exposes its name and state without accepting a tap`() {
        var changes = 0
        rule.setContent {
            AirTheme { AirSwitchRow("Require device authentication", false, { changes++ }, enabled = false) }
        }

        rule.onNodeWithText("Require device authentication")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Switch))
            .assertIsNotEnabled()
            .assertIsOff()
            .performTouchInput { click() }
        assertEquals(0, changes)
    }
}
