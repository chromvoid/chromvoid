//! Encrypted load/save of `OtpSecrets` chunks.

use serde::{Deserialize, Serialize};

use crate::durable_tx::DurableTxStore;
use crate::rpc::types::OtpSecrets;
use crate::storage::Storage;
use crate::types::KEY_SIZE;

use super::{OtpSidecarError, OtpSidecarResult};

const OTP_SIDECAR_TX_VERSION: u8 = 1;
const OTP_SIDECAR_TX_KIND: &str = "otp-sidecar";
const OTP_SIDECAR_TX_MARKER_CONTEXT: &[u8] = b"otp-sidecar-tx:v1";

type OtpBackupChunkName = Option<String>;

pub(crate) fn load_otp_secrets(
    vault_key: &[u8; 32],
    node_id: u64,
    storage: &Storage,
) -> Option<OtpSecrets> {
    let chunk_name = crate::crypto::otp_chunk_name(vault_key, node_id);
    let encrypted = storage.read_chunk(&chunk_name).ok()?;
    let decrypted = crate::crypto::decrypt(&encrypted, vault_key, chunk_name.as_bytes()).ok()?;
    serde_json::from_slice(&decrypted).ok()
}

pub(crate) fn save_otp_secrets(
    vault_key: &[u8; 32],
    node_id: u64,
    secrets: &OtpSecrets,
    storage: &Storage,
) -> OtpSidecarResult<()> {
    write_otp_sidecar_atomic(vault_key, node_id, secrets, storage)
}

pub(crate) fn write_otp_sidecar_atomic(
    vault_key: &[u8; 32],
    node_id: u64,
    secrets: &OtpSecrets,
    storage: &Storage,
) -> OtpSidecarResult<()> {
    let chunk_name = crate::crypto::otp_chunk_name(vault_key, node_id);
    let data = serde_json::to_vec(secrets).map_err(|e| OtpSidecarError::internal(e.to_string()))?;
    let encrypted = crate::crypto::encrypt(&data, vault_key, chunk_name.as_bytes())
        .map_err(|e| OtpSidecarError::internal(e.to_string()))?;
    let backup_name = backup_existing_otp_chunk(storage, vault_key, node_id, &chunk_name)?;
    let payload = OtpSidecarTransaction {
        version: OTP_SIDECAR_TX_VERSION,
        node_id,
        operation: OtpSidecarOperation::Write,
        canonical_name: chunk_name.clone(),
        backup_name,
        new_hash: Some(crate::crypto::sha256_hex(&encrypted)),
    };
    let store = otp_tx_store(storage, vault_key);
    if let Err(error) = store.write_staging(tx_id(&payload), &payload) {
        cleanup_otp_backup(storage, &payload);
        return Err(OtpSidecarError::internal(format!(
            "OTP sidecar transaction write failed: {error}"
        )));
    }
    if let Err(error) = store.write_committing(tx_id(&payload), &payload) {
        let _ = rollback_otp_sidecar(storage, &payload);
        let _ = store.delete();
        return Err(OtpSidecarError::internal(format!(
            "OTP sidecar transaction commit failed: {error}"
        )));
    }
    if let Err(error) = write_canonical_otp_chunk(storage, &chunk_name, &encrypted) {
        let _ = rollback_otp_sidecar(storage, &payload);
        let _ = store.delete();
        return Err(OtpSidecarError::internal(format!(
            "Failed to save OTP secret: {}",
            error.into_message()
        )));
    }
    cleanup_otp_sidecar_transaction(storage, vault_key, &payload)
}

pub(crate) fn delete_otp_sidecar_atomic(
    vault_key: &[u8; 32],
    node_id: u64,
    storage: &Storage,
) -> OtpSidecarResult<()> {
    let chunk_name = crate::crypto::otp_chunk_name(vault_key, node_id);
    if !storage
        .chunk_exists(&chunk_name)
        .map_err(|error| OtpSidecarError::internal(error.to_string()))?
    {
        return Ok(());
    }

    let backup_name = backup_existing_otp_chunk(storage, vault_key, node_id, &chunk_name)?;
    let payload = OtpSidecarTransaction {
        version: OTP_SIDECAR_TX_VERSION,
        node_id,
        operation: OtpSidecarOperation::Delete,
        canonical_name: chunk_name.clone(),
        backup_name,
        new_hash: None,
    };
    let store = otp_tx_store(storage, vault_key);
    if let Err(error) = store.write_staging(tx_id(&payload), &payload) {
        cleanup_otp_backup(storage, &payload);
        return Err(OtpSidecarError::internal(format!(
            "OTP sidecar transaction write failed: {error}"
        )));
    }
    if let Err(error) = store.write_committing(tx_id(&payload), &payload) {
        let _ = rollback_otp_sidecar(storage, &payload);
        let _ = store.delete();
        return Err(OtpSidecarError::internal(format!(
            "OTP sidecar transaction commit failed: {error}"
        )));
    }

    storage.delete_chunk(&chunk_name).map_err(|error| {
        OtpSidecarError::internal(format!("Failed to remove OTP secret: {error}"))
    })?;
    storage.sync().map_err(|error| {
        OtpSidecarError::internal(format!("Failed to sync OTP secret removal: {error}"))
    })?;
    cleanup_otp_sidecar_transaction(storage, vault_key, &payload)
}

pub(crate) fn recover_otp_sidecar_transaction(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
) -> crate::error::Result<()> {
    otp_tx_store(storage, vault_key).recover_participant()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum OtpSidecarOperation {
    Write,
    Delete,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OtpSidecarTransaction {
    version: u8,
    node_id: u64,
    operation: OtpSidecarOperation,
    canonical_name: String,
    backup_name: Option<String>,
    new_hash: Option<String>,
}

struct OtpSidecarParticipant;

impl crate::durable_tx::DurableTxParticipant for OtpSidecarParticipant {
    const KIND: &'static str = OTP_SIDECAR_TX_KIND;
    const VERSION: u8 = OTP_SIDECAR_TX_VERSION;
    type Payload = OtpSidecarTransaction;

    fn marker_context(&self) -> &'static [u8] {
        OTP_SIDECAR_TX_MARKER_CONTEXT
    }

    fn marker_name(&self, vault_key: &[u8; KEY_SIZE]) -> String {
        otp_sidecar_tx_marker_name(vault_key)
    }

    fn validate_payload(&self, payload: &Self::Payload) -> bool {
        payload.version == OTP_SIDECAR_TX_VERSION
            && payload.node_id > 0
            && !payload.canonical_name.is_empty()
    }

    fn rollback_staging(
        &self,
        storage: &Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        record: &crate::durable_tx::DurableTxRecord<Self::Payload>,
    ) -> crate::error::Result<()> {
        cleanup_otp_backup(storage, &record.payload);
        storage.sync()
    }

    fn recover_committing(
        &self,
        storage: &Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        record: &crate::durable_tx::DurableTxRecord<Self::Payload>,
    ) -> crate::error::Result<()> {
        match record.payload.operation {
            OtpSidecarOperation::Write => recover_otp_write(storage, &record.payload),
            OtpSidecarOperation::Delete => {
                let _ = storage.delete_chunk(&record.payload.canonical_name);
                storage.sync()
            }
        }
    }

    fn cleanup(
        &self,
        storage: &Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        record: &crate::durable_tx::DurableTxRecord<Self::Payload>,
    ) -> crate::error::Result<()> {
        cleanup_otp_backup(storage, &record.payload);
        storage.sync()
    }
}

fn otp_tx_store<'a>(
    storage: &'a Storage,
    vault_key: &'a [u8; KEY_SIZE],
) -> DurableTxStore<'a, OtpSidecarParticipant> {
    DurableTxStore::new(storage, vault_key, OtpSidecarParticipant)
}

fn backup_existing_otp_chunk(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    node_id: u64,
    canonical_name: &str,
) -> OtpSidecarResult<OtpBackupChunkName> {
    if !storage
        .chunk_exists(canonical_name)
        .map_err(|error| OtpSidecarError::internal(error.to_string()))?
    {
        return Ok(None);
    }
    let bytes = storage
        .read_chunk(canonical_name)
        .map_err(|error| OtpSidecarError::internal(error.to_string()))?;
    let backup_name = otp_backup_chunk_name(vault_key, node_id, operation_id());
    let mut batch = storage.begin_chunk_write_batch("otp-sidecar-backup");
    if let Err(error) = batch.write_chunk(backup_name.clone(), &bytes) {
        batch.rollback_temps();
        return Err(OtpSidecarError::internal(error.to_string()));
    }
    if let Err(error) = batch.commit() {
        let committed = batch.written_names().to_vec();
        batch.rollback_temps();
        for name in committed {
            let _ = storage.delete_chunk(&name);
        }
        return Err(OtpSidecarError::internal(error.to_string()));
    }
    Ok(Some(backup_name))
}

fn write_canonical_otp_chunk(
    storage: &Storage,
    chunk_name: &str,
    encrypted: &[u8],
) -> OtpSidecarResult<()> {
    let mut batch = storage.begin_chunk_write_batch("otp-sidecar-write");
    if let Err(error) = batch.write_chunk(chunk_name.to_string(), encrypted) {
        batch.rollback_temps();
        return Err(OtpSidecarError::internal(error.to_string()));
    }
    if let Err(error) = batch.commit() {
        let committed = batch.written_names().to_vec();
        batch.rollback_temps();
        for name in committed {
            let _ = storage.delete_chunk(&name);
        }
        return Err(OtpSidecarError::internal(error.to_string()));
    }
    Ok(())
}

fn recover_otp_write(
    storage: &Storage,
    payload: &OtpSidecarTransaction,
) -> crate::error::Result<()> {
    let canonical = storage.read_chunk(&payload.canonical_name).ok();
    let has_new = canonical
        .as_deref()
        .map(crate::crypto::sha256_hex)
        .as_ref()
        .zip(payload.new_hash.as_ref())
        .map(|(actual, expected)| actual == expected)
        .unwrap_or(false);
    if has_new {
        return Ok(());
    }
    rollback_otp_sidecar(storage, payload)
}

fn rollback_otp_sidecar(
    storage: &Storage,
    payload: &OtpSidecarTransaction,
) -> crate::error::Result<()> {
    if let Some(backup_name) = &payload.backup_name {
        let bytes = storage.read_chunk(backup_name)?;
        storage.write_chunk_atomic(&payload.canonical_name, &bytes)?;
    } else {
        let _ = storage.delete_chunk(&payload.canonical_name);
    }
    storage.sync()
}

fn cleanup_otp_sidecar_transaction(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    payload: &OtpSidecarTransaction,
) -> OtpSidecarResult<()> {
    otp_tx_store(storage, vault_key)
        .delete()
        .map_err(|error| OtpSidecarError::internal(error.to_string()))?;
    cleanup_otp_backup(storage, payload);
    storage
        .sync()
        .map_err(|error| OtpSidecarError::internal(error.to_string()))
}

fn cleanup_otp_backup(storage: &Storage, payload: &OtpSidecarTransaction) {
    if let Some(backup_name) = &payload.backup_name {
        let _ = storage.delete_chunk(backup_name);
    }
}

fn otp_sidecar_tx_marker_name(vault_key: &[u8; KEY_SIZE]) -> String {
    crate::crypto::chunk_name_u64(vault_key, OTP_SIDECAR_TX_MARKER_CONTEXT, 0)
}

fn otp_backup_chunk_name(vault_key: &[u8; KEY_SIZE], node_id: u64, operation_id: u128) -> String {
    let context = format!("otp-sidecar-backup:{node_id}:{operation_id}");
    crate::crypto::chunk_name_u64(vault_key, context.as_bytes(), 0)
}

fn tx_id(payload: &OtpSidecarTransaction) -> String {
    format!("otp-sidecar-{}-{}", payload.node_id, operation_id())
}

fn operation_id() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0)
}
