package com.chromvoid.app.passkey

import com.chromvoid.app.CreatePasskeyRequestData
import com.chromvoid.app.PasskeyCbor

internal object PasskeyResponseAssembler {
    fun supportsEs256(request: CreatePasskeyRequestData): Boolean = request.supportedAlgorithms.contains(-7)

    fun supportsAttestationNone(request: CreatePasskeyRequestData): Boolean {
        return request.attestationPreference.isBlank() || request.attestationPreference == "none"
    }

    fun authenticatorDataForAssertion(
        rpId: String,
        signCount: Long,
        userVerified: Boolean = true,
    ): ByteArray {
        return PasskeyAuthenticatorDataBuilder.assertion(rpId, signCount, userVerified)
    }

    fun authenticatorDataForRegistration(
        rpId: String,
        credentialId: ByteArray,
        cosePublicKey: ByteArray,
        signCount: Long = 0,
        userVerified: Boolean = true,
    ): ByteArray {
        return PasskeyAuthenticatorDataBuilder.registration(
            rpId = rpId,
            credentialId = credentialId,
            cosePublicKey = cosePublicKey,
            signCount = signCount,
            userVerified = userVerified,
        )
    }

    fun registrationResponseJson(
        credentialId: ByteArray,
        clientDataJson: ByteArray,
        attestationObject: ByteArray,
    ): String {
        return PasskeyCredentialJsonEncoder.registrationResponse(
            credentialId = credentialId,
            clientDataJson = clientDataJson,
            attestationObject = attestationObject,
        )
    }

    fun assertionResponseJson(
        credentialId: ByteArray,
        userId: ByteArray,
        clientDataJson: ByteArray,
        authenticatorData: ByteArray,
        signature: ByteArray,
    ): String {
        return PasskeyCredentialJsonEncoder.assertionResponse(
            credentialId = credentialId,
            userId = userId,
            clientDataJson = clientDataJson,
            authenticatorData = authenticatorData,
            signature = signature,
        )
    }

    fun attestationObject(authenticatorData: ByteArray): ByteArray {
        return PasskeyCbor.encode(
            mapOf(
                "fmt" to "none",
                "attStmt" to emptyMap<String, Any>(),
                "authData" to authenticatorData,
            ),
        )
    }

    fun clientDataJson(
        type: String,
        challengeB64Url: String,
        origin: String,
    ): ByteArray {
        return PasskeyClientDataJsonEncoder.encode(type, challengeB64Url, origin)
    }

    fun clientDataHash(
        clientDataJson: ByteArray,
        providedHash: ByteArray?,
    ): ByteArray {
        return PasskeyClientDataJsonEncoder.hash(clientDataJson, providedHash)
    }
}
