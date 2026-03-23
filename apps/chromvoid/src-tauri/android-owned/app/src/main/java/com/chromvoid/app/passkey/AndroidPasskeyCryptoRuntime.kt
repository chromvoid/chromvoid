package com.chromvoid.app.passkey

import com.chromvoid.app.CreatePasskeyRequestData
import com.chromvoid.app.PasskeyActivityCryptoRuntime
import com.chromvoid.app.PasskeyCryptoEngine
import com.chromvoid.app.PasskeyMetadata
import java.security.Signature

internal object AndroidPasskeyCryptoRuntime : PasskeyActivityCryptoRuntime {
    override fun beginAssertionSignature(metadata: PasskeyMetadata): Signature =
        PasskeyCryptoEngine.beginAssertionSignature(metadata)

    override fun signAssertion(
        signature: Signature,
        authenticatorData: ByteArray,
        clientDataHash: ByteArray,
    ): ByteArray = PasskeyCryptoEngine.signAssertion(signature, authenticatorData, clientDataHash)

    override fun credentialIdBytes(metadata: PasskeyMetadata): ByteArray =
        PasskeyCryptoEngine.credentialIdBytes(metadata)

    override fun userIdBytes(metadata: PasskeyMetadata): ByteArray =
        PasskeyCryptoEngine.userIdBytes(metadata)

    override fun createCredential(request: CreatePasskeyRequestData) =
        PasskeyCryptoEngine.createCredential(request)
}
