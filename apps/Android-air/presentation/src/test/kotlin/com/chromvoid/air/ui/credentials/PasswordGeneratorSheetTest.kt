package com.chromvoid.air.ui.credentials

import androidx.activity.ComponentActivity
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipe
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.credentials.FakeCredentialStore.Companion.summary
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class PasswordGeneratorSheetTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    private val store = FakeCredentialStore(listOf(summary("mail", "Mail")))
    private var used: String? = null

    private fun show(): PasswordGeneratorModel {
        val model = PasswordGeneratorModel(
            store,
            generation = 1uL,
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Main),
        ) { used = it }
        rule.setContent { AirTheme { PasswordGeneratorSheet(model, onDismiss = {}) } }
        return model
    }

    private fun awaitNode(tag: String) {
        rule.waitForIdle()
        rule.onNodeWithTag(tag).assertExists()
    }

    private fun lengthSlider(): SemanticsNodeInteraction {
        val ranges = rule.onAllNodes(
            SemanticsMatcher.keyIsDefined(SemanticsProperties.ProgressBarRangeInfo),
            useUnmergedTree = true,
        ).assertCountEquals(1)
        // Peer modifiers can collapse in Compose tests; require the boundary that hides Material's inner semantics.
        return ranges[0]
            .assert(SemanticsMatcher("clears internal Material slider semantics") { it.config.isClearingSemantics })
            .assert(SemanticsMatcher.keyIsDefined(SemanticsActions.SetProgress))
    }

    @Test
    public fun `generate shows a hidden candidate that Show reveals and Use hands over`() {
        show()

        rule.onNodeWithTag(GENERATOR_RUN_TAG).performClick()
        awaitNode(GENERATOR_VALUE_TAG)

        // The candidate is on screen but not readable until asked for.
        rule.onNodeWithTag(GENERATOR_VALUE_TAG).assertIsDisplayed()
        rule.onNodeWithText("generated-20").assertDoesNotExist()
        rule.onNodeWithTag(GENERATOR_REVEAL_TAG).performClick()
        rule.onNodeWithText("generated-20").assertIsDisplayed()

        rule.onNodeWithTag(GENERATOR_USE_TAG).performClick()
        assertEquals("generated-20", used)
    }

    @Test
    public fun `a character type is one named switch whose label toggles it`() {
        val model = show()

        rule.onNodeWithTag(generatorTypeTag("symbols"))
            .assertTextContains("Symbols (!@#)")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Switch))
            .assertIsOff()
        rule.onNodeWithText("Symbols (!@#)").performClick()
        rule.onNodeWithTag(generatorTypeTag("symbols")).assertIsOn()
        assertEquals(true, model.state.value.settings.symbols)
    }

    @Test
    public fun `length slider is one named range with an integer value and changes by one character`() {
        val model = show()
        val slider = lengthSlider()

        slider
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf("Password length")))
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "20"))
            .assert(SemanticsMatcher.expectValue(
                SemanticsProperties.ProgressBarRangeInfo,
                ProgressBarRangeInfo(20f, 4f..128f, steps = 123),
            ))

        // TalkBack uses the range steps for its increase and decrease actions.
        for (length in listOf(21, 20)) {
            slider.performSemanticsAction(SemanticsActions.SetProgress) { setProgress ->
                assertTrue(setProgress(length.toFloat()))
            }
            rule.waitForIdle()
            assertEquals(length, model.state.value.settings.length)
            slider.assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, length.toString()))
        }

        slider.performSemanticsAction(SemanticsActions.SetProgress) { setProgress ->
            assertTrue(setProgress(20.6f))
        }
        rule.waitForIdle()
        assertEquals(21, model.state.value.settings.length)
        slider.assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "21"))

        slider.performSemanticsAction(SemanticsActions.SetProgress) { setProgress ->
            assertFalse(setProgress(21.4f))
        }
        for ((requested, length) in listOf(0f to 4, 129f to 128)) {
            slider.performSemanticsAction(SemanticsActions.SetProgress) { setProgress ->
                assertTrue(setProgress(requested))
            }
            rule.waitForIdle()
            assertEquals(length, model.state.value.settings.length)
            slider.assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, length.toString()))
        }
        slider.performSemanticsAction(SemanticsActions.SetProgress) { setProgress ->
            assertFalse(setProgress(129f))
        }
    }

    @Test
    @Config(qualifiers = "ru-rRU-w411dp-h891dp")
    public fun `length slider localizes its name in Russian and keeps an integer value`() {
        show()
        lengthSlider()
            .assert(SemanticsMatcher.expectValue(
                SemanticsProperties.ContentDescription,
                listOf("Длина пароля"),
            ))
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "20"))
    }

    @Test
    public fun `dragging the length slider changes the setting and drops the old candidate`() {
        val model = show()
        rule.onNodeWithTag(GENERATOR_RUN_TAG).performClick()
        awaitNode(GENERATOR_VALUE_TAG)

        val slider = lengthSlider()
        slider.performTouchInput {
            swipe(start = Offset(width * 0.25f, centerY), end = Offset(width * 0.75f, centerY))
        }
        rule.waitForIdle()

        val length = model.state.value.settings.length
        assertTrue(length > PasswordGeneratorModel.DEFAULT_LENGTH)
        slider.assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, length.toString()))
        rule.onNodeWithTag(GENERATOR_VALUE_TAG).assertDoesNotExist()
        assertNull(model.state.value.password)
    }

    @Test
    public fun `turning every character type off explains instead of generating`() {
        show()

        // Symbols start off, as on iOS; the other three are turned off here.
        rule.onNodeWithTag(generatorTypeTag("symbols")).assertIsOff()
        listOf("lowercase", "uppercase", "digits").forEach { type ->
            rule.onNodeWithTag(generatorTypeTag(type)).assertIsOn().performClick()
        }
        rule.onNodeWithTag(GENERATOR_RUN_TAG).performClick()
        awaitNode(GENERATOR_ISSUE_TAG)

        rule.onNodeWithTag(GENERATOR_ISSUE_TAG).assertIsDisplayed()
        rule.onNodeWithTag(GENERATOR_VALUE_TAG).assertDoesNotExist()
        assertNull(used)
    }
}
