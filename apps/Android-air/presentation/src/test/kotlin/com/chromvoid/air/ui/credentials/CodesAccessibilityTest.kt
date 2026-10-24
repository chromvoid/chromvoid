package com.chromvoid.air.ui.credentials

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Column
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import com.chromvoid.air.bridge.wire.CredentialOtpSummary
import com.chromvoid.air.bridge.wire.OtpPreviewResponse
import com.chromvoid.air.bridge.wire.PassmanagerOtpRecordRequest
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.credentials.FakeCredentialStore.Companion.summary
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class CodesAccessibilityTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val store = FakeCredentialStore(listOf(summary("mail", "Mail"))).apply {
        otps["mail"] = mutableListOf(
            CredentialOtpSummary(
                algorithm = "SHA1",
                digits = 6,
                encoding = "base32",
                label = "Mail",
                otpType = "TOTP",
                period = 30,
            ),
        )
    }

    @After
    public fun close() {
        scope.cancel()
    }

    @Test
    public fun `the credential page names each code and reads the digits individually`() {
        showCredentialCodes()
        assertSpokenCode("One-time code 1 2 3 4 5 6")
    }

    @Test
    @Config(qualifiers = "ru-rRU-w411dp-h891dp")
    public fun `the credential page localizes the code name in Russian`() {
        showCredentialCodes()
        assertSpokenCode("Одноразовый код 1 2 3 4 5 6")
    }

    @Test
    public fun `the Codes collection names each code and reads the digits individually`() {
        showCollection()
        assertSpokenCode("One-time code 1 2 3 4 5 6")
    }

    @Test
    @Config(qualifiers = "ru-rRU-w411dp-h891dp")
    public fun `the Codes collection localizes the code name in Russian`() {
        showCollection()
        assertSpokenCode("Одноразовый код 1 2 3 4 5 6")
    }

    @Test
    public fun `the credential page keeps code and countdown nodes through code expiry and refresh`() {
        checkRefresh(collection = false, "One-time code", "Code is updating")
    }

    @Test
    @Config(qualifiers = "ru-rRU-w411dp-h891dp")
    public fun `the credential page names its updating code in Russian without announcing bullets`() {
        checkRefresh(collection = false, "Одноразовый код", "Код обновляется")
    }

    @Test
    public fun `the Codes collection keeps code and countdown nodes through code expiry and refresh`() {
        checkRefresh(collection = true, "One-time code", "Code is updating")
    }

    @Test
    @Config(qualifiers = "ru-rRU-w411dp-h891dp")
    public fun `the Codes collection names its updating code in Russian without announcing bullets`() {
        checkRefresh(collection = true, "Одноразовый код", "Код обновляется")
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    private fun checkRefresh(collection: Boolean, codeName: String, updatingDescription: String) {
        val scheduler = TestCoroutineScheduler()
        val refreshScope = CoroutineScope(SupervisorJob() + StandardTestDispatcher(scheduler))
        val nextCode = CompletableDeferred<OtpPreviewResponse>()
        var requests = 0
        val refreshingStore = object : CredentialStore by store {
            override suspend fun otpCode(
                request: PassmanagerOtpRecordRequest,
                generation: ULong,
            ): OtpPreviewResponse {
                requests += 1
                return if (requests == 1) {
                    OtpPreviewResponse(leftSeconds = 30, otp = "123456", period = 30)
                } else {
                    nextCode.await()
                }
            }
        }
        try {
            val model = if (collection) {
                val codes = CodesCollection(refreshingStore, 1uL, refreshScope, FakeClipboard(), searchDelayMillis = 0)
                rule.setContent {
                    AirTheme { CodesCollectionScreen(codes, onOpen = {}, onBack = {}, onLock = {}) }
                }
                codes.codesFor("mail")
            } else {
                CodesModel("mail", refreshingStore, 1uL, refreshScope, FakeClipboard(), null).also { codes ->
                    rule.setContent { AirTheme { Column { CodesPageSection(codes) } } }
                }
            }
            rule.runOnIdle { scheduler.runCurrent() }
            rule.waitForIdle()
            rule.runOnIdle { scheduler.runCurrent() }
            rule.waitForIdle()
            assertSpokenCode("$codeName 1 2 3 4 5 6")
            val valueId = rule.onNodeWithTag(codeValueTag("Mail")).fetchSemanticsNode().id
            val countdownId = rule.onNodeWithTag(codeCountdownTag("Mail")).fetchSemanticsNode().id

            rule.runOnIdle {
                scheduler.advanceTimeBy(30_000)
                scheduler.runCurrent()
            }
            rule.waitForIdle()
            rule.runOnIdle { scheduler.runCurrent() }
            rule.waitForIdle()
            rule.runOnIdle {
                assertEquals(2, requests)
                assertFalse(model.state.value.shown.containsKey("Mail"))
            }
            assertStableNodes(valueId, countdownId)
            listOf(codeValueTag("Mail"), codeCountdownTag("Mail")).forEach { tag ->
                rule.onNodeWithTag(tag, useUnmergedTree = true)
                    .assertContentDescriptionEquals(updatingDescription)
                    .assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Text))
            }
            rule.onAllNodes(
                SemanticsMatcher("Text contains placeholder bullets") { node ->
                    node.config.getOrNull(SemanticsProperties.Text)?.any { '•' in it.text } == true
                },
                useUnmergedTree = true,
            ).assertCountEquals(0)
            assertNoLiveAnnouncements()

            rule.runOnIdle {
                nextCode.complete(OtpPreviewResponse(leftSeconds = 30, otp = "654321", period = 30))
                scheduler.runCurrent()
            }
            rule.waitForIdle()
            assertStableNodes(valueId, countdownId)
            assertSpokenCode("$codeName 6 5 4 3 2 1")
        } finally {
            refreshScope.cancel()
        }
    }

    private fun assertStableNodes(valueId: Int, countdownId: Int) {
        assertEquals(valueId, rule.onNodeWithTag(codeValueTag("Mail")).fetchSemanticsNode().id)
        assertEquals(countdownId, rule.onNodeWithTag(codeCountdownTag("Mail")).fetchSemanticsNode().id)
    }

    private fun showCredentialCodes() {
        val model = CodesModel("mail", store, 1uL, scope, FakeClipboard(), null)
        rule.setContent { AirTheme { Column { CodesPageSection(model) } } }
        rule.waitForIdle()
    }

    private fun showCollection() {
        val collection = CodesCollection(store, 1uL, scope, FakeClipboard(), searchDelayMillis = 0)
        rule.setContent {
            AirTheme { CodesCollectionScreen(collection, onOpen = {}, onBack = {}, onLock = {}) }
        }
        rule.waitForIdle()
    }

    private fun assertSpokenCode(description: String) {
        rule.onNodeWithTag(codeValueTag("Mail"))
            .assertContentDescriptionEquals(description)
            .assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Text))
        rule.onNodeWithTag(codeCountdownTag("Mail")).assertExists()
        assertNoLiveAnnouncements()
    }

    private fun assertNoLiveAnnouncements() {
        rule.onAllNodes(
            SemanticsMatcher.keyIsDefined(SemanticsProperties.LiveRegion),
            useUnmergedTree = true,
        ).assertCountEquals(0)
    }
}
