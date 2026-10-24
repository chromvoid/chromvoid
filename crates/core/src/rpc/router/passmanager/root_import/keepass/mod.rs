//! KeePass is decoded by the bounded library, then joins the ordinary root import transaction.
mod fields;

use super::external::{folder_path, safe_name};
use crate::{
    credential_import::ImportDocumentInfo,
    error::ErrorCode,
    rpc::types::{CredentialImportWarning, CredentialImportWarningCode as Warning, RpcResponse},
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use keepass::{
    db::{DatabaseOpenError, GroupRef, Icon},
    Database, DatabaseKey,
};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

fn invalid() -> RpcResponse {
    RpcResponse::error(
        "The KeePass database is unsupported, damaged, or exceeds import limits",
        Some(ErrorCode::EmptyPayload),
    )
}

struct Converter<'a> {
    db: &'a Database,
    folders: BTreeSet<String>,
    metadata: Vec<Value>,
    entries: Vec<Value>,
    icons: BTreeMap<String, Value>,
    icon_cache: BTreeMap<String, Option<String>>,
    icon_bytes: usize,
    warnings: BTreeMap<Warning, u32>,
    total: usize,
    legacy_ids: BTreeMap<String, String>,
}

impl Converter<'_> {
    fn warn(&mut self, code: Warning, count: usize) {
        let value = self.warnings.entry(code).or_default();
        *value = value.saturating_add(u32::try_from(count).unwrap_or(u32::MAX));
    }

    fn icon(&mut self, icon: Option<&Icon>) -> Option<String> {
        // Built-in KeePass icons have no image payload; the web mapper also uses its ordinary icon.
        let Some(Icon::Custom(id)) = icon else {
            return None;
        };
        let key = id.to_string();
        let result = if let Some(cached) = self.icon_cache.get(&key) {
            cached.clone()
        } else {
            let asset = self
                .db
                .custom_icon(*id)
                .and_then(|icon| super::super::icon::normalize_import_image(&icon.data).ok());
            let result = asset.and_then(|asset| {
                let reference = asset["icon_ref"].as_str()?.to_owned();
                if !self.icons.contains_key(&reference) {
                    let size = asset["content_base64"].as_str()?.len() * 3 / 4;
                    if self.icon_bytes + size > 8 * 1024 * 1024 || self.icons.len() >= 10_000 {
                        return None;
                    }
                    self.icon_bytes += size;
                    self.icons.insert(reference.clone(), asset);
                }
                Some(reference)
            });
            self.icon_cache.insert(key, result.clone());
            result
        };
        if result.is_none() {
            self.warn(Warning::IconsOmitted, 1)
        }
        result
    }

    fn group(&mut self, group: GroupRef<'_>, parent: &str, root: bool) {
        let recycle = self
            .db
            .recycle_bin()
            .is_some_and(|bin| bin.id() == group.id());
        if !root
            && (recycle || group.name == "Recycle Bin" || group.enable_searching == Some(false))
        {
            let skipped = count_entries(group);
            self.total += skipped;
            if skipped > 0 {
                self.warn(Warning::RecordsOmitted, skipped)
            }
            return;
        }
        let path = if root {
            String::new()
        } else {
            let name = folder_path(&group.name.replace('/', "∕"));
            let base = if parent.is_empty() {
                name
            } else {
                format!("{parent}/{name}")
            };
            let mut path = base.clone();
            let mut suffix = 2;
            while !self.folders.insert(path.clone()) {
                path = format!("{base} ({suffix})");
                suffix += 1;
            }
            let mut metadata = json!({"path": path});
            if let Some(note) = &group.notes {
                metadata["description"] = json!(note)
            }
            if let Some(reference) = self.icon(group.icon()) {
                metadata["icon_ref"] = json!(reference)
            }
            self.metadata.push(metadata);
            path
        };
        for entry in group.entries() {
            self.total += 1;
            if self.entries.len() >= 10_000 {
                self.warn(Warning::EntryLimit, 1);
                continue;
            }
            if entry.get_title().unwrap_or_default().is_empty()
                && entry.get_password().unwrap_or_default().is_empty()
            {
                self.warn(Warning::RecordsOmitted, 1);
                continue;
            }
            let id = format!("keepass:{}:{}", self.db.root().id(), entry.id());
            self.legacy_ids
                .insert(id.clone(), STANDARD.encode(entry.id().uuid().as_bytes()));
            let title = safe_name(entry.get_title().unwrap_or("Untitled"));
            let mut output = json!({"id":id,"title":title,"folderPath":path,"entryType":"login",
                "import_source":{"format":"keepass","type":if entry.get_password().is_some_and(|value| !value.is_empty()) {"login"} else {"secure_note"},"original_id":id,"folder_path":path,"imported_at":super::super::path::now_unix_ms()}});
            for warning in fields::map(&entry, &mut output) {
                self.warn(warning, 1)
            }
            let attachments = entry.attachments().count();
            if attachments > 0 {
                self.warn(Warning::AttachmentsOmitted, attachments)
            }
            if let Some(reference) = self.icon(entry.icon()) {
                output["icon_ref"] = json!(reference)
            }
            self.entries.push(output);
        }
        for child in group.groups() {
            self.group(child, &path, false)
        }
    }
}

fn count_entries(group: GroupRef<'_>) -> usize {
    group.entries().count() + group.groups().map(count_entries).sum::<usize>()
}

pub(super) fn convert(
    bytes: &[u8],
    password: Option<&str>,
) -> Result<(Value, ImportDocumentInfo), RpcResponse> {
    let password = password.ok_or_else(|| {
        RpcResponse::error(
            "Enter the KeePass database password",
            Some(ErrorCode::CredentialImportPasswordRequired),
        )
    })?;
    let db =
        Database::parse(bytes, DatabaseKey::new().with_password(password)).map_err(|error| {
            match error {
                DatabaseOpenError::Key(_)
                | DatabaseOpenError::Cryptography(
                    keepass::error::CryptographyError::InvalidPadding(_),
                ) => RpcResponse::error(
                    "The KeePass database password could not open this file",
                    Some(ErrorCode::CredentialImportPasswordInvalid),
                ),
                _ => invalid(),
            }
        })?;
    let mut converter = Converter {
        db: &db,
        folders: BTreeSet::new(),
        metadata: Vec::new(),
        entries: Vec::new(),
        icons: BTreeMap::new(),
        icon_cache: BTreeMap::new(),
        icon_bytes: 0,
        warnings: BTreeMap::new(),
        total: 0,
        legacy_ids: BTreeMap::new(),
    };
    converter.group(db.root(), "", true);
    if converter.total > 0 && converter.entries.is_empty() {
        return Err(invalid());
    }
    Ok((
        json!({"folders":converter.folders,"folders_meta":converter.metadata,"entries":converter.entries,"icons":converter.icons.into_values().collect::<Vec<_>>()}),
        ImportDocumentInfo {
            legacy_ids: converter.legacy_ids,
            source: Some("keepass".into()),
            warnings: converter
                .warnings
                .into_iter()
                .map(|(code, count)| CredentialImportWarning { code, count })
                .collect(),
        },
    ))
}
