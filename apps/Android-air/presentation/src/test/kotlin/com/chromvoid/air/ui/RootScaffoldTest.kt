package com.chromvoid.air.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import com.chromvoid.air.ui.root.RootScaffold
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
public class RootScaffoldTest {
    @get:Rule
    public val rule: androidx.compose.ui.test.junit4.ComposeContentTestRule = createComposeRule()

    @Test
    public fun `a locked session reaches only the roots that hold no vault content`() {
        rule.setContent { AirTheme { RootScaffold(unlocked = false) } }

        rule.onNodeWithTag("root-connections").assertIsDisplayed()
        rule.onNodeWithTag("root-settings").assertIsDisplayed()
        assertEquals(0, rule.onAllNodesWithTagCount("root-vault"))
        assertEquals(0, rule.onAllNodesWithTagCount("root-files"))
    }

    @Test
    public fun `an unlocked session reaches every root`() {
        rule.setContent { AirTheme { RootScaffold(unlocked = true) } }

        rule.onNodeWithTag("root-vault").assertIsDisplayed()
        rule.onNodeWithTag("root-files").assertIsDisplayed()
        rule.onNodeWithTag("root-connections").assertIsDisplayed()
        rule.onNodeWithTag("root-settings").assertIsDisplayed()
    }
}

private fun androidx.compose.ui.test.junit4.ComposeContentTestRule.onAllNodesWithTagCount(
    tag: String,
): Int = onAllNodes(androidx.compose.ui.test.hasTestTag(tag)).fetchSemanticsNodes().size
