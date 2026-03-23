package com.chromvoid.app

import android.content.pm.SigningInfo
import android.os.Bundle
import android.os.CancellationSignal
import android.os.OutcomeReceiver
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.CreateCredentialInterruptedException
import androidx.credentials.exceptions.CreateCredentialNoCreateOptionException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialInterruptedException
import androidx.credentials.exceptions.GetCredentialUnknownException
import androidx.credentials.exceptions.NoCredentialException
import androidx.credentials.provider.BeginCreateCredentialResponse
import androidx.credentials.provider.BeginCreatePublicKeyCredentialRequest
import androidx.credentials.provider.BeginGetCredentialRequest
import androidx.credentials.provider.BeginGetCredentialResponse
import androidx.credentials.provider.BeginGetPasswordOption
import androidx.credentials.provider.BeginGetPublicKeyCredentialOption
import androidx.credentials.provider.CallingAppInfo
import androidx.credentials.provider.ProviderClearCredentialStateRequest
import com.chromvoid.app.credentialprovider.BridgeError
import com.chromvoid.app.credentialprovider.BridgeResult
import com.chromvoid.app.credentialprovider.PasswordCandidate
import com.chromvoid.app.security.PasskeyMetadataStore
import com.chromvoid.app.shared.BaseFakeBridgeGateway
import com.chromvoid.app.shared.TestAndroidAppGraph
import com.chromvoid.app.shared.installTestAppGraph
import com.chromvoid.app.shared.resetTestAppGraph
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChromVoidCredentialProviderServiceTest {
    private lateinit var fakeBridge: FakeBridge
    private lateinit var fakeStore: FakeStore
    private lateinit var requestRegistry: com.chromvoid.app.passkey.InMemoryPasskeyRequestRegistry
    private lateinit var service: ChromVoidCredentialProviderService

    @Before
    fun setUp() {
        fakeBridge = FakeBridge()
        fakeStore = FakeStore()
        requestRegistry = com.chromvoid.app.passkey.InMemoryPasskeyRequestRegistry(com.chromvoid.app.shared.SystemAndroidClock)
        installTestAppGraph(
            TestAndroidAppGraph(
                bridgeGateway = fakeBridge,
                passkeyMetadataStore = fakeStore,
                passkeyRequestRegistry = requestRegistry,
            ),
        )
        service = Robolectric.setupService(ChromVoidCredentialProviderService::class.java)
    }

    @After
    fun tearDown() {
        requestRegistry.clear()
        resetTestAppGraph()
    }

    @Test
    fun beginGet_mapsVaultRequiredAndDoesNotQueryStore() {
        fakeBridge.preflightResponse = BridgeResult.Failure(BridgeError("VAULT_REQUIRED", "Unlock ChromVoid first."))
        val callback = CapturingGetCallback()

        service.onBeginGetCredentialRequest(getRequest(), CancellationSignal(), callback)

        assertNull(callback.result)
        assertTrue(callback.error is GetCredentialInterruptedException)
        assertEquals(0, fakeStore.listCalls)
    }

    @Test
    fun beginGet_mapsUnsupportedToNoCredentialAndDoesNotQueryStore() {
        fakeBridge.preflightResponse =
            BridgeResult.Failure(BridgeError("UNSUPPORTED", "No Android passkey candidates are available."))
        val callback = CapturingGetCallback()

        service.onBeginGetCredentialRequest(getRequest(), CancellationSignal(), callback)

        assertNull(callback.result)
        assertTrue(callback.error is NoCredentialException)
        assertEquals(0, fakeStore.listCalls)
    }

    @Test
    fun beginGet_successReturnsEntriesAndTracksRequest() {
        fakeBridge.preflightResponse = BridgeResult.Success("req-get-1")
        fakeStore.candidates =
            listOf(
                sampleMetadata("cred-a", "alice"),
                sampleMetadata("cred-b", "bob"),
            )
        val callback = CapturingGetCallback()

        service.onBeginGetCredentialRequest(getRequest(), CancellationSignal(), callback)

        assertNull(callback.error)
        val result = callback.result
        assertNotNull(result)
        assertEquals(2, result!!.credentialEntries.size)
        assertEquals("req-get-1", requestRegistry.get("req-get-1")?.requestId)
        assertEquals("example.com", requestRegistry.get("req-get-1")?.rpId)
        assertEquals("example.com", fakeStore.lastRpId)
        assertEquals(setOf("cred-a", "cred-b"), fakeStore.lastAllowCredentialIds)
    }

    @Test
    fun beginGet_emptyCandidatesReturnsEmptyResponseWithoutTrackingRequest() {
        fakeBridge.preflightResponse = BridgeResult.Success("req-get-empty")
        fakeStore.candidates = emptyList()
        val callback = CapturingGetCallback()

        service.onBeginGetCredentialRequest(getRequest(), CancellationSignal(), callback)

        assertNull(callback.error)
        val result = callback.result
        assertNotNull(result)
        assertTrue(result!!.credentialEntries.isEmpty())
        assertNull(requestRegistry.get("req-get-empty"))
    }

    @Test
    fun beginGet_passwordOption_doesNotInvokePasskeyPreflight_andMustReturnPasswordEntries() {
        // SPEC-216: Credential Manager password retrieval is a separate surface from passkeys.
        // Passkey preflight/store must not be invoked for password-only requests.
        fakeBridge.passwordListResponse =
            BridgeResult.Success(
                "pwd-session-1" to
                    listOf(
                        PasswordCandidate(
                            credentialId = "cred-password-1",
                            username = "alice@example.com",
                            label = "Alice Example",
                            domain = "app.example",
                        ),
                    ),
            )
        val callback = CapturingGetCallback()

        service.onBeginGetCredentialRequest(getPasswordRequest(), CancellationSignal(), callback)

        assertNull(callback.error)
        assertNotNull(callback.result)
        assertEquals(0, fakeBridge.preflightCalls)
        assertEquals(0, fakeStore.listCalls)
        assertEquals(1, fakeBridge.passwordListCalls)
        assertEquals(1, callback.result!!.credentialEntries.size)
    }

    @Test
    fun beginGet_blankRequestIdFailsClosed() {
        fakeBridge.preflightResponse = BridgeResult.Success("")
        val callback = CapturingGetCallback()

        service.onBeginGetCredentialRequest(getRequest(), CancellationSignal(), callback)

        assertNull(callback.result)
        assertTrue(callback.error is GetCredentialUnknownException)
    }

    @Test
    fun beginCreate_excludeCollisionReturnsNoCreateOptionWithoutPreflight() {
        fakeStore.hasExcludedCredential = true
        val callback = CapturingCreateCallback()

        service.onBeginCreateCredentialRequest(createRequest(), CancellationSignal(), callback)

        assertNull(callback.result)
        assertTrue(callback.error is CreateCredentialNoCreateOptionException)
        assertEquals(0, fakeBridge.preflightCalls)
    }

    @Test
    fun beginCreate_unsupportedAlgorithmReturnsNoCreateOptionWithoutPreflight() {
        val callback = CapturingCreateCallback()

        service.onBeginCreateCredentialRequest(
            createRequest(
                requestJson =
                    """{"challenge":"challenge-b64","rp":{"id":"example.com","name":"Example"},"user":{"id":"user-b64","name":"alice","displayName":"Alice"},"pubKeyCredParams":[{"type":"public-key","alg":-257}],"excludeCredentials":[],"attestation":"none"}""",
            ),
            CancellationSignal(),
            callback,
        )

        assertNull(callback.result)
        assertTrue(callback.error is CreateCredentialNoCreateOptionException)
        assertEquals(0, fakeBridge.preflightCalls)
    }

    @Test
    fun beginCreate_unsupportedAttestationReturnsNoCreateOptionWithoutPreflight() {
        val callback = CapturingCreateCallback()

        service.onBeginCreateCredentialRequest(
            createRequest(
                requestJson =
                    """{"challenge":"challenge-b64","rp":{"id":"example.com","name":"Example"},"user":{"id":"user-b64","name":"alice","displayName":"Alice"},"pubKeyCredParams":[{"type":"public-key","alg":-7}],"excludeCredentials":[],"attestation":"enterprise"}""",
            ),
            CancellationSignal(),
            callback,
        )

        assertNull(callback.result)
        assertTrue(callback.error is CreateCredentialNoCreateOptionException)
        assertEquals(0, fakeBridge.preflightCalls)
    }

    @Test
    fun beginCreate_successReturnsSingleCreateEntryAndTracksRequest() {
        fakeBridge.preflightResponse = BridgeResult.Success("req-create-1")
        val callback = CapturingCreateCallback()

        service.onBeginCreateCredentialRequest(createRequest(), CancellationSignal(), callback)

        assertNull(callback.error)
        val result = callback.result
        assertNotNull(result)
        assertEquals(1, result!!.createEntries.size)
        assertEquals("req-create-1", requestRegistry.get("req-create-1")?.requestId)
    }

    @Test
    fun beginCreate_mapsPreflightFailuresToInterrupted() {
        fakeBridge.preflightResponse =
            BridgeResult.Failure(
                BridgeError("PROVIDER_UNAVAILABLE", "Android provider runtime is unavailable."),
            )
        val callback = CapturingCreateCallback()

        service.onBeginCreateCredentialRequest(createRequest(), CancellationSignal(), callback)

        assertNull(callback.result)
        assertTrue(callback.error is CreateCredentialInterruptedException)
    }

    @Test
    fun beginCreate_blankRequestIdFailsClosed() {
        fakeBridge.preflightResponse = BridgeResult.Success("")
        val callback = CapturingCreateCallback()

        service.onBeginCreateCredentialRequest(createRequest(), CancellationSignal(), callback)

        assertNull(callback.result)
        assertTrue(callback.error is CreateCredentialNoCreateOptionException)
    }

    @Test
    fun beginCreate_passwordRequest_returnsEmptyOptions_andDoesNotInvokePasskeyPreflight() {
        // Password save/generate is implemented via Autofill save boundary, not via Credential Manager create.
        val callback = CapturingCreateCallback()

        service.onBeginCreateCredentialRequest(
            androidx.credentials.provider.BeginCreatePasswordCredentialRequest(callingAppInfo(), Bundle()),
            CancellationSignal(),
            callback,
        )

        assertNull(callback.error)
        assertNotNull(callback.result)
        assertTrue(callback.result!!.createEntries.isEmpty())
        assertEquals(0, fakeBridge.preflightCalls)
    }

    @Test
    fun clearStateClearsInFlightRequests() {
        requestRegistry.put(PendingPasskeyRequest("req-clear", "get", "example.com"))

        service.onClearCredentialStateRequest(
            ProviderClearCredentialStateRequest(callingAppInfo()),
            CancellationSignal(),
            object : OutcomeReceiver<Void?, androidx.credentials.exceptions.ClearCredentialException> {
                override fun onResult(result: Void?) = Unit

                override fun onError(error: androidx.credentials.exceptions.ClearCredentialException) {
                    throw AssertionError("clear state must not fail", error)
                }
            },
        )

        assertTrue(fakeStore.clearTransientStateCalled)
        assertNull(requestRegistry.get("req-clear"))
    }

    private fun getRequest(): BeginGetCredentialRequest {
        val option =
            BeginGetPublicKeyCredentialOption(
                Bundle(),
                "option-1",
                GET_REQUEST_JSON,
                byteArrayOf(0x01, 0x02),
            )
        return BeginGetCredentialRequest(listOf(option), callingAppInfo())
    }

    private fun createRequest(requestJson: String = CREATE_REQUEST_JSON): BeginCreatePublicKeyCredentialRequest {
        return BeginCreatePublicKeyCredentialRequest(
            requestJson,
            callingAppInfo(),
            Bundle(),
            byteArrayOf(0x0A, 0x0B),
        )
    }

    private fun callingAppInfo(): CallingAppInfo {
        val signingInfo = SigningInfo()
        return CallingAppInfo(
            "com.chromvoid.test",
            signingInfo,
            "https://example.com",
        )
    }

    private fun getPasswordRequest(): BeginGetCredentialRequest {
        val option = BeginGetPasswordOption(emptySet(), Bundle(), "pwd-option-1")
        return BeginGetCredentialRequest(listOf(option), callingAppInfo())
    }

    private fun sampleMetadata(credentialId: String, userName: String): PasskeyMetadata {
        return PasskeyMetadata(
            credentialIdB64Url = credentialId,
            rpId = "example.com",
            userIdB64Url = "user-b64",
            userName = userName,
            userDisplayName = userName.replaceFirstChar { it.uppercase() },
            keyAlias = "chromvoid.passkey.$credentialId",
            signCount = 0,
            createdAtEpochMs = 10,
            lastUsedEpochMs = 20,
        )
    }

    private class FakeBridge : BaseFakeBridgeGateway() {
        var preflightResponse: BridgeResult<String> = BridgeResult.Success("req-default")
        var preflightCalls: Int = 0
        var passwordListCalls: Int = 0
        var passwordListResponse: BridgeResult<Pair<String, List<PasswordCandidate>>> =
            BridgeResult.Success("pwd-session-default" to emptyList())

        override fun passkeyPreflight(
            command: String,
            payload: com.chromvoid.app.passkey.PasskeyPreflightPayload,
        ): BridgeResult<String> {
            preflightCalls += 1
            return preflightResponse
        }

        override fun passwordList(
            origin: String,
            domain: String,
        ): BridgeResult<Pair<String, List<PasswordCandidate>>> {
            passwordListCalls += 1
            return passwordListResponse
        }
    }

    private class FakeStore : PasskeyMetadataStore {
        var listCalls: Int = 0
        var hasExcludedCredential: Boolean = false
        var clearTransientStateCalled: Boolean = false
        var candidates: List<PasskeyMetadata> = emptyList()
        var lastRpId: String? = null
        var lastAllowCredentialIds: Set<String> = emptySet()

        override fun listForRpId(
            rpId: String,
            allowCredentialIds: Set<String>,
        ): List<PasskeyMetadata> {
            listCalls += 1
            lastRpId = rpId
            lastAllowCredentialIds = allowCredentialIds
            return candidates.filter {
                it.rpId == rpId && (allowCredentialIds.isEmpty() || allowCredentialIds.contains(it.credentialIdB64Url))
            }
        }

        override fun findByCredentialId(credentialId: String): PasskeyMetadata? = candidates.firstOrNull {
            it.credentialIdB64Url == credentialId
        }

        override fun hasExcludedCredential(excludedCredentialIds: Set<String>): Boolean {
            return hasExcludedCredential
        }

        override fun saveNew(metadata: PasskeyMetadata) {
            error("saveNew should not be called from provider service tests")
        }

        override fun updateUsage(credentialId: String, signCount: Long, lastUsedEpochMs: Long) {
            error("updateUsage should not be called from provider service tests")
        }

        override fun clearTransientState(passkeyRequestRegistry: com.chromvoid.app.passkey.PasskeyRequestRegistry) {
            clearTransientStateCalled = true
            passkeyRequestRegistry.clear()
        }
    }

    private class CapturingGetCallback :
        OutcomeReceiver<BeginGetCredentialResponse, GetCredentialException> {
        var result: BeginGetCredentialResponse? = null
        var error: GetCredentialException? = null

        override fun onResult(result: BeginGetCredentialResponse) {
            this.result = result
        }

        override fun onError(error: GetCredentialException) {
            this.error = error
        }
    }

    private class CapturingCreateCallback :
        OutcomeReceiver<BeginCreateCredentialResponse, CreateCredentialException> {
        var result: BeginCreateCredentialResponse? = null
        var error: CreateCredentialException? = null

        override fun onResult(result: BeginCreateCredentialResponse) {
            this.result = result
        }

        override fun onError(error: CreateCredentialException) {
            this.error = error
        }
    }

    companion object {
        private const val GET_REQUEST_JSON =
            """{"challenge":"challenge-b64","rpId":"example.com","allowCredentials":[{"id":"cred-a"},{"id":"cred-b"}]}"""
        private const val CREATE_REQUEST_JSON =
            """{"challenge":"challenge-b64","rp":{"id":"example.com","name":"Example"},"user":{"id":"user-b64","name":"alice","displayName":"Alice"},"pubKeyCredParams":[{"type":"public-key","alg":-7}],"excludeCredentials":[{"id":"cred-x"}],"attestation":"none"}"""
    }
}
