package com.chromvoid.air.ui.design

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.platform.testTag
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.dispatchSystemInsets
import com.chromvoid.air.ui.root.CoversTabBar
import com.chromvoid.air.ui.root.RootScaffold
import com.chromvoid.air.ui.scrollToEnd
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class AirScreenInsetsTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    @Test
    public fun `a visible phone tab bar retains one system inset and its existing clearance`() {
        show()
        assertEndGap(24f + 48f + 96f)
    }

    @Test
    @Config(qualifiers = "w1280dp-h800dp-land")
    public fun `a tablet rail retains only one system inset`() {
        show()
        assertEndGap(24f + 48f)
    }

    @Test
    public fun `a covering screen has no floating tab bar clearance`() {
        show(covering = true)
        assertEndGap(24f + 48f)
    }

    @Test
    public fun `the keyboard consumes navigation inset without an extra gap above it`() {
        show(covering = true, modifier = Modifier.imePadding(), imeBottomDp = 240)
        assertEndGap(24f)
    }

    @Test
    public fun `an ancestor that reserves the system bar prevents a duplicate list inset`() {
        show(covering = true, modifier = Modifier.navigationBarsPadding())
        assertEndGap(24f)
    }

    private fun show(covering: Boolean = false, modifier: Modifier = Modifier, imeBottomDp: Int = 0) {
        rule.setContent {
            AirTheme {
                RootScaffold(unlocked = true, vault = {
                    if (covering) CoversTabBar()
                    AirScreen("Entries", modifier = modifier, listTag = "list") {
                        items(80) { index -> Text("Entry $index", modifier = Modifier.testTag("row-$index")) }
                        item { TabBarClearance() }
                    }
                })
            }
        }
        rule.dispatchSystemInsets(imeBottomDp = imeBottomDp)
        rule.onNodeWithTag("list").scrollToEnd()
    }

    private fun assertEndGap(expectedDp: Float) {
        val viewport = rule.onNodeWithTag("list").getUnclippedBoundsInRoot()
        val last = rule.onNodeWithTag("row-79").getUnclippedBoundsInRoot()
        assertEquals("gap after the final row", expectedDp, viewport.bottom.value - last.bottom.value, 1f)
    }
}
