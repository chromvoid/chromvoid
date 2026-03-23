package com.chromvoid.app.security

import com.chromvoid.app.PasskeyMetadata
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PasskeyMetadataJsonCodecTest {
    @Test
    fun roundTrip_keepsMetadataFields() {
        val metadata =
            listOf(
                PasskeyMetadata(
                    credentialIdB64Url = "cred-1",
                    rpId = "example.com",
                    userIdB64Url = "user-1",
                    userName = "alice@example.com",
                    userDisplayName = "Alice",
                    keyAlias = "chromvoid.passkey.cred-1",
                    signCount = 2,
                    createdAtEpochMs = 10L,
                    lastUsedEpochMs = 20L,
                ),
            )

        val encoded = PasskeyMetadataJsonCodec.encodeAll(metadata).toString(Charsets.UTF_8)

        assertEquals(metadata, PasskeyMetadataJsonCodec.decodeAll(encoded))
    }
}
