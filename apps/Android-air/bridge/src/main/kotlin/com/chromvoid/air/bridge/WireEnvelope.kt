package com.chromvoid.air.bridge

import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.SerializationException
import kotlinx.serialization.SerializationStrategy
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

/** Core answered `{"ok": false, "code": …}`: a refusal, never an empty success. */
public class CoreRefusal(public val code: String, command: String) :
    Exception("$command refused with $code")

/**
 * Core's reply did not match the contract the DTOs were generated from.
 *
 * This is never read as success with missing data: a reply that cannot be
 * decoded is a defect on one side of the bridge, and the caller must see it.
 */
public class WireContractViolation(command: String, cause: Throwable) :
    Exception("$command reply does not match the wire contract", cause)

/**
 * The RPC envelope, in one place.
 *
 * Requests are `{"v": 1, "command": …, "data": …}`; replies are
 * `{"ok": true, "result": …}` or `{"ok": false, "code": …}`. Payloads are the
 * DTOs generated from the Rust schema. The decoding rules are the ones the iOS
 * client applies: an unknown field is a later Core adding something optional
 * and is ignored; an unknown enum value, a wrong type or a missing required
 * field is a contract violation.
 */
public object WireEnvelope {
    public const val PROTOCOL_VERSION: Int = 1

    public val json: Json = Json {
        ignoreUnknownKeys = true
        // An absent optional is omitted rather than sent as null, as Swift's
        // Codable does, so both clients put the same bytes on the wire.
        explicitNulls = false
    }

    public fun <Request> encode(
        command: String,
        request: Request,
        serializer: SerializationStrategy<Request>,
    ): ByteArray {
        val envelope = JsonObject(
            mapOf(
                "v" to JsonPrimitive(PROTOCOL_VERSION),
                "command" to JsonPrimitive(command),
                "data" to json.encodeToJsonElement(serializer, request),
            ),
        )
        return json.encodeToString(JsonObject.serializer(), envelope).toByteArray(Charsets.UTF_8)
    }

    /**
     * The `result` of a successful reply as [Response]. A missing result is
     * decoded as JSON null, so a command that answers nothing is read with a
     * nullable or [kotlinx.serialization.json.JsonElement] response type and
     * a command that must answer something fails loudly when it does not.
     */
    public fun <Response> decode(
        command: String,
        payload: ByteArray,
        serializer: DeserializationStrategy<Response>,
    ): Response {
        val reply = try {
            json.parseToJsonElement(String(payload, Charsets.UTF_8)).jsonObject
        } catch (error: SerializationException) {
            throw WireContractViolation(command, error)
        } catch (error: IllegalArgumentException) {
            throw WireContractViolation(command, error)
        }
        val ok = (reply["ok"] as? JsonPrimitive)?.booleanOrNull
            ?: throw WireContractViolation(command, SerializationException("reply has no boolean ok"))
        if (!ok) {
            val code = (reply["code"] as? JsonPrimitive)?.contentOrNull
            throw CoreRefusal(code?.ifEmpty { null } ?: "unknown", command)
        }
        return try {
            json.decodeFromJsonElement(serializer, reply["result"] ?: JsonNull)
        } catch (error: SerializationException) {
            throw WireContractViolation(command, error)
        } catch (error: IllegalArgumentException) {
            throw WireContractViolation(command, error)
        }
    }
}

/** Builds a request body from string fields, for the few commands with no generated request type. */
internal fun fields(vararg pairs: Pair<String, String>): JsonObject = kotlinx.serialization.json.buildJsonObject {
    pairs.forEach { (name, value) -> put(name, value) }
}
