package com.chromvoid.app.credentialprovider

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AndroidBridgeGatewayTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun warmUp_usesApplicationDataDirForNativeRuntime() {
        val runtime = FakeNativeCredentialProviderRuntime()
        val gateway = JniAndroidBridgeGateway(context, runtime)

        gateway.warmUp()

        val ensuredDataDir = runtime.lastEnsuredDataDir
        assertNotNull(ensuredDataDir)
        assertEquals(context.applicationInfo.dataDir, ensuredDataDir)
        assertNotEquals(context.filesDir.absolutePath, ensuredDataDir)
    }

    @Test
    fun autofillList_forwardsExplicitDiagnosticsFlag() {
        val runtime = FakeNativeCredentialProviderRuntime()
        val gateway = JniAndroidBridgeGateway(context, runtime)

        val withoutDiagnostics =
            gateway.autofillList(
                origin = "https://github.com/login",
                domain = "github.com",
                includeDiagnostics = false,
            )
        assertEquals(false, runtime.lastIncludeDiagnostics)
        assertNull((withoutDiagnostics as BridgeResult.Success).value.diagnostics)

        val withDiagnostics =
            gateway.autofillList(
                origin = "https://github.com/login",
                domain = "github.com",
                includeDiagnostics = true,
            )
        assertEquals(true, runtime.lastIncludeDiagnostics)
        assertEquals(1, (withDiagnostics as BridgeResult.Success).value.diagnostics?.entryCount)
    }
}

private class FakeNativeCredentialProviderRuntime : NativeCredentialProviderRuntime {
    var lastEnsuredDataDir: String? = null
    var lastIncludeDiagnostics: Boolean? = null

    override fun ensureRuntime(dataDir: String): Boolean {
        lastEnsuredDataDir = dataDir
        return true
    }

    override fun runtimeReady(): Boolean = true

    override fun currentApiLevel(): Int = 34

    override fun providerStatus(): String = ""

    override fun autofillList(origin: String, domain: String, includeDiagnostics: Boolean): String {
        lastIncludeDiagnostics = includeDiagnostics
        val debugField =
            if (includeDiagnostics) {
                """,
                    "debug": {
                      "entry_count": 1,
                      "candidate_count": 1
                    }
                """.trimIndent()
            } else {
                ""
            }
        return """
            {
              "contract_version": ${BridgeContractVersion.CURRENT},
              "payload": {
                "ok": true,
                "session_id": "sess-1",
                "candidates": []$debugField
              }
            }
        """.trimIndent()
    }

    override fun autofillCloseSession(sessionId: String): String = ""

    override fun autofillGetSecret(sessionId: String, credentialId: String, otpId: String): String = ""

    override fun passwordSaveStart(payloadJson: String): String = ""

    override fun passwordSaveRequest(token: String): String = ""

    override fun passwordSaveMarkLaunched(token: String): String = ""

    override fun passkeyPreflight(command: String, payloadJson: String): String = ""

    override fun passkeyQuery(payloadJson: String): String = ""

    override fun passkeyCreate(payloadJson: String): String = ""

    override fun passkeyGet(payloadJson: String): String = ""
}
