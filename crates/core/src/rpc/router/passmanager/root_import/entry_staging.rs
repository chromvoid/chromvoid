use super::catalog_staging::{ensure_dir_path, stage_file_bytes};
use super::error::RootImportError;
use super::otp_staging::stage_imported_otp_secrets;
use super::parser::{entry_folder_path, entry_title};
use super::secret_staging::stage_imported_secrets;
use super::types::PlannedChunk;
use crate::catalog::CatalogManager;
use crate::storage::Storage;
use crate::types::KEY_SIZE;
use crate::vault::VaultSession;
use serde_json::{Map, Value};

pub(super) fn stage_entry(
    session: &VaultSession,
    storage: &Storage,
    catalog: &mut CatalogManager,
    vault_key: &[u8; KEY_SIZE],
    entry_obj: &Map<String, Value>,
    chunks: &mut Vec<PlannedChunk>,
) -> Result<(), RootImportError> {
    let title = entry_title(entry_obj)?;
    let folder_path = entry_folder_path(entry_obj)?;
    let pm_parent = super::super::path::map_entry_group_path_to_passmanager_path(Some(folder_path))
        .ok_or_else(|| RootImportError::access_denied("Access denied"))?;
    ensure_dir_path(catalog, &pm_parent)?;

    let requested_entry_id = entry_obj
        .get("id")
        .and_then(|v| v.as_str())
        .or_else(|| entry_obj.get("entry_id").and_then(|v| v.as_str()))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let existing_node_id = requested_entry_id
        .as_deref()
        .and_then(|id| super::super::entry::resolve_entry_node_id(session, storage, id))
        .filter(|node_id| catalog.find_by_id(*node_id).is_some());

    let entry_node_id = if let Some(node_id) = existing_node_id {
        let current_parent = catalog
            .get_path(node_id)
            .and_then(|path| path.rsplit_once('/').map(|(parent, _)| parent.to_string()))
            .unwrap_or_else(|| "/.passmanager".to_string());
        if current_parent != pm_parent {
            catalog
                .move_node(node_id, &pm_parent)
                .map_err(|error| RootImportError::internal(error.to_string()))?;
        }
        node_id
    } else {
        catalog
            .create_dir(&pm_parent, title)
            .map_err(|error| RootImportError::internal(error.to_string()))?
    };

    let entry_path = catalog
        .get_path(entry_node_id)
        .ok_or_else(|| RootImportError::node_not_found("Entry not found"))?;
    let entry_type = entry_obj
        .get("entry_type")
        .or_else(|| entry_obj.get("entryType"))
        .and_then(|value| value.as_str())
        .unwrap_or("login");
    let out_entry_id = requested_entry_id.unwrap_or_else(|| entry_node_id.to_string());
    let now = super::super::path::now_unix_ms();
    let mut meta = Map::new();
    meta.insert("id".to_string(), Value::String(out_entry_id));
    meta.insert("title".to_string(), Value::String(title.to_string()));
    meta.insert(
        "entry_type".to_string(),
        Value::String(entry_type.to_string()),
    );
    meta.insert(
        "createdTs".to_string(),
        entry_obj
            .get("createdTs")
            .or_else(|| entry_obj.get("created_ts"))
            .cloned()
            .unwrap_or_else(|| Value::Number(now.into())),
    );
    meta.insert(
        "updatedTs".to_string(),
        entry_obj
            .get("updatedTs")
            .or_else(|| entry_obj.get("updated_ts"))
            .cloned()
            .unwrap_or_else(|| Value::Number(now.into())),
    );
    meta.insert(
        "groupPath".to_string(),
        Value::String(super::super::path::group_path_from_entry_path(&entry_path)),
    );

    if entry_type == "payment_card" {
        let value = Value::Object(entry_obj.clone());
        if let Some(payment_card) = super::super::entry::normalized_payment_card_meta(&value)
            .map_err(RootImportError::from_passmanager_command_error)?
        {
            meta.insert("payment_card".to_string(), payment_card);
        }
    } else {
        for key in [
            "username",
            "urls",
            "sshKeys",
            "sshKeyType",
            "sshKeyFingerprint",
            "sshKeyComment",
        ] {
            if let Some(value) = entry_obj.get(key) {
                meta.insert(key.to_string(), value.clone());
            }
        }
        if let Some(otps) = entry_obj.get("otps").and_then(|value| value.as_array()) {
            let sanitized = otps
                .iter()
                .cloned()
                .map(|mut otp| {
                    if let Some(object) = otp.as_object_mut() {
                        object.remove("secret");
                    }
                    otp
                })
                .collect::<Vec<_>>();
            meta.insert("otps".to_string(), Value::Array(sanitized));
        }
    }
    if let Some(icon_ref) = entry_obj
        .get("iconRef")
        .and_then(|value| value.as_str())
        .or_else(|| entry_obj.get("icon_ref").and_then(|value| value.as_str()))
    {
        meta.insert("iconRef".to_string(), Value::String(icon_ref.to_string()));
    }
    if let Some(tags) = entry_obj.get("tags") {
        meta.insert("tags".to_string(), tags.clone());
    }

    stage_imported_secrets(
        catalog,
        vault_key,
        &entry_path,
        entry_type,
        entry_obj,
        &mut meta,
        chunks,
    )?;
    stage_imported_otp_secrets(vault_key, entry_node_id, entry_obj, chunks)?;

    super::super::entry::sanitize_entry_meta_for_wire(&mut meta);
    let meta_bytes = serde_json::to_vec(&Value::Object(meta)).map_err(|error| {
        RootImportError::internal(format!("Failed to encode entry metadata: {error}"))
    })?;
    stage_file_bytes(
        catalog,
        vault_key,
        &entry_path,
        "meta.json",
        &meta_bytes,
        "application/json",
        chunks,
    )
    .map(|_| ())
}
