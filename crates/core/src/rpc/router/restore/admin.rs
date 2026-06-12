use crate::durable_tx::DurableTxPhase;
use crate::rpc::router::session_lifecycle::now_ms;
use crate::rpc::stream::{read_stream_to_end_limited, MAX_SINGLE_RPC_STREAM_BYTES};
use crate::rpc::{RpcInputStream, RpcReply, RpcResponse, RpcRouter};

use super::apply::{apply_restore_materials, RestoreArtifactWrite, RestoreChunkWrite};
use super::error::{RestoreCommandError, RestoreResult};
use super::request::required_str;
use super::tx::{
    delete_restore_transaction, write_restore_transaction, RestoreStorageArtifact,
    RestoreTransactionKind, RestoreTransactionPayload,
};

pub(super) fn handle_admin_restore_v2(
    router: &mut RpcRouter,
    data: &serde_json::Value,
) -> RpcResponse {
    match admin_restore_v2(router, data) {
        Ok(result) => RpcResponse::success(result),
        Err(error) => error.into_rpc_response(),
    }
}

fn admin_restore_v2(
    router: &mut RpcRouter,
    data: &serde_json::Value,
) -> RestoreResult<serde_json::Value> {
    let master_password = required_str(data, "master_password")?;

    router
        .verify_master_password(master_password)
        .map_err(RestoreCommandError::from)?;
    router
        .recover_before_restore_entry()
        .map_err(RestoreCommandError::from)?;

    router.session = None;

    Err(RestoreCommandError::no_stream())
}

pub(super) fn handle_admin_restore_stream(
    router: &mut RpcRouter,
    data: &serde_json::Value,
    stream: Option<RpcInputStream>,
) -> RpcReply {
    match admin_restore_stream(router, data, stream) {
        Ok(result) => RpcReply::Json(RpcResponse::success(result)),
        Err(error) => RpcReply::Json(error.into_rpc_response()),
    }
}

fn admin_restore_stream(
    router: &mut RpcRouter,
    data: &serde_json::Value,
    stream: Option<RpcInputStream>,
) -> RestoreResult<serde_json::Value> {
    let master_password = required_str(data, "master_password")?;

    let stream = stream.ok_or_else(RestoreCommandError::no_stream)?;
    router
        .recover_before_restore_entry()
        .map_err(RestoreCommandError::from)?;

    router.session = None;

    let existing_chunks = router.storage.list_chunks().map_err(|error| {
        RestoreCommandError::internal(format!("Failed to check storage state: {}", error))
    })?;
    if !existing_chunks.is_empty() || router.storage.salt_exists() {
        return Err(RestoreCommandError::storage_not_blank());
    }

    let backup_bytes =
        read_stream_to_end_limited(stream, MAX_SINGLE_RPC_STREAM_BYTES).map_err(|error| {
            RestoreCommandError::internal(format!("Failed to read backup stream: {}", error))
        })?;

    let backup_data: Vec<(String, Vec<u8>)> =
        serde_json::from_slice(&backup_bytes).map_err(|error| {
            RestoreCommandError::invalid_backup(format!("Invalid backup format: {}", error))
        })?;

    let mut expected_checksum: Option<Vec<u8>> = None;
    let mut backup_master_salt: Option<[u8; 16]> = None;
    let mut backup_master_verify: Option<[u8; 32]> = None;
    let mut backup_pepper_wrapped: Option<Vec<u8>> = None;
    let mut checksum_material = Vec::new();
    for (name, bytes) in &backup_data {
        if name == "__checksum__" {
            expected_checksum = Some(bytes.clone());
            continue;
        }

        if name == "__master_salt__" {
            if let Ok(salt) = bytes.as_slice().try_into() {
                backup_master_salt = Some(salt);
            }
        }
        if name == "__master_verify__" {
            if let Ok(verify) = bytes.as_slice().try_into() {
                backup_master_verify = Some(verify);
            }
        }
        if name == "__storage_pepper_wrapped__" {
            backup_pepper_wrapped = Some(bytes.clone());
        }
        checksum_material.extend_from_slice(name.as_bytes());
        checksum_material.extend_from_slice(&[0u8]);
        checksum_material.extend_from_slice(&(bytes.len() as u64).to_le_bytes());
        checksum_material.extend_from_slice(bytes);
    }
    if let Some(expected) = expected_checksum {
        let actual = crate::crypto::hash(&checksum_material);
        if expected != actual.to_vec() {
            return Err(RestoreCommandError::checksum_mismatch());
        }
    }

    let backup_master_salt = match backup_master_salt {
        Some(salt) => salt,
        None => {
            return Err(RestoreCommandError::invalid_backup(
                "Invalid backup format: missing master.salt",
            ))
        }
    };
    let backup_master_verify = match backup_master_verify {
        Some(verify) => verify,
        None => {
            return Err(RestoreCommandError::invalid_backup(
                "Invalid backup format: missing master.verify",
            ))
        }
    };

    router
        .verify_master_password_with_material(
            master_password,
            &backup_master_salt,
            &backup_master_verify,
        )
        .map_err(RestoreCommandError::from)?;
    router
        .recover_before_restore_entry()
        .map_err(RestoreCommandError::from)?;

    let pepper_wrapped = match backup_pepper_wrapped {
        Some(bytes) => bytes,
        None => {
            return Err(RestoreCommandError::invalid_backup(
                "Invalid backup format: missing storage_pepper_wrapped",
            ))
        }
    };
    if router.keystore.is_none() {
        return Err(RestoreCommandError::keystore_unavailable(
            "Keystore not available",
        ));
    }
    use crate::crypto::{derive_vault_key, hash};
    let master_key_derived =
        derive_vault_key(master_password, &backup_master_salt).map_err(|error| {
            RestoreCommandError::internal(format!("Failed to derive master key: {}", error))
        })?;
    let mut buffer = Vec::with_capacity(master_key_derived.len() + "local-backup-v2".len());
    buffer.extend_from_slice(&*master_key_derived);
    buffer.extend_from_slice(b"local-backup-v2");
    let backup_key = hash(&buffer);
    let storage_pepper =
        match crate::crypto::StoragePepper::unwrap_from_backup(&pepper_wrapped, &backup_key) {
            Ok(pepper) => pepper,
            Err(_) => {
                return Err(RestoreCommandError::storage_pepper_invalid(
                    "Invalid backup format: storage_pepper_wrapped",
                ))
            }
        };
    let mut restore_tx = RestoreTransactionPayload::new(
        RestoreTransactionKind::Admin,
        format!("admin-restore-{}", now_ms()),
        backup_data
            .iter()
            .filter(|(name, _)| !is_admin_restore_control_name(name))
            .map(|(name, _)| name.clone()),
        restore_artifacts_from_backup_data(&backup_data),
    );
    if let Err(error) =
        write_restore_transaction(&router.storage, DurableTxPhase::Committing, &restore_tx)
    {
        return Err(RestoreCommandError::failed_to_write_restore_transaction(
            error,
        ));
    }
    let mut chunks = Vec::new();
    let mut artifacts = Vec::new();
    for (name, bytes) in backup_data {
        match name.as_str() {
            "__salt__" => artifacts.push(RestoreArtifactWrite {
                artifact: RestoreStorageArtifact::Salt,
                bytes,
                error_label: "salt",
            }),
            "__master_salt__" => artifacts.push(RestoreArtifactWrite {
                artifact: RestoreStorageArtifact::MasterSalt,
                bytes,
                error_label: "master.salt",
            }),
            "__master_verify__" => artifacts.push(RestoreArtifactWrite {
                artifact: RestoreStorageArtifact::MasterVerify,
                bytes,
                error_label: "master.verify",
            }),
            "__checksum__" | "__storage_pepper_wrapped__" => {}
            _ => chunks.push(RestoreChunkWrite { name, bytes }),
        }
    }

    let nodes_restored = apply_restore_materials(
        router,
        &mut restore_tx,
        chunks,
        artifacts,
        storage_pepper,
        "admin-restore",
    )?;
    if let Err(error) = delete_restore_transaction(&router.storage) {
        return Err(RestoreCommandError::failed_to_clear_restore_transaction(
            error,
        ));
    }

    Ok(serde_json::json!({
        "nodes_restored": nodes_restored,
    }))
}

fn is_admin_restore_control_name(name: &str) -> bool {
    matches!(
        name,
        "__salt__"
            | "__master_salt__"
            | "__master_verify__"
            | "__checksum__"
            | "__storage_pepper_wrapped__"
    )
}

fn restore_artifacts_from_backup_data(
    backup_data: &[(String, Vec<u8>)],
) -> Vec<RestoreStorageArtifact> {
    let mut artifacts = Vec::new();
    for (name, _) in backup_data {
        match name.as_str() {
            "__salt__" => artifacts.push(RestoreStorageArtifact::Salt),
            "__master_salt__" => artifacts.push(RestoreStorageArtifact::MasterSalt),
            "__master_verify__" => artifacts.push(RestoreStorageArtifact::MasterVerify),
            _ => {}
        }
    }
    artifacts
}
