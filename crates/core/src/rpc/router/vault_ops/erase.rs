//! Reviewed, authenticated storage deletion shared by native and RPC clients.
use base64::{engine::general_purpose, Engine as _};

use super::error::{VaultOpsError, VaultOpsResult};
use super::request::EraseExecuteRequest;
use crate::rpc::router::state::{EraseTokenState, RpcRouter};
use crate::rpc::types::RpcResponse;
use crate::storage::StorageArtifact;

impl RpcRouter {
    pub(in crate::rpc::router) fn handle_erase_confirm(
        &mut self,
        _data: &serde_json::Value,
    ) -> RpcResponse {
        match self.erase_confirm() {
            Ok(response) => RpcResponse::success(response),
            Err(error) => error.into_rpc_response(),
        }
    }

    fn erase_confirm(&mut self) -> VaultOpsResult<serde_json::Value> {
        let mut buf = [0u8; 16];
        if let Err(e) = getrandom::getrandom(&mut buf) {
            return Err(VaultOpsError::internal(format!(
                "Failed to generate erase token: {}",
                e
            )));
        }

        let token = general_purpose::URL_SAFE_NO_PAD.encode(buf);

        let expires_at = std::time::SystemTime::now()
            .checked_add(std::time::Duration::from_secs(5 * 60))
            .unwrap_or_else(std::time::SystemTime::now);

        self.erase_token = Some(EraseTokenState {
            token: token.clone(),
            expires_at,
        });

        let storage_paths = self.storage.erase_preview().storage_paths;

        Ok(serde_json::json!({
            "erase_token": token,
            "devices": [],
            "storage_paths": storage_paths,
        }))
    }

    pub(in crate::rpc::router) fn handle_erase_execute(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        self.handle_erase_execute_cancellable(data, &|| false, &mut || {})
    }

    /// Cancellation is honored before deletion starts. Once started, cleanup runs to completion.
    /// `on_started` marks the destructive boundary even if later cleanup fails.
    pub fn handle_erase_execute_cancellable(
        &mut self,
        data: &serde_json::Value,
        cancel_requested: &dyn Fn() -> bool,
        on_started: &mut dyn FnMut(),
    ) -> RpcResponse {
        if let Err(response) = self.ensure_storage_mutation_allowed() {
            return response;
        }
        match self.erase_execute(data, cancel_requested, on_started) {
            Ok(response) => RpcResponse::success(response),
            Err(error) => error.into_rpc_response(),
        }
    }

    fn erase_execute(
        &mut self,
        data: &serde_json::Value,
        cancel_requested: &dyn Fn() -> bool,
        on_started: &mut dyn FnMut(),
    ) -> VaultOpsResult<serde_json::Value> {
        let started = std::time::Instant::now();
        let request = EraseExecuteRequest::parse(data)?;

        let state = match self.erase_token.clone() {
            Some(s) => s,
            None => return Err(VaultOpsError::erase_token_expired()),
        };

        let now = std::time::SystemTime::now();
        if request.erase_token != state.token || now > state.expires_at {
            return Err(VaultOpsError::erase_token_expired());
        }

        if cancel_requested() {
            self.erase_token = None;
            return Err(VaultOpsError::erase_token_expired());
        }
        let verification = self.verify_master_password(request.master_password);
        // Password derivation can outlive both cancellation and the review deadline.
        if cancel_requested() || std::time::SystemTime::now() > state.expires_at {
            self.erase_token = None;
            return Err(VaultOpsError::erase_token_expired());
        }
        verification?;

        self.storage_mutation_guard.check()?;

        on_started();
        self.clear_credential_import();
        self.session = None;
        self.wallet_auth_runtime.spend_authorizations.clear();
        self.wallet_mnemonic_drafts.clear();
        self.clear_backup_local_session();
        self.clear_restore_local_session();
        self.clear_vault_export();
        self.storage_gc_scan_registry.clear();
        self.erase_token = None;
        self.event_queue.unsubscribe_catalog();
        self.event_queue.clear();
        self.set_master_key(None);
        self.credential_provider_runtime.clear_all();

        // Best-effort stats (ADR-004 attachments).
        let (erased_chunks, erased_bytes) = match self.storage.list_chunks() {
            Ok(chunks) => {
                let mut bytes: u64 = 0;
                for name in &chunks {
                    if let Ok(length) = self.storage.chunk_len(name) {
                        bytes = bytes.saturating_add(length);
                    }
                }
                (chunks.len() as u64, bytes)
            }
            Err(_) => (0, 0),
        };

        if let Err(e) = self.storage.erase_all() {
            return Err(VaultOpsError::internal(format!(
                "Failed to erase storage: {}",
                e
            )));
        }

        // Do not report success if administrative artifacts or the primary pepper remain.
        let mut cleanup_error = None;
        for artifact in [
            StorageArtifact::MasterSalt,
            StorageArtifact::MasterVerify,
            StorageArtifact::MasterVerifyRekeyTemp,
            StorageArtifact::MasterRekeyTransaction,
        ] {
            if let Err(error) = self.storage.remove_artifact(artifact) {
                cleanup_error.get_or_insert_with(|| VaultOpsError::internal(error.to_string()));
            }
        }
        if let Some(keystore) = self.keystore.as_ref() {
            if crate::crypto::StoragePepper::delete(keystore.as_ref()).is_err() {
                cleanup_error.get_or_insert_with(|| {
                    VaultOpsError::keystore_unavailable("Storage key cleanup did not finish")
                });
            }
        }
        if let Some(error) = cleanup_error {
            return Err(error);
        }

        let time_elapsed_ms = started.elapsed().as_millis() as u64;
        Ok(serde_json::json!({
            "erased_bytes": erased_bytes,
            "erased_chunks": erased_chunks,
            "time_elapsed_ms": time_elapsed_ms,
        }))
    }
}
