package com.chromvoid.app.shared

import androidx.fragment.app.FragmentActivity
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.app.ChromVoidApplication
import com.chromvoid.app.ChromVoidPasswordSaveActivity
import com.chromvoid.app.autofill.AutofillSessionStore
import com.chromvoid.app.autofill.InMemoryAutofillSessionStore
import com.chromvoid.app.credentialprovider.AndroidBridgeGateway
import com.chromvoid.app.credentialprovider.AutofillCandidate
import com.chromvoid.app.credentialprovider.AutofillSecret
import com.chromvoid.app.credentialprovider.BridgeResult
import com.chromvoid.app.credentialprovider.PasswordCandidate
import com.chromvoid.app.credentialprovider.PasswordSecret
import com.chromvoid.app.credentialprovider.PasswordSaveReviewRequest
import com.chromvoid.app.credentialprovider.ProviderStatus
import com.chromvoid.app.main.PasswordSaveRequestStore
import com.chromvoid.app.main.PasswordSaveReviewController
import com.chromvoid.app.main.PendingPasswordSaveRequest
import com.chromvoid.app.passkey.PasskeyPreflightPayload
import com.chromvoid.app.security.BiometricPromptRunner
import com.chromvoid.app.security.PasskeyMetadataStore
import com.chromvoid.app.security.PepperStore

internal class TestAndroidAppGraph(
    override val bridgeGateway: AndroidBridgeGateway,
    override val passkeyMetadataStore: PasskeyMetadataStore,
    override val passkeyRequestRegistry: com.chromvoid.app.passkey.PasskeyRequestRegistry =
        com.chromvoid.app.passkey.InMemoryPasskeyRequestRegistry(SystemAndroidClock),
    override val clock: AndroidClock = SystemAndroidClock,
    override val autofillSessionStore: AutofillSessionStore = InMemoryAutofillSessionStore(clock),
    override val appGateActivityRegistry: CurrentActivityRegistry<FragmentActivity> = CurrentActivityRegistry(),
    override val passwordSaveActivityRegistry: CurrentActivityRegistry<ChromVoidPasswordSaveActivity> = CurrentActivityRegistry(),
    override val biometricPromptRunner: BiometricPromptRunner = BiometricPromptRunner(appGateActivityRegistry),
    override val passwordSaveRequestStore: PasswordSaveRequestStore = InMemoryPasswordSaveRequestStore(),
    override val passwordSaveReviewController: PasswordSaveReviewController =
        PasswordSaveReviewController(passwordSaveActivityRegistry),
    override val pepperStore: PepperStore = InMemoryPepperStore(),
) : AndroidAppGraph

internal fun installTestAppGraph(graph: AndroidAppGraph) {
    ApplicationProvider.getApplicationContext<ChromVoidApplication>().setAppGraphForTests(graph)
}

internal fun resetTestAppGraph() {
    ApplicationProvider.getApplicationContext<ChromVoidApplication>().setAppGraphForTests(null)
}

internal class InMemoryPepperStore : PepperStore {
    private var pepper: ByteArray? = null

    override fun loadPepper(): ByteArray? = pepper?.copyOf()

    override fun storePepper(pepper: ByteArray) {
        this.pepper = pepper.copyOf()
    }

    override fun deletePepper() {
        pepper = null
    }
}

internal class InMemoryPasswordSaveRequestStore : PasswordSaveRequestStore {
    private val requests = linkedMapOf<String, PendingPasswordSaveRequest>()

    override fun stage(token: String) {
        if (token.isBlank()) {
            return
        }
        requests[token] = PendingPasswordSaveRequest(token = token, createdAtEpochMs = System.currentTimeMillis())
    }

    override fun current(): PendingPasswordSaveRequest? =
        requests.values.maxByOrNull { it.createdAtEpochMs }

    override fun remove(token: String): PendingPasswordSaveRequest? = requests.remove(token)

    override fun clear() {
        requests.clear()
    }
}

internal object UnsupportedPasskeyMetadataStore : PasskeyMetadataStore {
    override fun listForRpId(rpId: String, allowCredentialIds: Set<String>) =
        error("Unexpected passkey metadata lookup")

    override fun findByCredentialId(credentialId: String) =
        error("Unexpected passkey metadata lookup")

    override fun hasExcludedCredential(excludedCredentialIds: Set<String>) =
        error("Unexpected passkey metadata lookup")

    override fun saveNew(metadata: com.chromvoid.app.PasskeyMetadata) {
        error("Unexpected passkey metadata save")
    }

    override fun updateUsage(credentialId: String, signCount: Long, lastUsedEpochMs: Long) {
        error("Unexpected passkey metadata update")
    }

    override fun clearTransientState(passkeyRequestRegistry: com.chromvoid.app.passkey.PasskeyRequestRegistry) {
        passkeyRequestRegistry.clear()
    }
}

internal open class BaseFakeBridgeGateway : AndroidBridgeGateway {
    override fun warmUp() = Unit

    override fun runtimeReady(): Boolean = true

    override fun currentApiLevel(): Int = 34

    override fun providerStatus(): BridgeResult<ProviderStatus> =
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

    override fun autofillList(
        origin: String,
        domain: String,
    ): BridgeResult<Pair<String, List<AutofillCandidate>>> =
        error("Unexpected autofillList call")

    override fun autofillGetSecret(
        sessionId: String,
        credentialId: String,
        otpId: String?,
    ): BridgeResult<AutofillSecret> = error("Unexpected autofillGetSecret call")

    override fun passwordList(origin: String, domain: String): BridgeResult<Pair<String, List<PasswordCandidate>>> =
        error("Unexpected passwordList call")

    override fun passwordGetSecret(
        sessionId: String,
        credentialId: String,
    ): BridgeResult<PasswordSecret> =
        error("Unexpected passwordGetSecret call")

    override fun passwordSaveStart(payload: PasswordSaveReviewRequest): BridgeResult<String> =
        error("Unexpected passwordSaveStart call")

    override fun passwordSaveRequest(token: String): BridgeResult<PasswordSaveReviewRequest> =
        error("Unexpected passwordSaveRequest call")

    override fun passwordSaveMarkLaunched(token: String): BridgeResult<Boolean> =
        error("Unexpected passwordSaveMarkLaunched call")

    override fun passkeyPreflight(
        command: String,
        payload: PasskeyPreflightPayload,
    ): BridgeResult<String> =
        error("Unexpected passkeyPreflight call")
}
