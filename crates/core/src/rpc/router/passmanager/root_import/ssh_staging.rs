use super::catalog_staging::stage_file_bytes;
use super::error::RootImportError;
use super::types::PlannedChunk;
use crate::catalog::CatalogManager;
use crate::storage::Storage;
use crate::types::KEY_SIZE;
use crate::vault::VaultSession;

pub(super) fn stage_imported_legacy_ssh_secrets(
    session: &VaultSession,
    storage: &Storage,
    catalog: &mut CatalogManager,
    vault_key: &[u8; KEY_SIZE],
    entries: &[serde_json::Value],
    imported_keys: &[super::super::ssh::SshKeyMetadata],
    chunks: &mut Vec<PlannedChunk>,
) -> Result<Vec<u64>, RootImportError> {
    let mut cleanup_node_ids = Vec::new();

    for entry in entries {
        let Some(object) = entry.as_object() else {
            continue;
        };
        let Some(entry_id) = object
            .get("id")
            .or_else(|| object.get("entry_id"))
            .and_then(serde_json::Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        let Some(entry_node_id) =
            super::super::entry::resolve_entry_node_id(session, storage, entry_id)
        else {
            continue;
        };
        let Some(legacy_keys) = object.get("sshKeys").and_then(serde_json::Value::as_array) else {
            continue;
        };

        for legacy in legacy_keys {
            let Some(old_id) = legacy
                .get("id")
                .and_then(serde_json::Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
            else {
                continue;
            };
            let fingerprint = legacy
                .get("fingerprint")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default();
            let Some(target) = imported_keys.iter().find(|key| {
                key.source_entry_id.as_deref() == Some(entry_id)
                    && key.fingerprint == fingerprint
                    && (key.id == old_id || key.id.starts_with("migrated-"))
            }) else {
                continue;
            };

            for (secret_type, filename_prefix) in [
                ("ssh_private_key", ".ssh_private_key."),
                ("ssh_public_key", ".ssh_public_key."),
            ] {
                let legacy_type = format!("{secret_type}:{old_id}");
                let Some(value) = super::super::secret::read_secret_value(
                    session,
                    storage,
                    entry_node_id,
                    &legacy_type,
                ) else {
                    continue;
                };
                stage_file_bytes(
                    catalog,
                    vault_key,
                    super::super::ssh::SSH_ROOT_PATH,
                    &format!("{filename_prefix}{}", target.id),
                    value.as_bytes(),
                    "text/plain",
                    chunks,
                )?;
                if let Some(node_id) = session
                    .catalog()
                    .find_by_id(entry_node_id)
                    .and_then(|entry_node| {
                        entry_node.find_child(&format!("{filename_prefix}{old_id}"))
                    })
                    .map(|node| node.node_id)
                {
                    cleanup_node_ids.push(node_id);
                }
            }
        }
    }

    cleanup_node_ids.sort_unstable();
    cleanup_node_ids.dedup();
    Ok(cleanup_node_ids)
}
