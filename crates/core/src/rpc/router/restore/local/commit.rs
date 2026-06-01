//! `restore:local:commit` handler and material-apply helpers.

use std::collections::HashSet;

use crate::durable_tx::DurableTxPhase;
use crate::rpc::{RpcResponse, RpcRouter};

use super::super::apply::{apply_restore_materials, RestoreArtifactWrite};
use super::super::error::{RestoreCommandError, RestoreResult};
use super::super::request::required_str;
use super::super::tx::{
    delete_restore_transaction, write_restore_transaction,
    RestoreStorageArtifact as RestoreArtifact, RestoreTransactionKind, RestoreTransactionPayload,
};
use super::cancel::rollback_restore_local;
use super::material::{
    decode_metadata_b64_for_commit, decode_metadata_for_commit, derive_backup_key_for_commit,
    RestoreLocalMaterialInput,
};
use super::models::{PortableMasterMaterial, RestoreCommitState, RestoreMetadata};

pub(in crate::rpc::router::restore) fn handle_restore_local_commit(
    router: &mut RpcRouter,
    data: &serde_json::Value,
) -> RpcResponse {
    match restore_local_commit(router, data) {
        Ok(result) => RpcResponse::success(result),
        Err(error) => error.into_rpc_response(),
    }
}

fn restore_local_commit(
    router: &mut RpcRouter,
    data: &serde_json::Value,
) -> RestoreResult<serde_json::Value> {
    let restore_id = required_str(data, "restore_id")?;
    let metadata_b64 = required_str(data, "metadata")?;

    router.expire_restore_local_if_idle();
    let commit_state = active_restore_commit_state(router, restore_id)?;

    let metadata_enc = match decode_metadata_b64_for_commit(metadata_b64) {
        Ok(bytes) => bytes,
        Err(error) => return rollback_with_error(router, &commit_state.chunk_names, error),
    };
    let material_input = RestoreLocalMaterialInput::from_data(&metadata_enc, data);

    let backup_material = match derive_backup_key_for_commit(router, &material_input) {
        Ok(resolved) => resolved,
        Err(error) => return rollback_with_error(router, &commit_state.chunk_names, error),
    };

    let decoded_metadata =
        match decode_metadata_for_commit(&material_input, &backup_material.key, &commit_state) {
            Ok(decoded) => decoded,
            Err(error) => return rollback_with_error(router, &commit_state.chunk_names, error),
        };
    debug_assert_eq!(decoded_metadata.version, 2);
    debug_assert_eq!(decoded_metadata.chunk_count, commit_state.restored_chunks);
    let metadata = decoded_metadata.restore_metadata;
    let portable_master = backup_material.portable_master;

    let mut restore_tx = RestoreTransactionPayload::new(
        RestoreTransactionKind::Local,
        restore_id.to_string(),
        commit_state.chunk_names.iter().cloned(),
        restore_artifacts(portable_master.as_ref().is_some()),
    );
    if let Err(error) =
        write_restore_transaction(&router.storage, DurableTxPhase::Committing, &restore_tx)
    {
        return rollback_with_error(
            router,
            &commit_state.chunk_names,
            RestoreCommandError::failed_to_write_restore_transaction(error),
        );
    }

    if let Err(error) = apply_restore_commit(
        router,
        &metadata,
        &backup_material.key,
        portable_master.as_ref(),
        &mut restore_tx,
    ) {
        return rollback_with_error(router, &commit_state.chunk_names, error);
    }

    if let Err(error) = delete_restore_transaction(&router.storage) {
        return Err(RestoreCommandError::failed_to_clear_restore_transaction(
            error,
        ));
    }
    router
        .finish_restore_local_session(restore_id)
        .map_err(RestoreCommandError::from)?;
    Ok(serde_json::json!({
        "restored_chunks": commit_state.restored_chunks,
        "warnings": [],
    }))
}

fn active_restore_commit_state(
    router: &RpcRouter,
    restore_id: &str,
) -> RestoreResult<RestoreCommitState> {
    let session = router
        .restore_local_session(restore_id)
        .map_err(RestoreCommandError::from)?;
    Ok(RestoreCommitState {
        restored_chunks: session.received.len() as u64,
        total_chunks: session.total_chunks,
        chunk_names: session.chunk_names.clone(),
    })
}

fn rollback_with_error<T>(
    router: &mut RpcRouter,
    chunk_names: &HashSet<String>,
    error: RestoreCommandError,
) -> RestoreResult<T> {
    rollback_restore_local(router, chunk_names);
    Err(error)
}

fn apply_restore_commit(
    router: &mut RpcRouter,
    metadata: &RestoreMetadata,
    backup_key: &[u8; 32],
    portable_master: Option<&PortableMasterMaterial>,
    restore_tx: &mut RestoreTransactionPayload,
) -> RestoreResult<()> {
    let storage_pepper =
        crate::crypto::StoragePepper::unwrap_from_backup(&metadata.pepper_wrapped, backup_key)
            .map_err(|_| RestoreCommandError::storage_pepper_invalid("Invalid metadata"))?;
    let artifacts = restore_artifact_writes(router, metadata, portable_master)?;
    apply_restore_materials(
        router,
        restore_tx,
        Vec::new(),
        artifacts,
        storage_pepper,
        "restore-local-commit",
    )
    .map(|_| ())
}

fn restore_artifact_writes(
    router: &RpcRouter,
    metadata: &RestoreMetadata,
    portable_master: Option<&PortableMasterMaterial>,
) -> RestoreResult<Vec<RestoreArtifactWrite>> {
    let mut artifacts = Vec::new();
    if let Some(portable_master) = portable_master {
        artifacts.push(RestoreArtifactWrite {
            artifact: RestoreArtifact::MasterSalt,
            bytes: portable_master.master_salt.to_vec(),
            error_label: "master.salt",
        });
        artifacts.push(RestoreArtifactWrite {
            artifact: RestoreArtifact::MasterVerify,
            bytes: portable_master.master_verify.to_vec(),
            error_label: "master.verify",
        });
    }
    artifacts.push(RestoreArtifactWrite {
        artifact: RestoreArtifact::Salt,
        bytes: metadata.vault_salt.clone(),
        error_label: "salt",
    });
    artifacts.push(RestoreArtifactWrite {
        artifact: RestoreArtifact::FormatVersion,
        bytes: storage_format_bytes(router, metadata.storage_format_v)?,
        error_label: "format.version",
    });
    Ok(artifacts)
}

fn storage_format_bytes(router: &RpcRouter, storage_format_v: u64) -> RestoreResult<Vec<u8>> {
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0);
    let mut format_json: serde_json::Value = match router
        .storage
        .read_artifact(RestoreArtifact::FormatVersion.storage_artifact())
        .ok()
        .flatten()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
    {
        Some(value) => value,
        None => serde_json::json!({
            "v": storage_format_v,
            "format": "sharded",
            "chunk_size": crate::types::DEFAULT_CHUNK_SIZE,
            "created_at": now_ms,
            "migration_applied": serde_json::Value::Null,
        }),
    };
    if let Some(object) = format_json.as_object_mut() {
        object.insert("v".to_string(), serde_json::json!(storage_format_v));
        if storage_format_v >= 2 {
            object.insert("kdf".to_string(), serde_json::json!(2));
            object.insert("pepper".to_string(), serde_json::json!(true));
        } else {
            object.remove("kdf");
            object.remove("pepper");
        }
        object
            .entry("created_at".to_string())
            .or_insert_with(|| serde_json::json!(now_ms));
    }

    let bytes = serde_json::to_vec(&format_json).map_err(|error| {
        RestoreCommandError::internal(format!("Failed to write format.version: {}", error))
    })?;
    Ok(bytes)
}

fn restore_artifacts(include_master: bool) -> Vec<RestoreArtifact> {
    let mut artifacts = vec![RestoreArtifact::Salt, RestoreArtifact::FormatVersion];
    if include_master {
        artifacts.push(RestoreArtifact::MasterSalt);
        artifacts.push(RestoreArtifact::MasterVerify);
    }
    artifacts
}
