//! Shared restore-local validation service for folder and payload checks.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use crate::rpc::request_parse::{optional_array, optional_str, optional_value};
use crate::rpc::RpcRouter;

use super::super::super::backup_pack::{BackupChunkManifest, BACKUP_PACK_FILE_NAME};
use super::super::error::{RestoreCommandError, RestoreResult};
use super::super::request::required_str;
use super::material::{
    decode_metadata_b64_for_validate, decode_metadata_for_validation,
    derive_backup_key_for_validation, validate_metadata_with_current_master,
    RestoreLocalMaterialInput,
};

pub(super) struct RestoreValidationReport {
    pub(super) valid: bool,
    pub(super) version: u64,
    pub(super) chunk_count: u64,
    pub(super) warnings: Vec<String>,
}

impl RestoreValidationReport {
    pub(super) fn into_value(self) -> serde_json::Value {
        serde_json::json!({
            "valid": self.valid,
            "version": self.version,
            "chunk_count": self.chunk_count,
            "warnings": self.warnings,
        })
    }
}

pub(super) struct RestoreDirectoryValidationRequest {
    backup_path: PathBuf,
}

impl RestoreDirectoryValidationRequest {
    pub(super) fn from_data(data: &serde_json::Value) -> RestoreResult<Self> {
        Ok(Self {
            backup_path: PathBuf::from(required_str(data, "backup_path")?),
        })
    }
}

pub(super) enum RestoreValidationRequestError {
    Command(RestoreCommandError),
    Report(RestoreValidationReport),
}

pub(super) struct RestorePayloadValidationRequest {
    metadata_bytes: Vec<u8>,
    chunk_names: Vec<String>,
    valid: bool,
    warnings: Vec<String>,
    master_salt_b64: Option<String>,
    master_verify_b64: Option<String>,
}

impl RestorePayloadValidationRequest {
    pub(super) fn from_data(
        data: &serde_json::Value,
    ) -> Result<Self, RestoreValidationRequestError> {
        let metadata_b64 =
            required_str(data, "metadata").map_err(RestoreValidationRequestError::Command)?;
        let metadata_bytes = decode_metadata_b64_for_validate(metadata_b64)
            .map_err(RestoreValidationRequestError::Report)?;
        let mut warnings = Vec::<String>::new();
        let mut valid = true;

        let chunk_names = if let Some(manifest_value) = optional_value(data, "manifest") {
            match serde_json::from_value::<BackupChunkManifest>(manifest_value.clone()) {
                Ok(manifest) => {
                    if let Err(error) = manifest.validate() {
                        valid = false;
                        warnings.push(error);
                    }
                    manifest
                        .chunks
                        .into_iter()
                        .map(|chunk| chunk.name)
                        .collect::<Vec<_>>()
                }
                Err(error) => {
                    valid = false;
                    warnings.push(format!("chunks.manifest.json is invalid: {error}"));
                    Vec::new()
                }
            }
        } else {
            match optional_array(data, "chunk_names") {
                Some(values) => values
                    .iter()
                    .filter_map(|value| value.as_str().map(str::to_string))
                    .collect::<Vec<_>>(),
                None => {
                    return Err(RestoreValidationRequestError::Command(
                        RestoreCommandError::empty_payload("manifest"),
                    ))
                }
            }
        };

        Ok(Self {
            metadata_bytes,
            chunk_names,
            valid,
            warnings,
            master_salt_b64: optional_str(data, "master_salt").map(str::to_string),
            master_verify_b64: optional_str(data, "master_verify").map(str::to_string),
        })
    }
}

pub(super) fn validate_restore_directory(
    router: &RpcRouter,
    request: RestoreDirectoryValidationRequest,
) -> RestoreValidationReport {
    let backup_dir = request.backup_path;
    let mut warnings = Vec::<String>::new();
    let mut valid = true;

    if !backup_dir.is_dir() {
        warnings.push("backup_path is not a directory".to_string());
        return RestoreValidationReport {
            valid: false,
            version: 2,
            chunk_count: 0,
            warnings,
        };
    }

    let meta_path = backup_dir.join("metadata.enc");
    if !meta_path.is_file() {
        valid = false;
        warnings.push("metadata.enc not found".to_string());
    }

    let manifest_path = backup_dir.join("chunks.manifest.json");
    if !manifest_path.is_file() {
        valid = false;
        warnings.push("chunks.manifest.json not found".to_string());
    }

    let mut found_chunks = 0u64;
    if manifest_path.is_file() {
        match fs::read(&manifest_path) {
            Ok(bytes) => match serde_json::from_slice::<BackupChunkManifest>(&bytes) {
                Ok(manifest) => {
                    found_chunks = manifest.chunk_count;
                    if let Err(error) = manifest.validate() {
                        valid = false;
                        warnings.push(error);
                    }
                    validate_pack_file(&backup_dir, &manifest, &mut valid, &mut warnings);
                }
                Err(error) => {
                    valid = false;
                    warnings.push(format!("chunks.manifest.json is invalid: {error}"));
                }
            },
            Err(error) => {
                valid = false;
                warnings.push(format!("failed to read chunks.manifest.json: {error}"));
            }
        }
    } else if !backup_dir.join(BACKUP_PACK_FILE_NAME).is_file() {
        valid = false;
        warnings.push("chunks.pack not found".to_string());
    }

    let mut meta_version = None;
    let mut meta_chunk_count = None;
    if meta_path.is_file() {
        let meta_bytes = match fs::read(&meta_path) {
            Ok(bytes) => bytes,
            Err(error) => {
                valid = false;
                warnings.push(format!("failed to read metadata.enc: {}", error));
                Vec::new()
            }
        };
        match validate_metadata_with_current_master(router, &meta_bytes) {
            Ok(report) => {
                meta_version = report.version;
                meta_chunk_count = report.chunk_count;
                if !report.warnings.is_empty() {
                    valid = false;
                    warnings.extend(report.warnings);
                }
            }
            Err(warning) => {
                valid = false;
                warnings.push(warning);
            }
        }
    }

    if let Some(expected_chunks) = meta_chunk_count {
        if expected_chunks != found_chunks {
            valid = false;
            warnings.push(format!(
                "chunk_count mismatch: metadata={}, found={}",
                expected_chunks, found_chunks
            ));
        }
    }

    RestoreValidationReport {
        valid,
        version: meta_version.unwrap_or(2),
        chunk_count: found_chunks,
        warnings,
    }
}

pub(super) fn validate_restore_payload(
    router: &RpcRouter,
    request: RestorePayloadValidationRequest,
) -> RestoreValidationReport {
    let RestorePayloadValidationRequest {
        metadata_bytes,
        chunk_names,
        mut valid,
        mut warnings,
        master_salt_b64,
        master_verify_b64,
    } = request;

    let mut seen = HashSet::<String>::new();
    for chunk_name in &chunk_names {
        if !is_valid_chunk_name(chunk_name) {
            valid = false;
            warnings.push(format!("invalid chunk name: {chunk_name}"));
            continue;
        }
        if !seen.insert(chunk_name.clone()) {
            valid = false;
            warnings.push(format!("duplicate chunk name: {chunk_name}"));
        }
    }

    let mut meta_version = None;
    let mut meta_chunk_count = None;
    if metadata_bytes.len() < 28 {
        valid = false;
        warnings.push("metadata.enc is too short".to_string());
    } else if router.master_key.is_none() {
        valid = false;
        warnings.push("master_password not loaded; cannot decrypt metadata.enc".to_string());
    } else {
        let material_input = RestoreLocalMaterialInput {
            metadata_enc: &metadata_bytes,
            master_salt_b64: master_salt_b64.as_deref(),
            master_verify_b64: master_verify_b64.as_deref(),
        };
        let backup_key = match derive_backup_key_for_validation(router, &material_input) {
            Ok(material) => material.key,
            Err(warning) => {
                warnings.push(warning);
                return RestoreValidationReport {
                    valid: false,
                    version: 2,
                    chunk_count: seen.len() as u64,
                    warnings,
                };
            }
        };

        let report = decode_metadata_for_validation(&metadata_bytes, &backup_key);
        meta_version = report.version;
        meta_chunk_count = report.chunk_count;
        if !report.warnings.is_empty() {
            valid = false;
            warnings.extend(report.warnings);
        }
    }

    if let Some(expected_chunks) = meta_chunk_count {
        let found_chunks = seen.len() as u64;
        if expected_chunks != found_chunks {
            valid = false;
            warnings.push(format!(
                "chunk_count mismatch: metadata={}, found={}",
                expected_chunks, found_chunks
            ));
        }
    }

    RestoreValidationReport {
        valid,
        version: meta_version.unwrap_or(2),
        chunk_count: seen.len() as u64,
        warnings,
    }
}

fn validate_pack_file(
    backup_dir: &Path,
    manifest: &BackupChunkManifest,
    valid: &mut bool,
    warnings: &mut Vec<String>,
) {
    let pack_path = backup_dir.join(BACKUP_PACK_FILE_NAME);
    match fs::metadata(&pack_path) {
        Ok(metadata) if metadata.is_file() => {
            let pack_size = metadata.len();
            if pack_size != manifest.total_size {
                *valid = false;
                warnings.push(format!(
                    "chunks.pack size mismatch: manifest={}, found={}",
                    manifest.total_size, pack_size
                ));
            }
        }
        Ok(_) => {
            *valid = false;
            warnings.push("chunks.pack is not a file".to_string());
        }
        Err(_) => {
            *valid = false;
            warnings.push("chunks.pack not found".to_string());
        }
    }
}

fn is_valid_chunk_name(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit())
}
