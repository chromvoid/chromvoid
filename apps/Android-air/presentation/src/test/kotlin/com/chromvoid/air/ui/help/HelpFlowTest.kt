package com.chromvoid.air.ui.help

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.chromvoid.air.ui.AirTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class HelpFlowTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    @Test
    public fun `a topic opens from the list and back returns to the list`() {
        var closed = 0
        rule.setContent { AirTheme { HelpFlow(onClose = { closed++ }) } }

        rule.onNodeWithTag(HELP_SCREEN_TAG).assertIsDisplayed()
        rule.onNodeWithTag(helpTopicTag(HelpTopic.BACKUPS)).performClick()
        rule.onNodeWithTag(helpDetailTag(HelpTopic.BACKUPS)).assertIsDisplayed()

        rule.onNodeWithTag(HELP_BACK_TAG).performClick()
        rule.onNodeWithTag(HELP_SCREEN_TAG).assertIsDisplayed()
        assertEquals(0, closed)

        rule.onNodeWithTag(HELP_BACK_TAG).performClick()
        assertEquals(1, closed)
    }

    @Test
    public fun `help opened at a topic closes from that topic`() {
        var closed = false
        rule.setContent { AirTheme { HelpFlow(onClose = { closed = true }, start = HelpTopic.STORAGE) } }

        rule.onNodeWithTag(helpDetailTag(HelpTopic.STORAGE)).assertIsDisplayed()
        assertFalse(closed)
        rule.onNodeWithTag(HELP_BACK_TAG).performClick()
        assertTrue(closed)
    }

    @Test
    public fun `system back goes up one level`() {
        var closed = false
        rule.setContent { AirTheme { HelpFlow(onClose = { closed = true }) } }
        rule.onNodeWithTag(helpTopicTag(HelpTopic.PASSWORDS)).performClick()
        rule.waitForIdle()

        rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }
        rule.onNodeWithTag(HELP_SCREEN_TAG).assertIsDisplayed()
        assertFalse(closed)
    }
}
