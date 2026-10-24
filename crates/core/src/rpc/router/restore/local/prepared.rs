//! Review without publishing backup data, followed by a consuming explicit restore commit.
mod input;

pub use input::{LocalRestoreArtifact, LocalRestoreInput, MAX_RESTORE_APPEND_BYTES};

use std::io::Seek;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Value};
use zeroize::Zeroizing;

use crate::rpc::router::backup_pack::BackupChunkManifest;
use crate::rpc::{RpcInputStream, RpcResponse, RpcRouter};

use super::super::error::{RestoreCommandError, RestoreResult};
use super::validation::{
    validate_restore_payload, RestorePayloadValidationRequest, RestoreValidationRequestError,
};

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct LocalRestorePreview {
    pub version: u64,
    pub chunk_count: u64,
    pub byte_count: u64,
}

/// This source cannot be appended to or replaced after review. Its password remains
/// transient Rust state and is cleared on drop. The runtime must enforce generation,
/// cancellation, expiry and explicit confirmation before consuming it.
pub struct PreparedLocalRestore {
    payload: Value,
    pack: std::fs::File,
    password: Zeroizing<String>,
    preview: LocalRestorePreview,
}

impl PreparedLocalRestore {
    pub fn preview(&self) -> &LocalRestorePreview {
        &self.preview
    }
}

impl RpcRouter {
    pub fn prepare_local_restore(
        &mut self,
        mut input: LocalRestoreInput,
        password: String,
        cancel_requested: &dyn Fn() -> bool,
    ) -> Result<PreparedLocalRestore, RpcResponse> {
        self.ensure_storage_mutation_allowed()?;
        let password = Zeroizing::new(password);
        let result = self.with_transient_master(password.to_string(), |router| {
            prepare_target(router, cancel_requested)?;
            let manifest: BackupChunkManifest = serde_json::from_slice(&input.manifest)
                .map_err(|_| RestoreCommandError::invalid_backup("Invalid chunks.manifest.json"))?;
            manifest
                .validate()
                .map_err(RestoreCommandError::invalid_backup)?;
            if manifest.total_size != input.pack_size
                || input.pack.metadata().map_err(input::io_error)?.len() != input.pack_size
            {
                return Err(RestoreCommandError::invalid_backup(
                    "Backup pack size does not match manifest",
                ));
            }
            if input.master_salt.is_some() != input.master_verify.is_some() {
                return Err(RestoreCommandError::invalid_backup(
                    "Backup master material must include both files or neither",
                ));
            }
            let mut payload = json!({
                "metadata": STANDARD.encode(&input.metadata),
                "manifest": manifest,
            });
            // Preserve absence for the shared legacy fallback. Present empty material remains
            // present and is rejected by the ordinary source-material validation.
            if let Some(salt) = &input.master_salt {
                payload["master_salt"] = json!(STANDARD.encode(salt));
            }
            if let Some(verify) = &input.master_verify {
                payload["master_verify"] = json!(STANDARD.encode(verify));
            }
            let request = RestorePayloadValidationRequest::from_data(&payload).map_err(
                |error| match error {
                    RestoreValidationRequestError::Command(error) => error,
                    RestoreValidationRequestError::Report(report) => {
                        RestoreCommandError::invalid_backup(report.warnings.join("; "))
                    }
                },
            )?;
            let report = validate_restore_payload(router, request);
            if !report.valid {
                return Err(RestoreCommandError::invalid_backup(
                    report.warnings.join("; "),
                ));
            }
            check_cancelled(cancel_requested)?;
            input.pack.rewind().map_err(input::io_error)?;
            Ok((
                payload,
                LocalRestorePreview {
                    version: report.version,
                    chunk_count: report.chunk_count,
                    byte_count: input.pack_size,
                },
            ))
        });
        let (payload, preview) = result.map_err(RestoreCommandError::into_rpc_response)?;
        Ok(PreparedLocalRestore {
            payload,
            pack: input.pack,
            password,
            preview,
        })
    }

    /// Consumes one reviewed source. Its backup data is published only by this explicit call.
    pub fn commit_local_restore(
        &mut self,
        mut prepared: PreparedLocalRestore,
        cancel_requested: &dyn Fn() -> bool,
    ) -> Result<Value, RpcResponse> {
        self.ensure_storage_mutation_allowed()?;
        let password = std::mem::take(&mut *prepared.password);
        self.with_transient_master(password, |router| {
            commit(router, prepared, cancel_requested)
        })
        .map_err(RestoreCommandError::into_rpc_response)
    }
}

fn check_cancelled(cancel_requested: &dyn Fn() -> bool) -> RestoreResult<()> {
    if cancel_requested() {
        return Err(RestoreCommandError::cancelled());
    }
    Ok(())
}

// Recovery predates accepting the source. It may clean a previous interrupted
// transaction, but reviewing a new backup never writes its data to the target.
fn prepare_target(
    router: &mut RpcRouter,
    cancel_requested: &dyn Fn() -> bool,
) -> RestoreResult<()> {
    check_cancelled(cancel_requested)?;
    if router.restore_local_is_active() {
        return Err(RestoreCommandError::backup_already_in_progress(
            "Restore already in progress",
        ));
    }
    router
        .recover_before_restore_entry()
        .map_err(RestoreCommandError::from)?;
    super::session::require_blank_storage_for_restore(router)?;
    check_cancelled(cancel_requested)
}

fn commit(
    router: &mut RpcRouter,
    prepared: PreparedLocalRestore,
    cancel_requested: &dyn Fn() -> bool,
) -> RestoreResult<Value> {
    prepare_target(router, cancel_requested)?;
    let restore_id = super::session::start_local_restore(router)?;
    let mut payload = prepared.payload;
    payload["restore_id"] = json!(restore_id);
    let result = (|| {
        super::session::restore_local_upload_pack(
            router,
            &payload,
            Some(RpcInputStream::new(Box::new(prepared.pack))),
            cancel_requested,
        )?;
        check_cancelled(cancel_requested)
    })();
    if let Err(error) = result {
        let cleanup = super::super::tx::rollback_restore_transaction_marker(router);
        // This consuming operation has ended even if disk cleanup needs another attempt.
        router.clear_restore_local_session();
        cleanup.map_err(|failure| {
            RestoreCommandError::internal(format!("Restore cleanup failed: {failure}"))
        })?;
        return Err(error);
    }
    // Commit owns rollback/recovery once its durable transaction enters committing.
    let result = super::commit::restore_local_commit(router, &payload);
    router.clear_restore_local_session();
    result
}
