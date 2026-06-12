//! Typed OTP sidecar service used by authorized domain adapters.

use base64::{engine::general_purpose, Engine as _};

use crate::rpc::types::{OtpGenerateResponse, OtpSecret, OtpSecrets};
use crate::storage::Storage;
use crate::vault::VaultSession;

use super::error::OtpSidecarError;
use super::storage::{delete_otp_sidecar_atomic, load_otp_secrets, save_otp_secrets};
use super::OtpSidecarResult;

pub(crate) struct OtpSetSecretRequest {
    pub(crate) node_id: u64,
    pub(crate) label: String,
    pub(crate) secret: String,
    pub(crate) algorithm: String,
    pub(crate) digits: u8,
    pub(crate) period: u32,
}

pub(crate) struct OtpRemoveSecretRequest<'a> {
    pub(crate) node_id: u64,
    pub(crate) label: &'a str,
}

pub(crate) struct OtpRenameSecretRequest<'a> {
    pub(crate) node_id: u64,
    pub(crate) previous_label: &'a str,
    pub(crate) next_label: &'a str,
}

pub(crate) struct OtpGenerateRequest<'a> {
    pub(crate) node_id: u64,
    pub(crate) label: Option<&'a str>,
    pub(crate) ts: Option<u64>,
}

pub(crate) fn set_secret(
    session: &VaultSession,
    storage: &Storage,
    request: OtpSetSecretRequest,
) -> OtpSidecarResult<()> {
    ensure_node_exists(session, request.node_id)?;

    let algorithm = request.algorithm.to_uppercase();
    if !["SHA1", "SHA256", "SHA512"].contains(&algorithm.as_str()) {
        return Err(OtpSidecarError::otp_settings_invalid("Invalid algorithm"));
    }

    if request.digits != 6 && request.digits != 8 {
        return Err(OtpSidecarError::otp_settings_invalid(
            "digits must be 6 or 8",
        ));
    }

    let vault_key = session.vault_key();
    let mut secrets = load_otp_secrets(vault_key, request.node_id, storage).unwrap_or_default();
    secrets.secrets.retain(|s| s.label != request.label);
    secrets.secrets.push(OtpSecret {
        label: request.label,
        secret: request.secret,
        algorithm,
        digits: request.digits,
        period: request.period,
    });

    save_otp_secrets(vault_key, request.node_id, &secrets, storage).map_err(|e| {
        OtpSidecarError::internal(format!("Failed to save OTP secret: {}", e.into_message()))
    })?;

    Ok(())
}

pub(crate) fn rename_secret(
    session: &VaultSession,
    storage: &Storage,
    request: OtpRenameSecretRequest<'_>,
) -> OtpSidecarResult<()> {
    ensure_node_exists(session, request.node_id)?;

    if request.previous_label == request.next_label {
        return Ok(());
    }

    let vault_key = session.vault_key();
    let mut secrets = match load_otp_secrets(vault_key, request.node_id, storage) {
        Some(secrets) => secrets,
        None => return Ok(()),
    };

    let previous_index = secrets
        .secrets
        .iter()
        .position(|secret| secret.label == request.previous_label);
    let next_exists = secrets
        .secrets
        .iter()
        .any(|secret| secret.label == request.next_label);

    let Some(previous_index) = previous_index else {
        if secrets.secrets.len() == 1 {
            secrets.secrets[0].label = request.next_label.to_string();
            save_otp_secrets(vault_key, request.node_id, &secrets, storage).map_err(|e| {
                OtpSidecarError::internal(format!(
                    "Failed to rename OTP secret: {}",
                    e.into_message()
                ))
            })?;
        }
        return Ok(());
    };

    if next_exists {
        return Err(OtpSidecarError::otp_settings_invalid(
            "OTP label already exists",
        ));
    }

    secrets.secrets[previous_index].label = request.next_label.to_string();

    save_otp_secrets(vault_key, request.node_id, &secrets, storage).map_err(|e| {
        OtpSidecarError::internal(format!("Failed to rename OTP secret: {}", e.into_message()))
    })?;

    Ok(())
}

pub(crate) fn remove_secret(
    session: &VaultSession,
    storage: &Storage,
    request: OtpRemoveSecretRequest<'_>,
) -> OtpSidecarResult<()> {
    ensure_node_exists(session, request.node_id)?;

    let vault_key = session.vault_key();
    let mut secrets = match load_otp_secrets(vault_key, request.node_id, storage) {
        Some(s) => s,
        None => return Ok(()),
    };

    let original_len = secrets.secrets.len();
    secrets.secrets.retain(|s| s.label != request.label);

    if secrets.secrets.len() == original_len {
        return Ok(());
    }

    if secrets.secrets.is_empty() {
        delete_otp_sidecar_atomic(vault_key, request.node_id, storage).map_err(|e| {
            OtpSidecarError::internal(format!("Failed to remove OTP secret: {}", e.into_message()))
        })?;
    } else {
        save_otp_secrets(vault_key, request.node_id, &secrets, storage).map_err(|e| {
            OtpSidecarError::internal(format!("Failed to save: {}", e.into_message()))
        })?;
    }

    Ok(())
}

pub(crate) fn generate(
    session: &VaultSession,
    storage: &Storage,
    request: OtpGenerateRequest<'_>,
) -> OtpSidecarResult<OtpGenerateResponse> {
    use totp_rs::{Algorithm, Secret, TOTP};

    ensure_node_exists(session, request.node_id)?;

    let vault_key = session.vault_key();
    let otp_chunk_name = crate::crypto::otp_chunk_name(vault_key, request.node_id);
    let encrypted = match storage.read_chunk(&otp_chunk_name) {
        Ok(b) => b,
        Err(crate::error::Error::ChunkNotFound(_)) => {
            return Err(OtpSidecarError::otp_secret_not_found())
        }
        Err(e) => {
            return Err(OtpSidecarError::otp_generate_failed(format!(
                "Failed to read OTP secrets: {}",
                e
            )))
        }
    };

    let decrypted = match crate::crypto::decrypt(&encrypted, vault_key, otp_chunk_name.as_bytes()) {
        Ok(p) => p,
        Err(e) => {
            return Err(OtpSidecarError::otp_generate_failed(format!(
                "Failed to decrypt OTP secrets: {}",
                e
            )))
        }
    };

    let secrets: OtpSecrets = match serde_json::from_slice(&decrypted) {
        Ok(s) => s,
        Err(e) => {
            return Err(OtpSidecarError::otp_generate_failed(format!(
                "Failed to parse OTP secrets: {}",
                e
            )))
        }
    };

    let otp_secret = if let Some(lbl) = request.label {
        secrets.secrets.iter().find(|s| s.label == lbl)
    } else {
        secrets.secrets.first()
    };

    let otp_secret = match otp_secret {
        Some(s) => s,
        None => {
            if request.label.is_some() && secrets.secrets.len() == 1 {
                &secrets.secrets[0]
            } else if request.label.is_some() {
                return Err(OtpSidecarError::otp_settings_not_found());
            } else {
                return Err(OtpSidecarError::otp_secret_not_found());
            }
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
                    return Err(OtpSidecarError::otp_settings_invalid(
                        "Invalid secret encoding",
                    ))
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

    let time = request.ts.unwrap_or_else(|| {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0)
    });

    Ok(OtpGenerateResponse {
        otp: totp.generate(time),
    })
}

fn ensure_node_exists(session: &VaultSession, node_id: u64) -> OtpSidecarResult<()> {
    if session.catalog().find_by_id(node_id).is_none() {
        return Err(OtpSidecarError::node_not_found());
    }

    Ok(())
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
