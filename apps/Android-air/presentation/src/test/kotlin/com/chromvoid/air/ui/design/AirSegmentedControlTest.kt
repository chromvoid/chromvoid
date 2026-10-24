package com.chromvoid.air.ui.design

import androidx.activity.ComponentActivity
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.chromvoid.air.ui.AirTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w393dp-h852dp-xxhdpi")
public class AirSegmentedControlTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    @Test
    public fun `segments have names radio roles a group and one selected choice in reading order`() {
        val selected = mutableIntStateOf(0)
        val labels = listOf("All files", "Notes")
        rule.setContent {
            AirTheme { AirSegmentedControl(segments(labels), selected.intValue, { selected.intValue = it }) }
        }
        rule.onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsProperties.SelectableGroup)).assertCountEquals(1)
        for ((index, label) in labels.withIndex()) {
            rule.onNodeWithTag("segment-$index").assertTextEquals(label)
                .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.RadioButton))
        }
        rule.onNodeWithTag("segment-0").assertIsSelected()
        rule.onNodeWithTag("segment-1").assertIsNotSelected().performClick().assertIsSelected()
        rule.onNodeWithTag("segment-0").assertIsNotSelected()
        assertEquals(1, selected.intValue)
        val ordered = rule.onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsProperties.Selected))
            .fetchSemanticsNodes().map { it.config[SemanticsProperties.TestTag] }
        assertEquals(listOf("segment-0", "segment-1"), ordered)
        assertIndependentTargets(2)
    }

    @Test
    public fun `disabled segments retain their names and selection without invoking commands`() {
        var calls = 0
        rule.setContent {
            AirTheme { AirSegmentedControl(segments(listOf("Preview", "Source")), 1, { calls++ }, enabled = false) }
        }
        rule.onNodeWithTag("segment-0").assertIsNotEnabled().performClick()
        rule.onNodeWithTag("segment-1").assertTextEquals("Source").assertIsSelected().assertIsNotEnabled()
        assertEquals(0, calls)
    }

    @Test
    @Config(qualifiers = "w360dp-h800dp-xxhdpi")
    public fun `three fee targets remain independent on a compact phone with large text`() {
        withLargeText { showFeeTargets(listOf("Slow", "Standard", "Fast")) }
    }

    @Test
    @Config(qualifiers = "ru-rRU-w360dp-h800dp-xxhdpi")
    public fun `Russian fee targets remain independent on a compact phone with large text`() {
        withLargeText { showFeeTargets(listOf("Низкая", "Обычная", "Высокая")) }
    }

    @Test
    @Config(qualifiers = "w393dp-h852dp-night-xxhdpi")
    public fun `dark segments retain selected state and independent targets`() {
        showFeeTargets(listOf("Slow", "Standard", "Fast"))
    }

    private fun showFeeTargets(labels: List<String>) {
        rule.setContent { AirTheme { AirSegmentedControl(segments(labels), 1, {}) } }
        rule.onNodeWithTag("segment-1").assertIsSelected()
        assertIndependentTargets(labels.size)
    }

    private fun withLargeText(check: () -> Unit) {
        val fontScale = RuntimeEnvironment.getFontScale()
        try {
            RuntimeEnvironment.setFontScale(1.3f)
            check()
        } finally {
            RuntimeEnvironment.setFontScale(fontScale)
        }
    }

    private fun segments(labels: List<String>): List<AirSegment> =
        labels.mapIndexed { index, label -> AirSegment(label, "segment-$index") }

    private fun assertIndependentTargets(count: Int) {
        val minimum = with(rule.density) { 48.dp.toPx() }
        val nodes = (0 until count).map { rule.onNodeWithTag("segment-$it").fetchSemanticsNode() }
        for (node in nodes) {
            val bounds = node.touchBoundsInRoot
            assertTrue("Touch width must be at least 48dp: $bounds", bounds.width >= minimum)
            assertTrue("Touch height must be at least 48dp: $bounds", bounds.height >= minimum)
        }
        for (index in nodes.indices) {
            for (other in index + 1 until nodes.size) {
                assertFalse("Segments must not overlap", nodes[index].touchBoundsInRoot.overlaps(
                    nodes[other].touchBoundsInRoot,
                ))
            }
        }
    }
}
