package com.chromvoid.app

import android.content.ComponentName
import android.content.Context
import android.service.autofill.Dataset
import android.service.autofill.FillResponse
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.app.autofill.AutofillFocusedFieldCandidate
import com.chromvoid.app.autofill.AutofillDatasetFactory
import com.chromvoid.app.autofill.AutofillOtpCandidate
import com.chromvoid.app.autofill.AutofillOtpFieldResolver
import com.chromvoid.app.autofill.AutofillRequestContext
import com.chromvoid.app.autofill.AutofillRequestResolver
import com.chromvoid.app.autofill.AutofillResolvedStepKind
import com.chromvoid.app.autofill.AutofillSessionKeys
import com.chromvoid.app.autofill.AutofillSessionMetadata
import com.chromvoid.app.autofill.AutofillStrategyKind
import com.chromvoid.app.autofill.InMemoryAutofillSessionStore
import com.chromvoid.app.autofill.ParsedAutofillRequest
import com.chromvoid.app.autofill.ParsedStepKind
import com.chromvoid.app.shared.SystemAndroidClock
import com.chromvoid.app.credentialprovider.AutofillCandidate
import com.chromvoid.app.credentialprovider.OtpOption
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChromVoidAutofillServiceTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun authenticatedDataset_isFieldBound_toUsernameAndPasswordTargets() {
        // This is a regression test for SPEC-216 `A-009`.
        //
        // Current implementation builds an authenticated Dataset without any field bindings,
        // which results in Chrome/IME showing unrelated suggestions and never providing password autofill.
        val service = Robolectric.setupService(ChromVoidAutofillService::class.java)

        val usernameId = AutofillTestUtils.newAutofillId(context)
        val passwordId = AutofillTestUtils.newAutofillId(context)

        val parsedRequest =
            constructParsedRequest(
                origin = "https://github.com",
                domain = "github.com",
                usernameIds = listOf(usernameId),
                passwordIds = listOf(passwordId),
            )
        val candidate =
            JSONObject()
                .put("credential_id", "cred-1")
                .put("username", "alice@example.com")
                .put("label", "Alice")

        val dataset =
            invokeBuildAuthenticatedDataset(service, parsedRequest, "sess-1", candidate)
        assertNotNull(dataset)

        val fieldIds = AutofillTestUtils.datasetFieldIds(dataset!!)
        // This assertion is expected to FAIL until Stage 4 fixes Dataset binding.
        assertTrue("expected username field id to be bound", fieldIds.contains(usernameId))
        assertTrue("expected password field id to be bound", fieldIds.contains(passwordId))

        // Dataset must be authenticated (final values are returned via auth activity).
        assertNotNull(AutofillTestUtils.datasetAuthentication(dataset))
    }

    @Test
    fun authenticatedDataset_bindsCredentialAnchorIds_withoutTouchingSeparateCredentialFillIds() {
        val service = Robolectric.setupService(ChromVoidAutofillService::class.java)

        val usernameFillId = AutofillTestUtils.newAutofillId(context)
        val passwordFillId = AutofillTestUtils.newAutofillId(context)
        val credentialAnchorId = AutofillTestUtils.newAutofillId(context)

        val parsedRequest =
            constructParsedRequest(
                origin = "https://github.com",
                domain = "github.com",
                usernameIds = listOf(usernameFillId),
                passwordIds = listOf(passwordFillId),
                credentialAnchorIds = listOf(credentialAnchorId),
            )
        val candidate =
            JSONObject()
                .put("credential_id", "cred-anchor")
                .put("username", "alice@example.com")
                .put("label", "Alice")

        val dataset =
            invokeBuildAuthenticatedDataset(service, parsedRequest, "sess-anchor", candidate)
        assertNotNull(dataset)
        assertEquals(listOf(credentialAnchorId), AutofillTestUtils.datasetFieldIds(dataset!!))
    }

    @Test
    fun authenticatedDataset_omitsInlinePresentation_forPasswordStep() {
        val service = Robolectric.setupService(ChromVoidAutofillService::class.java)

        val passwordId = AutofillTestUtils.newAutofillId(context)
        val parsedRequest =
            constructParsedRequest(
                origin = "https://github.com",
                domain = "github.com",
                usernameIds = emptyList(),
                passwordIds = listOf(passwordId),
            )
        val candidate =
            JSONObject()
                .put("credential_id", "cred-inline")
                .put("username", "inline@example.com")
                .put("label", "Inline")

        val dataset =
            invokeBuildAuthenticatedDataset(
                service = service,
                parsedRequest = parsedRequest,
                sessionId = "sess-inline",
                candidate = candidate,
            )
        assertNotNull(dataset)
        assertTrue(
            "expected password dataset to omit inline presentations",
            AutofillTestUtils.datasetInlinePresentations(dataset!!).isEmpty(),
        )
    }

    @Test
    fun authenticatedDataset_isFieldBound_toOtpTargets_forOtpStep() {
        val service = Robolectric.setupService(ChromVoidAutofillService::class.java)

        val otpId = AutofillTestUtils.newAutofillId(context)
        val parsedRequest =
            constructParsedRequest(
                origin = "https://github.com",
                domain = "github.com",
                usernameIds = emptyList(),
                passwordIds = emptyList(),
                otpIds = listOf(otpId),
            )
        val candidate =
            JSONObject()
                .put("credential_id", "cred-otp")
                .put("username", "alice@example.com")
                .put("label", "Alice")
                .put("otp_options", """[{"id":"otp-1","label":"Main","otp_type":"TOTP"}]""")

        val dataset =
            invokeBuildAuthenticatedDataset(service, parsedRequest, "sess-otp", candidate)
        assertNotNull(dataset)

        val fieldIds = AutofillTestUtils.datasetFieldIds(dataset!!)
        assertTrue("expected otp field id to be bound", fieldIds.contains(otpId))
        assertNotNull(AutofillTestUtils.datasetAuthentication(dataset))
    }

    @Test
    fun authenticatedDataset_bindsOtpAnchorIds_withoutTouchingSeparateOtpFillIds() {
        val service = Robolectric.setupService(ChromVoidAutofillService::class.java)

        val otpFillId = AutofillTestUtils.newAutofillId(context)
        val otpAnchorId = AutofillTestUtils.newAutofillId(context)
        val parsedRequest =
            constructParsedRequest(
                origin = "https://github.com",
                domain = "github.com",
                usernameIds = emptyList(),
                passwordIds = emptyList(),
                otpIds = listOf(otpFillId),
                otpAnchorIds = listOf(otpAnchorId),
            )
        val candidate =
            JSONObject()
                .put("credential_id", "cred-otp-anchor")
                .put("username", "alice@example.com")
                .put("label", "Alice")
                .put("otp_options", """[{"id":"otp-1","label":"Main","otp_type":"TOTP"}]""")

        val dataset =
            invokeBuildAuthenticatedDataset(service, parsedRequest, "sess-otp-anchor", candidate)
        assertNotNull(dataset)
        assertEquals(listOf(otpAnchorId), AutofillTestUtils.datasetFieldIds(dataset!!))
    }

    @Test
    fun authenticatedDataset_bindsOnlyOtpTargets_forOtpStep_evenWhenOtherIdsExist() {
        val service = Robolectric.setupService(ChromVoidAutofillService::class.java)

        val usernameId = AutofillTestUtils.newAutofillId(context)
        val passwordId = AutofillTestUtils.newAutofillId(context)
        val focusedOtpId = AutofillTestUtils.newAutofillId(context)
        val siblingOtpId = AutofillTestUtils.newAutofillId(context)
        val parsedRequest =
            constructParsedRequest(
                origin = "https://github.com",
                domain = "github.com",
                usernameIds = listOf(usernameId),
                passwordIds = listOf(passwordId),
                otpIds = listOf(focusedOtpId, siblingOtpId),
                stepKindName = "OTP",
            )
        val candidate =
            JSONObject()
                .put("credential_id", "cred-otp-only")
                .put("username", "alice@example.com")
                .put("label", "Alice")
                .put("otp_options", """[{"id":"otp-1","label":"Main","otp_type":"TOTP"}]""")

        val dataset =
            invokeBuildAuthenticatedDataset(service, parsedRequest, "sess-otp-only", candidate)
        assertNotNull(dataset)
        assertEquals(
            listOf(focusedOtpId, siblingOtpId),
            AutofillTestUtils.datasetFieldIds(dataset!!),
        )
    }

    @Test
    fun authenticatedDataset_omitsInlinePresentation_forOtpStep_whenInlineRequestIsAvailable() {
        val service = Robolectric.setupService(ChromVoidAutofillService::class.java)

        val otpId = AutofillTestUtils.newAutofillId(context)
        val parsedRequest =
            constructParsedRequest(
                origin = "https://github.com",
                domain = "github.com",
                usernameIds = emptyList(),
                passwordIds = emptyList(),
                otpIds = listOf(otpId),
            )
        val candidate =
            JSONObject()
                .put("credential_id", "cred-otp-inline")
                .put("username", "alice@example.com")
                .put("label", "Alice")
                .put("otp_options", """[{"id":"otp-1","label":"Main","otp_type":"TOTP"}]""")

        val dataset =
            invokeBuildAuthenticatedDataset(
                service = service,
                parsedRequest = parsedRequest,
                sessionId = "sess-otp-inline",
                candidate = candidate,
            )

        assertNotNull(dataset)
        assertTrue(
            "expected otp dataset to omit inline presentations",
            AutofillTestUtils.datasetInlinePresentations(dataset!!).isEmpty(),
        )
    }

    @Test
    fun authenticatedDataset_includesDialogPresentation_forOtpStep_onTiramisuPlus() {
        val service = Robolectric.setupService(ChromVoidAutofillService::class.java)

        val otpId = AutofillTestUtils.newAutofillId(context)
        val parsedRequest =
            constructParsedRequest(
                origin = "https://github.com",
                domain = "github.com",
                usernameIds = emptyList(),
                passwordIds = emptyList(),
                otpIds = listOf(otpId),
            )
        val candidate =
            JSONObject()
                .put("credential_id", "cred-otp-dialog")
                .put("username", "alice@example.com")
                .put("label", "Alice")
                .put("otp_options", """[{"id":"otp-1","label":"Main","otp_type":"TOTP"}]""")

        val dataset =
            invokeBuildAuthenticatedDataset(service, parsedRequest, "sess-otp-dialog", candidate)

        assertNotNull(dataset)
        assertEquals(
            "expected otp dataset to expose dialog presentation on Android 13+",
            1,
            AutofillTestUtils.datasetDialogPresentations(dataset!!).size,
        )
        assertTrue(
            "expected otp dataset to keep anchored menu presentation",
            AutofillTestUtils.datasetMenuPresentations(dataset).isNotEmpty(),
        )
    }

    @Test
    fun authenticatedDataset_usesChromVoidSafeRemoteViewsLayout() {
        val service = Robolectric.setupService(ChromVoidAutofillService::class.java)

        val passwordId = AutofillTestUtils.newAutofillId(context)
        val parsedRequest =
            constructParsedRequest(
                origin = "https://github.com",
                domain = "github.com",
                usernameIds = emptyList(),
                passwordIds = listOf(passwordId),
            )
        val candidate =
            JSONObject()
                .put("credential_id", "cred-safe-layout")
                .put("username", "alice@example.com")
                .put("label", "Alice")

        val dataset =
            invokeBuildAuthenticatedDataset(service, parsedRequest, "sess-safe-layout", candidate)
        assertNotNull(dataset)
        assertEquals(
            "expected menu presentation to avoid framework two-line layout",
            R.layout.autofill_dataset_presentation,
            AutofillTestUtils.remoteViewsLayoutId(
                AutofillTestUtils.datasetMenuPresentations(dataset!!).first(),
            ),
        )
    }

    @Test
    fun otpFillResponse_doesNotForceFillDialogForOtpStep() {
        val service = Robolectric.setupService(ChromVoidAutofillService::class.java)

        val otpId = AutofillTestUtils.newAutofillId(context)
        val parsedRequest =
            constructParsedRequest(
                origin = "https://github.com",
                domain = "github.com",
                usernameIds = emptyList(),
                passwordIds = emptyList(),
                otpIds = listOf(otpId),
            )
        val candidate =
            JSONObject()
                .put("credential_id", "cred-otp-response")
                .put("username", "alice@example.com")
                .put("label", "Alice")
                .put("otp_options", """[{"id":"otp-1","label":"Main","otp_type":"TOTP"}]""")
        val dataset =
            invokeBuildAuthenticatedDataset(
                service = service,
                parsedRequest = parsedRequest,
                sessionId = "sess-otp-response",
                candidate = candidate,
            )
        assertNotNull(dataset)

        val responseBuilder = FillResponse.Builder()
        responseBuilder.addDataset(dataset!!)
        invokeMaybeConfigureFillDialog(
            service = service,
            responseBuilder = responseBuilder,
            parsedRequest = parsedRequest,
        )

        val response = responseBuilder.build()
        assertTrue(AutofillTestUtils.fillResponseDialogTriggerIds(response).isEmpty())
    }

    @Test
    fun firefoxLikeOtpSelection_prefersFocusedVisibleOtpCandidates_overHiddenPasswordFields() {
        val hiddenPasswordId = AutofillTestUtils.newAutofillId(context)
        val focusedOtpId = AutofillTestUtils.newAutofillId(context)
        val siblingOtpId = AutofillTestUtils.newAutofillId(context)

        val otpCandidates =
            listOf(
                AutofillOtpCandidate(
                    autofillId = focusedOtpId,
                    parentPath = "root/form/otp",
                    order = 1,
                    visible = true,
                    fillable = true,
                    focused = true,
                ),
                AutofillOtpCandidate(
                    autofillId = siblingOtpId,
                    parentPath = "root/form/otp",
                    order = 2,
                    visible = true,
                    fillable = true,
                    focused = false,
                ),
            )

        assertEquals(
            AutofillResolvedStepKind.OTP,
            AutofillOtpFieldResolver.resolveStepKind(
                listOf(hiddenPasswordId),
                AutofillOtpFieldResolver.resolveExplicitOtpFieldIds(otpCandidates),
            ),
        )
        assertEquals(
            listOf(focusedOtpId, siblingOtpId),
            AutofillOtpFieldResolver.resolveExplicitOtpFieldIds(otpCandidates),
        )
    }

    @Test
    fun firefoxLikeOtpSelection_keepsFocusedOtpAnchorFirst_andFiltersToItsContext() {
        val unrelatedOtpId = AutofillTestUtils.newAutofillId(context)
        val focusedOtpId = AutofillTestUtils.newAutofillId(context)
        val siblingOtpId = AutofillTestUtils.newAutofillId(context)
        val hiddenOtpId = AutofillTestUtils.newAutofillId(context)

        val otpCandidates =
            listOf(
                AutofillOtpCandidate(
                    autofillId = unrelatedOtpId,
                    parentPath = "root/form/other",
                    order = 0,
                    visible = true,
                    fillable = true,
                    focused = false,
                ),
                AutofillOtpCandidate(
                    autofillId = focusedOtpId,
                    parentPath = "root/form/otp",
                    order = 1,
                    visible = true,
                    fillable = true,
                    focused = true,
                ),
                AutofillOtpCandidate(
                    autofillId = siblingOtpId,
                    parentPath = "root/form/otp",
                    order = 2,
                    visible = true,
                    fillable = true,
                    focused = false,
                ),
                AutofillOtpCandidate(
                    autofillId = hiddenOtpId,
                    parentPath = "root/form/otp",
                    order = 3,
                    visible = false,
                    fillable = true,
                    focused = false,
                ),
            )

        assertEquals(
            listOf(focusedOtpId, siblingOtpId),
            AutofillOtpFieldResolver.resolveExplicitOtpFieldIds(otpCandidates),
        )
    }

    @Test
    fun firefoxLikePasswordSelection_preservesPasswordStep_whenOtpCandidatesAreNotActive() {
        val passwordId = AutofillTestUtils.newAutofillId(context)
        val hiddenOtpId = AutofillTestUtils.newAutofillId(context)

        val otpCandidates =
            listOf(
                AutofillOtpCandidate(
                    autofillId = hiddenOtpId,
                    parentPath = "root/form/otp",
                    order = 0,
                    visible = false,
                    fillable = false,
                    focused = false,
                ),
            )

        assertEquals(
            AutofillResolvedStepKind.PASSWORD,
            AutofillOtpFieldResolver.resolveStepKind(
                listOf(passwordId),
                AutofillOtpFieldResolver.resolveExplicitOtpFieldIds(otpCandidates),
            ),
        )
    }

    @Test
    fun firefoxLikeOtpFallback_usesFocusedGenericField_whenPageLooksLikeOtp() {
        val passwordId = AutofillTestUtils.newAutofillId(context)
        val focusedOtpId = AutofillTestUtils.newAutofillId(context)
        val siblingOtpId = AutofillTestUtils.newAutofillId(context)

        val fallbackCandidates =
            listOf(
                AutofillFocusedFieldCandidate(
                    autofillId = focusedOtpId,
                    parentPath = "root/form/otp",
                    order = 0,
                    visible = true,
                    fillable = true,
                    focused = true,
                ),
                AutofillFocusedFieldCandidate(
                    autofillId = siblingOtpId,
                    parentPath = "root/form/otp",
                    order = 1,
                    visible = true,
                    fillable = true,
                    focused = false,
                ),
            )

        val otpFieldIds =
            AutofillOtpFieldResolver.resolveFallbackOtpFieldIds(
                pageHintBlob = "two-factor authentication enter the code from your authenticator app",
                focusedFieldCandidates = fallbackCandidates,
            )

        assertEquals(listOf(focusedOtpId, siblingOtpId), otpFieldIds)
        assertEquals(
            AutofillResolvedStepKind.OTP,
            AutofillOtpFieldResolver.resolveStepKind(listOf(passwordId), otpFieldIds),
        )
    }

    @Test
    fun firefoxLikeOtpFallback_isIgnored_withoutOtpPageContext() {
        val passwordId = AutofillTestUtils.newAutofillId(context)
        val focusedFieldId = AutofillTestUtils.newAutofillId(context)

        val fallbackCandidates =
            listOf(
                AutofillFocusedFieldCandidate(
                    autofillId = focusedFieldId,
                    parentPath = "root/form",
                    order = 0,
                    visible = true,
                    fillable = true,
                    focused = true,
                ),
            )

        val otpFieldIds =
            AutofillOtpFieldResolver.resolveFallbackOtpFieldIds(
                pageHintBlob = "sign in to github",
                focusedFieldCandidates = fallbackCandidates,
            )

        assertTrue(otpFieldIds.isEmpty())
        assertEquals(
            AutofillResolvedStepKind.PASSWORD,
            AutofillOtpFieldResolver.resolveStepKind(listOf(passwordId), otpFieldIds),
        )
    }

    @Test
    fun firefoxLikeOtpFallback_usesRecentPasswordAutofill_forFocusedGenericField() {
        val focusedOtpId = AutofillTestUtils.newAutofillId(context)
        val siblingOtpId = AutofillTestUtils.newAutofillId(context)

        val parsedRequest =
            resolveCompatRequest(
                webDomain = "github.com",
                focusedAutofillId = focusedOtpId,
                usernameFieldIds = emptyList(),
                passwordFieldIds = emptyList(),
                otpCandidates = emptyList(),
                focusedFieldCandidates =
                    listOf(
                        AutofillFocusedFieldCandidate(
                            autofillId = focusedOtpId,
                            parentPath = "root/form/otp",
                            order = 0,
                            visible = true,
                            fillable = true,
                            focused = true,
                        ),
                        AutofillFocusedFieldCandidate(
                            autofillId = siblingOtpId,
                            parentPath = "root/form/otp",
                            order = 1,
                            visible = true,
                            fillable = true,
                            focused = false,
                        ),
                    ),
                pageHintBlobs = listOf("continue"),
                markPasswordFilled = true,
            )

        assertEquals(ParsedStepKind.OTP, parsedRequest!!.stepKind)
        assertEquals(listOf(focusedOtpId, siblingOtpId), parsedRequest.otpFieldIds)
    }

    @Test
    fun firefoxLikeOtpFallback_usesRecentPasswordAutofill_forSingleUnfocusedGenericField() {
        val otpFieldId = AutofillTestUtils.newAutofillId(context)

        val parsedRequest =
            resolveCompatRequest(
                webDomain = "github.com",
                focusedAutofillId = otpFieldId,
                usernameFieldIds = emptyList(),
                passwordFieldIds = emptyList(),
                otpCandidates = emptyList(),
                focusedFieldCandidates =
                    listOf(
                        AutofillFocusedFieldCandidate(
                            autofillId = otpFieldId,
                            parentPath = "root/form/otp",
                            order = 0,
                            visible = true,
                            fillable = true,
                            focused = false,
                        ),
                    ),
                pageHintBlobs = listOf("continue"),
                markPasswordFilled = true,
            )

        assertEquals(ParsedStepKind.OTP, parsedRequest!!.stepKind)
        assertEquals(listOf(otpFieldId), parsedRequest.otpFieldIds)
    }

    @Test
    fun firefoxLikeOtpProxyFallback_usesRecentOtpResponse_forFocusedProxyField() {
        val focusedProxyId = AutofillTestUtils.newAutofillId(context)

        val parsedRequest =
            resolveCompatRequest(
                webDomain = null,
                focusedAutofillId = focusedProxyId,
                usernameFieldIds = emptyList(),
                passwordFieldIds = emptyList(),
                otpCandidates = emptyList(),
                focusedFieldCandidates = emptyList(),
                pageHintBlobs = emptyList(),
                seededDomain = "github.com",
                markOtpFilled = true,
            )

        assertEquals(ParsedStepKind.OTP, parsedRequest!!.stepKind)
        assertEquals("github.com", parsedRequest.domain)
        assertEquals(listOf(focusedProxyId), parsedRequest.otpFieldIds)
        assertEquals(listOf(focusedProxyId), parsedRequest.otpAnchorFieldIds)
    }

    @Test
    fun firefoxLikeOtpProxyFallback_fillsResolvedOtpTargets_andFocusedProxy_afterPasswordStep() {
        val resolvedOtpId = AutofillTestUtils.newAutofillId(context)
        val focusedProxyId = AutofillTestUtils.newAutofillId(context)

        val parsedRequest =
            resolveCompatRequest(
                webDomain = "github.com",
                focusedAutofillId = focusedProxyId,
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
                pageHintBlobs = emptyList(),
                markPasswordFilled = true,
            )

        assertEquals(ParsedStepKind.OTP, parsedRequest!!.stepKind)
        assertEquals(listOf(resolvedOtpId, focusedProxyId), parsedRequest.otpFieldIds)
        assertEquals(listOf(focusedProxyId), parsedRequest.otpAnchorFieldIds)
    }

    @Test
    fun firefoxLikeOtpProxyFallback_ignoresRecentOtpSignal_whenCredentialFieldsExist() {
        val focusedProxyId = AutofillTestUtils.newAutofillId(context)
        val usernameId = AutofillTestUtils.newAutofillId(context)
        val passwordId = AutofillTestUtils.newAutofillId(context)

        val parsedRequest =
            resolveCompatRequest(
                webDomain = "github.com",
                focusedAutofillId = focusedProxyId,
                usernameFieldIds = listOf(usernameId),
                passwordFieldIds = listOf(passwordId),
                otpCandidates = emptyList(),
                focusedFieldCandidates = emptyList(),
                pageHintBlobs = listOf("sign in to github"),
                markOtpFilled = true,
            )

        assertEquals(ParsedStepKind.PASSWORD, parsedRequest!!.stepKind)
        assertEquals(emptyList<android.view.autofill.AutofillId>(), parsedRequest.otpFieldIds)
        assertEquals(listOf(usernameId), parsedRequest.usernameFieldIds)
        assertEquals(listOf(passwordId), parsedRequest.passwordFieldIds)
        assertEquals(listOf(focusedProxyId), parsedRequest.credentialAnchorFieldIds)
    }

    @Test
    fun firefoxLikeCredentialProxyFallback_usesFocusedCompatId_asPasswordFillTarget_afterUsernameFocus() {
        val focusedProxyId = AutofillTestUtils.newAutofillId(context)
        val usernameId = AutofillTestUtils.newAutofillId(context)
        val passwordId = AutofillTestUtils.newAutofillId(context)

        val parsedRequest =
            resolveCompatRequest(
                webDomain = "github.com",
                focusedAutofillId = focusedProxyId,
                usernameFieldIds = listOf(usernameId),
                passwordFieldIds = listOf(passwordId),
                otpCandidates = emptyList(),
                focusedFieldCandidates = emptyList(),
                pageHintBlobs = listOf("sign in to github"),
                previousFocusedAutofillIds = listOf(usernameId),
            )

        assertEquals(ParsedStepKind.PASSWORD, parsedRequest!!.stepKind)
        assertEquals(listOf(usernameId), parsedRequest.usernameFieldIds)
        assertEquals(listOf(passwordId, focusedProxyId), parsedRequest.passwordFieldIds)
        assertEquals(listOf(focusedProxyId), parsedRequest.credentialAnchorFieldIds)
    }

    @Test
    fun firefoxLikeCredentialProxyFallback_ignoresObservedCompatIds_forCredentialFillTargets() {
        val passwordProxyId = AutofillTestUtils.newAutofillId(context)
        val usernameId = AutofillTestUtils.newAutofillId(context)
        val passwordId = AutofillTestUtils.newAutofillId(context)

        val parsedRequest =
            resolveCompatRequest(
                webDomain = "github.com",
                focusedAutofillId = passwordProxyId,
                usernameFieldIds = listOf(usernameId),
                passwordFieldIds = listOf(passwordId),
                otpCandidates = emptyList(),
                focusedFieldCandidates = emptyList(),
                pageHintBlobs = listOf("sign in to github"),
            )

        assertEquals(ParsedStepKind.PASSWORD, parsedRequest!!.stepKind)
        assertEquals(listOf(usernameId), parsedRequest.usernameFieldIds)
        assertEquals(listOf(passwordId), parsedRequest.passwordFieldIds)
        assertEquals(listOf(passwordProxyId), parsedRequest.credentialAnchorFieldIds)
    }

    @Test
    fun firefoxLikeCredentialProxyFallback_keepsProxyOutOfFillTargets_withoutFieldHistory() {
        val focusedProxyId = AutofillTestUtils.newAutofillId(context)
        val usernameId = AutofillTestUtils.newAutofillId(context)
        val passwordId = AutofillTestUtils.newAutofillId(context)

        val parsedRequest =
            resolveCompatRequest(
                webDomain = "github.com",
                focusedAutofillId = focusedProxyId,
                usernameFieldIds = listOf(usernameId),
                passwordFieldIds = listOf(passwordId),
                otpCandidates = emptyList(),
                focusedFieldCandidates = emptyList(),
                pageHintBlobs = listOf("sign in to github"),
            )

        assertEquals(ParsedStepKind.PASSWORD, parsedRequest!!.stepKind)
        assertEquals(listOf(usernameId), parsedRequest.usernameFieldIds)
        assertEquals(listOf(passwordId), parsedRequest.passwordFieldIds)
        assertEquals(listOf(focusedProxyId), parsedRequest.credentialAnchorFieldIds)
    }

    @Test
    fun firefoxLikeCredentialProxyFallback_prefersFocusedResolvedFieldAsAnchor() {
        val usernameId = AutofillTestUtils.newAutofillId(context)
        val passwordId = AutofillTestUtils.newAutofillId(context)

        val parsedRequest =
            resolveCompatRequest(
                webDomain = "github.com",
                focusedAutofillId = usernameId,
                usernameFieldIds = listOf(usernameId),
                passwordFieldIds = listOf(passwordId),
                otpCandidates = emptyList(),
                focusedFieldCandidates = emptyList(),
                pageHintBlobs = listOf("sign in to github"),
            )

        assertEquals(ParsedStepKind.PASSWORD, parsedRequest!!.stepKind)
        assertEquals(listOf(usernameId), parsedRequest.usernameFieldIds)
        assertEquals(listOf(passwordId), parsedRequest.passwordFieldIds)
        assertEquals(listOf(usernameId), parsedRequest.credentialAnchorFieldIds)
    }

    @Test
    fun firefoxLikeOtpFallback_ignoresRecentPasswordSignal_onCredentialPageProxyRequest() {
        val focusedProxyId = AutofillTestUtils.newAutofillId(context)
        val usernameId = AutofillTestUtils.newAutofillId(context)
        val passwordId = AutofillTestUtils.newAutofillId(context)

        val parsedRequest =
            resolveCompatRequest(
                webDomain = "github.com",
                focusedAutofillId = focusedProxyId,
                usernameFieldIds = listOf(usernameId),
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
                markPasswordFilled = true,
            )

        assertEquals(ParsedStepKind.PASSWORD, parsedRequest!!.stepKind)
        assertEquals(emptyList<android.view.autofill.AutofillId>(), parsedRequest.otpFieldIds)
        assertEquals(listOf(usernameId), parsedRequest.usernameFieldIds)
        assertEquals(listOf(passwordId), parsedRequest.passwordFieldIds)
        assertEquals(listOf(focusedProxyId), parsedRequest.credentialAnchorFieldIds)
    }

    @Test
    fun firefoxLikeOtpFallback_usesRecentPasswordSignal_onCredentialProxyFollowUpRequestAfterCredentialFocus() {
        val focusedProxyId = AutofillTestUtils.newAutofillId(context)
        val usernameId = AutofillTestUtils.newAutofillId(context)
        val passwordId = AutofillTestUtils.newAutofillId(context)

        val parsedRequest =
            resolveCompatRequest(
                webDomain = "github.com",
                focusedAutofillId = focusedProxyId,
                usernameFieldIds = listOf(usernameId),
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
                previousFocusedAutofillIds = listOf(usernameId),
                seededCredentialIds = listOf(usernameId, passwordId),
                markPasswordFilled = true,
            )

        assertEquals(ParsedStepKind.OTP, parsedRequest!!.stepKind)
        assertEquals(emptyList<android.view.autofill.AutofillId>(), parsedRequest.usernameFieldIds)
        assertEquals(emptyList<android.view.autofill.AutofillId>(), parsedRequest.passwordFieldIds)
        assertEquals(listOf(focusedProxyId), parsedRequest.otpFieldIds)
        assertEquals(listOf(focusedProxyId), parsedRequest.otpAnchorFieldIds)
    }

    @Test
    fun firefoxLikeOtpFallback_usesCredentialFocusHistory_whenCurrentCompatSnapshotHasOnlyProxyField() {
        val focusedProxyId = AutofillTestUtils.newAutofillId(context)
        val usernameId = AutofillTestUtils.newAutofillId(context)
        val passwordId = AutofillTestUtils.newAutofillId(context)

        val parsedRequest =
            resolveCompatRequest(
                webDomain = "github.com",
                focusedAutofillId = focusedProxyId,
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
                previousFocusedAutofillIds = listOf(passwordId),
                seededCredentialIds = listOf(usernameId, passwordId),
            )

        assertEquals(ParsedStepKind.OTP, parsedRequest!!.stepKind)
        assertEquals(emptyList<android.view.autofill.AutofillId>(), parsedRequest.usernameFieldIds)
        assertEquals(emptyList<android.view.autofill.AutofillId>(), parsedRequest.passwordFieldIds)
        assertEquals(listOf(focusedProxyId), parsedRequest.otpFieldIds)
        assertEquals(listOf(focusedProxyId), parsedRequest.otpAnchorFieldIds)
    }

    @Test
    fun firefoxLikeOtpFallback_keepsProxyFollowUpResolvable_whileSessionIsFresh() {
        val focusedFieldId = AutofillTestUtils.newAutofillId(context)
        val focusedCandidates =
            listOf(
                AutofillFocusedFieldCandidate(
                    autofillId = focusedFieldId,
                    parentPath = "root/form/otp",
                    order = 0,
                    visible = true,
                    fillable = true,
                    focused = true,
                ),
            )

        val firstRequest =
            resolveCompatRequest(
                webDomain = "github.com",
                focusedAutofillId = focusedFieldId,
                usernameFieldIds = emptyList(),
                passwordFieldIds = emptyList(),
                otpCandidates = emptyList(),
                focusedFieldCandidates = focusedCandidates,
                pageHintBlobs = listOf("continue"),
                markPasswordFilled = true,
            )
        val secondRequest =
            resolveCompatRequest(
                webDomain = "github.com",
                focusedAutofillId = focusedFieldId,
                usernameFieldIds = emptyList(),
                passwordFieldIds = emptyList(),
                otpCandidates = emptyList(),
                focusedFieldCandidates = focusedCandidates,
                pageHintBlobs = listOf("continue"),
                markPasswordFilled = true,
            )
        val thirdRequest =
            resolveCompatRequest(
                webDomain = "github.com",
                focusedAutofillId = focusedFieldId,
                usernameFieldIds = emptyList(),
                passwordFieldIds = emptyList(),
                otpCandidates = emptyList(),
                focusedFieldCandidates = focusedCandidates,
                pageHintBlobs = listOf("continue"),
                markPasswordFilled = true,
            )
        val fourthRequest =
            resolveCompatRequest(
                webDomain = "github.com",
                focusedAutofillId = focusedFieldId,
                usernameFieldIds = emptyList(),
                passwordFieldIds = emptyList(),
                otpCandidates = emptyList(),
                focusedFieldCandidates = focusedCandidates,
                pageHintBlobs = listOf("continue"),
                markPasswordFilled = true,
            )
        val fifthRequest =
            resolveCompatRequest(
                webDomain = "github.com",
                focusedAutofillId = focusedFieldId,
                usernameFieldIds = emptyList(),
                passwordFieldIds = emptyList(),
                otpCandidates = emptyList(),
                focusedFieldCandidates = focusedCandidates,
                pageHintBlobs = listOf("continue"),
                markPasswordFilled = true,
            )

        assertEquals(ParsedStepKind.OTP, firstRequest!!.stepKind)
        assertEquals(ParsedStepKind.OTP, secondRequest!!.stepKind)
        assertEquals(ParsedStepKind.OTP, thirdRequest!!.stepKind)
        assertEquals(ParsedStepKind.OTP, fourthRequest!!.stepKind)
        assertEquals(ParsedStepKind.OTP, fifthRequest!!.stepKind)
    }

    private fun constructParsedRequest(
        origin: String,
        domain: String,
        usernameIds: List<android.view.autofill.AutofillId>,
        passwordIds: List<android.view.autofill.AutofillId>,
        credentialAnchorIds: List<android.view.autofill.AutofillId> = usernameIds + passwordIds,
        otpIds: List<android.view.autofill.AutofillId> = emptyList(),
        otpAnchorIds: List<android.view.autofill.AutofillId> = otpIds,
        stepKindName: String? = null,
    ): ParsedAutofillRequest {
        val resolvedStepKindName =
            stepKindName ?: if (passwordIds.isNotEmpty()) {
                "PASSWORD"
            } else if (otpIds.isNotEmpty()) {
                "OTP"
            } else {
                "UNSUPPORTED"
            }
        val stepKind = ParsedStepKind.valueOf(resolvedStepKindName)
        return ParsedAutofillRequest(
            origin = origin,
            domain = domain,
            sessionKey = AutofillSessionKeys.create(compatActivityComponent(), domain) ?: domain,
            strategyKind = AutofillStrategyKind.NATIVE,
            usernameFieldIds = usernameIds,
            passwordFieldIds = passwordIds,
            credentialAnchorFieldIds = credentialAnchorIds,
            otpFieldIds = otpIds,
            otpAnchorFieldIds = otpAnchorIds,
            stepKind = stepKind,
        )
    }

    private fun resolveCompatRequest(
        webDomain: String?,
        focusedAutofillId: android.view.autofill.AutofillId?,
        usernameFieldIds: List<android.view.autofill.AutofillId>,
        passwordFieldIds: List<android.view.autofill.AutofillId>,
        otpCandidates: List<AutofillOtpCandidate>,
        focusedFieldCandidates: List<AutofillFocusedFieldCandidate>,
        pageHintBlobs: List<String>,
        previousFocusedAutofillIds: List<android.view.autofill.AutofillId> = emptyList(),
        seededDomain: String? = webDomain,
        seededCredentialIds: List<android.view.autofill.AutofillId> = emptyList(),
        markPasswordFilled: Boolean = false,
        markOtpFilled: Boolean = false,
    ): ParsedAutofillRequest? {
        val activityComponent = compatActivityComponent()
        val sessionStore = InMemoryAutofillSessionStore(SystemAndroidClock)
        seedCompatSession(
            sessionStore = sessionStore,
            activityComponent = activityComponent,
            domain = seededDomain,
            credentialIds = seededCredentialIds,
            markPasswordFilled = markPasswordFilled,
            markOtpFilled = markOtpFilled,
        )

        return AutofillRequestResolver().resolve(
            context =
                AutofillRequestContext(
                    requestId = 1,
                    compatMode = true,
                    activityComponent = activityComponent,
                    normalizedDomain = com.chromvoid.app.autofill.AutofillFieldClassifier.normalizeDomain(webDomain),
                    focusedId = focusedAutofillId,
                    previousFocusedIds = previousFocusedAutofillIds,
                    usernameFieldIds = usernameFieldIds,
                    passwordFieldIds = passwordFieldIds,
                    otpCandidates = otpCandidates,
                    focusedFieldCandidates = focusedFieldCandidates,
                    pageHintBlobs = pageHintBlobs,
                ),
            sessionStore = sessionStore,
        )
    }

    private fun seedCompatSession(
        sessionStore: InMemoryAutofillSessionStore,
        activityComponent: ComponentName,
        domain: String?,
        credentialIds: List<android.view.autofill.AutofillId>,
        markPasswordFilled: Boolean,
        markOtpFilled: Boolean,
    ) {
        val normalizedDomain = com.chromvoid.app.autofill.AutofillFieldClassifier.normalizeDomain(domain) ?: return
        val sessionKey = AutofillSessionKeys.create(activityComponent, normalizedDomain) ?: return
        val metadata =
            AutofillSessionMetadata(
                activityComponent = activityComponent,
                normalizedDomain = normalizedDomain,
                strategyKind = AutofillStrategyKind.COMPAT,
            )
        sessionStore.rememberRequestContext(
            sessionKey = sessionKey,
            metadata = metadata,
            recentFocusedCredentialIds = credentialIds,
        )
        if (markPasswordFilled) {
            sessionStore.markPasswordFilled(sessionKey, metadata)
        }
        if (markOtpFilled) {
            sessionStore.markOtpResponseShown(sessionKey, metadata)
        }
    }

    private fun compatActivityComponent(): ComponentName {
        return ComponentName("org.mozilla.firefox", "org.mozilla.fenix.App")
    }

    private fun invokeBuildAuthenticatedDataset(
        service: ChromVoidAutofillService,
        parsedRequest: ParsedAutofillRequest,
        sessionId: String,
        candidate: JSONObject,
    ): Dataset? {
        return AutofillDatasetFactory(service).buildAuthenticatedDataset(
            parsed = parsedRequest,
            sessionId = sessionId,
            candidate = candidate.toAutofillCandidate(),
        )
    }

    private fun invokeMaybeConfigureFillDialog(
        service: ChromVoidAutofillService,
        responseBuilder: FillResponse.Builder,
        parsedRequest: ParsedAutofillRequest,
    ) {
        AutofillDatasetFactory(service).maybeConfigureFillDialog(responseBuilder, parsedRequest)
    }

    private fun JSONObject.toAutofillCandidate(): AutofillCandidate {
        val otpArray =
            optJSONArray("otp_options")
                ?: optString("otp_options")
                    .takeIf { it.isNotBlank() }
                    ?.let { runCatching { JSONArray(it) }.getOrNull() }
        val otpOptions =
            buildList {
                for (index in 0 until (otpArray?.length() ?: 0)) {
                    val item = otpArray?.optJSONObject(index) ?: continue
                    val id = item.optString("id").trim()
                    if (id.isBlank()) {
                        continue
                    }
                    add(
                        OtpOption(
                            id = id,
                            label = item.optString("label").trim().ifBlank { null },
                            otpType =
                                item.optString("type")
                                    .ifBlank { item.optString("otp_type") }
                                    .trim()
                                    .ifBlank { null },
                        ),
                    )
                }
            }

        return AutofillCandidate(
            credentialId = optString("credential_id"),
            username = optString("username"),
            label = optString("label"),
            domain = optString("domain").ifBlank { null },
            otpOptions = otpOptions,
        )
    }
}
