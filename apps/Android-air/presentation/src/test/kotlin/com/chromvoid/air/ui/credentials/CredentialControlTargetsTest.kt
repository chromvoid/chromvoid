package com.chromvoid.air.ui.credentials

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.click
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.credentials.CredentialFormModel.Field
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** R12: real touch cells and accessibility nodes stay independent on a phone. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w393dp-h852dp-xxhdpi")
public class CredentialControlTargetsTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    @After
    public fun close() {
        scope.cancel()
    }

    @Test
    public fun `each tag color has its own named selectable touch cell`() {
        checkColors()
    }

    @Test
    @Config(qualifiers = "ru-rRU-w360dp-h800dp-xxhdpi")
    public fun `tag color touch cells remain separate on a compact Russian phone`() {
        checkColors(fontScale = 1.3f)
    }

    private fun checkColors(fontScale: Float = 1f) {
        val store = FakeCredentialStore()
        val model = TagsModel(store, generation = 1uL, scope = scope)
        rule.setContent {
            AirTheme {
                CompositionLocalProvider(LocalDensity provides Density(LocalDensity.current.density, fontScale)) {
                    TagsSheet(model, assigning = false, onChoose = {}, onDone = {}, onDismiss = {})
                }
            }
        }
        rule.waitForIdle()
        rule.onNodeWithTag(TAGS_NEW_TAG).performClick()

        val names = listOf(
            R.string.color_violet,
            R.string.color_green,
            R.string.color_blue,
            R.string.color_pink,
            R.string.color_amber,
            R.string.color_orange,
            R.string.color_cyan,
        )
        TagsModel.COLORS.zip(names).forEach { (id, name) ->
            rule.onNodeWithTag(tagColorTag(id))
                .assertContentDescriptionEquals(rule.activity.getString(name))
                .assertHasClickAction()
                .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.RadioButton))
        }
        assertIndependentTargets(TagsModel.COLORS.map(::tagColorTag))
        rule.onNodeWithTag(tagColorTag("violet")).assertIsSelected()
        // The empty corner belongs to this cell, as well as its visible circle.
        rule.onNodeWithTag(tagColorTag("cyan")).performTouchInput { click(Offset(1f, 1f)) }
        rule.onNodeWithTag(tagColorTag("cyan")).assertIsSelected()
        rule.onNodeWithTag(tagColorTag("violet")).assertIsNotSelected()
        rule.onNodeWithTag(TAG_LABEL_TAG).performTextInput("Travel")
        rule.onNodeWithTag(TAG_SAVE_TAG).performClick()
        rule.runOnIdle { assertEquals("Travel" to "cyan", store.tags.values.single()) }
    }

    @Test
    public fun `on-card inputs own independent named touch cells and keep keyboard progression`() {
        checkCardInputs()
    }

    @Test
    @Config(qualifiers = "w360dp-h800dp-xxhdpi")
    public fun `on-card input targets do not overlap at compact width with larger text and a full year`() {
        checkCardInputs(fontScale = 1.3f)
    }

    @Test
    @Config(qualifiers = "ru-rRU-w360dp-h800dp-xxhdpi")
    public fun `localized on-card inputs keep independent touch targets on a compact phone`() {
        checkCardInputs(fontScale = 1.3f)
    }

    private fun checkCardInputs(fontScale: Float = 1f) {
        val model = CredentialFormModel.create(
            CredentialFormModel.Kind.CARD,
            FakeCredentialStore(),
            generation = 1uL,
            scope = scope,
            prefill = mapOf(
                Field.CARD_NUMBER to "4111111111111111",
                Field.CARDHOLDER to "ALICE MILLER",
                Field.CARD_CODE to "123",
                Field.MONTH to "12",
                Field.YEAR to "2031",
            ),
            cards = FakeCardRules,
        ) {}
        rule.setContent {
            AirTheme {
                CompositionLocalProvider(LocalDensity provides Density(LocalDensity.current.density, fontScale)) {
                    CredentialFormScreen(model, onDismiss = {}, onDiscard = {})
                }
            }
        }
        val fields = listOf(
            Field.CARD_NUMBER to R.string.form_card_number,
            Field.CARDHOLDER to R.string.form_cardholder,
            Field.CARD_CODE to R.string.form_card_code,
            Field.MONTH to R.string.form_month,
            Field.YEAR to R.string.form_year,
        )
        fields.forEach { (field, label) ->
            rule.onNodeWithTag(formFieldTag(field))
                .assert(hasSetTextAction())
                .assertContentDescriptionEquals(rule.activity.getString(label))
        }
        assertIndependentTargets(fields.map { formFieldTag(it.first) })
        fields.forEach { (field, _) ->
            rule.onNodeWithTag(formFieldTag(field)).performTouchInput { click(Offset(1f, 1f)) }
                .assertIsFocused()
        }
        rule.onNodeWithTag(formFieldTag(Field.CARD_NUMBER)).performClick().performImeAction()
        rule.onNodeWithTag(formFieldTag(Field.MONTH)).assertIsFocused().performImeAction()
        rule.onNodeWithTag(formFieldTag(Field.YEAR)).assertIsFocused().performImeAction()
        rule.onNodeWithTag(formFieldTag(Field.CARD_CODE)).assertIsFocused()
    }

    @Test
    @Config(qualifiers = "w360dp-h800dp-xxhdpi")
    public fun `the card code eye has its own named button cell beside the printed code`() {
        var toggles = 0
        val face = CredentialDetailModel.CardFace(
            brand = PaymentCardBrand.VISA,
            number = "•••• •••• •••• 1111",
            holder = "ALICE MILLER",
            expiry = "12/31",
            code = null,
        )
        rule.setContent {
            AirTheme {
                Box(Modifier.padding(16.dp)) {
                    PaymentCardFace(face, onToggleCode = { toggles++ }, codeBusy = false)
                }
            }
        }
        val tag = secretRevealTag(CredentialDetailModel.CARD_CODE)
        rule.onNodeWithTag(tag)
            .assertContentDescriptionEquals(rule.activity.getString(R.string.detail_show, "CVV"))
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
        assertIndependentTargets(listOf(tag))
        val eye = rule.onNodeWithTag(tag).fetchSemanticsNode().touchBoundsInRoot
        val code = rule.onNodeWithTag(PAYMENT_CARD_CODE_TAG).fetchSemanticsNode().boundsInRoot
        assertFalse("the reveal target must not cover the printed security code", eye.overlaps(code))
        rule.onNodeWithTag(tag).performTouchInput { click(Offset(1f, centerY)) }
        rule.runOnIdle { assertEquals(1, toggles) }
    }

    private fun assertIndependentTargets(tags: List<String>) {
        val minimum = 48f * rule.activity.resources.displayMetrics.density
        val targets = tags.associateWith { tag ->
            val node = rule.onNodeWithTag(tag).fetchSemanticsNode()
            assertMinimumTarget(tag, node.boundsInRoot, minimum)
            node.touchBoundsInRoot.also { assertMinimumTarget(tag, it, minimum) }
        }
        targets.entries.forEachIndexed { index, (tag, target) ->
            targets.entries.drop(index + 1).forEach { (otherTag, otherTarget) ->
                assertFalse("$tag and $otherTag must not share a touch area", target.overlaps(otherTarget))
            }
        }
    }

    private fun assertMinimumTarget(tag: String, bounds: Rect, minimum: Float) {
        assertTrue("$tag touch width ${bounds.width} is below $minimum", bounds.width >= minimum - 0.5f)
        assertTrue("$tag touch height ${bounds.height} is below $minimum", bounds.height >= minimum - 0.5f)
    }
}
