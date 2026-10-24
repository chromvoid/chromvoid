package com.chromvoid.air.ui.credentials

import com.chromvoid.air.bridge.wire.CredentialWebsiteRule
import com.chromvoid.air.bridge.wire.PassmanagerWebsiteResult
import com.chromvoid.air.bridge.wire.PassmanagerWebsiteUpdateRequest
import com.chromvoid.air.bridge.wire.CredentialDetail
import com.chromvoid.air.bridge.wire.CredentialTagSummary
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateRequest
import com.chromvoid.air.bridge.wire.PassmanagerGroupPageResponse
import com.chromvoid.air.bridge.wire.PassmanagerIconGetManyResponse
import com.chromvoid.air.bridge.wire.PassmanagerEntryPageRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryPageResponse
import com.chromvoid.air.bridge.wire.PassmanagerEntrySaveResponse
import com.chromvoid.air.bridge.wire.PassmanagerEntryUpdateRequest
import com.chromvoid.air.bridge.wire.PassmanagerOtpURIResponse
import com.chromvoid.air.bridge.wire.PassmanagerOtpRecordsResponse
import com.chromvoid.air.bridge.wire.PassmanagerOtpRecordSaveRequest
import com.chromvoid.air.bridge.wire.PassmanagerOtpRecordRequest
import com.chromvoid.air.bridge.wire.OtpPreviewResponse
import com.chromvoid.air.bridge.wire.PassmanagerPasswordGenerateRequest
import com.chromvoid.air.bridge.wire.PassmanagerSecurityAuditPageRequest
import com.chromvoid.air.bridge.wire.PassmanagerSecurityAuditPageResponse
import com.chromvoid.air.bridge.wire.PassmanagerTagPageResponse
import com.chromvoid.air.ui.ssh.SshStore
import com.chromvoid.air.ui.transfer.CredentialTransferStore

/**
 * What the credential screens may ask of the vault. Every call names the
 * generation it belongs to, so an answer from a session that has since locked
 * is refused by Rust instead of reaching a screen.
 */
public interface CredentialStore : SshStore, CredentialTransferStore {
    public suspend fun credentialPage(
        request: PassmanagerEntryPageRequest,
        generation: ULong,
    ): PassmanagerEntryPageResponse

    public suspend fun credentialDetail(id: String, generation: ULong): CredentialDetail

    /** One protected field of one record: `password`, `note`, `card_pan` or `card_cvv`. */
    public suspend fun readCredentialSecret(id: String, type: String, generation: ULong): String

    /** Metadata only; protected fields are written one by one with [saveCredentialSecret]. */
    public suspend fun updateCredential(
        request: PassmanagerEntryUpdateRequest,
        generation: ULong,
    ): PassmanagerEntrySaveResponse

    public suspend fun saveCredentialSecret(id: String, type: String, value: String, generation: ULong)

    public suspend fun generatePassword(request: PassmanagerPasswordGenerateRequest, generation: ULong): String

    /** The stored icons of [iconRefs]; Core takes at most 64 digests per call. */
    public suspend fun credentialIcons(iconRefs: List<String>, generation: ULong): PassmanagerIconGetManyResponse

    /** One page of the direct subgroups of [parent] (`/` for the vault root). */
    public suspend fun groupPage(parent: String, offset: Long, generation: ULong): PassmanagerGroupPageResponse

    /** Creates the group at [path] if it does not exist. */
    public suspend fun ensureGroup(path: String, generation: ULong)

    public suspend fun renameGroup(path: String, name: String, generation: ULong)

    /** Deletes the group and everything nested in it. */
    public suspend fun deleteGroup(path: String, generation: ULong)

    public suspend fun tagPage(offset: Long, generation: ULong): PassmanagerTagPageResponse

    /** Creates a tag, or renames and recolours the one [sourceKey] names; returns what was saved. */
    public suspend fun saveTag(
        sourceKey: String?,
        label: String,
        colorId: String,
        generation: ULong,
    ): CredentialTagSummary

    /** Deletes the tag and removes it from every record. */
    public suspend fun deleteTag(key: String, generation: ULong)

    /** One page of Core's security audit, all from the revision the first page named. */
    public suspend fun securityAuditPage(
        request: PassmanagerSecurityAuditPageRequest,
        generation: ULong,
    ): PassmanagerSecurityAuditPageResponse

    /** Deletes one record with its protected fields. */
    public suspend fun deleteCredential(id: String, generation: ULong)

    /** The login's website rules, with the revision an update must name. */
    public suspend fun websiteRules(id: String, generation: ULong): PassmanagerWebsiteResult

    /** Checks rules for a record not yet created; nothing is stored. */
    public suspend fun validateWebsites(rules: List<CredentialWebsiteRule>, generation: ULong): PassmanagerWebsiteResult

    public suspend fun updateWebsites(
        request: PassmanagerWebsiteUpdateRequest,
        generation: ULong,
    ): PassmanagerWebsiteResult

    public suspend fun otpRecords(id: String, generation: ULong): PassmanagerOtpRecordsResponse

    /** The current code of one record; `left_seconds` says how long it stays valid. */
    public suspend fun otpCode(request: PassmanagerOtpRecordRequest, generation: ULong): OtpPreviewResponse

    public suspend fun saveOtp(request: PassmanagerOtpRecordSaveRequest, generation: ULong)

    public suspend fun deleteOtp(request: PassmanagerOtpRecordRequest, generation: ULong)

    /** Core parses an `otpauth://` URI; nothing here interprets its secret. */
    public suspend fun parseOtpUri(uri: String, generation: ULong): PassmanagerOtpURIResponse

    public suspend fun createCredential(
        request: PassmanagerEntryCreateRequest,
        generation: ULong,
    ): PassmanagerEntrySaveResponse
}

/** The page size iOS uses; Core caps a page anyway. */
public const val CREDENTIAL_PAGE_SIZE: Long = 50
