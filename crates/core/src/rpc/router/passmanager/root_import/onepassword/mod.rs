//! 1Password's unencrypted archive mapped to the existing reviewed root document.
mod archive;
mod fields;

use super::external::{folder_path, safe_name};
use crate::{
    credential_import::ImportDocumentInfo,
    error::ErrorCode,
    rpc::{
        helpers::clear_rpc_strings,
        types::{CredentialImportWarning, CredentialImportWarningCode as Warning, RpcResponse},
    },
};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

fn invalid(message: &'static str) -> RpcResponse {
    RpcResponse::error(message, Some(ErrorCode::EmptyPayload))
}
fn text<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}
fn array<'a>(value: &'a Value, key: &str) -> Result<&'a [Value], RpcResponse> {
    match value.get(key) {
        None | Some(Value::Null) => Ok(&[]),
        Some(Value::Array(items)) => Ok(items),
        _ => Err(invalid("Invalid 1Password export structure")),
    }
}
fn object(value: &Value) -> Result<(), RpcResponse> {
    if value.is_object() {
        Ok(())
    } else {
        Err(invalid("Invalid 1Password record"))
    }
}
fn optional_object(value: &Value, key: &str) -> Result<(), RpcResponse> {
    if let Some(value) = value.get(key).filter(|v| !v.is_null()) {
        object(value)?;
    }
    Ok(())
}
fn validate(data: &Value) -> Result<(), RpcResponse> {
    if !data.get("accounts").is_some_and(Value::is_array) {
        return Err(invalid("1Password accounts are missing"));
    }
    for account in array(data, "accounts")? {
        object(account)?;
        optional_object(account, "attrs")?;
        for vault in array(account, "vaults")? {
            object(vault)?;
            optional_object(vault, "attrs")?;
            for item in array(vault, "items")? {
                object(item)?;
                optional_object(item, "details")?;
                optional_object(item, "overview")?;
                let details = item.get("details").unwrap_or(&Value::Null);
                optional_object(details, "documentAttributes")?;
                for field in array(details, "loginFields")? {
                    object(field)?;
                }
                for section in array(details, "sections")? {
                    object(section)?;
                    for field in array(section, "fields")? {
                        object(field)?;
                    }
                }
                array(details, "passwordHistory")?;
                let overview = item.get("overview").unwrap_or(&Value::Null);
                for url in array(overview, "urls")? {
                    object(url)?;
                }
                if array(overview, "tags")?.iter().any(|tag| !tag.is_string()) {
                    return Err(invalid("Invalid 1Password tags"));
                }
            }
        }
    }
    Ok(())
}
fn source_id(account: &Value, vault: &Value, item: &Value) -> Option<String> {
    let ids = [
        text(&account["attrs"], "uuid")?,
        text(&vault["attrs"], "uuid")?,
        text(item, "uuid")?,
    ];
    if ids.iter().any(|id| id.is_empty()) {
        return None;
    }
    Some(format!(
        "1password:{}",
        crate::crypto::sha256_hex(&serde_json::to_vec(&ids).expect("string tuple"))
    ))
}
fn refs<'a>(value: &'a Value, output: &mut Vec<&'a str>) {
    match value {
        Value::String(value) if !value.is_empty() => output.push(value),
        Value::Array(values) => {
            for value in values {
                refs(value, output)
            }
        }
        Value::Object(values) => {
            for key in [
                "documentId",
                "fileName",
                "name",
                "path",
                "avatar",
                "url",
                "value",
            ] {
                if let Some(value) = values.get(key) {
                    refs(value, output)
                }
            }
        }
        _ => {}
    }
}
struct Icons<'a> {
    archive: &'a archive::Archive<'a>,
    files: BTreeMap<String, Value>,
    cache: BTreeMap<String, Option<String>>,
    bytes: usize,
}
impl Icons<'_> {
    fn resolve(&mut self, value: &Value) -> Option<String> {
        let mut references = Vec::new();
        refs(value, &mut references);
        for reference in references {
            let Some(name) = self.archive.icon_name(reference) else {
                continue;
            };
            if let Some(cached) = self.cache.get(name) {
                if cached.is_some() {
                    return cached.clone();
                }
                continue;
            }
            let normalized = self
                .archive
                .read(name, 1024 * 1024)
                .ok()
                .and_then(|bytes| super::super::icon::normalize_import_image(&bytes).ok());
            let result = normalized.and_then(|asset| {
                let id = asset["icon_ref"]
                    .as_str()
                    .expect("normalized icon")
                    .to_owned();
                if !self.files.contains_key(&id) {
                    let size = asset["content_base64"]
                        .as_str()
                        .expect("normalized bytes")
                        .len()
                        * 3
                        / 4;
                    if self.bytes + size > 8 * 1024 * 1024 || self.files.len() >= 10_000 {
                        return None;
                    }
                    self.bytes += size;
                    self.files.insert(id.clone(), asset);
                }
                Some(id)
            });
            self.cache.insert(name.to_owned(), result.clone());
            if result.is_some() {
                return result;
            }
        }
        None
    }
}
fn warn(warnings: &mut BTreeMap<Warning, u32>, code: Warning) {
    let count = warnings.entry(code).or_default();
    *count = count.saturating_add(1);
}
fn icon(
    value: &Value,
    icons: &mut Icons<'_>,
    warnings: &mut BTreeMap<Warning, u32>,
) -> Option<String> {
    let mut references = Vec::new();
    refs(value, &mut references);
    if references.is_empty() {
        return None;
    }
    let result = icons.resolve(value);
    if result.is_none() {
        warn(warnings, Warning::IconsOmitted);
    }
    result
}
pub(super) fn convert(bytes: &[u8]) -> Result<(Value, ImportDocumentInfo), RpcResponse> {
    let archive = archive::Archive::open(bytes)?;
    let attributes = archive.read("export.attributes", 64 * 1024)?;
    let attributes: Value =
        serde_json::from_slice(&attributes).map_err(|_| invalid("Invalid 1PUX attributes"))?;
    if attributes["version"].as_u64() != Some(3) {
        return Err(invalid("Unsupported 1PUX version"));
    }
    let bytes = archive.read("export.data", 16 * 1024 * 1024)?;
    let mut data: Value =
        serde_json::from_slice(&bytes).map_err(|_| invalid("Invalid 1PUX export data"))?;
    drop(bytes);
    let result = convert_document(&data, &archive);
    clear_rpc_strings(&mut data);
    result
}
fn convert_document<'a>(
    data: &Value,
    archive: &'a archive::Archive<'a>,
) -> Result<(Value, ImportDocumentInfo), RpcResponse> {
    validate(data)?;
    let mut ids = BTreeSet::new();
    for account in array(data, "accounts")? {
        for vault in array(account, "vaults")? {
            for item in array(vault, "items")? {
                if let Some(id) = source_id(account, vault, item) {
                    if !ids.insert(id) {
                        return Err(invalid("Duplicate 1Password record identifiers"));
                    }
                }
            }
        }
    }
    let mut icons = Icons {
        archive,
        files: BTreeMap::new(),
        cache: BTreeMap::new(),
        bytes: 0,
    };
    let mut folders = BTreeSet::new();
    let mut folders_meta = Vec::new();
    let mut entries = Vec::new();
    let mut warnings = BTreeMap::new();
    let mut total = 0;
    let mut legacy_ids = BTreeMap::new();
    for account in array(data, "accounts")? {
        for vault in array(account, "vaults")? {
            let name = folder_path(
                text(&vault["attrs"], "name")
                    .filter(|v| !v.trim().is_empty())
                    .unwrap_or("Imported vault"),
            );
            let mut folder = name.clone();
            let mut suffix = 2;
            while !folders.insert(folder.clone()) {
                folder = format!("{name} ({suffix})");
                suffix += 1;
            }
            let mut metadata = json!({"path":folder});
            if let Some(description) = text(&vault["attrs"], "desc") {
                metadata["description"] = json!(description);
            }
            if let Some(reference) = icon(&vault["attrs"]["avatar"], &mut icons, &mut warnings) {
                metadata["icon_ref"] = json!(reference);
            }
            folders_meta.push(metadata);
            for item in array(vault, "items")? {
                total += 1;
                if entries.len() >= 10_000 {
                    warn(&mut warnings, Warning::EntryLimit);
                    continue;
                }
                if text(item, "categoryUuid") == Some("006") {
                    warn(&mut warnings, Warning::AttachmentsOmitted);
                    continue;
                }
                if item["details"]
                    .get("documentAttributes")
                    .is_some_and(|v| v.is_object())
                {
                    warn(&mut warnings, Warning::AttachmentsOmitted);
                }
                let title = safe_name(text(&item["overview"], "title").unwrap_or("Untitled"));
                let mut output = json!({"title":title,"folderPath":folder,"entryType":"login",
                "import_source":{"type":"login","format":"1password","imported_at":super::super::path::now_unix_ms(),"folder_path":folder}});
                if let Some(id) = source_id(account, vault, item) {
                    legacy_ids.insert(
                        id.clone(),
                        text(item, "uuid")
                            .expect("source ID contains item UUID")
                            .to_owned(),
                    );
                    output["id"] = json!(id);
                    output["import_source"]["original_id"] = json!(id);
                }
                for (source, target) in [("createdAt", "createdAt"), ("updatedAt", "updatedAt")] {
                    if let Some(time) = item[source].as_u64() {
                        output[target] = json!(time.saturating_mul(1000));
                    }
                }
                for warning in fields::map(item, &mut output)? {
                    warn(&mut warnings, warning);
                }
                if !matches!(text(item, "categoryUuid"), Some("001" | "005")) {
                    output["import_source"]["type"] = json!("secure_note");
                }
                if let Some(reference) = icon(&item["overview"]["icons"], &mut icons, &mut warnings)
                {
                    output["icon_ref"] = json!(reference);
                }
                entries.push(output);
            }
        }
    }
    if total > 0 && entries.is_empty() {
        return Err(invalid(
            "This 1Password export has no supported credential records",
        ));
    }
    Ok((
        json!({"entries":entries,"folders":folders,"folders_meta":folders_meta,"icons":icons.files.into_values().collect::<Vec<_>>()}),
        ImportDocumentInfo {
            legacy_ids,
            source: Some("1password".into()),
            warnings: warnings
                .into_iter()
                .map(|(code, count)| CredentialImportWarning { code, count })
                .collect(),
        },
    ))
}
