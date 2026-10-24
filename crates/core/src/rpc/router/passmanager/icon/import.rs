//! Validated assets for the root transaction; preparation never writes storage.
use super::super::error::PassmanagerCommandError;
use super::{index, normalize, request, store, types::IconIndexFile};
use crate::{storage::Storage, vault::VaultSession};
use serde_json::Value;
use std::collections::BTreeSet;

const MAX_IMPORT_BYTES: usize = 8 * 1024 * 1024;
const MAX_IMPORT_ICONS: usize = 10_000;

pub(in crate::rpc::router::passmanager) struct ImportIconFile {
    pub(in crate::rpc::router::passmanager) name: String,
    pub(in crate::rpc::router::passmanager) mime_type: String,
    pub(in crate::rpc::router::passmanager) bytes: Vec<u8>,
}

pub(in crate::rpc::router::passmanager) fn plan_import_assets(
    session: &VaultSession,
    storage: &Storage,
    icons: &[Value],
    replacing: bool,
) -> Result<Vec<ImportIconFile>, PassmanagerCommandError> {
    if icons.is_empty() {
        return Ok(Vec::new());
    }
    if icons.len() > MAX_IMPORT_ICONS {
        return Err(PassmanagerCommandError::empty_payload(
            "Too many imported icons",
        ));
    }
    let mut index = if replacing {
        IconIndexFile::default()
    } else {
        store::load_icon_index(session, storage)?
    };
    let mut seen = BTreeSet::new();
    let mut total = 0;
    let mut files = Vec::new();
    for icon in icons {
        let normalized = normalize::normalize_upload_payload(icon)?;
        total += normalized.bytes.len();
        if total > MAX_IMPORT_BYTES {
            return Err(PassmanagerCommandError::empty_payload(
                "Imported icons exceed 8 MiB",
            ));
        }
        let digest = crate::crypto::sha256_hex(&normalized.bytes);
        let expected = format!("sha256:{digest}");
        if icon.get("icon_ref").and_then(Value::as_str) != Some(expected.as_str()) {
            return Err(PassmanagerCommandError::empty_payload(
                "Imported icon reference does not match its content",
            ));
        }
        if !seen.insert(digest) {
            return Err(PassmanagerCommandError::empty_payload(
                "Duplicate imported icon reference",
            ));
        }
        let request = request::parse_icon_put_request(icon)?;
        let (record, _) = index::upsert(&mut index, &normalized, request.background_color);
        files.push(ImportIconFile {
            name: format!("{}.{}", record.sha256, record.ext),
            mime_type: record.mime_type,
            bytes: normalized.bytes,
        });
    }
    let bytes = serde_json::to_vec(&index).map_err(|_| {
        PassmanagerCommandError::new(
            "Cannot serialize imported icon index",
            Some(crate::error::ErrorCode::InternalError),
        )
    })?;
    files.push(ImportIconFile {
        name: "index.json".into(),
        mime_type: "application/json".into(),
        bytes,
    });
    Ok(files)
}
