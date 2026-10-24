//! Read-only decoding and preparation before the ordinary reviewed root transaction.
use super::{bitwarden, csv, external, keepass, onepassword};
use crate::credential_import::{
    normalize_json_document, CredentialImportMode, ImportDocumentInfo, PreparedCredentialImport,
};
use crate::error::ErrorCode;
use crate::rpc::{helpers::clear_rpc_strings, router::state::RpcRouter, types::RpcResponse};
use serde_json::Value;

impl RpcRouter {
    /// Prepare once in Core. Source contents supply data; the caller supplies mode
    /// and a later explicit confirmation supplies commit authority.
    pub fn prepare_credential_import(
        &self,
        bytes: &[u8],
        mode: CredentialImportMode,
        password: Option<&str>,
    ) -> Result<PreparedCredentialImport, RpcResponse> {
        let (mut document, info) = self.prepare_credential_import_document_with_password(
            bytes,
            matches!(mode, CredentialImportMode::Merge),
            password,
        )?;
        let Some(data) = document.as_object_mut() else {
            clear_rpc_strings(&mut document);
            return Err(RpcResponse::error(
                "Expected a credential root document",
                Some(ErrorCode::EmptyPayload),
            ));
        };
        for key in [
            "mode",
            "allow_destructive",
            "allowDestructive",
            "expected_revision",
        ] {
            if let Some(mut value) = data.remove(key) {
                clear_rpc_strings(&mut value);
            }
        }
        data.insert("mode".into(), Value::String(mode.wire().into()));
        match self.credential_import_preview(&document) {
            Ok(mut preview) => {
                preview.source = info.source;
                preview.warnings = info.warnings;
                Ok(PreparedCredentialImport::new(document, preview))
            }
            Err(error) => {
                clear_rpc_strings(&mut document);
                Err(error)
            }
        }
    }

    /// The file supplies content only. Mode comes from the caller; preparation never writes.
    pub fn prepare_credential_import_document(
        &self,
        bytes: &[u8],
        preserve_existing: bool,
    ) -> Result<(Value, ImportDocumentInfo), RpcResponse> {
        self.prepare_credential_import_document_with_password(bytes, preserve_existing, None)
    }

    /// A source database password is transient input, not vault authentication or import authority.
    pub fn prepare_credential_import_document_with_password(
        &self,
        bytes: &[u8],
        preserve_existing: bool,
        password: Option<&str>,
    ) -> Result<(Value, ImportDocumentInfo), RpcResponse> {
        let session = self.session.as_ref().ok_or_else(|| {
            RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultRequired))
        })?;
        if bytes.len() > crate::credential_import::MAX_IMPORT_DOCUMENT_BYTES as usize {
            return Err(RpcResponse::error(
                "Import file exceeds the size limit",
                Some(ErrorCode::CredentialImportTooLarge),
            ));
        }
        let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
        let (mut document, mut info) =
            if bytes.starts_with(&[0x03, 0xd9, 0xa2, 0x9a, 0x67, 0xfb, 0x4b, 0xb5]) {
                keepass::convert(bytes, password)?
            } else if bytes.starts_with(b"PK\x03\x04") || bytes.starts_with(b"PK\x05\x06") {
                onepassword::convert(bytes)?
            } else {
                let text = std::str::from_utf8(bytes).map_err(|_| {
                    RpcResponse::error(
                        "Credential exports must use UTF-8",
                        Some(ErrorCode::EmptyPayload),
                    )
                })?;
                let prepared = if text.trim_start().starts_with(['{', '[']) {
                    let mut data: Value = serde_json::from_slice(bytes).map_err(|_| {
                        RpcResponse::error(
                            "Invalid credential import JSON",
                            Some(ErrorCode::EmptyPayload),
                        )
                    })?;
                    if data.is_object()
                        && data.get("version").is_none()
                        && data.get("entries").is_none()
                        && (data.get("items").is_some() || data.get("encrypted").is_some())
                    {
                        let converted = bitwarden::convert(&data);
                        clear_rpc_strings(&mut data);
                        converted?
                    } else {
                        if let Err(message) = normalize_json_document(&mut data) {
                            clear_rpc_strings(&mut data);
                            return Err(RpcResponse::error(message, Some(ErrorCode::EmptyPayload)));
                        }
                        (data, ImportDocumentInfo::default())
                    }
                } else {
                    csv::convert(bytes)?
                };
                prepared
            };

        if info.source.is_some() {
            match external::resolve_entries(session, &self.storage, &mut document, preserve_existing, &info.legacy_ids) {
                Ok(count) if count > 0 => info.warnings.push(crate::rpc::types::CredentialImportWarning {
                    code: crate::rpc::types::CredentialImportWarningCode::LegacyIdentifiersMatched,
                    count,
                }),
                Ok(_) => {},
                Err(error) => {
                    clear_rpc_strings(&mut document);
                    return Err(error);
                }
            }
        }
        Ok((document, info))
    }
}
