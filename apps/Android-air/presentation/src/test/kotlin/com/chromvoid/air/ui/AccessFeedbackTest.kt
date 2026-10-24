package com.chromvoid.air.ui

import androidx.activity.ComponentActivity
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.text.AnnotatedString
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.access.ACCESS_CONFIRMATION_TAG
import com.chromvoid.air.ui.access.ACCESS_PASSWORD_TAG
import com.chromvoid.air.ui.access.ACCESS_REVEAL_TAG
import com.chromvoid.air.ui.access.ACCESS_SUBMIT_TAG
import com.chromvoid.air.ui.access.AccessViewModel
import com.chromvoid.air.ui.access.AdministratorSetupScreen
import com.chromvoid.air.ui.access.UnlockScreen
import com.chromvoid.air.ui.access.WELCOME_CONTINUE_TAG
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class AccessFeedbackTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    @Test
    public fun `an empty unlock password owns its error and receives focus`() {
        showUnlock(FakeAccessSession.locked())
        submitAndAssertPasswordError(R.string.access_error_empty_password)
    }

    @Test
    @Config(qualifiers = "ru-rRU-w411dp-h891dp")
    public fun `the password error and field name are localized in Russian`() {
        showUnlock(FakeAccessSession.locked())
        submitAndAssertPasswordError(R.string.access_error_empty_password)
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG).assertContentDescriptionEquals("Пароль хранилища")
    }

    @Test
    public fun `a refused unlock associates the actual refusal with the cleared password`() {
        val model = showUnlock(FakeAccessSession.refusing("REFUSED"))
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG).performTextInput("private draft")
        submitAndAssertPasswordError(R.string.access_refused)
        assertEquals("", model.form.value.password)
    }

    @Test
    public fun `editing a rejected field clears its error while retaining its name`() {
        showUnlock(FakeAccessSession.locked())
        submitAndAssertPasswordError(R.string.access_error_empty_password)
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG).performTextInput("private draft")
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG)
            .assertContentDescriptionEquals("Vault password")
            .assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Error))
    }

    @Test
    public fun `a mismatched setup confirmation owns the error and focus`() {
        val model = AccessViewModel(FakeAccessSession.firstRun())
        rule.setContent { AirTheme { AdministratorSetupScreen(model) } }
        rule.onNodeWithTag(WELCOME_CONTINUE_TAG).performClick()
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG).performTextInput("first draft")
        rule.onNodeWithTag(ACCESS_CONFIRMATION_TAG).performTextInput("second draft")
        rule.onNodeWithTag(ACCESS_SUBMIT_TAG).performClick()

        rule.onNodeWithTag(ACCESS_CONFIRMATION_TAG)
            .assertIsFocused()
            .assert(SemanticsMatcher.expectValue(
                SemanticsProperties.Error,
                rule.activity.getString(R.string.access_error_mismatch),
            ))
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG).assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Error))
    }

    @Test
    public fun `revealing a password keeps accessibility masked and the field editable`() {
        val model = showUnlock(FakeAccessSession.locked())
        val field = rule.onNodeWithTag(ACCESS_PASSWORD_TAG)
        field.performTextInput("private draft")
        assertMaskedPassword("private draft")

        rule.onNodeWithTag(ACCESS_REVEAL_TAG).performClick()
        assertMaskedPassword("private draft")
        field.performTextInput(" edited")
        assertEquals("private draft edited", model.form.value.password)
        assertMaskedPassword("private draft edited")
        rule.onNodeWithTag(ACCESS_REVEAL_TAG).performClick()
        assertMaskedPassword("private draft edited")
    }

    private fun showUnlock(session: FakeAccessSession): AccessViewModel {
        val model = AccessViewModel(session)
        rule.setContent { AirTheme { UnlockScreen(model) } }
        return model
    }

    private fun submitAndAssertPasswordError(message: Int) {
        rule.onNodeWithTag(ACCESS_SUBMIT_TAG).performClick()
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG)
            .assertIsFocused()
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Error, rule.activity.getString(message)))
    }

    private fun assertMaskedPassword(secret: String) {
        rule.onNodeWithTag(ACCESS_PASSWORD_TAG)
            .assertContentDescriptionEquals("Vault password")
            .assert(SemanticsMatcher.keyIsDefined(SemanticsProperties.Password))
            .assert(SemanticsMatcher.expectValue(
                SemanticsProperties.EditableText,
                AnnotatedString("•".repeat(secret.length)),
            ))
        rule.onAllNodes(
            SemanticsMatcher.keyIsDefined(SemanticsProperties.LiveRegion),
            useUnmergedTree = true,
        ).assertCountEquals(0)
    }
}
