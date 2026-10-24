package com.chromvoid.air.session

import com.chromvoid.air.bridge.wire.CredentialWebsiteRule
import com.chromvoid.air.bridge.wire.PassmanagerWebsiteReadRequest
import com.chromvoid.air.bridge.wire.PassmanagerWebsiteResult
import com.chromvoid.air.bridge.wire.PassmanagerWebsiteUpdateRequest
import com.chromvoid.air.bridge.wire.PassmanagerWebsiteValidateRequest
import com.chromvoid.air.ffi.AirImportMode
import com.chromvoid.air.ui.transfer.ImportFileTooLarge
import com.chromvoid.air.ui.transfer.ImportSource
import com.chromvoid.air.ui.transfer.ReviewedImport
import java.io.ByteArrayOutputStream
import java.io.InputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import com.chromvoid.air.bridge.AirSessionRuntime
import com.chromvoid.air.bridge.perform
import com.chromvoid.air.bridge.wire.PassmanagerSSHEditRequest
import com.chromvoid.air.bridge.wire.PassmanagerSSHExportRequest
import com.chromvoid.air.bridge.wire.PassmanagerSSHExportResponse
import com.chromvoid.air.bridge.wire.PassmanagerSSHImportRequest
import com.chromvoid.air.bridge.wire.PassmanagerSSHKeyCreateResponse
import com.chromvoid.air.bridge.wire.PassmanagerSSHKeygenRequest
import com.chromvoid.air.bridge.wire.PassmanagerSSHPageRequest
import com.chromvoid.air.bridge.wire.PassmanagerSSHPageResponse
import com.chromvoid.air.bridge.wire.SSHKeySummary
import com.chromvoid.air.bridge.wire.CredentialDetail
import com.chromvoid.air.bridge.wire.CredentialTagSummary
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryPageRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryPageResponse
import com.chromvoid.air.bridge.wire.PassmanagerEntrySaveResponse
import com.chromvoid.air.bridge.wire.PassmanagerEntryUpdateRequest
import com.chromvoid.air.bridge.wire.PassmanagerOtpURIResponse
import com.chromvoid.air.bridge.wire.PassmanagerOtpURIRequest
import com.chromvoid.air.bridge.wire.PassmanagerOtpRecordsResponse
import com.chromvoid.air.bridge.wire.PassmanagerOtpRecordsRequest
import com.chromvoid.air.bridge.wire.PassmanagerOtpRecordSaveRequest
import com.chromvoid.air.bridge.wire.PassmanagerOtpRecordRequest
import com.chromvoid.air.bridge.wire.OtpPreviewResponse
import com.chromvoid.air.bridge.wire.PassmanagerGroupPageRequest
import com.chromvoid.air.bridge.wire.PassmanagerGroupPageResponse
import com.chromvoid.air.bridge.wire.PassmanagerIconGetManyRequest
import com.chromvoid.air.bridge.wire.PassmanagerIconGetManyResponse
import com.chromvoid.air.bridge.wire.PassmanagerGroupRenameRequest
import com.chromvoid.air.bridge.wire.PassmanagerPasswordGenerateRequest
import com.chromvoid.air.bridge.wire.PassmanagerPasswordGenerateResponse
import com.chromvoid.air.bridge.wire.PassmanagerSecretReadResponse
import com.chromvoid.air.bridge.wire.PassmanagerSecurityAuditPageRequest
import com.chromvoid.air.bridge.wire.PassmanagerSecurityAuditPageResponse
import com.chromvoid.air.bridge.wire.PassmanagerTagDeleteRequest
import com.chromvoid.air.bridge.wire.PassmanagerTagPageRequest
import com.chromvoid.air.bridge.wire.PassmanagerTagPageResponse
import com.chromvoid.air.bridge.wire.PassmanagerTagSaveRequest
import com.chromvoid.air.ffi.AirPhase
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.credentials.CREDENTIAL_PAGE_SIZE
import com.chromvoid.air.ui.credentials.CredentialStore
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The credential commands over the session's runtime. It holds nothing: each
 * call names its generation, and Rust refuses one that is no longer current.
 */
internal class SessionCredentialStore(
    private val runtime: () -> AirSessionRuntime?,
) : CredentialStore {
    override suspend fun credentialPage(
        request: PassmanagerEntryPageRequest,
        generation: ULong,
    ): PassmanagerEntryPageResponse = current().perform<PassmanagerEntryPageRequest, PassmanagerEntryPageResponse>(
        "passmanager:entry:page",
        request,
        AirPhase.UNLOCKED,
        generation,
    )

    // Core has no generated request type for this command; iOS sends the same field.
    override suspend fun credentialDetail(id: String, generation: ULong): CredentialDetail =
        current().perform<JsonObject, CredentialDetail>(
            "passmanager:entry:detail",
            buildJsonObject { put("entry_id", id) },
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun readCredentialSecret(id: String, type: String, generation: ULong): String =
        current().perform<JsonObject, PassmanagerSecretReadResponse>(
            "passmanager:secret:read",
            buildJsonObject {
                put("entry_id", id)
                put("secret_type", type)
            },
            AirPhase.UNLOCKED,
            generation,
        ).value

    override suspend fun updateCredential(
        request: PassmanagerEntryUpdateRequest,
        generation: ULong,
    ): PassmanagerEntrySaveResponse = current().perform<PassmanagerEntryUpdateRequest, PassmanagerEntrySaveResponse>(
        "passmanager:entry:update",
        request,
        AirPhase.UNLOCKED,
        generation,
    )

    override suspend fun saveCredentialSecret(id: String, type: String, value: String, generation: ULong) {
        current().perform<JsonObject, JsonElement>(
            "passmanager:secret:save",
            buildJsonObject {
                put("entry_id", id)
                put("secret_type", type)
                put("value", value)
            },
            AirPhase.UNLOCKED,
            generation,
        )
    }

    override suspend fun credentialIcons(
        iconRefs: List<String>,
        generation: ULong,
    ): PassmanagerIconGetManyResponse =
        current().perform<PassmanagerIconGetManyRequest, PassmanagerIconGetManyResponse>(
            "passmanager:icon:getMany",
            PassmanagerIconGetManyRequest(iconRefs = iconRefs),
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun generatePassword(request: PassmanagerPasswordGenerateRequest, generation: ULong): String =
        current().perform<PassmanagerPasswordGenerateRequest, PassmanagerPasswordGenerateResponse>(
            "passmanager:password:generate",
            request,
            AirPhase.UNLOCKED,
            generation,
        ).password

    override suspend fun groupPage(parent: String, offset: Long, generation: ULong): PassmanagerGroupPageResponse =
        current().perform<PassmanagerGroupPageRequest, PassmanagerGroupPageResponse>(
            "passmanager:group:page",
            PassmanagerGroupPageRequest(limit = CREDENTIAL_PAGE_SIZE, offset = offset, parent = parent),
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun ensureGroup(path: String, generation: ULong) {
        current().perform<JsonObject, JsonElement>(
            "passmanager:group:ensure",
            buildJsonObject { put("path", path) },
            AirPhase.UNLOCKED,
            generation,
        )
    }

    override suspend fun renameGroup(path: String, name: String, generation: ULong) {
        current().perform<PassmanagerGroupRenameRequest, JsonElement>(
            "passmanager:group:rename",
            PassmanagerGroupRenameRequest(name = name, path = path),
            AirPhase.UNLOCKED,
            generation,
        )
    }

    override suspend fun deleteGroup(path: String, generation: ULong) {
        current().perform<JsonObject, JsonElement>(
            "passmanager:group:delete",
            buildJsonObject { put("path", path) },
            AirPhase.UNLOCKED,
            generation,
        )
    }

    override suspend fun tagPage(offset: Long, generation: ULong): PassmanagerTagPageResponse =
        current().perform<PassmanagerTagPageRequest, PassmanagerTagPageResponse>(
            "passmanager:tag:page",
            PassmanagerTagPageRequest(limit = CREDENTIAL_PAGE_SIZE, offset = offset),
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun saveTag(
        sourceKey: String?,
        label: String,
        colorId: String,
        generation: ULong,
    ): CredentialTagSummary =
        current().perform<PassmanagerTagSaveRequest, CredentialTagSummary>(
            "passmanager:tag:save",
            PassmanagerTagSaveRequest(colorID = colorId, label = label, sourceKey = sourceKey),
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun deleteTag(key: String, generation: ULong) {
        current().perform<PassmanagerTagDeleteRequest, JsonElement>(
            "passmanager:tag:delete",
            PassmanagerTagDeleteRequest(key = key),
            AirPhase.UNLOCKED,
            generation,
        )
    }

    override suspend fun securityAuditPage(
        request: PassmanagerSecurityAuditPageRequest,
        generation: ULong,
    ): PassmanagerSecurityAuditPageResponse =
        current().perform<PassmanagerSecurityAuditPageRequest, PassmanagerSecurityAuditPageResponse>(
            "passmanager:securityAudit:page",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun deleteCredential(id: String, generation: ULong) {
        current().perform<JsonObject, JsonElement>(
            "passmanager:entry:delete",
            buildJsonObject { put("entry_id", id) },
            AirPhase.UNLOCKED,
            generation,
        )
    }

    override suspend fun otpRecords(id: String, generation: ULong): PassmanagerOtpRecordsResponse =
        current().perform<PassmanagerOtpRecordsRequest, PassmanagerOtpRecordsResponse>(
            "passmanager:otp:record:list",
            PassmanagerOtpRecordsRequest(entryID = id),
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun otpCode(request: PassmanagerOtpRecordRequest, generation: ULong): OtpPreviewResponse =
        current().perform<PassmanagerOtpRecordRequest, OtpPreviewResponse>(
            "passmanager:otp:record:code",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun saveOtp(request: PassmanagerOtpRecordSaveRequest, generation: ULong) {
        current().perform<PassmanagerOtpRecordSaveRequest, JsonElement>(
            "passmanager:otp:record:save",
            request,
            AirPhase.UNLOCKED,
            generation,
        )
    }

    override suspend fun deleteOtp(request: PassmanagerOtpRecordRequest, generation: ULong) {
        current().perform<PassmanagerOtpRecordRequest, JsonElement>(
            "passmanager:otp:record:delete",
            request,
            AirPhase.UNLOCKED,
            generation,
        )
    }

    override suspend fun parseOtpUri(uri: String, generation: ULong): PassmanagerOtpURIResponse =
        current().perform<PassmanagerOtpURIRequest, PassmanagerOtpURIResponse>(
            "passmanager:otp:parseUri",
            PassmanagerOtpURIRequest(uri = uri),
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun sshPage(request: PassmanagerSSHPageRequest, generation: ULong): PassmanagerSSHPageResponse =
        current().perform<PassmanagerSSHPageRequest, PassmanagerSSHPageResponse>(
            "passmanager:ssh:page",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun generateSsh(
        request: PassmanagerSSHKeygenRequest,
        generation: ULong,
    ): PassmanagerSSHKeyCreateResponse =
        current().perform<PassmanagerSSHKeygenRequest, PassmanagerSSHKeyCreateResponse>(
            "passmanager:ssh:keygen",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun importSsh(
        request: PassmanagerSSHImportRequest,
        generation: ULong,
    ): PassmanagerSSHKeyCreateResponse =
        current().perform<PassmanagerSSHImportRequest, PassmanagerSSHKeyCreateResponse>(
            "passmanager:ssh:key:import",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun exportSsh(
        request: PassmanagerSSHExportRequest,
        generation: ULong,
    ): PassmanagerSSHExportResponse = current().perform<PassmanagerSSHExportRequest, PassmanagerSSHExportResponse>(
        "passmanager:ssh:key:export",
        request,
        AirPhase.UNLOCKED,
        generation,
    )

    override suspend fun editSsh(request: PassmanagerSSHEditRequest, generation: ULong): SSHKeySummary =
        current().perform<PassmanagerSSHEditRequest, SSHKeySummary>(
            "passmanager:ssh:key:edit",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun deleteSsh(id: String, generation: ULong) {
        current().perform<JsonObject, JsonElement>(
            "passmanager:ssh:key:delete",
            buildJsonObject { put("key_id", id) },
            AirPhase.UNLOCKED,
            generation,
        )
    }

    override suspend fun websiteRules(id: String, generation: ULong): PassmanagerWebsiteResult =
        current().perform<PassmanagerWebsiteReadRequest, PassmanagerWebsiteResult>(
            "passmanager:entry:websites:read",
            PassmanagerWebsiteReadRequest(entryID = id),
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun validateWebsites(
        rules: List<CredentialWebsiteRule>,
        generation: ULong,
    ): PassmanagerWebsiteResult = current().perform<PassmanagerWebsiteValidateRequest, PassmanagerWebsiteResult>(
        "passmanager:entry:websites:validate",
        PassmanagerWebsiteValidateRequest(rules = rules),
        AirPhase.UNLOCKED,
        generation,
    )

    override suspend fun updateWebsites(
        request: PassmanagerWebsiteUpdateRequest,
        generation: ULong,
    ): PassmanagerWebsiteResult = current().perform<PassmanagerWebsiteUpdateRequest, PassmanagerWebsiteResult>(
        "passmanager:entry:websites:update",
        request,
        AirPhase.UNLOCKED,
        generation,
    )

    override suspend fun reviewCredentialFile(
        source: ImportSource,
        replacing: Boolean,
        sourcePassword: String?,
        generation: ULong,
    ): ReviewedImport {
        val runtime = current()
        val limits = runtime.credentialImportLimits()
        val bytes = withContext(Dispatchers.IO) { source.open().use { readAtMost(it, limits.totalBytes) } }
        try {
            val mode = if (replacing) AirImportMode.REPLACE else AirImportMode.MERGE
            val transfer = runtime.beginCredentialImport(bytes.size.toULong(), mode, generation)
            val chunk = limits.chunkBytes.toInt().coerceAtLeast(1)
            var offset = 0
            while (offset < bytes.size) {
                val end = minOf(bytes.size, offset + chunk)
                transfer.append(bytes.copyOfRange(offset, end))
                offset = end
            }
            val preview = transfer.review(sourcePassword)
            return object : ReviewedImport {
                override val preview = preview

                override suspend fun commit() = transfer.commit()

                override fun cancel() = transfer.cancel()
            }
        } finally {
            bytes.fill(0)
        }
    }

    override suspend fun exportCredentialDocument(generation: ULong): ByteArray =
        current().exportCredentialDocument(generation)

    override suspend fun clearCredentials(generation: ULong) {
        current().clearCredentials(generation)
    }

    override suspend fun createCredential(
        request: PassmanagerEntryCreateRequest,
        generation: ULong,
    ): PassmanagerEntrySaveResponse = current().perform<PassmanagerEntryCreateRequest, PassmanagerEntrySaveResponse>(
        "passmanager:entry:create",
        request,
        AirPhase.UNLOCKED,
        generation,
    )

    private fun current(): AirSessionRuntime = runtime() ?: throw BridgeException.SessionRevoked()
}

/** Reads the whole stream, refusing one longer than [limit] bytes before it is all in memory. */
private fun readAtMost(input: InputStream, limit: ULong): ByteArray {
    val out = ByteArrayOutputStream()
    val buffer = ByteArray(64 * 1024)
    while (true) {
        val read = input.read(buffer)
        if (read < 0) break
        out.write(buffer, 0, read)
        if (out.size().toULong() > limit) {
            buffer.fill(0)
            throw ImportFileTooLarge()
        }
    }
    buffer.fill(0)
    return out.toByteArray()
}
