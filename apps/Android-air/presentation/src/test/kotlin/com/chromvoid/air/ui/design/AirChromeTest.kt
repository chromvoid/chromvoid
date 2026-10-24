package com.chromvoid.air.ui.design

import androidx.activity.ComponentActivity
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.unit.Density
import com.chromvoid.air.ui.AirTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "ru-w360dp-h800dp")
public class AirChromeTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    @Test
    public fun `a compact header exposes its complete heading and translated actions at large font scale`() {
        var cancelled = 0
        var moved = 0
        var locked = 0
        rule.setContent {
            LargeFont {
                AirScreen(
                    title = "Переместить файлы",
                    largeTitle = false,
                    leading = { DoneButton("Отмена", { cancelled++ }) },
                    actions = {
                        PillIcon(Icons.Outlined.Lock, "Заблокировать", { locked++ })
                        PillText("Переместить сюда", { moved++ }, emphasized = true)
                    },
                ) { item { Text("Папки") } }
            }
        }
        rule.onNodeWithText("Переместить файлы")
            .assertIsDisplayed()
            .assert(SemanticsMatcher.keyIsDefined(SemanticsProperties.Heading))
        rule.onNodeWithText("Переместить сюда")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
            .performClick()
        rule.onNodeWithContentDescription("Заблокировать").assertIsDisplayed().performClick()
        rule.onNodeWithText("Отмена").assertIsDisplayed().performClick()
        assertEquals(1, moved)
        assertEquals(1, locked)
        assertEquals(1, cancelled)
    }

    @Test
    public fun `a long document style title keeps its full accessible name with save and lock`() {
        rule.setContent {
            LargeFont {
                AirTopBar(
                    title = "План путешествия и список вещей.md",
                    leading = { DoneButton("Готово", {}) },
                    actions = {
                        PillIcon(Icons.Outlined.Lock, "Заблокировать", {})
                        PillText("Сохранить", {}, emphasized = true)
                    },
                )
            }
        }
        rule.onNodeWithText("План путешествия и список вещей.md")
            .assertIsDisplayed()
            .assert(SemanticsMatcher.keyIsDefined(SemanticsProperties.Heading))
        rule.onNodeWithText("Сохранить").assertIsDisplayed()
        rule.onNodeWithContentDescription("Заблокировать").assertIsDisplayed()
    }

    @Test
    public fun `the scrolled large title stays available as a complete toolbar heading`() {
        rule.setContent {
            LargeFont {
                AirScreen(
                    title = "Настройки хранилища",
                    listTag = "list",
                    actions = { PillIcon(Icons.Outlined.Lock, "Заблокировать", {}) },
                ) {
                    items(40) { Text("Параметр $it", modifier = Modifier.testTag("item-$it")) }
                }
            }
        }
        rule.onNodeWithTag("list").performScrollToIndex(30)
        rule.onNodeWithText("Настройки хранилища")
            .assertIsDisplayed()
            .assert(SemanticsMatcher.keyIsDefined(SemanticsProperties.Heading))
        rule.onNodeWithContentDescription("Заблокировать").assertIsDisplayed()
    }

    @Composable
    private fun LargeFont(content: @Composable () -> Unit) {
        val density = LocalDensity.current.density
        CompositionLocalProvider(LocalDensity provides Density(density, fontScale = 1.3f)) {
            AirTheme(content = content)
        }
    }
}
