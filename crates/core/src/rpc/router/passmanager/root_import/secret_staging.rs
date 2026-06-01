use super::catalog_staging::stage_file_bytes;
use super::error::RootImportError;
use super::types::PlannedChunk;
use crate::catalog::CatalogManager;
use crate::types::KEY_SIZE;
use serde_json::{Map, Value};

pub(super) fn stage_imported_secrets(
    catalog: &mut CatalogManager,
    vault_key: &[u8; KEY_SIZE],
    entry_path: &str,
    entry_type: &str,
    entry_obj: &Map<String, Value>,
    meta: &mut Map<String, Value>,
    chunks: &mut Vec<PlannedChunk>,
) -> Result<(), RootImportError> {
    let mut secret_specs = Vec::<(&str, &str)>::new();
    if entry_type == "payment_card" {
        if let Some(value) = entry_obj
            .get("card_pan")
            .or_else(|| entry_obj.get("cardPan"))
            .and_then(|value| value.as_str())
        {
            secret_specs.push(("card_pan", value));
        }
        if let Some(value) = entry_obj
            .get("card_cvv")
            .or_else(|| entry_obj.get("cardCvv"))
            .and_then(|value| value.as_str())
        {
            secret_specs.push(("card_cvv", value));
        }
        if let Some(value) = entry_obj.get("note").and_then(|value| value.as_str()) {
            secret_specs.push(("note", value));
        }
    } else {
        if let Some(value) = entry_obj.get("password").and_then(|value| value.as_str()) {
            secret_specs.push(("password", value));
        }
        if let Some(value) = entry_obj.get("note").and_then(|value| value.as_str()) {
            secret_specs.push(("note", value));
        }
    }

    for (secret_type, value) in secret_specs {
        let normalized = super::super::secret::normalize_secret_value(secret_type, value)
            .map_err(RootImportError::from_passmanager_command_error)?;
        if secret_type == "card_pan" {
            let last4 = normalized
                .chars()
                .rev()
                .take(4)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<String>();
            if let Some(payment_card) = meta.get_mut("payment_card").and_then(Value::as_object_mut)
            {
                payment_card.insert("last4".to_string(), Value::String(last4));
            }
        }
        let Some(secret_name) = super::super::secret::secret_filename(secret_type) else {
            return Err(RootImportError::empty_payload("Unsupported secret type"));
        };
        stage_file_bytes(
            catalog,
            vault_key,
            entry_path,
            &secret_name,
            normalized.as_bytes(),
            "text/plain",
            chunks,
        )?;
    }

    Ok(())
}
