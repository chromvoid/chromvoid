//! Review uses the same staging validator as commit, without a durable unit of work.
use super::{
    error::RootImportError, parser::parse_root_import_preview_payload,
    staging::build_root_import_plan,
};
use crate::{
    error::{Error, ErrorCode},
    rpc::{
        router::state::RpcRouter,
        types::{PassmanagerRootImportPreview, RpcResponse},
    },
    storage::Storage,
    vault::VaultSession,
};
use serde_json::Value;

fn revision(session: &VaultSession, storage: &Storage) -> Result<String, RootImportError> {
    let mut hash = blake3::Hasher::new_keyed(session.vault_key());
    hash.update(b"credential-import-review-v1");
    if let Some(root) = session.catalog().find_by_path("/.passmanager") {
        serde_json::to_writer(&mut hash, root)
            .map_err(|_| RootImportError::internal("Cannot inspect credential catalog"))?;
        let mut entries = Vec::new();
        super::super::entry::collect_entry_dir_ids_with_meta(root, &mut entries);
        entries.sort_unstable();
        for node in entries {
            // Legacy OTP setters update the encrypted sidecar without a catalog revision.
            hash.update(&node.to_le_bytes());
            let name = crate::crypto::otp_chunk_name(session.vault_key(), node);
            match storage.read_chunk(&name) {
                Ok(bytes) => {
                    hash.update(&[1]);
                    hash.update(blake3::hash(&bytes).as_bytes());
                }
                Err(Error::ChunkNotFound(_)) => {
                    hash.update(&[0]);
                }
                Err(_) => return Err(RootImportError::internal("Cannot inspect credential data")),
            }
        }
    }
    Ok(hash.finalize().to_hex().to_string())
}

pub(super) fn check_revision(
    session: &VaultSession,
    storage: &Storage,
    data: &Value,
) -> Result<(), RootImportError> {
    let Some(expected) = data.get("expected_revision") else {
        return Ok(());
    };
    let expected = expected
        .as_str()
        .filter(|value| value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .ok_or_else(|| RootImportError::empty_payload("Invalid import review revision"))?;
    if expected != revision(session, storage)? {
        return Err(RootImportError::new(
            "Credentials changed; review the import again",
            ErrorCode::SyncConflict,
        ));
    }
    Ok(())
}

impl RpcRouter {
    pub(in crate::rpc::router) fn handle_passmanager_root_import_preview(
        &self,
        data: &Value,
    ) -> RpcResponse {
        match self.credential_import_preview(data) {
            Ok(preview) => RpcResponse::success(preview),
            Err(error) => error,
        }
    }

    pub(super) fn credential_import_preview(
        &self,
        data: &Value,
    ) -> Result<PassmanagerRootImportPreview, RpcResponse> {
        let session = self.session.as_ref().ok_or_else(|| {
            RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultRequired))
        })?;
        (|| {
            let payload = parse_root_import_preview_payload(data)?;
            check_revision(session, &self.storage, data)?;
            let count = |value: usize| {
                u32::try_from(value)
                    .map_err(|_| RootImportError::empty_payload("Import exceeds capacity"))
            };
            let entry_count = count(payload.entries.len())?;
            let folder_count = count(payload.folders.len())?;
            // Clones the catalog and stages encrypted bytes in memory, without writes.
            let plan = build_root_import_plan(session, &self.storage, payload)?;
            Ok(PassmanagerRootImportPreview {
                revision: revision(session, &self.storage)?,
                mode: data
                    .get("mode")
                    .and_then(Value::as_str)
                    .unwrap_or("merge")
                    .to_owned(),
                entry_count,
                created_entry_count: Some(count(plan.created_entry_count)?),
                updated_entry_count: Some(count(plan.updated_entry_count)?),
                folder_count,
                ssh_key_count: count(plan.imported_ssh_key_count)?,
                source: None,
                warnings: Vec::new(),
            })
        })()
        .map_err(RootImportError::into_rpc_response)
    }
}
