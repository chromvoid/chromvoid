//! Compatibility decoding for credential documents before normal Core import validation.

use serde_json::{json, Map, Value};

mod prepared;
pub use prepared::{CredentialImportMode, PreparedCredentialImport};

/// Shared document admission; native clients may use a smaller transfer budget.
pub const MAX_IMPORT_DOCUMENT_BYTES: u32 = 50 * 1024 * 1024;
pub const MAX_IMPORT_RPC_CHUNK_BYTES: u32 = 512 * 1024;

#[derive(Default)]
pub struct ImportDocumentInfo {
    pub source: Option<String>,
    pub warnings: Vec<crate::rpc::types::CredentialImportWarning>,
    pub(crate) legacy_ids: std::collections::BTreeMap<String, String>,
}

/// Converts the historical array of entries/groups into the current root document shape.
/// Object documents are unchanged. Invalid array structure is rejected before modifying input.
/// This grants no import authority and performs no storage access or credential validation.
pub fn normalize_json_document(document: &mut Value) -> Result<(), &'static str> {
    let Some(items) = document.as_array() else {
        return if document.is_object() {
            Ok(())
        } else {
            Err("Expected a credential root document or legacy array")
        };
    };
    for item in items {
        let Some(object) = item.as_object() else {
            return Err("Legacy credential items must be objects");
        };
        if object.contains_key("title") {
            continue; // The ordinary Core entry validator owns fields and allowed values.
        }
        if !object
            .get("name")
            .and_then(Value::as_str)
            .is_some_and(|name| !name.trim().is_empty())
        {
            return Err("Legacy credential group name is required");
        }
        let Some(entries) = object.get("entries").and_then(Value::as_array) else {
            return Err("Legacy credential group entries must be an array");
        };
        if entries.iter().any(|entry| {
            !entry
                .as_object()
                .is_some_and(|entry| entry.contains_key("title"))
        }) {
            return Err("Legacy credential groups must contain entry objects");
        }
    }

    let mut folders = Vec::new();
    let mut metadata = Vec::new();
    let mut entries = Vec::new();
    for mut item in document.as_array_mut().expect("validated array").drain(..) {
        let object = item.as_object_mut().expect("validated object");
        if object.contains_key("title") {
            entries.push(item);
            continue;
        }
        let name = object.remove("name").expect("validated group name");
        let mut group = json!({"path": name});
        for key in ["iconRef", "description"] {
            if let Some(value) = object.remove(key) {
                group[key] = value;
            }
        }
        folders.push(name.clone());
        metadata.push(group);
        let children = object
            .get_mut("entries")
            .expect("validated group entries")
            .as_array_mut()
            .expect("validated group entries");
        for mut entry in children.drain(..) {
            // The enclosing legacy group owns membership, as in Group.import in the web client.
            for key in ["folderPath", "folder_path", "groupPath", "group_path"] {
                entry[key] = name.clone();
            }
            entries.push(entry);
        }
    }
    *document = Value::Object(Map::from_iter([
        ("folders".into(), Value::Array(folders)),
        ("foldersMeta".into(), Value::Array(metadata)),
        ("entries".into(), Value::Array(entries)),
    ]));
    Ok(())
}
