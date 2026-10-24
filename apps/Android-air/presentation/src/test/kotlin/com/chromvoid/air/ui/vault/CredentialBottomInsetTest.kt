package com.chromvoid.air.ui.vault

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.credentials.CredentialFormModel
import com.chromvoid.air.ui.credentials.FORM_LIST_TAG
import com.chromvoid.air.ui.credentials.FakeClipboard
import com.chromvoid.air.ui.credentials.FakeCredentialStore
import com.chromvoid.air.ui.credentials.FakeCredentialStore.Companion.summary
import com.chromvoid.air.ui.dispatchSystemInsets
import com.chromvoid.air.ui.root.RootScaffold
import com.chromvoid.air.ui.scrollToEnd
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class CredentialBottomInsetTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    @Test
    public fun `the edit footer scrolls fully above phone navigation buttons`() {
        checkEditFooter()
    }

    @Test
    @Config(qualifiers = "w1280dp-h800dp-land")
    public fun `the edit footer scrolls fully above the tablet taskbar`() {
        checkEditFooter()
    }

    private fun checkEditFooter() {
        val vault = VaultScope(
            FakeCredentialStore(listOf(summary("mail", "Mail", "alice"))),
            1uL,
            FakeClipboard(),
            searchDelayMillis = 0,
        )
        rule.setContent { AirTheme { RootScaffold(unlocked = true, vault = { VaultRoot(vault, it) }) } }
        rule.runOnIdle { vault.open("mail") }
        rule.waitUntil(5_000) { vault.detail.value?.state?.value?.detail != null }
        rule.runOnIdle { vault.beginEdit() }
        rule.waitUntil(5_000) { vault.form.value?.state?.value?.status == CredentialFormModel.Status.EDITING }
        rule.dispatchSystemInsets()
        rule.onNodeWithTag(FORM_LIST_TAG).scrollToEnd()
        val viewport = rule.onNodeWithTag(FORM_LIST_TAG).getUnclippedBoundsInRoot()
        val footer = rule.onNodeWithText(rule.activity.getString(R.string.form_group_footer))
            .getUnclippedBoundsInRoot()
        assertTrue("footer must be fully in the viewport: $footer", footer.top >= viewport.top)
        assertTrue(
            "footer bottom ${footer.bottom} must be above the 48dp system panel in $viewport",
            footer.bottom.value <= viewport.bottom.value - 48f,
        )
    }
}
