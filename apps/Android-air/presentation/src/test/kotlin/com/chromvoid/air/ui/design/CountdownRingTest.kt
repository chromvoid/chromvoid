package com.chromvoid.air.ui.design

import androidx.activity.ComponentActivity
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import com.chromvoid.air.ui.AirTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class CountdownRingTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    @Test
    public fun `the countdown names its remaining seconds with English plurals without live announcements`() {
        checkCountdowns(
            listOf(
                1L to "Expires in 1 second",
                2L to "Expires in 2 seconds",
                null to "Code is updating",
                0L to "Expires in 0 seconds",
            ),
        )
    }

    @Test
    @Config(qualifiers = "ru-rRU-w411dp-h891dp")
    public fun `the countdown names its remaining seconds with Russian plurals without live announcements`() {
        checkCountdowns(
            listOf(
                1L to "Истекает через 1 секунду",
                2L to "Истекает через 2 секунды",
                5L to "Истекает через 5 секунд",
                11L to "Истекает через 11 секунд",
                21L to "Истекает через 21 секунду",
                null to "Код обновляется",
                0L to "Истекает через 0 секунд",
            ),
        )
    }

    private fun checkCountdowns(expected: List<Pair<Long?, String>>) {
        val seconds = mutableStateOf(expected.first().first)
        rule.setContent {
            AirTheme { CountdownRing(seconds.value, 30, Modifier.testTag("countdown")) }
        }
        val nodeId = rule.onNodeWithTag("countdown").fetchSemanticsNode().id
        expected.forEach { (remaining, description) ->
            rule.runOnIdle { seconds.value = remaining }
            rule.onNodeWithTag("countdown", useUnmergedTree = true)
                .assertContentDescriptionEquals(description)
                .assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Text))
            assertEquals(nodeId, rule.onNodeWithTag("countdown").fetchSemanticsNode().id)
            rule.onAllNodes(
                SemanticsMatcher.keyIsDefined(SemanticsProperties.LiveRegion),
                useUnmergedTree = true,
            ).assertCountEquals(0)
        }
    }
}
