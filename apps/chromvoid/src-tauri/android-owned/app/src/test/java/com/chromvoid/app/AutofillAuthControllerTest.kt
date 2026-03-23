package com.chromvoid.app

import android.content.ComponentName
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.app.autofill.AutofillAuthArgs
import com.chromvoid.app.autofill.AutofillAuthController
import com.chromvoid.app.autofill.AutofillFocusedFieldCandidate
import com.chromvoid.app.autofill.AutofillOtpCandidate
import com.chromvoid.app.autofill.AutofillRequestContext
import com.chromvoid.app.autofill.AutofillSessionKeys
import com.chromvoid.app.autofill.AutofillSessionMetadata
import com.chromvoid.app.autofill.AutofillStrategyKind
import com.chromvoid.app.autofill.InMemoryAutofillSessionStore
import com.chromvoid.app.credentialprovider.OtpOption
import com.chromvoid.app.shared.BaseFakeBridgeGateway
import com.chromvoid.app.shared.SystemAndroidClock
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AutofillAuthControllerTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun reconcileArgs_prefersCompatOtpFollowUp_fromCurrentRequestContext() {
        val controller = AutofillAuthController(FakeBridge())
        val sessionStore = InMemoryAutofillSessionStore(SystemAndroidClock)
        val activityComponent = ComponentName("org.mozilla.firefox", "org.mozilla.fenix.App")
        val usernameId = AutofillTestUtils.newAutofillId(context)
        val passwordId = AutofillTestUtils.newAutofillId(context)
        val focusedProxyId = AutofillTestUtils.newAutofillId(context)
        val sessionKey = AutofillSessionKeys.create(activityComponent, "github.com")!!

        sessionStore.rememberRequestContext(
            sessionKey = sessionKey,
            metadata =
                AutofillSessionMetadata(
                    activityComponent = activityComponent,
                    normalizedDomain = "github.com",
                    strategyKind = AutofillStrategyKind.COMPAT,
                ),
            recentFocusedCredentialIds = listOf(usernameId, passwordId),
        )

        val resolved =
            controller.reconcileArgs(
                args =
                    AutofillAuthArgs(
                        sessionId = "sess-1",
                        credentialId = "cred-1",
                        domain = "github.com",
                        sessionKey = sessionKey,
                        strategyKind = AutofillStrategyKind.COMPAT,
                        usernameIds = listOf(usernameId),
                        passwordIds = listOf(passwordId),
                        otpIds = emptyList(),
                        stepKind = ChromVoidAutofillService.STEP_PASSWORD,
                        otpOptions = listOf(OtpOption("otp-1", "Main", "TOTP")),
                    ),
                requestContext =
                    AutofillRequestContext(
                        requestId = 0,
                        compatMode = true,
                        activityComponent = activityComponent,
                        normalizedDomain = "github.com",
                        focusedId = focusedProxyId,
                        previousFocusedIds = emptyList(),
                        usernameFieldIds = emptyList(),
                        passwordFieldIds = emptyList(),
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
                sessionStore = sessionStore,
            )

        assertEquals(ChromVoidAutofillService.STEP_OTP, resolved.stepKind)
        assertTrue(resolved.usernameIds.isEmpty())
        assertTrue(resolved.passwordIds.isEmpty())
        assertEquals(listOf(focusedProxyId), resolved.otpIds)
    }

    @Test
    fun reconcileArgs_keepsResolvedOtpId_andFocusedProxy_forCompatOtpAuth() {
        val controller = AutofillAuthController(FakeBridge())
        val sessionStore = InMemoryAutofillSessionStore(SystemAndroidClock)
        val activityComponent = ComponentName("org.mozilla.firefox", "org.mozilla.fenix.App")
        val resolvedOtpId = AutofillTestUtils.newAutofillId(context)
        val focusedProxyId = AutofillTestUtils.newAutofillId(context)
        val sessionKey = AutofillSessionKeys.create(activityComponent, "github.com")!!
        val metadata =
            AutofillSessionMetadata(
                activityComponent = activityComponent,
                normalizedDomain = "github.com",
                strategyKind = AutofillStrategyKind.COMPAT,
            )

        sessionStore.rememberRequestContext(
            sessionKey = sessionKey,
            metadata = metadata,
            recentFocusedCredentialIds = emptyList(),
        )
        sessionStore.markPasswordFilled(sessionKey, metadata)

        val resolved =
            controller.reconcileArgs(
                args =
                    AutofillAuthArgs(
                        sessionId = "sess-1",
                        credentialId = "cred-1",
                        domain = "github.com",
                        sessionKey = sessionKey,
                        strategyKind = AutofillStrategyKind.COMPAT,
                        usernameIds = emptyList(),
                        passwordIds = emptyList(),
                        otpIds = emptyList(),
                        stepKind = ChromVoidAutofillService.STEP_OTP,
                        otpOptions = listOf(OtpOption("otp-1", "Main", "TOTP")),
                    ),
                requestContext =
                    AutofillRequestContext(
                        requestId = 0,
                        compatMode = true,
                        activityComponent = activityComponent,
                        normalizedDomain = "github.com",
                        focusedId = focusedProxyId,
                        previousFocusedIds = emptyList(),
                        usernameFieldIds = emptyList(),
                        passwordFieldIds = emptyList(),
                        otpCandidates =
                            listOf(
                                AutofillOtpCandidate(
                                    autofillId = resolvedOtpId,
                                    parentPath = "root/form/otp",
                                    order = 0,
                                    visible = true,
                                    fillable = true,
                                    focused = false,
                                ),
                            ),
                        focusedFieldCandidates = emptyList(),
                        pageHintBlobs = listOf("enter your one-time code"),
                    ),
                sessionStore = sessionStore,
            )

        assertEquals(ChromVoidAutofillService.STEP_OTP, resolved.stepKind)
        assertEquals(listOf(resolvedOtpId, focusedProxyId), resolved.otpIds)
    }

    @Test
    fun reconcileArgs_addsFocusedProxyToPasswordIds_afterUsernameFocus() {
        val controller = AutofillAuthController(FakeBridge())
        val sessionStore = InMemoryAutofillSessionStore(SystemAndroidClock)
        val activityComponent = ComponentName("org.mozilla.firefox", "org.mozilla.fenix.App")
        val usernameId = AutofillTestUtils.newAutofillId(context)
        val passwordId = AutofillTestUtils.newAutofillId(context)
        val focusedProxyId = AutofillTestUtils.newAutofillId(context)
        val sessionKey = AutofillSessionKeys.create(activityComponent, "github.com")!!

        val resolved =
            controller.reconcileArgs(
                args =
                    AutofillAuthArgs(
                        sessionId = "sess-1",
                        credentialId = "cred-1",
                        domain = "github.com",
                        sessionKey = sessionKey,
                        strategyKind = AutofillStrategyKind.COMPAT,
                        usernameIds = listOf(usernameId),
                        passwordIds = listOf(passwordId),
                        otpIds = emptyList(),
                        stepKind = ChromVoidAutofillService.STEP_PASSWORD,
                        otpOptions = emptyList(),
                    ),
                requestContext =
                    AutofillRequestContext(
                        requestId = 0,
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
                sessionStore = sessionStore,
            )

        assertEquals(ChromVoidAutofillService.STEP_PASSWORD, resolved.stepKind)
        assertEquals(listOf(usernameId), resolved.usernameIds)
        assertEquals(listOf(passwordId, focusedProxyId), resolved.passwordIds)
    }

    @Test
    fun reconcileArgs_preservesOriginalOtpIds_inCompatMode_whenGeckoViewRegeneratesIds() {
        val controller = AutofillAuthController(FakeBridge())
        val sessionStore = InMemoryAutofillSessionStore(SystemAndroidClock)
        val activityComponent = ComponentName("org.mozilla.firefox", "org.mozilla.fenix.App")
        val originalOtpId = AutofillTestUtils.newAutofillId(context)
        val transientFocusedId = AutofillTestUtils.newAutofillId(context)
        val sessionKey = AutofillSessionKeys.create(activityComponent, "github.com")!!
        val metadata =
            AutofillSessionMetadata(
                activityComponent = activityComponent,
                normalizedDomain = "github.com",
                strategyKind = AutofillStrategyKind.COMPAT,
            )

        sessionStore.rememberRequestContext(
            sessionKey = sessionKey,
            metadata = metadata,
            recentFocusedCredentialIds = emptyList(),
        )
        sessionStore.markPasswordFilled(sessionKey, metadata)

        val resolved =
            controller.reconcileArgs(
                args =
                    AutofillAuthArgs(
                        sessionId = "sess-1",
                        credentialId = "cred-1",
                        domain = "github.com",
                        sessionKey = sessionKey,
                        strategyKind = AutofillStrategyKind.COMPAT,
                        usernameIds = emptyList(),
                        passwordIds = emptyList(),
                        otpIds = listOf(originalOtpId),
                        stepKind = ChromVoidAutofillService.STEP_OTP,
                        otpOptions = listOf(OtpOption("otp-1", "Main", "TOTP")),
                    ),
                requestContext =
                    AutofillRequestContext(
                        requestId = 0,
                        compatMode = true,
                        activityComponent = activityComponent,
                        normalizedDomain = "github.com",
                        focusedId = transientFocusedId,
                        previousFocusedIds = emptyList(),
                        usernameFieldIds = emptyList(),
                        passwordFieldIds = emptyList(),
                        otpCandidates = emptyList(),
                        focusedFieldCandidates = emptyList(),
                        pageHintBlobs = emptyList(),
                    ),
                sessionStore = sessionStore,
            )

        assertEquals(ChromVoidAutofillService.STEP_OTP, resolved.stepKind)
        assertEquals(listOf(originalOtpId), resolved.otpIds)
    }

    private class FakeBridge : BaseFakeBridgeGateway()
}
