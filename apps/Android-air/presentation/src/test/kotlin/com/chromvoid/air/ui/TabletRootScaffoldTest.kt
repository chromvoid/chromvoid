package com.chromvoid.air.ui

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.chromvoid.air.ui.credentials.CATALOG_SEARCH_TAG
import com.chromvoid.air.ui.credentials.DETAIL_TITLE_TAG
import com.chromvoid.air.ui.credentials.FakeClipboard
import com.chromvoid.air.ui.credentials.FakeCredentialStore
import com.chromvoid.air.ui.credentials.FakeCredentialStore.Companion.summary
import com.chromvoid.air.ui.credentials.catalogRowTag
import com.chromvoid.air.ui.root.AirRoot
import com.chromvoid.air.ui.root.CoversTabBar
import com.chromvoid.air.ui.root.RootScaffold
import com.chromvoid.air.ui.vault.VAULT_PANE_EMPTY_TAG
import com.chromvoid.air.ui.vault.VAULT_PANE_TAG
import com.chromvoid.air.ui.vault.VaultRoot
import com.chromvoid.air.ui.vault.VaultScope
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** R21: adaptive root navigation shares selection, stacks and modal ownership. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w1280dp-h800dp")
public class TabletRootScaffoldTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    @Test
    public fun `English rail destinations expose their names roles and selection`() {
        checkRailSemantics()
    }

    @Test
    @Config(qualifiers = "ru-rRU-w1280dp-h800dp")
    public fun `Russian rail destinations expose their names roles and selection`() {
        checkRailSemantics()
    }

    @Test
    public fun `a locked tablet exposes only the safe rail destinations`() {
        rule.setContent { AirTheme { RootScaffold(unlocked = false) } }

        rule.onNodeWithTag("root-rail").assertIsDisplayed()
        rule.onNodeWithTag("root-connections").assertIsSelected()
        rule.onNodeWithTag("root-settings").assertIsDisplayed().performClick().assertIsSelected()
        assertMissing("root-vault")
        assertMissing("root-files")
        assertMissing("root-tab-bar")
    }

    @Test
    public fun `switching every rail destination restores its own navigation stack`() {
        rule.setContent { AirTheme { StatefulRoots() } }

        AirRoot.entries.forEachIndexed { index, root ->
            rule.onNodeWithTag(rootTag(root)).performClick()
            repeat(index + 1) { push(root) }
        }

        AirRoot.entries.reversed().forEach { root ->
            val depth = AirRoot.entries.indexOf(root) + 1
            rule.onNodeWithTag(rootTag(root)).performClick().assertIsSelected()
            assertStack(root, depth)
            rule.onNodeWithTag("pop-${root.name}").performClick()
            assertStack(root, depth - 1)
        }
    }

    @Test
    public fun `changing between rail and phone tabs preserves the selected root and every stack`() {
        val width = mutableStateOf(1280.dp)
        rule.setContent {
            AirTheme {
                Box(Modifier.width(width.value)) { StatefulRoots() }
            }
        }
        push(AirRoot.VAULT)
        push(AirRoot.VAULT)
        rule.onNodeWithTag("root-files").performClick()
        push(AirRoot.FILES)
        rule.onNodeWithTag("root-settings").performClick()
        push(AirRoot.SETTINGS)

        rule.runOnIdle { width.value = 411.dp }
        assertMissing("root-rail")
        rule.onNodeWithTag("root-tab-bar").assertIsDisplayed()
        rule.onNodeWithTag("root-settings").assertIsSelected()
        assertStack(AirRoot.SETTINGS, 1)
        rule.onNodeWithTag("root-vault").performClick()
        assertStack(AirRoot.VAULT, 2)

        rule.runOnIdle { width.value = 840.dp }
        rule.onNodeWithTag("root-rail").assertIsDisplayed()
        assertMissing("root-tab-bar")
        rule.onNodeWithTag("root-vault").assertIsSelected()
        assertStack(AirRoot.VAULT, 2)
        rule.onNodeWithTag("root-settings").performClick()
        assertStack(AirRoot.SETTINGS, 1)
        rule.onNodeWithTag("root-files").performClick()
        assertStack(AirRoot.FILES, 1)
    }

    @Test
    public fun `saved instance state restores the selected rail root and the inactive root stacks`() {
        val restoration = StateRestorationTester(rule)
        restoration.setContent { AirTheme { StatefulRoots() } }
        push(AirRoot.VAULT)
        push(AirRoot.VAULT)
        rule.onNodeWithTag("root-files").performClick()
        push(AirRoot.FILES)
        rule.onNodeWithTag("root-settings").performClick()
        push(AirRoot.SETTINGS)

        restoration.emulateSavedInstanceStateRestore()

        rule.onNodeWithTag("root-rail").assertIsDisplayed()
        rule.onNodeWithTag("root-settings").assertIsSelected()
        assertStack(AirRoot.SETTINGS, 1)
        rule.onNodeWithTag("root-vault").performClick()
        assertStack(AirRoot.VAULT, 2)
        rule.onNodeWithTag("root-files").performClick()
        assertStack(AirRoot.FILES, 1)
    }

    @Test
    public fun `root and overlay tasks keep the rail covered until both tasks close`() {
        val rootTask = mutableStateOf(false)
        val overlayTask = mutableStateOf(false)
        rule.setContent {
            AirTheme { StatefulRoots(rootTask = rootTask.value, overlayTask = overlayTask.value) }
        }
        push(AirRoot.VAULT)

        rule.runOnIdle { rootTask.value = true }
        rule.onNodeWithTag("root-task").assertIsDisplayed()
        assertNavigationMissing()
        rule.runOnIdle { overlayTask.value = true }
        rule.onNodeWithTag("overlay-task").assertIsDisplayed()
        assertNavigationMissing()
        rule.runOnIdle { rootTask.value = false }
        assertNavigationMissing()
        rule.runOnIdle { overlayTask.value = false }

        rule.onNodeWithTag("root-rail").assertIsDisplayed()
        rule.onNodeWithTag("root-vault").assertIsSelected()
        assertStack(AirRoot.VAULT, 1)
    }

    @Test
    public fun `the vault keeps list detail at the expanded boundary and its record across width changes`() {
        val width = mutableStateOf(840.dp)
        val vault = VaultScope(
            FakeCredentialStore(listOf(summary("mail", "Mail", "alice"), summary("bank", "Bank"))),
            generation = 1uL,
            clipboard = FakeClipboard(),
            searchDelayMillis = 0,
        )
        rule.setContent {
            AirTheme {
                Box(Modifier.width(width.value)) {
                    RootScaffold(unlocked = true, vault = { VaultRoot(vault, modifier = it) })
                }
            }
        }
        rule.onNodeWithTag("root-rail").assertIsDisplayed()
        rule.onNodeWithTag(VAULT_PANE_EMPTY_TAG).assertIsDisplayed()
        rule.onNodeWithTag(catalogRowTag("mail")).performClick()
        rule.waitUntil(5_000) { vault.detail.value?.state?.value?.detail != null }
        rule.onNodeWithTag(DETAIL_TITLE_TAG).assertTextContains("Mail")
        rule.onNodeWithTag(CATALOG_SEARCH_TAG).assertIsDisplayed()

        rule.runOnIdle { width.value = 411.dp }
        rule.onNodeWithTag("root-tab-bar").assertIsDisplayed()
        rule.onNodeWithTag(DETAIL_TITLE_TAG).assertTextContains("Mail")
        assertMissing(CATALOG_SEARCH_TAG)
        assertMissing(VAULT_PANE_TAG)

        rule.runOnIdle { width.value = 840.dp }
        rule.onNodeWithTag("root-rail").assertIsDisplayed()
        rule.onNodeWithTag(VAULT_PANE_TAG).assertExists()
        rule.onNodeWithTag(CATALOG_SEARCH_TAG).assertIsDisplayed()
        rule.onNodeWithTag(DETAIL_TITLE_TAG).assertTextContains("Mail")
        rule.onNodeWithTag("root-settings").performClick()
        rule.onNodeWithTag("root-vault").performClick()
        rule.onNodeWithTag(DETAIL_TITLE_TAG).assertTextContains("Mail")
        rule.onNodeWithTag(CATALOG_SEARCH_TAG).assertIsDisplayed()
    }

    private fun checkRailSemantics() {
        rule.setContent { AirTheme { RootScaffold(unlocked = true) } }
        rule.onNodeWithTag("root-rail").assertIsDisplayed()
        assertMissing("root-tab-bar")
        AirRoot.entries.forEach { root ->
            rule.onNodeWithTag(rootTag(root))
                .assertIsDisplayed()
                .assertTextEquals(rule.activity.getString(root.labelRes))
                .assert(hasClickAction())
                .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Tab))
        }
        rule.onNodeWithTag("root-vault").assertIsSelected()
        AirRoot.entries.drop(1).forEach { root ->
            rule.onNodeWithTag(rootTag(root)).assertIsNotSelected().performClick().assertIsSelected()
            AirRoot.entries.filter { it != root }.forEach { other ->
                rule.onNodeWithTag(rootTag(other)).assertIsNotSelected()
            }
        }
    }

    private fun push(root: AirRoot) {
        rule.onNodeWithTag("push-${root.name}").performClick()
    }

    private fun assertStack(root: AirRoot, depth: Int) {
        val expected = (0..depth).joinToString("/") { if (it == 0) "home" else "detail-$it" }
        rule.onNodeWithTag("stack-${root.name}").assertTextEquals(expected)
    }

    private fun assertNavigationMissing() {
        assertMissing("root-rail")
        assertMissing("root-tab-bar")
        AirRoot.entries.forEach { assertMissing(rootTag(it)) }
    }

    private fun assertMissing(tag: String) {
        rule.onAllNodesWithTag(tag, useUnmergedTree = true).assertCountEquals(0)
    }
}

@Composable
private fun StatefulRoots(rootTask: Boolean = false, overlayTask: Boolean = false) {
    RootScaffold(
        unlocked = true,
        vault = {
            TestRootStack(AirRoot.VAULT, it)
            if (rootTask) {
                CoversTabBar()
                Text("Root task", modifier = Modifier.testTag("root-task"))
            }
        },
        files = { TestRootStack(AirRoot.FILES, it) },
        connections = { TestRootStack(AirRoot.CONNECTIONS, it) },
        settings = { TestRootStack(AirRoot.SETTINGS, it) },
        overlay = {
            if (overlayTask) {
                CoversTabBar()
                Text("Overlay task", modifier = Modifier.testTag("overlay-task"))
            }
        },
    )
}

@Composable
private fun TestRootStack(root: AirRoot, modifier: Modifier) {
    var stack by rememberSaveable { mutableStateOf(arrayListOf("home")) }
    Column(modifier) {
        Text(stack.joinToString("/"), modifier = Modifier.testTag("stack-${root.name}"))
        Button(
            onClick = { stack = ArrayList(stack + "detail-${stack.size}") },
            modifier = Modifier.testTag("push-${root.name}"),
        ) { Text("Open next route") }
        if (stack.size > 1) {
            Button(
                onClick = { stack = ArrayList(stack.dropLast(1)) },
                modifier = Modifier.testTag("pop-${root.name}"),
            ) { Text("Back") }
        }
    }
}

private fun rootTag(root: AirRoot): String = "root-${root.name.lowercase()}"
