// This file was generated from JSON Schema using quicktype, do not modify it directly.
// To parse the JSON, add this file to your project and do:
//
//   let coreWire = try CoreWire(json)

import Foundation

// MARK: - CoreWire
public struct CoreWire: Codable {
    public let attachmentRequest: CatalogAttachmentRequest
    public let attachmentResponse: CatalogAttachmentResponse
    public let credentialDetail: CredentialDetail
    public let credentialUpdate: PassmanagerEntryUpdateRequest
    public let documentLinkRequest: CatalogDocumentLinkRequest
    public let documentLinkResponse: CatalogDocumentLinkResponse
    public let documentSaved: CatalogFileReplaceResponse
    public let entryCreateRequest: PassmanagerEntryCreateRequest
    public let entryList: PassmanagerEntryListResponse
    public let entryPage: PassmanagerEntryPageResponse
    public let entryPageRequest: PassmanagerEntryPageRequest
    public let entrySaveResponse: PassmanagerEntrySaveResponse
    public let error: RPCError
    public let fileSource: SourceMetadataResponse
    public let fileUpload: UploadResponse
    public let folderPage: CatalogFolderPageResponse
    public let folderRequest: CatalogFolderPageRequest
    public let groupPage: PassmanagerGroupPageResponse
    public let groupPageRequest: PassmanagerGroupPageRequest
    public let groupRename: PassmanagerGroupRenameRequest
    public let iconGetMany: PassmanagerIconGetManyResponse
    public let iconGetManyRequest: PassmanagerIconGetManyRequest
    public let markdownDocument: MarkdownDocument
    public let masterRekey: MasterRekeyResponse
    public let masterRekeyRequest: MasterRekeyRequest
    public let nodeCreated: NodeCreatedResponse
    public let otpCode: PassmanagerOtpRecordRequest
    public let otpDelete: PassmanagerOtpRecordRequest
    public let otpGenerated: OtpPreviewResponse
    public let otpList: PassmanagerOtpRecordsRequest
    public let otpResponse: PassmanagerOtpRecordsResponse
    public let otpSave: PassmanagerOtpRecordSaveRequest
    public let otpURIRequest: PassmanagerOtpURIRequest
    public let otpURIResponse: PassmanagerOtpURIResponse
    public let passkeyDeleteRequest: VaultPasskeyDeleteRequest
    public let passkeyDeleteResponse: VaultPasskeyDeleteResponse
    public let passkeysList: VaultPasskeysListResponse
    public let passwordGenerationRequest: PassmanagerPasswordGenerateRequest
    public let passwordGenerationResponse: PassmanagerPasswordGenerateResponse
    public let paymentCardMetadata: PaymentCardMetadata
    public let providerStatus: CredentialProviderStatusResponse
    public let request: RPCRequest
    public let rootImportPreview: PassmanagerRootImportPreview
    public let rootImportRequest: PassmanagerRootImportRequest
    public let secretRead: PassmanagerSecretReadResponse
    public let securityAuditPage: PassmanagerSecurityAuditPageResponse
    public let securityAuditRequest: PassmanagerSecurityAuditPageRequest
    public let sshEditRequest: PassmanagerSSHEditRequest
    public let sshExportRequest: PassmanagerSSHExportRequest
    public let sshExportResponse: PassmanagerSSHExportResponse
    public let sshImportRequest: PassmanagerSSHImportRequest
    public let sshKeygenRequest: PassmanagerSSHKeygenRequest
    public let sshKeygenResponse: PassmanagerSSHKeyCreateResponse
    public let sshPageRequest: PassmanagerSSHPageRequest
    public let sshPageResponse: PassmanagerSSHPageResponse
    public let status: VaultStatusResponse
    public let tagDelete: PassmanagerTagDeleteRequest
    public let tagPage: PassmanagerTagPageResponse
    public let tagPageRequest: PassmanagerTagPageRequest
    public let tagSave: PassmanagerTagSaveRequest
    public let vaultRekey: VaultRekeyResponse
    public let vaultRekeyRequest: VaultRekeyRequest
    public let walletAccounts: WalletAccountsListResponse
    public let walletAccountsRequest: WalletAccountsListRequest
    public let walletAddress: WalletAddressesDeriveResponse
    public let walletAddressDetectRequest: WalletAddressDetectRequest
    public let walletAddressDetected: WalletAddressDetectResponse
    public let walletAddressRequest: WalletAddressesDeriveRequest
    public let walletBalance: WalletBalanceGetResponse
    public let walletBalanceRequest: WalletBalanceGetRequest
    public let walletCancelRequest: WalletTransactionCancelRequest
    public let walletCancelled: WalletTransactionCancelResponse
    public let walletConfirmRequest: WalletTransactionConfirmRequest
    public let walletConfirmed: WalletTransactionConfirmResponse
    public let walletContactCreateRequest: WalletAddressBookCreateRequest
    public let walletContactCreated: WalletAddressBookCreateResponse
    public let walletContactDeleteRequest: WalletAddressBookDeleteRequest
    public let walletContactDeleted: WalletAddressBookDeleteResponse
    public let walletContactUpdateRequest: WalletAddressBookUpdateRequest
    public let walletContactUpdated: WalletAddressBookUpdateResponse
    public let walletContacts: WalletAddressBookListResponse
    public let walletCreateRequest: WalletHDCreateRequest
    public let walletCreated: WalletHDCreateResponse
    public let walletDeriveRequest: WalletAccountsDeriveRequest
    public let walletDerived: WalletAccountsDeriveResponse
    public let walletHistory: WalletTransactionsListResponse
    public let walletHistoryRequest: WalletTransactionsListRequest
    public let walletHistorySyncRequest: WalletTransactionsSyncRequest
    public let walletHistorySynced: WalletTransactionsSyncResponse
    public let walletImportRequest: WalletImportCreateRequest
    public let walletImported: WalletImportCreateResponse
    public let walletList: WalletListResponse
    public let walletMnemonic: WalletHDGenerateMnemonicResponse
    public let walletMnemonicRequest: WalletHDGenerateMnemonicRequest
    public let walletPrepareRequest: WalletTransactionPrepareRequest
    public let walletPrepared: WalletTransactionPrepareResponse
    public let walletQuoteRequest: WalletTransactionQuoteRequest
    public let walletQuoted: WalletTransactionQuoteResponse
    public let walletRebroadcastRequest: WalletTransactionRebroadcastRequest
    public let walletRebroadcasted: WalletTransactionRebroadcastResponse
    public let walletRecovery: WalletBackupExportResponse
    public let walletRecoveryRequest: WalletBackupExportRequest
    public let walletStatus: WalletStatusResponse
    public let walletTonRotateKeyRequest: WalletTonRotateKeyRequest
    public let walletTonRotateKeyResponse: WalletTonRotateKeyResponse
    public let walletTransactionRefreshRequest: WalletTransactionsRefreshRequest
    public let walletTransactionRefreshed: WalletTransactionsRefreshResponse
    public let websiteReadRequest: PassmanagerWebsiteReadRequest
    public let websiteResult: PassmanagerWebsiteResult
    public let websiteUpdateRequest: PassmanagerWebsiteUpdateRequest
    public let websiteValidateRequest: PassmanagerWebsiteValidateRequest

    public enum CodingKeys: String, CodingKey {
        case attachmentRequest = "attachment_request"
        case attachmentResponse = "attachment_response"
        case credentialDetail = "credential_detail"
        case credentialUpdate = "credential_update"
        case documentLinkRequest = "document_link_request"
        case documentLinkResponse = "document_link_response"
        case documentSaved = "document_saved"
        case entryCreateRequest = "entry_create_request"
        case entryList = "entry_list"
        case entryPage = "entry_page"
        case entryPageRequest = "entry_page_request"
        case entrySaveResponse = "entry_save_response"
        case error = "error"
        case fileSource = "file_source"
        case fileUpload = "file_upload"
        case folderPage = "folder_page"
        case folderRequest = "folder_request"
        case groupPage = "group_page"
        case groupPageRequest = "group_page_request"
        case groupRename = "group_rename"
        case iconGetMany = "icon_get_many"
        case iconGetManyRequest = "icon_get_many_request"
        case markdownDocument = "markdown_document"
        case masterRekey = "master_rekey"
        case masterRekeyRequest = "master_rekey_request"
        case nodeCreated = "node_created"
        case otpCode = "otp_code"
        case otpDelete = "otp_delete"
        case otpGenerated = "otp_generated"
        case otpList = "otp_list"
        case otpResponse = "otp_response"
        case otpSave = "otp_save"
        case otpURIRequest = "otp_uri_request"
        case otpURIResponse = "otp_uri_response"
        case passkeyDeleteRequest = "passkey_delete_request"
        case passkeyDeleteResponse = "passkey_delete_response"
        case passkeysList = "passkeys_list"
        case passwordGenerationRequest = "password_generation_request"
        case passwordGenerationResponse = "password_generation_response"
        case paymentCardMetadata = "payment_card_metadata"
        case providerStatus = "provider_status"
        case request = "request"
        case rootImportPreview = "root_import_preview"
        case rootImportRequest = "root_import_request"
        case secretRead = "secret_read"
        case securityAuditPage = "security_audit_page"
        case securityAuditRequest = "security_audit_request"
        case sshEditRequest = "ssh_edit_request"
        case sshExportRequest = "ssh_export_request"
        case sshExportResponse = "ssh_export_response"
        case sshImportRequest = "ssh_import_request"
        case sshKeygenRequest = "ssh_keygen_request"
        case sshKeygenResponse = "ssh_keygen_response"
        case sshPageRequest = "ssh_page_request"
        case sshPageResponse = "ssh_page_response"
        case status = "status"
        case tagDelete = "tag_delete"
        case tagPage = "tag_page"
        case tagPageRequest = "tag_page_request"
        case tagSave = "tag_save"
        case vaultRekey = "vault_rekey"
        case vaultRekeyRequest = "vault_rekey_request"
        case walletAccounts = "wallet_accounts"
        case walletAccountsRequest = "wallet_accounts_request"
        case walletAddress = "wallet_address"
        case walletAddressDetectRequest = "wallet_address_detect_request"
        case walletAddressDetected = "wallet_address_detected"
        case walletAddressRequest = "wallet_address_request"
        case walletBalance = "wallet_balance"
        case walletBalanceRequest = "wallet_balance_request"
        case walletCancelRequest = "wallet_cancel_request"
        case walletCancelled = "wallet_cancelled"
        case walletConfirmRequest = "wallet_confirm_request"
        case walletConfirmed = "wallet_confirmed"
        case walletContactCreateRequest = "wallet_contact_create_request"
        case walletContactCreated = "wallet_contact_created"
        case walletContactDeleteRequest = "wallet_contact_delete_request"
        case walletContactDeleted = "wallet_contact_deleted"
        case walletContactUpdateRequest = "wallet_contact_update_request"
        case walletContactUpdated = "wallet_contact_updated"
        case walletContacts = "wallet_contacts"
        case walletCreateRequest = "wallet_create_request"
        case walletCreated = "wallet_created"
        case walletDeriveRequest = "wallet_derive_request"
        case walletDerived = "wallet_derived"
        case walletHistory = "wallet_history"
        case walletHistoryRequest = "wallet_history_request"
        case walletHistorySyncRequest = "wallet_history_sync_request"
        case walletHistorySynced = "wallet_history_synced"
        case walletImportRequest = "wallet_import_request"
        case walletImported = "wallet_imported"
        case walletList = "wallet_list"
        case walletMnemonic = "wallet_mnemonic"
        case walletMnemonicRequest = "wallet_mnemonic_request"
        case walletPrepareRequest = "wallet_prepare_request"
        case walletPrepared = "wallet_prepared"
        case walletQuoteRequest = "wallet_quote_request"
        case walletQuoted = "wallet_quoted"
        case walletRebroadcastRequest = "wallet_rebroadcast_request"
        case walletRebroadcasted = "wallet_rebroadcasted"
        case walletRecovery = "wallet_recovery"
        case walletRecoveryRequest = "wallet_recovery_request"
        case walletStatus = "wallet_status"
        case walletTonRotateKeyRequest = "wallet_ton_rotate_key_request"
        case walletTonRotateKeyResponse = "wallet_ton_rotate_key_response"
        case walletTransactionRefreshRequest = "wallet_transaction_refresh_request"
        case walletTransactionRefreshed = "wallet_transaction_refreshed"
        case websiteReadRequest = "website_read_request"
        case websiteResult = "website_result"
        case websiteUpdateRequest = "website_update_request"
        case websiteValidateRequest = "website_validate_request"
    }

    public init(attachmentRequest: CatalogAttachmentRequest, attachmentResponse: CatalogAttachmentResponse, credentialDetail: CredentialDetail, credentialUpdate: PassmanagerEntryUpdateRequest, documentLinkRequest: CatalogDocumentLinkRequest, documentLinkResponse: CatalogDocumentLinkResponse, documentSaved: CatalogFileReplaceResponse, entryCreateRequest: PassmanagerEntryCreateRequest, entryList: PassmanagerEntryListResponse, entryPage: PassmanagerEntryPageResponse, entryPageRequest: PassmanagerEntryPageRequest, entrySaveResponse: PassmanagerEntrySaveResponse, error: RPCError, fileSource: SourceMetadataResponse, fileUpload: UploadResponse, folderPage: CatalogFolderPageResponse, folderRequest: CatalogFolderPageRequest, groupPage: PassmanagerGroupPageResponse, groupPageRequest: PassmanagerGroupPageRequest, groupRename: PassmanagerGroupRenameRequest, iconGetMany: PassmanagerIconGetManyResponse, iconGetManyRequest: PassmanagerIconGetManyRequest, markdownDocument: MarkdownDocument, masterRekey: MasterRekeyResponse, masterRekeyRequest: MasterRekeyRequest, nodeCreated: NodeCreatedResponse, otpCode: PassmanagerOtpRecordRequest, otpDelete: PassmanagerOtpRecordRequest, otpGenerated: OtpPreviewResponse, otpList: PassmanagerOtpRecordsRequest, otpResponse: PassmanagerOtpRecordsResponse, otpSave: PassmanagerOtpRecordSaveRequest, otpURIRequest: PassmanagerOtpURIRequest, otpURIResponse: PassmanagerOtpURIResponse, passkeyDeleteRequest: VaultPasskeyDeleteRequest, passkeyDeleteResponse: VaultPasskeyDeleteResponse, passkeysList: VaultPasskeysListResponse, passwordGenerationRequest: PassmanagerPasswordGenerateRequest, passwordGenerationResponse: PassmanagerPasswordGenerateResponse, paymentCardMetadata: PaymentCardMetadata, providerStatus: CredentialProviderStatusResponse, request: RPCRequest, rootImportPreview: PassmanagerRootImportPreview, rootImportRequest: PassmanagerRootImportRequest, secretRead: PassmanagerSecretReadResponse, securityAuditPage: PassmanagerSecurityAuditPageResponse, securityAuditRequest: PassmanagerSecurityAuditPageRequest, sshEditRequest: PassmanagerSSHEditRequest, sshExportRequest: PassmanagerSSHExportRequest, sshExportResponse: PassmanagerSSHExportResponse, sshImportRequest: PassmanagerSSHImportRequest, sshKeygenRequest: PassmanagerSSHKeygenRequest, sshKeygenResponse: PassmanagerSSHKeyCreateResponse, sshPageRequest: PassmanagerSSHPageRequest, sshPageResponse: PassmanagerSSHPageResponse, status: VaultStatusResponse, tagDelete: PassmanagerTagDeleteRequest, tagPage: PassmanagerTagPageResponse, tagPageRequest: PassmanagerTagPageRequest, tagSave: PassmanagerTagSaveRequest, vaultRekey: VaultRekeyResponse, vaultRekeyRequest: VaultRekeyRequest, walletAccounts: WalletAccountsListResponse, walletAccountsRequest: WalletAccountsListRequest, walletAddress: WalletAddressesDeriveResponse, walletAddressDetectRequest: WalletAddressDetectRequest, walletAddressDetected: WalletAddressDetectResponse, walletAddressRequest: WalletAddressesDeriveRequest, walletBalance: WalletBalanceGetResponse, walletBalanceRequest: WalletBalanceGetRequest, walletCancelRequest: WalletTransactionCancelRequest, walletCancelled: WalletTransactionCancelResponse, walletConfirmRequest: WalletTransactionConfirmRequest, walletConfirmed: WalletTransactionConfirmResponse, walletContactCreateRequest: WalletAddressBookCreateRequest, walletContactCreated: WalletAddressBookCreateResponse, walletContactDeleteRequest: WalletAddressBookDeleteRequest, walletContactDeleted: WalletAddressBookDeleteResponse, walletContactUpdateRequest: WalletAddressBookUpdateRequest, walletContactUpdated: WalletAddressBookUpdateResponse, walletContacts: WalletAddressBookListResponse, walletCreateRequest: WalletHDCreateRequest, walletCreated: WalletHDCreateResponse, walletDeriveRequest: WalletAccountsDeriveRequest, walletDerived: WalletAccountsDeriveResponse, walletHistory: WalletTransactionsListResponse, walletHistoryRequest: WalletTransactionsListRequest, walletHistorySyncRequest: WalletTransactionsSyncRequest, walletHistorySynced: WalletTransactionsSyncResponse, walletImportRequest: WalletImportCreateRequest, walletImported: WalletImportCreateResponse, walletList: WalletListResponse, walletMnemonic: WalletHDGenerateMnemonicResponse, walletMnemonicRequest: WalletHDGenerateMnemonicRequest, walletPrepareRequest: WalletTransactionPrepareRequest, walletPrepared: WalletTransactionPrepareResponse, walletQuoteRequest: WalletTransactionQuoteRequest, walletQuoted: WalletTransactionQuoteResponse, walletRebroadcastRequest: WalletTransactionRebroadcastRequest, walletRebroadcasted: WalletTransactionRebroadcastResponse, walletRecovery: WalletBackupExportResponse, walletRecoveryRequest: WalletBackupExportRequest, walletStatus: WalletStatusResponse, walletTonRotateKeyRequest: WalletTonRotateKeyRequest, walletTonRotateKeyResponse: WalletTonRotateKeyResponse, walletTransactionRefreshRequest: WalletTransactionsRefreshRequest, walletTransactionRefreshed: WalletTransactionsRefreshResponse, websiteReadRequest: PassmanagerWebsiteReadRequest, websiteResult: PassmanagerWebsiteResult, websiteUpdateRequest: PassmanagerWebsiteUpdateRequest, websiteValidateRequest: PassmanagerWebsiteValidateRequest) {
        self.attachmentRequest = attachmentRequest
        self.attachmentResponse = attachmentResponse
        self.credentialDetail = credentialDetail
        self.credentialUpdate = credentialUpdate
        self.documentLinkRequest = documentLinkRequest
        self.documentLinkResponse = documentLinkResponse
        self.documentSaved = documentSaved
        self.entryCreateRequest = entryCreateRequest
        self.entryList = entryList
        self.entryPage = entryPage
        self.entryPageRequest = entryPageRequest
        self.entrySaveResponse = entrySaveResponse
        self.error = error
        self.fileSource = fileSource
        self.fileUpload = fileUpload
        self.folderPage = folderPage
        self.folderRequest = folderRequest
        self.groupPage = groupPage
        self.groupPageRequest = groupPageRequest
        self.groupRename = groupRename
        self.iconGetMany = iconGetMany
        self.iconGetManyRequest = iconGetManyRequest
        self.markdownDocument = markdownDocument
        self.masterRekey = masterRekey
        self.masterRekeyRequest = masterRekeyRequest
        self.nodeCreated = nodeCreated
        self.otpCode = otpCode
        self.otpDelete = otpDelete
        self.otpGenerated = otpGenerated
        self.otpList = otpList
        self.otpResponse = otpResponse
        self.otpSave = otpSave
        self.otpURIRequest = otpURIRequest
        self.otpURIResponse = otpURIResponse
        self.passkeyDeleteRequest = passkeyDeleteRequest
        self.passkeyDeleteResponse = passkeyDeleteResponse
        self.passkeysList = passkeysList
        self.passwordGenerationRequest = passwordGenerationRequest
        self.passwordGenerationResponse = passwordGenerationResponse
        self.paymentCardMetadata = paymentCardMetadata
        self.providerStatus = providerStatus
        self.request = request
        self.rootImportPreview = rootImportPreview
        self.rootImportRequest = rootImportRequest
        self.secretRead = secretRead
        self.securityAuditPage = securityAuditPage
        self.securityAuditRequest = securityAuditRequest
        self.sshEditRequest = sshEditRequest
        self.sshExportRequest = sshExportRequest
        self.sshExportResponse = sshExportResponse
        self.sshImportRequest = sshImportRequest
        self.sshKeygenRequest = sshKeygenRequest
        self.sshKeygenResponse = sshKeygenResponse
        self.sshPageRequest = sshPageRequest
        self.sshPageResponse = sshPageResponse
        self.status = status
        self.tagDelete = tagDelete
        self.tagPage = tagPage
        self.tagPageRequest = tagPageRequest
        self.tagSave = tagSave
        self.vaultRekey = vaultRekey
        self.vaultRekeyRequest = vaultRekeyRequest
        self.walletAccounts = walletAccounts
        self.walletAccountsRequest = walletAccountsRequest
        self.walletAddress = walletAddress
        self.walletAddressDetectRequest = walletAddressDetectRequest
        self.walletAddressDetected = walletAddressDetected
        self.walletAddressRequest = walletAddressRequest
        self.walletBalance = walletBalance
        self.walletBalanceRequest = walletBalanceRequest
        self.walletCancelRequest = walletCancelRequest
        self.walletCancelled = walletCancelled
        self.walletConfirmRequest = walletConfirmRequest
        self.walletConfirmed = walletConfirmed
        self.walletContactCreateRequest = walletContactCreateRequest
        self.walletContactCreated = walletContactCreated
        self.walletContactDeleteRequest = walletContactDeleteRequest
        self.walletContactDeleted = walletContactDeleted
        self.walletContactUpdateRequest = walletContactUpdateRequest
        self.walletContactUpdated = walletContactUpdated
        self.walletContacts = walletContacts
        self.walletCreateRequest = walletCreateRequest
        self.walletCreated = walletCreated
        self.walletDeriveRequest = walletDeriveRequest
        self.walletDerived = walletDerived
        self.walletHistory = walletHistory
        self.walletHistoryRequest = walletHistoryRequest
        self.walletHistorySyncRequest = walletHistorySyncRequest
        self.walletHistorySynced = walletHistorySynced
        self.walletImportRequest = walletImportRequest
        self.walletImported = walletImported
        self.walletList = walletList
        self.walletMnemonic = walletMnemonic
        self.walletMnemonicRequest = walletMnemonicRequest
        self.walletPrepareRequest = walletPrepareRequest
        self.walletPrepared = walletPrepared
        self.walletQuoteRequest = walletQuoteRequest
        self.walletQuoted = walletQuoted
        self.walletRebroadcastRequest = walletRebroadcastRequest
        self.walletRebroadcasted = walletRebroadcasted
        self.walletRecovery = walletRecovery
        self.walletRecoveryRequest = walletRecoveryRequest
        self.walletStatus = walletStatus
        self.walletTonRotateKeyRequest = walletTonRotateKeyRequest
        self.walletTonRotateKeyResponse = walletTonRotateKeyResponse
        self.walletTransactionRefreshRequest = walletTransactionRefreshRequest
        self.walletTransactionRefreshed = walletTransactionRefreshed
        self.websiteReadRequest = websiteReadRequest
        self.websiteResult = websiteResult
        self.websiteUpdateRequest = websiteUpdateRequest
        self.websiteValidateRequest = websiteValidateRequest
    }
}

// MARK: CoreWire convenience initializers and mutators

public extension CoreWire {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CoreWire.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        attachmentRequest: CatalogAttachmentRequest? = nil,
        attachmentResponse: CatalogAttachmentResponse? = nil,
        credentialDetail: CredentialDetail? = nil,
        credentialUpdate: PassmanagerEntryUpdateRequest? = nil,
        documentLinkRequest: CatalogDocumentLinkRequest? = nil,
        documentLinkResponse: CatalogDocumentLinkResponse? = nil,
        documentSaved: CatalogFileReplaceResponse? = nil,
        entryCreateRequest: PassmanagerEntryCreateRequest? = nil,
        entryList: PassmanagerEntryListResponse? = nil,
        entryPage: PassmanagerEntryPageResponse? = nil,
        entryPageRequest: PassmanagerEntryPageRequest? = nil,
        entrySaveResponse: PassmanagerEntrySaveResponse? = nil,
        error: RPCError? = nil,
        fileSource: SourceMetadataResponse? = nil,
        fileUpload: UploadResponse? = nil,
        folderPage: CatalogFolderPageResponse? = nil,
        folderRequest: CatalogFolderPageRequest? = nil,
        groupPage: PassmanagerGroupPageResponse? = nil,
        groupPageRequest: PassmanagerGroupPageRequest? = nil,
        groupRename: PassmanagerGroupRenameRequest? = nil,
        iconGetMany: PassmanagerIconGetManyResponse? = nil,
        iconGetManyRequest: PassmanagerIconGetManyRequest? = nil,
        markdownDocument: MarkdownDocument? = nil,
        masterRekey: MasterRekeyResponse? = nil,
        masterRekeyRequest: MasterRekeyRequest? = nil,
        nodeCreated: NodeCreatedResponse? = nil,
        otpCode: PassmanagerOtpRecordRequest? = nil,
        otpDelete: PassmanagerOtpRecordRequest? = nil,
        otpGenerated: OtpPreviewResponse? = nil,
        otpList: PassmanagerOtpRecordsRequest? = nil,
        otpResponse: PassmanagerOtpRecordsResponse? = nil,
        otpSave: PassmanagerOtpRecordSaveRequest? = nil,
        otpURIRequest: PassmanagerOtpURIRequest? = nil,
        otpURIResponse: PassmanagerOtpURIResponse? = nil,
        passkeyDeleteRequest: VaultPasskeyDeleteRequest? = nil,
        passkeyDeleteResponse: VaultPasskeyDeleteResponse? = nil,
        passkeysList: VaultPasskeysListResponse? = nil,
        passwordGenerationRequest: PassmanagerPasswordGenerateRequest? = nil,
        passwordGenerationResponse: PassmanagerPasswordGenerateResponse? = nil,
        paymentCardMetadata: PaymentCardMetadata? = nil,
        providerStatus: CredentialProviderStatusResponse? = nil,
        request: RPCRequest? = nil,
        rootImportPreview: PassmanagerRootImportPreview? = nil,
        rootImportRequest: PassmanagerRootImportRequest? = nil,
        secretRead: PassmanagerSecretReadResponse? = nil,
        securityAuditPage: PassmanagerSecurityAuditPageResponse? = nil,
        securityAuditRequest: PassmanagerSecurityAuditPageRequest? = nil,
        sshEditRequest: PassmanagerSSHEditRequest? = nil,
        sshExportRequest: PassmanagerSSHExportRequest? = nil,
        sshExportResponse: PassmanagerSSHExportResponse? = nil,
        sshImportRequest: PassmanagerSSHImportRequest? = nil,
        sshKeygenRequest: PassmanagerSSHKeygenRequest? = nil,
        sshKeygenResponse: PassmanagerSSHKeyCreateResponse? = nil,
        sshPageRequest: PassmanagerSSHPageRequest? = nil,
        sshPageResponse: PassmanagerSSHPageResponse? = nil,
        status: VaultStatusResponse? = nil,
        tagDelete: PassmanagerTagDeleteRequest? = nil,
        tagPage: PassmanagerTagPageResponse? = nil,
        tagPageRequest: PassmanagerTagPageRequest? = nil,
        tagSave: PassmanagerTagSaveRequest? = nil,
        vaultRekey: VaultRekeyResponse? = nil,
        vaultRekeyRequest: VaultRekeyRequest? = nil,
        walletAccounts: WalletAccountsListResponse? = nil,
        walletAccountsRequest: WalletAccountsListRequest? = nil,
        walletAddress: WalletAddressesDeriveResponse? = nil,
        walletAddressDetectRequest: WalletAddressDetectRequest? = nil,
        walletAddressDetected: WalletAddressDetectResponse? = nil,
        walletAddressRequest: WalletAddressesDeriveRequest? = nil,
        walletBalance: WalletBalanceGetResponse? = nil,
        walletBalanceRequest: WalletBalanceGetRequest? = nil,
        walletCancelRequest: WalletTransactionCancelRequest? = nil,
        walletCancelled: WalletTransactionCancelResponse? = nil,
        walletConfirmRequest: WalletTransactionConfirmRequest? = nil,
        walletConfirmed: WalletTransactionConfirmResponse? = nil,
        walletContactCreateRequest: WalletAddressBookCreateRequest? = nil,
        walletContactCreated: WalletAddressBookCreateResponse? = nil,
        walletContactDeleteRequest: WalletAddressBookDeleteRequest? = nil,
        walletContactDeleted: WalletAddressBookDeleteResponse? = nil,
        walletContactUpdateRequest: WalletAddressBookUpdateRequest? = nil,
        walletContactUpdated: WalletAddressBookUpdateResponse? = nil,
        walletContacts: WalletAddressBookListResponse? = nil,
        walletCreateRequest: WalletHDCreateRequest? = nil,
        walletCreated: WalletHDCreateResponse? = nil,
        walletDeriveRequest: WalletAccountsDeriveRequest? = nil,
        walletDerived: WalletAccountsDeriveResponse? = nil,
        walletHistory: WalletTransactionsListResponse? = nil,
        walletHistoryRequest: WalletTransactionsListRequest? = nil,
        walletHistorySyncRequest: WalletTransactionsSyncRequest? = nil,
        walletHistorySynced: WalletTransactionsSyncResponse? = nil,
        walletImportRequest: WalletImportCreateRequest? = nil,
        walletImported: WalletImportCreateResponse? = nil,
        walletList: WalletListResponse? = nil,
        walletMnemonic: WalletHDGenerateMnemonicResponse? = nil,
        walletMnemonicRequest: WalletHDGenerateMnemonicRequest? = nil,
        walletPrepareRequest: WalletTransactionPrepareRequest? = nil,
        walletPrepared: WalletTransactionPrepareResponse? = nil,
        walletQuoteRequest: WalletTransactionQuoteRequest? = nil,
        walletQuoted: WalletTransactionQuoteResponse? = nil,
        walletRebroadcastRequest: WalletTransactionRebroadcastRequest? = nil,
        walletRebroadcasted: WalletTransactionRebroadcastResponse? = nil,
        walletRecovery: WalletBackupExportResponse? = nil,
        walletRecoveryRequest: WalletBackupExportRequest? = nil,
        walletStatus: WalletStatusResponse? = nil,
        walletTonRotateKeyRequest: WalletTonRotateKeyRequest? = nil,
        walletTonRotateKeyResponse: WalletTonRotateKeyResponse? = nil,
        walletTransactionRefreshRequest: WalletTransactionsRefreshRequest? = nil,
        walletTransactionRefreshed: WalletTransactionsRefreshResponse? = nil,
        websiteReadRequest: PassmanagerWebsiteReadRequest? = nil,
        websiteResult: PassmanagerWebsiteResult? = nil,
        websiteUpdateRequest: PassmanagerWebsiteUpdateRequest? = nil,
        websiteValidateRequest: PassmanagerWebsiteValidateRequest? = nil
    ) -> CoreWire {
        return CoreWire(
            attachmentRequest: attachmentRequest ?? self.attachmentRequest,
            attachmentResponse: attachmentResponse ?? self.attachmentResponse,
            credentialDetail: credentialDetail ?? self.credentialDetail,
            credentialUpdate: credentialUpdate ?? self.credentialUpdate,
            documentLinkRequest: documentLinkRequest ?? self.documentLinkRequest,
            documentLinkResponse: documentLinkResponse ?? self.documentLinkResponse,
            documentSaved: documentSaved ?? self.documentSaved,
            entryCreateRequest: entryCreateRequest ?? self.entryCreateRequest,
            entryList: entryList ?? self.entryList,
            entryPage: entryPage ?? self.entryPage,
            entryPageRequest: entryPageRequest ?? self.entryPageRequest,
            entrySaveResponse: entrySaveResponse ?? self.entrySaveResponse,
            error: error ?? self.error,
            fileSource: fileSource ?? self.fileSource,
            fileUpload: fileUpload ?? self.fileUpload,
            folderPage: folderPage ?? self.folderPage,
            folderRequest: folderRequest ?? self.folderRequest,
            groupPage: groupPage ?? self.groupPage,
            groupPageRequest: groupPageRequest ?? self.groupPageRequest,
            groupRename: groupRename ?? self.groupRename,
            iconGetMany: iconGetMany ?? self.iconGetMany,
            iconGetManyRequest: iconGetManyRequest ?? self.iconGetManyRequest,
            markdownDocument: markdownDocument ?? self.markdownDocument,
            masterRekey: masterRekey ?? self.masterRekey,
            masterRekeyRequest: masterRekeyRequest ?? self.masterRekeyRequest,
            nodeCreated: nodeCreated ?? self.nodeCreated,
            otpCode: otpCode ?? self.otpCode,
            otpDelete: otpDelete ?? self.otpDelete,
            otpGenerated: otpGenerated ?? self.otpGenerated,
            otpList: otpList ?? self.otpList,
            otpResponse: otpResponse ?? self.otpResponse,
            otpSave: otpSave ?? self.otpSave,
            otpURIRequest: otpURIRequest ?? self.otpURIRequest,
            otpURIResponse: otpURIResponse ?? self.otpURIResponse,
            passkeyDeleteRequest: passkeyDeleteRequest ?? self.passkeyDeleteRequest,
            passkeyDeleteResponse: passkeyDeleteResponse ?? self.passkeyDeleteResponse,
            passkeysList: passkeysList ?? self.passkeysList,
            passwordGenerationRequest: passwordGenerationRequest ?? self.passwordGenerationRequest,
            passwordGenerationResponse: passwordGenerationResponse ?? self.passwordGenerationResponse,
            paymentCardMetadata: paymentCardMetadata ?? self.paymentCardMetadata,
            providerStatus: providerStatus ?? self.providerStatus,
            request: request ?? self.request,
            rootImportPreview: rootImportPreview ?? self.rootImportPreview,
            rootImportRequest: rootImportRequest ?? self.rootImportRequest,
            secretRead: secretRead ?? self.secretRead,
            securityAuditPage: securityAuditPage ?? self.securityAuditPage,
            securityAuditRequest: securityAuditRequest ?? self.securityAuditRequest,
            sshEditRequest: sshEditRequest ?? self.sshEditRequest,
            sshExportRequest: sshExportRequest ?? self.sshExportRequest,
            sshExportResponse: sshExportResponse ?? self.sshExportResponse,
            sshImportRequest: sshImportRequest ?? self.sshImportRequest,
            sshKeygenRequest: sshKeygenRequest ?? self.sshKeygenRequest,
            sshKeygenResponse: sshKeygenResponse ?? self.sshKeygenResponse,
            sshPageRequest: sshPageRequest ?? self.sshPageRequest,
            sshPageResponse: sshPageResponse ?? self.sshPageResponse,
            status: status ?? self.status,
            tagDelete: tagDelete ?? self.tagDelete,
            tagPage: tagPage ?? self.tagPage,
            tagPageRequest: tagPageRequest ?? self.tagPageRequest,
            tagSave: tagSave ?? self.tagSave,
            vaultRekey: vaultRekey ?? self.vaultRekey,
            vaultRekeyRequest: vaultRekeyRequest ?? self.vaultRekeyRequest,
            walletAccounts: walletAccounts ?? self.walletAccounts,
            walletAccountsRequest: walletAccountsRequest ?? self.walletAccountsRequest,
            walletAddress: walletAddress ?? self.walletAddress,
            walletAddressDetectRequest: walletAddressDetectRequest ?? self.walletAddressDetectRequest,
            walletAddressDetected: walletAddressDetected ?? self.walletAddressDetected,
            walletAddressRequest: walletAddressRequest ?? self.walletAddressRequest,
            walletBalance: walletBalance ?? self.walletBalance,
            walletBalanceRequest: walletBalanceRequest ?? self.walletBalanceRequest,
            walletCancelRequest: walletCancelRequest ?? self.walletCancelRequest,
            walletCancelled: walletCancelled ?? self.walletCancelled,
            walletConfirmRequest: walletConfirmRequest ?? self.walletConfirmRequest,
            walletConfirmed: walletConfirmed ?? self.walletConfirmed,
            walletContactCreateRequest: walletContactCreateRequest ?? self.walletContactCreateRequest,
            walletContactCreated: walletContactCreated ?? self.walletContactCreated,
            walletContactDeleteRequest: walletContactDeleteRequest ?? self.walletContactDeleteRequest,
            walletContactDeleted: walletContactDeleted ?? self.walletContactDeleted,
            walletContactUpdateRequest: walletContactUpdateRequest ?? self.walletContactUpdateRequest,
            walletContactUpdated: walletContactUpdated ?? self.walletContactUpdated,
            walletContacts: walletContacts ?? self.walletContacts,
            walletCreateRequest: walletCreateRequest ?? self.walletCreateRequest,
            walletCreated: walletCreated ?? self.walletCreated,
            walletDeriveRequest: walletDeriveRequest ?? self.walletDeriveRequest,
            walletDerived: walletDerived ?? self.walletDerived,
            walletHistory: walletHistory ?? self.walletHistory,
            walletHistoryRequest: walletHistoryRequest ?? self.walletHistoryRequest,
            walletHistorySyncRequest: walletHistorySyncRequest ?? self.walletHistorySyncRequest,
            walletHistorySynced: walletHistorySynced ?? self.walletHistorySynced,
            walletImportRequest: walletImportRequest ?? self.walletImportRequest,
            walletImported: walletImported ?? self.walletImported,
            walletList: walletList ?? self.walletList,
            walletMnemonic: walletMnemonic ?? self.walletMnemonic,
            walletMnemonicRequest: walletMnemonicRequest ?? self.walletMnemonicRequest,
            walletPrepareRequest: walletPrepareRequest ?? self.walletPrepareRequest,
            walletPrepared: walletPrepared ?? self.walletPrepared,
            walletQuoteRequest: walletQuoteRequest ?? self.walletQuoteRequest,
            walletQuoted: walletQuoted ?? self.walletQuoted,
            walletRebroadcastRequest: walletRebroadcastRequest ?? self.walletRebroadcastRequest,
            walletRebroadcasted: walletRebroadcasted ?? self.walletRebroadcasted,
            walletRecovery: walletRecovery ?? self.walletRecovery,
            walletRecoveryRequest: walletRecoveryRequest ?? self.walletRecoveryRequest,
            walletStatus: walletStatus ?? self.walletStatus,
            walletTonRotateKeyRequest: walletTonRotateKeyRequest ?? self.walletTonRotateKeyRequest,
            walletTonRotateKeyResponse: walletTonRotateKeyResponse ?? self.walletTonRotateKeyResponse,
            walletTransactionRefreshRequest: walletTransactionRefreshRequest ?? self.walletTransactionRefreshRequest,
            walletTransactionRefreshed: walletTransactionRefreshed ?? self.walletTransactionRefreshed,
            websiteReadRequest: websiteReadRequest ?? self.websiteReadRequest,
            websiteResult: websiteResult ?? self.websiteResult,
            websiteUpdateRequest: websiteUpdateRequest ?? self.websiteUpdateRequest,
            websiteValidateRequest: websiteValidateRequest ?? self.websiteValidateRequest
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Prepares directories and a fresh name, without reserving or writing the image.
// MARK: - CatalogAttachmentRequest
public struct CatalogAttachmentRequest: Codable {
    public let fileName: String
    public let folderPath: String
    public let mimeType: String

    public enum CodingKeys: String, CodingKey {
        case fileName = "file_name"
        case folderPath = "folder_path"
        case mimeType = "mime_type"
    }

    public init(fileName: String, folderPath: String, mimeType: String) {
        self.fileName = fileName
        self.folderPath = folderPath
        self.mimeType = mimeType
    }
}

// MARK: CatalogAttachmentRequest convenience initializers and mutators

public extension CatalogAttachmentRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CatalogAttachmentRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        fileName: String? = nil,
        folderPath: String? = nil,
        mimeType: String? = nil
    ) -> CatalogAttachmentRequest {
        return CatalogAttachmentRequest(
            fileName: fileName ?? self.fileName,
            folderPath: folderPath ?? self.folderPath,
            mimeType: mimeType ?? self.mimeType
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Use create-only upload, then insert Markdown only after its confirmed completion.
// MARK: - CatalogAttachmentResponse
public struct CatalogAttachmentResponse: Codable {
    public let markdown: String
    public let mimeType: String
    public let name: String
    public let parentPath: String
    public let path: String

    public enum CodingKeys: String, CodingKey {
        case markdown = "markdown"
        case mimeType = "mime_type"
        case name = "name"
        case parentPath = "parent_path"
        case path = "path"
    }

    public init(markdown: String, mimeType: String, name: String, parentPath: String, path: String) {
        self.markdown = markdown
        self.mimeType = mimeType
        self.name = name
        self.parentPath = parentPath
        self.path = path
    }
}

// MARK: CatalogAttachmentResponse convenience initializers and mutators

public extension CatalogAttachmentResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CatalogAttachmentResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        markdown: String? = nil,
        mimeType: String? = nil,
        name: String? = nil,
        parentPath: String? = nil,
        path: String? = nil
    ) -> CatalogAttachmentResponse {
        return CatalogAttachmentResponse(
            markdown: markdown ?? self.markdown,
            mimeType: mimeType ?? self.mimeType,
            name: name ?? self.name,
            parentPath: parentPath ?? self.parentPath,
            path: path ?? self.path
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Metadata-only detail. The opaque revision covers persisted metadata and its catalog path.
// MARK: - CredentialDetail
public struct CredentialDetail: Codable {
    public let entryType: String
    public let groupPath: String
    public let id: String
    public let paymentCard: PaymentCardMetadata?
    public let revision: String
    public let tagKeys: [String]
    public let tags: [String]
    public let title: String
    public let username: String
    public let websites: [String]
    public let websitesEditable: Bool

    public enum CodingKeys: String, CodingKey {
        case entryType = "entry_type"
        case groupPath = "group_path"
        case id = "id"
        case paymentCard = "payment_card"
        case revision = "revision"
        case tagKeys = "tag_keys"
        case tags = "tags"
        case title = "title"
        case username = "username"
        case websites = "websites"
        case websitesEditable = "websites_editable"
    }

    public init(entryType: String, groupPath: String, id: String, paymentCard: PaymentCardMetadata?, revision: String, tagKeys: [String], tags: [String], title: String, username: String, websites: [String], websitesEditable: Bool) {
        self.entryType = entryType
        self.groupPath = groupPath
        self.id = id
        self.paymentCard = paymentCard
        self.revision = revision
        self.tagKeys = tagKeys
        self.tags = tags
        self.title = title
        self.username = username
        self.websites = websites
        self.websitesEditable = websitesEditable
    }
}

// MARK: CredentialDetail convenience initializers and mutators

public extension CredentialDetail {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CredentialDetail.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        entryType: String? = nil,
        groupPath: String? = nil,
        id: String? = nil,
        paymentCard: PaymentCardMetadata?? = nil,
        revision: String? = nil,
        tagKeys: [String]? = nil,
        tags: [String]? = nil,
        title: String? = nil,
        username: String? = nil,
        websites: [String]? = nil,
        websitesEditable: Bool? = nil
    ) -> CredentialDetail {
        return CredentialDetail(
            entryType: entryType ?? self.entryType,
            groupPath: groupPath ?? self.groupPath,
            id: id ?? self.id,
            paymentCard: paymentCard ?? self.paymentCard,
            revision: revision ?? self.revision,
            tagKeys: tagKeys ?? self.tagKeys,
            tags: tags ?? self.tags,
            title: title ?? self.title,
            username: username ?? self.username,
            websites: websites ?? self.websites,
            websitesEditable: websitesEditable ?? self.websitesEditable
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Canonical payment-card metadata; PAN and CVV are stored separately as secrets.
// MARK: - PaymentCardMetadata
public struct PaymentCardMetadata: Codable {
    public let brand: String
    public let cardholderName: String
    public let expMonth: Int
    public let expYear: Int
    public let last4: String?

    public enum CodingKeys: String, CodingKey {
        case brand = "brand"
        case cardholderName = "cardholder_name"
        case expMonth = "exp_month"
        case expYear = "exp_year"
        case last4 = "last4"
    }

    public init(brand: String, cardholderName: String, expMonth: Int, expYear: Int, last4: String?) {
        self.brand = brand
        self.cardholderName = cardholderName
        self.expMonth = expMonth
        self.expYear = expYear
        self.last4 = last4
    }
}

// MARK: PaymentCardMetadata convenience initializers and mutators

public extension PaymentCardMetadata {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PaymentCardMetadata.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        brand: String? = nil,
        cardholderName: String? = nil,
        expMonth: Int? = nil,
        expYear: Int? = nil,
        last4: String?? = nil
    ) -> PaymentCardMetadata {
        return PaymentCardMetadata(
            brand: brand ?? self.brand,
            cardholderName: cardholderName ?? self.cardholderName,
            expMonth: expMonth ?? self.expMonth,
            expYear: expYear ?? self.expYear,
            last4: last4 ?? self.last4
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Strict metadata patch. Omitted fields are retained; type and card last4 are not writable
/// here.
// MARK: - PassmanagerEntryUpdateRequest
public struct PassmanagerEntryUpdateRequest: Codable {
    public let cardholderName: String?
    public let entryID: String
    public let expMonth: Int?
    public let expYear: Int?
    public let groupPath: String?
    public let revision: String
    public let tagKeys: [String]?
    /// Blank for a payment card gives it back the name Core chooses from its network and last
    /// four digits; that name then follows a replaced number.
    public let title: String?
    public let username: String?
    public let websites: [String]?

    public enum CodingKeys: String, CodingKey {
        case cardholderName = "cardholder_name"
        case entryID = "entry_id"
        case expMonth = "exp_month"
        case expYear = "exp_year"
        case groupPath = "group_path"
        case revision = "revision"
        case tagKeys = "tag_keys"
        case title = "title"
        case username = "username"
        case websites = "websites"
    }

    public init(cardholderName: String?, entryID: String, expMonth: Int?, expYear: Int?, groupPath: String?, revision: String, tagKeys: [String]?, title: String?, username: String?, websites: [String]?) {
        self.cardholderName = cardholderName
        self.entryID = entryID
        self.expMonth = expMonth
        self.expYear = expYear
        self.groupPath = groupPath
        self.revision = revision
        self.tagKeys = tagKeys
        self.title = title
        self.username = username
        self.websites = websites
    }
}

// MARK: PassmanagerEntryUpdateRequest convenience initializers and mutators

public extension PassmanagerEntryUpdateRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerEntryUpdateRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        cardholderName: String?? = nil,
        entryID: String? = nil,
        expMonth: Int?? = nil,
        expYear: Int?? = nil,
        groupPath: String?? = nil,
        revision: String? = nil,
        tagKeys: [String]?? = nil,
        title: String?? = nil,
        username: String?? = nil,
        websites: [String]?? = nil
    ) -> PassmanagerEntryUpdateRequest {
        return PassmanagerEntryUpdateRequest(
            cardholderName: cardholderName ?? self.cardholderName,
            entryID: entryID ?? self.entryID,
            expMonth: expMonth ?? self.expMonth,
            expYear: expYear ?? self.expYear,
            groupPath: groupPath ?? self.groupPath,
            revision: revision ?? self.revision,
            tagKeys: tagKeys ?? self.tagKeys,
            title: title ?? self.title,
            username: username ?? self.username,
            websites: websites ?? self.websites
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Resolves a document link against the current catalog, using the source identity
/// for relative paths. No document body is read and no catalog mutation occurs.
// MARK: - CatalogDocumentLinkRequest
public struct CatalogDocumentLinkRequest: Codable {
    public let kind: CatalogDocumentLinkKind
    public let path: String
    public let sourceNodeID: Int

    public enum CodingKeys: String, CodingKey {
        case kind = "kind"
        case path = "path"
        case sourceNodeID = "source_node_id"
    }

    public init(kind: CatalogDocumentLinkKind, path: String, sourceNodeID: Int) {
        self.kind = kind
        self.path = path
        self.sourceNodeID = sourceNodeID
    }
}

// MARK: CatalogDocumentLinkRequest convenience initializers and mutators

public extension CatalogDocumentLinkRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CatalogDocumentLinkRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        kind: CatalogDocumentLinkKind? = nil,
        path: String? = nil,
        sourceNodeID: Int? = nil
    ) -> CatalogDocumentLinkRequest {
        return CatalogDocumentLinkRequest(
            kind: kind ?? self.kind,
            path: path ?? self.path,
            sourceNodeID: sourceNodeID ?? self.sourceNodeID
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

public enum CatalogDocumentLinkKind: String, Codable {
    case file = "file"
    case note = "note"
}

// MARK: - CatalogDocumentLinkResponse
public struct CatalogDocumentLinkResponse: Codable {
    public let item: CatalogFileLinkItem?
    public let kind: CatalogDocumentLinkResponseKind

    public enum CodingKeys: String, CodingKey {
        case item = "item"
        case kind = "kind"
    }

    public init(item: CatalogFileLinkItem?, kind: CatalogDocumentLinkResponseKind) {
        self.item = item
        self.kind = kind
    }
}

// MARK: CatalogDocumentLinkResponse convenience initializers and mutators

public extension CatalogDocumentLinkResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CatalogDocumentLinkResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        item: CatalogFileLinkItem?? = nil,
        kind: CatalogDocumentLinkResponseKind? = nil
    ) -> CatalogDocumentLinkResponse {
        return CatalogDocumentLinkResponse(
            item: item ?? self.item,
            kind: kind ?? self.kind
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CatalogFileLinkItem
public struct CatalogFileLinkItem: Codable {
    public let createdAt: Int
    public let mimeType: String?
    public let name: String
    public let nodeID: Int
    public let parentPath: String
    public let path: String
    public let size: Int
    public let sourceRevision: Int
    public let updatedAt: Int

    public enum CodingKeys: String, CodingKey {
        case createdAt = "created_at"
        case mimeType = "mime_type"
        case name = "name"
        case nodeID = "node_id"
        case parentPath = "parent_path"
        case path = "path"
        case size = "size"
        case sourceRevision = "source_revision"
        case updatedAt = "updated_at"
    }

    public init(createdAt: Int, mimeType: String?, name: String, nodeID: Int, parentPath: String, path: String, size: Int, sourceRevision: Int, updatedAt: Int) {
        self.createdAt = createdAt
        self.mimeType = mimeType
        self.name = name
        self.nodeID = nodeID
        self.parentPath = parentPath
        self.path = path
        self.size = size
        self.sourceRevision = sourceRevision
        self.updatedAt = updatedAt
    }
}

// MARK: CatalogFileLinkItem convenience initializers and mutators

public extension CatalogFileLinkItem {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CatalogFileLinkItem.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        createdAt: Int? = nil,
        mimeType: String?? = nil,
        name: String? = nil,
        nodeID: Int? = nil,
        parentPath: String? = nil,
        path: String? = nil,
        size: Int? = nil,
        sourceRevision: Int? = nil,
        updatedAt: Int? = nil
    ) -> CatalogFileLinkItem {
        return CatalogFileLinkItem(
            createdAt: createdAt ?? self.createdAt,
            mimeType: mimeType ?? self.mimeType,
            name: name ?? self.name,
            nodeID: nodeID ?? self.nodeID,
            parentPath: parentPath ?? self.parentPath,
            path: path ?? self.path,
            size: size ?? self.size,
            sourceRevision: sourceRevision ?? self.sourceRevision,
            updatedAt: updatedAt ?? self.updatedAt
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

public enum CatalogDocumentLinkResponseKind: String, Codable {
    case ambiguous = "ambiguous"
    case found = "found"
    case missing = "missing"
}

/// Existing file replacement response.
// MARK: - CatalogFileReplaceResponse
public struct CatalogFileReplaceResponse: Codable {
    public let mediaInfo: CatalogMediaInfo?
    public let mediaInspectedRevision: Int
    public let mimeType: String
    public let modtime: Int
    public let nodeID: Int
    public let size: Int
    public let sourceRevision: Int

    public enum CodingKeys: String, CodingKey {
        case mediaInfo = "media_info"
        case mediaInspectedRevision = "media_inspected_revision"
        case mimeType = "mime_type"
        case modtime = "modtime"
        case nodeID = "node_id"
        case size = "size"
        case sourceRevision = "source_revision"
    }

    public init(mediaInfo: CatalogMediaInfo?, mediaInspectedRevision: Int, mimeType: String, modtime: Int, nodeID: Int, size: Int, sourceRevision: Int) {
        self.mediaInfo = mediaInfo
        self.mediaInspectedRevision = mediaInspectedRevision
        self.mimeType = mimeType
        self.modtime = modtime
        self.nodeID = nodeID
        self.size = size
        self.sourceRevision = sourceRevision
    }
}

// MARK: CatalogFileReplaceResponse convenience initializers and mutators

public extension CatalogFileReplaceResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CatalogFileReplaceResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        mediaInfo: CatalogMediaInfo?? = nil,
        mediaInspectedRevision: Int? = nil,
        mimeType: String? = nil,
        modtime: Int? = nil,
        nodeID: Int? = nil,
        size: Int? = nil,
        sourceRevision: Int? = nil
    ) -> CatalogFileReplaceResponse {
        return CatalogFileReplaceResponse(
            mediaInfo: mediaInfo ?? self.mediaInfo,
            mediaInspectedRevision: mediaInspectedRevision ?? self.mediaInspectedRevision,
            mimeType: mimeType ?? self.mimeType,
            modtime: modtime ?? self.modtime,
            nodeID: nodeID ?? self.nodeID,
            size: size ?? self.size,
            sourceRevision: sourceRevision ?? self.sourceRevision
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Compact media track summary stored on catalog nodes.
// MARK: - CatalogMediaInfo
public struct CatalogMediaInfo: Codable {
    public let a: Int
    public let c: String?
    public let f: Bool?
    public let k: CatalogMediaKind
    public let m: String?
    public let s: CatalogMediaStreamingMetadata?
    public let v: Int

    public enum CodingKeys: String, CodingKey {
        case a = "a"
        case c = "c"
        case f = "f"
        case k = "k"
        case m = "m"
        case s = "s"
        case v = "v"
    }

    public init(a: Int, c: String?, f: Bool?, k: CatalogMediaKind, m: String?, s: CatalogMediaStreamingMetadata?, v: Int) {
        self.a = a
        self.c = c
        self.f = f
        self.k = k
        self.m = m
        self.s = s
        self.v = v
    }
}

// MARK: CatalogMediaInfo convenience initializers and mutators

public extension CatalogMediaInfo {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CatalogMediaInfo.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        a: Int? = nil,
        c: String?? = nil,
        f: Bool?? = nil,
        k: CatalogMediaKind? = nil,
        m: String?? = nil,
        s: CatalogMediaStreamingMetadata?? = nil,
        v: Int? = nil
    ) -> CatalogMediaInfo {
        return CatalogMediaInfo(
            a: a ?? self.a,
            c: c ?? self.c,
            f: f ?? self.f,
            k: k ?? self.k,
            m: m ?? self.m,
            s: s ?? self.s,
            v: v ?? self.v
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Catalog-backed media classification.
public enum CatalogMediaKind: String, Codable {
    case audio = "audio"
    case video = "video"
}

/// Optional streamability and startup-budget metadata for media playback.
// MARK: - CatalogMediaStreamingMetadata
public struct CatalogMediaStreamingMetadata: Codable {
    public let b: Int?
    public let d: Int?
    public let g: [CatalogMediaSegmentRange]?
    public let h: Int?
    public let i: CatalogMediaByteRange?
    public let o: Bool?
    public let p: Int?
    public let w: Int?

    public enum CodingKeys: String, CodingKey {
        case b = "b"
        case d = "d"
        case g = "g"
        case h = "h"
        case i = "i"
        case o = "o"
        case p = "p"
        case w = "w"
    }

    public init(b: Int?, d: Int?, g: [CatalogMediaSegmentRange]?, h: Int?, i: CatalogMediaByteRange?, o: Bool?, p: Int?, w: Int?) {
        self.b = b
        self.d = d
        self.g = g
        self.h = h
        self.i = i
        self.o = o
        self.p = p
        self.w = w
    }
}

// MARK: CatalogMediaStreamingMetadata convenience initializers and mutators

public extension CatalogMediaStreamingMetadata {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CatalogMediaStreamingMetadata.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        b: Int?? = nil,
        d: Int?? = nil,
        g: [CatalogMediaSegmentRange]?? = nil,
        h: Int?? = nil,
        i: CatalogMediaByteRange?? = nil,
        o: Bool?? = nil,
        p: Int?? = nil,
        w: Int?? = nil
    ) -> CatalogMediaStreamingMetadata {
        return CatalogMediaStreamingMetadata(
            b: b ?? self.b,
            d: d ?? self.d,
            g: g ?? self.g,
            h: h ?? self.h,
            i: i ?? self.i,
            o: o ?? self.o,
            p: p ?? self.p,
            w: w ?? self.w
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CatalogMediaSegmentRange
public struct CatalogMediaSegmentRange: Codable {
    public let l: Int
    public let o: Int
    public let t: Int

    public enum CodingKeys: String, CodingKey {
        case l = "l"
        case o = "o"
        case t = "t"
    }

    public init(l: Int, o: Int, t: Int) {
        self.l = l
        self.o = o
        self.t = t
    }
}

// MARK: CatalogMediaSegmentRange convenience initializers and mutators

public extension CatalogMediaSegmentRange {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CatalogMediaSegmentRange.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        l: Int? = nil,
        o: Int? = nil,
        t: Int? = nil
    ) -> CatalogMediaSegmentRange {
        return CatalogMediaSegmentRange(
            l: l ?? self.l,
            o: o ?? self.o,
            t: t ?? self.t
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CatalogMediaByteRange
public struct CatalogMediaByteRange: Codable {
    public let l: Int
    public let o: Int

    public enum CodingKeys: String, CodingKey {
        case l = "l"
        case o = "o"
    }

    public init(l: Int, o: Int) {
        self.l = l
        self.o = o
    }
}

// MARK: CatalogMediaByteRange convenience initializers and mutators

public extension CatalogMediaByteRange {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CatalogMediaByteRange.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        l: Int? = nil,
        o: Int? = nil
    ) -> CatalogMediaByteRange {
        return CatalogMediaByteRange(
            l: l ?? self.l,
            o: o ?? self.o
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Atomic creation payload shared by the existing RPC and generated native facade.
// MARK: - PassmanagerEntryCreateRequest
public struct PassmanagerEntryCreateRequest: Codable {
    public let createdTs: Int?
    public let entryID: String
    public let entryType: String
    public let groupPath: String?
    public let iconRef: String?
    public let otps: JSONAny?
    public let paymentCard: JSONAny?
    public let secrets: PassmanagerEntryCreateSecrets
    public let tagKeys: [String]?
    public let tags: [String]?
    /// Blank for a payment card: Core names it from its network and last four digits
    /// (`Visa •••• 1111`), numbered if that name is taken in the group.
    public let title: String
    public let updatedTs: Int?
    public let urls: JSONAny?
    public let username: String?

    public enum CodingKeys: String, CodingKey {
        case createdTs = "created_ts"
        case entryID = "entry_id"
        case entryType = "entry_type"
        case groupPath = "group_path"
        case iconRef = "icon_ref"
        case otps = "otps"
        case paymentCard = "payment_card"
        case secrets = "secrets"
        case tagKeys = "tag_keys"
        case tags = "tags"
        case title = "title"
        case updatedTs = "updated_ts"
        case urls = "urls"
        case username = "username"
    }

    public init(createdTs: Int?, entryID: String, entryType: String, groupPath: String?, iconRef: String?, otps: JSONAny?, paymentCard: JSONAny?, secrets: PassmanagerEntryCreateSecrets, tagKeys: [String]?, tags: [String]?, title: String, updatedTs: Int?, urls: JSONAny?, username: String?) {
        self.createdTs = createdTs
        self.entryID = entryID
        self.entryType = entryType
        self.groupPath = groupPath
        self.iconRef = iconRef
        self.otps = otps
        self.paymentCard = paymentCard
        self.secrets = secrets
        self.tagKeys = tagKeys
        self.tags = tags
        self.title = title
        self.updatedTs = updatedTs
        self.urls = urls
        self.username = username
    }
}

// MARK: PassmanagerEntryCreateRequest convenience initializers and mutators

public extension PassmanagerEntryCreateRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerEntryCreateRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        createdTs: Int?? = nil,
        entryID: String? = nil,
        entryType: String? = nil,
        groupPath: String?? = nil,
        iconRef: String?? = nil,
        otps: JSONAny?? = nil,
        paymentCard: JSONAny?? = nil,
        secrets: PassmanagerEntryCreateSecrets? = nil,
        tagKeys: [String]?? = nil,
        tags: [String]?? = nil,
        title: String? = nil,
        updatedTs: Int?? = nil,
        urls: JSONAny?? = nil,
        username: String?? = nil
    ) -> PassmanagerEntryCreateRequest {
        return PassmanagerEntryCreateRequest(
            createdTs: createdTs ?? self.createdTs,
            entryID: entryID ?? self.entryID,
            entryType: entryType ?? self.entryType,
            groupPath: groupPath ?? self.groupPath,
            iconRef: iconRef ?? self.iconRef,
            otps: otps ?? self.otps,
            paymentCard: paymentCard ?? self.paymentCard,
            secrets: secrets ?? self.secrets,
            tagKeys: tagKeys ?? self.tagKeys,
            tags: tags ?? self.tags,
            title: title ?? self.title,
            updatedTs: updatedTs ?? self.updatedTs,
            urls: urls ?? self.urls,
            username: username ?? self.username
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerEntryCreateSecrets
public struct PassmanagerEntryCreateSecrets: Codable {
    public let cardCvv: String?
    public let cardPan: String?
    public let note: String?
    public let password: String?

    public enum CodingKeys: String, CodingKey {
        case cardCvv = "card_cvv"
        case cardPan = "card_pan"
        case note = "note"
        case password = "password"
    }

    public init(cardCvv: String?, cardPan: String?, note: String?, password: String?) {
        self.cardCvv = cardCvv
        self.cardPan = cardPan
        self.note = note
        self.password = password
    }
}

// MARK: PassmanagerEntryCreateSecrets convenience initializers and mutators

public extension PassmanagerEntryCreateSecrets {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerEntryCreateSecrets.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        cardCvv: String?? = nil,
        cardPan: String?? = nil,
        note: String?? = nil,
        password: String?? = nil
    ) -> PassmanagerEntryCreateSecrets {
        return PassmanagerEntryCreateSecrets(
            cardCvv: cardCvv ?? self.cardCvv,
            cardPan: cardPan ?? self.cardPan,
            note: note ?? self.note,
            password: password ?? self.password
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerEntryListResponse
public struct PassmanagerEntryListResponse: Codable {
    public let entries: [JSONAny]
    public let folders: [String]

    public enum CodingKeys: String, CodingKey {
        case entries = "entries"
        case folders = "folders"
    }

    public init(entries: [JSONAny], folders: [String]) {
        self.entries = entries
        self.folders = folders
    }
}

// MARK: PassmanagerEntryListResponse convenience initializers and mutators

public extension PassmanagerEntryListResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerEntryListResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        entries: [JSONAny]? = nil,
        folders: [String]? = nil
    ) -> PassmanagerEntryListResponse {
        return PassmanagerEntryListResponse(
            entries: entries ?? self.entries,
            folders: folders ?? self.folders
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Offset refers to the requested stable order (catalog node order when sort is omitted),
/// not the number of matches.
/// Callers must restart at zero when the authorized catalog is invalidated.
// MARK: - PassmanagerEntryPageResponse
public struct PassmanagerEntryPageResponse: Codable {
    public let entries: [CredentialSummary]
    public let nextOffset: Int?
    /// Matching entries in the whole scope. Present for sorted or grouped requests, which read
    /// the scope completely; absent in catalog order, where reading stops at the page.
    public let totalCount: Int?

    public enum CodingKeys: String, CodingKey {
        case entries = "entries"
        case nextOffset = "next_offset"
        case totalCount = "total_count"
    }

    public init(entries: [CredentialSummary], nextOffset: Int?, totalCount: Int?) {
        self.entries = entries
        self.nextOffset = nextOffset
        self.totalCount = totalCount
    }
}

// MARK: PassmanagerEntryPageResponse convenience initializers and mutators

public extension PassmanagerEntryPageResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerEntryPageResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        entries: [CredentialSummary]? = nil,
        nextOffset: Int?? = nil,
        totalCount: Int?? = nil
    ) -> PassmanagerEntryPageResponse {
        return PassmanagerEntryPageResponse(
            entries: entries ?? self.entries,
            nextOffset: nextOffset ?? self.nextOffset,
            totalCount: totalCount ?? self.totalCount
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Bounded projection for catalog clients. Secret values and arbitrary metadata are excluded.
// MARK: - CredentialSummary
public struct CredentialSummary: Codable {
    public let entryType: String
    /// Present only for grouped catalog requests; translated by the native presentation owner.
    public let groupKey: String?
    public let groupPath: String
    /// `true` when the entry carries one-time code records; omitted otherwise.
    public let hasCodes: Bool?
    /// Digest of the entry icon in the vault icon store, when the entry has one.
    public let iconRef: String?
    public let id: String
    public let title: String
    public let username: String
    /// Host of the first website of the entry, for the catalog row.
    public let website: String?

    public enum CodingKeys: String, CodingKey {
        case entryType = "entry_type"
        case groupKey = "group_key"
        case groupPath = "group_path"
        case hasCodes = "has_codes"
        case iconRef = "icon_ref"
        case id = "id"
        case title = "title"
        case username = "username"
        case website = "website"
    }

    public init(entryType: String, groupKey: String?, groupPath: String, hasCodes: Bool?, iconRef: String?, id: String, title: String, username: String, website: String?) {
        self.entryType = entryType
        self.groupKey = groupKey
        self.groupPath = groupPath
        self.hasCodes = hasCodes
        self.iconRef = iconRef
        self.id = id
        self.title = title
        self.username = username
        self.website = website
    }
}

// MARK: CredentialSummary convenience initializers and mutators

public extension CredentialSummary {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CredentialSummary.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        entryType: String? = nil,
        groupKey: String?? = nil,
        groupPath: String? = nil,
        hasCodes: Bool?? = nil,
        iconRef: String?? = nil,
        id: String? = nil,
        title: String? = nil,
        username: String? = nil,
        website: String?? = nil
    ) -> CredentialSummary {
        return CredentialSummary(
            entryType: entryType ?? self.entryType,
            groupKey: groupKey ?? self.groupKey,
            groupPath: groupPath ?? self.groupPath,
            hasCodes: hasCodes ?? self.hasCodes,
            iconRef: iconRef ?? self.iconRef,
            id: id ?? self.id,
            title: title ?? self.title,
            username: username ?? self.username,
            website: website ?? self.website
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerEntryPageRequest
public struct PassmanagerEntryPageRequest: Codable {
    public let descending: Bool?
    public let entryType: String?
    public let groupBy: String?
    public let groupPath: String?
    /// Fixed milliseconds since epoch for modification-time grouping across pages.
    public let groupingTime: Int?
    public let limit: Int
    public let offset: Int
    public let query: String
    /// AND-combined metadata filters: recent (14 days), otp, ssh.
    public let quickFilters: [String]?
    public let sort: String?
    public let tagKey: String?

    public enum CodingKeys: String, CodingKey {
        case descending = "descending"
        case entryType = "entry_type"
        case groupBy = "group_by"
        case groupPath = "group_path"
        case groupingTime = "grouping_time"
        case limit = "limit"
        case offset = "offset"
        case query = "query"
        case quickFilters = "quick_filters"
        case sort = "sort"
        case tagKey = "tag_key"
    }

    public init(descending: Bool?, entryType: String?, groupBy: String?, groupPath: String?, groupingTime: Int?, limit: Int, offset: Int, query: String, quickFilters: [String]?, sort: String?, tagKey: String?) {
        self.descending = descending
        self.entryType = entryType
        self.groupBy = groupBy
        self.groupPath = groupPath
        self.groupingTime = groupingTime
        self.limit = limit
        self.offset = offset
        self.query = query
        self.quickFilters = quickFilters
        self.sort = sort
        self.tagKey = tagKey
    }
}

// MARK: PassmanagerEntryPageRequest convenience initializers and mutators

public extension PassmanagerEntryPageRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerEntryPageRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        descending: Bool?? = nil,
        entryType: String?? = nil,
        groupBy: String?? = nil,
        groupPath: String?? = nil,
        groupingTime: Int?? = nil,
        limit: Int? = nil,
        offset: Int? = nil,
        query: String? = nil,
        quickFilters: [String]?? = nil,
        sort: String?? = nil,
        tagKey: String?? = nil
    ) -> PassmanagerEntryPageRequest {
        return PassmanagerEntryPageRequest(
            descending: descending ?? self.descending,
            entryType: entryType ?? self.entryType,
            groupBy: groupBy ?? self.groupBy,
            groupPath: groupPath ?? self.groupPath,
            groupingTime: groupingTime ?? self.groupingTime,
            limit: limit ?? self.limit,
            offset: offset ?? self.offset,
            query: query ?? self.query,
            quickFilters: quickFilters ?? self.quickFilters,
            sort: sort ?? self.sort,
            tagKey: tagKey ?? self.tagKey
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerEntrySaveResponse
public struct PassmanagerEntrySaveResponse: Codable {
    public let entryID: String

    public enum CodingKeys: String, CodingKey {
        case entryID = "entry_id"
    }

    public init(entryID: String) {
        self.entryID = entryID
    }
}

// MARK: PassmanagerEntrySaveResponse convenience initializers and mutators

public extension PassmanagerEntrySaveResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerEntrySaveResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        entryID: String? = nil
    ) -> PassmanagerEntrySaveResponse {
        return PassmanagerEntrySaveResponse(
            entryID: entryID ?? self.entryID
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Error RPC response
// MARK: - RPCError
public struct RPCError: Codable {
    /// Optional error code
    public let code: String?
    /// Error message
    public let error: String
    /// Always false for error
    public let ok: Bool

    public enum CodingKeys: String, CodingKey {
        case code = "code"
        case error = "error"
        case ok = "ok"
    }

    public init(code: String?, error: String, ok: Bool) {
        self.code = code
        self.error = error
        self.ok = ok
    }
}

// MARK: RPCError convenience initializers and mutators

public extension RPCError {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(RPCError.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        code: String?? = nil,
        error: String? = nil,
        ok: Bool? = nil
    ) -> RPCError {
        return RPCError(
            code: code ?? self.code,
            error: error ?? self.error,
            ok: ok ?? self.ok
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Backend-authoritative source metadata for derivative identity.
// MARK: - SourceMetadataResponse
public struct SourceMetadataResponse: Codable {
    public let mediaInfo: CatalogMediaInfo?
    public let mediaInspectedRevision: Int
    public let mimeType: String?
    public let name: String
    public let nodeID: Int
    public let nodeType: Int
    public let size: Int
    public let sourceRevision: Int
    public let sourceRevisionInitialized: Bool?

    public enum CodingKeys: String, CodingKey {
        case mediaInfo = "media_info"
        case mediaInspectedRevision = "media_inspected_revision"
        case mimeType = "mime_type"
        case name = "name"
        case nodeID = "node_id"
        case nodeType = "node_type"
        case size = "size"
        case sourceRevision = "source_revision"
        case sourceRevisionInitialized = "source_revision_initialized"
    }

    public init(mediaInfo: CatalogMediaInfo?, mediaInspectedRevision: Int, mimeType: String?, name: String, nodeID: Int, nodeType: Int, size: Int, sourceRevision: Int, sourceRevisionInitialized: Bool?) {
        self.mediaInfo = mediaInfo
        self.mediaInspectedRevision = mediaInspectedRevision
        self.mimeType = mimeType
        self.name = name
        self.nodeID = nodeID
        self.nodeType = nodeType
        self.size = size
        self.sourceRevision = sourceRevision
        self.sourceRevisionInitialized = sourceRevisionInitialized
    }
}

// MARK: SourceMetadataResponse convenience initializers and mutators

public extension SourceMetadataResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(SourceMetadataResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        mediaInfo: CatalogMediaInfo?? = nil,
        mediaInspectedRevision: Int? = nil,
        mimeType: String?? = nil,
        name: String? = nil,
        nodeID: Int? = nil,
        nodeType: Int? = nil,
        size: Int? = nil,
        sourceRevision: Int? = nil,
        sourceRevisionInitialized: Bool?? = nil
    ) -> SourceMetadataResponse {
        return SourceMetadataResponse(
            mediaInfo: mediaInfo ?? self.mediaInfo,
            mediaInspectedRevision: mediaInspectedRevision ?? self.mediaInspectedRevision,
            mimeType: mimeType ?? self.mimeType,
            name: name ?? self.name,
            nodeID: nodeID ?? self.nodeID,
            nodeType: nodeType ?? self.nodeType,
            size: size ?? self.size,
            sourceRevision: sourceRevision ?? self.sourceRevision,
            sourceRevisionInitialized: sourceRevisionInitialized ?? self.sourceRevisionInitialized
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Upload response
// MARK: - UploadResponse
public struct UploadResponse: Codable {
    public let completed: Bool
    public let created: Bool
    public let mediaInfo: CatalogMediaInfo?
    public let mediaInspectedRevision: Int?
    public let mimeType: String?
    public let modtime: Int?
    public let nodeID: Int
    public let size: Int?
    public let sourceRevision: Int?
    public let uploadedBytes: Int

    public enum CodingKeys: String, CodingKey {
        case completed = "completed"
        case created = "created"
        case mediaInfo = "media_info"
        case mediaInspectedRevision = "media_inspected_revision"
        case mimeType = "mime_type"
        case modtime = "modtime"
        case nodeID = "node_id"
        case size = "size"
        case sourceRevision = "source_revision"
        case uploadedBytes = "uploaded_bytes"
    }

    public init(completed: Bool, created: Bool, mediaInfo: CatalogMediaInfo?, mediaInspectedRevision: Int?, mimeType: String?, modtime: Int?, nodeID: Int, size: Int?, sourceRevision: Int?, uploadedBytes: Int) {
        self.completed = completed
        self.created = created
        self.mediaInfo = mediaInfo
        self.mediaInspectedRevision = mediaInspectedRevision
        self.mimeType = mimeType
        self.modtime = modtime
        self.nodeID = nodeID
        self.size = size
        self.sourceRevision = sourceRevision
        self.uploadedBytes = uploadedBytes
    }
}

// MARK: UploadResponse convenience initializers and mutators

public extension UploadResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(UploadResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        completed: Bool? = nil,
        created: Bool? = nil,
        mediaInfo: CatalogMediaInfo?? = nil,
        mediaInspectedRevision: Int?? = nil,
        mimeType: String?? = nil,
        modtime: Int?? = nil,
        nodeID: Int? = nil,
        size: Int?? = nil,
        sourceRevision: Int?? = nil,
        uploadedBytes: Int? = nil
    ) -> UploadResponse {
        return UploadResponse(
            completed: completed ?? self.completed,
            created: created ?? self.created,
            mediaInfo: mediaInfo ?? self.mediaInfo,
            mediaInspectedRevision: mediaInspectedRevision ?? self.mediaInspectedRevision,
            mimeType: mimeType ?? self.mimeType,
            modtime: modtime ?? self.modtime,
            nodeID: nodeID ?? self.nodeID,
            size: size ?? self.size,
            sourceRevision: sourceRevision ?? self.sourceRevision,
            uploadedBytes: uploadedBytes ?? self.uploadedBytes
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CatalogFolderPageResponse
public struct CatalogFolderPageResponse: Codable {
    public let currentPath: String
    public let filterCounts: CatalogFolderFilterCounts
    public let items: [CatalogListItem]
    public let limit: Int
    public let nextOffset: Int?
    public let offset: Int
    public let reloadRequired: Bool
    public let totalCount: Int
    public let version: Int

    public enum CodingKeys: String, CodingKey {
        case currentPath = "current_path"
        case filterCounts = "filter_counts"
        case items = "items"
        case limit = "limit"
        case nextOffset = "next_offset"
        case offset = "offset"
        case reloadRequired = "reload_required"
        case totalCount = "total_count"
        case version = "version"
    }

    public init(currentPath: String, filterCounts: CatalogFolderFilterCounts, items: [CatalogListItem], limit: Int, nextOffset: Int?, offset: Int, reloadRequired: Bool, totalCount: Int, version: Int) {
        self.currentPath = currentPath
        self.filterCounts = filterCounts
        self.items = items
        self.limit = limit
        self.nextOffset = nextOffset
        self.offset = offset
        self.reloadRequired = reloadRequired
        self.totalCount = totalCount
        self.version = version
    }
}

// MARK: CatalogFolderPageResponse convenience initializers and mutators

public extension CatalogFolderPageResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CatalogFolderPageResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        currentPath: String? = nil,
        filterCounts: CatalogFolderFilterCounts? = nil,
        items: [CatalogListItem]? = nil,
        limit: Int? = nil,
        nextOffset: Int?? = nil,
        offset: Int? = nil,
        reloadRequired: Bool? = nil,
        totalCount: Int? = nil,
        version: Int? = nil
    ) -> CatalogFolderPageResponse {
        return CatalogFolderPageResponse(
            currentPath: currentPath ?? self.currentPath,
            filterCounts: filterCounts ?? self.filterCounts,
            items: items ?? self.items,
            limit: limit ?? self.limit,
            nextOffset: nextOffset ?? self.nextOffset,
            offset: offset ?? self.offset,
            reloadRequired: reloadRequired ?? self.reloadRequired,
            totalCount: totalCount ?? self.totalCount,
            version: version ?? self.version
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CatalogFolderFilterCounts
public struct CatalogFolderFilterCounts: Codable {
    public let all: Int
    public let images: Int
    public let markdown: Int

    public enum CodingKeys: String, CodingKey {
        case all = "all"
        case images = "images"
        case markdown = "markdown"
    }

    public init(all: Int, images: Int, markdown: Int) {
        self.all = all
        self.images = images
        self.markdown = markdown
    }
}

// MARK: CatalogFolderFilterCounts convenience initializers and mutators

public extension CatalogFolderFilterCounts {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CatalogFolderFilterCounts.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        all: Int? = nil,
        images: Int? = nil,
        markdown: Int? = nil
    ) -> CatalogFolderFilterCounts {
        return CatalogFolderFilterCounts(
            all: all ?? self.all,
            images: images ?? self.images,
            markdown: markdown ?? self.markdown
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Catalog list item
// MARK: - CatalogListItem
public struct CatalogListItem: Codable {
    public let createdAt: Int
    public let isDir: Bool
    public let mediaInfo: CatalogMediaInfo?
    public let mediaInspectedRevision: Int
    public let mimeType: String?
    public let name: String
    public let nodeID: Int
    public let parentPath: String?
    public let path: String?
    public let size: Int?
    public let sourceRevision: Int
    public let updatedAt: Int

    public enum CodingKeys: String, CodingKey {
        case createdAt = "created_at"
        case isDir = "is_dir"
        case mediaInfo = "media_info"
        case mediaInspectedRevision = "media_inspected_revision"
        case mimeType = "mime_type"
        case name = "name"
        case nodeID = "node_id"
        case parentPath = "parent_path"
        case path = "path"
        case size = "size"
        case sourceRevision = "source_revision"
        case updatedAt = "updated_at"
    }

    public init(createdAt: Int, isDir: Bool, mediaInfo: CatalogMediaInfo?, mediaInspectedRevision: Int, mimeType: String?, name: String, nodeID: Int, parentPath: String?, path: String?, size: Int?, sourceRevision: Int, updatedAt: Int) {
        self.createdAt = createdAt
        self.isDir = isDir
        self.mediaInfo = mediaInfo
        self.mediaInspectedRevision = mediaInspectedRevision
        self.mimeType = mimeType
        self.name = name
        self.nodeID = nodeID
        self.parentPath = parentPath
        self.path = path
        self.size = size
        self.sourceRevision = sourceRevision
        self.updatedAt = updatedAt
    }
}

// MARK: CatalogListItem convenience initializers and mutators

public extension CatalogListItem {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CatalogListItem.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        createdAt: Int? = nil,
        isDir: Bool? = nil,
        mediaInfo: CatalogMediaInfo?? = nil,
        mediaInspectedRevision: Int? = nil,
        mimeType: String?? = nil,
        name: String? = nil,
        nodeID: Int? = nil,
        parentPath: String?? = nil,
        path: String?? = nil,
        size: Int?? = nil,
        sourceRevision: Int? = nil,
        updatedAt: Int? = nil
    ) -> CatalogListItem {
        return CatalogListItem(
            createdAt: createdAt ?? self.createdAt,
            isDir: isDir ?? self.isDir,
            mediaInfo: mediaInfo ?? self.mediaInfo,
            mediaInspectedRevision: mediaInspectedRevision ?? self.mediaInspectedRevision,
            mimeType: mimeType ?? self.mimeType,
            name: name ?? self.name,
            nodeID: nodeID ?? self.nodeID,
            parentPath: parentPath ?? self.parentPath,
            path: path ?? self.path,
            size: size ?? self.size,
            sourceRevision: sourceRevision ?? self.sourceRevision,
            updatedAt: updatedAt ?? self.updatedAt
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CatalogFolderPageRequest
public struct CatalogFolderPageRequest: Codable {
    public let expectedVersion: Int?
    public let filter: CatalogFolderFilter?
    public let limit: Int?
    public let offset: Int?
    public let path: String?
    public let sort: CatalogFolderSort?

    public enum CodingKeys: String, CodingKey {
        case expectedVersion = "expected_version"
        case filter = "filter"
        case limit = "limit"
        case offset = "offset"
        case path = "path"
        case sort = "sort"
    }

    public init(expectedVersion: Int?, filter: CatalogFolderFilter?, limit: Int?, offset: Int?, path: String?, sort: CatalogFolderSort?) {
        self.expectedVersion = expectedVersion
        self.filter = filter
        self.limit = limit
        self.offset = offset
        self.path = path
        self.sort = sort
    }
}

// MARK: CatalogFolderPageRequest convenience initializers and mutators

public extension CatalogFolderPageRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CatalogFolderPageRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        expectedVersion: Int?? = nil,
        filter: CatalogFolderFilter?? = nil,
        limit: Int?? = nil,
        offset: Int?? = nil,
        path: String?? = nil,
        sort: CatalogFolderSort?? = nil
    ) -> CatalogFolderPageRequest {
        return CatalogFolderPageRequest(
            expectedVersion: expectedVersion ?? self.expectedVersion,
            filter: filter ?? self.filter,
            limit: limit ?? self.limit,
            offset: offset ?? self.offset,
            path: path ?? self.path,
            sort: sort ?? self.sort
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CatalogFolderFilter
public struct CatalogFolderFilter: Codable {
    public let fileTypes: [String]?
    public let includeHidden: Bool?
    public let includeTextContent: Bool?
    public let query: String?
    public let recursive: Bool?

    public enum CodingKeys: String, CodingKey {
        case fileTypes = "file_types"
        case includeHidden = "include_hidden"
        case includeTextContent = "include_text_content"
        case query = "query"
        case recursive = "recursive"
    }

    public init(fileTypes: [String]?, includeHidden: Bool?, includeTextContent: Bool?, query: String?, recursive: Bool?) {
        self.fileTypes = fileTypes
        self.includeHidden = includeHidden
        self.includeTextContent = includeTextContent
        self.query = query
        self.recursive = recursive
    }
}

// MARK: CatalogFolderFilter convenience initializers and mutators

public extension CatalogFolderFilter {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CatalogFolderFilter.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        fileTypes: [String]?? = nil,
        includeHidden: Bool?? = nil,
        includeTextContent: Bool?? = nil,
        query: String?? = nil,
        recursive: Bool?? = nil
    ) -> CatalogFolderFilter {
        return CatalogFolderFilter(
            fileTypes: fileTypes ?? self.fileTypes,
            includeHidden: includeHidden ?? self.includeHidden,
            includeTextContent: includeTextContent ?? self.includeTextContent,
            query: query ?? self.query,
            recursive: recursive ?? self.recursive
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CatalogFolderSort
public struct CatalogFolderSort: Codable {
    public let by: String
    public let direction: String

    public enum CodingKeys: String, CodingKey {
        case by = "by"
        case direction = "direction"
    }

    public init(by: String, direction: String) {
        self.by = by
        self.direction = direction
    }
}

// MARK: CatalogFolderSort convenience initializers and mutators

public extension CatalogFolderSort {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CatalogFolderSort.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        by: String? = nil,
        direction: String? = nil
    ) -> CatalogFolderSort {
        return CatalogFolderSort(
            by: by ?? self.by,
            direction: direction ?? self.direction
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerGroupPageResponse
public struct PassmanagerGroupPageResponse: Codable {
    public let groups: [PassmanagerGroupSummary]
    public let nextOffset: Int?
    public let parent: String

    public enum CodingKeys: String, CodingKey {
        case groups = "groups"
        case nextOffset = "next_offset"
        case parent = "parent"
    }

    public init(groups: [PassmanagerGroupSummary], nextOffset: Int?, parent: String) {
        self.groups = groups
        self.nextOffset = nextOffset
        self.parent = parent
    }
}

// MARK: PassmanagerGroupPageResponse convenience initializers and mutators

public extension PassmanagerGroupPageResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerGroupPageResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        groups: [PassmanagerGroupSummary]? = nil,
        nextOffset: Int?? = nil,
        parent: String? = nil
    ) -> PassmanagerGroupPageResponse {
        return PassmanagerGroupPageResponse(
            groups: groups ?? self.groups,
            nextOffset: nextOffset ?? self.nextOffset,
            parent: parent ?? self.parent
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerGroupSummary
public struct PassmanagerGroupSummary: Codable {
    public let entryCount: Int
    public let path: String

    public enum CodingKeys: String, CodingKey {
        case entryCount = "entry_count"
        case path = "path"
    }

    public init(entryCount: Int, path: String) {
        self.entryCount = entryCount
        self.path = path
    }
}

// MARK: PassmanagerGroupSummary convenience initializers and mutators

public extension PassmanagerGroupSummary {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerGroupSummary.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        entryCount: Int? = nil,
        path: String? = nil
    ) -> PassmanagerGroupSummary {
        return PassmanagerGroupSummary(
            entryCount: entryCount ?? self.entryCount,
            path: path ?? self.path
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Immediate children of an existing group, bounded for native metadata transport.
// MARK: - PassmanagerGroupPageRequest
public struct PassmanagerGroupPageRequest: Codable {
    public let limit: Int
    public let offset: Int
    public let parent: String

    public enum CodingKeys: String, CodingKey {
        case limit = "limit"
        case offset = "offset"
        case parent = "parent"
    }

    public init(limit: Int, offset: Int, parent: String) {
        self.limit = limit
        self.offset = offset
        self.parent = parent
    }
}

// MARK: PassmanagerGroupPageRequest convenience initializers and mutators

public extension PassmanagerGroupPageRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerGroupPageRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        limit: Int? = nil,
        offset: Int? = nil,
        parent: String? = nil
    ) -> PassmanagerGroupPageRequest {
        return PassmanagerGroupPageRequest(
            limit: limit ?? self.limit,
            offset: offset ?? self.offset,
            parent: parent ?? self.parent
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerGroupRenameRequest
public struct PassmanagerGroupRenameRequest: Codable {
    public let name: String
    public let path: String

    public enum CodingKeys: String, CodingKey {
        case name = "name"
        case path = "path"
    }

    public init(name: String, path: String) {
        self.name = name
        self.path = path
    }
}

// MARK: PassmanagerGroupRenameRequest convenience initializers and mutators

public extension PassmanagerGroupRenameRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerGroupRenameRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        name: String? = nil,
        path: String? = nil
    ) -> PassmanagerGroupRenameRequest {
        return PassmanagerGroupRenameRequest(
            name: name ?? self.name,
            path: path ?? self.path
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Response of `passmanager:icon:getMany`: the icons found and the digests that are not
/// stored.
// MARK: - PassmanagerIconGetManyResponse
public struct PassmanagerIconGetManyResponse: Codable {
    public let icons: [PassmanagerIconRecord]
    public let missingIconRefs: [String]

    public enum CodingKeys: String, CodingKey {
        case icons = "icons"
        case missingIconRefs = "missing_icon_refs"
    }

    public init(icons: [PassmanagerIconRecord], missingIconRefs: [String]) {
        self.icons = icons
        self.missingIconRefs = missingIconRefs
    }
}

// MARK: PassmanagerIconGetManyResponse convenience initializers and mutators

public extension PassmanagerIconGetManyResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerIconGetManyResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        icons: [PassmanagerIconRecord]? = nil,
        missingIconRefs: [String]? = nil
    ) -> PassmanagerIconGetManyResponse {
        return PassmanagerIconGetManyResponse(
            icons: icons ?? self.icons,
            missingIconRefs: missingIconRefs ?? self.missingIconRefs
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// One stored icon: the normalized image bytes and their type.
// MARK: - PassmanagerIconRecord
public struct PassmanagerIconRecord: Codable {
    public let backgroundColor: String?
    public let contentBase64: String
    public let iconRef: String
    public let mimeType: String

    public enum CodingKeys: String, CodingKey {
        case backgroundColor = "background_color"
        case contentBase64 = "content_base64"
        case iconRef = "icon_ref"
        case mimeType = "mime_type"
    }

    public init(backgroundColor: String?, contentBase64: String, iconRef: String, mimeType: String) {
        self.backgroundColor = backgroundColor
        self.contentBase64 = contentBase64
        self.iconRef = iconRef
        self.mimeType = mimeType
    }
}

// MARK: PassmanagerIconRecord convenience initializers and mutators

public extension PassmanagerIconRecord {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerIconRecord.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        backgroundColor: String?? = nil,
        contentBase64: String? = nil,
        iconRef: String? = nil,
        mimeType: String? = nil
    ) -> PassmanagerIconRecord {
        return PassmanagerIconRecord(
            backgroundColor: backgroundColor ?? self.backgroundColor,
            contentBase64: contentBase64 ?? self.contentBase64,
            iconRef: iconRef ?? self.iconRef,
            mimeType: mimeType ?? self.mimeType
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Request of `passmanager:icon:getMany`: the icon digests to load, at most 64 per call.
// MARK: - PassmanagerIconGetManyRequest
public struct PassmanagerIconGetManyRequest: Codable {
    public let iconRefs: [String]

    public enum CodingKeys: String, CodingKey {
        case iconRefs = "icon_refs"
    }

    public init(iconRefs: [String]) {
        self.iconRefs = iconRefs
    }
}

// MARK: PassmanagerIconGetManyRequest convenience initializers and mutators

public extension PassmanagerIconGetManyRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerIconGetManyRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        iconRefs: [String]? = nil
    ) -> PassmanagerIconGetManyRequest {
        return PassmanagerIconGetManyRequest(
            iconRefs: iconRefs ?? self.iconRefs
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Pure, transient presentation data. IDs index `nodes`; children always follow parents.
// MARK: - MarkdownDocument
public struct MarkdownDocument: Codable {
    public let nodes: [MarkdownNode]
    public let roots: [Int]
    public let sourceDigest: String

    public enum CodingKeys: String, CodingKey {
        case nodes = "nodes"
        case roots = "roots"
        case sourceDigest = "source_digest"
    }

    public init(nodes: [MarkdownNode], roots: [Int], sourceDigest: String) {
        self.nodes = nodes
        self.roots = roots
        self.sourceDigest = sourceDigest
    }
}

// MARK: MarkdownDocument convenience initializers and mutators

public extension MarkdownDocument {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(MarkdownDocument.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        nodes: [MarkdownNode]? = nil,
        roots: [Int]? = nil,
        sourceDigest: String? = nil
    ) -> MarkdownDocument {
        return MarkdownDocument(
            nodes: nodes ?? self.nodes,
            roots: roots ?? self.roots,
            sourceDigest: sourceDigest ?? self.sourceDigest
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - MarkdownNode
public struct MarkdownNode: Codable {
    public let children: [Int]
    public let content: MarkdownContent
    public let end: Int
    public let start: Int

    public enum CodingKeys: String, CodingKey {
        case children = "children"
        case content = "content"
        case end = "end"
        case start = "start"
    }

    public init(children: [Int], content: MarkdownContent, end: Int, start: Int) {
        self.children = children
        self.content = content
        self.end = end
        self.start = start
    }
}

// MARK: MarkdownNode convenience initializers and mutators

public extension MarkdownNode {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(MarkdownNode.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        children: [Int]? = nil,
        content: MarkdownContent? = nil,
        end: Int? = nil,
        start: Int? = nil
    ) -> MarkdownNode {
        return MarkdownNode(
            children: children ?? self.children,
            content: content ?? self.content,
            end: end ?? self.end,
            start: start ?? self.start
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// HTML/unsupported parser extensions stay visible, never executed or discarded.
// MARK: - MarkdownContent
public struct MarkdownContent: Codable {
    public let kind: MarkdownContentKind
    public let anchor: String?
    public let level: Int?
    public let language: String?
    public let first: Int?
    public let alignments: [MarkdownAlignment]?
    public let target: MarkdownTarget?
    public let title: String?
    public let text: String?
    public let checked: Bool?

    public enum CodingKeys: String, CodingKey {
        case kind = "kind"
        case anchor = "anchor"
        case level = "level"
        case language = "language"
        case first = "first"
        case alignments = "alignments"
        case target = "target"
        case title = "title"
        case text = "text"
        case checked = "checked"
    }

    public init(kind: MarkdownContentKind, anchor: String?, level: Int?, language: String?, first: Int?, alignments: [MarkdownAlignment]?, target: MarkdownTarget?, title: String?, text: String?, checked: Bool?) {
        self.kind = kind
        self.anchor = anchor
        self.level = level
        self.language = language
        self.first = first
        self.alignments = alignments
        self.target = target
        self.title = title
        self.text = text
        self.checked = checked
    }
}

// MARK: MarkdownContent convenience initializers and mutators

public extension MarkdownContent {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(MarkdownContent.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        kind: MarkdownContentKind? = nil,
        anchor: String?? = nil,
        level: Int?? = nil,
        language: String?? = nil,
        first: Int?? = nil,
        alignments: [MarkdownAlignment]?? = nil,
        target: MarkdownTarget?? = nil,
        title: String?? = nil,
        text: String?? = nil,
        checked: Bool?? = nil
    ) -> MarkdownContent {
        return MarkdownContent(
            kind: kind ?? self.kind,
            anchor: anchor ?? self.anchor,
            level: level ?? self.level,
            language: language ?? self.language,
            first: first ?? self.first,
            alignments: alignments ?? self.alignments,
            target: target ?? self.target,
            title: title ?? self.title,
            text: text ?? self.text,
            checked: checked ?? self.checked
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

public enum MarkdownAlignment: String, Codable {
    case center = "center"
    case markdownAlignmentLeft = "left"
    case markdownAlignmentRight = "right"
    case none = "none"
}

public enum MarkdownContentKind: String, Codable {
    case code = "code"
    case codeBlock = "code_block"
    case emphasis = "emphasis"
    case hardBreak = "hard_break"
    case heading = "heading"
    case image = "image"
    case item = "item"
    case link = "link"
    case list = "list"
    case literal = "literal"
    case paragraph = "paragraph"
    case quote = "quote"
    case rule = "rule"
    case softBreak = "soft_break"
    case strikethrough = "strikethrough"
    case strong = "strong"
    case table = "table"
    case tableCell = "table_cell"
    case tableHead = "table_head"
    case tableRow = "table_row"
    case task = "task"
    case text = "text"
}

// MARK: - MarkdownTarget
public struct MarkdownTarget: Codable {
    public let kind: MarkdownTargetKind
    public let path: String?
    public let anchor: String?
    public let wiki: Bool?
    public let url: String?
    public let raw: String?

    public enum CodingKeys: String, CodingKey {
        case kind = "kind"
        case path = "path"
        case anchor = "anchor"
        case wiki = "wiki"
        case url = "url"
        case raw = "raw"
    }

    public init(kind: MarkdownTargetKind, path: String?, anchor: String?, wiki: Bool?, url: String?, raw: String?) {
        self.kind = kind
        self.path = path
        self.anchor = anchor
        self.wiki = wiki
        self.url = url
        self.raw = raw
    }
}

// MARK: MarkdownTarget convenience initializers and mutators

public extension MarkdownTarget {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(MarkdownTarget.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        kind: MarkdownTargetKind? = nil,
        path: String?? = nil,
        anchor: String?? = nil,
        wiki: Bool?? = nil,
        url: String?? = nil,
        raw: String?? = nil
    ) -> MarkdownTarget {
        return MarkdownTarget(
            kind: kind ?? self.kind,
            path: path ?? self.path,
            anchor: anchor ?? self.anchor,
            wiki: wiki ?? self.wiki,
            url: url ?? self.url,
            raw: raw ?? self.raw
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

public enum MarkdownTargetKind: String, Codable {
    case anchor = "anchor"
    case blocked = "blocked"
    case catalog = "catalog"
    case external = "external"
    case note = "note"
}

/// master:rekey response
// MARK: - MasterRekeyResponse
public struct MasterRekeyResponse: Codable {
    public let backupRecommended: Bool
    public let rewrappedArtifacts: [String]

    public enum CodingKeys: String, CodingKey {
        case backupRecommended = "backup_recommended"
        case rewrappedArtifacts = "rewrapped_artifacts"
    }

    public init(backupRecommended: Bool, rewrappedArtifacts: [String]) {
        self.backupRecommended = backupRecommended
        self.rewrappedArtifacts = rewrappedArtifacts
    }
}

// MARK: MasterRekeyResponse convenience initializers and mutators

public extension MasterRekeyResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(MasterRekeyResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        backupRecommended: Bool? = nil,
        rewrappedArtifacts: [String]? = nil
    ) -> MasterRekeyResponse {
        return MasterRekeyResponse(
            backupRecommended: backupRecommended ?? self.backupRecommended,
            rewrappedArtifacts: rewrappedArtifacts ?? self.rewrappedArtifacts
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Canonical `master:rekey` wire request; never expose passwords through Debug.
// MARK: - MasterRekeyRequest
public struct MasterRekeyRequest: Codable {
    public let currentPassword: String
    public let newMasterPassword: String

    public enum CodingKeys: String, CodingKey {
        case currentPassword = "current_password"
        case newMasterPassword = "new_master_password"
    }

    public init(currentPassword: String, newMasterPassword: String) {
        self.currentPassword = currentPassword
        self.newMasterPassword = newMasterPassword
    }
}

// MARK: MasterRekeyRequest convenience initializers and mutators

public extension MasterRekeyRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(MasterRekeyRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        currentPassword: String? = nil,
        newMasterPassword: String? = nil
    ) -> MasterRekeyRequest {
        return MasterRekeyRequest(
            currentPassword: currentPassword ?? self.currentPassword,
            newMasterPassword: newMasterPassword ?? self.newMasterPassword
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Node creation response
// MARK: - NodeCreatedResponse
public struct NodeCreatedResponse: Codable {
    public let nodeID: Int

    public enum CodingKeys: String, CodingKey {
        case nodeID = "node_id"
    }

    public init(nodeID: Int) {
        self.nodeID = nodeID
    }
}

// MARK: NodeCreatedResponse convenience initializers and mutators

public extension NodeCreatedResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(NodeCreatedResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        nodeID: Int? = nil
    ) -> NodeCreatedResponse {
        return NodeCreatedResponse(
            nodeID: nodeID ?? self.nodeID
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerOtpRecordRequest
public struct PassmanagerOtpRecordRequest: Codable {
    public let entryID: String
    public let label: String
    public let revision: String

    public enum CodingKeys: String, CodingKey {
        case entryID = "entry_id"
        case label = "label"
        case revision = "revision"
    }

    public init(entryID: String, label: String, revision: String) {
        self.entryID = entryID
        self.label = label
        self.revision = revision
    }
}

// MARK: PassmanagerOtpRecordRequest convenience initializers and mutators

public extension PassmanagerOtpRecordRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerOtpRecordRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        entryID: String? = nil,
        label: String? = nil,
        revision: String? = nil
    ) -> PassmanagerOtpRecordRequest {
        return PassmanagerOtpRecordRequest(
            entryID: entryID ?? self.entryID,
            label: label ?? self.label,
            revision: revision ?? self.revision
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - OtpPreviewResponse
public struct OtpPreviewResponse: Codable {
    public let leftSeconds: Int
    public let otp: String
    public let period: Int

    public enum CodingKeys: String, CodingKey {
        case leftSeconds = "left_seconds"
        case otp = "otp"
        case period = "period"
    }

    public init(leftSeconds: Int, otp: String, period: Int) {
        self.leftSeconds = leftSeconds
        self.otp = otp
        self.period = period
    }
}

// MARK: OtpPreviewResponse convenience initializers and mutators

public extension OtpPreviewResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(OtpPreviewResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        leftSeconds: Int? = nil,
        otp: String? = nil,
        period: Int? = nil
    ) -> OtpPreviewResponse {
        return OtpPreviewResponse(
            leftSeconds: leftSeconds ?? self.leftSeconds,
            otp: otp ?? self.otp,
            period: period ?? self.period
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Entry-scoped OTP management; secrets never appear in list responses.
// MARK: - PassmanagerOtpRecordsRequest
public struct PassmanagerOtpRecordsRequest: Codable {
    public let entryID: String

    public enum CodingKeys: String, CodingKey {
        case entryID = "entry_id"
    }

    public init(entryID: String) {
        self.entryID = entryID
    }
}

// MARK: PassmanagerOtpRecordsRequest convenience initializers and mutators

public extension PassmanagerOtpRecordsRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerOtpRecordsRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        entryID: String? = nil
    ) -> PassmanagerOtpRecordsRequest {
        return PassmanagerOtpRecordsRequest(
            entryID: entryID ?? self.entryID
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerOtpRecordsResponse
public struct PassmanagerOtpRecordsResponse: Codable {
    public let records: [CredentialOtpSummary]
    public let revision: String

    public enum CodingKeys: String, CodingKey {
        case records = "records"
        case revision = "revision"
    }

    public init(records: [CredentialOtpSummary], revision: String) {
        self.records = records
        self.revision = revision
    }
}

// MARK: PassmanagerOtpRecordsResponse convenience initializers and mutators

public extension PassmanagerOtpRecordsResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerOtpRecordsResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        records: [CredentialOtpSummary]? = nil,
        revision: String? = nil
    ) -> PassmanagerOtpRecordsResponse {
        return PassmanagerOtpRecordsResponse(
            records: records ?? self.records,
            revision: revision ?? self.revision
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CredentialOtpSummary
public struct CredentialOtpSummary: Codable {
    public let algorithm: String
    public let counter: String?
    public let digits: Int
    public let encoding: String
    public let label: String
    public let otpType: String
    public let period: Int

    public enum CodingKeys: String, CodingKey {
        case algorithm = "algorithm"
        case counter = "counter"
        case digits = "digits"
        case encoding = "encoding"
        case label = "label"
        case otpType = "otp_type"
        case period = "period"
    }

    public init(algorithm: String, counter: String?, digits: Int, encoding: String, label: String, otpType: String, period: Int) {
        self.algorithm = algorithm
        self.counter = counter
        self.digits = digits
        self.encoding = encoding
        self.label = label
        self.otpType = otpType
        self.period = period
    }
}

// MARK: CredentialOtpSummary convenience initializers and mutators

public extension CredentialOtpSummary {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CredentialOtpSummary.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        algorithm: String? = nil,
        counter: String?? = nil,
        digits: Int? = nil,
        encoding: String? = nil,
        label: String? = nil,
        otpType: String? = nil,
        period: Int? = nil
    ) -> CredentialOtpSummary {
        return CredentialOtpSummary(
            algorithm: algorithm ?? self.algorithm,
            counter: counter ?? self.counter,
            digits: digits ?? self.digits,
            encoding: encoding ?? self.encoding,
            label: label ?? self.label,
            otpType: otpType ?? self.otpType,
            period: period ?? self.period
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerOtpRecordSaveRequest
public struct PassmanagerOtpRecordSaveRequest: Codable {
    public let entryID: String
    public let revision: String
    public let secret: String?
    public let settings: CredentialOtpSummary
    public let sourceLabel: String?

    public enum CodingKeys: String, CodingKey {
        case entryID = "entry_id"
        case revision = "revision"
        case secret = "secret"
        case settings = "settings"
        case sourceLabel = "source_label"
    }

    public init(entryID: String, revision: String, secret: String?, settings: CredentialOtpSummary, sourceLabel: String?) {
        self.entryID = entryID
        self.revision = revision
        self.secret = secret
        self.settings = settings
        self.sourceLabel = sourceLabel
    }
}

// MARK: PassmanagerOtpRecordSaveRequest convenience initializers and mutators

public extension PassmanagerOtpRecordSaveRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerOtpRecordSaveRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        entryID: String? = nil,
        revision: String? = nil,
        secret: String?? = nil,
        settings: CredentialOtpSummary? = nil,
        sourceLabel: String?? = nil
    ) -> PassmanagerOtpRecordSaveRequest {
        return PassmanagerOtpRecordSaveRequest(
            entryID: entryID ?? self.entryID,
            revision: revision ?? self.revision,
            secret: secret ?? self.secret,
            settings: settings ?? self.settings,
            sourceLabel: sourceLabel ?? self.sourceLabel
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Parse supplied setup material without reading or writing a stored seed.
// MARK: - PassmanagerOtpURIRequest
public struct PassmanagerOtpURIRequest: Codable {
    public let fallbackLabel: String?
    public let uri: String

    public enum CodingKeys: String, CodingKey {
        case fallbackLabel = "fallback_label"
        case uri = "uri"
    }

    public init(fallbackLabel: String?, uri: String) {
        self.fallbackLabel = fallbackLabel
        self.uri = uri
    }
}

// MARK: PassmanagerOtpURIRequest convenience initializers and mutators

public extension PassmanagerOtpURIRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerOtpURIRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        fallbackLabel: String?? = nil,
        uri: String? = nil
    ) -> PassmanagerOtpURIRequest {
        return PassmanagerOtpURIRequest(
            fallbackLabel: fallbackLabel ?? self.fallbackLabel,
            uri: uri ?? self.uri
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerOtpURIResponse
public struct PassmanagerOtpURIResponse: Codable {
    public let account: String
    public let issuer: String
    public let secret: String
    public let settings: CredentialOtpSummary

    public enum CodingKeys: String, CodingKey {
        case account = "account"
        case issuer = "issuer"
        case secret = "secret"
        case settings = "settings"
    }

    public init(account: String, issuer: String, secret: String, settings: CredentialOtpSummary) {
        self.account = account
        self.issuer = issuer
        self.secret = secret
        self.settings = settings
    }
}

// MARK: PassmanagerOtpURIResponse convenience initializers and mutators

public extension PassmanagerOtpURIResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerOtpURIResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        account: String? = nil,
        issuer: String? = nil,
        secret: String? = nil,
        settings: CredentialOtpSummary? = nil
    ) -> PassmanagerOtpURIResponse {
        return PassmanagerOtpURIResponse(
            account: account ?? self.account,
            issuer: issuer ?? self.issuer,
            secret: secret ?? self.secret,
            settings: settings ?? self.settings
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Canonical management request; aliases retain the established RPC wire contract.
// MARK: - VaultPasskeyDeleteRequest
public struct VaultPasskeyDeleteRequest: Codable {
    public let credentialIDB64URL: String

    public enum CodingKeys: String, CodingKey {
        case credentialIDB64URL = "credentialIdB64Url"
    }

    public init(credentialIDB64URL: String) {
        self.credentialIDB64URL = credentialIDB64URL
    }
}

// MARK: VaultPasskeyDeleteRequest convenience initializers and mutators

public extension VaultPasskeyDeleteRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(VaultPasskeyDeleteRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        credentialIDB64URL: String? = nil
    ) -> VaultPasskeyDeleteRequest {
        return VaultPasskeyDeleteRequest(
            credentialIDB64URL: credentialIDB64URL ?? self.credentialIDB64URL
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - VaultPasskeyDeleteResponse
public struct VaultPasskeyDeleteResponse: Codable {
    public let deleted: Bool

    public enum CodingKeys: String, CodingKey {
        case deleted = "deleted"
    }

    public init(deleted: Bool) {
        self.deleted = deleted
    }
}

// MARK: VaultPasskeyDeleteResponse convenience initializers and mutators

public extension VaultPasskeyDeleteResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(VaultPasskeyDeleteResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        deleted: Bool? = nil
    ) -> VaultPasskeyDeleteResponse {
        return VaultPasskeyDeleteResponse(
            deleted: deleted ?? self.deleted
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - VaultPasskeysListResponse
public struct VaultPasskeysListResponse: Codable {
    public let passkeys: [VaultPasskeySummary]

    public enum CodingKeys: String, CodingKey {
        case passkeys = "passkeys"
    }

    public init(passkeys: [VaultPasskeySummary]) {
        self.passkeys = passkeys
    }
}

// MARK: VaultPasskeysListResponse convenience initializers and mutators

public extension VaultPasskeysListResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(VaultPasskeysListResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        passkeys: [VaultPasskeySummary]? = nil
    ) -> VaultPasskeysListResponse {
        return VaultPasskeysListResponse(
            passkeys: passkeys ?? self.passkeys
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - VaultPasskeySummary
public struct VaultPasskeySummary: Codable {
    public let createdAtEpochMS: Int
    public let credentialIDB64URL: String
    public let lastUsedEpochMS: Int
    public let portable: Bool
    public let rpID: String
    public let rpName: String
    public let signCount: Int
    public let storageKind: String
    public let userDisplayName: String
    public let userName: String

    public enum CodingKeys: String, CodingKey {
        case createdAtEpochMS = "createdAtEpochMs"
        case credentialIDB64URL = "credentialIdB64Url"
        case lastUsedEpochMS = "lastUsedEpochMs"
        case portable = "portable"
        case rpID = "rpId"
        case rpName = "rpName"
        case signCount = "signCount"
        case storageKind = "storageKind"
        case userDisplayName = "userDisplayName"
        case userName = "userName"
    }

    public init(createdAtEpochMS: Int, credentialIDB64URL: String, lastUsedEpochMS: Int, portable: Bool, rpID: String, rpName: String, signCount: Int, storageKind: String, userDisplayName: String, userName: String) {
        self.createdAtEpochMS = createdAtEpochMS
        self.credentialIDB64URL = credentialIDB64URL
        self.lastUsedEpochMS = lastUsedEpochMS
        self.portable = portable
        self.rpID = rpID
        self.rpName = rpName
        self.signCount = signCount
        self.storageKind = storageKind
        self.userDisplayName = userDisplayName
        self.userName = userName
    }
}

// MARK: VaultPasskeySummary convenience initializers and mutators

public extension VaultPasskeySummary {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(VaultPasskeySummary.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        createdAtEpochMS: Int? = nil,
        credentialIDB64URL: String? = nil,
        lastUsedEpochMS: Int? = nil,
        portable: Bool? = nil,
        rpID: String? = nil,
        rpName: String? = nil,
        signCount: Int? = nil,
        storageKind: String? = nil,
        userDisplayName: String? = nil,
        userName: String? = nil
    ) -> VaultPasskeySummary {
        return VaultPasskeySummary(
            createdAtEpochMS: createdAtEpochMS ?? self.createdAtEpochMS,
            credentialIDB64URL: credentialIDB64URL ?? self.credentialIDB64URL,
            lastUsedEpochMS: lastUsedEpochMS ?? self.lastUsedEpochMS,
            portable: portable ?? self.portable,
            rpID: rpID ?? self.rpID,
            rpName: rpName ?? self.rpName,
            signCount: signCount ?? self.signCount,
            storageKind: storageKind ?? self.storageKind,
            userDisplayName: userDisplayName ?? self.userDisplayName,
            userName: userName ?? self.userName
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Transient generation settings; the output is saved only by a separate credential command.
// MARK: - PassmanagerPasswordGenerateRequest
public struct PassmanagerPasswordGenerateRequest: Codable {
    public let digits: Bool
    public let length: Int
    public let lowercase: Bool
    public let symbols: Bool
    public let uppercase: Bool

    public enum CodingKeys: String, CodingKey {
        case digits = "digits"
        case length = "length"
        case lowercase = "lowercase"
        case symbols = "symbols"
        case uppercase = "uppercase"
    }

    public init(digits: Bool, length: Int, lowercase: Bool, symbols: Bool, uppercase: Bool) {
        self.digits = digits
        self.length = length
        self.lowercase = lowercase
        self.symbols = symbols
        self.uppercase = uppercase
    }
}

// MARK: PassmanagerPasswordGenerateRequest convenience initializers and mutators

public extension PassmanagerPasswordGenerateRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerPasswordGenerateRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        digits: Bool? = nil,
        length: Int? = nil,
        lowercase: Bool? = nil,
        symbols: Bool? = nil,
        uppercase: Bool? = nil
    ) -> PassmanagerPasswordGenerateRequest {
        return PassmanagerPasswordGenerateRequest(
            digits: digits ?? self.digits,
            length: length ?? self.length,
            lowercase: lowercase ?? self.lowercase,
            symbols: symbols ?? self.symbols,
            uppercase: uppercase ?? self.uppercase
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerPasswordGenerateResponse
public struct PassmanagerPasswordGenerateResponse: Codable {
    public let password: String

    public enum CodingKeys: String, CodingKey {
        case password = "password"
    }

    public init(password: String) {
        self.password = password
    }
}

// MARK: PassmanagerPasswordGenerateResponse convenience initializers and mutators

public extension PassmanagerPasswordGenerateResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerPasswordGenerateResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        password: String? = nil
    ) -> PassmanagerPasswordGenerateResponse {
        return PassmanagerPasswordGenerateResponse(
            password: password ?? self.password
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CredentialProviderStatusResponse
public struct CredentialProviderStatusResponse: Codable {
    public let capabilityMatrix: CredentialProviderCapabilityMatrix
    public let commandErrorMap: CredentialProviderCommandErrorMap
    public let enabled: Bool
    public let passkeysLiteStatus: CredentialProviderPasskeysLiteStatusMatrix
    public let vaultOpen: Bool

    public enum CodingKeys: String, CodingKey {
        case capabilityMatrix = "capability_matrix"
        case commandErrorMap = "command_error_map"
        case enabled = "enabled"
        case passkeysLiteStatus = "passkeys_lite_status"
        case vaultOpen = "vault_open"
    }

    public init(capabilityMatrix: CredentialProviderCapabilityMatrix, commandErrorMap: CredentialProviderCommandErrorMap, enabled: Bool, passkeysLiteStatus: CredentialProviderPasskeysLiteStatusMatrix, vaultOpen: Bool) {
        self.capabilityMatrix = capabilityMatrix
        self.commandErrorMap = commandErrorMap
        self.enabled = enabled
        self.passkeysLiteStatus = passkeysLiteStatus
        self.vaultOpen = vaultOpen
    }
}

// MARK: CredentialProviderStatusResponse convenience initializers and mutators

public extension CredentialProviderStatusResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CredentialProviderStatusResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        capabilityMatrix: CredentialProviderCapabilityMatrix? = nil,
        commandErrorMap: CredentialProviderCommandErrorMap? = nil,
        enabled: Bool? = nil,
        passkeysLiteStatus: CredentialProviderPasskeysLiteStatusMatrix? = nil,
        vaultOpen: Bool? = nil
    ) -> CredentialProviderStatusResponse {
        return CredentialProviderStatusResponse(
            capabilityMatrix: capabilityMatrix ?? self.capabilityMatrix,
            commandErrorMap: commandErrorMap ?? self.commandErrorMap,
            enabled: enabled ?? self.enabled,
            passkeysLiteStatus: passkeysLiteStatus ?? self.passkeysLiteStatus,
            vaultOpen: vaultOpen ?? self.vaultOpen
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CredentialProviderCapabilityMatrix
public struct CredentialProviderCapabilityMatrix: Codable {
    public let android: CredentialProviderCapability
    public let ios: CredentialProviderCapability
    public let macos: CredentialProviderCapability
    public let windows: CredentialProviderCapability

    public enum CodingKeys: String, CodingKey {
        case android = "android"
        case ios = "ios"
        case macos = "macos"
        case windows = "windows"
    }

    public init(android: CredentialProviderCapability, ios: CredentialProviderCapability, macos: CredentialProviderCapability, windows: CredentialProviderCapability) {
        self.android = android
        self.ios = ios
        self.macos = macos
        self.windows = windows
    }
}

// MARK: CredentialProviderCapabilityMatrix convenience initializers and mutators

public extension CredentialProviderCapabilityMatrix {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CredentialProviderCapabilityMatrix.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        android: CredentialProviderCapability? = nil,
        ios: CredentialProviderCapability? = nil,
        macos: CredentialProviderCapability? = nil,
        windows: CredentialProviderCapability? = nil
    ) -> CredentialProviderCapabilityMatrix {
        return CredentialProviderCapabilityMatrix(
            android: android ?? self.android,
            ios: ios ?? self.ios,
            macos: macos ?? self.macos,
            windows: windows ?? self.windows
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CredentialProviderCapability
public struct CredentialProviderCapability: Codable {
    public let autofillFallback: Bool
    public let oneTimeCodes: Bool
    public let oneTimeCodesUnsupportedReason: String?
    public let passkeysLite: Bool
    public let passwordProvider: Bool
    public let unsupportedReason: String?

    public enum CodingKeys: String, CodingKey {
        case autofillFallback = "autofill_fallback"
        case oneTimeCodes = "one_time_codes"
        case oneTimeCodesUnsupportedReason = "one_time_codes_unsupported_reason"
        case passkeysLite = "passkeys_lite"
        case passwordProvider = "password_provider"
        case unsupportedReason = "unsupported_reason"
    }

    public init(autofillFallback: Bool, oneTimeCodes: Bool, oneTimeCodesUnsupportedReason: String?, passkeysLite: Bool, passwordProvider: Bool, unsupportedReason: String?) {
        self.autofillFallback = autofillFallback
        self.oneTimeCodes = oneTimeCodes
        self.oneTimeCodesUnsupportedReason = oneTimeCodesUnsupportedReason
        self.passkeysLite = passkeysLite
        self.passwordProvider = passwordProvider
        self.unsupportedReason = unsupportedReason
    }
}

// MARK: CredentialProviderCapability convenience initializers and mutators

public extension CredentialProviderCapability {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CredentialProviderCapability.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        autofillFallback: Bool? = nil,
        oneTimeCodes: Bool? = nil,
        oneTimeCodesUnsupportedReason: String?? = nil,
        passkeysLite: Bool? = nil,
        passwordProvider: Bool? = nil,
        unsupportedReason: String?? = nil
    ) -> CredentialProviderCapability {
        return CredentialProviderCapability(
            autofillFallback: autofillFallback ?? self.autofillFallback,
            oneTimeCodes: oneTimeCodes ?? self.oneTimeCodes,
            oneTimeCodesUnsupportedReason: oneTimeCodesUnsupportedReason ?? self.oneTimeCodesUnsupportedReason,
            passkeysLite: passkeysLite ?? self.passkeysLite,
            passwordProvider: passwordProvider ?? self.passwordProvider,
            unsupportedReason: unsupportedReason ?? self.unsupportedReason
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CredentialProviderCommandErrorMap
public struct CredentialProviderCommandErrorMap: Codable {
    public let credentialProviderGetOneTimeCode: [String]
    public let credentialProviderGetSecret: [String]
    public let credentialProviderList: [String]
    public let credentialProviderPasskeyCreate: [String]
    public let credentialProviderPasskeyGet: [String]
    public let credentialProviderPasskeyQuery: [String]
    public let credentialProviderRecordUse: [String]
    public let credentialProviderSearch: [String]
    public let credentialProviderSessionClose: [String]
    public let credentialProviderSessionOpen: [String]
    public let credentialProviderStatus: [String]

    public enum CodingKeys: String, CodingKey {
        case credentialProviderGetOneTimeCode = "credential_provider:getOneTimeCode"
        case credentialProviderGetSecret = "credential_provider:getSecret"
        case credentialProviderList = "credential_provider:list"
        case credentialProviderPasskeyCreate = "credential_provider:passkey:create"
        case credentialProviderPasskeyGet = "credential_provider:passkey:get"
        case credentialProviderPasskeyQuery = "credential_provider:passkey:query"
        case credentialProviderRecordUse = "credential_provider:recordUse"
        case credentialProviderSearch = "credential_provider:search"
        case credentialProviderSessionClose = "credential_provider:session:close"
        case credentialProviderSessionOpen = "credential_provider:session:open"
        case credentialProviderStatus = "credential_provider:status"
    }

    public init(credentialProviderGetOneTimeCode: [String], credentialProviderGetSecret: [String], credentialProviderList: [String], credentialProviderPasskeyCreate: [String], credentialProviderPasskeyGet: [String], credentialProviderPasskeyQuery: [String], credentialProviderRecordUse: [String], credentialProviderSearch: [String], credentialProviderSessionClose: [String], credentialProviderSessionOpen: [String], credentialProviderStatus: [String]) {
        self.credentialProviderGetOneTimeCode = credentialProviderGetOneTimeCode
        self.credentialProviderGetSecret = credentialProviderGetSecret
        self.credentialProviderList = credentialProviderList
        self.credentialProviderPasskeyCreate = credentialProviderPasskeyCreate
        self.credentialProviderPasskeyGet = credentialProviderPasskeyGet
        self.credentialProviderPasskeyQuery = credentialProviderPasskeyQuery
        self.credentialProviderRecordUse = credentialProviderRecordUse
        self.credentialProviderSearch = credentialProviderSearch
        self.credentialProviderSessionClose = credentialProviderSessionClose
        self.credentialProviderSessionOpen = credentialProviderSessionOpen
        self.credentialProviderStatus = credentialProviderStatus
    }
}

// MARK: CredentialProviderCommandErrorMap convenience initializers and mutators

public extension CredentialProviderCommandErrorMap {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CredentialProviderCommandErrorMap.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        credentialProviderGetOneTimeCode: [String]? = nil,
        credentialProviderGetSecret: [String]? = nil,
        credentialProviderList: [String]? = nil,
        credentialProviderPasskeyCreate: [String]? = nil,
        credentialProviderPasskeyGet: [String]? = nil,
        credentialProviderPasskeyQuery: [String]? = nil,
        credentialProviderRecordUse: [String]? = nil,
        credentialProviderSearch: [String]? = nil,
        credentialProviderSessionClose: [String]? = nil,
        credentialProviderSessionOpen: [String]? = nil,
        credentialProviderStatus: [String]? = nil
    ) -> CredentialProviderCommandErrorMap {
        return CredentialProviderCommandErrorMap(
            credentialProviderGetOneTimeCode: credentialProviderGetOneTimeCode ?? self.credentialProviderGetOneTimeCode,
            credentialProviderGetSecret: credentialProviderGetSecret ?? self.credentialProviderGetSecret,
            credentialProviderList: credentialProviderList ?? self.credentialProviderList,
            credentialProviderPasskeyCreate: credentialProviderPasskeyCreate ?? self.credentialProviderPasskeyCreate,
            credentialProviderPasskeyGet: credentialProviderPasskeyGet ?? self.credentialProviderPasskeyGet,
            credentialProviderPasskeyQuery: credentialProviderPasskeyQuery ?? self.credentialProviderPasskeyQuery,
            credentialProviderRecordUse: credentialProviderRecordUse ?? self.credentialProviderRecordUse,
            credentialProviderSearch: credentialProviderSearch ?? self.credentialProviderSearch,
            credentialProviderSessionClose: credentialProviderSessionClose ?? self.credentialProviderSessionClose,
            credentialProviderSessionOpen: credentialProviderSessionOpen ?? self.credentialProviderSessionOpen,
            credentialProviderStatus: credentialProviderStatus ?? self.credentialProviderStatus
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CredentialProviderPasskeysLiteStatusMatrix
public struct CredentialProviderPasskeysLiteStatusMatrix: Codable {
    public let android: CredentialProviderPasskeysLiteStatus
    public let ios: CredentialProviderPasskeysLiteStatus
    public let macos: CredentialProviderPasskeysLiteStatus
    public let windows: CredentialProviderPasskeysLiteStatus

    public enum CodingKeys: String, CodingKey {
        case android = "android"
        case ios = "ios"
        case macos = "macos"
        case windows = "windows"
    }

    public init(android: CredentialProviderPasskeysLiteStatus, ios: CredentialProviderPasskeysLiteStatus, macos: CredentialProviderPasskeysLiteStatus, windows: CredentialProviderPasskeysLiteStatus) {
        self.android = android
        self.ios = ios
        self.macos = macos
        self.windows = windows
    }
}

// MARK: CredentialProviderPasskeysLiteStatusMatrix convenience initializers and mutators

public extension CredentialProviderPasskeysLiteStatusMatrix {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CredentialProviderPasskeysLiteStatusMatrix.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        android: CredentialProviderPasskeysLiteStatus? = nil,
        ios: CredentialProviderPasskeysLiteStatus? = nil,
        macos: CredentialProviderPasskeysLiteStatus? = nil,
        windows: CredentialProviderPasskeysLiteStatus? = nil
    ) -> CredentialProviderPasskeysLiteStatusMatrix {
        return CredentialProviderPasskeysLiteStatusMatrix(
            android: android ?? self.android,
            ios: ios ?? self.ios,
            macos: macos ?? self.macos,
            windows: windows ?? self.windows
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CredentialProviderPasskeysLiteStatus
public struct CredentialProviderPasskeysLiteStatus: Codable {
    public let create: String
    public let credentialProviderPasskeysLiteStatusGet: String
    public let unsupportedReason: String?

    public enum CodingKeys: String, CodingKey {
        case create = "create"
        case credentialProviderPasskeysLiteStatusGet = "get"
        case unsupportedReason = "unsupported_reason"
    }

    public init(create: String, credentialProviderPasskeysLiteStatusGet: String, unsupportedReason: String?) {
        self.create = create
        self.credentialProviderPasskeysLiteStatusGet = credentialProviderPasskeysLiteStatusGet
        self.unsupportedReason = unsupportedReason
    }
}

// MARK: CredentialProviderPasskeysLiteStatus convenience initializers and mutators

public extension CredentialProviderPasskeysLiteStatus {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CredentialProviderPasskeysLiteStatus.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        create: String? = nil,
        credentialProviderPasskeysLiteStatusGet: String? = nil,
        unsupportedReason: String?? = nil
    ) -> CredentialProviderPasskeysLiteStatus {
        return CredentialProviderPasskeysLiteStatus(
            create: create ?? self.create,
            credentialProviderPasskeysLiteStatusGet: credentialProviderPasskeysLiteStatusGet ?? self.credentialProviderPasskeysLiteStatusGet,
            unsupportedReason: unsupportedReason ?? self.unsupportedReason
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// RPC Request
// MARK: - RPCRequest
public struct RPCRequest: Codable {
    /// Command name
    public let command: String
    /// Command data
    public let data: JSONAny
    /// Optional transport-level feature hints for this request.
    public let transportFeatures: [String]?
    /// Protocol version
    public let v: Int

    public enum CodingKeys: String, CodingKey {
        case command = "command"
        case data = "data"
        case transportFeatures = "transport_features"
        case v = "v"
    }

    public init(command: String, data: JSONAny, transportFeatures: [String]?, v: Int) {
        self.command = command
        self.data = data
        self.transportFeatures = transportFeatures
        self.v = v
    }
}

// MARK: RPCRequest convenience initializers and mutators

public extension RPCRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(RPCRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        command: String? = nil,
        data: JSONAny? = nil,
        transportFeatures: [String]?? = nil,
        v: Int? = nil
    ) -> RPCRequest {
        return RPCRequest(
            command: command ?? self.command,
            data: data ?? self.data,
            transportFeatures: transportFeatures ?? self.transportFeatures,
            v: v ?? self.v
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Input counts after complete staging validation; no imported secret values are returned.
// MARK: - PassmanagerRootImportPreview
public struct PassmanagerRootImportPreview: Codable {
    public let createdEntryCount: Int?
    public let entryCount: Int
    public let folderCount: Int
    public let mode: String
    public let revision: String
    public let source: String?
    public let sshKeyCount: Int
    public let updatedEntryCount: Int?
    public let warnings: [CredentialImportWarning]?

    public enum CodingKeys: String, CodingKey {
        case createdEntryCount = "created_entry_count"
        case entryCount = "entry_count"
        case folderCount = "folder_count"
        case mode = "mode"
        case revision = "revision"
        case source = "source"
        case sshKeyCount = "ssh_key_count"
        case updatedEntryCount = "updated_entry_count"
        case warnings = "warnings"
    }

    public init(createdEntryCount: Int?, entryCount: Int, folderCount: Int, mode: String, revision: String, source: String?, sshKeyCount: Int, updatedEntryCount: Int?, warnings: [CredentialImportWarning]?) {
        self.createdEntryCount = createdEntryCount
        self.entryCount = entryCount
        self.folderCount = folderCount
        self.mode = mode
        self.revision = revision
        self.source = source
        self.sshKeyCount = sshKeyCount
        self.updatedEntryCount = updatedEntryCount
        self.warnings = warnings
    }
}

// MARK: PassmanagerRootImportPreview convenience initializers and mutators

public extension PassmanagerRootImportPreview {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerRootImportPreview.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        createdEntryCount: Int?? = nil,
        entryCount: Int? = nil,
        folderCount: Int? = nil,
        mode: String? = nil,
        revision: String? = nil,
        source: String?? = nil,
        sshKeyCount: Int? = nil,
        updatedEntryCount: Int?? = nil,
        warnings: [CredentialImportWarning]?? = nil
    ) -> PassmanagerRootImportPreview {
        return PassmanagerRootImportPreview(
            createdEntryCount: createdEntryCount ?? self.createdEntryCount,
            entryCount: entryCount ?? self.entryCount,
            folderCount: folderCount ?? self.folderCount,
            mode: mode ?? self.mode,
            revision: revision ?? self.revision,
            source: source ?? self.source,
            sshKeyCount: sshKeyCount ?? self.sshKeyCount,
            updatedEntryCount: updatedEntryCount ?? self.updatedEntryCount,
            warnings: warnings ?? self.warnings
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CredentialImportWarning
public struct CredentialImportWarning: Codable {
    public let code: CredentialImportWarningCode
    public let count: Int

    public enum CodingKeys: String, CodingKey {
        case code = "code"
        case count = "count"
    }

    public init(code: CredentialImportWarningCode, count: Int) {
        self.code = code
        self.count = count
    }
}

// MARK: CredentialImportWarning convenience initializers and mutators

public extension CredentialImportWarning {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CredentialImportWarning.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        code: CredentialImportWarningCode? = nil,
        count: Int? = nil
    ) -> CredentialImportWarning {
        return CredentialImportWarning(
            code: code ?? self.code,
            count: count ?? self.count
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

public enum CredentialImportWarningCode: String, Codable {
    case attachmentsOmitted = "attachments_omitted"
    case cardInNote = "card_in_note"
    case entryLimit = "entry_limit"
    case iconsOmitted = "icons_omitted"
    case invalidRows = "invalid_rows"
    case legacyIdentifiersMatched = "legacy_identifiers_matched"
    case otpInNote = "otp_in_note"
    case passkeysOmitted = "passkeys_omitted"
    case recordsOmitted = "records_omitted"
    case unmappedColumns = "unmapped_columns"
    case unsupportedRecords = "unsupported_records"
}

// MARK: - PassmanagerRootImportRequest
public struct PassmanagerRootImportRequest: Codable {
    public let allowDestructive: Bool?
    public let entries: JSONAny
    public let expectedRevision: String?
    public let folders: JSONAny
    public let foldersMeta: JSONAny?
    public let icons: JSONAny?
    public let mode: String?
    public let sshKeys: JSONAny?
    public let tagMeta: JSONAny?
    public let tags: JSONAny?

    public enum CodingKeys: String, CodingKey {
        case allowDestructive = "allow_destructive"
        case entries = "entries"
        case expectedRevision = "expected_revision"
        case folders = "folders"
        case foldersMeta = "folders_meta"
        case icons = "icons"
        case mode = "mode"
        case sshKeys = "ssh_keys"
        case tagMeta = "tag_meta"
        case tags = "tags"
    }

    public init(allowDestructive: Bool?, entries: JSONAny, expectedRevision: String?, folders: JSONAny, foldersMeta: JSONAny?, icons: JSONAny?, mode: String?, sshKeys: JSONAny?, tagMeta: JSONAny?, tags: JSONAny?) {
        self.allowDestructive = allowDestructive
        self.entries = entries
        self.expectedRevision = expectedRevision
        self.folders = folders
        self.foldersMeta = foldersMeta
        self.icons = icons
        self.mode = mode
        self.sshKeys = sshKeys
        self.tagMeta = tagMeta
        self.tags = tags
    }
}

// MARK: PassmanagerRootImportRequest convenience initializers and mutators

public extension PassmanagerRootImportRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerRootImportRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        allowDestructive: Bool?? = nil,
        entries: JSONAny? = nil,
        expectedRevision: String?? = nil,
        folders: JSONAny? = nil,
        foldersMeta: JSONAny?? = nil,
        icons: JSONAny?? = nil,
        mode: String?? = nil,
        sshKeys: JSONAny?? = nil,
        tagMeta: JSONAny?? = nil,
        tags: JSONAny?? = nil
    ) -> PassmanagerRootImportRequest {
        return PassmanagerRootImportRequest(
            allowDestructive: allowDestructive ?? self.allowDestructive,
            entries: entries ?? self.entries,
            expectedRevision: expectedRevision ?? self.expectedRevision,
            folders: folders ?? self.folders,
            foldersMeta: foldersMeta ?? self.foldersMeta,
            icons: icons ?? self.icons,
            mode: mode ?? self.mode,
            sshKeys: sshKeys ?? self.sshKeys,
            tagMeta: tagMeta ?? self.tagMeta,
            tags: tags ?? self.tags
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerSecretReadResponse
public struct PassmanagerSecretReadResponse: Codable {
    public let value: String

    public enum CodingKeys: String, CodingKey {
        case value = "value"
    }

    public init(value: String) {
        self.value = value
    }
}

// MARK: PassmanagerSecretReadResponse convenience initializers and mutators

public extension PassmanagerSecretReadResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerSecretReadResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        value: String? = nil
    ) -> PassmanagerSecretReadResponse {
        return PassmanagerSecretReadResponse(
            value: value ?? self.value
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerSecurityAuditPageResponse
public struct PassmanagerSecurityAuditPageResponse: Codable {
    public let algorithmVersion: Int
    public let entries: [CredentialSecurityAuditRow]
    public let failedCount: Int
    public let nextOffset: Int?
    public let reusedPasswordCount: Int
    public let revision: String
    public let totalCount: Int
    public let twoFactorCount: Int
    public let weakPasswordCount: Int

    public enum CodingKeys: String, CodingKey {
        case algorithmVersion = "algorithm_version"
        case entries = "entries"
        case failedCount = "failed_count"
        case nextOffset = "next_offset"
        case reusedPasswordCount = "reused_password_count"
        case revision = "revision"
        case totalCount = "total_count"
        case twoFactorCount = "two_factor_count"
        case weakPasswordCount = "weak_password_count"
    }

    public init(algorithmVersion: Int, entries: [CredentialSecurityAuditRow], failedCount: Int, nextOffset: Int?, reusedPasswordCount: Int, revision: String, totalCount: Int, twoFactorCount: Int, weakPasswordCount: Int) {
        self.algorithmVersion = algorithmVersion
        self.entries = entries
        self.failedCount = failedCount
        self.nextOffset = nextOffset
        self.reusedPasswordCount = reusedPasswordCount
        self.revision = revision
        self.totalCount = totalCount
        self.twoFactorCount = twoFactorCount
        self.weakPasswordCount = weakPasswordCount
    }
}

// MARK: PassmanagerSecurityAuditPageResponse convenience initializers and mutators

public extension PassmanagerSecurityAuditPageResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerSecurityAuditPageResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        algorithmVersion: Int? = nil,
        entries: [CredentialSecurityAuditRow]? = nil,
        failedCount: Int? = nil,
        nextOffset: Int?? = nil,
        reusedPasswordCount: Int? = nil,
        revision: String? = nil,
        totalCount: Int? = nil,
        twoFactorCount: Int? = nil,
        weakPasswordCount: Int? = nil
    ) -> PassmanagerSecurityAuditPageResponse {
        return PassmanagerSecurityAuditPageResponse(
            algorithmVersion: algorithmVersion ?? self.algorithmVersion,
            entries: entries ?? self.entries,
            failedCount: failedCount ?? self.failedCount,
            nextOffset: nextOffset ?? self.nextOffset,
            reusedPasswordCount: reusedPasswordCount ?? self.reusedPasswordCount,
            revision: revision ?? self.revision,
            totalCount: totalCount ?? self.totalCount,
            twoFactorCount: twoFactorCount ?? self.twoFactorCount,
            weakPasswordCount: weakPasswordCount ?? self.weakPasswordCount
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CredentialSecurityAuditRow
public struct CredentialSecurityAuditRow: Codable {
    /// Null means the password could not be checked; never interpret as safe.
    public let audit: CredentialAuditEntrySummary?
    public let credential: CredentialSummary

    public enum CodingKeys: String, CodingKey {
        case audit = "audit"
        case credential = "credential"
    }

    public init(audit: CredentialAuditEntrySummary?, credential: CredentialSummary) {
        self.audit = audit
        self.credential = credential
    }
}

// MARK: CredentialSecurityAuditRow convenience initializers and mutators

public extension CredentialSecurityAuditRow {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CredentialSecurityAuditRow.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        audit: CredentialAuditEntrySummary?? = nil,
        credential: CredentialSummary? = nil
    ) -> CredentialSecurityAuditRow {
        return CredentialSecurityAuditRow(
            audit: audit ?? self.audit,
            credential: credential ?? self.credential
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CredentialAuditEntrySummary
public struct CredentialAuditEntrySummary: Codable {
    public let entryID: String
    public let hasTwoFactor: Bool
    public let reusedPassword: Bool
    public let strengthScore: Int?
    public let weakPassword: Bool

    public enum CodingKeys: String, CodingKey {
        case entryID = "entryId"
        case hasTwoFactor = "hasTwoFactor"
        case reusedPassword = "reusedPassword"
        case strengthScore = "strengthScore"
        case weakPassword = "weakPassword"
    }

    public init(entryID: String, hasTwoFactor: Bool, reusedPassword: Bool, strengthScore: Int?, weakPassword: Bool) {
        self.entryID = entryID
        self.hasTwoFactor = hasTwoFactor
        self.reusedPassword = reusedPassword
        self.strengthScore = strengthScore
        self.weakPassword = weakPassword
    }
}

// MARK: CredentialAuditEntrySummary convenience initializers and mutators

public extension CredentialAuditEntrySummary {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CredentialAuditEntrySummary.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        entryID: String? = nil,
        hasTwoFactor: Bool? = nil,
        reusedPassword: Bool? = nil,
        strengthScore: Int?? = nil,
        weakPassword: Bool? = nil
    ) -> CredentialAuditEntrySummary {
        return CredentialAuditEntrySummary(
            entryID: entryID ?? self.entryID,
            hasTwoFactor: hasTwoFactor ?? self.hasTwoFactor,
            reusedPassword: reusedPassword ?? self.reusedPassword,
            strengthScore: strengthScore ?? self.strengthScore,
            weakPassword: weakPassword ?? self.weakPassword
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// A fresh, read-only vault-wide audit. Continuation requires the returned revision.
// MARK: - PassmanagerSecurityAuditPageRequest
public struct PassmanagerSecurityAuditPageRequest: Codable {
    /// weak, reused, without_otp, failed; omitted for all entries.
    public let issue: String?
    public let limit: Int
    public let offset: Int
    public let revision: String?

    public enum CodingKeys: String, CodingKey {
        case issue = "issue"
        case limit = "limit"
        case offset = "offset"
        case revision = "revision"
    }

    public init(issue: String?, limit: Int, offset: Int, revision: String?) {
        self.issue = issue
        self.limit = limit
        self.offset = offset
        self.revision = revision
    }
}

// MARK: PassmanagerSecurityAuditPageRequest convenience initializers and mutators

public extension PassmanagerSecurityAuditPageRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerSecurityAuditPageRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        issue: String?? = nil,
        limit: Int? = nil,
        offset: Int? = nil,
        revision: String?? = nil
    ) -> PassmanagerSecurityAuditPageRequest {
        return PassmanagerSecurityAuditPageRequest(
            issue: issue ?? self.issue,
            limit: limit ?? self.limit,
            offset: offset ?? self.offset,
            revision: revision ?? self.revision
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerSSHEditRequest
public struct PassmanagerSSHEditRequest: Codable {
    public let keyID: String
    public let name: String?
    public let revision: String
    public let sourceEntryID: String?

    public enum CodingKeys: String, CodingKey {
        case keyID = "key_id"
        case name = "name"
        case revision = "revision"
        case sourceEntryID = "source_entry_id"
    }

    public init(keyID: String, name: String?, revision: String, sourceEntryID: String?) {
        self.keyID = keyID
        self.name = name
        self.revision = revision
        self.sourceEntryID = sourceEntryID
    }
}

// MARK: PassmanagerSSHEditRequest convenience initializers and mutators

public extension PassmanagerSSHEditRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerSSHEditRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        keyID: String? = nil,
        name: String?? = nil,
        revision: String? = nil,
        sourceEntryID: String?? = nil
    ) -> PassmanagerSSHEditRequest {
        return PassmanagerSSHEditRequest(
            keyID: keyID ?? self.keyID,
            name: name ?? self.name,
            revision: revision ?? self.revision,
            sourceEntryID: sourceEntryID ?? self.sourceEntryID
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerSSHExportRequest
public struct PassmanagerSSHExportRequest: Codable {
    public let format: String
    public let keyID: String
    public let passphrase: String?

    public enum CodingKeys: String, CodingKey {
        case format = "format"
        case keyID = "key_id"
        case passphrase = "passphrase"
    }

    public init(format: String, keyID: String, passphrase: String?) {
        self.format = format
        self.keyID = keyID
        self.passphrase = passphrase
    }
}

// MARK: PassmanagerSSHExportRequest convenience initializers and mutators

public extension PassmanagerSSHExportRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerSSHExportRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        format: String? = nil,
        keyID: String? = nil,
        passphrase: String?? = nil
    ) -> PassmanagerSSHExportRequest {
        return PassmanagerSSHExportRequest(
            format: format ?? self.format,
            keyID: keyID ?? self.keyID,
            passphrase: passphrase ?? self.passphrase
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerSSHExportResponse
public struct PassmanagerSSHExportResponse: Codable {
    public let content: String
    public let filename: String

    public enum CodingKeys: String, CodingKey {
        case content = "content"
        case filename = "filename"
    }

    public init(content: String, filename: String) {
        self.content = content
        self.filename = filename
    }
}

// MARK: PassmanagerSSHExportResponse convenience initializers and mutators

public extension PassmanagerSSHExportResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerSSHExportResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        content: String? = nil,
        filename: String? = nil
    ) -> PassmanagerSSHExportResponse {
        return PassmanagerSSHExportResponse(
            content: content ?? self.content,
            filename: filename ?? self.filename
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerSSHImportRequest
public struct PassmanagerSSHImportRequest: Codable {
    public let name: String?
    public let passphrase: String?
    public let privateKey: String
    public let sourceEntryID: String?

    public enum CodingKeys: String, CodingKey {
        case name = "name"
        case passphrase = "passphrase"
        case privateKey = "private_key"
        case sourceEntryID = "source_entry_id"
    }

    public init(name: String?, passphrase: String?, privateKey: String, sourceEntryID: String?) {
        self.name = name
        self.passphrase = passphrase
        self.privateKey = privateKey
        self.sourceEntryID = sourceEntryID
    }
}

// MARK: PassmanagerSSHImportRequest convenience initializers and mutators

public extension PassmanagerSSHImportRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerSSHImportRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        name: String?? = nil,
        passphrase: String?? = nil,
        privateKey: String? = nil,
        sourceEntryID: String?? = nil
    ) -> PassmanagerSSHImportRequest {
        return PassmanagerSSHImportRequest(
            name: name ?? self.name,
            passphrase: passphrase ?? self.passphrase,
            privateKey: privateKey ?? self.privateKey,
            sourceEntryID: sourceEntryID ?? self.sourceEntryID
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerSSHKeygenRequest
public struct PassmanagerSSHKeygenRequest: Codable {
    public let comment: String?
    public let keyType: String
    public let name: String?
    public let sourceEntryID: String?

    public enum CodingKeys: String, CodingKey {
        case comment = "comment"
        case keyType = "key_type"
        case name = "name"
        case sourceEntryID = "source_entry_id"
    }

    public init(comment: String?, keyType: String, name: String?, sourceEntryID: String?) {
        self.comment = comment
        self.keyType = keyType
        self.name = name
        self.sourceEntryID = sourceEntryID
    }
}

// MARK: PassmanagerSSHKeygenRequest convenience initializers and mutators

public extension PassmanagerSSHKeygenRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerSSHKeygenRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        comment: String?? = nil,
        keyType: String? = nil,
        name: String?? = nil,
        sourceEntryID: String?? = nil
    ) -> PassmanagerSSHKeygenRequest {
        return PassmanagerSSHKeygenRequest(
            comment: comment ?? self.comment,
            keyType: keyType ?? self.keyType,
            name: name ?? self.name,
            sourceEntryID: sourceEntryID ?? self.sourceEntryID
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerSSHKeyCreateResponse
public struct PassmanagerSSHKeyCreateResponse: Codable {
    public let fingerprint: String
    public let keyID: String
    public let keyType: String
    public let publicKeyOpenssh: String

    public enum CodingKeys: String, CodingKey {
        case fingerprint = "fingerprint"
        case keyID = "key_id"
        case keyType = "key_type"
        case publicKeyOpenssh = "public_key_openssh"
    }

    public init(fingerprint: String, keyID: String, keyType: String, publicKeyOpenssh: String) {
        self.fingerprint = fingerprint
        self.keyID = keyID
        self.keyType = keyType
        self.publicKeyOpenssh = publicKeyOpenssh
    }
}

// MARK: PassmanagerSSHKeyCreateResponse convenience initializers and mutators

public extension PassmanagerSSHKeyCreateResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerSSHKeyCreateResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        fingerprint: String? = nil,
        keyID: String? = nil,
        keyType: String? = nil,
        publicKeyOpenssh: String? = nil
    ) -> PassmanagerSSHKeyCreateResponse {
        return PassmanagerSSHKeyCreateResponse(
            fingerprint: fingerprint ?? self.fingerprint,
            keyID: keyID ?? self.keyID,
            keyType: keyType ?? self.keyType,
            publicKeyOpenssh: publicKeyOpenssh ?? self.publicKeyOpenssh
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerSSHPageRequest
public struct PassmanagerSSHPageRequest: Codable {
    public let keyType: String?
    public let limit: Int
    public let offset: Int
    public let query: String?
    public let revision: String?
    public let sourceEntryID: String?

    public enum CodingKeys: String, CodingKey {
        case keyType = "key_type"
        case limit = "limit"
        case offset = "offset"
        case query = "query"
        case revision = "revision"
        case sourceEntryID = "source_entry_id"
    }

    public init(keyType: String?, limit: Int, offset: Int, query: String?, revision: String?, sourceEntryID: String?) {
        self.keyType = keyType
        self.limit = limit
        self.offset = offset
        self.query = query
        self.revision = revision
        self.sourceEntryID = sourceEntryID
    }
}

// MARK: PassmanagerSSHPageRequest convenience initializers and mutators

public extension PassmanagerSSHPageRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerSSHPageRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        keyType: String?? = nil,
        limit: Int? = nil,
        offset: Int? = nil,
        query: String?? = nil,
        revision: String?? = nil,
        sourceEntryID: String?? = nil
    ) -> PassmanagerSSHPageRequest {
        return PassmanagerSSHPageRequest(
            keyType: keyType ?? self.keyType,
            limit: limit ?? self.limit,
            offset: offset ?? self.offset,
            query: query ?? self.query,
            revision: revision ?? self.revision,
            sourceEntryID: sourceEntryID ?? self.sourceEntryID
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerSSHPageResponse
public struct PassmanagerSSHPageResponse: Codable {
    public let keys: [SSHKeySummary]
    public let nextOffset: Int?
    public let revision: String
    public let totalCount: Int

    public enum CodingKeys: String, CodingKey {
        case keys = "keys"
        case nextOffset = "next_offset"
        case revision = "revision"
        case totalCount = "total_count"
    }

    public init(keys: [SSHKeySummary], nextOffset: Int?, revision: String, totalCount: Int) {
        self.keys = keys
        self.nextOffset = nextOffset
        self.revision = revision
        self.totalCount = totalCount
    }
}

// MARK: PassmanagerSSHPageResponse convenience initializers and mutators

public extension PassmanagerSSHPageResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerSSHPageResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        keys: [SSHKeySummary]? = nil,
        nextOffset: Int?? = nil,
        revision: String? = nil,
        totalCount: Int? = nil
    ) -> PassmanagerSSHPageResponse {
        return PassmanagerSSHPageResponse(
            keys: keys ?? self.keys,
            nextOffset: nextOffset ?? self.nextOffset,
            revision: revision ?? self.revision,
            totalCount: totalCount ?? self.totalCount
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - SSHKeySummary
public struct SSHKeySummary: Codable {
    public let key: SSHKeyMetadata
    public let revision: String
    public let sourcePath: String?
    public let sourceTitle: String?

    public enum CodingKeys: String, CodingKey {
        case key = "key"
        case revision = "revision"
        case sourcePath = "source_path"
        case sourceTitle = "source_title"
    }

    public init(key: SSHKeyMetadata, revision: String, sourcePath: String?, sourceTitle: String?) {
        self.key = key
        self.revision = revision
        self.sourcePath = sourcePath
        self.sourceTitle = sourceTitle
    }
}

// MARK: SSHKeySummary convenience initializers and mutators

public extension SSHKeySummary {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(SSHKeySummary.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        key: SSHKeyMetadata? = nil,
        revision: String? = nil,
        sourcePath: String?? = nil,
        sourceTitle: String?? = nil
    ) -> SSHKeySummary {
        return SSHKeySummary(
            key: key ?? self.key,
            revision: revision ?? self.revision,
            sourcePath: sourcePath ?? self.sourcePath,
            sourceTitle: sourceTitle ?? self.sourceTitle
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - SSHKeyMetadata
public struct SSHKeyMetadata: Codable {
    public let comment: String?
    public let createdTs: Int?
    public let fingerprint: String
    public let id: String
    public let name: String?
    public let sourceEntryID: String?
    public let type: String
    public let updatedTs: Int?

    public enum CodingKeys: String, CodingKey {
        case comment = "comment"
        case createdTs = "createdTs"
        case fingerprint = "fingerprint"
        case id = "id"
        case name = "name"
        case sourceEntryID = "sourceEntryId"
        case type = "type"
        case updatedTs = "updatedTs"
    }

    public init(comment: String?, createdTs: Int?, fingerprint: String, id: String, name: String?, sourceEntryID: String?, type: String, updatedTs: Int?) {
        self.comment = comment
        self.createdTs = createdTs
        self.fingerprint = fingerprint
        self.id = id
        self.name = name
        self.sourceEntryID = sourceEntryID
        self.type = type
        self.updatedTs = updatedTs
    }
}

// MARK: SSHKeyMetadata convenience initializers and mutators

public extension SSHKeyMetadata {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(SSHKeyMetadata.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        comment: String?? = nil,
        createdTs: Int?? = nil,
        fingerprint: String? = nil,
        id: String? = nil,
        name: String?? = nil,
        sourceEntryID: String?? = nil,
        type: String? = nil,
        updatedTs: Int?? = nil
    ) -> SSHKeyMetadata {
        return SSHKeyMetadata(
            comment: comment ?? self.comment,
            createdTs: createdTs ?? self.createdTs,
            fingerprint: fingerprint ?? self.fingerprint,
            id: id ?? self.id,
            name: name ?? self.name,
            sourceEntryID: sourceEntryID ?? self.sourceEntryID,
            type: type ?? self.type,
            updatedTs: updatedTs ?? self.updatedTs
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Vault status response
// MARK: - VaultStatusResponse
public struct VaultStatusResponse: Codable {
    public let isUnlocked: Bool
    public let sessionStartedAt: Int?

    public enum CodingKeys: String, CodingKey {
        case isUnlocked = "is_unlocked"
        case sessionStartedAt = "session_started_at"
    }

    public init(isUnlocked: Bool, sessionStartedAt: Int?) {
        self.isUnlocked = isUnlocked
        self.sessionStartedAt = sessionStartedAt
    }
}

// MARK: VaultStatusResponse convenience initializers and mutators

public extension VaultStatusResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(VaultStatusResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        isUnlocked: Bool? = nil,
        sessionStartedAt: Int?? = nil
    ) -> VaultStatusResponse {
        return VaultStatusResponse(
            isUnlocked: isUnlocked ?? self.isUnlocked,
            sessionStartedAt: sessionStartedAt ?? self.sessionStartedAt
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerTagDeleteRequest
public struct PassmanagerTagDeleteRequest: Codable {
    public let key: String

    public enum CodingKeys: String, CodingKey {
        case key = "key"
    }

    public init(key: String) {
        self.key = key
    }
}

// MARK: PassmanagerTagDeleteRequest convenience initializers and mutators

public extension PassmanagerTagDeleteRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerTagDeleteRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        key: String? = nil
    ) -> PassmanagerTagDeleteRequest {
        return PassmanagerTagDeleteRequest(
            key: key ?? self.key
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerTagPageResponse
public struct PassmanagerTagPageResponse: Codable {
    public let nextOffset: Int?
    public let tags: [CredentialTagSummary]

    public enum CodingKeys: String, CodingKey {
        case nextOffset = "next_offset"
        case tags = "tags"
    }

    public init(nextOffset: Int?, tags: [CredentialTagSummary]) {
        self.nextOffset = nextOffset
        self.tags = tags
    }
}

// MARK: PassmanagerTagPageResponse convenience initializers and mutators

public extension PassmanagerTagPageResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerTagPageResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        nextOffset: Int?? = nil,
        tags: [CredentialTagSummary]? = nil
    ) -> PassmanagerTagPageResponse {
        return PassmanagerTagPageResponse(
            nextOffset: nextOffset ?? self.nextOffset,
            tags: tags ?? self.tags
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Metadata-only catalog merged with tags assigned to credentials.
// MARK: - CredentialTagSummary
public struct CredentialTagSummary: Codable {
    public let colorID: String
    public let count: Int
    public let key: String
    public let label: String

    public enum CodingKeys: String, CodingKey {
        case colorID = "color_id"
        case count = "count"
        case key = "key"
        case label = "label"
    }

    public init(colorID: String, count: Int, key: String, label: String) {
        self.colorID = colorID
        self.count = count
        self.key = key
        self.label = label
    }
}

// MARK: CredentialTagSummary convenience initializers and mutators

public extension CredentialTagSummary {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CredentialTagSummary.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        colorID: String? = nil,
        count: Int? = nil,
        key: String? = nil,
        label: String? = nil
    ) -> CredentialTagSummary {
        return CredentialTagSummary(
            colorID: colorID ?? self.colorID,
            count: count ?? self.count,
            key: key ?? self.key,
            label: label ?? self.label
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerTagPageRequest
public struct PassmanagerTagPageRequest: Codable {
    public let limit: Int
    public let offset: Int

    public enum CodingKeys: String, CodingKey {
        case limit = "limit"
        case offset = "offset"
    }

    public init(limit: Int, offset: Int) {
        self.limit = limit
        self.offset = offset
    }
}

// MARK: PassmanagerTagPageRequest convenience initializers and mutators

public extension PassmanagerTagPageRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerTagPageRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        limit: Int? = nil,
        offset: Int? = nil
    ) -> PassmanagerTagPageRequest {
        return PassmanagerTagPageRequest(
            limit: limit ?? self.limit,
            offset: offset ?? self.offset
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerTagSaveRequest
public struct PassmanagerTagSaveRequest: Codable {
    public let colorID: String
    public let label: String
    public let sourceKey: String?

    public enum CodingKeys: String, CodingKey {
        case colorID = "color_id"
        case label = "label"
        case sourceKey = "source_key"
    }

    public init(colorID: String, label: String, sourceKey: String?) {
        self.colorID = colorID
        self.label = label
        self.sourceKey = sourceKey
    }
}

// MARK: PassmanagerTagSaveRequest convenience initializers and mutators

public extension PassmanagerTagSaveRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerTagSaveRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        colorID: String? = nil,
        label: String? = nil,
        sourceKey: String?? = nil
    ) -> PassmanagerTagSaveRequest {
        return PassmanagerTagSaveRequest(
            colorID: colorID ?? self.colorID,
            label: label ?? self.label,
            sourceKey: sourceKey ?? self.sourceKey
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Vault password rekey result.
// MARK: - VaultRekeyResponse
public struct VaultRekeyResponse: Codable {
    public let backupRecommended: Bool
    public let deletedDerivativeChunks: Int
    public let deletedOldChunks: Int
    public let durationMS: Int
    public let migratedChunks: Int
    public let preservedUnknownChunks: Int

    public enum CodingKeys: String, CodingKey {
        case backupRecommended = "backup_recommended"
        case deletedDerivativeChunks = "deleted_derivative_chunks"
        case deletedOldChunks = "deleted_old_chunks"
        case durationMS = "duration_ms"
        case migratedChunks = "migrated_chunks"
        case preservedUnknownChunks = "preserved_unknown_chunks"
    }

    public init(backupRecommended: Bool, deletedDerivativeChunks: Int, deletedOldChunks: Int, durationMS: Int, migratedChunks: Int, preservedUnknownChunks: Int) {
        self.backupRecommended = backupRecommended
        self.deletedDerivativeChunks = deletedDerivativeChunks
        self.deletedOldChunks = deletedOldChunks
        self.durationMS = durationMS
        self.migratedChunks = migratedChunks
        self.preservedUnknownChunks = preservedUnknownChunks
    }
}

// MARK: VaultRekeyResponse convenience initializers and mutators

public extension VaultRekeyResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(VaultRekeyResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        backupRecommended: Bool? = nil,
        deletedDerivativeChunks: Int? = nil,
        deletedOldChunks: Int? = nil,
        durationMS: Int? = nil,
        migratedChunks: Int? = nil,
        preservedUnknownChunks: Int? = nil
    ) -> VaultRekeyResponse {
        return VaultRekeyResponse(
            backupRecommended: backupRecommended ?? self.backupRecommended,
            deletedDerivativeChunks: deletedDerivativeChunks ?? self.deletedDerivativeChunks,
            deletedOldChunks: deletedOldChunks ?? self.deletedOldChunks,
            durationMS: durationMS ?? self.durationMS,
            migratedChunks: migratedChunks ?? self.migratedChunks,
            preservedUnknownChunks: preservedUnknownChunks ?? self.preservedUnknownChunks
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Canonical `vault:rekey` wire request; Core owns validation and migration.
// MARK: - VaultRekeyRequest
public struct VaultRekeyRequest: Codable {
    public let currentPassword: String
    public let newPassword: String

    public enum CodingKeys: String, CodingKey {
        case currentPassword = "current_password"
        case newPassword = "new_password"
    }

    public init(currentPassword: String, newPassword: String) {
        self.currentPassword = currentPassword
        self.newPassword = newPassword
    }
}

// MARK: VaultRekeyRequest convenience initializers and mutators

public extension VaultRekeyRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(VaultRekeyRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        currentPassword: String? = nil,
        newPassword: String? = nil
    ) -> VaultRekeyRequest {
        return VaultRekeyRequest(
            currentPassword: currentPassword ?? self.currentPassword,
            newPassword: newPassword ?? self.newPassword
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletAccountsListResponse
public struct WalletAccountsListResponse: Codable {
    public let accounts: [WalletAccountMeta]
    public let cachedBalances: [WalletBalanceGetResponse]?

    public enum CodingKeys: String, CodingKey {
        case accounts = "accounts"
        case cachedBalances = "cached_balances"
    }

    public init(accounts: [WalletAccountMeta], cachedBalances: [WalletBalanceGetResponse]?) {
        self.accounts = accounts
        self.cachedBalances = cachedBalances
    }
}

// MARK: WalletAccountsListResponse convenience initializers and mutators

public extension WalletAccountsListResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletAccountsListResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        accounts: [WalletAccountMeta]? = nil,
        cachedBalances: [WalletBalanceGetResponse]?? = nil
    ) -> WalletAccountsListResponse {
        return WalletAccountsListResponse(
            accounts: accounts ?? self.accounts,
            cachedBalances: cachedBalances ?? self.cachedBalances
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletAccountMeta
public struct WalletAccountMeta: Codable {
    public let accountID: String
    public let address: String?
    public let createdAt: Int
    public let curve: String?
    public let kind: WalletAccountMetaKind
    public let label: String?
    public let network: String
    public let publicKey: String?
    public let rawAccount: String?
    public let updatedAt: Int
    public let walletContract: String?
    public let walletID: String
    public let workchain: Int?
    public let accountIndex: Int?
    public let accountModel: String?
    public let currentReceiveAddress: String?
    public let currentReceiveDerivationPath: String?
    public let derivationPath: String?
    public let derivationProfile: String?
    public let mnemonicStandard: String?
    public let nextChangeIndex: Int?
    public let nextReceiveIndex: Int?
    public let walletMode: String?

    public enum CodingKeys: String, CodingKey {
        case accountID = "account_id"
        case address = "address"
        case createdAt = "created_at"
        case curve = "curve"
        case kind = "kind"
        case label = "label"
        case network = "network"
        case publicKey = "public_key"
        case rawAccount = "raw_account"
        case updatedAt = "updated_at"
        case walletContract = "wallet_contract"
        case walletID = "wallet_id"
        case workchain = "workchain"
        case accountIndex = "account_index"
        case accountModel = "account_model"
        case currentReceiveAddress = "current_receive_address"
        case currentReceiveDerivationPath = "current_receive_derivation_path"
        case derivationPath = "derivation_path"
        case derivationProfile = "derivation_profile"
        case mnemonicStandard = "mnemonic_standard"
        case nextChangeIndex = "next_change_index"
        case nextReceiveIndex = "next_receive_index"
        case walletMode = "wallet_mode"
    }

    public init(accountID: String, address: String?, createdAt: Int, curve: String?, kind: WalletAccountMetaKind, label: String?, network: String, publicKey: String?, rawAccount: String?, updatedAt: Int, walletContract: String?, walletID: String, workchain: Int?, accountIndex: Int?, accountModel: String?, currentReceiveAddress: String?, currentReceiveDerivationPath: String?, derivationPath: String?, derivationProfile: String?, mnemonicStandard: String?, nextChangeIndex: Int?, nextReceiveIndex: Int?, walletMode: String?) {
        self.accountID = accountID
        self.address = address
        self.createdAt = createdAt
        self.curve = curve
        self.kind = kind
        self.label = label
        self.network = network
        self.publicKey = publicKey
        self.rawAccount = rawAccount
        self.updatedAt = updatedAt
        self.walletContract = walletContract
        self.walletID = walletID
        self.workchain = workchain
        self.accountIndex = accountIndex
        self.accountModel = accountModel
        self.currentReceiveAddress = currentReceiveAddress
        self.currentReceiveDerivationPath = currentReceiveDerivationPath
        self.derivationPath = derivationPath
        self.derivationProfile = derivationProfile
        self.mnemonicStandard = mnemonicStandard
        self.nextChangeIndex = nextChangeIndex
        self.nextReceiveIndex = nextReceiveIndex
        self.walletMode = walletMode
    }
}

// MARK: WalletAccountMeta convenience initializers and mutators

public extension WalletAccountMeta {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletAccountMeta.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        accountID: String? = nil,
        address: String?? = nil,
        createdAt: Int? = nil,
        curve: String?? = nil,
        kind: WalletAccountMetaKind? = nil,
        label: String?? = nil,
        network: String? = nil,
        publicKey: String?? = nil,
        rawAccount: String?? = nil,
        updatedAt: Int? = nil,
        walletContract: String?? = nil,
        walletID: String? = nil,
        workchain: Int?? = nil,
        accountIndex: Int?? = nil,
        accountModel: String?? = nil,
        currentReceiveAddress: String?? = nil,
        currentReceiveDerivationPath: String?? = nil,
        derivationPath: String?? = nil,
        derivationProfile: String?? = nil,
        mnemonicStandard: String?? = nil,
        nextChangeIndex: Int?? = nil,
        nextReceiveIndex: Int?? = nil,
        walletMode: String?? = nil
    ) -> WalletAccountMeta {
        return WalletAccountMeta(
            accountID: accountID ?? self.accountID,
            address: address ?? self.address,
            createdAt: createdAt ?? self.createdAt,
            curve: curve ?? self.curve,
            kind: kind ?? self.kind,
            label: label ?? self.label,
            network: network ?? self.network,
            publicKey: publicKey ?? self.publicKey,
            rawAccount: rawAccount ?? self.rawAccount,
            updatedAt: updatedAt ?? self.updatedAt,
            walletContract: walletContract ?? self.walletContract,
            walletID: walletID ?? self.walletID,
            workchain: workchain ?? self.workchain,
            accountIndex: accountIndex ?? self.accountIndex,
            accountModel: accountModel ?? self.accountModel,
            currentReceiveAddress: currentReceiveAddress ?? self.currentReceiveAddress,
            currentReceiveDerivationPath: currentReceiveDerivationPath ?? self.currentReceiveDerivationPath,
            derivationPath: derivationPath ?? self.derivationPath,
            derivationProfile: derivationProfile ?? self.derivationProfile,
            mnemonicStandard: mnemonicStandard ?? self.mnemonicStandard,
            nextChangeIndex: nextChangeIndex ?? self.nextChangeIndex,
            nextReceiveIndex: nextReceiveIndex ?? self.nextReceiveIndex,
            walletMode: walletMode ?? self.walletMode
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

public enum WalletAccountMetaKind: String, Codable {
    case derived = "derived"
    case imported = "imported"
}

// MARK: - WalletBalanceGetResponse
public struct WalletBalanceGetResponse: Codable {
    public let accountID: String
    public let balance: WalletBalance
    public let fetchedAt: Int
    public let network: String

    public enum CodingKeys: String, CodingKey {
        case accountID = "account_id"
        case balance = "balance"
        case fetchedAt = "fetched_at"
        case network = "network"
    }

    public init(accountID: String, balance: WalletBalance, fetchedAt: Int, network: String) {
        self.accountID = accountID
        self.balance = balance
        self.fetchedAt = fetchedAt
        self.network = network
    }
}

// MARK: WalletBalanceGetResponse convenience initializers and mutators

public extension WalletBalanceGetResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletBalanceGetResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        accountID: String? = nil,
        balance: WalletBalance? = nil,
        fetchedAt: Int? = nil,
        network: String? = nil
    ) -> WalletBalanceGetResponse {
        return WalletBalanceGetResponse(
            accountID: accountID ?? self.accountID,
            balance: balance ?? self.balance,
            fetchedAt: fetchedAt ?? self.fetchedAt,
            network: network ?? self.network
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletBalance
public struct WalletBalance: Codable {
    public let amountUnit: String
    public let pendingIn: String
    public let pendingOut: String
    public let spendable: String
    public let total: String

    public enum CodingKeys: String, CodingKey {
        case amountUnit = "amount_unit"
        case pendingIn = "pending_in"
        case pendingOut = "pending_out"
        case spendable = "spendable"
        case total = "total"
    }

    public init(amountUnit: String, pendingIn: String, pendingOut: String, spendable: String, total: String) {
        self.amountUnit = amountUnit
        self.pendingIn = pendingIn
        self.pendingOut = pendingOut
        self.spendable = spendable
        self.total = total
    }
}

// MARK: WalletBalance convenience initializers and mutators

public extension WalletBalance {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletBalance.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        amountUnit: String? = nil,
        pendingIn: String? = nil,
        pendingOut: String? = nil,
        spendable: String? = nil,
        total: String? = nil
    ) -> WalletBalance {
        return WalletBalance(
            amountUnit: amountUnit ?? self.amountUnit,
            pendingIn: pendingIn ?? self.pendingIn,
            pendingOut: pendingOut ?? self.pendingOut,
            spendable: spendable ?? self.spendable,
            total: total ?? self.total
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletAccountsListRequest
public struct WalletAccountsListRequest: Codable {
    public let walletID: String?

    public enum CodingKeys: String, CodingKey {
        case walletID = "wallet_id"
    }

    public init(walletID: String?) {
        self.walletID = walletID
    }
}

// MARK: WalletAccountsListRequest convenience initializers and mutators

public extension WalletAccountsListRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletAccountsListRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        walletID: String?? = nil
    ) -> WalletAccountsListRequest {
        return WalletAccountsListRequest(
            walletID: walletID ?? self.walletID
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletAddressesDeriveResponse
public struct WalletAddressesDeriveResponse: Codable {
    public let accountID: String
    public let address: String
    public let derivationPath: String
    public let index: Int
    public let publicKey: String
    public let purpose: String

    public enum CodingKeys: String, CodingKey {
        case accountID = "account_id"
        case address = "address"
        case derivationPath = "derivation_path"
        case index = "index"
        case publicKey = "public_key"
        case purpose = "purpose"
    }

    public init(accountID: String, address: String, derivationPath: String, index: Int, publicKey: String, purpose: String) {
        self.accountID = accountID
        self.address = address
        self.derivationPath = derivationPath
        self.index = index
        self.publicKey = publicKey
        self.purpose = purpose
    }
}

// MARK: WalletAddressesDeriveResponse convenience initializers and mutators

public extension WalletAddressesDeriveResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletAddressesDeriveResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        accountID: String? = nil,
        address: String? = nil,
        derivationPath: String? = nil,
        index: Int? = nil,
        publicKey: String? = nil,
        purpose: String? = nil
    ) -> WalletAddressesDeriveResponse {
        return WalletAddressesDeriveResponse(
            accountID: accountID ?? self.accountID,
            address: address ?? self.address,
            derivationPath: derivationPath ?? self.derivationPath,
            index: index ?? self.index,
            publicKey: publicKey ?? self.publicKey,
            purpose: purpose ?? self.purpose
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Address-first Send: asks every registered chain profile whether it accepts the address.
// MARK: - WalletAddressDetectRequest
public struct WalletAddressDetectRequest: Codable {
    public let address: String

    public enum CodingKeys: String, CodingKey {
        case address = "address"
    }

    public init(address: String) {
        self.address = address
    }
}

// MARK: WalletAddressDetectRequest convenience initializers and mutators

public extension WalletAddressDetectRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletAddressDetectRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        address: String? = nil
    ) -> WalletAddressDetectRequest {
        return WalletAddressDetectRequest(
            address: address ?? self.address
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// `network` and `normalized_address` are set only when exactly one registered network
/// accepts
/// the address; `candidates` lists every accepting network (sorted) so a client can still
/// ask
/// the user when formats overlap.
// MARK: - WalletAddressDetectResponse
public struct WalletAddressDetectResponse: Codable {
    public let address: String
    public let candidates: [String]
    public let network: String?
    public let normalizedAddress: String?

    public enum CodingKeys: String, CodingKey {
        case address = "address"
        case candidates = "candidates"
        case network = "network"
        case normalizedAddress = "normalized_address"
    }

    public init(address: String, candidates: [String], network: String?, normalizedAddress: String?) {
        self.address = address
        self.candidates = candidates
        self.network = network
        self.normalizedAddress = normalizedAddress
    }
}

// MARK: WalletAddressDetectResponse convenience initializers and mutators

public extension WalletAddressDetectResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletAddressDetectResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        address: String? = nil,
        candidates: [String]? = nil,
        network: String?? = nil,
        normalizedAddress: String?? = nil
    ) -> WalletAddressDetectResponse {
        return WalletAddressDetectResponse(
            address: address ?? self.address,
            candidates: candidates ?? self.candidates,
            network: network ?? self.network,
            normalizedAddress: normalizedAddress ?? self.normalizedAddress
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletAddressesDeriveRequest
public struct WalletAddressesDeriveRequest: Codable {
    public let accountID: String
    public let purpose: String

    public enum CodingKeys: String, CodingKey {
        case accountID = "account_id"
        case purpose = "purpose"
    }

    public init(accountID: String, purpose: String) {
        self.accountID = accountID
        self.purpose = purpose
    }
}

// MARK: WalletAddressesDeriveRequest convenience initializers and mutators

public extension WalletAddressesDeriveRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletAddressesDeriveRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        accountID: String? = nil,
        purpose: String? = nil
    ) -> WalletAddressesDeriveRequest {
        return WalletAddressesDeriveRequest(
            accountID: accountID ?? self.accountID,
            purpose: purpose ?? self.purpose
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletBalanceGetRequest
public struct WalletBalanceGetRequest: Codable {
    public let accountID: String
    public let discoverAddresses: Bool?

    public enum CodingKeys: String, CodingKey {
        case accountID = "account_id"
        case discoverAddresses = "discover_addresses"
    }

    public init(accountID: String, discoverAddresses: Bool?) {
        self.accountID = accountID
        self.discoverAddresses = discoverAddresses
    }
}

// MARK: WalletBalanceGetRequest convenience initializers and mutators

public extension WalletBalanceGetRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletBalanceGetRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        accountID: String? = nil,
        discoverAddresses: Bool?? = nil
    ) -> WalletBalanceGetRequest {
        return WalletBalanceGetRequest(
            accountID: accountID ?? self.accountID,
            discoverAddresses: discoverAddresses ?? self.discoverAddresses
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletTransactionCancelRequest
public struct WalletTransactionCancelRequest: Codable {
    public let preparationID: String

    public enum CodingKeys: String, CodingKey {
        case preparationID = "preparation_id"
    }

    public init(preparationID: String) {
        self.preparationID = preparationID
    }
}

// MARK: WalletTransactionCancelRequest convenience initializers and mutators

public extension WalletTransactionCancelRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletTransactionCancelRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        preparationID: String? = nil
    ) -> WalletTransactionCancelRequest {
        return WalletTransactionCancelRequest(
            preparationID: preparationID ?? self.preparationID
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletTransactionCancelResponse
public struct WalletTransactionCancelResponse: Codable {
    public let cancelled: Bool

    public enum CodingKeys: String, CodingKey {
        case cancelled = "cancelled"
    }

    public init(cancelled: Bool) {
        self.cancelled = cancelled
    }
}

// MARK: WalletTransactionCancelResponse convenience initializers and mutators

public extension WalletTransactionCancelResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletTransactionCancelResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        cancelled: Bool? = nil
    ) -> WalletTransactionCancelResponse {
        return WalletTransactionCancelResponse(
            cancelled: cancelled ?? self.cancelled
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletTransactionConfirmRequest
public struct WalletTransactionConfirmRequest: Codable {
    public let acceptedWarnings: [String]
    public let masterPassword: String?
    public let preparationID: String
    public let spendAuthorizationID: String?

    public enum CodingKeys: String, CodingKey {
        case acceptedWarnings = "accepted_warnings"
        case masterPassword = "master_password"
        case preparationID = "preparation_id"
        case spendAuthorizationID = "spend_authorization_id"
    }

    public init(acceptedWarnings: [String], masterPassword: String?, preparationID: String, spendAuthorizationID: String?) {
        self.acceptedWarnings = acceptedWarnings
        self.masterPassword = masterPassword
        self.preparationID = preparationID
        self.spendAuthorizationID = spendAuthorizationID
    }
}

// MARK: WalletTransactionConfirmRequest convenience initializers and mutators

public extension WalletTransactionConfirmRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletTransactionConfirmRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        acceptedWarnings: [String]? = nil,
        masterPassword: String?? = nil,
        preparationID: String? = nil,
        spendAuthorizationID: String?? = nil
    ) -> WalletTransactionConfirmRequest {
        return WalletTransactionConfirmRequest(
            acceptedWarnings: acceptedWarnings ?? self.acceptedWarnings,
            masterPassword: masterPassword ?? self.masterPassword,
            preparationID: preparationID ?? self.preparationID,
            spendAuthorizationID: spendAuthorizationID ?? self.spendAuthorizationID
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletTransactionConfirmResponse
public struct WalletTransactionConfirmResponse: Codable {
    public let network: String
    public let status: WalletConfirmStatus
    public let txHash: String?
    public let txRef: String

    public enum CodingKeys: String, CodingKey {
        case network = "network"
        case status = "status"
        case txHash = "tx_hash"
        case txRef = "tx_ref"
    }

    public init(network: String, status: WalletConfirmStatus, txHash: String?, txRef: String) {
        self.network = network
        self.status = status
        self.txHash = txHash
        self.txRef = txRef
    }
}

// MARK: WalletTransactionConfirmResponse convenience initializers and mutators

public extension WalletTransactionConfirmResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletTransactionConfirmResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        network: String? = nil,
        status: WalletConfirmStatus? = nil,
        txHash: String?? = nil,
        txRef: String? = nil
    ) -> WalletTransactionConfirmResponse {
        return WalletTransactionConfirmResponse(
            network: network ?? self.network,
            status: status ?? self.status,
            txHash: txHash ?? self.txHash,
            txRef: txRef ?? self.txRef
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

public enum WalletConfirmStatus: String, Codable {
    case broadcastUnknown = "broadcast_unknown"
    case pending = "pending"
}

// MARK: - WalletAddressBookCreateRequest
public struct WalletAddressBookCreateRequest: Codable {
    public let address: String
    public let label: String
    public let network: String

    public enum CodingKeys: String, CodingKey {
        case address = "address"
        case label = "label"
        case network = "network"
    }

    public init(address: String, label: String, network: String) {
        self.address = address
        self.label = label
        self.network = network
    }
}

// MARK: WalletAddressBookCreateRequest convenience initializers and mutators

public extension WalletAddressBookCreateRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletAddressBookCreateRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        address: String? = nil,
        label: String? = nil,
        network: String? = nil
    ) -> WalletAddressBookCreateRequest {
        return WalletAddressBookCreateRequest(
            address: address ?? self.address,
            label: label ?? self.label,
            network: network ?? self.network
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletAddressBookCreateResponse
public struct WalletAddressBookCreateResponse: Codable {
    public let entry: WalletAddressBookEntry

    public enum CodingKeys: String, CodingKey {
        case entry = "entry"
    }

    public init(entry: WalletAddressBookEntry) {
        self.entry = entry
    }
}

// MARK: WalletAddressBookCreateResponse convenience initializers and mutators

public extension WalletAddressBookCreateResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletAddressBookCreateResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        entry: WalletAddressBookEntry? = nil
    ) -> WalletAddressBookCreateResponse {
        return WalletAddressBookCreateResponse(
            entry: entry ?? self.entry
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletAddressBookEntry
public struct WalletAddressBookEntry: Codable {
    public let address: String
    public let createdAt: Int
    public let entryID: String
    public let label: String
    public let network: String
    public let updatedAt: Int

    public enum CodingKeys: String, CodingKey {
        case address = "address"
        case createdAt = "created_at"
        case entryID = "entry_id"
        case label = "label"
        case network = "network"
        case updatedAt = "updated_at"
    }

    public init(address: String, createdAt: Int, entryID: String, label: String, network: String, updatedAt: Int) {
        self.address = address
        self.createdAt = createdAt
        self.entryID = entryID
        self.label = label
        self.network = network
        self.updatedAt = updatedAt
    }
}

// MARK: WalletAddressBookEntry convenience initializers and mutators

public extension WalletAddressBookEntry {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletAddressBookEntry.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        address: String? = nil,
        createdAt: Int? = nil,
        entryID: String? = nil,
        label: String? = nil,
        network: String? = nil,
        updatedAt: Int? = nil
    ) -> WalletAddressBookEntry {
        return WalletAddressBookEntry(
            address: address ?? self.address,
            createdAt: createdAt ?? self.createdAt,
            entryID: entryID ?? self.entryID,
            label: label ?? self.label,
            network: network ?? self.network,
            updatedAt: updatedAt ?? self.updatedAt
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletAddressBookDeleteRequest
public struct WalletAddressBookDeleteRequest: Codable {
    public let entryID: String

    public enum CodingKeys: String, CodingKey {
        case entryID = "entry_id"
    }

    public init(entryID: String) {
        self.entryID = entryID
    }
}

// MARK: WalletAddressBookDeleteRequest convenience initializers and mutators

public extension WalletAddressBookDeleteRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletAddressBookDeleteRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        entryID: String? = nil
    ) -> WalletAddressBookDeleteRequest {
        return WalletAddressBookDeleteRequest(
            entryID: entryID ?? self.entryID
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletAddressBookDeleteResponse
public struct WalletAddressBookDeleteResponse: Codable {
    public let entryID: String

    public enum CodingKeys: String, CodingKey {
        case entryID = "entry_id"
    }

    public init(entryID: String) {
        self.entryID = entryID
    }
}

// MARK: WalletAddressBookDeleteResponse convenience initializers and mutators

public extension WalletAddressBookDeleteResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletAddressBookDeleteResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        entryID: String? = nil
    ) -> WalletAddressBookDeleteResponse {
        return WalletAddressBookDeleteResponse(
            entryID: entryID ?? self.entryID
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletAddressBookUpdateRequest
public struct WalletAddressBookUpdateRequest: Codable {
    public let address: String
    public let entryID: String
    public let label: String
    public let network: String

    public enum CodingKeys: String, CodingKey {
        case address = "address"
        case entryID = "entry_id"
        case label = "label"
        case network = "network"
    }

    public init(address: String, entryID: String, label: String, network: String) {
        self.address = address
        self.entryID = entryID
        self.label = label
        self.network = network
    }
}

// MARK: WalletAddressBookUpdateRequest convenience initializers and mutators

public extension WalletAddressBookUpdateRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletAddressBookUpdateRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        address: String? = nil,
        entryID: String? = nil,
        label: String? = nil,
        network: String? = nil
    ) -> WalletAddressBookUpdateRequest {
        return WalletAddressBookUpdateRequest(
            address: address ?? self.address,
            entryID: entryID ?? self.entryID,
            label: label ?? self.label,
            network: network ?? self.network
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletAddressBookUpdateResponse
public struct WalletAddressBookUpdateResponse: Codable {
    public let entry: WalletAddressBookEntry

    public enum CodingKeys: String, CodingKey {
        case entry = "entry"
    }

    public init(entry: WalletAddressBookEntry) {
        self.entry = entry
    }
}

// MARK: WalletAddressBookUpdateResponse convenience initializers and mutators

public extension WalletAddressBookUpdateResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletAddressBookUpdateResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        entry: WalletAddressBookEntry? = nil
    ) -> WalletAddressBookUpdateResponse {
        return WalletAddressBookUpdateResponse(
            entry: entry ?? self.entry
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletAddressBookListResponse
public struct WalletAddressBookListResponse: Codable {
    public let entries: [WalletAddressBookEntry]

    public enum CodingKeys: String, CodingKey {
        case entries = "entries"
    }

    public init(entries: [WalletAddressBookEntry]) {
        self.entries = entries
    }
}

// MARK: WalletAddressBookListResponse convenience initializers and mutators

public extension WalletAddressBookListResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletAddressBookListResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        entries: [WalletAddressBookEntry]? = nil
    ) -> WalletAddressBookListResponse {
        return WalletAddressBookListResponse(
            entries: entries ?? self.entries
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletHDCreateRequest
public struct WalletHDCreateRequest: Codable {
    public let bip39Passphrase: String?
    public let clientRequestID: String?
    public let label: String
    public let mnemonic: [String]?
    public let mnemonicDraftID: String?
    public let mnemonicStandard: String?
    public let supportedNetworks: [String]
    public let walletMode: String?
    public let wordlist: String

    public enum CodingKeys: String, CodingKey {
        case bip39Passphrase = "bip39_passphrase"
        case clientRequestID = "client_request_id"
        case label = "label"
        case mnemonic = "mnemonic"
        case mnemonicDraftID = "mnemonic_draft_id"
        case mnemonicStandard = "mnemonic_standard"
        case supportedNetworks = "supported_networks"
        case walletMode = "wallet_mode"
        case wordlist = "wordlist"
    }

    public init(bip39Passphrase: String?, clientRequestID: String?, label: String, mnemonic: [String]?, mnemonicDraftID: String?, mnemonicStandard: String?, supportedNetworks: [String], walletMode: String?, wordlist: String) {
        self.bip39Passphrase = bip39Passphrase
        self.clientRequestID = clientRequestID
        self.label = label
        self.mnemonic = mnemonic
        self.mnemonicDraftID = mnemonicDraftID
        self.mnemonicStandard = mnemonicStandard
        self.supportedNetworks = supportedNetworks
        self.walletMode = walletMode
        self.wordlist = wordlist
    }
}

// MARK: WalletHDCreateRequest convenience initializers and mutators

public extension WalletHDCreateRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletHDCreateRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        bip39Passphrase: String?? = nil,
        clientRequestID: String?? = nil,
        label: String? = nil,
        mnemonic: [String]?? = nil,
        mnemonicDraftID: String?? = nil,
        mnemonicStandard: String?? = nil,
        supportedNetworks: [String]? = nil,
        walletMode: String?? = nil,
        wordlist: String? = nil
    ) -> WalletHDCreateRequest {
        return WalletHDCreateRequest(
            bip39Passphrase: bip39Passphrase ?? self.bip39Passphrase,
            clientRequestID: clientRequestID ?? self.clientRequestID,
            label: label ?? self.label,
            mnemonic: mnemonic ?? self.mnemonic,
            mnemonicDraftID: mnemonicDraftID ?? self.mnemonicDraftID,
            mnemonicStandard: mnemonicStandard ?? self.mnemonicStandard,
            supportedNetworks: supportedNetworks ?? self.supportedNetworks,
            walletMode: walletMode ?? self.walletMode,
            wordlist: wordlist ?? self.wordlist
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletHDCreateResponse
public struct WalletHDCreateResponse: Codable {
    public let accounts: [WalletAccountMeta]
    public let walletID: String

    public enum CodingKeys: String, CodingKey {
        case accounts = "accounts"
        case walletID = "wallet_id"
    }

    public init(accounts: [WalletAccountMeta], walletID: String) {
        self.accounts = accounts
        self.walletID = walletID
    }
}

// MARK: WalletHDCreateResponse convenience initializers and mutators

public extension WalletHDCreateResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletHDCreateResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        accounts: [WalletAccountMeta]? = nil,
        walletID: String? = nil
    ) -> WalletHDCreateResponse {
        return WalletHDCreateResponse(
            accounts: accounts ?? self.accounts,
            walletID: walletID ?? self.walletID
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletAccountsDeriveRequest
public struct WalletAccountsDeriveRequest: Codable {
    public let network: String
    public let walletID: String

    public enum CodingKeys: String, CodingKey {
        case network = "network"
        case walletID = "wallet_id"
    }

    public init(network: String, walletID: String) {
        self.network = network
        self.walletID = walletID
    }
}

// MARK: WalletAccountsDeriveRequest convenience initializers and mutators

public extension WalletAccountsDeriveRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletAccountsDeriveRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        network: String? = nil,
        walletID: String? = nil
    ) -> WalletAccountsDeriveRequest {
        return WalletAccountsDeriveRequest(
            network: network ?? self.network,
            walletID: walletID ?? self.walletID
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletAccountsDeriveResponse
public struct WalletAccountsDeriveResponse: Codable {
    public let accountID: String

    public enum CodingKeys: String, CodingKey {
        case accountID = "account_id"
    }

    public init(accountID: String) {
        self.accountID = accountID
    }
}

// MARK: WalletAccountsDeriveResponse convenience initializers and mutators

public extension WalletAccountsDeriveResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletAccountsDeriveResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        accountID: String? = nil
    ) -> WalletAccountsDeriveResponse {
        return WalletAccountsDeriveResponse(
            accountID: accountID ?? self.accountID
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletTransactionsListResponse
public struct WalletTransactionsListResponse: Codable {
    public let nextCursor: String?
    public let transactions: [WalletTransactionEntry]

    public enum CodingKeys: String, CodingKey {
        case nextCursor = "next_cursor"
        case transactions = "transactions"
    }

    public init(nextCursor: String?, transactions: [WalletTransactionEntry]) {
        self.nextCursor = nextCursor
        self.transactions = transactions
    }
}

// MARK: WalletTransactionsListResponse convenience initializers and mutators

public extension WalletTransactionsListResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletTransactionsListResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        nextCursor: String?? = nil,
        transactions: [WalletTransactionEntry]? = nil
    ) -> WalletTransactionsListResponse {
        return WalletTransactionsListResponse(
            nextCursor: nextCursor ?? self.nextCursor,
            transactions: transactions ?? self.transactions
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletTransactionEntry
public struct WalletTransactionEntry: Codable {
    public let accountID: String
    public let amount: String
    public let amountUnit: String
    public let broadcastArtifactRef: String?
    public let counterparty: String?
    public let createdAt: Int
    public let direction: WalletTransactionDirection?
    public let fee: String
    public let messageRef: String?
    public let network: String
    public let status: String
    public let txHash: String?
    public let txRef: String
    public let updatedAt: Int
    public let validUntil: Int?
    public let walletID: String

    public enum CodingKeys: String, CodingKey {
        case accountID = "account_id"
        case amount = "amount"
        case amountUnit = "amount_unit"
        case broadcastArtifactRef = "broadcast_artifact_ref"
        case counterparty = "counterparty"
        case createdAt = "created_at"
        case direction = "direction"
        case fee = "fee"
        case messageRef = "message_ref"
        case network = "network"
        case status = "status"
        case txHash = "tx_hash"
        case txRef = "tx_ref"
        case updatedAt = "updated_at"
        case validUntil = "valid_until"
        case walletID = "wallet_id"
    }

    public init(accountID: String, amount: String, amountUnit: String, broadcastArtifactRef: String?, counterparty: String?, createdAt: Int, direction: WalletTransactionDirection?, fee: String, messageRef: String?, network: String, status: String, txHash: String?, txRef: String, updatedAt: Int, validUntil: Int?, walletID: String) {
        self.accountID = accountID
        self.amount = amount
        self.amountUnit = amountUnit
        self.broadcastArtifactRef = broadcastArtifactRef
        self.counterparty = counterparty
        self.createdAt = createdAt
        self.direction = direction
        self.fee = fee
        self.messageRef = messageRef
        self.network = network
        self.status = status
        self.txHash = txHash
        self.txRef = txRef
        self.updatedAt = updatedAt
        self.validUntil = validUntil
        self.walletID = walletID
    }
}

// MARK: WalletTransactionEntry convenience initializers and mutators

public extension WalletTransactionEntry {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletTransactionEntry.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        accountID: String? = nil,
        amount: String? = nil,
        amountUnit: String? = nil,
        broadcastArtifactRef: String?? = nil,
        counterparty: String?? = nil,
        createdAt: Int? = nil,
        direction: WalletTransactionDirection?? = nil,
        fee: String? = nil,
        messageRef: String?? = nil,
        network: String? = nil,
        status: String? = nil,
        txHash: String?? = nil,
        txRef: String? = nil,
        updatedAt: Int? = nil,
        validUntil: Int?? = nil,
        walletID: String? = nil
    ) -> WalletTransactionEntry {
        return WalletTransactionEntry(
            accountID: accountID ?? self.accountID,
            amount: amount ?? self.amount,
            amountUnit: amountUnit ?? self.amountUnit,
            broadcastArtifactRef: broadcastArtifactRef ?? self.broadcastArtifactRef,
            counterparty: counterparty ?? self.counterparty,
            createdAt: createdAt ?? self.createdAt,
            direction: direction ?? self.direction,
            fee: fee ?? self.fee,
            messageRef: messageRef ?? self.messageRef,
            network: network ?? self.network,
            status: status ?? self.status,
            txHash: txHash ?? self.txHash,
            txRef: txRef ?? self.txRef,
            updatedAt: updatedAt ?? self.updatedAt,
            validUntil: validUntil ?? self.validUntil,
            walletID: walletID ?? self.walletID
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

public enum WalletTransactionDirection: String, Codable {
    case incoming = "incoming"
    case outgoing = "outgoing"
    case unknown = "unknown"
}

// MARK: - WalletTransactionsListRequest
public struct WalletTransactionsListRequest: Codable {
    public let accountID: String?
    public let cursor: String?
    public let limit: Int?
    public let status: String?
    public let walletID: String?

    public enum CodingKeys: String, CodingKey {
        case accountID = "account_id"
        case cursor = "cursor"
        case limit = "limit"
        case status = "status"
        case walletID = "wallet_id"
    }

    public init(accountID: String?, cursor: String?, limit: Int?, status: String?, walletID: String?) {
        self.accountID = accountID
        self.cursor = cursor
        self.limit = limit
        self.status = status
        self.walletID = walletID
    }
}

// MARK: WalletTransactionsListRequest convenience initializers and mutators

public extension WalletTransactionsListRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletTransactionsListRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        accountID: String?? = nil,
        cursor: String?? = nil,
        limit: Int?? = nil,
        status: String?? = nil,
        walletID: String?? = nil
    ) -> WalletTransactionsListRequest {
        return WalletTransactionsListRequest(
            accountID: accountID ?? self.accountID,
            cursor: cursor ?? self.cursor,
            limit: limit ?? self.limit,
            status: status ?? self.status,
            walletID: walletID ?? self.walletID
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletTransactionsSyncRequest
public struct WalletTransactionsSyncRequest: Codable {
    public let accountID: String
    public let limit: Int?

    public enum CodingKeys: String, CodingKey {
        case accountID = "account_id"
        case limit = "limit"
    }

    public init(accountID: String, limit: Int?) {
        self.accountID = accountID
        self.limit = limit
    }
}

// MARK: WalletTransactionsSyncRequest convenience initializers and mutators

public extension WalletTransactionsSyncRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletTransactionsSyncRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        accountID: String? = nil,
        limit: Int?? = nil
    ) -> WalletTransactionsSyncRequest {
        return WalletTransactionsSyncRequest(
            accountID: accountID ?? self.accountID,
            limit: limit ?? self.limit
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletTransactionsSyncResponse
public struct WalletTransactionsSyncResponse: Codable {
    public let accountID: String
    public let fetchedAt: Int
    public let network: String
    public let syncedCount: Int

    public enum CodingKeys: String, CodingKey {
        case accountID = "account_id"
        case fetchedAt = "fetched_at"
        case network = "network"
        case syncedCount = "synced_count"
    }

    public init(accountID: String, fetchedAt: Int, network: String, syncedCount: Int) {
        self.accountID = accountID
        self.fetchedAt = fetchedAt
        self.network = network
        self.syncedCount = syncedCount
    }
}

// MARK: WalletTransactionsSyncResponse convenience initializers and mutators

public extension WalletTransactionsSyncResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletTransactionsSyncResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        accountID: String? = nil,
        fetchedAt: Int? = nil,
        network: String? = nil,
        syncedCount: Int? = nil
    ) -> WalletTransactionsSyncResponse {
        return WalletTransactionsSyncResponse(
            accountID: accountID ?? self.accountID,
            fetchedAt: fetchedAt ?? self.fetchedAt,
            network: network ?? self.network,
            syncedCount: syncedCount ?? self.syncedCount
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletImportCreateRequest
public struct WalletImportCreateRequest: Codable {
    public let clientRequestID: String?
    public let curve: String
    public let encoding: String
    public let label: String
    public let network: String
    public let privateKey: String

    public enum CodingKeys: String, CodingKey {
        case clientRequestID = "client_request_id"
        case curve = "curve"
        case encoding = "encoding"
        case label = "label"
        case network = "network"
        case privateKey = "private_key"
    }

    public init(clientRequestID: String?, curve: String, encoding: String, label: String, network: String, privateKey: String) {
        self.clientRequestID = clientRequestID
        self.curve = curve
        self.encoding = encoding
        self.label = label
        self.network = network
        self.privateKey = privateKey
    }
}

// MARK: WalletImportCreateRequest convenience initializers and mutators

public extension WalletImportCreateRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletImportCreateRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        clientRequestID: String?? = nil,
        curve: String? = nil,
        encoding: String? = nil,
        label: String? = nil,
        network: String? = nil,
        privateKey: String? = nil
    ) -> WalletImportCreateRequest {
        return WalletImportCreateRequest(
            clientRequestID: clientRequestID ?? self.clientRequestID,
            curve: curve ?? self.curve,
            encoding: encoding ?? self.encoding,
            label: label ?? self.label,
            network: network ?? self.network,
            privateKey: privateKey ?? self.privateKey
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletImportCreateResponse
public struct WalletImportCreateResponse: Codable {
    public let accountID: String
    public let walletID: String

    public enum CodingKeys: String, CodingKey {
        case accountID = "account_id"
        case walletID = "wallet_id"
    }

    public init(accountID: String, walletID: String) {
        self.accountID = accountID
        self.walletID = walletID
    }
}

// MARK: WalletImportCreateResponse convenience initializers and mutators

public extension WalletImportCreateResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletImportCreateResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        accountID: String? = nil,
        walletID: String? = nil
    ) -> WalletImportCreateResponse {
        return WalletImportCreateResponse(
            accountID: accountID ?? self.accountID,
            walletID: walletID ?? self.walletID
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletListResponse
public struct WalletListResponse: Codable {
    public let wallets: [WalletSummary]

    public enum CodingKeys: String, CodingKey {
        case wallets = "wallets"
    }

    public init(wallets: [WalletSummary]) {
        self.wallets = wallets
    }
}

// MARK: WalletListResponse convenience initializers and mutators

public extension WalletListResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletListResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        wallets: [WalletSummary]? = nil
    ) -> WalletListResponse {
        return WalletListResponse(
            wallets: wallets ?? self.wallets
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletSummary
public struct WalletSummary: Codable {
    /// Restored account-based networks (Ethereum, Solana) still awaiting used-account discovery
    /// via `wallet:balance:get { discover_addresses: true }`; absent once every network is done.
    public let accountDiscoveryPending: [String]?
    public let bitcoinDiscoveryPending: Bool?
    public let createdAt: Int
    public let kind: String
    public let label: String
    public let mnemonicStandard: String
    public let supportedNetworks: [String]
    public let updatedAt: Int
    public let walletID: String
    public let walletMode: String?

    public enum CodingKeys: String, CodingKey {
        case accountDiscoveryPending = "account_discovery_pending"
        case bitcoinDiscoveryPending = "bitcoin_discovery_pending"
        case createdAt = "created_at"
        case kind = "kind"
        case label = "label"
        case mnemonicStandard = "mnemonic_standard"
        case supportedNetworks = "supported_networks"
        case updatedAt = "updated_at"
        case walletID = "wallet_id"
        case walletMode = "wallet_mode"
    }

    public init(accountDiscoveryPending: [String]?, bitcoinDiscoveryPending: Bool?, createdAt: Int, kind: String, label: String, mnemonicStandard: String, supportedNetworks: [String], updatedAt: Int, walletID: String, walletMode: String?) {
        self.accountDiscoveryPending = accountDiscoveryPending
        self.bitcoinDiscoveryPending = bitcoinDiscoveryPending
        self.createdAt = createdAt
        self.kind = kind
        self.label = label
        self.mnemonicStandard = mnemonicStandard
        self.supportedNetworks = supportedNetworks
        self.updatedAt = updatedAt
        self.walletID = walletID
        self.walletMode = walletMode
    }
}

// MARK: WalletSummary convenience initializers and mutators

public extension WalletSummary {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletSummary.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        accountDiscoveryPending: [String]?? = nil,
        bitcoinDiscoveryPending: Bool?? = nil,
        createdAt: Int? = nil,
        kind: String? = nil,
        label: String? = nil,
        mnemonicStandard: String? = nil,
        supportedNetworks: [String]? = nil,
        updatedAt: Int? = nil,
        walletID: String? = nil,
        walletMode: String?? = nil
    ) -> WalletSummary {
        return WalletSummary(
            accountDiscoveryPending: accountDiscoveryPending ?? self.accountDiscoveryPending,
            bitcoinDiscoveryPending: bitcoinDiscoveryPending ?? self.bitcoinDiscoveryPending,
            createdAt: createdAt ?? self.createdAt,
            kind: kind ?? self.kind,
            label: label ?? self.label,
            mnemonicStandard: mnemonicStandard ?? self.mnemonicStandard,
            supportedNetworks: supportedNetworks ?? self.supportedNetworks,
            updatedAt: updatedAt ?? self.updatedAt,
            walletID: walletID ?? self.walletID,
            walletMode: walletMode ?? self.walletMode
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletHDGenerateMnemonicResponse
public struct WalletHDGenerateMnemonicResponse: Codable {
    public let expiresAt: Int
    public let mnemonic: [String]
    public let mnemonicDraftID: String
    public let mnemonicStandard: String
    public let walletMode: String
    public let wordlist: String

    public enum CodingKeys: String, CodingKey {
        case expiresAt = "expires_at"
        case mnemonic = "mnemonic"
        case mnemonicDraftID = "mnemonic_draft_id"
        case mnemonicStandard = "mnemonic_standard"
        case walletMode = "wallet_mode"
        case wordlist = "wordlist"
    }

    public init(expiresAt: Int, mnemonic: [String], mnemonicDraftID: String, mnemonicStandard: String, walletMode: String, wordlist: String) {
        self.expiresAt = expiresAt
        self.mnemonic = mnemonic
        self.mnemonicDraftID = mnemonicDraftID
        self.mnemonicStandard = mnemonicStandard
        self.walletMode = walletMode
        self.wordlist = wordlist
    }
}

// MARK: WalletHDGenerateMnemonicResponse convenience initializers and mutators

public extension WalletHDGenerateMnemonicResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletHDGenerateMnemonicResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        expiresAt: Int? = nil,
        mnemonic: [String]? = nil,
        mnemonicDraftID: String? = nil,
        mnemonicStandard: String? = nil,
        walletMode: String? = nil,
        wordlist: String? = nil
    ) -> WalletHDGenerateMnemonicResponse {
        return WalletHDGenerateMnemonicResponse(
            expiresAt: expiresAt ?? self.expiresAt,
            mnemonic: mnemonic ?? self.mnemonic,
            mnemonicDraftID: mnemonicDraftID ?? self.mnemonicDraftID,
            mnemonicStandard: mnemonicStandard ?? self.mnemonicStandard,
            walletMode: walletMode ?? self.walletMode,
            wordlist: wordlist ?? self.wordlist
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletHDGenerateMnemonicRequest
public struct WalletHDGenerateMnemonicRequest: Codable {
    public let mnemonicStandard: String?
    public let walletMode: String?
    public let wordCount: Int
    public let wordlist: String?

    public enum CodingKeys: String, CodingKey {
        case mnemonicStandard = "mnemonic_standard"
        case walletMode = "wallet_mode"
        case wordCount = "word_count"
        case wordlist = "wordlist"
    }

    public init(mnemonicStandard: String?, walletMode: String?, wordCount: Int, wordlist: String?) {
        self.mnemonicStandard = mnemonicStandard
        self.walletMode = walletMode
        self.wordCount = wordCount
        self.wordlist = wordlist
    }
}

// MARK: WalletHDGenerateMnemonicRequest convenience initializers and mutators

public extension WalletHDGenerateMnemonicRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletHDGenerateMnemonicRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        mnemonicStandard: String?? = nil,
        walletMode: String?? = nil,
        wordCount: Int? = nil,
        wordlist: String?? = nil
    ) -> WalletHDGenerateMnemonicRequest {
        return WalletHDGenerateMnemonicRequest(
            mnemonicStandard: mnemonicStandard ?? self.mnemonicStandard,
            walletMode: walletMode ?? self.walletMode,
            wordCount: wordCount ?? self.wordCount,
            wordlist: wordlist ?? self.wordlist
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletTransactionPrepareRequest
public struct WalletTransactionPrepareRequest: Codable {
    public let accountID: String
    public let feePolicy: WalletFeePolicy
    public let maximizeOutputIndex: Int?
    public let network: String
    public let outputs: [WalletTransactionOutput]

    public enum CodingKeys: String, CodingKey {
        case accountID = "account_id"
        case feePolicy = "fee_policy"
        case maximizeOutputIndex = "maximize_output_index"
        case network = "network"
        case outputs = "outputs"
    }

    public init(accountID: String, feePolicy: WalletFeePolicy, maximizeOutputIndex: Int?, network: String, outputs: [WalletTransactionOutput]) {
        self.accountID = accountID
        self.feePolicy = feePolicy
        self.maximizeOutputIndex = maximizeOutputIndex
        self.network = network
        self.outputs = outputs
    }
}

// MARK: WalletTransactionPrepareRequest convenience initializers and mutators

public extension WalletTransactionPrepareRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletTransactionPrepareRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        accountID: String? = nil,
        feePolicy: WalletFeePolicy? = nil,
        maximizeOutputIndex: Int?? = nil,
        network: String? = nil,
        outputs: [WalletTransactionOutput]? = nil
    ) -> WalletTransactionPrepareRequest {
        return WalletTransactionPrepareRequest(
            accountID: accountID ?? self.accountID,
            feePolicy: feePolicy ?? self.feePolicy,
            maximizeOutputIndex: maximizeOutputIndex ?? self.maximizeOutputIndex,
            network: network ?? self.network,
            outputs: outputs ?? self.outputs
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletFeePolicy
public struct WalletFeePolicy: Codable {
    public let tier: WalletFeeTier

    public enum CodingKeys: String, CodingKey {
        case tier = "tier"
    }

    public init(tier: WalletFeeTier) {
        self.tier = tier
    }
}

// MARK: WalletFeePolicy convenience initializers and mutators

public extension WalletFeePolicy {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletFeePolicy.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        tier: WalletFeeTier? = nil
    ) -> WalletFeePolicy {
        return WalletFeePolicy(
            tier: tier ?? self.tier
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

public enum WalletFeeTier: String, Codable {
    case fast = "fast"
    case slow = "slow"
    case standard = "standard"
}

// MARK: - WalletTransactionOutput
public struct WalletTransactionOutput: Codable {
    public let address: String
    public let amount: String
    public let comment: String?

    public enum CodingKeys: String, CodingKey {
        case address = "address"
        case amount = "amount"
        case comment = "comment"
    }

    public init(address: String, amount: String, comment: String?) {
        self.address = address
        self.amount = amount
        self.comment = comment
    }
}

// MARK: WalletTransactionOutput convenience initializers and mutators

public extension WalletTransactionOutput {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletTransactionOutput.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        address: String? = nil,
        amount: String? = nil,
        comment: String?? = nil
    ) -> WalletTransactionOutput {
        return WalletTransactionOutput(
            address: address ?? self.address,
            amount: amount ?? self.amount,
            comment: comment ?? self.comment
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletTransactionPrepareResponse
public struct WalletTransactionPrepareResponse: Codable {
    public let accountID: String
    public let expiresAt: Int
    public let network: String
    public let preparationID: String
    public let preview: WalletPreview
    public let walletID: String

    public enum CodingKeys: String, CodingKey {
        case accountID = "account_id"
        case expiresAt = "expires_at"
        case network = "network"
        case preparationID = "preparation_id"
        case preview = "preview"
        case walletID = "wallet_id"
    }

    public init(accountID: String, expiresAt: Int, network: String, preparationID: String, preview: WalletPreview, walletID: String) {
        self.accountID = accountID
        self.expiresAt = expiresAt
        self.network = network
        self.preparationID = preparationID
        self.preview = preview
        self.walletID = walletID
    }
}

// MARK: WalletTransactionPrepareResponse convenience initializers and mutators

public extension WalletTransactionPrepareResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletTransactionPrepareResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        accountID: String? = nil,
        expiresAt: Int? = nil,
        network: String? = nil,
        preparationID: String? = nil,
        preview: WalletPreview? = nil,
        walletID: String? = nil
    ) -> WalletTransactionPrepareResponse {
        return WalletTransactionPrepareResponse(
            accountID: accountID ?? self.accountID,
            expiresAt: expiresAt ?? self.expiresAt,
            network: network ?? self.network,
            preparationID: preparationID ?? self.preparationID,
            preview: preview ?? self.preview,
            walletID: walletID ?? self.walletID
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletPreview
public struct WalletPreview: Codable {
    public let amountUnit: String
    public let estimatedFee: String
    public let ethereum: EthereumTransactionPreviewV1?
    public let outputs: [WalletTransactionOutput]
    public let solana: SolanaTransactionPreviewV1?
    public let ton: TonTransactionPreviewV1?
    public let totalDebit: String
    public let warnings: [WalletWarning]

    public enum CodingKeys: String, CodingKey {
        case amountUnit = "amount_unit"
        case estimatedFee = "estimated_fee"
        case ethereum = "ethereum"
        case outputs = "outputs"
        case solana = "solana"
        case ton = "ton"
        case totalDebit = "total_debit"
        case warnings = "warnings"
    }

    public init(amountUnit: String, estimatedFee: String, ethereum: EthereumTransactionPreviewV1?, outputs: [WalletTransactionOutput], solana: SolanaTransactionPreviewV1?, ton: TonTransactionPreviewV1?, totalDebit: String, warnings: [WalletWarning]) {
        self.amountUnit = amountUnit
        self.estimatedFee = estimatedFee
        self.ethereum = ethereum
        self.outputs = outputs
        self.solana = solana
        self.ton = ton
        self.totalDebit = totalDebit
        self.warnings = warnings
    }
}

// MARK: WalletPreview convenience initializers and mutators

public extension WalletPreview {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletPreview.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        amountUnit: String? = nil,
        estimatedFee: String? = nil,
        ethereum: EthereumTransactionPreviewV1?? = nil,
        outputs: [WalletTransactionOutput]? = nil,
        solana: SolanaTransactionPreviewV1?? = nil,
        ton: TonTransactionPreviewV1?? = nil,
        totalDebit: String? = nil,
        warnings: [WalletWarning]? = nil
    ) -> WalletPreview {
        return WalletPreview(
            amountUnit: amountUnit ?? self.amountUnit,
            estimatedFee: estimatedFee ?? self.estimatedFee,
            ethereum: ethereum ?? self.ethereum,
            outputs: outputs ?? self.outputs,
            solana: solana ?? self.solana,
            ton: ton ?? self.ton,
            totalDebit: totalDebit ?? self.totalDebit,
            warnings: warnings ?? self.warnings
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - EthereumTransactionPreviewV1
public struct EthereumTransactionPreviewV1: Codable {
    public let chainID: Int
    public let gasLimit: Int
    public let maxFeePerGas: String
    public let maxPriorityFeePerGas: String
    public let nonce: Int

    public enum CodingKeys: String, CodingKey {
        case chainID = "chain_id"
        case gasLimit = "gas_limit"
        case maxFeePerGas = "max_fee_per_gas"
        case maxPriorityFeePerGas = "max_priority_fee_per_gas"
        case nonce = "nonce"
    }

    public init(chainID: Int, gasLimit: Int, maxFeePerGas: String, maxPriorityFeePerGas: String, nonce: Int) {
        self.chainID = chainID
        self.gasLimit = gasLimit
        self.maxFeePerGas = maxFeePerGas
        self.maxPriorityFeePerGas = maxPriorityFeePerGas
        self.nonce = nonce
    }
}

// MARK: EthereumTransactionPreviewV1 convenience initializers and mutators

public extension EthereumTransactionPreviewV1 {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(EthereumTransactionPreviewV1.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        chainID: Int? = nil,
        gasLimit: Int? = nil,
        maxFeePerGas: String? = nil,
        maxPriorityFeePerGas: String? = nil,
        nonce: Int? = nil
    ) -> EthereumTransactionPreviewV1 {
        return EthereumTransactionPreviewV1(
            chainID: chainID ?? self.chainID,
            gasLimit: gasLimit ?? self.gasLimit,
            maxFeePerGas: maxFeePerGas ?? self.maxFeePerGas,
            maxPriorityFeePerGas: maxPriorityFeePerGas ?? self.maxPriorityFeePerGas,
            nonce: nonce ?? self.nonce
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - SolanaTransactionPreviewV1
public struct SolanaTransactionPreviewV1: Codable {
    public let destinationRentExemptMinimum: String
    public let lastValidBlockHeight: Int
    public let recentBlockhash: String

    public enum CodingKeys: String, CodingKey {
        case destinationRentExemptMinimum = "destination_rent_exempt_minimum"
        case lastValidBlockHeight = "last_valid_block_height"
        case recentBlockhash = "recent_blockhash"
    }

    public init(destinationRentExemptMinimum: String, lastValidBlockHeight: Int, recentBlockhash: String) {
        self.destinationRentExemptMinimum = destinationRentExemptMinimum
        self.lastValidBlockHeight = lastValidBlockHeight
        self.recentBlockhash = recentBlockhash
    }
}

// MARK: SolanaTransactionPreviewV1 convenience initializers and mutators

public extension SolanaTransactionPreviewV1 {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(SolanaTransactionPreviewV1.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        destinationRentExemptMinimum: String? = nil,
        lastValidBlockHeight: Int? = nil,
        recentBlockhash: String? = nil
    ) -> SolanaTransactionPreviewV1 {
        return SolanaTransactionPreviewV1(
            destinationRentExemptMinimum: destinationRentExemptMinimum ?? self.destinationRentExemptMinimum,
            lastValidBlockHeight: lastValidBlockHeight ?? self.lastValidBlockHeight,
            recentBlockhash: recentBlockhash ?? self.recentBlockhash
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - TonTransactionPreviewV1
public struct TonTransactionPreviewV1: Codable {
    public let accountState: String
    public let destinationState: String
    public let messageMode: Int
    public let senderStateInitIncluded: Bool
    public let seqno: Int
    public let validUntil: Int
    public let walletContract: String

    public enum CodingKeys: String, CodingKey {
        case accountState = "account_state"
        case destinationState = "destination_state"
        case messageMode = "message_mode"
        case senderStateInitIncluded = "sender_state_init_included"
        case seqno = "seqno"
        case validUntil = "valid_until"
        case walletContract = "wallet_contract"
    }

    public init(accountState: String, destinationState: String, messageMode: Int, senderStateInitIncluded: Bool, seqno: Int, validUntil: Int, walletContract: String) {
        self.accountState = accountState
        self.destinationState = destinationState
        self.messageMode = messageMode
        self.senderStateInitIncluded = senderStateInitIncluded
        self.seqno = seqno
        self.validUntil = validUntil
        self.walletContract = walletContract
    }
}

// MARK: TonTransactionPreviewV1 convenience initializers and mutators

public extension TonTransactionPreviewV1 {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(TonTransactionPreviewV1.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        accountState: String? = nil,
        destinationState: String? = nil,
        messageMode: Int? = nil,
        senderStateInitIncluded: Bool? = nil,
        seqno: Int? = nil,
        validUntil: Int? = nil,
        walletContract: String? = nil
    ) -> TonTransactionPreviewV1 {
        return TonTransactionPreviewV1(
            accountState: accountState ?? self.accountState,
            destinationState: destinationState ?? self.destinationState,
            messageMode: messageMode ?? self.messageMode,
            senderStateInitIncluded: senderStateInitIncluded ?? self.senderStateInitIncluded,
            seqno: seqno ?? self.seqno,
            validUntil: validUntil ?? self.validUntil,
            walletContract: walletContract ?? self.walletContract
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletWarning
public struct WalletWarning: Codable {
    public let code: String
    public let message: String

    public enum CodingKeys: String, CodingKey {
        case code = "code"
        case message = "message"
    }

    public init(code: String, message: String) {
        self.code = code
        self.message = message
    }
}

// MARK: WalletWarning convenience initializers and mutators

public extension WalletWarning {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletWarning.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        code: String? = nil,
        message: String? = nil
    ) -> WalletWarning {
        return WalletWarning(
            code: code ?? self.code,
            message: message ?? self.message
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletTransactionQuoteRequest
public struct WalletTransactionQuoteRequest: Codable {
    public let accountID: String
    public let feePolicy: WalletFeePolicy
    public let maxOutputIndex: Int
    public let network: String
    public let outputs: [WalletTransactionQuoteOutput]

    public enum CodingKeys: String, CodingKey {
        case accountID = "account_id"
        case feePolicy = "fee_policy"
        case maxOutputIndex = "max_output_index"
        case network = "network"
        case outputs = "outputs"
    }

    public init(accountID: String, feePolicy: WalletFeePolicy, maxOutputIndex: Int, network: String, outputs: [WalletTransactionQuoteOutput]) {
        self.accountID = accountID
        self.feePolicy = feePolicy
        self.maxOutputIndex = maxOutputIndex
        self.network = network
        self.outputs = outputs
    }
}

// MARK: WalletTransactionQuoteRequest convenience initializers and mutators

public extension WalletTransactionQuoteRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletTransactionQuoteRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        accountID: String? = nil,
        feePolicy: WalletFeePolicy? = nil,
        maxOutputIndex: Int? = nil,
        network: String? = nil,
        outputs: [WalletTransactionQuoteOutput]? = nil
    ) -> WalletTransactionQuoteRequest {
        return WalletTransactionQuoteRequest(
            accountID: accountID ?? self.accountID,
            feePolicy: feePolicy ?? self.feePolicy,
            maxOutputIndex: maxOutputIndex ?? self.maxOutputIndex,
            network: network ?? self.network,
            outputs: outputs ?? self.outputs
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletTransactionQuoteOutput
public struct WalletTransactionQuoteOutput: Codable {
    public let address: String
    public let amount: String?
    public let comment: String?

    public enum CodingKeys: String, CodingKey {
        case address = "address"
        case amount = "amount"
        case comment = "comment"
    }

    public init(address: String, amount: String?, comment: String?) {
        self.address = address
        self.amount = amount
        self.comment = comment
    }
}

// MARK: WalletTransactionQuoteOutput convenience initializers and mutators

public extension WalletTransactionQuoteOutput {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletTransactionQuoteOutput.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        address: String? = nil,
        amount: String?? = nil,
        comment: String?? = nil
    ) -> WalletTransactionQuoteOutput {
        return WalletTransactionQuoteOutput(
            address: address ?? self.address,
            amount: amount ?? self.amount,
            comment: comment ?? self.comment
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletTransactionQuoteResponse
public struct WalletTransactionQuoteResponse: Codable {
    public let accountID: String
    public let currentPreview: WalletPreview?
    public let expiresAt: Int
    public let maxAmount: String
    public let maxPreview: WalletPreview
    public let network: String
    public let quotedAt: Int
    public let spendable: String

    public enum CodingKeys: String, CodingKey {
        case accountID = "account_id"
        case currentPreview = "current_preview"
        case expiresAt = "expires_at"
        case maxAmount = "max_amount"
        case maxPreview = "max_preview"
        case network = "network"
        case quotedAt = "quoted_at"
        case spendable = "spendable"
    }

    public init(accountID: String, currentPreview: WalletPreview?, expiresAt: Int, maxAmount: String, maxPreview: WalletPreview, network: String, quotedAt: Int, spendable: String) {
        self.accountID = accountID
        self.currentPreview = currentPreview
        self.expiresAt = expiresAt
        self.maxAmount = maxAmount
        self.maxPreview = maxPreview
        self.network = network
        self.quotedAt = quotedAt
        self.spendable = spendable
    }
}

// MARK: WalletTransactionQuoteResponse convenience initializers and mutators

public extension WalletTransactionQuoteResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletTransactionQuoteResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        accountID: String? = nil,
        currentPreview: WalletPreview?? = nil,
        expiresAt: Int? = nil,
        maxAmount: String? = nil,
        maxPreview: WalletPreview? = nil,
        network: String? = nil,
        quotedAt: Int? = nil,
        spendable: String? = nil
    ) -> WalletTransactionQuoteResponse {
        return WalletTransactionQuoteResponse(
            accountID: accountID ?? self.accountID,
            currentPreview: currentPreview ?? self.currentPreview,
            expiresAt: expiresAt ?? self.expiresAt,
            maxAmount: maxAmount ?? self.maxAmount,
            maxPreview: maxPreview ?? self.maxPreview,
            network: network ?? self.network,
            quotedAt: quotedAt ?? self.quotedAt,
            spendable: spendable ?? self.spendable
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletTransactionRebroadcastRequest
public struct WalletTransactionRebroadcastRequest: Codable {
    public let masterPassword: String
    public let txRef: String

    public enum CodingKeys: String, CodingKey {
        case masterPassword = "master_password"
        case txRef = "tx_ref"
    }

    public init(masterPassword: String, txRef: String) {
        self.masterPassword = masterPassword
        self.txRef = txRef
    }
}

// MARK: WalletTransactionRebroadcastRequest convenience initializers and mutators

public extension WalletTransactionRebroadcastRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletTransactionRebroadcastRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        masterPassword: String? = nil,
        txRef: String? = nil
    ) -> WalletTransactionRebroadcastRequest {
        return WalletTransactionRebroadcastRequest(
            masterPassword: masterPassword ?? self.masterPassword,
            txRef: txRef ?? self.txRef
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletTransactionRebroadcastResponse
public struct WalletTransactionRebroadcastResponse: Codable {
    public let network: String
    public let status: String
    public let txHash: String?
    public let txRef: String
    public let updatedAt: Int

    public enum CodingKeys: String, CodingKey {
        case network = "network"
        case status = "status"
        case txHash = "tx_hash"
        case txRef = "tx_ref"
        case updatedAt = "updated_at"
    }

    public init(network: String, status: String, txHash: String?, txRef: String, updatedAt: Int) {
        self.network = network
        self.status = status
        self.txHash = txHash
        self.txRef = txRef
        self.updatedAt = updatedAt
    }
}

// MARK: WalletTransactionRebroadcastResponse convenience initializers and mutators

public extension WalletTransactionRebroadcastResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletTransactionRebroadcastResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        network: String? = nil,
        status: String? = nil,
        txHash: String?? = nil,
        txRef: String? = nil,
        updatedAt: Int? = nil
    ) -> WalletTransactionRebroadcastResponse {
        return WalletTransactionRebroadcastResponse(
            network: network ?? self.network,
            status: status ?? self.status,
            txHash: txHash ?? self.txHash,
            txRef: txRef ?? self.txRef,
            updatedAt: updatedAt ?? self.updatedAt
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletBackupExportResponse
public struct WalletBackupExportResponse: Codable {
    public let bip39Passphrase: String?
    public let exportKind: String
    public let mnemonic: [String]
    public let mnemonicStandard: String
    public let walletID: String
    public let walletMode: String
    public let wordlist: String

    public enum CodingKeys: String, CodingKey {
        case bip39Passphrase = "bip39_passphrase"
        case exportKind = "export_kind"
        case mnemonic = "mnemonic"
        case mnemonicStandard = "mnemonic_standard"
        case walletID = "wallet_id"
        case walletMode = "wallet_mode"
        case wordlist = "wordlist"
    }

    public init(bip39Passphrase: String?, exportKind: String, mnemonic: [String], mnemonicStandard: String, walletID: String, walletMode: String, wordlist: String) {
        self.bip39Passphrase = bip39Passphrase
        self.exportKind = exportKind
        self.mnemonic = mnemonic
        self.mnemonicStandard = mnemonicStandard
        self.walletID = walletID
        self.walletMode = walletMode
        self.wordlist = wordlist
    }
}

// MARK: WalletBackupExportResponse convenience initializers and mutators

public extension WalletBackupExportResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletBackupExportResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        bip39Passphrase: String?? = nil,
        exportKind: String? = nil,
        mnemonic: [String]? = nil,
        mnemonicStandard: String? = nil,
        walletID: String? = nil,
        walletMode: String? = nil,
        wordlist: String? = nil
    ) -> WalletBackupExportResponse {
        return WalletBackupExportResponse(
            bip39Passphrase: bip39Passphrase ?? self.bip39Passphrase,
            exportKind: exportKind ?? self.exportKind,
            mnemonic: mnemonic ?? self.mnemonic,
            mnemonicStandard: mnemonicStandard ?? self.mnemonicStandard,
            walletID: walletID ?? self.walletID,
            walletMode: walletMode ?? self.walletMode,
            wordlist: wordlist ?? self.wordlist
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletBackupExportRequest
public struct WalletBackupExportRequest: Codable {
    public let masterPassword: String
    public let walletID: String

    public enum CodingKeys: String, CodingKey {
        case masterPassword = "master_password"
        case walletID = "wallet_id"
    }

    public init(masterPassword: String, walletID: String) {
        self.masterPassword = masterPassword
        self.walletID = walletID
    }
}

// MARK: WalletBackupExportRequest convenience initializers and mutators

public extension WalletBackupExportRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletBackupExportRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        masterPassword: String? = nil,
        walletID: String? = nil
    ) -> WalletBackupExportRequest {
        return WalletBackupExportRequest(
            masterPassword: masterPassword ?? self.masterPassword,
            walletID: walletID ?? self.walletID
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletStatusResponse
public struct WalletStatusResponse: Codable {
    public let disabledReason: String?
    public let enabled: Bool
    public let initialized: Bool
    public let networks: [WalletNetworkStatus]
    public let walletCount: Int

    public enum CodingKeys: String, CodingKey {
        case disabledReason = "disabled_reason"
        case enabled = "enabled"
        case initialized = "initialized"
        case networks = "networks"
        case walletCount = "wallet_count"
    }

    public init(disabledReason: String?, enabled: Bool, initialized: Bool, networks: [WalletNetworkStatus], walletCount: Int) {
        self.disabledReason = disabledReason
        self.enabled = enabled
        self.initialized = initialized
        self.networks = networks
        self.walletCount = walletCount
    }
}

// MARK: WalletStatusResponse convenience initializers and mutators

public extension WalletStatusResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletStatusResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        disabledReason: String?? = nil,
        enabled: Bool? = nil,
        initialized: Bool? = nil,
        networks: [WalletNetworkStatus]? = nil,
        walletCount: Int? = nil
    ) -> WalletStatusResponse {
        return WalletStatusResponse(
            disabledReason: disabledReason ?? self.disabledReason,
            enabled: enabled ?? self.enabled,
            initialized: initialized ?? self.initialized,
            networks: networks ?? self.networks,
            walletCount: walletCount ?? self.walletCount
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletNetworkStatus
public struct WalletNetworkStatus: Codable {
    public let broadcastEnabled: Bool
    public let capabilities: [WalletCapabilityStatus]?
    public let disabledReason: String?
    public let enabled: Bool
    public let network: String
    public let providerStatus: WalletProviderStatus

    public enum CodingKeys: String, CodingKey {
        case broadcastEnabled = "broadcast_enabled"
        case capabilities = "capabilities"
        case disabledReason = "disabled_reason"
        case enabled = "enabled"
        case network = "network"
        case providerStatus = "provider_status"
    }

    public init(broadcastEnabled: Bool, capabilities: [WalletCapabilityStatus]?, disabledReason: String?, enabled: Bool, network: String, providerStatus: WalletProviderStatus) {
        self.broadcastEnabled = broadcastEnabled
        self.capabilities = capabilities
        self.disabledReason = disabledReason
        self.enabled = enabled
        self.network = network
        self.providerStatus = providerStatus
    }
}

// MARK: WalletNetworkStatus convenience initializers and mutators

public extension WalletNetworkStatus {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletNetworkStatus.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        broadcastEnabled: Bool? = nil,
        capabilities: [WalletCapabilityStatus]?? = nil,
        disabledReason: String?? = nil,
        enabled: Bool? = nil,
        network: String? = nil,
        providerStatus: WalletProviderStatus? = nil
    ) -> WalletNetworkStatus {
        return WalletNetworkStatus(
            broadcastEnabled: broadcastEnabled ?? self.broadcastEnabled,
            capabilities: capabilities ?? self.capabilities,
            disabledReason: disabledReason ?? self.disabledReason,
            enabled: enabled ?? self.enabled,
            network: network ?? self.network,
            providerStatus: providerStatus ?? self.providerStatus
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletCapabilityStatus
public struct WalletCapabilityStatus: Codable {
    public let disabledReason: String?
    public let id: String
    public let state: WalletCapabilityState

    public enum CodingKeys: String, CodingKey {
        case disabledReason = "disabled_reason"
        case id = "id"
        case state = "state"
    }

    public init(disabledReason: String?, id: String, state: WalletCapabilityState) {
        self.disabledReason = disabledReason
        self.id = id
        self.state = state
    }
}

// MARK: WalletCapabilityStatus convenience initializers and mutators

public extension WalletCapabilityStatus {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletCapabilityStatus.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        disabledReason: String?? = nil,
        id: String? = nil,
        state: WalletCapabilityState? = nil
    ) -> WalletCapabilityStatus {
        return WalletCapabilityStatus(
            disabledReason: disabledReason ?? self.disabledReason,
            id: id ?? self.id,
            state: state ?? self.state
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

public enum WalletCapabilityState: String, Codable {
    case disabled = "disabled"
    case ready = "ready"
    case unavailable = "unavailable"
}

public enum WalletProviderStatus: String, Codable {
    case ready = "ready"
    case unavailable = "unavailable"
}

// MARK: - WalletTonRotateKeyRequest
public struct WalletTonRotateKeyRequest: Codable {
    public let accountID: String
    public let masterPassword: String

    public enum CodingKeys: String, CodingKey {
        case accountID = "account_id"
        case masterPassword = "master_password"
    }

    public init(accountID: String, masterPassword: String) {
        self.accountID = accountID
        self.masterPassword = masterPassword
    }
}

// MARK: WalletTonRotateKeyRequest convenience initializers and mutators

public extension WalletTonRotateKeyRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletTonRotateKeyRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        accountID: String? = nil,
        masterPassword: String? = nil
    ) -> WalletTonRotateKeyRequest {
        return WalletTonRotateKeyRequest(
            accountID: accountID ?? self.accountID,
            masterPassword: masterPassword ?? self.masterPassword
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

/// Result of an on-chain WalletTg signing-key rotation (TEP-0003 Rotation mnemonic).
/// `mnemonic` is the complete 24-word phrase that recovers the account once the rotation
/// is confirmed; the previous phrase stays valid until then.
// MARK: - WalletTonRotateKeyResponse
public struct WalletTonRotateKeyResponse: Codable {
    public let accountID: String
    public let messageRef: String?
    public let mnemonic: [String]
    public let mnemonicStandard: String
    public let newPublicKey: String
    public let seqno: Int
    public let status: String
    public let txHash: String?
    public let validUntil: Int
    public let walletID: String
    public let wordlist: String

    public enum CodingKeys: String, CodingKey {
        case accountID = "account_id"
        case messageRef = "message_ref"
        case mnemonic = "mnemonic"
        case mnemonicStandard = "mnemonic_standard"
        case newPublicKey = "new_public_key"
        case seqno = "seqno"
        case status = "status"
        case txHash = "tx_hash"
        case validUntil = "valid_until"
        case walletID = "wallet_id"
        case wordlist = "wordlist"
    }

    public init(accountID: String, messageRef: String?, mnemonic: [String], mnemonicStandard: String, newPublicKey: String, seqno: Int, status: String, txHash: String?, validUntil: Int, walletID: String, wordlist: String) {
        self.accountID = accountID
        self.messageRef = messageRef
        self.mnemonic = mnemonic
        self.mnemonicStandard = mnemonicStandard
        self.newPublicKey = newPublicKey
        self.seqno = seqno
        self.status = status
        self.txHash = txHash
        self.validUntil = validUntil
        self.walletID = walletID
        self.wordlist = wordlist
    }
}

// MARK: WalletTonRotateKeyResponse convenience initializers and mutators

public extension WalletTonRotateKeyResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletTonRotateKeyResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        accountID: String? = nil,
        messageRef: String?? = nil,
        mnemonic: [String]? = nil,
        mnemonicStandard: String? = nil,
        newPublicKey: String? = nil,
        seqno: Int? = nil,
        status: String? = nil,
        txHash: String?? = nil,
        validUntil: Int? = nil,
        walletID: String? = nil,
        wordlist: String? = nil
    ) -> WalletTonRotateKeyResponse {
        return WalletTonRotateKeyResponse(
            accountID: accountID ?? self.accountID,
            messageRef: messageRef ?? self.messageRef,
            mnemonic: mnemonic ?? self.mnemonic,
            mnemonicStandard: mnemonicStandard ?? self.mnemonicStandard,
            newPublicKey: newPublicKey ?? self.newPublicKey,
            seqno: seqno ?? self.seqno,
            status: status ?? self.status,
            txHash: txHash ?? self.txHash,
            validUntil: validUntil ?? self.validUntil,
            walletID: walletID ?? self.walletID,
            wordlist: wordlist ?? self.wordlist
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletTransactionsRefreshRequest
public struct WalletTransactionsRefreshRequest: Codable {
    public let txRef: String

    public enum CodingKeys: String, CodingKey {
        case txRef = "tx_ref"
    }

    public init(txRef: String) {
        self.txRef = txRef
    }
}

// MARK: WalletTransactionsRefreshRequest convenience initializers and mutators

public extension WalletTransactionsRefreshRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletTransactionsRefreshRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        txRef: String? = nil
    ) -> WalletTransactionsRefreshRequest {
        return WalletTransactionsRefreshRequest(
            txRef: txRef ?? self.txRef
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WalletTransactionsRefreshResponse
public struct WalletTransactionsRefreshResponse: Codable {
    public let network: String
    public let status: String
    public let txHash: String?
    public let txRef: String
    public let updatedAt: Int

    public enum CodingKeys: String, CodingKey {
        case network = "network"
        case status = "status"
        case txHash = "tx_hash"
        case txRef = "tx_ref"
        case updatedAt = "updated_at"
    }

    public init(network: String, status: String, txHash: String?, txRef: String, updatedAt: Int) {
        self.network = network
        self.status = status
        self.txHash = txHash
        self.txRef = txRef
        self.updatedAt = updatedAt
    }
}

// MARK: WalletTransactionsRefreshResponse convenience initializers and mutators

public extension WalletTransactionsRefreshResponse {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WalletTransactionsRefreshResponse.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        network: String? = nil,
        status: String? = nil,
        txHash: String?? = nil,
        txRef: String? = nil,
        updatedAt: Int? = nil
    ) -> WalletTransactionsRefreshResponse {
        return WalletTransactionsRefreshResponse(
            network: network ?? self.network,
            status: status ?? self.status,
            txHash: txHash ?? self.txHash,
            txRef: txRef ?? self.txRef,
            updatedAt: updatedAt ?? self.updatedAt
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerWebsiteReadRequest
public struct PassmanagerWebsiteReadRequest: Codable {
    public let entryID: String

    public enum CodingKeys: String, CodingKey {
        case entryID = "entry_id"
    }

    public init(entryID: String) {
        self.entryID = entryID
    }
}

// MARK: PassmanagerWebsiteReadRequest convenience initializers and mutators

public extension PassmanagerWebsiteReadRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerWebsiteReadRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        entryID: String? = nil
    ) -> PassmanagerWebsiteReadRequest {
        return PassmanagerWebsiteReadRequest(
            entryID: entryID ?? self.entryID
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerWebsiteResult
public struct PassmanagerWebsiteResult: Codable {
    public let errors: [WebsiteRuleError]
    public let revision: String?
    public let rules: [CredentialWebsiteRule]

    public enum CodingKeys: String, CodingKey {
        case errors = "errors"
        case revision = "revision"
        case rules = "rules"
    }

    public init(errors: [WebsiteRuleError], revision: String?, rules: [CredentialWebsiteRule]) {
        self.errors = errors
        self.revision = revision
        self.rules = rules
    }
}

// MARK: PassmanagerWebsiteResult convenience initializers and mutators

public extension PassmanagerWebsiteResult {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerWebsiteResult.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        errors: [WebsiteRuleError]? = nil,
        revision: String?? = nil,
        rules: [CredentialWebsiteRule]? = nil
    ) -> PassmanagerWebsiteResult {
        return PassmanagerWebsiteResult(
            errors: errors ?? self.errors,
            revision: revision ?? self.revision,
            rules: rules ?? self.rules
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - WebsiteRuleError
public struct WebsiteRuleError: Codable {
    public let code: String
    public let index: Int

    public enum CodingKeys: String, CodingKey {
        case code = "code"
        case index = "index"
    }

    public init(code: String, index: Int) {
        self.code = code
        self.index = index
    }
}

// MARK: WebsiteRuleError convenience initializers and mutators

public extension WebsiteRuleError {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(WebsiteRuleError.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        code: String? = nil,
        index: Int? = nil
    ) -> WebsiteRuleError {
        return WebsiteRuleError(
            code: code ?? self.code,
            index: index ?? self.index
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - CredentialWebsiteRule
public struct CredentialWebsiteRule: Codable {
    public let matchMode: String
    public let sourceIndex: Int?
    public let value: String

    public enum CodingKeys: String, CodingKey {
        case matchMode = "match_mode"
        case sourceIndex = "source_index"
        case value = "value"
    }

    public init(matchMode: String, sourceIndex: Int?, value: String) {
        self.matchMode = matchMode
        self.sourceIndex = sourceIndex
        self.value = value
    }
}

// MARK: CredentialWebsiteRule convenience initializers and mutators

public extension CredentialWebsiteRule {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(CredentialWebsiteRule.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        matchMode: String? = nil,
        sourceIndex: Int?? = nil,
        value: String? = nil
    ) -> CredentialWebsiteRule {
        return CredentialWebsiteRule(
            matchMode: matchMode ?? self.matchMode,
            sourceIndex: sourceIndex ?? self.sourceIndex,
            value: value ?? self.value
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerWebsiteUpdateRequest
public struct PassmanagerWebsiteUpdateRequest: Codable {
    public let entryID: String
    public let revision: String
    public let rules: [CredentialWebsiteRule]

    public enum CodingKeys: String, CodingKey {
        case entryID = "entry_id"
        case revision = "revision"
        case rules = "rules"
    }

    public init(entryID: String, revision: String, rules: [CredentialWebsiteRule]) {
        self.entryID = entryID
        self.revision = revision
        self.rules = rules
    }
}

// MARK: PassmanagerWebsiteUpdateRequest convenience initializers and mutators

public extension PassmanagerWebsiteUpdateRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerWebsiteUpdateRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        entryID: String? = nil,
        revision: String? = nil,
        rules: [CredentialWebsiteRule]? = nil
    ) -> PassmanagerWebsiteUpdateRequest {
        return PassmanagerWebsiteUpdateRequest(
            entryID: entryID ?? self.entryID,
            revision: revision ?? self.revision,
            rules: rules ?? self.rules
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - PassmanagerWebsiteValidateRequest
public struct PassmanagerWebsiteValidateRequest: Codable {
    public let rules: [CredentialWebsiteRule]

    public enum CodingKeys: String, CodingKey {
        case rules = "rules"
    }

    public init(rules: [CredentialWebsiteRule]) {
        self.rules = rules
    }
}

// MARK: PassmanagerWebsiteValidateRequest convenience initializers and mutators

public extension PassmanagerWebsiteValidateRequest {
    init(data: Data) throws {
        self = try newJSONDecoder().decode(PassmanagerWebsiteValidateRequest.self, from: data)
    }

    init(_ json: String, using encoding: String.Encoding = .utf8) throws {
        guard let data = json.data(using: encoding) else {
            throw NSError(domain: "JSONDecoding", code: 0, userInfo: nil)
        }
        try self.init(data: data)
    }

    init(fromURL url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    func with(
        rules: [CredentialWebsiteRule]? = nil
    ) -> PassmanagerWebsiteValidateRequest {
        return PassmanagerWebsiteValidateRequest(
            rules: rules ?? self.rules
        )
    }

    func jsonData() throws -> Data {
        return try newJSONEncoder().encode(self)
    }

    func jsonString(encoding: String.Encoding = .utf8) throws -> String? {
        return String(data: try self.jsonData(), encoding: encoding)
    }
}

// MARK: - Helper functions for creating encoders and decoders

func newJSONDecoder() -> JSONDecoder {
    let decoder = JSONDecoder()
    if #available(iOS 10.0, OSX 10.12, tvOS 10.0, watchOS 3.0, *) {
        decoder.dateDecodingStrategy = .iso8601
    }
    return decoder
}

func newJSONEncoder() -> JSONEncoder {
    let encoder = JSONEncoder()
    if #available(iOS 10.0, OSX 10.12, tvOS 10.0, watchOS 3.0, *) {
        encoder.dateEncodingStrategy = .iso8601
    }
    return encoder
}

// MARK: - Encode/decode helpers

public final class JSONNull: Codable, Hashable {

    public static func == (lhs: JSONNull, rhs: JSONNull) -> Bool {
        return true
    }

    public var hashValue: Int {
        return 0
    }

    public func hash(into hasher: inout Hasher) {
        // No-op
    }

    public init() {}

    public required init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if !container.decodeNil() {
            throw DecodingError.typeMismatch(JSONNull.self, DecodingError.Context(codingPath: decoder.codingPath, debugDescription: "Wrong type for JSONNull"))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encodeNil()
    }
}

final class JSONCodingKey: CodingKey {
    let key: String

    required init?(intValue: Int) {
        return nil
    }

    required init?(stringValue: String) {
        key = stringValue
    }

    var intValue: Int? {
        return nil
    }

    var stringValue: String {
        return key
    }
}

public final class JSONAny: Codable {

    public let value: Any

    static func decodingError(forCodingPath codingPath: [CodingKey]) -> DecodingError {
        let context = DecodingError.Context(codingPath: codingPath, debugDescription: "Cannot decode JSONAny")
        return DecodingError.typeMismatch(JSONAny.self, context)
    }

    static func encodingError(forValue value: Any, codingPath: [CodingKey]) -> EncodingError {
        let context = EncodingError.Context(codingPath: codingPath, debugDescription: "Cannot encode JSONAny")
        return EncodingError.invalidValue(value, context)
    }

    static func decode(from container: SingleValueDecodingContainer) throws -> Any {
        if let value = try? container.decode(Bool.self) {
            return value
        }
        if let value = try? container.decode(Int64.self) {
            return value
        }
        if let value = try? container.decode(Double.self) {
            return value
        }
        if let value = try? container.decode(String.self) {
            return value
        }
        if container.decodeNil() {
            return JSONNull()
        }
        throw decodingError(forCodingPath: container.codingPath)
    }

    static func decode(from container: inout UnkeyedDecodingContainer) throws -> Any {
        if let value = try? container.decode(Bool.self) {
            return value
        }
        if let value = try? container.decode(Int64.self) {
            return value
        }
        if let value = try? container.decode(Double.self) {
            return value
        }
        if let value = try? container.decode(String.self) {
            return value
        }
        if let value = try? container.decodeNil() {
            if value {
                return JSONNull()
            }
        }
        if var container = try? container.nestedUnkeyedContainer() {
            return try decodeArray(from: &container)
        }
        if var container = try? container.nestedContainer(keyedBy: JSONCodingKey.self) {
            return try decodeDictionary(from: &container)
        }
        throw decodingError(forCodingPath: container.codingPath)
    }

    static func decode(from container: inout KeyedDecodingContainer<JSONCodingKey>, forKey key: JSONCodingKey) throws -> Any {
        if let value = try? container.decode(Bool.self, forKey: key) {
            return value
        }
        if let value = try? container.decode(Int64.self, forKey: key) {
            return value
        }
        if let value = try? container.decode(Double.self, forKey: key) {
            return value
        }
        if let value = try? container.decode(String.self, forKey: key) {
            return value
        }
        if let value = try? container.decodeNil(forKey: key) {
            if value {
                return JSONNull()
            }
        }
        if var container = try? container.nestedUnkeyedContainer(forKey: key) {
            return try decodeArray(from: &container)
        }
        if var container = try? container.nestedContainer(keyedBy: JSONCodingKey.self, forKey: key) {
            return try decodeDictionary(from: &container)
        }
        throw decodingError(forCodingPath: container.codingPath)
    }

    static func decodeArray(from container: inout UnkeyedDecodingContainer) throws -> [Any] {
        var arr: [Any] = []
        while !container.isAtEnd {
            let value = try decode(from: &container)
            arr.append(value)
        }
        return arr
    }

    static func decodeDictionary(from container: inout KeyedDecodingContainer<JSONCodingKey>) throws -> [String: Any] {
        var dict = [String: Any]()
        for key in container.allKeys {
            let value = try decode(from: &container, forKey: key)
            dict[key.stringValue] = value
        }
        return dict
    }

    static func encode(to container: inout UnkeyedEncodingContainer, array: [Any]) throws {
        for value in array {
            if let value = value as? Bool {
                try container.encode(value)
            } else if let value = value as? Int64 {
                try container.encode(value)
            } else if let value = value as? Double {
                try container.encode(value)
            } else if let value = value as? String {
                try container.encode(value)
            } else if value is JSONNull {
                try container.encodeNil()
            } else if let value = value as? [Any] {
                var container = container.nestedUnkeyedContainer()
                try encode(to: &container, array: value)
            } else if let value = value as? [String: Any] {
                var container = container.nestedContainer(keyedBy: JSONCodingKey.self)
                try encode(to: &container, dictionary: value)
            } else {
                throw encodingError(forValue: value, codingPath: container.codingPath)
            }
        }
    }

    static func encode(to container: inout KeyedEncodingContainer<JSONCodingKey>, dictionary: [String: Any]) throws {
        for (key, value) in dictionary {
            let key = JSONCodingKey(stringValue: key)!
            if let value = value as? Bool {
                try container.encode(value, forKey: key)
            } else if let value = value as? Int64 {
                try container.encode(value, forKey: key)
            } else if let value = value as? Double {
                try container.encode(value, forKey: key)
            } else if let value = value as? String {
                try container.encode(value, forKey: key)
            } else if value is JSONNull {
                try container.encodeNil(forKey: key)
            } else if let value = value as? [Any] {
                var container = container.nestedUnkeyedContainer(forKey: key)
                try encode(to: &container, array: value)
            } else if let value = value as? [String: Any] {
                var container = container.nestedContainer(keyedBy: JSONCodingKey.self, forKey: key)
                try encode(to: &container, dictionary: value)
            } else {
                throw encodingError(forValue: value, codingPath: container.codingPath)
            }
        }
    }

    static func encode(to container: inout SingleValueEncodingContainer, value: Any) throws {
        if let value = value as? Bool {
            try container.encode(value)
        } else if let value = value as? Int64 {
            try container.encode(value)
        } else if let value = value as? Double {
            try container.encode(value)
        } else if let value = value as? String {
            try container.encode(value)
        } else if value is JSONNull {
            try container.encodeNil()
        } else {
            throw encodingError(forValue: value, codingPath: container.codingPath)
        }
    }

    public required init(from decoder: Decoder) throws {
        if var arrayContainer = try? decoder.unkeyedContainer() {
            self.value = try JSONAny.decodeArray(from: &arrayContainer)
        } else if var container = try? decoder.container(keyedBy: JSONCodingKey.self) {
            self.value = try JSONAny.decodeDictionary(from: &container)
        } else {
            let container = try decoder.singleValueContainer()
            self.value = try JSONAny.decode(from: container)
        }
    }

    public func encode(to encoder: Encoder) throws {
        if let arr = self.value as? [Any] {
            var container = encoder.unkeyedContainer()
            try JSONAny.encode(to: &container, array: arr)
        } else if let dict = self.value as? [String: Any] {
            var container = encoder.container(keyedBy: JSONCodingKey.self)
            try JSONAny.encode(to: &container, dictionary: dict)
        } else {
            var container = encoder.singleValueContainer()
            try JSONAny.encode(to: &container, value: self.value)
        }
    }
}
