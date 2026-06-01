package com.chromvoid.app.credentialprovider

import com.chromvoid.app.GetPasskeyRequestData
import com.chromvoid.app.AndroidPasskeySummary
import org.junit.Assert.assertEquals
import org.junit.Test

class PasskeyQueryHandlerTest {
    @Test
    fun discoverableRequestKeepsNewestCredentialPerAccountLabel() {
        val result =
            passkeyCandidatesForGetRequest(
                GetPasskeyRequestData(
                    rpId = "github.com",
                    challengeB64Url = "challenge",
                    allowCredentialIds = emptySet(),
                ),
                listOf(
                    metadata(
                        credentialId = "old-alice",
                        userName = "alice",
                        createdAtEpochMs = 10,
                        lastUsedEpochMs = 1_000,
                    ),
                    metadata(
                        credentialId = "new-alice",
                        userName = "alice",
                        createdAtEpochMs = 20,
                        lastUsedEpochMs = 20,
                    ),
                    metadata(
                        credentialId = "bob",
                        userName = "bob",
                        createdAtEpochMs = 15,
                        lastUsedEpochMs = 15,
                    ),
                ),
            )

        assertEquals(listOf("new-alice", "bob"), result.map { it.credentialIdB64Url })
    }

    @Test
    fun allowListRequestKeepsMatchedCandidatesUnchanged() {
        val candidates =
            listOf(
                metadata("old-alice", "alice", createdAtEpochMs = 10, lastUsedEpochMs = 1_000),
                metadata("new-alice", "alice", createdAtEpochMs = 20, lastUsedEpochMs = 20),
            )

        val result =
            passkeyCandidatesForGetRequest(
                GetPasskeyRequestData(
                    rpId = "github.com",
                    challengeB64Url = "challenge",
                    allowCredentialIds = setOf("old-alice", "new-alice"),
                ),
                candidates,
            )

        assertEquals(candidates, result)
    }

    private fun metadata(
        credentialId: String,
        userName: String,
        createdAtEpochMs: Long,
        lastUsedEpochMs: Long,
    ): AndroidPasskeySummary {
        return AndroidPasskeySummary(
            credentialIdB64Url = credentialId,
            rpId = "github.com",
            userName = userName,
            userDisplayName = userName.replaceFirstChar { it.uppercase() },
            signCount = 0,
            createdAtEpochMs = createdAtEpochMs,
            lastUsedEpochMs = lastUsedEpochMs,
        )
    }
}
