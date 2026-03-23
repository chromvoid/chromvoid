package com.chromvoid.app

import android.content.ComponentName
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.app.autofill.AutofillFocusedFieldCandidate
import com.chromvoid.app.autofill.AutofillOtpCandidate
import com.chromvoid.app.autofill.AutofillRequestContext
import com.chromvoid.app.autofill.AutofillRequestResolver
import com.chromvoid.app.autofill.AutofillSessionKeys
import com.chromvoid.app.autofill.AutofillSessionMetadata
import com.chromvoid.app.autofill.AutofillStrategyKind
import com.chromvoid.app.autofill.InMemoryAutofillSessionStore
import com.chromvoid.app.autofill.ParsedStepKind
import com.chromvoid.app.shared.SystemAndroidClock
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AutofillRequestStrategyTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun nativeStrategy_resolvesCredentialStep_withoutCompatProxyBehavior() {
        val usernameId = AutofillTestUtils.newAutofillId(context)
        val passwordId = AutofillTestUtils.newAutofillId(context)

        val parsed =
            AutofillRequestResolver().resolve(
                context =
                    AutofillRequestContext(
                        requestId = 1,
                        compatMode = false,
                        activityComponent = ComponentName("com.android.chrome", "Main"),
                        normalizedDomain = "github.com",
                        focusedId = passwordId,
                        previousFocusedIds = emptyList(),
                        usernameFieldIds = listOf(usernameId),
                        passwordFieldIds = listOf(passwordId),
                        otpCandidates = emptyList(),
                        focusedFieldCandidates = emptyList(),
                        pageHintBlobs = listOf("sign in to github"),
                    ),
                sessionStore = InMemoryAutofillSessionStore(SystemAndroidClock),
            )

        assertEquals(AutofillStrategyKind.NATIVE, parsed!!.strategyKind)
        assertEquals(ParsedStepKind.PASSWORD, parsed.stepKind)
        assertEquals(listOf(usernameId), parsed.usernameFieldIds)
        assertEquals(listOf(passwordId), parsed.passwordFieldIds)
        assertEquals(listOf(usernameId, passwordId), parsed.credentialAnchorFieldIds)
    }

    @Test
    fun nativeStrategy_resolvesOnlyExplicitOtp_andDoesNotUseProxyFallback() {
        val passwordId = AutofillTestUtils.newAutofillId(context)
        val focusedProxyId = AutofillTestUtils.newAutofillId(context)

        val parsed =
            AutofillRequestResolver().resolve(
                context =
                    AutofillRequestContext(
                        requestId = 1,
                        compatMode = false,
                        activityComponent = ComponentName("com.android.chrome", "Main"),
                        normalizedDomain = "github.com",
                        focusedId = focusedProxyId,
                        previousFocusedIds = emptyList(),
                        usernameFieldIds = emptyList(),
                        passwordFieldIds = listOf(passwordId),
                        otpCandidates = emptyList(),
                        focusedFieldCandidates =
                            listOf(
                                AutofillFocusedFieldCandidate(
                                    autofillId = focusedProxyId,
                                    parentPath = "root/form",
                                    order = 0,
                                    visible = true,
                                    fillable = true,
                                    focused = true,
                                ),
                            ),
                        pageHintBlobs = listOf("continue"),
                    ),
                sessionStore = InMemoryAutofillSessionStore(SystemAndroidClock),
            )

        assertEquals(ParsedStepKind.PASSWORD, parsed!!.stepKind)
        assertEquals(emptyList<android.view.autofill.AutofillId>(), parsed.otpFieldIds)
        assertEquals(listOf(passwordId), parsed.passwordFieldIds)
    }

    @Test
    fun compatStrategy_usesSingleFallbackSessionForDomainlessProxyRequest() {
        val activityComponent = ComponentName("org.mozilla.firefox", "org.mozilla.fenix.App")
        val sessionStore = InMemoryAutofillSessionStore(SystemAndroidClock)
        val sessionKey = AutofillSessionKeys.create(activityComponent, "github.com")!!
        val focusedProxyId = AutofillTestUtils.newAutofillId(context)

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
        sessionStore.markOtpResponseShown(
            sessionKey = sessionKey,
            metadata = AutofillSessionMetadata(normalizedDomain = "github.com", strategyKind = AutofillStrategyKind.COMPAT),
        )

        val parsed =
            AutofillRequestResolver().resolve(
                context =
                    AutofillRequestContext(
                        requestId = 1,
                        compatMode = true,
                        activityComponent = activityComponent,
                        normalizedDomain = null,
                        focusedId = focusedProxyId,
                        previousFocusedIds = emptyList(),
                        usernameFieldIds = emptyList(),
                        passwordFieldIds = emptyList(),
                        otpCandidates = emptyList(),
                        focusedFieldCandidates = emptyList(),
                        pageHintBlobs = emptyList(),
                    ),
                sessionStore = sessionStore,
            )

        assertEquals(AutofillStrategyKind.COMPAT, parsed!!.strategyKind)
        assertEquals("github.com", parsed.domain)
        assertEquals(ParsedStepKind.OTP, parsed.stepKind)
        assertEquals(listOf(focusedProxyId), parsed.otpFieldIds)
    }

    @Test
    fun compatStrategy_addsFocusedProxyToPasswordIds_afterUsernameFocus() {
        val activityComponent = ComponentName("org.mozilla.firefox", "org.mozilla.fenix.App")
        val usernameId = AutofillTestUtils.newAutofillId(context)
        val passwordId = AutofillTestUtils.newAutofillId(context)
        val focusedProxyId = AutofillTestUtils.newAutofillId(context)

        val parsed =
            AutofillRequestResolver().resolve(
                context =
                    AutofillRequestContext(
                        requestId = 1,
                        compatMode = true,
                        activityComponent = activityComponent,
                        normalizedDomain = "github.com",
                        focusedId = focusedProxyId,
                        previousFocusedIds = listOf(usernameId),
                        usernameFieldIds = listOf(usernameId),
                        passwordFieldIds = listOf(passwordId),
                        otpCandidates = emptyList(),
                        focusedFieldCandidates = emptyList(),
                        pageHintBlobs = listOf("sign in to github"),
                    ),
                sessionStore = InMemoryAutofillSessionStore(SystemAndroidClock),
            )

        assertEquals(ParsedStepKind.PASSWORD, parsed!!.stepKind)
        assertEquals(listOf(usernameId), parsed.usernameFieldIds)
        assertEquals(listOf(passwordId, focusedProxyId), parsed.passwordFieldIds)
        assertEquals(listOf(focusedProxyId), parsed.credentialAnchorFieldIds)
    }

    @Test
    fun compatStrategy_rejectsDomainlessFallback_whenMultipleSessionsShareActivity() {
        val activityComponent = ComponentName("org.mozilla.firefox", "org.mozilla.fenix.App")
        val sessionStore = InMemoryAutofillSessionStore(SystemAndroidClock)

        listOf("github.com", "gitlab.com").forEach { domain ->
            val sessionKey = AutofillSessionKeys.create(activityComponent, domain)!!
            sessionStore.rememberRequestContext(
                sessionKey = sessionKey,
                metadata =
                    AutofillSessionMetadata(
                        activityComponent = activityComponent,
                        normalizedDomain = domain,
                        strategyKind = AutofillStrategyKind.COMPAT,
                    ),
                recentFocusedCredentialIds = emptyList(),
            )
            sessionStore.markOtpResponseShown(
                sessionKey = sessionKey,
                metadata = AutofillSessionMetadata(normalizedDomain = domain, strategyKind = AutofillStrategyKind.COMPAT),
            )
        }

        val parsed =
            AutofillRequestResolver().resolve(
                context =
                    AutofillRequestContext(
                        requestId = 1,
                        compatMode = true,
                        activityComponent = activityComponent,
                        normalizedDomain = null,
                        focusedId = AutofillTestUtils.newAutofillId(context),
                        previousFocusedIds = emptyList(),
                        usernameFieldIds = emptyList(),
                        passwordFieldIds = emptyList(),
                        otpCandidates = emptyList(),
                        focusedFieldCandidates = emptyList(),
                        pageHintBlobs = emptyList(),
                    ),
                sessionStore = sessionStore,
            )

        assertNull(parsed)
    }
}
