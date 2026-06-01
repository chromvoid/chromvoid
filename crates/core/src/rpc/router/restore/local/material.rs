//! Shared local-restore metadata and portable master material parsing.

use base64::{engine::general_purpose, Engine as _};

use crate::rpc::request_parse::optional_str;
use crate::rpc::RpcRouter;

use super::super::error::{RestoreCommandError, RestoreResult};
use super::models::{PortableMasterMaterial, RestoreCommitState, RestoreMetadata};
use super::validation::RestoreValidationReport;

pub(super) struct RestoreLocalMaterialInput<'a> {
    pub(super) metadata_enc: &'a [u8],
    pub(super) master_salt_b64: Option<&'a str>,
    pub(super) master_verify_b64: Option<&'a str>,
}

impl<'a> RestoreLocalMaterialInput<'a> {
    pub(super) fn from_data(metadata_enc: &'a [u8], data: &'a serde_json::Value) -> Self {
        Self {
            metadata_enc,
            master_salt_b64: optional_str(data, "master_salt"),
            master_verify_b64: optional_str(data, "master_verify"),
        }
    }
}

pub(super) struct RestoreLocalBackupKey {
    pub(super) key: [u8; 32],
    pub(super) portable_master: Option<PortableMasterMaterial>,
}

pub(super) struct RestoreLocalDecodedMetadata {
    pub(super) restore_metadata: RestoreMetadata,
    pub(super) chunk_count: u64,
    pub(super) version: u64,
}

pub(super) struct RestoreLocalMetadataValidation {
    pub(super) version: Option<u64>,
    pub(super) chunk_count: Option<u64>,
    pub(super) warnings: Vec<String>,
}

pub(super) fn decode_metadata_b64_for_commit(encoded: &str) -> RestoreResult<Vec<u8>> {
    general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| RestoreCommandError::restore_invalid_format("Invalid base64"))
}

pub(super) fn decode_metadata_b64_for_validate(
    encoded: &str,
) -> Result<Vec<u8>, RestoreValidationReport> {
    general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| RestoreValidationReport {
            valid: false,
            version: 2,
            chunk_count: 0,
            warnings: vec!["metadata is not valid base64".to_string()],
        })
}

pub(super) fn derive_backup_key_for_commit(
    router: &RpcRouter,
    input: &RestoreLocalMaterialInput<'_>,
) -> RestoreResult<RestoreLocalBackupKey> {
    let Some(master_salt_b64) = input.master_salt_b64 else {
        return router
            .derive_backup_key_v2()
            .map(|key| RestoreLocalBackupKey {
                key,
                portable_master: None,
            })
            .map_err(RestoreCommandError::from);
    };
    let Some(master_verify_b64) = input.master_verify_b64 else {
        return Err(RestoreCommandError::invalid_metadata());
    };

    let master_salt = decode_fixed_array_b64::<16>(master_salt_b64)
        .map_err(|_| RestoreCommandError::invalid_metadata())?;
    let master_verify = decode_fixed_array_b64::<32>(master_verify_b64)
        .map_err(|_| RestoreCommandError::invalid_metadata())?;
    let master_password = router
        .master_key
        .as_deref()
        .ok_or_else(|| RestoreCommandError::internal("Master password not loaded"))?;
    router
        .verify_master_password_with_material(master_password, &master_salt, &master_verify)
        .map_err(RestoreCommandError::from)?;

    derive_backup_key_from_master_material(master_password, &master_salt).map(|key| {
        RestoreLocalBackupKey {
            key,
            portable_master: Some(PortableMasterMaterial {
                master_salt,
                master_verify,
            }),
        }
    })
}

pub(super) fn derive_backup_key_for_validation(
    router: &RpcRouter,
    input: &RestoreLocalMaterialInput<'_>,
) -> Result<RestoreLocalBackupKey, String> {
    let Some(master_salt_b64) = input.master_salt_b64 else {
        return router
            .derive_backup_key_v2()
            .map(|key| RestoreLocalBackupKey {
                key,
                portable_master: None,
            })
            .map_err(|_| "failed to derive backup_key".to_string());
    };
    let Some(master_verify_b64) = input.master_verify_b64 else {
        return Err("metadata missing master.verify".to_string());
    };

    let master_salt = decode_fixed_array_b64::<16>(master_salt_b64)
        .map_err(|_| "metadata master.salt is invalid".to_string())?;
    let master_verify = decode_fixed_array_b64::<32>(master_verify_b64)
        .map_err(|_| "metadata master.verify is invalid".to_string())?;
    let master_password = router
        .master_key
        .as_deref()
        .ok_or_else(|| "master_password not loaded; cannot decrypt metadata.enc".to_string())?;
    router
        .verify_master_password_with_material(master_password, &master_salt, &master_verify)
        .map_err(|_| "failed to verify backup master material".to_string())?;

    let key = derive_backup_key_from_master_material(master_password, &master_salt)
        .map_err(|_| "failed to derive backup_key".to_string())?;
    Ok(RestoreLocalBackupKey {
        key,
        portable_master: Some(PortableMasterMaterial {
            master_salt,
            master_verify,
        }),
    })
}

pub(super) fn decode_metadata_for_validation(
    metadata_enc: &[u8],
    backup_key: &[u8; 32],
) -> RestoreLocalMetadataValidation {
    let mut warnings = Vec::new();
    if metadata_enc.len() < 28 {
        warnings.push("metadata.enc is too short".to_string());
        return RestoreLocalMetadataValidation {
            version: None,
            chunk_count: None,
            warnings,
        };
    }

    let plain = match crate::crypto::decrypt(metadata_enc, backup_key, b"metadata.enc:v2") {
        Ok(plain) => plain,
        Err(_) => {
            warnings.push("failed to decrypt metadata.enc".to_string());
            return RestoreLocalMetadataValidation {
                version: None,
                chunk_count: None,
                warnings,
            };
        }
    };
    let meta: serde_json::Value = match serde_json::from_slice(&plain) {
        Ok(meta) => meta,
        Err(_) => {
            warnings.push("metadata.enc plaintext is not valid JSON".to_string());
            return RestoreLocalMetadataValidation {
                version: None,
                chunk_count: None,
                warnings,
            };
        }
    };

    let version = meta.get("v").and_then(|value| value.as_u64());
    let chunk_count = meta.get("chunk_count").and_then(|value| value.as_u64());
    collect_metadata_warnings(&meta, &mut warnings);
    RestoreLocalMetadataValidation {
        version,
        chunk_count,
        warnings,
    }
}

pub(super) fn validate_metadata_with_current_master(
    router: &RpcRouter,
    metadata_enc: &[u8],
) -> Result<RestoreLocalMetadataValidation, String> {
    if metadata_enc.len() < 28 {
        return Ok(RestoreLocalMetadataValidation {
            version: None,
            chunk_count: None,
            warnings: vec!["metadata.enc is too short".to_string()],
        });
    }
    if router.master_key.is_none() {
        return Err("master_password not loaded; cannot decrypt metadata.enc".to_string());
    }

    let input = RestoreLocalMaterialInput {
        metadata_enc,
        master_salt_b64: None,
        master_verify_b64: None,
    };
    let backup_key = derive_backup_key_for_validation(router, &input)?;
    Ok(decode_metadata_for_validation(
        metadata_enc,
        &backup_key.key,
    ))
}

pub(super) fn decode_metadata_for_commit(
    input: &RestoreLocalMaterialInput<'_>,
    backup_key: &[u8; 32],
    commit_state: &RestoreCommitState,
) -> RestoreResult<RestoreLocalDecodedMetadata> {
    let metadata_plain = crate::crypto::decrypt(input.metadata_enc, backup_key, b"metadata.enc:v2")
        .map_err(|_| RestoreCommandError::invalid_metadata())?;
    let meta: serde_json::Value = serde_json::from_slice(&metadata_plain)
        .map_err(|_| RestoreCommandError::invalid_metadata())?;

    let version = meta
        .get("v")
        .and_then(|value| value.as_u64())
        .ok_or_else(RestoreCommandError::invalid_metadata)?;
    if version != 2 {
        return Err(RestoreCommandError::restore_version_not_supported(
            "Restore version not supported",
        ));
    }

    if meta.get("backup_type").and_then(|value| value.as_str()) != Some("local") {
        return Err(RestoreCommandError::invalid_metadata());
    }

    let expected_chunks = meta
        .get("chunk_count")
        .and_then(|value| value.as_u64())
        .ok_or_else(RestoreCommandError::invalid_metadata)?;
    if commit_state
        .total_chunks
        .is_some_and(|total| total != expected_chunks)
        || commit_state.restored_chunks != expected_chunks
    {
        return Err(RestoreCommandError::restore_invalid_format(
            "Missing chunks",
        ));
    }

    let vault_salt_b64 = meta
        .get("vault_salt")
        .and_then(|value| value.as_str())
        .ok_or_else(RestoreCommandError::invalid_metadata)?;
    let vault_salt = general_purpose::STANDARD
        .decode(vault_salt_b64)
        .map_err(|_| RestoreCommandError::invalid_metadata())?;
    if vault_salt.len() != 16 {
        return Err(RestoreCommandError::invalid_metadata());
    }

    let pepper_wrapped_b64 = meta
        .get("storage_pepper_wrapped")
        .and_then(|value| value.as_str())
        .ok_or_else(|| {
            RestoreCommandError::restore_invalid_format("metadata missing storage_pepper_wrapped")
        })?;
    let pepper_wrapped = general_purpose::STANDARD
        .decode(pepper_wrapped_b64)
        .map_err(|_| RestoreCommandError::invalid_metadata())?;

    let storage_format_v = meta
        .get("storage_format_v")
        .and_then(|value| value.as_u64())
        .unwrap_or(1);
    if storage_format_v < 2 {
        return Err(RestoreCommandError::restore_version_not_supported(
            "Backup storage format v1 is not supported",
        ));
    }

    Ok(RestoreLocalDecodedMetadata {
        restore_metadata: RestoreMetadata {
            vault_salt,
            pepper_wrapped,
            storage_format_v,
        },
        chunk_count: expected_chunks,
        version,
    })
}

fn collect_metadata_warnings(meta: &serde_json::Value, warnings: &mut Vec<String>) {
    if meta.get("backup_type").and_then(|value| value.as_str()) != Some("local") {
        warnings.push("metadata backup_type is not 'local'".to_string());
    }

    match meta.get("v").and_then(|value| value.as_u64()) {
        Some(2) => {}
        Some(version) => warnings.push(format!("unsupported metadata version: {version}")),
        None => warnings.push("metadata missing 'v'".to_string()),
    }

    if let Some(vault_salt_b64) = meta.get("vault_salt").and_then(|value| value.as_str()) {
        match general_purpose::STANDARD.decode(vault_salt_b64) {
            Ok(bytes) if bytes.len() == 16 => {}
            _ => warnings.push("metadata vault_salt is invalid".to_string()),
        }
    } else {
        warnings.push("metadata missing vault_salt".to_string());
    }

    if let Some(pepper_b64) = meta
        .get("storage_pepper_wrapped")
        .and_then(|value| value.as_str())
    {
        match general_purpose::STANDARD.decode(pepper_b64) {
            Ok(bytes) if bytes.len() == 12 + 32 + 16 => {}
            _ => warnings.push("metadata storage_pepper_wrapped is invalid".to_string()),
        }
    } else {
        warnings.push("metadata missing storage_pepper_wrapped".to_string());
    }
}

fn decode_fixed_array_b64<const N: usize>(encoded: &str) -> Result<[u8; N], ()> {
    let bytes = general_purpose::STANDARD.decode(encoded).map_err(|_| ())?;
    bytes.as_slice().try_into().map_err(|_| ())
}

fn derive_backup_key_from_master_material(
    master_password: &str,
    master_salt: &[u8; 16],
) -> RestoreResult<[u8; 32]> {
    use crate::crypto::{derive_vault_key, hash};

    let master_key_derived = derive_vault_key(master_password, master_salt)
        .map_err(|error| RestoreCommandError::internal(error.to_string()))?;
    let mut buffer = Vec::with_capacity(master_key_derived.len() + "local-backup-v2".len());
    buffer.extend_from_slice(&*master_key_derived);
    buffer.extend_from_slice(b"local-backup-v2");
    Ok(hash(&buffer))
}
