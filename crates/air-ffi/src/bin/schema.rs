//! Exports schemas from the real Rust wire types and inventories declared commands.
use chromvoid_core::rpc::types::{
    PassmanagerEntryCreateRequest, PassmanagerEntryListResponse, PassmanagerEntryPageRequest,
    PassmanagerEntryPageResponse, PassmanagerEntrySaveResponse, RpcError, RpcRequest, RpcSuccess,
    VaultStatusResponse, VaultUnlockResponse,
};
use schemars::{JsonSchema, generate::SchemaSettings};
use serde_json::json;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::Path,
};
use syn::{Item, LitStr, visit::Visit};

#[derive(Default)]
struct DispatchPatterns(BTreeSet<String>);
impl<'ast> Visit<'ast> for DispatchPatterns {
    fn visit_pat(&mut self, node: &'ast syn::Pat) {
        if let syn::Pat::Lit(literal) = node {
            if let syn::Lit::Str(value) = &literal.lit {
                self.0.insert(value.value());
            }
        } else {
            syn::visit::visit_pat(self, node);
        }
    }
}

#[derive(JsonSchema)]
struct WireSchema {
    #[allow(dead_code)]
    vault_rekey_request: chromvoid_core::rpc::types::VaultRekeyRequest,
    #[allow(dead_code)]
    vault_rekey: chromvoid_core::rpc::types::VaultRekeyResponse,
    #[allow(dead_code)]
    master_rekey_request: chromvoid_core::rpc::types::MasterRekeyRequest,
    #[allow(dead_code)]
    master_rekey: chromvoid_core::rpc::types::MasterRekeyResponse,
    #[allow(dead_code)]
    wallet_recovery_request: chromvoid_core::rpc::types::WalletBackupExportRequest,
    #[allow(dead_code)]
    wallet_recovery: chromvoid_core::rpc::types::WalletBackupExportResponse,
    wallet_ton_rotate_key_request: chromvoid_core::rpc::types::WalletTonRotateKeyRequest,
    wallet_ton_rotate_key_response: chromvoid_core::rpc::types::WalletTonRotateKeyResponse,
    #[allow(dead_code)]
    wallet_quote_request: chromvoid_core::rpc::types::WalletTransactionQuoteRequest,
    #[allow(dead_code)]
    wallet_quoted: chromvoid_core::rpc::types::WalletTransactionQuoteResponse,
    #[allow(dead_code)]
    wallet_prepare_request: chromvoid_core::rpc::types::WalletTransactionPrepareRequest,
    #[allow(dead_code)]
    wallet_prepared: chromvoid_core::rpc::types::WalletTransactionPrepareResponse,
    #[allow(dead_code)]
    wallet_confirm_request: chromvoid_core::rpc::types::WalletTransactionConfirmRequest,
    #[allow(dead_code)]
    wallet_confirmed: chromvoid_core::rpc::types::WalletTransactionConfirmResponse,
    #[allow(dead_code)]
    wallet_cancel_request: chromvoid_core::rpc::types::WalletTransactionCancelRequest,
    #[allow(dead_code)]
    wallet_cancelled: chromvoid_core::rpc::types::WalletTransactionCancelResponse,
    #[allow(dead_code)]
    wallet_rebroadcast_request: chromvoid_core::rpc::types::WalletTransactionRebroadcastRequest,
    #[allow(dead_code)]
    wallet_rebroadcasted: chromvoid_core::rpc::types::WalletTransactionRebroadcastResponse,

    #[allow(dead_code)]
    wallet_history_request: chromvoid_core::rpc::types::WalletTransactionsListRequest,
    #[allow(dead_code)]
    wallet_history: chromvoid_core::rpc::types::WalletTransactionsListResponse,
    #[allow(dead_code)]
    wallet_history_sync_request: chromvoid_core::rpc::types::WalletTransactionsSyncRequest,
    #[allow(dead_code)]
    wallet_history_synced: chromvoid_core::rpc::types::WalletTransactionsSyncResponse,
    #[allow(dead_code)]
    wallet_transaction_refresh_request:
        chromvoid_core::rpc::types::WalletTransactionsRefreshRequest,
    #[allow(dead_code)]
    wallet_transaction_refreshed: chromvoid_core::rpc::types::WalletTransactionsRefreshResponse,
    #[allow(dead_code)]
    wallet_contacts: chromvoid_core::rpc::types::WalletAddressBookListResponse,
    #[allow(dead_code)]
    wallet_contact_create_request: chromvoid_core::rpc::types::WalletAddressBookCreateRequest,
    #[allow(dead_code)]
    wallet_contact_created: chromvoid_core::rpc::types::WalletAddressBookCreateResponse,
    #[allow(dead_code)]
    wallet_contact_update_request: chromvoid_core::rpc::types::WalletAddressBookUpdateRequest,
    #[allow(dead_code)]
    wallet_contact_updated: chromvoid_core::rpc::types::WalletAddressBookUpdateResponse,
    #[allow(dead_code)]
    wallet_contact_delete_request: chromvoid_core::rpc::types::WalletAddressBookDeleteRequest,
    #[allow(dead_code)]
    wallet_contact_deleted: chromvoid_core::rpc::types::WalletAddressBookDeleteResponse,
    #[allow(dead_code)]
    wallet_address_detect_request: chromvoid_core::rpc::types::WalletAddressDetectRequest,
    #[allow(dead_code)]
    wallet_address_detected: chromvoid_core::rpc::types::WalletAddressDetectResponse,
    #[allow(dead_code)]
    wallet_mnemonic_request: chromvoid_core::rpc::types::WalletHdGenerateMnemonicRequest,
    #[allow(dead_code)]
    wallet_mnemonic: chromvoid_core::rpc::types::WalletHdGenerateMnemonicResponse,
    #[allow(dead_code)]
    wallet_create_request: chromvoid_core::rpc::types::WalletHdCreateRequest,
    #[allow(dead_code)]
    wallet_created: chromvoid_core::rpc::types::WalletHdCreateResponse,
    #[allow(dead_code)]
    wallet_import_request: chromvoid_core::rpc::types::WalletImportCreateRequest,
    #[allow(dead_code)]
    wallet_imported: chromvoid_core::rpc::types::WalletImportCreateResponse,
    #[allow(dead_code)]
    wallet_status: chromvoid_core::rpc::types::WalletStatusResponse,
    #[allow(dead_code)]
    wallet_list: chromvoid_core::rpc::types::WalletListResponse,
    #[allow(dead_code)]
    wallet_accounts_request: chromvoid_core::rpc::types::WalletAccountsListRequest,
    #[allow(dead_code)]
    wallet_accounts: chromvoid_core::rpc::types::WalletAccountsListResponse,
    #[allow(dead_code)]
    wallet_derive_request: chromvoid_core::rpc::types::WalletAccountsDeriveRequest,
    #[allow(dead_code)]
    wallet_derived: chromvoid_core::rpc::types::WalletAccountsDeriveResponse,
    #[allow(dead_code)]
    wallet_address_request: chromvoid_core::rpc::types::WalletAddressesDeriveRequest,
    #[allow(dead_code)]
    wallet_address: chromvoid_core::rpc::types::WalletAddressesDeriveResponse,
    #[allow(dead_code)]
    wallet_balance_request: chromvoid_core::rpc::types::WalletBalanceGetRequest,
    #[allow(dead_code)]
    wallet_balance: chromvoid_core::rpc::types::WalletBalanceGetResponse,
    #[allow(dead_code)]
    attachment_request: chromvoid_core::rpc::types::CatalogAttachmentRequest,
    #[allow(dead_code)]
    attachment_response: chromvoid_core::rpc::types::CatalogAttachmentResponse,
    #[allow(dead_code)]
    document_link_request: chromvoid_core::rpc::types::CatalogDocumentLinkRequest,
    #[allow(dead_code)]
    document_link_response: chromvoid_core::rpc::types::CatalogDocumentLinkResponse,
    #[allow(dead_code)]
    markdown_document: chromvoid_core::markdown::MarkdownDocument,
    #[allow(dead_code)]
    folder_request: chromvoid_core::rpc::types::CatalogFolderPageRequest,
    #[allow(dead_code)]
    folder_page: chromvoid_core::rpc::types::CatalogFolderPageResponse,
    #[allow(dead_code)]
    node_created: chromvoid_core::rpc::types::NodeCreatedResponse,
    #[allow(dead_code)]
    file_source: chromvoid_core::rpc::types::SourceMetadataResponse,
    #[allow(dead_code)]
    file_upload: chromvoid_core::rpc::types::UploadResponse,
    #[allow(dead_code)]
    document_saved: chromvoid_core::rpc::types::CatalogFileReplaceResponse,
    #[allow(dead_code)]
    provider_status: chromvoid_core::rpc::types::CredentialProviderStatusResponse,
    #[allow(dead_code)]
    passkeys_list: chromvoid_core::rpc::types::VaultPasskeysListResponse,
    #[allow(dead_code)]
    passkey_delete_request: chromvoid_core::rpc::types::VaultPasskeyDeleteRequest,
    #[allow(dead_code)]
    passkey_delete_response: chromvoid_core::rpc::types::VaultPasskeyDeleteResponse,
    #[allow(dead_code)]
    root_import_preview: chromvoid_core::rpc::types::PassmanagerRootImportPreview,
    #[allow(dead_code)]
    root_import_request: chromvoid_core::rpc::types::PassmanagerRootImportRequest,
    #[allow(dead_code)]
    website_read_request: chromvoid_core::rpc::types::PassmanagerWebsiteReadRequest,
    #[allow(dead_code)]
    website_validate_request: chromvoid_core::rpc::types::PassmanagerWebsiteValidateRequest,
    #[allow(dead_code)]
    website_update_request: chromvoid_core::rpc::types::PassmanagerWebsiteUpdateRequest,
    #[allow(dead_code)]
    website_result: chromvoid_core::rpc::types::PassmanagerWebsiteResult,
    #[allow(dead_code)]
    ssh_page_request: chromvoid_core::rpc::types::PassmanagerSshPageRequest,
    #[allow(dead_code)]
    ssh_page_response: chromvoid_core::rpc::types::PassmanagerSshPageResponse,
    #[allow(dead_code)]
    ssh_edit_request: chromvoid_core::rpc::types::PassmanagerSshEditRequest,
    #[allow(dead_code)]
    ssh_import_request: chromvoid_core::rpc::types::PassmanagerSshImportRequest,
    #[allow(dead_code)]
    ssh_export_request: chromvoid_core::rpc::types::PassmanagerSshExportRequest,
    #[allow(dead_code)]
    ssh_export_response: chromvoid_core::rpc::types::PassmanagerSshExportResponse,
    #[allow(dead_code)]
    ssh_keygen_request: chromvoid_core::rpc::types::PassmanagerSshKeygenRequest,
    #[allow(dead_code)]
    ssh_keygen_response: chromvoid_core::rpc::types::PassmanagerSshKeyCreateResponse,
    #[allow(dead_code)]
    security_audit_request: chromvoid_core::rpc::types::PassmanagerSecurityAuditPageRequest,
    #[allow(dead_code)]
    security_audit_page: chromvoid_core::rpc::types::PassmanagerSecurityAuditPageResponse,
    #[allow(dead_code)]
    password_generation_request: chromvoid_core::rpc::types::PassmanagerPasswordGenerateRequest,
    #[allow(dead_code)]
    password_generation_response: chromvoid_core::rpc::types::PassmanagerPasswordGenerateResponse,
    #[allow(dead_code)]
    otp_uri_request: chromvoid_core::rpc::types::PassmanagerOtpUriRequest,
    #[allow(dead_code)]
    otp_uri_response: chromvoid_core::rpc::types::PassmanagerOtpUriResponse,
    #[allow(dead_code)]
    otp_list: chromvoid_core::rpc::types::PassmanagerOtpRecordsRequest,
    #[allow(dead_code)]
    otp_save: chromvoid_core::rpc::types::PassmanagerOtpRecordSaveRequest,
    #[allow(dead_code)]
    otp_delete: chromvoid_core::rpc::types::PassmanagerOtpRecordRequest,
    #[allow(dead_code)]
    otp_code: chromvoid_core::rpc::types::PassmanagerOtpRecordRequest,
    #[allow(dead_code)]
    otp_response: chromvoid_core::rpc::types::PassmanagerOtpRecordsResponse,
    #[allow(dead_code)]
    otp_generated: chromvoid_core::rpc::types::OtpPreviewResponse,
    #[allow(dead_code)]
    tag_page_request: chromvoid_core::rpc::types::PassmanagerTagPageRequest,
    #[allow(dead_code)]
    tag_page: chromvoid_core::rpc::types::PassmanagerTagPageResponse,
    #[allow(dead_code)]
    tag_save: chromvoid_core::rpc::types::PassmanagerTagSaveRequest,
    #[allow(dead_code)]
    tag_delete: chromvoid_core::rpc::types::PassmanagerTagDeleteRequest,

    #[allow(dead_code)]
    group_page_request: chromvoid_core::rpc::types::PassmanagerGroupPageRequest,
    #[allow(dead_code)]
    group_page: chromvoid_core::rpc::types::PassmanagerGroupPageResponse,
    #[allow(dead_code)]
    group_rename: chromvoid_core::rpc::types::PassmanagerGroupRenameRequest,
    #[allow(dead_code)]
    status: VaultStatusResponse,
    #[allow(dead_code)]
    credential_detail: chromvoid_core::rpc::types::CredentialDetail,
    #[allow(dead_code)]
    credential_update: chromvoid_core::rpc::types::PassmanagerEntryUpdateRequest,
    #[allow(dead_code)]
    secret_read: chromvoid_core::rpc::types::PassmanagerSecretReadResponse,
    #[allow(dead_code)]
    request: RpcRequest,
    #[allow(dead_code)]
    error: RpcError,
    #[allow(dead_code)]
    entry_list: PassmanagerEntryListResponse,
    #[allow(dead_code)]
    entry_page: PassmanagerEntryPageResponse,
    #[allow(dead_code)]
    entry_page_request: PassmanagerEntryPageRequest,
    #[allow(dead_code)]
    icon_get_many_request: chromvoid_core::rpc::types::PassmanagerIconGetManyRequest,
    #[allow(dead_code)]
    icon_get_many: chromvoid_core::rpc::types::PassmanagerIconGetManyResponse,
    #[allow(dead_code)]
    entry_create_request: PassmanagerEntryCreateRequest,
    #[allow(dead_code)]
    entry_save_response: PassmanagerEntrySaveResponse,
    #[allow(dead_code)]
    payment_card_metadata: chromvoid_core::rpc::types::PaymentCardMetadata,
}

#[derive(JsonSchema)]
#[allow(dead_code)]
struct ProviderWireSchema {
    status: chromvoid_core::rpc::types::CredentialProviderStatusResponse,
    session: chromvoid_core::rpc::types::CredentialProviderSessionResponse,
    candidate: chromvoid_core::rpc::types::CredentialCandidate,
    secret: chromvoid_core::rpc::types::CredentialSecret,
    one_time_code: chromvoid_core::rpc::types::CredentialOneTimeCode,
    passkeys: chromvoid_core::rpc::types::VaultPasskeysListResponse,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let out = std::env::args()
        .nth(1)
        .ok_or("usage: air-schema OUTPUT_DIRECTORY [apple|android]")?;
    // One contract, two clients: the platform only selects which fingerprint
    // constant is emitted and which target the baseline describes.
    let platform = std::env::args().nth(2).unwrap_or_else(|| "apple".into());
    let native_target = match platform.as_str() {
        "apple" => "iOS/iPadOS 16+",
        "android" => "Android 10+ (API 29)",
        other => return Err(format!("unknown platform {other}; expected apple or android").into()),
    };
    let out = Path::new(&out);
    fs::create_dir_all(out)?;
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let schema = SchemaSettings::draft07()
        .into_generator()
        .into_root_schema_for::<WireSchema>();
    fs::write(
        out.join("wire-schema.json"),
        serde_json::to_vec_pretty(&schema)?,
    )?;
    let provider_schema = SchemaSettings::draft07()
        .into_generator()
        .into_root_schema_for::<ProviderWireSchema>();
    fs::write(
        out.join("provider-wire-schema.json"),
        serde_json::to_vec_pretty(&provider_schema)?,
    )?;
    match platform.as_str() {
        "android" => fs::write(
            out.join("BuildFingerprint.kt"),
            format!(
                "// Generated by air-schema. Do not edit.\npackage com.chromvoid.air.bridge\n\npublic object BuildFingerprint {{\n    public const val EXPECTED: String = \"{}\"\n}}\n",
                chromvoid_air_ffi::BUILD_FINGERPRINT
            ),
        )?,
        _ => fs::write(
            out.join("BuildFingerprint.swift"),
            format!(
                "// Generated by air-schema. Do not edit.\npublic enum BuildFingerprint {{\n    public static let expected = \"{}\"\n}}\n",
                chromvoid_air_ffi::BUILD_FINGERPRINT
            ),
        )?,
    }
    let wallet_accounts: chromvoid_core::rpc::types::WalletAccountsListResponse =
        serde_json::from_value(json!({
            "accounts": [
                {"kind":"imported","account_id":"imported","wallet_id":"wallet","network":"fixture-chain",
                 "address":"synthetic-imported","created_at":1,"updated_at":2},
                {"kind":"derived","account_id":"derived","wallet_id":"wallet","network":"fixture-chain",
                 "mnemonic_standard":"bip39","account_model":"utxo","derivation_profile":"fixture-v1",
                 "current_receive_address":"synthetic-receive","created_at":1,"updated_at":2}
            ],
            "cached_balances": [{"account_id":"imported","network":"fixture-chain","fetched_at":42,
                "balance":{"spendable":"900719925474099312345","total":"900719925474099312345",
                "pending_in":"0","pending_out":"0","amount_unit":"atomic"}}]
        }))?;
    let fixtures = json!({
        "wallet_accounts": RpcSuccess::new(wallet_accounts),
        "locked_status": RpcSuccess::new(VaultStatusResponse { is_unlocked: false, session_started_at: None }),
        "active_status": RpcSuccess::new(VaultStatusResponse { is_unlocked: true, session_started_at: Some(42) }),
        "unlock": RpcSuccess::new(VaultUnlockResponse { repair: None }),
        "lock": RpcSuccess::new(json!({})),
        "list": RpcSuccess::new(PassmanagerEntryListResponse::new(vec![json!({"id":"fixture","title":"Synthetic"})],vec!["Synthetic".into()])),
        "entry_page": RpcSuccess::new(PassmanagerEntryPageResponse { entries: vec![chromvoid_core::rpc::types::CredentialSummary { group_key: None, icon_ref: None, website: Some("mail.example".into()), has_codes: Some(true), id: "synthetic".into(), title: "Почта".into(), username: "alice".into(), entry_type: "login".into(), group_path: "/Personal".into() }], next_offset: Some(50), total_count: Some(51) }),
        "entry_created": RpcSuccess::new(PassmanagerEntrySaveResponse::new("synthetic-created".into())),
        "validation_failure": RpcError::new("Synthetic validation failure", Some("EMPTY_PAYLOAD")),
        "unknown_optional_field": {"ok":true,"result":{"is_unlocked":false,"future_optional":"allowed"}}
    });
    fs::write(
        out.join("wire-fixtures.json"),
        serde_json::to_vec_pretty(&fixtures)?,
    )?;
    let path = "crates/core/src/rpc/types/command.rs";
    let source = fs::read_to_string(root.join(path))?;
    let ast = syn::parse_file(&source)?;
    let command_enum = ast
        .items
        .iter()
        .find_map(|item| match item {
            Item::Enum(item) if item.ident == "RpcCommand" => Some(item),
            _ => None,
        })
        .ok_or("RpcCommand enum missing")?;
    let dispatch_path = "crates/core/src/rpc/router/dispatch.rs";
    let dispatch_source = fs::read_to_string(root.join(dispatch_path))?;
    let mut dispatch = DispatchPatterns::default();
    dispatch.visit_file(&syn::parse_file(&dispatch_source)?);
    let mut commands = BTreeMap::new();
    for variant in &command_enum.variants {
        let mut name = None;
        for attr in &variant.attrs {
            if attr.path().is_ident("serde") {
                attr.parse_nested_meta(|meta| {
                    if meta.path.is_ident("rename") {
                        name = Some(meta.value()?.parse::<LitStr>()?.value());
                    }
                    Ok(())
                })?;
            }
        }
        let name = name.ok_or("command variant without explicit wire name")?;
        let reason = if name.starts_with("env_runtime:") {
            "Excluded: Vault Env Runtime product access is CLI-only"
        } else if name.starts_with("credential_provider:") {
            "Pending signed-device SPEC-215 feasibility; no native support claim"
        } else {
            "Pending shared runtime integration and feature acceptance; Core declaration alone does not grant native support"
        };
        let direct_core_dispatch = dispatch.0.contains(&name);
        commands.insert(
            name,
            json!({"rust_variant": variant.ident.to_string(), "owner": path,
            "direct_core_dispatch": direct_core_dispatch, "native_available": false, "reason": reason}),
        );
    }
    // Availability follows evidence: a command is marked natively available
    // only when a device test proves it, and the list cannot name a command
    // Core does not declare or the bridge would refuse.
    let evidence_path = "crates/air-ffi/native-evidence.json";
    let evidence: serde_json::Value = serde_json::from_slice(&fs::read(root.join(evidence_path))?)?;
    let proven = evidence
        .get(platform.as_str())
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| format!("{evidence_path} has no {platform} section"))?;
    for (command, files) in proven {
        let entry = commands
            .get_mut(command)
            .ok_or_else(|| format!("{evidence_path}: {command} is not a Core command"))?;
        if !chromvoid_air_ffi::NATIVE_COMMANDS.contains(&command.as_str()) {
            return Err(
                format!("{evidence_path}: {command} is not admitted by the native bridge").into(),
            );
        }
        let files = files
            .as_array()
            .filter(|files| !files.is_empty())
            .ok_or_else(|| format!("{evidence_path}: {command} names no evidence"))?;
        for file in files {
            let file = file
                .as_str()
                .ok_or_else(|| format!("{evidence_path}: {command} evidence is not a path"))?;
            if !root.join(file).is_file() {
                return Err(
                    format!("{evidence_path}: {command} evidence {file} does not exist").into(),
                );
            }
        }
        let entry = entry
            .as_object_mut()
            .ok_or("command entry is not an object")?;
        entry.insert("native_available".into(), json!(true));
        entry.insert("evidence".into(), json!(files));
        entry.remove("reason");
    }
    let owners = [
        ("local_runtime", "crates/client-runtime/src/local.rs"),
        (
            "dispatch_policy",
            "crates/client-runtime/src/dispatch/policy.rs",
        ),
        ("core_dispatch", "crates/core/src/rpc/router/dispatch.rs"),
        ("tags", "packages/passmanager/src/service/tags.ts"),
        (
            "security_audit",
            "packages/passmanager/src/service/security-audit.ts",
        ),
        (
            "mobile_credentials",
            "apps/webview/src/features/passmanager/models/pm-mobile-chrome.model.ts",
        ),
    ];
    let presentation_owners = [
        (
            "file_actions",
            "apps/webview/src/features/file-manager/models/file-manager-mobile-actions.model.ts",
        ),
        (
            "file_action_availability",
            "apps/webview/src/features/file-manager/models/file-action-descriptors.ts",
        ),
        (
            "markdown_file_links",
            "apps/webview/src/features/file-manager/services/markdown-file-links.ts",
        ),
        (
            "markdown_note_links",
            "apps/webview/src/features/file-manager/services/markdown-note-links.ts",
        ),
        (
            "markdown_images",
            "apps/webview/src/features/file-manager/services/markdown-image-assets.ts",
        ),
        (
            "markdown_tasks",
            "apps/webview/src/features/file-manager/services/markdown-task-lists.ts",
        ),
        (
            "settings_orchestration",
            "apps/webview/src/routes/settings/settings-page-mobile.ts",
        ),
        (
            "wallet_presentation",
            "apps/webview/src/routes/wallet/wallet-page.types.ts",
        ),
    ];
    let mut source_owners = BTreeMap::new();
    for (domain, path) in owners.into_iter().chain(presentation_owners) {
        source_owners.insert(domain, json!({"path":path,"blake3":blake3::hash(&fs::read(root.join(path))?).to_hex().to_string()}));
    }
    let baseline = json!({"format_version":1,"phase":"W2", "protocol_version":chromvoid_core::rpc::types::PROTOCOL_VERSION,
        "build_fingerprint":chromvoid_air_ffi::BUILD_FINGERPRINT,
        "declaration_source_blake3":blake3::hash(source.as_bytes()).to_hex().to_string(),
        "inventory_kind":"Rust-declared candidates and native bridge admission; product availability requires feature acceptance",
        "native_target":native_target, "native_capabilities":[],
        "native_admitted_commands":chromvoid_air_ffi::NATIVE_COMMANDS,
        "core_features":chromvoid_core::rpc::types::core_capability_features(),
        "commands":commands,"source_owners":source_owners});
    fs::write(
        out.join("capability-baseline.json"),
        serde_json::to_vec_pretty(&baseline)?,
    )?;
    Ok(())
}
