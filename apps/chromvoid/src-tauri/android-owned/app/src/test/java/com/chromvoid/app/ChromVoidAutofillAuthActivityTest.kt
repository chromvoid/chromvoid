package com.chromvoid.app

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.view.autofill.AutofillManager
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.app.autofill.AutofillSessionKeys
import com.chromvoid.app.autofill.AutofillSessionMetadata
import com.chromvoid.app.autofill.AutofillStrategyKind
import com.chromvoid.app.autofill.InMemoryAutofillSessionStore
import com.chromvoid.app.credentialprovider.AutofillSecret
import com.chromvoid.app.credentialprovider.BridgeError
import com.chromvoid.app.credentialprovider.BridgeResult
import com.chromvoid.app.shared.SystemAndroidClock
import com.chromvoid.app.shared.BaseFakeBridgeGateway
import com.chromvoid.app.shared.TestAndroidAppGraph
import com.chromvoid.app.shared.UnsupportedPasskeyMetadataStore
import com.chromvoid.app.shared.installTestAppGraph
import com.chromvoid.app.shared.resetTestAppGraph
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.shadows.ShadowAlertDialog
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChromVoidAutofillAuthActivityTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @After
    fun tearDown() {
        resetTestAppGraph()
    }

    @Test
    fun success_returnsAuthenticatedDatasetWithUsernameAndPasswordValues() {
        val fake = FakeBridge()
        fake.secretResponse = BridgeResult.Success(AutofillSecret("alice@example.com", "pw-123", null))
        installTestAppGraph(TestAndroidAppGraph(fake, UnsupportedPasskeyMetadataStore))

        val usernameId = AutofillTestUtils.newAutofillId(context)
        val passwordId = AutofillTestUtils.newAutofillId(context)

        val intent =
            Intent(context, ChromVoidAutofillAuthActivity::class.java).apply {
                putExtra(ChromVoidAutofillService.EXTRA_SESSION_ID, "sess-1")
                putExtra(ChromVoidAutofillService.EXTRA_CREDENTIAL_ID, "cred-1")
                putExtra(ChromVoidAutofillService.EXTRA_STEP_KIND, ChromVoidAutofillService.STEP_PASSWORD)
                putParcelableArrayListExtra(
                    ChromVoidAutofillService.EXTRA_USERNAME_IDS,
                    arrayListOf(usernameId),
                )
                putParcelableArrayListExtra(
                    ChromVoidAutofillService.EXTRA_PASSWORD_IDS,
                    arrayListOf(passwordId),
                )
            }

        val activity =
            Robolectric.buildActivity(ChromVoidAutofillAuthActivity::class.java, intent)
                .setup()
                .get()
        val shadow = shadowOf(activity)

        assertEquals(android.app.Activity.RESULT_OK, shadow.resultCode)
        val resultIntent = shadow.resultIntent
        assertNotNull(resultIntent)

        @Suppress("DEPRECATION")
        val dataset =
            resultIntent!!
                .getParcelableExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT) as android.service.autofill.Dataset?
        assertNotNull(dataset)

        val map = AutofillTestUtils.datasetFieldValueMap(dataset!!)
        assertTrue(map.keys.contains(usernameId))
        assertTrue(map.keys.contains(passwordId))
        assertEquals("alice@example.com", map[usernameId]?.textValue)
        assertEquals("pw-123", map[passwordId]?.textValue)
        assertEquals(1, fake.getSecretCalls)
    }

    @Test
    fun success_returnsAuthenticatedDatasetWithResolvedCredentialTargetsOnly() {
        val fake = FakeBridge()
        fake.secretResponse = BridgeResult.Success(AutofillSecret("alice@example.com", "pw-123", null))
        installTestAppGraph(TestAndroidAppGraph(fake, UnsupportedPasskeyMetadataStore))

        val usernameId = AutofillTestUtils.newAutofillId(context)
        val passwordId = AutofillTestUtils.newAutofillId(context)

        val intent =
            Intent(context, ChromVoidAutofillAuthActivity::class.java).apply {
                putExtra(ChromVoidAutofillService.EXTRA_SESSION_ID, "sess-1")
                putExtra(ChromVoidAutofillService.EXTRA_CREDENTIAL_ID, "cred-1")
                putExtra(ChromVoidAutofillService.EXTRA_STEP_KIND, ChromVoidAutofillService.STEP_PASSWORD)
                putParcelableArrayListExtra(
                    ChromVoidAutofillService.EXTRA_USERNAME_IDS,
                    arrayListOf(usernameId),
                )
                putParcelableArrayListExtra(
                    ChromVoidAutofillService.EXTRA_PASSWORD_IDS,
                    arrayListOf(passwordId),
                )
            }

        val activity =
            Robolectric.buildActivity(ChromVoidAutofillAuthActivity::class.java, intent)
                .setup()
                .get()
        val shadow = shadowOf(activity)

        assertEquals(android.app.Activity.RESULT_OK, shadow.resultCode)
        @Suppress("DEPRECATION")
        val dataset =
            shadow.resultIntent!!
                .getParcelableExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT) as android.service.autofill.Dataset?
        val map = AutofillTestUtils.datasetFieldValueMap(dataset!!)
        assertEquals("alice@example.com", map[usernameId]?.textValue)
        assertEquals("pw-123", map[passwordId]?.textValue)
    }

    @Test
    fun successfulPasswordStep_marksDomainForFollowUpOtpFallback() {
        val fake = FakeBridge()
        fake.secretResponse = BridgeResult.Success(AutofillSecret("alice@example.com", "pw-123", null))
        val sessionStore = InMemoryAutofillSessionStore(SystemAndroidClock)
        installTestAppGraph(
            TestAndroidAppGraph(
                bridgeGateway = fake,
                passkeyMetadataStore = UnsupportedPasskeyMetadataStore,
                autofillSessionStore = sessionStore,
            ),
        )

        val passwordId = AutofillTestUtils.newAutofillId(context)
        val activityComponent = ComponentName("org.mozilla.firefox", "org.mozilla.fenix.App")
        val sessionKey = AutofillSessionKeys.create(activityComponent, "github.com")!!
        sessionStore.rememberRequestContext(
            sessionKey = sessionKey,
            metadata =
                AutofillSessionMetadata(
                    activityComponent = activityComponent,
                    normalizedDomain = "github.com",
                    strategyKind = AutofillStrategyKind.COMPAT,
                ),
            recentFocusedCredentialIds = emptyList(),
        )
        val intent =
            Intent(context, ChromVoidAutofillAuthActivity::class.java).apply {
                putExtra(ChromVoidAutofillService.EXTRA_SESSION_ID, "sess-1")
                putExtra(ChromVoidAutofillService.EXTRA_CREDENTIAL_ID, "cred-1")
                putExtra(ChromVoidAutofillService.EXTRA_DOMAIN, "github.com")
                putExtra(ChromVoidAutofillService.EXTRA_STEP_KIND, ChromVoidAutofillService.STEP_PASSWORD)
                putExtra(ChromVoidAutofillService.EXTRA_AUTOFILL_SESSION_KEY, sessionKey)
                putExtra(
                    ChromVoidAutofillService.EXTRA_AUTOFILL_STRATEGY_KIND,
                    AutofillStrategyKind.COMPAT.wireValue,
                )
                putParcelableArrayListExtra(
                    ChromVoidAutofillService.EXTRA_PASSWORD_IDS,
                    arrayListOf(passwordId),
                )
            }

        Robolectric.buildActivity(ChromVoidAutofillAuthActivity::class.java, intent)
            .setup()
            .get()

        assertTrue(sessionStore.read(sessionKey)?.lastSuccessfulPasswordFillAtMs != null)
    }

    @Test
    fun blankPassword_failsClosed() {
        val fake = FakeBridge()
        fake.secretResponse = BridgeResult.Success(AutofillSecret("alice@example.com", "", null))
        installTestAppGraph(TestAndroidAppGraph(fake, UnsupportedPasskeyMetadataStore))

        val passwordId = AutofillTestUtils.newAutofillId(context)
        val intent =
            Intent(context, ChromVoidAutofillAuthActivity::class.java).apply {
                putExtra(ChromVoidAutofillService.EXTRA_SESSION_ID, "sess-1")
                putExtra(ChromVoidAutofillService.EXTRA_CREDENTIAL_ID, "cred-1")
                putExtra(ChromVoidAutofillService.EXTRA_STEP_KIND, ChromVoidAutofillService.STEP_PASSWORD)
                putParcelableArrayListExtra(
                    ChromVoidAutofillService.EXTRA_PASSWORD_IDS,
                    arrayListOf(passwordId),
                )
            }

        val activity =
            Robolectric.buildActivity(ChromVoidAutofillAuthActivity::class.java, intent)
                .setup()
                .get()
        val shadow = shadowOf(activity)

        assertEquals(android.app.Activity.RESULT_CANCELED, shadow.resultCode)
        assertEquals(1, fake.getSecretCalls)
    }

    @Test
    fun otpStep_singleTotp_fillsOtpField() {
        val fake = FakeBridge()
        fake.secretResponse = BridgeResult.Success(AutofillSecret("", null, "123456"))
        installTestAppGraph(TestAndroidAppGraph(fake, UnsupportedPasskeyMetadataStore))

        val otpId = AutofillTestUtils.newAutofillId(context)
        val intent =
            Intent(context, ChromVoidAutofillAuthActivity::class.java).apply {
                putExtra(ChromVoidAutofillService.EXTRA_SESSION_ID, "sess-otp")
                putExtra(ChromVoidAutofillService.EXTRA_CREDENTIAL_ID, "cred-otp")
                putExtra(ChromVoidAutofillService.EXTRA_STEP_KIND, ChromVoidAutofillService.STEP_OTP)
                putParcelableArrayListExtra(
                    ChromVoidAutofillService.EXTRA_OTP_IDS,
                    arrayListOf(otpId),
                )
                putOtpOptions(listOf("otp-1" to ("Main" to "TOTP")))
            }

        val activity =
            Robolectric.buildActivity(ChromVoidAutofillAuthActivity::class.java, intent)
                .setup()
                .get()
        val shadow = shadowOf(activity)
        assertEquals(android.app.Activity.RESULT_OK, shadow.resultCode)

        @Suppress("DEPRECATION")
        val dataset =
            shadow.resultIntent!!
                .getParcelableExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT) as android.service.autofill.Dataset?
        val map = AutofillTestUtils.datasetFieldValueMap(dataset!!)
        assertEquals("123456", map[otpId]?.textValue)
        assertEquals("otp-1", fake.lastOtpId)
    }

    @Test
    fun otpStep_multipleOptions_showsSelector_andFillsChosenOtp() {
        val fake = FakeBridge()
        fake.secretResponse = BridgeResult.Success(AutofillSecret("", null, "654321"))
        installTestAppGraph(TestAndroidAppGraph(fake, UnsupportedPasskeyMetadataStore))

        val otpId = AutofillTestUtils.newAutofillId(context)
        val intent =
            Intent(context, ChromVoidAutofillAuthActivity::class.java).apply {
                putExtra(ChromVoidAutofillService.EXTRA_SESSION_ID, "sess-otp")
                putExtra(ChromVoidAutofillService.EXTRA_CREDENTIAL_ID, "cred-otp")
                putExtra(ChromVoidAutofillService.EXTRA_STEP_KIND, ChromVoidAutofillService.STEP_OTP)
                putParcelableArrayListExtra(
                    ChromVoidAutofillService.EXTRA_OTP_IDS,
                    arrayListOf(otpId),
                )
                putOtpOptions(
                    listOf(
                        "otp-1" to ("Main" to "TOTP"),
                        "otp-2" to ("Backup" to "TOTP"),
                    ),
                )
            }

        val activity =
            Robolectric.buildActivity(ChromVoidAutofillAuthActivity::class.java, intent)
                .setup()
                .get()
        val dialog = ShadowAlertDialog.getLatestAlertDialog()
        assertNotNull(dialog)
        dialog!!.getListView().performItemClick(
            dialog.getListView().getChildAt(1),
            1,
            dialog.getListView().adapter.getItemId(1),
        )

        val shadow = shadowOf(activity)
        assertEquals(android.app.Activity.RESULT_OK, shadow.resultCode)
        assertEquals("otp-2", fake.lastOtpId)
    }

    @Test
    fun otpStep_hotp_failsClosed() {
        val fake = FakeBridge()
        installTestAppGraph(TestAndroidAppGraph(fake, UnsupportedPasskeyMetadataStore))

        val otpId = AutofillTestUtils.newAutofillId(context)
        val intent =
            Intent(context, ChromVoidAutofillAuthActivity::class.java).apply {
                putExtra(ChromVoidAutofillService.EXTRA_SESSION_ID, "sess-otp")
                putExtra(ChromVoidAutofillService.EXTRA_CREDENTIAL_ID, "cred-otp")
                putExtra(ChromVoidAutofillService.EXTRA_STEP_KIND, ChromVoidAutofillService.STEP_OTP)
                putParcelableArrayListExtra(
                    ChromVoidAutofillService.EXTRA_OTP_IDS,
                    arrayListOf(otpId),
                )
                putOtpOptions(listOf("otp-1" to ("Counter" to "HOTP")))
            }

        val activity =
            Robolectric.buildActivity(ChromVoidAutofillAuthActivity::class.java, intent)
                .setup()
                .get()
        val shadow = shadowOf(activity)
        assertEquals(android.app.Activity.RESULT_CANCELED, shadow.resultCode)
        assertEquals(0, fake.getSecretCalls)
    }

    @Test
    fun otpStep_hotp_failsClosed_whenOtpTypeKeyIsUsed() {
        val fake = FakeBridge()
        installTestAppGraph(TestAndroidAppGraph(fake, UnsupportedPasskeyMetadataStore))

        val otpId = AutofillTestUtils.newAutofillId(context)
        val intent =
            Intent(context, ChromVoidAutofillAuthActivity::class.java).apply {
                putExtra(ChromVoidAutofillService.EXTRA_SESSION_ID, "sess-otp")
                putExtra(ChromVoidAutofillService.EXTRA_CREDENTIAL_ID, "cred-otp")
                putExtra(ChromVoidAutofillService.EXTRA_STEP_KIND, ChromVoidAutofillService.STEP_OTP)
                putParcelableArrayListExtra(
                    ChromVoidAutofillService.EXTRA_OTP_IDS,
                    arrayListOf(otpId),
                )
                putOtpOptions(listOf("otp-1" to ("Counter" to "HOTP")))
            }

        val activity =
            Robolectric.buildActivity(ChromVoidAutofillAuthActivity::class.java, intent)
                .setup()
                .get()
        val shadow = shadowOf(activity)
        assertEquals(android.app.Activity.RESULT_CANCELED, shadow.resultCode)
        assertEquals(0, fake.getSecretCalls)
    }

    private class FakeBridge : BaseFakeBridgeGateway() {
        var secretResponse: BridgeResult<AutofillSecret> =
            BridgeResult.Failure(
                BridgeError("INTERNAL", "secret unavailable"),
            )
        var getSecretCalls = 0
        var lastOtpId: String? = null

        override fun autofillGetSecret(
            sessionId: String,
            credentialId: String,
            otpId: String?,
        ): BridgeResult<AutofillSecret> {
            getSecretCalls += 1
            lastOtpId = otpId
            return secretResponse
        }
    }

    private fun Intent.putOtpOptions(options: List<Pair<String, Pair<String, String>>>) {
        putStringArrayListExtra(
            ChromVoidAutofillService.EXTRA_OTP_OPTION_IDS,
            ArrayList(options.map { it.first }),
        )
        putStringArrayListExtra(
            ChromVoidAutofillService.EXTRA_OTP_OPTION_LABELS,
            ArrayList(options.map { it.second.first }),
        )
        putStringArrayListExtra(
            ChromVoidAutofillService.EXTRA_OTP_OPTION_TYPES,
            ArrayList(options.map { it.second.second }),
        )
    }
}
