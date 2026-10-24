package com.chromvoid.air.bridge

import com.chromvoid.air.bridge.wire.PassmanagerEntryListResponse
import com.chromvoid.air.bridge.wire.PassmanagerEntryPageResponse
import com.chromvoid.air.bridge.wire.PassmanagerEntrySaveResponse
import com.chromvoid.air.bridge.wire.PassmanagerTagSaveRequest
import com.chromvoid.air.bridge.wire.VaultStatusResponse
import com.chromvoid.air.bridge.wire.WalletAccountMetaKind
import com.chromvoid.air.bridge.wire.WalletAccountsListResponse
import java.io.File
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The generated DTOs against replies Rust actually produced. The fixtures are
 * the ones the iOS bridge tests decode, so both clients are held to the same
 * bytes.
 */
public class WireEnvelopeTest {
    private val fixtures: JsonObject by lazy {
        val path = checkNotNull(System.getProperty("air.wireFixtures")) { "air.wireFixtures is not set" }
        WireEnvelope.json.parseToJsonElement(File(path).readText()).jsonObject
    }

    private fun <T> decodeFixture(name: String, serializer: DeserializationStrategy<T>): T {
        val reply = checkNotNull(fixtures[name]) { "fixture $name is missing" }
        return WireEnvelope.decode(name, reply.toString().toByteArray(), serializer)
    }

    @Test
    public fun vaultStatusDecodesAndToleratesAFieldALaterCoreAdds() {
        assertFalse(decodeFixture("locked_status", VaultStatusResponse.serializer()).isUnlocked)
        assertTrue(decodeFixture("active_status", VaultStatusResponse.serializer()).isUnlocked)
        assertFalse(decodeFixture("unknown_optional_field", VaultStatusResponse.serializer()).isUnlocked)
    }

    @Test
    public fun credentialRepliesKeepTheirContent() {
        assertEquals(1, decodeFixture("list", PassmanagerEntryListResponse.serializer()).entries.size)

        val page = decodeFixture("entry_page", PassmanagerEntryPageResponse.serializer())
        assertEquals("Почта", page.entries.first().title)
        assertEquals(50L, page.nextOffset)

        assertEquals(
            "synthetic-created",
            decodeFixture("entry_created", PassmanagerEntrySaveResponse.serializer()).entryID,
        )
    }

    @Test
    public fun walletAccountsKeepKindAndAddress() {
        val accounts = decodeFixture("wallet_accounts", WalletAccountsListResponse.serializer()).accounts
        assertEquals(
            listOf(WalletAccountMetaKind.Imported, WalletAccountMetaKind.Derived),
            accounts.map { it.kind },
        )
        assertEquals("synthetic-imported", accounts.first().address)
    }

    @Test
    public fun anEmptyResultIsReadWhenTheCallerExpectsNothing() {
        assertEquals(JsonObject(emptyMap()), decodeFixture("unlock", JsonElement.serializer()))
    }

    @Test
    public fun aRefusalCarriesCoresCodeAndIsNeverASuccess() {
        val refusal = assertThrows(CoreRefusal::class.java) {
            decodeFixture("validation_failure", VaultStatusResponse.serializer())
        }
        assertEquals("EMPTY_PAYLOAD", refusal.code)
    }

    @Test
    public fun aReplyOutsideTheContractIsAViolationNotPartialData() {
        val unknownKind = """{"ok":true,"result":{"accounts":[{"account_id":"a","created_at":1,
            |"kind":"borrowed","network":"n","updated_at":2,"wallet_id":"w"}]}}""".trimMargin()
        fun <T> violates(reply: String, serializer: DeserializationStrategy<T>) {
            assertThrows(WireContractViolation::class.java) {
                WireEnvelope.decode("command", reply.toByteArray(), serializer)
            }
        }
        violates(unknownKind, WalletAccountsListResponse.serializer())
        violates("""{"ok":true,"result":{}}""", VaultStatusResponse.serializer())
        violates("""{"result":{"is_unlocked":true}}""", JsonElement.serializer())
        violates("not json", JsonElement.serializer())
    }

    @Test
    public fun aRequestCarriesTheVersionTheCommandAndOmitsAbsentOptionals() {
        val bytes = WireEnvelope.encode(
            "passmanager:tag:save",
            PassmanagerTagSaveRequest(colorID = "blue", label = "Work"),
            PassmanagerTagSaveRequest.serializer(),
        )
        val envelope = WireEnvelope.json.parseToJsonElement(String(bytes)).jsonObject
        assertEquals(1, envelope.getValue("v").jsonPrimitive.content.toInt())
        assertEquals("passmanager:tag:save", envelope.getValue("command").jsonPrimitive.content)
        val data = envelope.getValue("data").jsonObject
        assertEquals(setOf("color_id", "label"), data.keys)
        assertFalse(data.containsKey("source_key"))
        assertTrue(data["label"] != JsonNull)
    }
}
