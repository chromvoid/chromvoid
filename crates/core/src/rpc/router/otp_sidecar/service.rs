//! Typed OTP sidecar service used by authorized domain adapters.

use crate::rpc::types::{OtpGenerateResponse, OtpPreviewResponse, OtpSecret, OtpSecrets};
use crate::storage::Storage;
use crate::vault::VaultSession;

use super::error::OtpSidecarError;
use super::generator::{generate as generate_otp_code, normalize_settings};
use super::storage::{delete_otp_sidecar_atomic, load_otp_secrets, save_otp_secrets};
use super::OtpSidecarResult;

pub(crate) struct OtpSetSecretRequest {
    pub(crate) node_id: u64,
    pub(crate) label: String,
    pub(crate) secret: String,
    pub(crate) encoding: String,
    pub(crate) otp_type: String,
    pub(crate) counter: Option<u64>,
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
    pub(crate) counter: Option<u64>,
}

pub(crate) struct OtpPreviewRequest {
    pub(crate) secret: String,
    pub(crate) encoding: String,
    pub(crate) otp_type: String,
    pub(crate) counter: Option<u64>,
    pub(crate) algorithm: String,
    pub(crate) digits: u8,
    pub(crate) period: u32,
    pub(crate) ts: Option<u64>,
}

pub(crate) fn set_secret(
    session: &VaultSession,
    storage: &Storage,
    request: OtpSetSecretRequest,
) -> OtpSidecarResult<()> {
    ensure_node_exists(session, request.node_id)?;

    let node_id = request.node_id;
    let validated = validate_secret(request)?;
    let vault_key = session.vault_key();
    let mut secrets = load_otp_secrets(vault_key, node_id, storage).unwrap_or_default();
    secrets.secrets.retain(|s| s.label != validated.label);
    secrets.secrets.push(validated);

    save_otp_secrets(vault_key, node_id, &secrets, storage).map_err(|e| {
        OtpSidecarError::internal(format!("Failed to save OTP secret: {}", e.into_message()))
    })?;

    Ok(())
}

pub(crate) fn validate_secret(request: OtpSetSecretRequest) -> OtpSidecarResult<OtpSecret> {
    let settings = normalize_settings(
        &request.algorithm,
        request.digits,
        request.period,
        &request.encoding,
        &request.otp_type,
        request.counter,
    )?;
    let _ = generate_otp_code(&request.secret, settings, None)?;
    Ok(OtpSecret {
        label: request.label,
        secret: request.secret,
        encoding: settings.encoding.as_str().to_string(),
        otp_type: settings.kind.as_str().to_string(),
        counter: settings.counter,
        algorithm: settings.algorithm.as_str().to_string(),
        digits: settings.digits,
        period: settings.period,
    })
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
    generate_with_timing(session, storage, request)
        .map(|generated| OtpGenerateResponse { otp: generated.otp })
}

pub(crate) fn generate_with_timing(
    session: &VaultSession,
    storage: &Storage,
    request: OtpGenerateRequest<'_>,
) -> OtpSidecarResult<OtpPreviewResponse> {
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

    let counter = request.counter.or(otp_secret.counter);
    let settings = normalize_settings(
        &otp_secret.algorithm,
        otp_secret.digits,
        otp_secret.period,
        &otp_secret.encoding,
        &otp_secret.otp_type,
        counter,
    )?;
    let generated = generate_otp_code(&otp_secret.secret, settings, request.ts)?;

    Ok(OtpPreviewResponse {
        otp: generated.otp,
        period: generated.period,
        left_seconds: generated.left_seconds,
    })
}

pub(crate) fn preview(request: OtpPreviewRequest) -> OtpSidecarResult<OtpPreviewResponse> {
    let settings = normalize_settings(
        &request.algorithm,
        request.digits,
        request.period,
        &request.encoding,
        &request.otp_type,
        request.counter,
    )?;
    let generated = generate_otp_code(&request.secret, settings, request.ts)?;

    Ok(OtpPreviewResponse {
        otp: generated.otp,
        period: generated.period,
        left_seconds: generated.left_seconds,
    })
}

fn ensure_node_exists(session: &VaultSession, node_id: u64) -> OtpSidecarResult<()> {
    if session.catalog().find_by_id(node_id).is_none() {
        return Err(OtpSidecarError::node_not_found());
    }

    Ok(())
}
