//! PassManager domain commands (ADR-028): scoped access to /.passmanager only.

mod entry;
mod group;
mod icon;
mod otp;
mod path;
mod secret;

use super::super::commands::{handle_catalog_delete, with_system_shard_guard_bypass};
use super::super::types::RpcResponse;
use super::state::RpcRouter;
use crate::error::ErrorCode;
use std::collections::BTreeMap;

impl RpcRouter {
    // ── Entry handlers ──────────────────────────────────────────────────────

    pub(super) fn handle_passmanager_entry_save(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session_mut(|s| entry::handle_save(s, &storage, data))
    }

    pub(super) fn handle_passmanager_entry_read(&self, data: &serde_json::Value) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session(|s| entry::handle_read(s, &storage, data))
    }

    pub(super) fn handle_passmanager_entry_delete(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session_mut(|s| entry::handle_delete(s, &storage, data))
    }

    pub(super) fn handle_passmanager_entry_move(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session_mut(|s| entry::handle_move(s, &storage, data))
    }

    pub(super) fn handle_passmanager_entry_rename(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session_mut(|s| entry::handle_rename(s, &storage, data))
    }

    pub(super) fn handle_passmanager_entry_list(&self, data: &serde_json::Value) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session(|s| entry::handle_list(s, &storage, data))
    }

    // ── Secret handlers ─────────────────────────────────────────────────────

    pub(super) fn handle_passmanager_secret_save(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session_mut(|s| secret::handle_save(s, &storage, data))
    }

    pub(super) fn handle_passmanager_secret_read(&self, data: &serde_json::Value) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session(|s| secret::handle_read(s, &storage, data))
    }

    pub(super) fn handle_passmanager_secret_delete(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session_mut(|s| secret::handle_delete(s, &storage, data))
    }

    // ── Group handlers ──────────────────────────────────────────────────────

    pub(super) fn handle_passmanager_group_ensure(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        self.with_session_mut(|s| group::handle_ensure(s, data))
    }

    pub(super) fn handle_passmanager_group_list(&self, data: &serde_json::Value) -> RpcResponse {
        self.with_session(|s| group::handle_list(s, data))
    }

    pub(super) fn handle_passmanager_group_set_meta(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session_mut(|s| group::handle_set_meta(s, &storage, data))
    }

    // ── Icon handlers ────────────────────────────────────────────────────────

    pub(super) fn handle_passmanager_icon_put(&mut self, data: &serde_json::Value) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session_mut(|s| icon::handle_put(s, &storage, data))
    }

    pub(super) fn handle_passmanager_icon_get(&self, data: &serde_json::Value) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session(|s| icon::handle_get(s, &storage, data))
    }

    pub(super) fn handle_passmanager_icon_list(&self, data: &serde_json::Value) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session(|s| icon::handle_list(s, &storage, data))
    }

    pub(super) fn handle_passmanager_icon_gc(&mut self, data: &serde_json::Value) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session_mut(|s| icon::handle_gc(s, &storage, data))
    }

    // ── OTP handlers ─────────────────────────────────────────────────────────

    pub(super) fn handle_passmanager_otp_set_secret(
        &self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session(|s| otp::handle_set_secret(s, &storage, data))
    }

    pub(super) fn handle_passmanager_otp_generate(&self, data: &serde_json::Value) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session(|s| otp::handle_generate(s, &storage, data))
    }

    pub(super) fn handle_passmanager_otp_remove_secret(
        &self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session(|s| otp::handle_remove_secret(s, &storage, data))
    }

    // ── Root import / export ──────────────────────────────────────────────────

    pub(super) fn handle_passmanager_root_import(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        let storage = self.storage.clone();
        let import_mode = data.get("mode").and_then(|v| v.as_str()).unwrap_or("merge");
        if !matches!(import_mode, "merge" | "replace" | "restore") {
            return RpcResponse::error(
                "mode must be one of: merge, replace, restore",
                Some(ErrorCode::EmptyPayload),
            );
        }
        let allow_destructive = data
            .get("allow_destructive")
            .or_else(|| data.get("allowDestructive"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let requires_destructive = matches!(import_mode, "replace" | "restore");
        if requires_destructive && !allow_destructive {
            return RpcResponse::error(
                "destructive root import requires allow_destructive=true",
                Some(ErrorCode::AccessDenied),
            );
        }
        let should_clear_existing = requires_destructive && allow_destructive;
        let folders = match data.get("folders").and_then(|v| v.as_array()) {
            Some(v) => v,
            None => {
                return RpcResponse::error("folders is required", Some(ErrorCode::EmptyPayload))
            }
        };
        let entries = match data.get("entries").and_then(|v| v.as_array()) {
            Some(v) => v,
            None => {
                return RpcResponse::error("entries is required", Some(ErrorCode::EmptyPayload))
            }
        };
        let folders_meta = data
            .get("folders_meta")
            .or_else(|| data.get("foldersMeta"))
            .cloned()
            .unwrap_or_else(|| serde_json::Value::Array(Vec::new()));
        let folders_meta_items = match folders_meta.as_array() {
            Some(v) => v,
            None => {
                return RpcResponse::error(
                    "folders_meta must be object[]",
                    Some(ErrorCode::EmptyPayload),
                )
            }
        };

        let mut imported_group_meta = BTreeMap::<String, String>::new();
        for item in folders_meta_items {
            let Some(item_obj) = item.as_object() else {
                return RpcResponse::error(
                    "folders_meta must be object[]",
                    Some(ErrorCode::EmptyPayload),
                );
            };

            let Some(path_raw) = item_obj.get("path").and_then(|v| v.as_str()) else {
                return RpcResponse::error(
                    "folders_meta.path is required",
                    Some(ErrorCode::EmptyPayload),
                );
            };
            let Some(path) = group::normalize_group_meta_path(path_raw) else {
                return RpcResponse::error(
                    "folders_meta.path is invalid",
                    Some(ErrorCode::InvalidPath),
                );
            };

            let icon_ref_value = item_obj.get("icon_ref").or_else(|| item_obj.get("iconRef"));
            let Some(icon_ref_value) = icon_ref_value else {
                continue;
            };
            if icon_ref_value.is_null() {
                continue;
            }

            let Some(icon_ref) = icon_ref_value
                .as_str()
                .map(str::trim)
                .filter(|v| !v.is_empty())
            else {
                return RpcResponse::error(
                    "folders_meta.icon_ref must be string or null",
                    Some(ErrorCode::EmptyPayload),
                );
            };
            if !icon::is_valid_icon_ref(icon_ref) {
                return RpcResponse::error(
                    "folders_meta.icon_ref has invalid format",
                    Some(ErrorCode::EmptyPayload),
                );
            }

            imported_group_meta.insert(path, icon_ref.to_string());
        }

        for folder in folders {
            let Some(folder_path) = folder.as_str() else {
                return RpcResponse::error(
                    "folders must be string[]",
                    Some(ErrorCode::EmptyPayload),
                );
            };
            let Some(pm_path) = path::map_entry_group_path_to_passmanager_path(Some(folder_path))
            else {
                return RpcResponse::error("Access denied", Some(ErrorCode::AccessDenied));
            };
            if !path::validate_passmanager_group_path(&pm_path) {
                return RpcResponse::error(
                    "folder path contains invalid segment",
                    Some(ErrorCode::EmptyPayload),
                );
            }
        }

        for entry in entries {
            let Some(entry_obj) = entry.as_object() else {
                return RpcResponse::error(
                    "entries must be object[]",
                    Some(ErrorCode::EmptyPayload),
                );
            };
            let title = match entry_obj.get("title").and_then(|v| v.as_str()) {
                Some(v) if !v.trim().is_empty() => v.trim(),
                _ => {
                    return RpcResponse::error(
                        "entry title is required",
                        Some(ErrorCode::EmptyPayload),
                    )
                }
            };
            if !path::is_valid_catalog_name(title) {
                return RpcResponse::error(
                    "entry title contains invalid characters",
                    Some(ErrorCode::EmptyPayload),
                );
            }

            let folder_path = match entry_obj
                .get("folderPath")
                .or_else(|| entry_obj.get("groupPath"))
            {
                Some(v) if v.is_null() => "/",
                Some(v) => match v.as_str() {
                    Some(p) => p,
                    None => {
                        return RpcResponse::error(
                            "entry folderPath must be string",
                            Some(ErrorCode::EmptyPayload),
                        )
                    }
                },
                None => "/",
            };
            let Some(pm_folder_path) =
                path::map_entry_group_path_to_passmanager_path(Some(folder_path))
            else {
                return RpcResponse::error("Access denied", Some(ErrorCode::AccessDenied));
            };
            if !path::validate_passmanager_group_path(&pm_folder_path) {
                return RpcResponse::error(
                    "entry folderPath contains invalid segment",
                    Some(ErrorCode::EmptyPayload),
                );
            }
        }

        if should_clear_existing {
            let cleared = self.with_session_mut(|s| {
                if let Err(resp) = path::ensure_passmanager_root_exists(s) {
                    return resp;
                }

                let child_ids: Vec<u64> = s
                    .catalog()
                    .find_by_path("/.passmanager")
                    .map(|root| root.children().iter().map(|child| child.node_id).collect())
                    .unwrap_or_default();

                for node_id in child_ids {
                    let deleted = with_system_shard_guard_bypass(|| {
                        handle_catalog_delete(s, &serde_json::json!({"node_id": node_id}), &storage)
                    });
                    if !deleted.is_ok() {
                        return deleted;
                    }
                }

                RpcResponse::success(serde_json::Value::Null)
            });
            if !cleared.is_ok() {
                return cleared;
            }
        }

        for folder in folders {
            let Some(folder_path) = folder.as_str() else {
                return RpcResponse::error(
                    "folders must be string[]",
                    Some(ErrorCode::EmptyPayload),
                );
            };
            let ensured =
                self.handle_passmanager_group_ensure(&serde_json::json!({"path": folder_path}));
            if !ensured.is_ok() {
                return ensured;
            }
        }

        for entry in entries {
            let Some(entry_obj) = entry.as_object() else {
                return RpcResponse::error(
                    "entries must be object[]",
                    Some(ErrorCode::EmptyPayload),
                );
            };

            let title = match entry_obj.get("title").and_then(|v| v.as_str()) {
                Some(v) if !v.trim().is_empty() => v.trim(),
                _ => {
                    return RpcResponse::error(
                        "entry title is required",
                        Some(ErrorCode::EmptyPayload),
                    )
                }
            };

            let folder_path = match entry_obj
                .get("folderPath")
                .or_else(|| entry_obj.get("groupPath"))
            {
                Some(v) if v.is_null() => "/",
                Some(v) => match v.as_str() {
                    Some(p) => p,
                    None => {
                        return RpcResponse::error(
                            "entry folderPath must be string",
                            Some(ErrorCode::EmptyPayload),
                        )
                    }
                },
                None => "/",
            };

            let ensure_resp =
                self.handle_passmanager_group_ensure(&serde_json::json!({"path": folder_path}));
            if !ensure_resp.is_ok() {
                return ensure_resp;
            }

            let mut payload = serde_json::Map::new();
            payload.insert(
                "title".to_string(),
                serde_json::Value::String(title.to_string()),
            );
            payload.insert(
                "groupPath".to_string(),
                serde_json::Value::String(folder_path.to_string()),
            );
            if let Some(id) = entry_obj
                .get("id")
                .and_then(|v| v.as_str())
                .or_else(|| entry_obj.get("entry_id").and_then(|v| v.as_str()))
            {
                payload.insert("id".to_string(), serde_json::Value::String(id.to_string()));
            }
            if let Some(username) = entry_obj.get("username") {
                payload.insert("username".to_string(), username.clone());
            }
            if let Some(urls) = entry_obj.get("urls") {
                payload.insert("urls".to_string(), urls.clone());
            }
            if let Some(otps) = entry_obj.get("otps") {
                payload.insert("otps".to_string(), otps.clone());
            }
            if let Some(icon_ref) = entry_obj
                .get("iconRef")
                .and_then(|v| v.as_str())
                .or_else(|| entry_obj.get("icon_ref").and_then(|v| v.as_str()))
            {
                payload.insert(
                    "iconRef".to_string(),
                    serde_json::Value::String(icon_ref.to_string()),
                );
            }

            let save_resp = self.handle_passmanager_entry_save(&serde_json::Value::Object(payload));
            if !save_resp.is_ok() {
                return save_resp;
            }
        }

        let group_meta_saved = self.with_session_mut(|s| {
            if let Err(resp) = path::ensure_passmanager_root_exists(s) {
                return resp;
            }
            group::save_group_meta_map(s, &storage, &imported_group_meta)
        });
        if !group_meta_saved.is_ok() {
            return group_meta_saved;
        }

        RpcResponse::success(serde_json::Value::Null)
    }

    pub(super) fn handle_passmanager_root_export(&self, _data: &serde_json::Value) -> RpcResponse {
        let storage = self.storage.clone();
        let listed_entries = self.handle_passmanager_entry_list(&serde_json::json!({}));
        if !listed_entries.is_ok() {
            return listed_entries;
        }

        let listed_groups = self.handle_passmanager_group_list(&serde_json::json!({}));
        if !listed_groups.is_ok() {
            return listed_groups;
        }

        let mut exported_entries = Vec::<serde_json::Value>::new();
        if let Some(entries) = listed_entries
            .result()
            .and_then(|r| r.get("entries"))
            .and_then(|v| v.as_array())
        {
            for entry in entries {
                let mut out = entry.clone();
                if let Some(obj) = out.as_object_mut() {
                    let folder_path = obj
                        .get("folderPath")
                        .and_then(|v| v.as_str())
                        .or_else(|| obj.get("groupPath").and_then(|v| v.as_str()));
                    match folder_path {
                        Some("/") | None => {
                            obj.insert("folderPath".to_string(), serde_json::Value::Null);
                        }
                        Some(p) => {
                            obj.insert(
                                "folderPath".to_string(),
                                serde_json::Value::String(p.to_string()),
                            );
                        }
                    }
                    obj.remove("groupPath");
                }
                exported_entries.push(out);
            }
        }

        let mut folders = listed_groups
            .result()
            .and_then(|r| r.get("groups"))
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter(|v| v.as_str().map(|s| !s.is_empty()).unwrap_or(false))
            .filter(|v| v.as_str() != Some("/"))
            .collect::<Vec<serde_json::Value>>();
        folders.sort_by(|a, b| a.as_str().cmp(&b.as_str()));
        folders.dedup();

        let group_meta_resp =
            self.with_session(|s| match group::load_group_meta_map(s, &storage) {
                Ok(map) => RpcResponse::success(serde_json::json!({"groups_meta": map})),
                Err(resp) => resp,
            });
        if !group_meta_resp.is_ok() {
            return group_meta_resp;
        }

        let mut folders_meta = group_meta_resp
            .result()
            .and_then(|r| r.get("groups_meta"))
            .and_then(|v| v.as_object())
            .map(|obj| {
                obj.iter()
                    .filter_map(|(p, icon_ref)| {
                        icon_ref
                            .as_str()
                            .map(|ir| serde_json::json!({"path": p, "iconRef": ir}))
                    })
                    .collect::<Vec<serde_json::Value>>()
            })
            .unwrap_or_default();
        folders_meta.sort_by(|a, b| {
            a.get("path")
                .and_then(|v| v.as_str())
                .cmp(&b.get("path").and_then(|v| v.as_str()))
        });

        let now = path::now_unix_ms();
        RpcResponse::success(serde_json::json!({
            "root": {
                "version": 2,
                "createdTs": now,
                "updatedTs": now,
                "folders": folders,
                "foldersMeta": folders_meta,
                "entries": exported_entries,
            }
        }))
    }
}
