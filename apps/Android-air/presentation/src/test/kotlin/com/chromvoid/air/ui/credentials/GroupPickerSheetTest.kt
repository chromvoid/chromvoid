package com.chromvoid.air.ui.credentials

import androidx.activity.ComponentActivity
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.performTextInput
import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.bridge.wire.PassmanagerGroupPageResponse
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.credentials.CredentialFormModel.Field
import com.chromvoid.air.ui.credentials.CredentialFormModel.Kind
import com.chromvoid.air.ui.credentials.CredentialFormModel.Status
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w393dp-h900dp")
public class GroupPickerSheetTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val store = FakeCredentialStore().apply { groups += "/Personal" }
    private val pickerVisible = mutableStateOf(true)
    private val formVisible = mutableStateOf(true)

    @After
    public fun close() {
        scope.cancel()
    }

    private fun show(): CredentialFormModel {
        val form = CredentialFormModel.create(
            Kind.LOGIN,
            store,
            generation = 1uL,
            scope = scope,
            prefill = mapOf(Field.TITLE to "Mail", Field.PASSWORD to "hunter2"),
            cards = FakeCardRules,
        ) {}
        val picker = GroupPickerModel("/", store, 1uL, scope)
        rule.setContent {
            AirTheme {
                if (pickerVisible.value) {
                    GroupPickerSheet(
                        picker,
                        onChoose = {
                            form.setGroup(it)
                            picker.close()
                            pickerVisible.value = false
                        },
                        onDismiss = {
                            picker.close()
                            pickerVisible.value = false
                        },
                    )
                } else if (formVisible.value) {
                    CredentialFormScreen(
                        form,
                        onDismiss = { if (form.requestDismiss()) formVisible.value = false },
                        onDiscard = { formVisible.value = false },
                    )
                }
            }
        }
        rule.waitForIdle()
        return form
    }

    @Test
    public fun `a named new group action focuses its input and selects a destination at the current level`() {
        val form = show()
        rule.onNodeWithTag(pickerOpenTag("/Personal")).performClick()

        rule.onNodeWithTag(PICKER_NEW_TAG).assertIsDisplayed().assertHasClickAction()
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button)).performClick()

        rule.onNodeWithText(rule.activity.getString(R.string.picker_new_here, "/Personal")).assertIsDisplayed()
        rule.onNodeWithTag(PICKER_NEW_NAME_TAG).assertIsFocused()
            .assertContentDescriptionEquals(rule.activity.getString(R.string.group_name))
            .performTextInput("Travel")
        rule.onNodeWithTag(PICKER_NEW_USE_TAG).performClick()

        assertEquals("/Personal/Travel", form.state.value.group)
        assertEquals("Mail", form.state.value.value(Field.TITLE))
        assertEquals("hunter2", form.state.value.value(Field.PASSWORD))
        assertEquals(setOf("/Personal"), store.groups)
        assertTrue(store.creates.isEmpty())
        assertTrue(store.ensuredGroups.isEmpty())
        rule.onNodeWithTag(FORM_LIST_TAG).performScrollToIndex(4)
        rule.onNodeWithTag(formFieldTag(Field.GROUP)).assertTextEquals("/Personal/Travel")

        rule.onNodeWithTag(FORM_SAVE_TAG).performClick()
        rule.waitUntil(5_000) { form.state.value.status == Status.SAVED }

        assertTrue("/Personal/Travel" in store.groups)
        assertEquals("/Personal/Travel", store.creates.single().groupPath)
        assertTrue(store.ensuredGroups.isEmpty())
    }

    @Test
    public fun `an empty new name explains the error and cancelling both surfaces keeps the draft`() {
        val form = show()
        rule.onNodeWithTag(PICKER_NEW_TAG).performClick()

        rule.onNodeWithTag(PICKER_NEW_USE_TAG).performClick()

        rule.onNodeWithTag(PICKER_NEW_NAME_TAG).assertIsFocused().assert(SemanticsMatcher.expectValue(
            SemanticsProperties.Error,
            rule.activity.getString(R.string.form_error_required),
        ))
        rule.onNodeWithTag(PICKER_NEW_NAME_TAG).performTextInput("Travel")
        rule.onNodeWithTag(PICKER_NEW_NAME_TAG)
            .assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Error))
        rule.onNodeWithTag(PICKER_NEW_CANCEL_TAG).performClick()
        rule.onNodeWithTag(PICKER_NEW_NAME_TAG).assertDoesNotExist()
        rule.onNodeWithTag(PICKER_CLOSE_TAG).performClick()

        assertEquals("/", form.state.value.group)
        assertEquals("Mail", form.state.value.value(Field.TITLE))
        assertEquals("hunter2", form.state.value.value(Field.PASSWORD))
        assertEquals(setOf("/Personal"), store.groups)
        assertTrue(store.creates.isEmpty())
        assertTrue(store.ensuredGroups.isEmpty())
        rule.onNodeWithTag(FORM_SAVE_TAG).assertIsDisplayed()
    }

    @Test
    public fun `discarding the credential after choosing a new group creates nothing`() {
        show()
        rule.onNodeWithTag(PICKER_NEW_TAG).performClick()
        rule.onNodeWithTag(PICKER_NEW_NAME_TAG).performTextInput("Travel")
        rule.onNodeWithTag(PICKER_NEW_USE_TAG).performClick()

        rule.onNodeWithTag(FORM_CLOSE_TAG).performClick()
        rule.onNodeWithTag(FORM_DISCARD_TAG).assertIsDisplayed().performClick()
        rule.waitForIdle()

        rule.onNodeWithTag(FORM_SAVE_TAG).assertDoesNotExist()
        assertEquals(setOf("/Personal"), store.groups)
        assertTrue(store.entries.isEmpty())
        assertTrue(store.creates.isEmpty())
        assertTrue(store.ensuredGroups.isEmpty())
    }

    @Test
    public fun `an unsaved destination that Core cannot list can still return to its parent`() {
        val reader = object : CredentialStore by store {
            override suspend fun groupPage(
                parent: String,
                offset: Long,
                generation: ULong,
            ): PassmanagerGroupPageResponse {
                if (parent == "/Personal/Travel") throw CoreRefusal("NODE_NOT_FOUND", "passmanager:group:page")
                return store.groupPage(parent, offset, generation)
            }
        }
        val picker = GroupPickerModel("/Personal/Travel", reader, 1uL, scope)
        rule.setContent { AirTheme { GroupPickerSheet(picker, onChoose = {}, onDismiss = {}) } }
        rule.waitForIdle()

        rule.onNodeWithTag(PICKER_UP_TAG).assertIsDisplayed().performClick()
        rule.waitForIdle()

        assertEquals("/Personal", picker.level.value.parent)
        rule.onNodeWithTag(PICKER_HERE_TAG).assertIsDisplayed()
        rule.onNodeWithTag(PICKER_NEW_TAG).assertIsDisplayed()
        assertEquals(setOf("/Personal"), store.groups)
        assertTrue(store.ensuredGroups.isEmpty())
        picker.close()
    }
}
