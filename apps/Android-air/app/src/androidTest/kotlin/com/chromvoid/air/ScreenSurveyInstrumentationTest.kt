package com.chromvoid.air

import android.graphics.Bitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateSecrets
import com.chromvoid.air.bridge.wire.PassmanagerOtpRecordSaveRequest
import com.chromvoid.air.bridge.wire.CredentialOtpSummary
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.credentials.CATALOG_CREATE_TAG
import com.chromvoid.air.ui.credentials.CATALOG_OPTIONS_TAG
import com.chromvoid.air.ui.credentials.CATALOG_TOOLS_TAG
import com.chromvoid.air.ui.credentials.CATALOG_CODES_TAG
import com.chromvoid.air.ui.credentials.CODES_COLLECTION_BACK_TAG
import com.chromvoid.air.ui.credentials.DETAIL_BACK_TAG
import com.chromvoid.air.ui.credentials.DETAIL_EDIT_TAG
import com.chromvoid.air.ui.credentials.DETAIL_TITLE_TAG
import com.chromvoid.air.ui.credentials.FORM_CLOSE_TAG
import com.chromvoid.air.ui.credentials.catalogRowTag
import java.io.File
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * A design survey, not a verification step: seeds a small synthetic vault and
 * saves a screenshot of each main screen to the app's external files, for a
 * side-by-side look with the iOS client. Runs only with the instrumentation
 * argument `survey=1`.
 */
@RunWith(AndroidJUnit4::class)
public class ScreenSurveyInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun surveyTheScreens() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("survey") == "1")
        await { session.state.value == AirSessionState.NeedsAdministrator }
        shot("setup")
        runBlocking {
            session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR)
        }
        await { session.state.value == AirSessionState.Locked }
        rule.waitForIdle()
        shot("locked")
        runBlocking { check(session.unlock(VAULT) == AccessOutcome.Accepted) }
        await { session.state.value is AirSessionState.Unlocked }
        val generation = (session.state.value as AirSessionState.Unlocked).generation
        val ids = runBlocking {
            listOf(
                Triple("Cloud drive", "alice.m", "u7#Kq9!vT2@pLx4"),
                Triple("Home Wi-Fi", "home-network", "correct horse battery"),
                Triple("Personal mail", "alice@example.com", "hunter2"),
                Triple("Work account", "a.miller", "Str0ng!Passw0rd#2026"),
            ).map { (title, username, password) ->
                session.credentials.createCredential(
                    PassmanagerEntryCreateRequest(
                        entryID = UUID.randomUUID().toString(),
                        entryType = "login",
                        secrets = PassmanagerEntryCreateSecrets(password = password, note = "Synthetic note"),
                        title = title,
                        username = username,
                    ),
                    generation,
                ).entryID
            }
        }
        runBlocking {
            val list = session.credentials.otpRecords(ids[0], generation)
            session.credentials.saveOtp(
                PassmanagerOtpRecordSaveRequest(
                    entryID = ids[0],
                    revision = list.revision,
                    secret = "JBSWY3DPEHPK3PXP",
                    settings = CredentialOtpSummary(
                        algorithm = "SHA1",
                        digits = 6,
                        encoding = "base32",
                        label = "Main code",
                        otpType = "TOTP",
                        period = 30,
                    ),
                ),
                generation,
            )
        }
        awaitNode(catalogRowTag(ids[3]))
        Thread.sleep(1_500)
        shot("vault")
        rule.onNodeWithTag(CATALOG_TOOLS_TAG).performClick()
        Thread.sleep(600)
        shot("tools-menu")
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK)
        rule.onNodeWithTag(CATALOG_CREATE_TAG).performClick()
        Thread.sleep(600)
        shot("add-menu")
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK)
        rule.onNodeWithTag(CATALOG_OPTIONS_TAG).performClick()
        Thread.sleep(600)
        shot("catalog-menu")
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK)
        rule.onNodeWithTag(catalogRowTag(ids[0])).performClick()
        awaitNode(DETAIL_TITLE_TAG)
        Thread.sleep(2_000)
        shot("credential")
        rule.onNodeWithTag(DETAIL_EDIT_TAG).performClick()
        awaitNode(FORM_CLOSE_TAG)
        Thread.sleep(1_500)
        shot("edit")
        rule.onNodeWithTag(FORM_CLOSE_TAG).performClick()
        Thread.sleep(800)
        rule.onNodeWithTag(DETAIL_BACK_TAG).performClick()
        awaitNode(CATALOG_CODES_TAG)
        rule.onNodeWithTag(CATALOG_CODES_TAG).performClick()
        awaitNode(CODES_COLLECTION_BACK_TAG)
        Thread.sleep(2_000)
        shot("codes")
        rule.onNodeWithTag(CODES_COLLECTION_BACK_TAG).performClick()
        rule.onNodeWithTag("root-settings").performClick()
        Thread.sleep(800)
        shot("settings")
    }

    private fun shot(name: String) {
        rule.waitForIdle()
        val bitmap = rule.onRoot().captureToImage().asAndroidBitmap()
        // Gradle pulls this directory back into build/outputs after the run.
        val output = InstrumentationRegistry.getArguments().getString("additionalTestOutputDir")
        val dir = File(output ?: rule.activity.getExternalFilesDir(null)!!.path, "survey").apply { mkdirs() }
        File(dir, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private fun awaitNode(tag: String) {
        rule.waitUntil(
            30_000,
        ) { rule.onAllNodesWithTag(tag, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
    }

    private fun await(accept: () -> Boolean) {
        val deadline = System.nanoTime() + 20_000_000_000L
        while (!accept()) {
            check(System.nanoTime() < deadline) { "session still ${session.state.value}" }
            Thread.sleep(50)
        }
    }

    private companion object {
        const val ADMINISTRATOR = "air-instrumentation-administrator"
        const val VAULT = "air-instrumentation-vault"
    }
}
