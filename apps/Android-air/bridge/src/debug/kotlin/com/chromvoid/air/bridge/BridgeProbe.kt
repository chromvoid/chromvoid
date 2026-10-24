package com.chromvoid.air.bridge

import android.content.Context
import com.chromvoid.air.ffi.AirNative
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ffi.FixtureHarness
import com.chromvoid.air.ffi.checkBridge
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** What the development probe observed. It never reports vault content. */
public data class BridgeReport(
    val protocolVersion: Int,
    val fingerprint: String,
    val fixtureEnabled: Boolean,
    val storageRoot: String,
    val initiallyLocked: Boolean,
    val entryCount: Int,
    val folderCount: Int,
    val lockedAfterProbe: Boolean,
)

/** Lets a caller substitute the probe without a device or a native library. */
public fun interface BridgeProbing {
    public suspend fun run(context: Context): BridgeProbeResult
}

public sealed interface BridgeProbeResult {
    public data class Ready(val report: BridgeReport) : BridgeProbeResult

    /** [code] is the bridge error name, not a message to parse. */
    public data class Unavailable(val code: String, val detail: String?) : BridgeProbeResult
}

/**
 * The W1 feasibility slice: load the library, hand over the process context,
 * confirm bindings and binary agree, and run one synthetic round trip.
 *
 * The harness exists only in a fixture build - Rust refuses to construct it in
 * an ordinary one - and it owns no storage, keystore or network. The storage
 * root is reported so the identity and root rules can be read off the device,
 * but this probe never opens a real runtime over it.
 */
public class BridgeProbe(
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
) : BridgeProbing {
    override suspend fun run(context: Context): BridgeProbeResult = withContext(dispatcher) {
        val storageRoot = context.filesDir.resolve(STORAGE_ROOT_NAME).absolutePath
        try {
            AirNative.initialize(context)
            val info = checkBridge(BuildFingerprint.EXPECTED)
            val harness = FixtureHarness(BuildFingerprint.EXPECTED)
            try {
                val initial = harness.unlocked()
                harness.call("vault:unlock", mapOf("password" to FIXTURE_PASSWORD))
                val catalog = harness.call("passmanager:entry:list")
                harness.call("vault:lock")
                val finalStatus = harness.unlocked()
                BridgeProbeResult.Ready(
                    BridgeReport(
                        protocolVersion = info.protocolVersion.toInt(),
                        fingerprint = info.fingerprint,
                        fixtureEnabled = info.fixtureEnabled,
                        storageRoot = storageRoot,
                        initiallyLocked = !initial,
                        entryCount = catalog.getJSONArray("entries").length(),
                        folderCount = catalog.getJSONArray("folders").length(),
                        lockedAfterProbe = !finalStatus,
                    ),
                )
            } finally {
                harness.close()
            }
        } catch (error: BridgeException) {
            BridgeProbeResult.Unavailable(
                code = error::class.simpleName ?: "BridgeException",
                detail = error.message,
            )
        } catch (error: FixtureRefused) {
            BridgeProbeResult.Unavailable(code = "FixtureRefused", detail = error.message)
        } catch (error: UnsatisfiedLinkError) {
            BridgeProbeResult.Unavailable(code = "MissingNativeLibrary", detail = error.message)
        } catch (error: IllegalStateException) {
            BridgeProbeResult.Unavailable(code = "ContextHandoverFailed", detail = error.message)
        }
    }

    private fun FixtureHarness.unlocked(): Boolean = call("vault:status").getBoolean("is_unlocked")

    /**
     * Core answers `{"ok": true, "result": …}` or `{"ok": false, "code": …}`.
     * A refusal is an error here, never an empty success.
     */
    private fun FixtureHarness.call(
        command: String,
        data: Map<String, String> = emptyMap(),
    ): JSONObject {
        val request = JSONObject()
            .put("v", 1)
            .put("command", command)
            .put("data", JSONObject(data.toMap()))
            .toString()
            .toByteArray(Charsets.UTF_8)
        val reply = JSONObject(String(execute(request), Charsets.UTF_8))
        if (!reply.optBoolean("ok", false)) {
            throw FixtureRefused(command, reply.optString("code").ifEmpty { "unknown" })
        }
        return reply.getJSONObject("result")
    }

    private class FixtureRefused(command: String, code: String) :
        IllegalStateException("$command refused with $code")

    private companion object {
        const val STORAGE_ROOT_NAME = "ChromVoidAir"
        const val FIXTURE_PASSWORD = "air-synthetic-fixture"
    }
}
