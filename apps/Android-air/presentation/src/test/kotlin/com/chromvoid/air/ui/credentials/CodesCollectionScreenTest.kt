package com.chromvoid.air.ui.credentials

import androidx.activity.ComponentActivity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.bridge.wire.CredentialOtpSummary
import com.chromvoid.air.bridge.wire.PassmanagerOtpRecordsResponse
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.credentials.FakeCredentialStore.Companion.summary
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class CodesCollectionScreenTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val clipboard = FakeClipboard()
    private val requests = mutableListOf<String>()
    private val opened = mutableListOf<String>()
    private var failing = true
    private val store = FakeCredentialStore(listOf(summary("mail", "Mail"), summary("work", "Work"))).apply {
        listOf("mail" to "Mail", "work" to "Work").forEach { (id, label) ->
            otps[id] = mutableListOf(
                CredentialOtpSummary(
                    algorithm = "SHA1",
                    digits = 6,
                    encoding = "base32",
                    label = label,
                    otpType = "HOTP",
                    period = 30,
                ),
            )
        }
        otpLeftSeconds = 0
    }

    @After
    public fun close() {
        scope.cancel()
    }

    @Test
    public fun `a failed record explains its retry while the neighboring code stays usable`() {
        showCollection()

        failedRow(CODES_FAILED_TAG).assertIsDisplayed()
            .assertTextEquals(rule.activity.getString(R.string.codes_load_failed))
        failedRow(CODES_RETRY_TAG).assertIsDisplayed()
            .assertTextEquals(rule.activity.getString(R.string.vault_try_again))
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
        rule.onNodeWithTag(codeValueTag("Work")).assertIsDisplayed()
        rule.onNodeWithTag(codeCopyTag("Work")).performClick()
        rule.onNodeWithTag(codesCollectionRowTag("mail")).performClick()
        rule.onNodeWithTag(codesCollectionRowTag("work")).performClick()
        rule.runOnIdle {
            assertEquals(listOf("123456" to true), clipboard.copies)
            assertEquals(listOf("mail", "work"), opened)
        }
    }

    @Test
    public fun `retry reloads the failed record without reading the neighbor or catalog again`() {
        showCollection()
        val catalogReads = store.pageRequests.toList()
        rule.runOnIdle { failing = false }

        failedRow(CODES_RETRY_TAG).performClick()
        rule.waitForIdle()

        rule.onNodeWithTag(CODES_FAILED_TAG).assertDoesNotExist()
        rule.onNodeWithTag(codeValueTag("Mail")).assertIsDisplayed()
        rule.onNodeWithTag(codeValueTag("Work")).assertIsDisplayed()
        rule.runOnIdle {
            assertEquals(listOf("mail", "work", "mail"), requests)
            assertEquals(catalogReads, store.pageRequests)
        }
    }

    @Test
    @Config(qualifiers = "ru-rRU-w411dp-h891dp")
    public fun `a failed record explains itself and names its retry in Russian`() {
        showCollection()

        failedRow(CODES_FAILED_TAG).assertIsDisplayed()
            .assertTextEquals("Не удалось загрузить коды.")
        failedRow(CODES_RETRY_TAG).assertIsDisplayed().assertTextEquals("Повторить")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
    }

    private fun showCollection() {
        val reader = object : CredentialStore by store {
            override suspend fun otpRecords(id: String, generation: ULong): PassmanagerOtpRecordsResponse {
                requests += id
                if (id == "mail" && failing) throw CoreRefusal("INTERNAL", "passmanager:otp:records")
                return store.otpRecords(id, generation)
            }
        }
        val collection = CodesCollection(reader, 1uL, scope, clipboard, searchDelayMillis = 0)
        rule.setContent {
            AirTheme { CodesCollectionScreen(collection, onOpen = { opened += it }, onBack = {}, onLock = {}) }
        }
        rule.waitForIdle()
    }

    private fun failedRow(tag: String) = rule.onNode(
        hasTestTag(tag) and hasAnyAncestor(hasTestTag(codesCollectionCodesTag("mail"))),
    )
}
