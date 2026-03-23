//! OTP (One-Time Password) command handlers

use serde::Deserialize;
use serde_json::Value;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::{Mutex, OnceLock};

use base64::{engine::general_purpose, Engine as _};

use crate::error::ErrorCode;
use crate::vault::VaultSession;

use super::super::types::{OtpGenerateResponse, OtpSecret, OtpSecrets, RpcResponse};
use super::guards::{is_system_node, system_shard_denied};

fn load_otp_secrets(
    vault_key: &[u8; 32],
    node_id: u64,
    storage: &crate::storage::Storage,
) -> Option<OtpSecrets> {
    let chunk_name = crate::crypto::otp_chunk_name(vault_key, node_id);
    let encrypted = storage.read_chunk(&chunk_name).ok()?;
    let decrypted = crate::crypto::decrypt(&encrypted, vault_key, chunk_name.as_bytes()).ok()?;
    serde_json::from_slice(&decrypted).ok()
}

fn save_otp_secrets(
    vault_key: &[u8; 32],
    node_id: u64,
    secrets: &OtpSecrets,
    storage: &crate::storage::Storage,
) -> Result<(), String> {
    let chunk_name = crate::crypto::otp_chunk_name(vault_key, node_id);
    let data = serde_json::to_vec(secrets).map_err(|e| e.to_string())?;
    let encrypted = crate::crypto::encrypt(&data, vault_key, chunk_name.as_bytes())
        .map_err(|e| e.to_string())?;
    storage
        .write_chunk(&chunk_name, &encrypted)
        .map_err(|e| e.to_string())
}

#[derive(Debug, Default, Deserialize)]
struct PassmanagerOtpMeta {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    label: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct PassmanagerEntryMeta {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    otps: Vec<PassmanagerOtpMeta>,
}

#[derive(Clone)]
struct CachedOtpMeta {
    id: Option<String>,
    preferred_label: Option<String>,
}

#[derive(Clone)]
struct CachedEntryMeta {
    node_id: u64,
    entry_id: Option<String>,
    otps: Vec<CachedOtpMeta>,
}

#[derive(Clone, PartialEq, Eq)]
struct PassmanagerMetaStamp {
    entry_node_id: u64,
    meta_node_id: u64,
    meta_modtime: u64,
    meta_size: u64,
}

#[derive(Default)]
struct OtpTargetCache {
    storage_ptr: usize,
    vault_fingerprint: u64,
    stamp: Vec<PassmanagerMetaStamp>,
    entries: Vec<CachedEntryMeta>,
    ready: bool,
}

static OTP_TARGET_CACHE: OnceLock<Mutex<OtpTargetCache>> = OnceLock::new();

fn normalize_non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string)
}

fn vault_fingerprint(vault_key: &[u8; 32]) -> u64 {
    let mut hasher = DefaultHasher::new();
    vault_key.hash(&mut hasher);
    hasher.finish()
}

fn collect_passmanager_meta_stamp(
    node: &crate::catalog::CatalogNode,
    out: &mut Vec<PassmanagerMetaStamp>,
) {
    for child in node.children() {
        if !child.is_dir() {
            continue;
        }

        if let Some(meta_node) = child.find_child("meta.json").filter(|n| n.is_file()) {
            out.push(PassmanagerMetaStamp {
                entry_node_id: child.node_id,
                meta_node_id: meta_node.node_id,
                meta_modtime: meta_node.modtime,
                meta_size: meta_node.size,
            });
            continue;
        }

        collect_passmanager_meta_stamp(child, out);
    }
}

fn read_catalog_file_plain(
    vault_key: &[u8; 32],
    node_id: u64,
    storage: &crate::storage::Storage,
) -> Result<Vec<u8>, String> {
    let node_id32 = u32::try_from(node_id).map_err(|_| "invalid node_id".to_string())?;
    let mut out = Vec::<u8>::new();
    let mut had_any_chunk = false;

    for index in 0u32.. {
        let chunk_name = crate::crypto::blob_chunk_name(vault_key, node_id32, index);
        let encrypted = match storage.read_chunk(&chunk_name) {
            Ok(bytes) => bytes,
            Err(crate::error::Error::ChunkNotFound(_)) => {
                if !had_any_chunk {
                    return Err("chunk not found".to_string());
                }
                break;
            }
            Err(e) => return Err(e.to_string()),
        };

        had_any_chunk = true;
        let plain = crate::crypto::decrypt(&encrypted, vault_key, chunk_name.as_bytes())
            .map_err(|e| e.to_string())?;
        out.extend_from_slice(&plain);
    }

    Ok(out)
}

pub(crate) fn resolve_passmanager_otp_target(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    otp_id: Option<&str>,
    entry_id: Option<&str>,
    fallback_label: Option<&str>,
    force_refresh: bool,
) -> Result<Option<(u64, String)>, String> {
    fn walk_collect(
        node: &crate::catalog::CatalogNode,
        vault_key: &[u8; 32],
        storage: &crate::storage::Storage,
        entries: &mut Vec<CachedEntryMeta>,
    ) -> Result<(), String> {
        for child in node.children() {
            if !child.is_dir() {
                continue;
            }

            if let Some(meta_node) = child.find_child("meta.json").filter(|n| n.is_file()) {
                let plain = match read_catalog_file_plain(vault_key, meta_node.node_id, storage) {
                    Ok(bytes) => bytes,
                    Err(_) => continue,
                };
                let meta: PassmanagerEntryMeta = match serde_json::from_slice(&plain) {
                    Ok(v) => v,
                    Err(_) => continue,
                };

                let cached_otps = meta
                    .otps
                    .iter()
                    .map(|otp| CachedOtpMeta {
                        id: otp.id.clone(),
                        preferred_label: normalize_non_empty(otp.label.as_deref())
                            .or_else(|| normalize_non_empty(otp.id.as_deref())),
                    })
                    .collect();

                entries.push(CachedEntryMeta {
                    node_id: child.node_id,
                    entry_id: normalize_non_empty(meta.id.as_deref()),
                    otps: cached_otps,
                });
                continue;
            }

            walk_collect(child, vault_key, storage, entries)?;
        }

        Ok(())
    }

    fn resolve_from_entries(
        entries: &[CachedEntryMeta],
        otp_id: Option<&str>,
        entry_id: Option<&str>,
        fallback_label: Option<&str>,
    ) -> Option<(u64, String)> {
        let fallback_label = normalize_non_empty(fallback_label);

        for entry in entries {
            let entry_match = entry_id
                .map(|id| entry.entry_id.as_deref() == Some(id))
                .unwrap_or(false);
            if entry_id.is_some() && !entry_match {
                continue;
            }

            if let Some(otp_id) = otp_id {
                if let Some(found) = entry
                    .otps
                    .iter()
                    .find(|otp| otp.id.as_deref() == Some(otp_id))
                {
                    let label = found
                        .preferred_label
                        .clone()
                        .or_else(|| fallback_label.clone())
                        .unwrap_or_else(|| otp_id.to_string());
                    return Some((entry.node_id, label));
                }
                // otp_id was not found in entry.otps (meta.json was re-saved without the
                // OTP list, or the OTP was never recorded in meta). When entry_id uniquely
                // identifies this entry, fall back to otp_id as the label so that the
                // caller can still attempt to generate / set the secret.
                if entry_match {
                    return Some((
                        entry.node_id,
                        fallback_label.clone().unwrap_or_else(|| otp_id.to_string()),
                    ));
                }
            }
            if entry_match {
                if let Some(label) = fallback_label.clone() {
                    return Some((entry.node_id, label));
                }
                if entry.otps.len() == 1 {
                    if let Some(label) = entry.otps[0].preferred_label.clone() {
                        return Some((entry.node_id, label));
                    }
                }
            }
        }

        None
    }

    let Some(pm_root) = session.catalog().find_by_path("/.passmanager") else {
        return Ok(None);
    };

    let vault_key = session.vault_key();
    let storage_ptr = storage as *const crate::storage::Storage as usize;
    let cache_key = vault_fingerprint(vault_key);
    let mut stamp = Vec::new();
    collect_passmanager_meta_stamp(pm_root, &mut stamp);
    let cache = OTP_TARGET_CACHE.get_or_init(|| Mutex::new(OtpTargetCache::default()));

    let entries = match cache.lock() {
        Ok(mut guard) => {
            if force_refresh
                || !(guard.ready
                    && guard.storage_ptr == storage_ptr
                    && guard.vault_fingerprint == cache_key
                    && guard.stamp == stamp)
            {
                let mut rebuilt = Vec::new();
                walk_collect(pm_root, vault_key, storage, &mut rebuilt)?;
                guard.storage_ptr = storage_ptr;
                guard.vault_fingerprint = cache_key;
                guard.stamp = stamp;
                guard.entries = rebuilt;
                guard.ready = true;
            }
            guard.entries.clone()
        }
        Err(_) => {
            let mut rebuilt = Vec::new();
            walk_collect(pm_root, vault_key, storage, &mut rebuilt)?;
            rebuilt
        }
    };

    Ok(resolve_from_entries(
        &entries,
        otp_id,
        entry_id,
        fallback_label,
    ))
}

fn build_passmanager_generate_payload(
    data: &Value,
    node_id: u64,
    label: String,
) -> serde_json::Map<String, Value> {
    let mut payload = serde_json::Map::<String, Value>::new();
    payload.insert(
        "node_id".to_string(),
        Value::Number(serde_json::Number::from(node_id)),
    );
    payload.insert("label".to_string(), Value::String(label));
    if let Some(ts) = data.get("ts") {
        payload.insert("ts".to_string(), ts.clone());
    }
    if let Some(ha) = data.get("ha") {
        payload.insert("ha".to_string(), ha.clone());
    }
    if let Some(period) = data.get("period") {
        payload.insert("period".to_string(), period.clone());
    }
    if let Some(digits) = data.get("digits") {
        payload.insert("digits".to_string(), digits.clone());
    }
    payload
}

pub(crate) fn handle_catalog_otp_set_secret(
    session: &VaultSession,
    data: &Value,
    storage: &crate::storage::Storage,
) -> RpcResponse {
    let node_id = match data.get("node_id").and_then(|v| v.as_u64()) {
        Some(id) => id,
        None => return RpcResponse::error("node_id is required", Some(ErrorCode::EmptyPayload)),
    };

    if is_system_node(session, node_id) {
        return system_shard_denied();
    }

    let label = match data.get("label").and_then(|v| v.as_str()) {
        Some(l) => l.to_string(),
        None => return RpcResponse::error("label is required", Some(ErrorCode::EmptyPayload)),
    };

    let secret = match data.get("secret").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return RpcResponse::error("secret is required", Some(ErrorCode::EmptyPayload)),
    };

    let algorithm = data
        .get("algorithm")
        .and_then(|v| v.as_str())
        .unwrap_or("SHA1")
        .to_uppercase();
    let digits = data.get("digits").and_then(|v| v.as_u64()).unwrap_or(6) as u8;
    let period = data.get("period").and_then(|v| v.as_u64()).unwrap_or(30) as u32;

    if session.catalog().find_by_id(node_id).is_none() {
        return RpcResponse::error("Node not found", Some(ErrorCode::NodeNotFound));
    }

    if !["SHA1", "SHA256", "SHA512"].contains(&algorithm.as_str()) {
        return RpcResponse::error("Invalid algorithm", Some(ErrorCode::OtpSettingsInvalid));
    }

    if digits != 6 && digits != 8 {
        return RpcResponse::error("digits must be 6 or 8", Some(ErrorCode::OtpSettingsInvalid));
    }

    let vault_key = session.vault_key();

    let mut secrets = load_otp_secrets(vault_key, node_id, storage).unwrap_or_default();

    secrets.secrets.retain(|s| s.label != label);

    secrets.secrets.push(OtpSecret {
        label,
        secret,
        algorithm,
        digits,
        period,
    });

    if let Err(e) = save_otp_secrets(vault_key, node_id, &secrets, storage) {
        return RpcResponse::error(
            format!("Failed to save OTP secret: {}", e),
            Some(ErrorCode::InternalError),
        );
    }

    RpcResponse::success(Value::Null)
}

pub(crate) fn handle_catalog_otp_generate(
    session: &VaultSession,
    data: &Value,
    storage: &crate::storage::Storage,
) -> RpcResponse {
    let node_id = match data.get("node_id").and_then(|v| v.as_u64()) {
        Some(id) => id,
        None => return RpcResponse::error("node_id is required", Some(ErrorCode::EmptyPayload)),
    };

    if is_system_node(session, node_id) {
        return system_shard_denied();
    }

    catalog_otp_generate_core(session, data, storage)
}

/// Core OTP generation logic without system shard guard.
/// Used internally by credential provider which is an authorized in-process consumer.
pub(crate) fn catalog_otp_generate_core(
    session: &VaultSession,
    data: &Value,
    storage: &crate::storage::Storage,
) -> RpcResponse {
    use totp_rs::{Algorithm, Secret, TOTP};

    let node_id = match data.get("node_id").and_then(|v| v.as_u64()) {
        Some(id) => id,
        None => return RpcResponse::error("node_id is required", Some(ErrorCode::EmptyPayload)),
    };

    let label = data.get("label").and_then(|v| v.as_str());
    let ts = data.get("ts").and_then(|v| v.as_u64());

    if session.catalog().find_by_id(node_id).is_none() {
        return RpcResponse::error("Node not found", Some(ErrorCode::NodeNotFound));
    }

    let vault_key = session.vault_key();

    let otp_chunk_name = crate::crypto::otp_chunk_name(vault_key, node_id);
    let encrypted = match storage.read_chunk(&otp_chunk_name) {
        Ok(b) => b,
        Err(crate::error::Error::ChunkNotFound(_)) => {
            return RpcResponse::error("OTP secret not found", Some(ErrorCode::OtpSecretNotFound))
        }
        Err(e) => {
            return RpcResponse::error(
                format!("Failed to read OTP secrets: {}", e),
                Some(ErrorCode::OtpGenerateFailed),
            )
        }
    };

    let decrypted = match crate::crypto::decrypt(&encrypted, vault_key, otp_chunk_name.as_bytes()) {
        Ok(p) => p,
        Err(e) => {
            return RpcResponse::error(
                format!("Failed to decrypt OTP secrets: {}", e),
                Some(ErrorCode::OtpGenerateFailed),
            )
        }
    };

    let secrets: OtpSecrets = match serde_json::from_slice(&decrypted) {
        Ok(s) => s,
        Err(e) => {
            return RpcResponse::error(
                format!("Failed to parse OTP secrets: {}", e),
                Some(ErrorCode::OtpGenerateFailed),
            )
        }
    };

    let otp_secret = if let Some(lbl) = label {
        secrets.secrets.iter().find(|s| s.label == lbl)
    } else {
        secrets.secrets.first()
    };

    let otp_secret = match otp_secret {
        Some(s) => s,
        None => {
            if label.is_some() {
                return RpcResponse::error(
                    "OTP settings not found",
                    Some(ErrorCode::OtpSettingsNotFound),
                );
            }
            return RpcResponse::error("OTP secret not found", Some(ErrorCode::OtpSecretNotFound));
        }
    };

    let algorithm = match otp_secret.algorithm.as_str() {
        "SHA256" => Algorithm::SHA256,
        "SHA512" => Algorithm::SHA512,
        _ => Algorithm::SHA1,
    };

    let secret_bytes = match Secret::Encoded(otp_secret.secret.clone()).to_bytes() {
        Ok(bytes) => bytes,
        Err(_) => match general_purpose::STANDARD_NO_PAD.decode(&otp_secret.secret) {
            Ok(bytes) => bytes,
            Err(_) => match hex_decode(&otp_secret.secret) {
                Some(bytes) => bytes,
                None => {
                    return RpcResponse::error(
                        "Invalid secret encoding",
                        Some(ErrorCode::OtpSettingsInvalid),
                    )
                }
            },
        },
    };

    let totp = TOTP::new_unchecked(
        algorithm,
        otp_secret.digits as usize,
        1,
        otp_secret.period as u64,
        secret_bytes,
        None,
        "account".to_string(),
    );

    let time = ts.unwrap_or_else(|| {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0)
    });

    let otp_code = totp.generate(time);

    RpcResponse::success(OtpGenerateResponse { otp: otp_code })
}

pub fn handle_passmanager_otp_generate_by_id(
    session: &VaultSession,
    data: &Value,
    storage: &crate::storage::Storage,
) -> RpcResponse {
    let otp_id = data
        .get("otp_id")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let entry_id = data
        .get("entry_id")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if otp_id.is_none() && entry_id.is_none() {
        return RpcResponse::error(
            "otp_id or entry_id is required",
            Some(ErrorCode::EmptyPayload),
        );
    }
    let fallback_label = data.get("label").and_then(|v| v.as_str());

    let resolved = match resolve_passmanager_otp_target(
        session,
        storage,
        otp_id,
        entry_id,
        fallback_label,
        false,
    ) {
        Ok(v) => v,
        Err(e) => {
            return RpcResponse::error(
                format!("Failed to resolve OTP entry: {}", e),
                Some(ErrorCode::OtpGenerateFailed),
            )
        }
    };

    let Some((node_id, label)) = resolved else {
        return RpcResponse::error("OTP secret not found", Some(ErrorCode::OtpSecretNotFound));
    };

    let initial_payload = build_passmanager_generate_payload(data, node_id, label.clone());
    let initial = catalog_otp_generate_core(session, &Value::Object(initial_payload), storage);
    if initial.is_ok() {
        return initial;
    }

    let should_retry_with_fresh_target = matches!(
        initial.code(),
        Some("OTP_SECRET_NOT_FOUND") | Some("OTP_SETTINGS_NOT_FOUND") | Some("NODE_NOT_FOUND")
    );
    if !should_retry_with_fresh_target {
        return initial;
    }

    let refreshed = match resolve_passmanager_otp_target(
        session,
        storage,
        otp_id,
        entry_id,
        fallback_label,
        true,
    ) {
        Ok(v) => v,
        Err(_) => return initial,
    };
    let Some((fresh_node_id, fresh_label)) = refreshed else {
        return initial;
    };
    if fresh_node_id == node_id && fresh_label == label {
        return initial;
    }

    let retry_payload = build_passmanager_generate_payload(data, fresh_node_id, fresh_label);
    catalog_otp_generate_core(session, &Value::Object(retry_payload), storage)
}

fn hex_decode(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 {
        return None;
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok())
        .collect()
}

pub(crate) fn handle_catalog_otp_remove_secret(
    session: &VaultSession,
    data: &Value,
    storage: &crate::storage::Storage,
) -> RpcResponse {
    let node_id = match data.get("node_id").and_then(|v| v.as_u64()) {
        Some(id) => id,
        None => return RpcResponse::error("node_id is required", Some(ErrorCode::EmptyPayload)),
    };

    if is_system_node(session, node_id) {
        return system_shard_denied();
    }

    let label = match data.get("label").and_then(|v| v.as_str()) {
        Some(l) => l,
        None => return RpcResponse::error("label is required", Some(ErrorCode::EmptyPayload)),
    };

    if session.catalog().find_by_id(node_id).is_none() {
        return RpcResponse::error("Node not found", Some(ErrorCode::NodeNotFound));
    }

    let vault_key = session.vault_key();
    let mut secrets = match load_otp_secrets(vault_key, node_id, storage) {
        Some(s) => s,
        None => return RpcResponse::success(Value::Null),
    };

    let original_len = secrets.secrets.len();
    secrets.secrets.retain(|s| s.label != label);

    if secrets.secrets.len() == original_len {
        return RpcResponse::success(Value::Null);
    }

    if secrets.secrets.is_empty() {
        let chunk_name = crate::crypto::otp_chunk_name(vault_key, node_id);
        let _ = storage.delete_chunk(&chunk_name);
    } else if let Err(e) = save_otp_secrets(vault_key, node_id, &secrets, storage) {
        return RpcResponse::error(
            format!("Failed to save: {}", e),
            Some(ErrorCode::InternalError),
        );
    }

    RpcResponse::success(Value::Null)
}

#[cfg(test)]
#[path = "otp_tests.rs"]
mod tests;
