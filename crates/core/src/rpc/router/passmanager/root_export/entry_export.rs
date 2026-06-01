use super::super::{entry, path};
use super::secret_export;
use crate::storage::Storage;
use crate::vault::VaultSession;
use serde_json::{Map, Value};

pub(super) fn collect_exported_entries(session: &VaultSession, storage: &Storage) -> Vec<Value> {
    let Some(pm_root) = session.catalog().find_by_path("/.passmanager") else {
        return Vec::new();
    };

    let mut node_ids = Vec::<u64>::new();
    entry::collect_entry_dir_ids_with_meta(pm_root, &mut node_ids);
    node_ids
        .into_iter()
        .filter_map(|node_id| export_entry(session, storage, node_id))
        .collect()
}

fn export_entry(session: &VaultSession, storage: &Storage, node_id: u64) -> Option<Value> {
    let mut meta = entry::read_entry_meta_json(session, storage, node_id)?;
    let meta_obj = meta.as_object_mut()?;
    let path = session
        .catalog()
        .get_path(node_id)
        .unwrap_or_else(|| "/.passmanager".to_string());
    let group_path = path::group_path_from_entry_path(&path);
    let entry_type = meta_obj
        .get("entry_type")
        .or_else(|| meta_obj.get("entryType"))
        .and_then(|v| v.as_str())
        .unwrap_or("login")
        .to_string();

    normalize_entry_paths(meta_obj, &entry_type, &group_path);
    secret_export::attach_entry_secrets(meta_obj, session, storage, node_id, &entry_type);
    normalize_optional_aliases(meta_obj);
    entry::normalize_entry_tags(meta_obj);

    Some(meta)
}

fn normalize_entry_paths(meta_obj: &mut Map<String, Value>, entry_type: &str, group_path: &str) {
    meta_obj.insert(
        "entry_type".to_string(),
        Value::String(entry_type.to_string()),
    );
    meta_obj.insert(
        "entryType".to_string(),
        Value::String(entry_type.to_string()),
    );

    let folder_path_value = if group_path == "/" {
        Value::Null
    } else {
        Value::String(group_path.to_string())
    };
    meta_obj.insert("folder_path".to_string(), folder_path_value.clone());
    meta_obj.insert("folderPath".to_string(), folder_path_value);
    meta_obj.remove("group_path");
    meta_obj.remove("groupPath");
    meta_obj.insert(
        "group_path".to_string(),
        Value::String(group_path.to_string()),
    );
    meta_obj.insert(
        "groupPath".to_string(),
        Value::String(group_path.to_string()),
    );
}

fn normalize_optional_aliases(meta_obj: &mut Map<String, Value>) {
    if let Some(icon_ref) = meta_obj
        .remove("icon_ref")
        .or_else(|| meta_obj.remove("iconRef"))
    {
        meta_obj.insert("icon_ref".to_string(), icon_ref.clone());
        meta_obj.insert("iconRef".to_string(), icon_ref);
    }
    if let Some(payment_card) = meta_obj
        .remove("payment_card")
        .or_else(|| meta_obj.remove("paymentCard"))
    {
        meta_obj.insert("payment_card".to_string(), payment_card.clone());
        meta_obj.insert("paymentCard".to_string(), payment_card);
    }
}
