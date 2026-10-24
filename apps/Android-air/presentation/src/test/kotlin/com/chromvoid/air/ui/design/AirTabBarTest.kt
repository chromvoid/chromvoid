package com.chromvoid.air.ui.design

import androidx.activity.ComponentActivity
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Density
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.root.AirRoot
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w360dp-h800dp")
public class AirTabBarTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    @Test
    public fun `English tabs keep their complete names and selection at larger type`() {
        checkRootTabs()
    }

    @Test
    @Config(qualifiers = "ru-rRU-w360dp-h800dp")
    public fun `Russian tabs keep their complete names and selection at larger type`() {
        checkRootTabs()
    }

    @Test
    public fun `a shortened visible label retains the whole destination name in semantics`() {
        val tabs = rootTabs().toMutableList()
        val name = "A destination with a name that needs more than two lines at larger type"
        tabs[1] = AirTab(name, tabs[1].icon, tabs[1].tag)
        setTabs(tabs)

        rule.onNodeWithTag(tabs[1].tag)
            .assertTextEquals(name)
            .assertIsDisplayed()
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Tab))
            .assertIsNotSelected()
            .performClick()
            .assertIsSelected()
    }

    private fun checkRootTabs() {
        val tabs = rootTabs()
        setTabs(tabs)

        tabs.forEach { tab ->
            rule.onNodeWithTag(tab.tag)
                .assertTextEquals(tab.label)
                .assertIsDisplayed()
                .assert(hasClickAction())
                .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Tab))
        }
        rule.onNodeWithTag(tabs.first().tag).assertIsSelected()
        rule.onNodeWithTag(tabs.last().tag)
            .assertIsNotSelected()
            .performClick()
            .assertIsSelected()
        rule.onNodeWithTag(tabs.first().tag).assertIsNotSelected()
    }

    private fun rootTabs(): List<AirTab> = AirRoot.entries.map {
        AirTab(rule.activity.getString(it.labelRes), it.icon, "root-${it.name.lowercase()}")
    }

    private fun setTabs(tabs: List<AirTab>) {
        val selected = mutableIntStateOf(0)
        rule.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale = 1.3f)) {
                AirTheme {
                    AirTabBar(tabs, selected.intValue, { selected.intValue = it })
                }
            }
        }
    }
}
