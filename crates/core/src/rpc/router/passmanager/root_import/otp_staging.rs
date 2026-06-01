use super::error::RootImportError;
use super::types::PlannedChunk;
use crate::rpc::types::{OtpSecret, OtpSecrets};
use crate::types::KEY_SIZE;
use serde_json::{Map, Value};

pub(super) fn stage_imported_otp_secrets(
    vault_key: &[u8; KEY_SIZE],
    entry_node_id: u64,
    entry_obj: &Map<String, Value>,
    chunks: &mut Vec<PlannedChunk>,
) -> Result<(), RootImportError> {
    let Some(otps) = entry_obj.get("otps").and_then(Value::as_array) else {
        return Ok(());
    };

    let mut secrets = OtpSecrets::default();
    for otp in otps {
        let Some(secret_value) = otp.get("secret").and_then(Value::as_str) else {
            continue;
        };
        let label = otp
            .get("label")
            .and_then(Value::as_str)
            .or_else(|| otp.get("id").and_then(Value::as_str))
            .unwrap_or("default")
            .to_string();
        let algorithm = otp
            .get("algorithm")
            .and_then(Value::as_str)
            .unwrap_or("SHA1")
            .to_uppercase();
        let digits = otp.get("digits").and_then(Value::as_u64).unwrap_or(6) as u8;
        let period = otp.get("period").and_then(Value::as_u64).unwrap_or(30) as u32;
        secrets.secrets.retain(|item| item.label != label);
        secrets.secrets.push(OtpSecret {
            label,
            secret: secret_value.to_string(),
            algorithm,
            digits,
            period,
        });
    }
    if secrets.secrets.is_empty() {
        return Ok(());
    }

    let chunk_name = crate::crypto::otp_chunk_name(vault_key, entry_node_id);
    let plain = serde_json::to_vec(&secrets).map_err(|error| {
        RootImportError::internal(format!("Failed to encode OTP secrets: {error}"))
    })?;
    let encrypted =
        crate::crypto::encrypt(&plain, vault_key, chunk_name.as_bytes()).map_err(|error| {
            RootImportError::internal(format!("Failed to encrypt OTP secrets: {error}"))
        })?;
    chunks.push(PlannedChunk {
        name: chunk_name,
        encrypted,
    });

    Ok(())
}
