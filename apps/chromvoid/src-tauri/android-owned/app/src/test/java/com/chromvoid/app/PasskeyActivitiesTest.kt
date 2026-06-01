package com.chromvoid.app

import android.content.Intent
import androidx.credentials.CreateCredentialResponse
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.CreateCredentialInterruptedException
import androidx.credentials.exceptions.CreateCredentialUnknownException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialInterruptedException
import androidx.credentials.exceptions.GetCredentialUnknownException
import androidx.credentials.provider.PendingIntentHandler
import androidx.fragment.app.FragmentActivity
import com.chromvoid.app.credentialprovider.BridgeError
import com.chromvoid.app.credentialprovider.BridgeResult
import com.chromvoid.app.credentialprovider.ProviderStatus
import com.chromvoid.app.passkey.PasskeyCreateCoordinator
import com.chromvoid.app.passkey.PasskeyGetCoordinator
import com.chromvoid.app.passkey.PasskeyRequestRegistry
import com.chromvoid.app.shared.BaseFakeBridgeGateway
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChromVoidPasskeyGetActivityTest {
    @Test
    fun missingExtras_failsClosedWithUnknown() {
        val capture = runGetFlow(intent = Intent())
        assertTrue(capture.exception is GetCredentialUnknownException)
    }

    @Test
    fun inactiveRequest_mapsToInterruptedAndClearsHandle() {
        val requestStore = FakeRequestStore()
        val capture =
            runGetFlow(
                requestStore = requestStore,
                intent = getIntent(requestId = "req-missing", credentialId = "cred-a"),
            )

        assertTrue(capture.exception is GetCredentialInterruptedException)
        assertNull(requestStore.get("req-missing"))
    }

    @Test
    fun providerLockedAfterQuery_mapsToInterrupted() {
        val requestStore = FakeRequestStore().apply {
            put(PendingPasskeyRequest("req-get-1", "get", "example.com"))
        }
        val bridge =
            FakeBridge().apply {
                statusResult = providerStatus(vaultOpen = false)
            }
        val resolver =
            FakeResolver().apply {
                getResolution =
                    GetRequestResolution.Success(
                        ResolvedGetPasskeyRequest(
                            requestData = GetPasskeyRequestData("example.com", "challenge-b64", setOf("cred-a")),
                            requestJson = sampleGetRequestJson(),
                            origin = "https://app.example",
                            clientDataHash = byteArrayOf(0x01),
                        ),
                    )
            }

        val capture =
            runGetFlow(
                bridge = bridge,
                requestStore = requestStore,
                resolver = resolver,
                intent = getIntent("req-get-1", "cred-a"),
            )

        assertTrue(capture.exception is GetCredentialInterruptedException)
        assertNull(requestStore.get("req-get-1"))
    }

    @Test
    fun providerUnavailableAfterQuery_mapsToInterrupted() {
        val requestStore = FakeRequestStore().apply {
            put(PendingPasskeyRequest("req-get-unavailable", "get", "example.com"))
        }
        val bridge =
            FakeBridge().apply {
                statusResult = BridgeResult.Failure(BridgeError("PROVIDER_UNAVAILABLE", "provider unavailable"))
            }

        val capture =
            runGetFlow(
                bridge = bridge,
                requestStore = requestStore,
                intent = getIntent("req-get-unavailable", "cred-a"),
            )

        assertTrue(capture.exception is GetCredentialInterruptedException)
        assertNull(requestStore.get("req-get-unavailable"))
    }

    @Test
    fun success_packagesResponseClearsRequestAndUpdatesUsage() {
        val requestStore = FakeRequestStore().apply {
            put(PendingPasskeyRequest("req-get-2", "get", "example.com"))
        }
        val resolver =
            FakeResolver().apply {
                getResolution =
                    GetRequestResolution.Success(
                        ResolvedGetPasskeyRequest(
                            requestData = GetPasskeyRequestData("example.com", "challenge-b64", setOf("cred-a")),
                            requestJson = sampleGetRequestJson(),
                            origin = "https://app.example",
                            clientDataHash = byteArrayOf(0x01, 0x02),
                        ),
                    )
            }
        val capture =
            runGetFlow(
                requestStore = requestStore,
                resolver = resolver,
                intent = getIntent("req-get-2", "cred-a"),
            )

        val response = PendingIntentHandler.retrieveGetCredentialResponse(capture.resultIntent)
        assertNotNull(response)
        assertNull(requestStore.get("req-get-2"))
    }

    @Test
    fun biometricCancel_mapsToUserCancelled() {
        val requestStore = FakeRequestStore().apply {
            put(PendingPasskeyRequest("req-get-3", "get", "example.com"))
        }
        val resolver =
            FakeResolver().apply {
                getResolution =
                    GetRequestResolution.Success(
                        ResolvedGetPasskeyRequest(
                            requestData = GetPasskeyRequestData("example.com", "challenge-b64", emptySet()),
                            requestJson = sampleGetRequestJson(),
                            origin = "https://app.example",
                            clientDataHash = byteArrayOf(0x03),
                        ),
                    )
            }
        val biometric =
            FakeBiometric().apply {
                getError = GetCredentialCancellationException("cancelled")
            }

        val capture =
            runGetFlow(
                requestStore = requestStore,
                biometric = biometric,
                resolver = resolver,
                intent = getIntent("req-get-3", "cred-a"),
            )

        assertTrue(capture.exception is GetCredentialCancellationException)
        assertNull(requestStore.get("req-get-3"))
    }

    @Test
    fun genericBiometricFailure_mapsToInterrupted() {
        val requestStore = FakeRequestStore().apply {
            put(PendingPasskeyRequest("req-get-biometric-error", "get", "example.com"))
        }
        val resolver =
            FakeResolver().apply {
                getResolution =
                    GetRequestResolution.Success(
                        ResolvedGetPasskeyRequest(
                            requestData = GetPasskeyRequestData("example.com", "challenge-b64", emptySet()),
                            requestJson = sampleGetRequestJson(),
                            origin = "https://app.example",
                            clientDataHash = byteArrayOf(0x05),
                        ),
                    )
            }
        val biometric =
            FakeBiometric().apply {
                getError = GetCredentialInterruptedException("prompt interrupted")
            }

        val capture =
            runGetFlow(
                requestStore = requestStore,
                biometric = biometric,
                resolver = resolver,
                intent = getIntent("req-get-biometric-error", "cred-a"),
            )

        assertTrue(capture.exception is GetCredentialInterruptedException)
        assertNull(requestStore.get("req-get-biometric-error"))
    }

    @Test
    fun coreGetFailure_mapsToUnknown() {
        val requestStore = FakeRequestStore().apply {
            put(PendingPasskeyRequest("req-get-4", "get", "example.com"))
        }
        val bridge =
            FakeBridge().apply {
                getResponse = BridgeResult.Failure(BridgeError("NO_MATCH", "No matching passkey"))
            }
        val resolver =
            FakeResolver().apply {
                getResolution =
                    GetRequestResolution.Success(
                        ResolvedGetPasskeyRequest(
                            requestData = GetPasskeyRequestData("example.com", "challenge-b64", emptySet()),
                            requestJson = sampleGetRequestJson(),
                            origin = "https://app.example",
                            clientDataHash = byteArrayOf(0x04),
                        ),
                    )
            }

        val capture =
            runGetFlow(
                bridge = bridge,
                requestStore = requestStore,
                resolver = resolver,
                intent = getIntent("req-get-4", "cred-a"),
            )

        assertTrue(capture.exception is GetCredentialUnknownException)
        assertNull(requestStore.get("req-get-4"))
    }

    @Test
    fun responseSerializationFailure_mapsToUnknown() {
        val requestStore = FakeRequestStore().apply {
            put(PendingPasskeyRequest("req-get-5", "get", "example.com"))
        }
        val resolver =
            FakeResolver().apply {
                getResolution =
                    GetRequestResolution.Success(
                        ResolvedGetPasskeyRequest(
                            requestData = GetPasskeyRequestData("example.com", "challenge-b64", emptySet()),
                            requestJson = sampleGetRequestJson(),
                            origin = "https://app.example",
                            clientDataHash = byteArrayOf(0x06),
                        ),
                    )
            }
        val responseWriter =
            FakeResponseWriter().apply {
                failGetSuccess = true
            }

        val capture =
            runGetFlow(
                requestStore = requestStore,
                resolver = resolver,
                responseWriter = responseWriter,
                intent = getIntent("req-get-5", "cred-a"),
            )

        assertTrue(capture.exception is GetCredentialUnknownException)
        assertNull(requestStore.get("req-get-5"))
    }

    private fun getIntent(requestId: String, credentialId: String): Intent {
        return Intent()
            .putExtra(ChromVoidCredentialProviderService.EXTRA_REQUEST_ID, requestId)
            .putExtra(ChromVoidCredentialProviderService.EXTRA_CREDENTIAL_ID, credentialId)
    }
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChromVoidPasskeyCreateActivityTest {
    @Test
    fun missingHandle_failsClosedWithUnknown() {
        val capture = runCreateFlow(intent = Intent())
        assertTrue(capture.exception is CreateCredentialUnknownException)
    }

    @Test
    fun inactiveRequest_mapsToInterrupted() {
        val requestStore = FakeRequestStore()
        val capture =
            runCreateFlow(
                requestStore = requestStore,
                intent = createIntent("req-create-1"),
            )
        assertTrue(capture.exception is CreateCredentialInterruptedException)
    }

    @Test
    fun providerUnavailableAfterQuery_mapsToInterrupted() {
        val requestStore = FakeRequestStore().apply {
            put(PendingPasskeyRequest("req-create-2", "create", "example.com"))
        }
        val bridge =
            FakeBridge().apply {
                statusResult = BridgeResult.Failure(BridgeError("PROVIDER_UNAVAILABLE", "provider unavailable"))
            }

        val capture =
            runCreateFlow(
                bridge = bridge,
                requestStore = requestStore,
                intent = createIntent("req-create-2"),
            )

        assertTrue(capture.exception is CreateCredentialInterruptedException)
        assertNull(requestStore.get("req-create-2"))
    }

    @Test
    fun providerDisabledAfterQuery_mapsToInterrupted() {
        val requestStore = FakeRequestStore().apply {
            put(PendingPasskeyRequest("req-create-disabled", "create", "example.com"))
        }
        val bridge =
            FakeBridge().apply {
                statusResult = providerStatus(enabled = false)
            }

        val capture =
            runCreateFlow(
                bridge = bridge,
                requestStore = requestStore,
                intent = createIntent("req-create-disabled"),
            )

        assertTrue(capture.exception is CreateCredentialInterruptedException)
        assertNull(requestStore.get("req-create-disabled"))
    }

    @Test
    fun success_packagesResponseAndClearsRequest() {
        val requestStore = FakeRequestStore().apply {
            put(PendingPasskeyRequest("req-create-3", "create", "example.com"))
        }
        val resolver =
            FakeResolver().apply {
                createResolution =
                    CreateRequestResolution.Success(
                        ResolvedCreatePasskeyRequest(
                            requestData = sampleCreateRequestData(),
                            requestJson = sampleCreateRequestJson(),
                            origin = "https://app.example",
                            clientDataHash = null,
                        ),
                    )
            }

        val capture =
            runCreateFlow(
                requestStore = requestStore,
                resolver = resolver,
                intent = createIntent("req-create-3"),
            )

        val response =
            PendingIntentHandler.retrieveCreateCredentialResponse("public-key", capture.resultIntent)
        assertNotNull(response)
        assertNull(requestStore.get("req-create-3"))
    }

    @Test
    fun biometricCancel_mapsToUserCancelled() {
        val requestStore = FakeRequestStore().apply {
            put(PendingPasskeyRequest("req-create-4", "create", "example.com"))
        }
        val resolver =
            FakeResolver().apply {
                createResolution =
                    CreateRequestResolution.Success(
                        ResolvedCreatePasskeyRequest(sampleCreateRequestData(), sampleCreateRequestJson(), "https://app.example", null),
                    )
            }
        val biometric =
            FakeBiometric().apply {
                createError = CreateCredentialCancellationException("cancelled")
            }

        val capture =
            runCreateFlow(
                requestStore = requestStore,
                resolver = resolver,
                biometric = biometric,
                intent = createIntent("req-create-4"),
            )

        assertTrue(capture.exception is CreateCredentialCancellationException)
        assertNull(requestStore.get("req-create-4"))
    }

    @Test
    fun genericBiometricFailure_mapsToInterrupted() {
        val requestStore = FakeRequestStore().apply {
            put(PendingPasskeyRequest("req-create-biometric-error", "create", "example.com"))
        }
        val resolver =
            FakeResolver().apply {
                createResolution =
                    CreateRequestResolution.Success(
                        ResolvedCreatePasskeyRequest(sampleCreateRequestData(), sampleCreateRequestJson(), "https://app.example", null),
                    )
            }
        val biometric =
            FakeBiometric().apply {
                createError = CreateCredentialInterruptedException("prompt interrupted")
            }

        val capture =
            runCreateFlow(
                requestStore = requestStore,
                resolver = resolver,
                biometric = biometric,
                intent = createIntent("req-create-biometric-error"),
            )

        assertTrue(capture.exception is CreateCredentialInterruptedException)
        assertNull(requestStore.get("req-create-biometric-error"))
    }

    @Test
    fun coreCreateFailure_mapsToUnknown() {
        val requestStore = FakeRequestStore().apply {
            put(PendingPasskeyRequest("req-create-5", "create", "example.com"))
        }
        val bridge =
            FakeBridge().apply {
                createResponse = BridgeResult.Failure(BridgeError("ACCESS_DENIED", "Excluded credential already exists"))
            }
        val resolver =
            FakeResolver().apply {
                createResolution =
                    CreateRequestResolution.Success(
                        ResolvedCreatePasskeyRequest(sampleCreateRequestData(), sampleCreateRequestJson(), "https://app.example", null),
                    )
            }

        val capture =
            runCreateFlow(
                bridge = bridge,
                requestStore = requestStore,
                resolver = resolver,
                intent = createIntent("req-create-5"),
            )

        assertTrue(capture.exception is CreateCredentialUnknownException)
        assertNull(requestStore.get("req-create-5"))
    }

    @Test
    fun responseSerializationFailure_mapsToUnknown() {
        val requestStore = FakeRequestStore().apply {
            put(PendingPasskeyRequest("req-create-6", "create", "example.com"))
        }
        val resolver =
            FakeResolver().apply {
                createResolution =
                    CreateRequestResolution.Success(
                        ResolvedCreatePasskeyRequest(sampleCreateRequestData(), sampleCreateRequestJson(), "https://app.example", null),
                    )
            }
        val responseWriter =
            FakeResponseWriter().apply {
                failCreateSuccess = true
            }

        val capture =
            runCreateFlow(
                requestStore = requestStore,
                resolver = resolver,
                responseWriter = responseWriter,
                intent = createIntent("req-create-6"),
            )

        assertTrue(capture.exception is CreateCredentialUnknownException)
        assertNull(requestStore.get("req-create-6"))
    }

    private fun createIntent(requestId: String): Intent {
        return Intent().putExtra(ChromVoidCredentialProviderService.EXTRA_REQUEST_ID, requestId)
    }
}

private fun runGetFlow(
    bridge: FakeBridge = FakeBridge(),
    requestStore: FakeRequestStore = FakeRequestStore(),
    biometric: FakeBiometric = FakeBiometric(),
    resolver: FakeResolver = FakeResolver(),
    responseWriter: FakeResponseWriter = FakeResponseWriter(),
    intent: Intent,
): GetCapture {
    val activity = Robolectric.buildActivity(FragmentActivity::class.java).setup().get()
    val capture = GetCapture()
    PasskeyGetCoordinator(
        bridgeGateway = bridge,
        requestRegistry = requestStore,
        requestResolver = resolver,
        responseWriter = responseWriter,
    ).execute(
        activity = activity,
        intent = intent,
        biometric = biometric,
        onSuccess = { requestId, resultIntent ->
            requestStore.remove(requestId)
            capture.resultIntent = resultIntent
        },
        onFailure = { requestId, exception ->
            if (requestId.isNotBlank()) {
                requestStore.remove(requestId)
            }
            capture.exception = exception
        },
    )
    return capture
}

private fun runCreateFlow(
    bridge: FakeBridge = FakeBridge(),
    requestStore: FakeRequestStore = FakeRequestStore(),
    biometric: FakeBiometric = FakeBiometric(),
    resolver: FakeResolver = FakeResolver(),
    responseWriter: FakeResponseWriter = FakeResponseWriter(),
    intent: Intent,
): CreateCapture {
    val activity = Robolectric.buildActivity(FragmentActivity::class.java).setup().get()
    val capture = CreateCapture()
    PasskeyCreateCoordinator(
        bridgeGateway = bridge,
        requestRegistry = requestStore,
        requestResolver = resolver,
        responseWriter = responseWriter,
    ).execute(
        activity = activity,
        intent = intent,
        biometric = biometric,
        onSuccess = { requestId, resultIntent ->
            requestStore.remove(requestId)
            capture.resultIntent = resultIntent
        },
        onFailure = { requestId, exception ->
            if (requestId.isNotBlank()) {
                requestStore.remove(requestId)
            }
            capture.exception = exception
        },
    )
    return capture
}

private data class GetCapture(
    var resultIntent: Intent = Intent(),
    var exception: GetCredentialException? = null,
)

private data class CreateCapture(
    var resultIntent: Intent = Intent(),
    var exception: CreateCredentialException? = null,
)

private fun providerStatus(
    runtimeReady: Boolean = true,
    enabled: Boolean = true,
    vaultOpen: Boolean = true,
): BridgeResult<ProviderStatus> {
    return BridgeResult.Success(
        ProviderStatus(
            runtimeReady = runtimeReady,
            enabled = enabled,
            vaultOpen = vaultOpen,
            apiLevel = 34,
            passwordProviderState = null,
            passkeysLiteState = null,
            autofillFallbackState = null,
            unsupportedReason = null,
        ),
    )
}

private class FakeBridge : BaseFakeBridgeGateway() {
    var statusResult: BridgeResult<ProviderStatus> =
        BridgeResult.Success(
            ProviderStatus(
                runtimeReady = true,
                enabled = true,
                vaultOpen = true,
                apiLevel = 34,
                passwordProviderState = null,
                passkeysLiteState = null,
                autofillFallbackState = null,
                unsupportedReason = null,
            ),
        )
    var getResponse: BridgeResult<PasskeyCoreOperationResult> =
        BridgeResult.Success(PasskeyCoreOperationResult("cred-a", sampleAssertionResponseJson()))
    var createResponse: BridgeResult<PasskeyCoreOperationResult> =
        BridgeResult.Success(PasskeyCoreOperationResult("cred-created", sampleRegistrationResponseJson()))

    override fun providerStatus(): BridgeResult<ProviderStatus> = statusResult

    override fun passkeyGet(payload: PasskeyCoreRequestPayload): BridgeResult<PasskeyCoreOperationResult> =
        getResponse

    override fun passkeyCreate(payload: PasskeyCoreRequestPayload): BridgeResult<PasskeyCoreOperationResult> =
        createResponse
}

private class FakeRequestStore : PasskeyRequestRegistry {
    private val values = linkedMapOf<String, PendingPasskeyRequest>()

    override fun put(request: PendingPasskeyRequest) {
        values[request.requestId] = request
    }

    override fun get(requestId: String): PendingPasskeyRequest? = values[requestId]

    override fun remove(requestId: String): PendingPasskeyRequest? = values.remove(requestId)

    override fun values(): List<PendingPasskeyRequest> = values.values.toList()

    override fun clear() {
        values.clear()
    }
}

private class FakeBiometric : PasskeyActivityBiometricRuntime {
    var getError: GetCredentialException? = null
    var createError: CreateCredentialException? = null

    override fun authenticateAssertion(
        activity: FragmentActivity,
        onSuccess: () -> Unit,
        onError: (GetCredentialException) -> Unit,
    ) {
        val error = getError
        if (error != null) {
            onError(error)
            return
        }
        onSuccess()
    }

    override fun authenticateCreate(
        activity: FragmentActivity,
        onSuccess: () -> Unit,
        onError: (CreateCredentialException) -> Unit,
    ) {
        val error = createError
        if (error != null) {
            onError(error)
            return
        }
        onSuccess()
    }
}

private class FakeResolver : PasskeyActivityRequestResolverRuntime {
    var getResolution: GetRequestResolution =
        GetRequestResolution.Failure(GetCredentialUnknownException("missing get resolution"))
    var createResolution: CreateRequestResolution =
        CreateRequestResolution.Failure(CreateCredentialUnknownException("missing create resolution"))

    override fun resolveGet(intent: Intent): GetRequestResolution = getResolution

    override fun resolveCreate(intent: Intent): CreateRequestResolution = createResolution
}

private class FakeResponseWriter : PasskeyActivityResponseWriterRuntime {
    var failGetSuccess: Boolean = false
    var failCreateSuccess: Boolean = false

    override fun setGetSuccess(intent: Intent, response: GetCredentialResponse) {
        if (failGetSuccess) {
            error("get response serialization failed")
        }
        PendingIntentHandler.setGetCredentialResponse(intent, response)
    }

    override fun setGetFailure(intent: Intent, exception: GetCredentialException) {
        PendingIntentHandler.setGetCredentialException(intent, exception)
    }

    override fun setCreateSuccess(intent: Intent, response: CreateCredentialResponse) {
        if (failCreateSuccess) {
            error("create response serialization failed")
        }
        PendingIntentHandler.setCreateCredentialResponse(intent, response)
    }

    override fun setCreateFailure(intent: Intent, exception: CreateCredentialException) {
        PendingIntentHandler.setCreateCredentialException(intent, exception)
    }
}

private fun sampleCreateRequestData(): CreatePasskeyRequestData {
    return CreatePasskeyRequestData(
        rpId = "example.com",
        rpName = "Example",
        userIdB64Url = "user-b64",
        userName = "alice",
        userDisplayName = "Alice",
        challengeB64Url = "challenge-b64",
        supportedAlgorithms = setOf(-7),
        excludeCredentialIds = emptySet(),
        attestationPreference = "none",
    )
}

private fun sampleGetRequestJson(): String =
    """{"challenge":"challenge-b64","rpId":"example.com","allowCredentials":[{"type":"public-key","id":"cred-a"}]}"""

private fun sampleCreateRequestJson(): String =
    """{"challenge":"challenge-b64","rp":{"id":"example.com","name":"Example"},"user":{"id":"user-b64","name":"alice","displayName":"Alice"},"pubKeyCredParams":[{"type":"public-key","alg":-7}],"excludeCredentials":[],"attestation":"none"}"""

private fun sampleAssertionResponseJson(): String =
    """{"id":"cred-a","rawId":"cred-a","type":"public-key","response":{"authenticatorData":"YXV0aA","clientDataJSON":"Y2xpZW50","signature":"c2ln","userHandle":"dXNlcg"},"clientExtensionResults":{}}"""

private fun sampleRegistrationResponseJson(): String =
    """{"id":"cred-created","rawId":"cred-created","type":"public-key","response":{"clientDataJSON":"Y2xpZW50","attestationObject":"YXR0","authenticatorData":"YXV0aA","publicKey":"cHVi","publicKeyAlgorithm":-7,"transports":["internal","hybrid"]},"clientExtensionResults":{"credProps":{"rk":true}}}"""
