// To parse the JSON, install kotlin's serialization plugin and do:
//
// val json        = Json { allowStructuredMapKeys = true }
// val coreWireRaw = json.parse(CoreWireRaw.serializer(), jsonString)

package com.chromvoid.air.bridge.wire

import kotlinx.serialization.*
import kotlinx.serialization.json.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*

@Serializable
data class CoreWireRaw (
    @SerialName("attachment_request")
    val attachmentRequest: CatalogAttachmentRequest,

    @SerialName("attachment_response")
    val attachmentResponse: CatalogAttachmentResponse,

    @SerialName("credential_detail")
    val credentialDetail: CredentialDetail,

    @SerialName("credential_update")
    val credentialUpdate: PassmanagerEntryUpdateRequest,

    @SerialName("document_link_request")
    val documentLinkRequest: CatalogDocumentLinkRequest,

    @SerialName("document_link_response")
    val documentLinkResponse: CatalogDocumentLinkResponse,

    @SerialName("document_saved")
    val documentSaved: CatalogFileReplaceResponse,

    @SerialName("entry_create_request")
    val entryCreateRequest: PassmanagerEntryCreateRequest,

    @SerialName("entry_list")
    val entryList: PassmanagerEntryListResponse,

    @SerialName("entry_page")
    val entryPage: PassmanagerEntryPageResponse,

    @SerialName("entry_page_request")
    val entryPageRequest: PassmanagerEntryPageRequest,

    @SerialName("entry_save_response")
    val entrySaveResponse: PassmanagerEntrySaveResponse,

    val error: RPCError,

    @SerialName("file_source")
    val fileSource: SourceMetadataResponse,

    @SerialName("file_upload")
    val fileUpload: UploadResponse,

    @SerialName("folder_page")
    val folderPage: CatalogFolderPageResponse,

    @SerialName("folder_request")
    val folderRequest: CatalogFolderPageRequest,

    @SerialName("group_page")
    val groupPage: PassmanagerGroupPageResponse,

    @SerialName("group_page_request")
    val groupPageRequest: PassmanagerGroupPageRequest,

    @SerialName("group_rename")
    val groupRename: PassmanagerGroupRenameRequest,

    @SerialName("icon_get_many")
    val iconGetMany: PassmanagerIconGetManyResponse,

    @SerialName("icon_get_many_request")
    val iconGetManyRequest: PassmanagerIconGetManyRequest,

    @SerialName("markdown_document")
    val markdownDocument: MarkdownDocument,

    @SerialName("master_rekey")
    val masterRekey: MasterRekeyResponse,

    @SerialName("master_rekey_request")
    val masterRekeyRequest: MasterRekeyRequest,

    @SerialName("node_created")
    val nodeCreated: NodeCreatedResponse,

    @SerialName("otp_code")
    val otpCode: PassmanagerOtpRecordRequest,

    @SerialName("otp_delete")
    val otpDelete: PassmanagerOtpRecordRequest,

    @SerialName("otp_generated")
    val otpGenerated: OtpPreviewResponse,

    @SerialName("otp_list")
    val otpList: PassmanagerOtpRecordsRequest,

    @SerialName("otp_response")
    val otpResponse: PassmanagerOtpRecordsResponse,

    @SerialName("otp_save")
    val otpSave: PassmanagerOtpRecordSaveRequest,

    @SerialName("otp_uri_request")
    val otpURIRequest: PassmanagerOtpURIRequest,

    @SerialName("otp_uri_response")
    val otpURIResponse: PassmanagerOtpURIResponse,

    @SerialName("passkey_delete_request")
    val passkeyDeleteRequest: VaultPasskeyDeleteRequest,

    @SerialName("passkey_delete_response")
    val passkeyDeleteResponse: VaultPasskeyDeleteResponse,

    @SerialName("passkeys_list")
    val passkeysList: VaultPasskeysListResponse,

    @SerialName("password_generation_request")
    val passwordGenerationRequest: PassmanagerPasswordGenerateRequest,

    @SerialName("password_generation_response")
    val passwordGenerationResponse: PassmanagerPasswordGenerateResponse,

    @SerialName("payment_card_metadata")
    val paymentCardMetadata: PaymentCardMetadata,

    @SerialName("provider_status")
    val providerStatus: CredentialProviderStatusResponse,

    val request: RPCRequest,

    @SerialName("root_import_preview")
    val rootImportPreview: PassmanagerRootImportPreview,

    @SerialName("root_import_request")
    val rootImportRequest: PassmanagerRootImportRequest,

    @SerialName("secret_read")
    val secretRead: PassmanagerSecretReadResponse,

    @SerialName("security_audit_page")
    val securityAuditPage: PassmanagerSecurityAuditPageResponse,

    @SerialName("security_audit_request")
    val securityAuditRequest: PassmanagerSecurityAuditPageRequest,

    @SerialName("ssh_edit_request")
    val sshEditRequest: PassmanagerSSHEditRequest,

    @SerialName("ssh_export_request")
    val sshExportRequest: PassmanagerSSHExportRequest,

    @SerialName("ssh_export_response")
    val sshExportResponse: PassmanagerSSHExportResponse,

    @SerialName("ssh_import_request")
    val sshImportRequest: PassmanagerSSHImportRequest,

    @SerialName("ssh_keygen_request")
    val sshKeygenRequest: PassmanagerSSHKeygenRequest,

    @SerialName("ssh_keygen_response")
    val sshKeygenResponse: PassmanagerSSHKeyCreateResponse,

    @SerialName("ssh_page_request")
    val sshPageRequest: PassmanagerSSHPageRequest,

    @SerialName("ssh_page_response")
    val sshPageResponse: PassmanagerSSHPageResponse,

    val status: VaultStatusResponse,

    @SerialName("tag_delete")
    val tagDelete: PassmanagerTagDeleteRequest,

    @SerialName("tag_page")
    val tagPage: PassmanagerTagPageResponse,

    @SerialName("tag_page_request")
    val tagPageRequest: PassmanagerTagPageRequest,

    @SerialName("tag_save")
    val tagSave: PassmanagerTagSaveRequest,

    @SerialName("vault_rekey")
    val vaultRekey: VaultRekeyResponse,

    @SerialName("vault_rekey_request")
    val vaultRekeyRequest: VaultRekeyRequest,

    @SerialName("wallet_accounts")
    val walletAccounts: WalletAccountsListResponse,

    @SerialName("wallet_accounts_request")
    val walletAccountsRequest: WalletAccountsListRequest,

    @SerialName("wallet_address")
    val walletAddress: WalletAddressesDeriveResponse,

    @SerialName("wallet_address_detect_request")
    val walletAddressDetectRequest: WalletAddressDetectRequest,

    @SerialName("wallet_address_detected")
    val walletAddressDetected: WalletAddressDetectResponse,

    @SerialName("wallet_address_request")
    val walletAddressRequest: WalletAddressesDeriveRequest,

    @SerialName("wallet_balance")
    val walletBalance: WalletBalanceGetResponse,

    @SerialName("wallet_balance_request")
    val walletBalanceRequest: WalletBalanceGetRequest,

    @SerialName("wallet_cancel_request")
    val walletCancelRequest: WalletTransactionCancelRequest,

    @SerialName("wallet_cancelled")
    val walletCancelled: WalletTransactionCancelResponse,

    @SerialName("wallet_confirm_request")
    val walletConfirmRequest: WalletTransactionConfirmRequest,

    @SerialName("wallet_confirmed")
    val walletConfirmed: WalletTransactionConfirmResponse,

    @SerialName("wallet_contact_create_request")
    val walletContactCreateRequest: WalletAddressBookCreateRequest,

    @SerialName("wallet_contact_created")
    val walletContactCreated: WalletAddressBookCreateResponse,

    @SerialName("wallet_contact_delete_request")
    val walletContactDeleteRequest: WalletAddressBookDeleteRequest,

    @SerialName("wallet_contact_deleted")
    val walletContactDeleted: WalletAddressBookDeleteResponse,

    @SerialName("wallet_contact_update_request")
    val walletContactUpdateRequest: WalletAddressBookUpdateRequest,

    @SerialName("wallet_contact_updated")
    val walletContactUpdated: WalletAddressBookUpdateResponse,

    @SerialName("wallet_contacts")
    val walletContacts: WalletAddressBookListResponse,

    @SerialName("wallet_create_request")
    val walletCreateRequest: WalletHDCreateRequest,

    @SerialName("wallet_created")
    val walletCreated: WalletHDCreateResponse,

    @SerialName("wallet_derive_request")
    val walletDeriveRequest: WalletAccountsDeriveRequest,

    @SerialName("wallet_derived")
    val walletDerived: WalletAccountsDeriveResponse,

    @SerialName("wallet_history")
    val walletHistory: WalletTransactionsListResponse,

    @SerialName("wallet_history_request")
    val walletHistoryRequest: WalletTransactionsListRequest,

    @SerialName("wallet_history_sync_request")
    val walletHistorySyncRequest: WalletTransactionsSyncRequest,

    @SerialName("wallet_history_synced")
    val walletHistorySynced: WalletTransactionsSyncResponse,

    @SerialName("wallet_import_request")
    val walletImportRequest: WalletImportCreateRequest,

    @SerialName("wallet_imported")
    val walletImported: WalletImportCreateResponse,

    @SerialName("wallet_list")
    val walletList: WalletListResponse,

    @SerialName("wallet_mnemonic")
    val walletMnemonic: WalletHDGenerateMnemonicResponse,

    @SerialName("wallet_mnemonic_request")
    val walletMnemonicRequest: WalletHDGenerateMnemonicRequest,

    @SerialName("wallet_prepare_request")
    val walletPrepareRequest: WalletTransactionPrepareRequest,

    @SerialName("wallet_prepared")
    val walletPrepared: WalletTransactionPrepareResponse,

    @SerialName("wallet_quote_request")
    val walletQuoteRequest: WalletTransactionQuoteRequest,

    @SerialName("wallet_quoted")
    val walletQuoted: WalletTransactionQuoteResponse,

    @SerialName("wallet_rebroadcast_request")
    val walletRebroadcastRequest: WalletTransactionRebroadcastRequest,

    @SerialName("wallet_rebroadcasted")
    val walletRebroadcasted: WalletTransactionRebroadcastResponse,

    @SerialName("wallet_recovery")
    val walletRecovery: WalletBackupExportResponse,

    @SerialName("wallet_recovery_request")
    val walletRecoveryRequest: WalletBackupExportRequest,

    @SerialName("wallet_status")
    val walletStatus: WalletStatusResponse,

    @SerialName("wallet_ton_rotate_key_request")
    val walletTonRotateKeyRequest: WalletTonRotateKeyRequest,

    @SerialName("wallet_ton_rotate_key_response")
    val walletTonRotateKeyResponse: WalletTonRotateKeyResponse,

    @SerialName("wallet_transaction_refresh_request")
    val walletTransactionRefreshRequest: WalletTransactionsRefreshRequest,

    @SerialName("wallet_transaction_refreshed")
    val walletTransactionRefreshed: WalletTransactionsRefreshResponse,

    @SerialName("website_read_request")
    val websiteReadRequest: PassmanagerWebsiteReadRequest,

    @SerialName("website_result")
    val websiteResult: PassmanagerWebsiteResult,

    @SerialName("website_update_request")
    val websiteUpdateRequest: PassmanagerWebsiteUpdateRequest,

    @SerialName("website_validate_request")
    val websiteValidateRequest: PassmanagerWebsiteValidateRequest
)

/**
 * Prepares directories and a fresh name, without reserving or writing the image.
 */
@Serializable
data class CatalogAttachmentRequest (
    @SerialName("file_name")
    val fileName: String,

    @SerialName("folder_path")
    val folderPath: String,

    @SerialName("mime_type")
    val mimeType: String
)

/**
 * Use create-only upload, then insert Markdown only after its confirmed completion.
 */
@Serializable
data class CatalogAttachmentResponse (
    val markdown: String,

    @SerialName("mime_type")
    val mimeType: String,

    val name: String,

    @SerialName("parent_path")
    val parentPath: String,

    val path: String
)

/**
 * Metadata-only detail. The opaque revision covers persisted metadata and its catalog path.
 */
@Serializable
data class CredentialDetail (
    @SerialName("entry_type")
    val entryType: String,

    @SerialName("group_path")
    val groupPath: String,

    val id: String,

    @SerialName("payment_card")
    val paymentCard: PaymentCardMetadata? = null,

    val revision: String,

    @SerialName("tag_keys")
    val tagKeys: List<String>,

    val tags: List<String>,
    val title: String,
    val username: String,
    val websites: List<String>,

    @SerialName("websites_editable")
    val websitesEditable: Boolean
)

/**
 * Canonical payment-card metadata; PAN and CVV are stored separately as secrets.
 */
@Serializable
data class PaymentCardMetadata (
    val brand: String,

    @SerialName("cardholder_name")
    val cardholderName: String,

    @SerialName("exp_month")
    val expMonth: Long,

    @SerialName("exp_year")
    val expYear: Long,

    val last4: String? = null
)

/**
 * Strict metadata patch. Omitted fields are retained; type and card last4 are not writable
 * here.
 */
@Serializable
data class PassmanagerEntryUpdateRequest (
    @SerialName("cardholder_name")
    val cardholderName: String? = null,

    @SerialName("entry_id")
    val entryID: String,

    @SerialName("exp_month")
    val expMonth: Long? = null,

    @SerialName("exp_year")
    val expYear: Long? = null,

    @SerialName("group_path")
    val groupPath: String? = null,

    val revision: String,

    @SerialName("tag_keys")
    val tagKeys: List<String>? = null,

    /**
     * Blank for a payment card gives it back the name Core chooses from its network and last
     * four digits; that name then follows a replaced number.
     */
    val title: String? = null,

    val username: String? = null,
    val websites: List<String>? = null
)

/**
 * Resolves a document link against the current catalog, using the source identity
 * for relative paths. No document body is read and no catalog mutation occurs.
 */
@Serializable
data class CatalogDocumentLinkRequest (
    val kind: CatalogDocumentLinkKind,
    val path: String,

    @SerialName("source_node_id")
    val sourceNodeID: Long
)

@Serializable
enum class CatalogDocumentLinkKind(val value: String) {
    @SerialName("file") File("file"),
    @SerialName("note") Note("note");
}

@Serializable
data class CatalogDocumentLinkResponse (
    val item: CatalogFileLinkItem? = null,
    val kind: CatalogDocumentLinkResponseKind
)

@Serializable
data class CatalogFileLinkItem (
    @SerialName("created_at")
    val createdAt: Long,

    @SerialName("mime_type")
    val mimeType: String? = null,

    val name: String,

    @SerialName("node_id")
    val nodeID: Long,

    @SerialName("parent_path")
    val parentPath: String,

    val path: String,
    val size: Long,

    @SerialName("source_revision")
    val sourceRevision: Long,

    @SerialName("updated_at")
    val updatedAt: Long
)

@Serializable
enum class CatalogDocumentLinkResponseKind(val value: String) {
    @SerialName("ambiguous") Ambiguous("ambiguous"),
    @SerialName("found") Found("found"),
    @SerialName("missing") Missing("missing");
}

/**
 * Existing file replacement response.
 */
@Serializable
data class CatalogFileReplaceResponse (
    @SerialName("media_info")
    val mediaInfo: CatalogMediaInfo? = null,

    @SerialName("media_inspected_revision")
    val mediaInspectedRevision: Long,

    @SerialName("mime_type")
    val mimeType: String,

    val modtime: Long,

    @SerialName("node_id")
    val nodeID: Long,

    val size: Long,

    @SerialName("source_revision")
    val sourceRevision: Long
)

/**
 * Compact media track summary stored on catalog nodes.
 */
@Serializable
data class CatalogMediaInfo (
    val a: Long,
    val c: String? = null,
    val f: Boolean? = null,
    val k: CatalogMediaKind,
    val m: String? = null,
    val s: CatalogMediaStreamingMetadata? = null,
    val v: Long
)

/**
 * Catalog-backed media classification.
 */
@Serializable
enum class CatalogMediaKind(val value: String) {
    @SerialName("audio") Audio("audio"),
    @SerialName("video") Video("video");
}

/**
 * Optional streamability and startup-budget metadata for media playback.
 */
@Serializable
data class CatalogMediaStreamingMetadata (
    val b: Long? = null,
    val d: Long? = null,
    val g: List<CatalogMediaSegmentRange>? = null,
    val h: Long? = null,
    val i: CatalogMediaByteRange? = null,
    val o: Boolean? = null,
    val p: Long? = null,
    val w: Long? = null
)

@Serializable
data class CatalogMediaSegmentRange (
    val l: Long,
    val o: Long,
    val t: Long
)

@Serializable
data class CatalogMediaByteRange (
    val l: Long,
    val o: Long
)

/**
 * Atomic creation payload shared by the existing RPC and generated native facade.
 */
@Serializable
data class PassmanagerEntryCreateRequest (
    @SerialName("created_ts")
    val createdTs: Long? = null,

    @SerialName("entry_id")
    val entryID: String,

    @SerialName("entry_type")
    val entryType: String,

    @SerialName("group_path")
    val groupPath: String? = null,

    @SerialName("icon_ref")
    val iconRef: String? = null,

    val otps: JsonElement? = null,

    @SerialName("payment_card")
    val paymentCard: JsonElement? = null,

    val secrets: PassmanagerEntryCreateSecrets,

    @SerialName("tag_keys")
    val tagKeys: List<String>? = null,

    val tags: List<String>? = null,

    /**
     * Blank for a payment card: Core names it from its network and last four digits
     * (`Visa •••• 1111`), numbered if that name is taken in the group.
     */
    val title: String,

    @SerialName("updated_ts")
    val updatedTs: Long? = null,

    val urls: JsonElement? = null,
    val username: String? = null
)

@Serializable
data class PassmanagerEntryCreateSecrets (
    @SerialName("card_cvv")
    val cardCvv: String? = null,

    @SerialName("card_pan")
    val cardPan: String? = null,

    val note: String? = null,
    val password: String? = null
)

@Serializable
data class PassmanagerEntryListResponse (
    val entries: JsonArray,
    val folders: List<String>
)

/**
 * Offset refers to the requested stable order (catalog node order when sort is omitted),
 * not the number of matches.
 * Callers must restart at zero when the authorized catalog is invalidated.
 */
@Serializable
data class PassmanagerEntryPageResponse (
    val entries: List<CredentialSummary>,

    @SerialName("next_offset")
    val nextOffset: Long? = null,

    /**
     * Matching entries in the whole scope. Present for sorted or grouped requests, which read
     * the scope completely; absent in catalog order, where reading stops at the page.
     */
    @SerialName("total_count")
    val totalCount: Long? = null
)

/**
 * Bounded projection for catalog clients. Secret values and arbitrary metadata are excluded.
 */
@Serializable
data class CredentialSummary (
    @SerialName("entry_type")
    val entryType: String,

    /**
     * Present only for grouped catalog requests; translated by the native presentation owner.
     */
    @SerialName("group_key")
    val groupKey: String? = null,

    @SerialName("group_path")
    val groupPath: String,

    /**
     * `true` when the entry carries one-time code records; omitted otherwise.
     */
    @SerialName("has_codes")
    val hasCodes: Boolean? = null,

    /**
     * Digest of the entry icon in the vault icon store, when the entry has one.
     */
    @SerialName("icon_ref")
    val iconRef: String? = null,

    val id: String,
    val title: String,
    val username: String,

    /**
     * Host of the first website of the entry, for the catalog row.
     */
    val website: String? = null
)

@Serializable
data class PassmanagerEntryPageRequest (
    val descending: Boolean? = null,

    @SerialName("entry_type")
    val entryType: String? = null,

    @SerialName("group_by")
    val groupBy: String? = null,

    @SerialName("group_path")
    val groupPath: String? = null,

    /**
     * Fixed milliseconds since epoch for modification-time grouping across pages.
     */
    @SerialName("grouping_time")
    val groupingTime: Long? = null,

    val limit: Long,
    val offset: Long,
    val query: String,

    /**
     * AND-combined metadata filters: recent (14 days), otp, ssh.
     */
    @SerialName("quick_filters")
    val quickFilters: List<String>? = null,

    val sort: String? = null,

    @SerialName("tag_key")
    val tagKey: String? = null
)

@Serializable
data class PassmanagerEntrySaveResponse (
    @SerialName("entry_id")
    val entryID: String
)

/**
 * Error RPC response
 */
@Serializable
data class RPCError (
    /**
     * Optional error code
     */
    val code: String? = null,

    /**
     * Error message
     */
    val error: String,

    /**
     * Always false for error
     */
    val ok: Boolean
)

/**
 * Backend-authoritative source metadata for derivative identity.
 */
@Serializable
data class SourceMetadataResponse (
    @SerialName("media_info")
    val mediaInfo: CatalogMediaInfo? = null,

    @SerialName("media_inspected_revision")
    val mediaInspectedRevision: Long,

    @SerialName("mime_type")
    val mimeType: String? = null,

    val name: String,

    @SerialName("node_id")
    val nodeID: Long,

    @SerialName("node_type")
    val nodeType: Long,

    val size: Long,

    @SerialName("source_revision")
    val sourceRevision: Long,

    @SerialName("source_revision_initialized")
    val sourceRevisionInitialized: Boolean? = null
)

/**
 * Upload response
 */
@Serializable
data class UploadResponse (
    val completed: Boolean,
    val created: Boolean,

    @SerialName("media_info")
    val mediaInfo: CatalogMediaInfo? = null,

    @SerialName("media_inspected_revision")
    val mediaInspectedRevision: Long? = null,

    @SerialName("mime_type")
    val mimeType: String? = null,

    val modtime: Long? = null,

    @SerialName("node_id")
    val nodeID: Long,

    val size: Long? = null,

    @SerialName("source_revision")
    val sourceRevision: Long? = null,

    @SerialName("uploaded_bytes")
    val uploadedBytes: Long
)

@Serializable
data class CatalogFolderPageResponse (
    @SerialName("current_path")
    val currentPath: String,

    @SerialName("filter_counts")
    val filterCounts: CatalogFolderFilterCounts,

    val items: List<CatalogListItem>,
    val limit: Long,

    @SerialName("next_offset")
    val nextOffset: Long? = null,

    val offset: Long,

    @SerialName("reload_required")
    val reloadRequired: Boolean,

    @SerialName("total_count")
    val totalCount: Long,

    val version: Long
)

@Serializable
data class CatalogFolderFilterCounts (
    val all: Long,
    val images: Long,
    val markdown: Long
)

/**
 * Catalog list item
 */
@Serializable
data class CatalogListItem (
    @SerialName("created_at")
    val createdAt: Long,

    @SerialName("is_dir")
    val isDir: Boolean,

    @SerialName("media_info")
    val mediaInfo: CatalogMediaInfo? = null,

    @SerialName("media_inspected_revision")
    val mediaInspectedRevision: Long,

    @SerialName("mime_type")
    val mimeType: String? = null,

    val name: String,

    @SerialName("node_id")
    val nodeID: Long,

    @SerialName("parent_path")
    val parentPath: String? = null,

    val path: String? = null,
    val size: Long? = null,

    @SerialName("source_revision")
    val sourceRevision: Long,

    @SerialName("updated_at")
    val updatedAt: Long
)

@Serializable
data class CatalogFolderPageRequest (
    @SerialName("expected_version")
    val expectedVersion: Long? = null,

    val filter: CatalogFolderFilter? = null,
    val limit: Long? = null,
    val offset: Long? = null,
    val path: String? = null,
    val sort: CatalogFolderSort? = null
)

@Serializable
data class CatalogFolderFilter (
    @SerialName("file_types")
    val fileTypes: List<String>? = null,

    @SerialName("include_hidden")
    val includeHidden: Boolean? = null,

    @SerialName("include_text_content")
    val includeTextContent: Boolean? = null,

    val query: String? = null,
    val recursive: Boolean? = null
)

@Serializable
data class CatalogFolderSort (
    val by: String,
    val direction: String
)

@Serializable
data class PassmanagerGroupPageResponse (
    val groups: List<PassmanagerGroupSummary>,

    @SerialName("next_offset")
    val nextOffset: Long? = null,

    val parent: String
)

@Serializable
data class PassmanagerGroupSummary (
    @SerialName("entry_count")
    val entryCount: Long,

    val path: String
)

/**
 * Immediate children of an existing group, bounded for native metadata transport.
 */
@Serializable
data class PassmanagerGroupPageRequest (
    val limit: Long,
    val offset: Long,
    val parent: String
)

@Serializable
data class PassmanagerGroupRenameRequest (
    val name: String,
    val path: String
)

/**
 * Response of `passmanager:icon:getMany`: the icons found and the digests that are not
 * stored.
 */
@Serializable
data class PassmanagerIconGetManyResponse (
    val icons: List<PassmanagerIconRecord>,

    @SerialName("missing_icon_refs")
    val missingIconRefs: List<String>
)

/**
 * One stored icon: the normalized image bytes and their type.
 */
@Serializable
data class PassmanagerIconRecord (
    @SerialName("background_color")
    val backgroundColor: String? = null,

    @SerialName("content_base64")
    val contentBase64: String,

    @SerialName("icon_ref")
    val iconRef: String,

    @SerialName("mime_type")
    val mimeType: String
)

/**
 * Request of `passmanager:icon:getMany`: the icon digests to load, at most 64 per call.
 */
@Serializable
data class PassmanagerIconGetManyRequest (
    @SerialName("icon_refs")
    val iconRefs: List<String>
)

/**
 * Pure, transient presentation data. IDs index `nodes`; children always follow parents.
 */
@Serializable
data class MarkdownDocument (
    val nodes: List<MarkdownNode>,
    val roots: List<Long>,

    @SerialName("source_digest")
    val sourceDigest: String
)

@Serializable
data class MarkdownNode (
    val children: List<Long>,
    val content: MarkdownContent,
    val end: Long,
    val start: Long
)

/**
 * HTML/unsupported parser extensions stay visible, never executed or discarded.
 */
@Serializable
data class MarkdownContent (
    val kind: MarkdownContentKind,
    val anchor: String? = null,
    val level: Long? = null,
    val language: String? = null,
    val first: Long? = null,
    val alignments: List<MarkdownAlignment>? = null,
    val target: MarkdownTarget? = null,
    val title: String? = null,
    val text: String? = null,
    val checked: Boolean? = null
)

@Serializable
enum class MarkdownAlignment(val value: String) {
    @SerialName("center") Center("center"),
    @SerialName("left") Left("left"),
    @SerialName("none") None("none"),
    @SerialName("right") Right("right");
}

@Serializable
enum class MarkdownContentKind(val value: String) {
    @SerialName("code") Code("code"),
    @SerialName("code_block") CodeBlock("code_block"),
    @SerialName("emphasis") Emphasis("emphasis"),
    @SerialName("hard_break") HardBreak("hard_break"),
    @SerialName("heading") Heading("heading"),
    @SerialName("image") Image("image"),
    @SerialName("item") Item("item"),
    @SerialName("list") KindList("list"),
    @SerialName("link") Link("link"),
    @SerialName("literal") Literal("literal"),
    @SerialName("paragraph") Paragraph("paragraph"),
    @SerialName("quote") Quote("quote"),
    @SerialName("rule") Rule("rule"),
    @SerialName("soft_break") SoftBreak("soft_break"),
    @SerialName("strikethrough") Strikethrough("strikethrough"),
    @SerialName("strong") Strong("strong"),
    @SerialName("table") Table("table"),
    @SerialName("table_cell") TableCell("table_cell"),
    @SerialName("table_head") TableHead("table_head"),
    @SerialName("table_row") TableRow("table_row"),
    @SerialName("task") Task("task"),
    @SerialName("text") Text("text");
}

@Serializable
data class MarkdownTarget (
    val kind: MarkdownTargetKind,
    val path: String? = null,
    val anchor: String? = null,
    val wiki: Boolean? = null,
    val url: String? = null,
    val raw: String? = null
)

@Serializable
enum class MarkdownTargetKind(val value: String) {
    @SerialName("anchor") Anchor("anchor"),
    @SerialName("blocked") Blocked("blocked"),
    @SerialName("catalog") Catalog("catalog"),
    @SerialName("external") External("external"),
    @SerialName("note") Note("note");
}

/**
 * master:rekey response
 */
@Serializable
data class MasterRekeyResponse (
    @SerialName("backup_recommended")
    val backupRecommended: Boolean,

    @SerialName("rewrapped_artifacts")
    val rewrappedArtifacts: List<String>
)

/**
 * Canonical `master:rekey` wire request; never expose passwords through Debug.
 */
@Serializable
data class MasterRekeyRequest (
    @SerialName("current_password")
    val currentPassword: String,

    @SerialName("new_master_password")
    val newMasterPassword: String
)

/**
 * Node creation response
 */
@Serializable
data class NodeCreatedResponse (
    @SerialName("node_id")
    val nodeID: Long
)

@Serializable
data class PassmanagerOtpRecordRequest (
    @SerialName("entry_id")
    val entryID: String,

    val label: String,
    val revision: String
)

@Serializable
data class OtpPreviewResponse (
    @SerialName("left_seconds")
    val leftSeconds: Long,

    val otp: String,
    val period: Long
)

/**
 * Entry-scoped OTP management; secrets never appear in list responses.
 */
@Serializable
data class PassmanagerOtpRecordsRequest (
    @SerialName("entry_id")
    val entryID: String
)

@Serializable
data class PassmanagerOtpRecordsResponse (
    val records: List<CredentialOtpSummary>,
    val revision: String
)

@Serializable
data class CredentialOtpSummary (
    val algorithm: String,
    val counter: String? = null,
    val digits: Long,
    val encoding: String,
    val label: String,

    @SerialName("otp_type")
    val otpType: String,

    val period: Long
)

@Serializable
data class PassmanagerOtpRecordSaveRequest (
    @SerialName("entry_id")
    val entryID: String,

    val revision: String,
    val secret: String? = null,
    val settings: CredentialOtpSummary,

    @SerialName("source_label")
    val sourceLabel: String? = null
)

/**
 * Parse supplied setup material without reading or writing a stored seed.
 */
@Serializable
data class PassmanagerOtpURIRequest (
    @SerialName("fallback_label")
    val fallbackLabel: String? = null,

    val uri: String
)

@Serializable
data class PassmanagerOtpURIResponse (
    val account: String,
    val issuer: String,
    val secret: String,
    val settings: CredentialOtpSummary
)

/**
 * Canonical management request; aliases retain the established RPC wire contract.
 */
@Serializable
data class VaultPasskeyDeleteRequest (
    @SerialName("credentialIdB64Url")
    val credentialIDB64URL: String
)

@Serializable
data class VaultPasskeyDeleteResponse (
    val deleted: Boolean
)

@Serializable
data class VaultPasskeysListResponse (
    val passkeys: List<VaultPasskeySummary>
)

@Serializable
data class VaultPasskeySummary (
    @SerialName("createdAtEpochMs")
    val createdAtEpochMS: Long,

    @SerialName("credentialIdB64Url")
    val credentialIDB64URL: String,

    @SerialName("lastUsedEpochMs")
    val lastUsedEpochMS: Long,

    val portable: Boolean,

    @SerialName("rpId")
    val rpID: String,

    val rpName: String,
    val signCount: Long,
    val storageKind: String,
    val userDisplayName: String,
    val userName: String
)

/**
 * Transient generation settings; the output is saved only by a separate credential command.
 */
@Serializable
data class PassmanagerPasswordGenerateRequest (
    val digits: Boolean,
    val length: Long,
    val lowercase: Boolean,
    val symbols: Boolean,
    val uppercase: Boolean
)

@Serializable
data class PassmanagerPasswordGenerateResponse (
    val password: String
)

@Serializable
data class CredentialProviderStatusResponse (
    @SerialName("capability_matrix")
    val capabilityMatrix: CredentialProviderCapabilityMatrix,

    @SerialName("command_error_map")
    val commandErrorMap: CredentialProviderCommandErrorMap,

    val enabled: Boolean,

    @SerialName("passkeys_lite_status")
    val passkeysLiteStatus: CredentialProviderPasskeysLiteStatusMatrix,

    @SerialName("vault_open")
    val vaultOpen: Boolean
)

@Serializable
data class CredentialProviderCapabilityMatrix (
    val android: CredentialProviderCapability,
    val ios: CredentialProviderCapability,
    val macos: CredentialProviderCapability,
    val windows: CredentialProviderCapability
)

@Serializable
data class CredentialProviderCapability (
    @SerialName("autofill_fallback")
    val autofillFallback: Boolean,

    @SerialName("one_time_codes")
    val oneTimeCodes: Boolean,

    @SerialName("one_time_codes_unsupported_reason")
    val oneTimeCodesUnsupportedReason: String? = null,

    @SerialName("passkeys_lite")
    val passkeysLite: Boolean,

    @SerialName("password_provider")
    val passwordProvider: Boolean,

    @SerialName("unsupported_reason")
    val unsupportedReason: String? = null
)

@Serializable
data class CredentialProviderCommandErrorMap (
    @SerialName("credential_provider:getOneTimeCode")
    val credentialProviderGetOneTimeCode: List<String>,

    @SerialName("credential_provider:getSecret")
    val credentialProviderGetSecret: List<String>,

    @SerialName("credential_provider:list")
    val credentialProviderList: List<String>,

    @SerialName("credential_provider:passkey:create")
    val credentialProviderPasskeyCreate: List<String>,

    @SerialName("credential_provider:passkey:get")
    val credentialProviderPasskeyGet: List<String>,

    @SerialName("credential_provider:passkey:query")
    val credentialProviderPasskeyQuery: List<String>,

    @SerialName("credential_provider:recordUse")
    val credentialProviderRecordUse: List<String>,

    @SerialName("credential_provider:search")
    val credentialProviderSearch: List<String>,

    @SerialName("credential_provider:session:close")
    val credentialProviderSessionClose: List<String>,

    @SerialName("credential_provider:session:open")
    val credentialProviderSessionOpen: List<String>,

    @SerialName("credential_provider:status")
    val credentialProviderStatus: List<String>
)

@Serializable
data class CredentialProviderPasskeysLiteStatusMatrix (
    val android: CredentialProviderPasskeysLiteStatus,
    val ios: CredentialProviderPasskeysLiteStatus,
    val macos: CredentialProviderPasskeysLiteStatus,
    val windows: CredentialProviderPasskeysLiteStatus
)

@Serializable
data class CredentialProviderPasskeysLiteStatus (
    val create: String,
    val get: String,

    @SerialName("unsupported_reason")
    val unsupportedReason: String? = null
)

/**
 * RPC Request
 */
@Serializable
data class RPCRequest (
    /**
     * Command name
     */
    val command: String,

    /**
     * Command data
     */
    val data: JsonElement?,

    /**
     * Optional transport-level feature hints for this request.
     */
    @SerialName("transport_features")
    val transportFeatures: List<String>? = null,

    /**
     * Protocol version
     */
    val v: Long
)

/**
 * Input counts after complete staging validation; no imported secret values are returned.
 */
@Serializable
data class PassmanagerRootImportPreview (
    @SerialName("created_entry_count")
    val createdEntryCount: Long? = null,

    @SerialName("entry_count")
    val entryCount: Long,

    @SerialName("folder_count")
    val folderCount: Long,

    val mode: String,
    val revision: String,
    val source: String? = null,

    @SerialName("ssh_key_count")
    val sshKeyCount: Long,

    @SerialName("updated_entry_count")
    val updatedEntryCount: Long? = null,

    val warnings: List<CredentialImportWarning>? = null
)

@Serializable
data class CredentialImportWarning (
    val code: CredentialImportWarningCode,
    val count: Long
)

@Serializable
enum class CredentialImportWarningCode(val value: String) {
    @SerialName("attachments_omitted") AttachmentsOmitted("attachments_omitted"),
    @SerialName("card_in_note") CardInNote("card_in_note"),
    @SerialName("entry_limit") EntryLimit("entry_limit"),
    @SerialName("icons_omitted") IconsOmitted("icons_omitted"),
    @SerialName("invalid_rows") InvalidRows("invalid_rows"),
    @SerialName("legacy_identifiers_matched") LegacyIdentifiersMatched("legacy_identifiers_matched"),
    @SerialName("otp_in_note") OtpInNote("otp_in_note"),
    @SerialName("passkeys_omitted") PasskeysOmitted("passkeys_omitted"),
    @SerialName("records_omitted") RecordsOmitted("records_omitted"),
    @SerialName("unmapped_columns") UnmappedColumns("unmapped_columns"),
    @SerialName("unsupported_records") UnsupportedRecords("unsupported_records");
}

@Serializable
data class PassmanagerRootImportRequest (
    @SerialName("allow_destructive")
    val allowDestructive: Boolean? = null,

    val entries: JsonElement?,

    @SerialName("expected_revision")
    val expectedRevision: String? = null,

    val folders: JsonElement?,

    @SerialName("folders_meta")
    val foldersMeta: JsonElement? = null,

    val icons: JsonElement? = null,
    val mode: String? = null,

    @SerialName("ssh_keys")
    val sshKeys: JsonElement? = null,

    @SerialName("tag_meta")
    val tagMeta: JsonElement? = null,

    val tags: JsonElement? = null
)

@Serializable
data class PassmanagerSecretReadResponse (
    val value: String
)

@Serializable
data class PassmanagerSecurityAuditPageResponse (
    @SerialName("algorithm_version")
    val algorithmVersion: Long,

    val entries: List<CredentialSecurityAuditRow>,

    @SerialName("failed_count")
    val failedCount: Long,

    @SerialName("next_offset")
    val nextOffset: Long? = null,

    @SerialName("reused_password_count")
    val reusedPasswordCount: Long,

    val revision: String,

    @SerialName("total_count")
    val totalCount: Long,

    @SerialName("two_factor_count")
    val twoFactorCount: Long,

    @SerialName("weak_password_count")
    val weakPasswordCount: Long
)

@Serializable
data class CredentialSecurityAuditRow (
    /**
     * Null means the password could not be checked; never interpret as safe.
     */
    val audit: CredentialAuditEntrySummary? = null,

    val credential: CredentialSummary
)

@Serializable
data class CredentialAuditEntrySummary (
    @SerialName("entryId")
    val entryID: String,

    val hasTwoFactor: Boolean,
    val reusedPassword: Boolean,
    val strengthScore: Long? = null,
    val weakPassword: Boolean
)

/**
 * A fresh, read-only vault-wide audit. Continuation requires the returned revision.
 */
@Serializable
data class PassmanagerSecurityAuditPageRequest (
    /**
     * weak, reused, without_otp, failed; omitted for all entries.
     */
    val issue: String? = null,

    val limit: Long,
    val offset: Long,
    val revision: String? = null
)

@Serializable
data class PassmanagerSSHEditRequest (
    @SerialName("key_id")
    val keyID: String,

    val name: String? = null,
    val revision: String,

    @SerialName("source_entry_id")
    val sourceEntryID: String? = null
)

@Serializable
data class PassmanagerSSHExportRequest (
    val format: String,

    @SerialName("key_id")
    val keyID: String,

    val passphrase: String? = null
)

@Serializable
data class PassmanagerSSHExportResponse (
    val content: String,
    val filename: String
)

@Serializable
data class PassmanagerSSHImportRequest (
    val name: String? = null,
    val passphrase: String? = null,

    @SerialName("private_key")
    val privateKey: String,

    @SerialName("source_entry_id")
    val sourceEntryID: String? = null
)

@Serializable
data class PassmanagerSSHKeygenRequest (
    val comment: String? = null,

    @SerialName("key_type")
    val keyType: String,

    val name: String? = null,

    @SerialName("source_entry_id")
    val sourceEntryID: String? = null
)

@Serializable
data class PassmanagerSSHKeyCreateResponse (
    val fingerprint: String,

    @SerialName("key_id")
    val keyID: String,

    @SerialName("key_type")
    val keyType: String,

    @SerialName("public_key_openssh")
    val publicKeyOpenssh: String
)

@Serializable
data class PassmanagerSSHPageRequest (
    @SerialName("key_type")
    val keyType: String? = null,

    val limit: Long,
    val offset: Long,
    val query: String? = null,
    val revision: String? = null,

    @SerialName("source_entry_id")
    val sourceEntryID: String? = null
)

@Serializable
data class PassmanagerSSHPageResponse (
    val keys: List<SSHKeySummary>,

    @SerialName("next_offset")
    val nextOffset: Long? = null,

    val revision: String,

    @SerialName("total_count")
    val totalCount: Long
)

@Serializable
data class SSHKeySummary (
    val key: SSHKeyMetadata,
    val revision: String,

    @SerialName("source_path")
    val sourcePath: String? = null,

    @SerialName("source_title")
    val sourceTitle: String? = null
)

@Serializable
data class SSHKeyMetadata (
    val comment: String? = null,
    val createdTs: Long? = null,
    val fingerprint: String,
    val id: String,
    val name: String? = null,

    @SerialName("sourceEntryId")
    val sourceEntryID: String? = null,

    val type: String,
    val updatedTs: Long? = null
)

/**
 * Vault status response
 */
@Serializable
data class VaultStatusResponse (
    @SerialName("is_unlocked")
    val isUnlocked: Boolean,

    @SerialName("session_started_at")
    val sessionStartedAt: Long? = null
)

@Serializable
data class PassmanagerTagDeleteRequest (
    val key: String
)

@Serializable
data class PassmanagerTagPageResponse (
    @SerialName("next_offset")
    val nextOffset: Long? = null,

    val tags: List<CredentialTagSummary>
)

/**
 * Metadata-only catalog merged with tags assigned to credentials.
 */
@Serializable
data class CredentialTagSummary (
    @SerialName("color_id")
    val colorID: String,

    val count: Long,
    val key: String,
    val label: String
)

@Serializable
data class PassmanagerTagPageRequest (
    val limit: Long,
    val offset: Long
)

@Serializable
data class PassmanagerTagSaveRequest (
    @SerialName("color_id")
    val colorID: String,

    val label: String,

    @SerialName("source_key")
    val sourceKey: String? = null
)

/**
 * Vault password rekey result.
 */
@Serializable
data class VaultRekeyResponse (
    @SerialName("backup_recommended")
    val backupRecommended: Boolean,

    @SerialName("deleted_derivative_chunks")
    val deletedDerivativeChunks: Long,

    @SerialName("deleted_old_chunks")
    val deletedOldChunks: Long,

    @SerialName("duration_ms")
    val durationMS: Long,

    @SerialName("migrated_chunks")
    val migratedChunks: Long,

    @SerialName("preserved_unknown_chunks")
    val preservedUnknownChunks: Long
)

/**
 * Canonical `vault:rekey` wire request; Core owns validation and migration.
 */
@Serializable
data class VaultRekeyRequest (
    @SerialName("current_password")
    val currentPassword: String,

    @SerialName("new_password")
    val newPassword: String
)

@Serializable
data class WalletAccountsListResponse (
    val accounts: List<WalletAccountMeta>,

    @SerialName("cached_balances")
    val cachedBalances: List<WalletBalanceGetResponse>? = null
)

@Serializable
data class WalletAccountMeta (
    @SerialName("account_id")
    val accountID: String,

    val address: String? = null,

    @SerialName("created_at")
    val createdAt: Long,

    val curve: String? = null,
    val kind: WalletAccountMetaKind,
    val label: String? = null,
    val network: String,

    @SerialName("public_key")
    val publicKey: String? = null,

    @SerialName("raw_account")
    val rawAccount: String? = null,

    @SerialName("updated_at")
    val updatedAt: Long,

    @SerialName("wallet_contract")
    val walletContract: String? = null,

    @SerialName("wallet_id")
    val walletID: String,

    val workchain: Long? = null,

    @SerialName("account_index")
    val accountIndex: Long? = null,

    @SerialName("account_model")
    val accountModel: String? = null,

    @SerialName("current_receive_address")
    val currentReceiveAddress: String? = null,

    @SerialName("current_receive_derivation_path")
    val currentReceiveDerivationPath: String? = null,

    @SerialName("derivation_path")
    val derivationPath: String? = null,

    @SerialName("derivation_profile")
    val derivationProfile: String? = null,

    @SerialName("mnemonic_standard")
    val mnemonicStandard: String? = null,

    @SerialName("next_change_index")
    val nextChangeIndex: Long? = null,

    @SerialName("next_receive_index")
    val nextReceiveIndex: Long? = null,

    @SerialName("wallet_mode")
    val walletMode: String? = null
)

@Serializable
enum class WalletAccountMetaKind(val value: String) {
    @SerialName("derived") Derived("derived"),
    @SerialName("imported") Imported("imported");
}

@Serializable
data class WalletBalanceGetResponse (
    @SerialName("account_id")
    val accountID: String,

    val balance: WalletBalance,

    @SerialName("fetched_at")
    val fetchedAt: Long,

    val network: String
)

@Serializable
data class WalletBalance (
    @SerialName("amount_unit")
    val amountUnit: String,

    @SerialName("pending_in")
    val pendingIn: String,

    @SerialName("pending_out")
    val pendingOut: String,

    val spendable: String,
    val total: String
)

@Serializable
data class WalletAccountsListRequest (
    @SerialName("wallet_id")
    val walletID: String? = null
)

@Serializable
data class WalletAddressesDeriveResponse (
    @SerialName("account_id")
    val accountID: String,

    val address: String,

    @SerialName("derivation_path")
    val derivationPath: String,

    val index: Long,

    @SerialName("public_key")
    val publicKey: String,

    val purpose: String
)

/**
 * Address-first Send: asks every registered chain profile whether it accepts the address.
 */
@Serializable
data class WalletAddressDetectRequest (
    val address: String
)

/**
 * `network` and `normalized_address` are set only when exactly one registered network
 * accepts
 * the address; `candidates` lists every accepting network (sorted) so a client can still
 * ask
 * the user when formats overlap.
 */
@Serializable
data class WalletAddressDetectResponse (
    val address: String,
    val candidates: List<String>,
    val network: String? = null,

    @SerialName("normalized_address")
    val normalizedAddress: String? = null
)

@Serializable
data class WalletAddressesDeriveRequest (
    @SerialName("account_id")
    val accountID: String,

    val purpose: String
)

@Serializable
data class WalletBalanceGetRequest (
    @SerialName("account_id")
    val accountID: String,

    @SerialName("discover_addresses")
    val discoverAddresses: Boolean? = null
)

@Serializable
data class WalletTransactionCancelRequest (
    @SerialName("preparation_id")
    val preparationID: String
)

@Serializable
data class WalletTransactionCancelResponse (
    val cancelled: Boolean
)

@Serializable
data class WalletTransactionConfirmRequest (
    @SerialName("accepted_warnings")
    val acceptedWarnings: List<String>,

    @SerialName("master_password")
    val masterPassword: String? = null,

    @SerialName("preparation_id")
    val preparationID: String,

    @SerialName("spend_authorization_id")
    val spendAuthorizationID: String? = null
)

@Serializable
data class WalletTransactionConfirmResponse (
    val network: String,
    val status: WalletConfirmStatus,

    @SerialName("tx_hash")
    val txHash: String? = null,

    @SerialName("tx_ref")
    val txRef: String
)

@Serializable
enum class WalletConfirmStatus(val value: String) {
    @SerialName("broadcast_unknown") BroadcastUnknown("broadcast_unknown"),
    @SerialName("pending") Pending("pending");
}

@Serializable
data class WalletAddressBookCreateRequest (
    val address: String,
    val label: String,
    val network: String
)

@Serializable
data class WalletAddressBookCreateResponse (
    val entry: WalletAddressBookEntry
)

@Serializable
data class WalletAddressBookEntry (
    val address: String,

    @SerialName("created_at")
    val createdAt: Long,

    @SerialName("entry_id")
    val entryID: String,

    val label: String,
    val network: String,

    @SerialName("updated_at")
    val updatedAt: Long
)

@Serializable
data class WalletAddressBookDeleteRequest (
    @SerialName("entry_id")
    val entryID: String
)

@Serializable
data class WalletAddressBookDeleteResponse (
    @SerialName("entry_id")
    val entryID: String
)

@Serializable
data class WalletAddressBookUpdateRequest (
    val address: String,

    @SerialName("entry_id")
    val entryID: String,

    val label: String,
    val network: String
)

@Serializable
data class WalletAddressBookUpdateResponse (
    val entry: WalletAddressBookEntry
)

@Serializable
data class WalletAddressBookListResponse (
    val entries: List<WalletAddressBookEntry>
)

@Serializable
data class WalletHDCreateRequest (
    @SerialName("bip39_passphrase")
    val bip39Passphrase: String? = null,

    @SerialName("client_request_id")
    val clientRequestID: String? = null,

    val label: String,
    val mnemonic: List<String>? = null,

    @SerialName("mnemonic_draft_id")
    val mnemonicDraftID: String? = null,

    @SerialName("mnemonic_standard")
    val mnemonicStandard: String? = null,

    @SerialName("supported_networks")
    val supportedNetworks: List<String>,

    @SerialName("wallet_mode")
    val walletMode: String? = null,

    val wordlist: String
)

@Serializable
data class WalletHDCreateResponse (
    val accounts: List<WalletAccountMeta>,

    @SerialName("wallet_id")
    val walletID: String
)

@Serializable
data class WalletAccountsDeriveRequest (
    val network: String,

    @SerialName("wallet_id")
    val walletID: String
)

@Serializable
data class WalletAccountsDeriveResponse (
    @SerialName("account_id")
    val accountID: String
)

@Serializable
data class WalletTransactionsListResponse (
    @SerialName("next_cursor")
    val nextCursor: String? = null,

    val transactions: List<WalletTransactionEntry>
)

@Serializable
data class WalletTransactionEntry (
    @SerialName("account_id")
    val accountID: String,

    val amount: String,

    @SerialName("amount_unit")
    val amountUnit: String,

    @SerialName("broadcast_artifact_ref")
    val broadcastArtifactRef: String? = null,

    val counterparty: String? = null,

    @SerialName("created_at")
    val createdAt: Long,

    val direction: WalletTransactionDirection? = null,
    val fee: String,

    @SerialName("message_ref")
    val messageRef: String? = null,

    val network: String,
    val status: String,

    @SerialName("tx_hash")
    val txHash: String? = null,

    @SerialName("tx_ref")
    val txRef: String,

    @SerialName("updated_at")
    val updatedAt: Long,

    @SerialName("valid_until")
    val validUntil: Long? = null,

    @SerialName("wallet_id")
    val walletID: String
)

@Serializable
enum class WalletTransactionDirection(val value: String) {
    @SerialName("incoming") Incoming("incoming"),
    @SerialName("outgoing") Outgoing("outgoing"),
    @SerialName("unknown") Unknown("unknown");
}

@Serializable
data class WalletTransactionsListRequest (
    @SerialName("account_id")
    val accountID: String? = null,

    val cursor: String? = null,
    val limit: Long? = null,
    val status: String? = null,

    @SerialName("wallet_id")
    val walletID: String? = null
)

@Serializable
data class WalletTransactionsSyncRequest (
    @SerialName("account_id")
    val accountID: String,

    val limit: Long? = null
)

@Serializable
data class WalletTransactionsSyncResponse (
    @SerialName("account_id")
    val accountID: String,

    @SerialName("fetched_at")
    val fetchedAt: Long,

    val network: String,

    @SerialName("synced_count")
    val syncedCount: Long
)

@Serializable
data class WalletImportCreateRequest (
    @SerialName("client_request_id")
    val clientRequestID: String? = null,

    val curve: String,
    val encoding: String,
    val label: String,
    val network: String,

    @SerialName("private_key")
    val privateKey: String
)

@Serializable
data class WalletImportCreateResponse (
    @SerialName("account_id")
    val accountID: String,

    @SerialName("wallet_id")
    val walletID: String
)

@Serializable
data class WalletListResponse (
    val wallets: List<WalletSummary>
)

@Serializable
data class WalletSummary (
    /**
     * Restored account-based networks (Ethereum, Solana) still awaiting used-account discovery
     * via `wallet:balance:get { discover_addresses: true }`; absent once every network is done.
     */
    @SerialName("account_discovery_pending")
    val accountDiscoveryPending: List<String>? = null,

    @SerialName("bitcoin_discovery_pending")
    val bitcoinDiscoveryPending: Boolean? = null,

    @SerialName("created_at")
    val createdAt: Long,

    val kind: String,
    val label: String,

    @SerialName("mnemonic_standard")
    val mnemonicStandard: String,

    @SerialName("supported_networks")
    val supportedNetworks: List<String>,

    @SerialName("updated_at")
    val updatedAt: Long,

    @SerialName("wallet_id")
    val walletID: String,

    @SerialName("wallet_mode")
    val walletMode: String? = null
)

@Serializable
data class WalletHDGenerateMnemonicResponse (
    @SerialName("expires_at")
    val expiresAt: Long,

    val mnemonic: List<String>,

    @SerialName("mnemonic_draft_id")
    val mnemonicDraftID: String,

    @SerialName("mnemonic_standard")
    val mnemonicStandard: String,

    @SerialName("wallet_mode")
    val walletMode: String,

    val wordlist: String
)

@Serializable
data class WalletHDGenerateMnemonicRequest (
    @SerialName("mnemonic_standard")
    val mnemonicStandard: String? = null,

    @SerialName("wallet_mode")
    val walletMode: String? = null,

    @SerialName("word_count")
    val wordCount: Long,

    val wordlist: String? = null
)

@Serializable
data class WalletTransactionPrepareRequest (
    @SerialName("account_id")
    val accountID: String,

    @SerialName("fee_policy")
    val feePolicy: WalletFeePolicy,

    @SerialName("maximize_output_index")
    val maximizeOutputIndex: Long? = null,

    val network: String,
    val outputs: List<WalletTransactionOutput>
)

@Serializable
data class WalletFeePolicy (
    val tier: WalletFeeTier
)

@Serializable
enum class WalletFeeTier(val value: String) {
    @SerialName("fast") Fast("fast"),
    @SerialName("slow") Slow("slow"),
    @SerialName("standard") Standard("standard");
}

@Serializable
data class WalletTransactionOutput (
    val address: String,
    val amount: String,
    val comment: String? = null
)

@Serializable
data class WalletTransactionPrepareResponse (
    @SerialName("account_id")
    val accountID: String,

    @SerialName("expires_at")
    val expiresAt: Long,

    val network: String,

    @SerialName("preparation_id")
    val preparationID: String,

    val preview: WalletPreview,

    @SerialName("wallet_id")
    val walletID: String
)

@Serializable
data class WalletPreview (
    @SerialName("amount_unit")
    val amountUnit: String,

    @SerialName("estimated_fee")
    val estimatedFee: String,

    val ethereum: EthereumTransactionPreviewV1? = null,
    val outputs: List<WalletTransactionOutput>,
    val solana: SolanaTransactionPreviewV1? = null,
    val ton: TonTransactionPreviewV1? = null,

    @SerialName("total_debit")
    val totalDebit: String,

    val warnings: List<WalletWarning>
)

@Serializable
data class EthereumTransactionPreviewV1 (
    @SerialName("chain_id")
    val chainID: Long,

    @SerialName("gas_limit")
    val gasLimit: Long,

    @SerialName("max_fee_per_gas")
    val maxFeePerGas: String,

    @SerialName("max_priority_fee_per_gas")
    val maxPriorityFeePerGas: String,

    val nonce: Long
)

@Serializable
data class SolanaTransactionPreviewV1 (
    @SerialName("destination_rent_exempt_minimum")
    val destinationRentExemptMinimum: String,

    @SerialName("last_valid_block_height")
    val lastValidBlockHeight: Long,

    @SerialName("recent_blockhash")
    val recentBlockhash: String
)

@Serializable
data class TonTransactionPreviewV1 (
    @SerialName("account_state")
    val accountState: String,

    @SerialName("destination_state")
    val destinationState: String,

    @SerialName("message_mode")
    val messageMode: Long,

    @SerialName("sender_state_init_included")
    val senderStateInitIncluded: Boolean,

    val seqno: Long,

    @SerialName("valid_until")
    val validUntil: Long,

    @SerialName("wallet_contract")
    val walletContract: String
)

@Serializable
data class WalletWarning (
    val code: String,
    val message: String
)

@Serializable
data class WalletTransactionQuoteRequest (
    @SerialName("account_id")
    val accountID: String,

    @SerialName("fee_policy")
    val feePolicy: WalletFeePolicy,

    @SerialName("max_output_index")
    val maxOutputIndex: Long,

    val network: String,
    val outputs: List<WalletTransactionQuoteOutput>
)

@Serializable
data class WalletTransactionQuoteOutput (
    val address: String,
    val amount: String? = null,
    val comment: String? = null
)

@Serializable
data class WalletTransactionQuoteResponse (
    @SerialName("account_id")
    val accountID: String,

    @SerialName("current_preview")
    val currentPreview: WalletPreview? = null,

    @SerialName("expires_at")
    val expiresAt: Long,

    @SerialName("max_amount")
    val maxAmount: String,

    @SerialName("max_preview")
    val maxPreview: WalletPreview,

    val network: String,

    @SerialName("quoted_at")
    val quotedAt: Long,

    val spendable: String
)

@Serializable
data class WalletTransactionRebroadcastRequest (
    @SerialName("master_password")
    val masterPassword: String,

    @SerialName("tx_ref")
    val txRef: String
)

@Serializable
data class WalletTransactionRebroadcastResponse (
    val network: String,
    val status: String,

    @SerialName("tx_hash")
    val txHash: String? = null,

    @SerialName("tx_ref")
    val txRef: String,

    @SerialName("updated_at")
    val updatedAt: Long
)

@Serializable
data class WalletBackupExportResponse (
    @SerialName("bip39_passphrase")
    val bip39Passphrase: String? = null,

    @SerialName("export_kind")
    val exportKind: String,

    val mnemonic: List<String>,

    @SerialName("mnemonic_standard")
    val mnemonicStandard: String,

    @SerialName("wallet_id")
    val walletID: String,

    @SerialName("wallet_mode")
    val walletMode: String,

    val wordlist: String
)

@Serializable
data class WalletBackupExportRequest (
    @SerialName("master_password")
    val masterPassword: String,

    @SerialName("wallet_id")
    val walletID: String
)

@Serializable
data class WalletStatusResponse (
    @SerialName("disabled_reason")
    val disabledReason: String? = null,

    val enabled: Boolean,
    val initialized: Boolean,
    val networks: List<WalletNetworkStatus>,

    @SerialName("wallet_count")
    val walletCount: Long
)

@Serializable
data class WalletNetworkStatus (
    @SerialName("broadcast_enabled")
    val broadcastEnabled: Boolean,

    val capabilities: List<WalletCapabilityStatus>? = null,

    @SerialName("disabled_reason")
    val disabledReason: String? = null,

    val enabled: Boolean,
    val network: String,

    @SerialName("provider_status")
    val providerStatus: WalletProviderStatus
)

@Serializable
data class WalletCapabilityStatus (
    @SerialName("disabled_reason")
    val disabledReason: String? = null,

    val id: String,
    val state: WalletCapabilityState
)

@Serializable
enum class WalletCapabilityState(val value: String) {
    @SerialName("disabled") Disabled("disabled"),
    @SerialName("ready") Ready("ready"),
    @SerialName("unavailable") Unavailable("unavailable");
}

@Serializable
enum class WalletProviderStatus(val value: String) {
    @SerialName("ready") Ready("ready"),
    @SerialName("unavailable") Unavailable("unavailable");
}

@Serializable
data class WalletTonRotateKeyRequest (
    @SerialName("account_id")
    val accountID: String,

    @SerialName("master_password")
    val masterPassword: String
)

/**
 * Result of an on-chain WalletTg signing-key rotation (TEP-0003 Rotation mnemonic).
 * `mnemonic` is the complete 24-word phrase that recovers the account once the rotation
 * is confirmed; the previous phrase stays valid until then.
 */
@Serializable
data class WalletTonRotateKeyResponse (
    @SerialName("account_id")
    val accountID: String,

    @SerialName("message_ref")
    val messageRef: String? = null,

    val mnemonic: List<String>,

    @SerialName("mnemonic_standard")
    val mnemonicStandard: String,

    @SerialName("new_public_key")
    val newPublicKey: String,

    val seqno: Long,
    val status: String,

    @SerialName("tx_hash")
    val txHash: String? = null,

    @SerialName("valid_until")
    val validUntil: Long,

    @SerialName("wallet_id")
    val walletID: String,

    val wordlist: String
)

@Serializable
data class WalletTransactionsRefreshRequest (
    @SerialName("tx_ref")
    val txRef: String
)

@Serializable
data class WalletTransactionsRefreshResponse (
    val network: String,
    val status: String,

    @SerialName("tx_hash")
    val txHash: String? = null,

    @SerialName("tx_ref")
    val txRef: String,

    @SerialName("updated_at")
    val updatedAt: Long
)

@Serializable
data class PassmanagerWebsiteReadRequest (
    @SerialName("entry_id")
    val entryID: String
)

@Serializable
data class PassmanagerWebsiteResult (
    val errors: List<WebsiteRuleError>,
    val revision: String? = null,
    val rules: List<CredentialWebsiteRule>
)

@Serializable
data class WebsiteRuleError (
    val code: String,
    val index: Long
)

@Serializable
data class CredentialWebsiteRule (
    @SerialName("match_mode")
    val matchMode: String,

    @SerialName("source_index")
    val sourceIndex: Long? = null,

    val value: String
)

@Serializable
data class PassmanagerWebsiteUpdateRequest (
    @SerialName("entry_id")
    val entryID: String,

    val revision: String,
    val rules: List<CredentialWebsiteRule>
)

@Serializable
data class PassmanagerWebsiteValidateRequest (
    val rules: List<CredentialWebsiteRule>
)
