use std::time::Instant;

use zeroize::Zeroizing;

use crate::crypto::keystore::Keystore;
use crate::durable_tx::DurableTxPhase;
use crate::error::{Error, Result};
use crate::storage::Storage;
use crate::types::KEY_SIZE;
use crate::vault::VaultSession;

use super::catalog_io::{validate_rekeyed_catalog, write_full_catalog_for_rekey};
use super::chunks::{copy_chunk, delete_chunks, rollback_staged_chunks};
use super::manifest::{build_manifest, RekeyManifest};
use super::password::{
    constant_time_eq, derive_session_key, reject_existing_target_vault, validate_new_password,
};
use super::transaction::{
    delete_rekey_marker, load_rekey_marker, recover_transaction_record, write_rekey_marker,
    RekeyTransaction, REKEY_TX_VERSION,
};
use super::types::{VaultRekeyProgress, VaultRekeyRequest, VaultRekeyResult};

impl VaultSession {
    pub fn rekey_password(
        &mut self,
        storage: &Storage,
        keystore: &dyn Keystore,
        request: VaultRekeyRequest,
        cancel_requested: &dyn Fn() -> bool,
        progress: &mut dyn FnMut(VaultRekeyProgress),
    ) -> Result<VaultRekeyResult> {
        let started = Instant::now();
        emit_progress(progress, "preparing", 0, 0, true);
        self.recover_rekey_transaction(storage)?;

        validate_new_password(&request.current_password, &request.new_password)?;
        let old_key = derive_session_key(storage, keystore, &request.current_password)?;
        if !constant_time_eq(&old_key, self.vault_key()) {
            return Err(Error::RekeyInvalidCurrentPassword);
        }
        let new_key = derive_session_key(storage, keystore, &request.new_password)?;
        if constant_time_eq(&new_key, self.vault_key()) {
            return Err(Error::RekeyPasswordPolicy(
                "new vault password must derive a different key".to_string(),
            ));
        }
        reject_existing_target_vault(storage, &new_key)?;

        let _ = self.save(storage)?;

        emit_progress(progress, "scanning", 0, 0, true);
        let manifest = build_manifest(storage, self.catalog().root(), &old_key, &new_key)?;
        let total_chunks = manifest.durable_pair_count();
        let old_chunks = manifest.old_durable_chunks();
        let new_chunks = manifest.new_durable_chunks();
        let derivative_chunks = super::chunks::unique(manifest.derivative_chunks.clone());

        write_rekey_marker(
            storage,
            &RekeyTransaction {
                version: REKEY_TX_VERSION,
                phase: DurableTxPhase::Staging,
                old_chunks: old_chunks.clone(),
                new_chunks: new_chunks.clone(),
                derivative_chunks: derivative_chunks.clone(),
            },
        )?;

        let migration_result = self.write_new_chunks(
            storage,
            &new_key,
            &manifest,
            cancel_requested,
            progress,
            total_chunks,
        );
        if let Err(error) = migration_result {
            rollback_staged_chunks(storage, &new_chunks);
            let _ = delete_rekey_marker(storage);
            return Err(error);
        }

        emit_progress(progress, "validating", total_chunks, total_chunks, true);
        validate_rekeyed_catalog(storage, self, &new_key)?;

        write_rekey_marker(
            storage,
            &RekeyTransaction {
                version: REKEY_TX_VERSION,
                phase: DurableTxPhase::Committing,
                old_chunks: old_chunks.clone(),
                new_chunks: new_chunks.clone(),
                derivative_chunks: derivative_chunks.clone(),
            },
        )?;

        emit_progress(progress, "committing", total_chunks, total_chunks, false);
        self.vault_key = new_key;
        self.pending_deltas.clear();
        self.dirty = false;
        self.decrypted_chunk_cache.clear("vault_rekey");

        emit_progress(progress, "cleaning", total_chunks, total_chunks, false);
        let deleted_old_chunks = delete_chunks(storage, &old_chunks)?;
        let deleted_derivative_chunks = delete_chunks(storage, &derivative_chunks)?;
        delete_rekey_marker(storage)?;
        storage.sync()?;

        let known_after = storage.list_chunks()?.len();
        let known_active = new_chunks.len();
        let preserved_unknown_chunks = known_after.saturating_sub(known_active) as u64;

        emit_progress(progress, "completed", total_chunks, total_chunks, false);
        Ok(VaultRekeyResult {
            migrated_chunks: total_chunks,
            deleted_old_chunks,
            preserved_unknown_chunks,
            deleted_derivative_chunks,
            duration_ms: started.elapsed().as_millis() as u64,
            backup_recommended: true,
        })
    }

    pub fn recover_rekey_transaction(&mut self, storage: &Storage) -> Result<()> {
        let Some(transaction) = load_rekey_marker(storage)? else {
            return Ok(());
        };

        if transaction.version != REKEY_TX_VERSION {
            return Ok(());
        }

        recover_transaction_record(storage, transaction)
    }

    fn write_new_chunks(
        &mut self,
        storage: &Storage,
        new_key: &Zeroizing<[u8; KEY_SIZE]>,
        manifest: &RekeyManifest,
        cancel_requested: &dyn Fn() -> bool,
        progress: &mut dyn FnMut(VaultRekeyProgress),
        total_chunks: u64,
    ) -> Result<()> {
        let mut processed = 0u64;
        check_cancel(cancel_requested)?;

        write_full_catalog_for_rekey(storage, new_key, self.catalog())?;
        processed = processed.saturating_add(manifest.new_catalog_chunks.len() as u64);
        emit_progress(progress, "writing", processed, total_chunks, true);
        check_cancel(cancel_requested)?;

        for pair in &manifest.blob_chunks {
            copy_chunk(storage, self.vault_key(), new_key, pair)?;
            processed = processed.saturating_add(1);
            emit_progress(progress, "writing", processed, total_chunks, true);
            check_cancel(cancel_requested)?;
        }

        for pair in &manifest.otp_chunks {
            copy_chunk(storage, self.vault_key(), new_key, pair)?;
            processed = processed.saturating_add(1);
            emit_progress(progress, "writing", processed, total_chunks, true);
            check_cancel(cancel_requested)?;
        }

        Ok(())
    }
}

fn check_cancel(cancel_requested: &dyn Fn() -> bool) -> Result<()> {
    if cancel_requested() {
        Err(Error::RekeyCancelled)
    } else {
        Ok(())
    }
}

fn emit_progress(
    progress: &mut dyn FnMut(VaultRekeyProgress),
    phase: &str,
    processed_chunks: u64,
    total_chunks: u64,
    can_cancel: bool,
) {
    progress(VaultRekeyProgress {
        phase: phase.to_string(),
        processed_chunks,
        total_chunks,
        can_cancel,
    });
}
