use super::super::super::otp_sidecar::load_otp_secrets_checked;
use super::super::secret;
use super::error::RootExportError;
use crate::storage::Storage;
use crate::vault::VaultSession;
use serde_json::{Map, Value};

pub(super) fn attach_entry_secrets(
    meta_obj: &mut Map<String, Value>,
    session: &VaultSession,
    storage: &Storage,
    node_id: u64,
    entry_type: &str,
) -> Result<(), RootExportError> {
    let fields: &[&str] = if entry_type == "payment_card" {
        &["card_pan", "card_cvv", "note"]
    } else {
        &["password", "note"]
    };
    for field in fields {
        if let Some(value) = secret::read_secret_value_checked(session, storage, node_id, field)
            .map_err(RootExportError::from_passmanager_command_error)?
        {
            meta_obj.insert((*field).to_string(), Value::String(value));
        }
    }
    if entry_type == "payment_card" {
        for field in ["username", "urls", "otps", "sshKeys"] {
            meta_obj.remove(field);
        }
        return Ok(());
    }

    let settings = load_otp_secrets_checked(session.vault_key(), node_id, storage)
        .map_err(|_| RootExportError::internal("Could not read OTP settings for export"))?;
    let mut labels = std::collections::HashSet::new();
    if settings
        .secrets
        .iter()
        .any(|secret| !labels.insert(&secret.label))
    {
        return Err(RootExportError::internal("Duplicate OTP labels"));
    }
    if settings.secrets.is_empty() && matches!(meta_obj.get("otps"), None | Some(Value::Null)) {
        return Ok(());
    }
    let had_otps = meta_obj.contains_key("otps");
    let mut otps = match meta_obj.remove("otps") {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(values)) => values,
        Some(_) => return Err(RootExportError::internal("Invalid OTP metadata")),
    };
    let legacy_single = otps.len() == 1 && settings.secrets.len() == 1;
    let mut used = std::collections::HashSet::new();
    for otp in &mut otps {
        let object = otp
            .as_object_mut()
            .ok_or_else(|| RootExportError::internal("Invalid OTP metadata"))?;
        let label = object.get("label").and_then(Value::as_str);
        let secret = settings
            .secrets
            .iter()
            .find(|secret| Some(secret.label.as_str()) == label)
            .or_else(|| legacy_single.then(|| &settings.secrets[0]));
        let Some(secret) = secret else {
            // Older entry writers could retain the seed directly in encrypted metadata.
            if object
                .get("secret")
                .and_then(Value::as_str)
                .is_some_and(|value| !value.is_empty())
            {
                continue;
            }
            return Err(RootExportError::internal("OTP secret missing for export"));
        };
        if !used.insert(&secret.label) {
            return Err(RootExportError::internal("Duplicate OTP metadata"));
        }
        // The sidecar owns code generation settings, including the latest HOTP counter.
        let Value::Object(mut values) = serde_json::to_value(secret)
            .map_err(|_| RootExportError::internal("Could not encode OTP settings"))?
        else {
            return Err(RootExportError::internal("Invalid OTP settings"));
        };
        // Preserve a legacy single-record presentation label while matching its only secret.
        if object.contains_key("label") {
            values.remove("label");
        }
        object.extend(values);
    }
    for secret in &settings.secrets {
        if !used.contains(&secret.label) {
            otps.push(
                serde_json::to_value(secret)
                    .map_err(|_| RootExportError::internal("Could not encode OTP settings"))?,
            );
        }
    }
    if had_otps || !otps.is_empty() {
        meta_obj.insert("otps".to_string(), Value::Array(otps));
    }
    Ok(())
}
