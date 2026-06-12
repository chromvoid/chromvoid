//! Vault lifecycle operations — unlock, lock, master setup, erase

mod error;
mod request;

use base64::{engine::general_purpose, Engine as _};

use crate::rpc::types::{RpcResponse, VaultRekeyResponse};
use crate::vault::{Vault, VaultRekeyProgress, VaultRekeyRequest};

use super::state::{EraseTokenState, RpcRouter};
use error::{VaultOpsError, VaultOpsResult};
use request::{
    AdminEraseRequest, EraseExecuteRequest, MasterSetupRequest, VaultRekeyRpcRequest,
    VaultUnlockRequest,
};

impl RpcRouter {
    /// Handle vault:unlock command
    pub(super) fn handle_vault_unlock(&mut self, data: &serde_json::Value) -> RpcResponse {
        match self.vault_unlock(data) {
            Ok(()) => RpcResponse::success(serde_json::Value::Null),
            Err(error) => error.into_rpc_response(),
        }
    }

    fn vault_unlock(&mut self, data: &serde_json::Value) -> VaultOpsResult<()> {
        if self.session.is_some() {
            return Err(VaultOpsError::already_unlocked());
        }
        self.derivative_index_state.invalidate();

        let request = VaultUnlockRequest::parse(data)?;

        let keystore = self.keystore.as_ref().map(|k| k.as_ref());
        let session = Vault::unlock_with_keystore(&self.storage, request.password, keystore)
            .map_err(VaultOpsError::from_unlock_error)?;
        self.session = Some(session);
        self.recover_after_vault_unlock()?;
        self.derivative_index_state.invalidate();
        self.credential_provider_runtime.clear_all();
        Ok(())
    }

    /// Handle vault:lock command
    pub(super) fn handle_vault_lock(&mut self) -> RpcResponse {
        match self.vault_lock() {
            Ok(()) => RpcResponse::success(serde_json::Value::Null),
            Err(error) => error.into_rpc_response(),
        }
    }

    fn vault_lock(&mut self) -> VaultOpsResult<()> {
        // ADR-004: vault:lock is idempotent.
        if let Some(session) = self.session.as_ref() {
            self.derivative_index_state
                .flush(&self.storage, session.vault_key())
                .map_err(|error| VaultOpsError::internal(error.to_string()))?;
        }
        if let Some(session) = self.session.as_mut() {
            session
                .lock(Some(&self.storage))
                .map_err(|e| VaultOpsError::internal(e.to_string()))?;
            self.session = None;
            self.derivative_index_state.invalidate();

            // Push event (ADR-004 attachments): emitted when push pipeline is enabled.
            self.event_queue.push_vault_locked("manual");
        }
        self.credential_provider_runtime.clear_all();
        self.clear_vault_export();
        Ok(())
    }

    pub fn handle_vault_rekey(
        &mut self,
        data: &serde_json::Value,
        cancel_requested: &dyn Fn() -> bool,
        progress: &mut dyn FnMut(VaultRekeyProgress),
    ) -> RpcResponse {
        match self.vault_rekey(data, cancel_requested, progress) {
            Ok(response) => RpcResponse::success(response),
            Err(error) => error.into_rpc_response(),
        }
    }

    fn vault_rekey(
        &mut self,
        data: &serde_json::Value,
        cancel_requested: &dyn Fn() -> bool,
        progress: &mut dyn FnMut(VaultRekeyProgress),
    ) -> VaultOpsResult<VaultRekeyResponse> {
        let rpc_request = VaultRekeyRpcRequest::parse(data)?;

        let Some(session) = self.session.as_mut() else {
            return Err(VaultOpsError::vault_required());
        };
        let Some(keystore) = self.keystore.as_ref() else {
            return Err(VaultOpsError::keystore_unavailable(
                "Keystore unavailable: not configured",
            ));
        };

        let request =
            VaultRekeyRequest::new(rpc_request.current_password, rpc_request.new_password);
        let result = session
            .rekey_password(
                &self.storage,
                keystore.as_ref(),
                request,
                cancel_requested,
                progress,
            )
            .map_err(VaultOpsError::from_rekey_error)?;
        self.credential_provider_runtime.clear_all();
        self.clear_vault_export();
        Ok(VaultRekeyResponse {
            migrated_chunks: result.migrated_chunks,
            deleted_old_chunks: result.deleted_old_chunks,
            preserved_unknown_chunks: result.preserved_unknown_chunks,
            deleted_derivative_chunks: result.deleted_derivative_chunks,
            duration_ms: result.duration_ms,
            backup_recommended: result.backup_recommended,
        })
    }

    pub(super) fn handle_master_setup(&mut self, data: &serde_json::Value) -> RpcResponse {
        match self.master_setup(data) {
            Ok(response) => RpcResponse::success(response),
            Err(error) => error.into_rpc_response(),
        }
    }

    fn master_setup(&mut self, data: &serde_json::Value) -> VaultOpsResult<serde_json::Value> {
        self.recover_before_master_material_access()?;
        let request = MasterSetupRequest::parse(data)?;
        let outcome = self.ensure_master_setup(request.master_password)?;
        Ok(serde_json::json!({
            "created": outcome.created,
        }))
    }

    pub(super) fn handle_erase_confirm(&mut self, _data: &serde_json::Value) -> RpcResponse {
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

    pub(super) fn handle_erase_execute(&mut self, data: &serde_json::Value) -> RpcResponse {
        match self.erase_execute(data) {
            Ok(response) => RpcResponse::success(response),
            Err(error) => error.into_rpc_response(),
        }
    }

    fn erase_execute(&mut self, data: &serde_json::Value) -> VaultOpsResult<serde_json::Value> {
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

        self.verify_master_password(request.master_password)?;

        self.session = None;
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
                    if let Ok(b) = self.storage.read_chunk(name) {
                        bytes = bytes.saturating_add(b.len() as u64);
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

        // ADR-012: erase must remove master artifacts.
        self.remove_master_material_best_effort();

        // ADR-012: erase must remove portable pepper (best-effort).
        if let Some(keystore) = self.keystore.as_ref() {
            let _ = crate::crypto::StoragePepper::delete(keystore.as_ref());
        }

        let time_elapsed_ms = started.elapsed().as_millis() as u64;
        Ok(serde_json::json!({
            "erased_bytes": erased_bytes,
            "erased_chunks": erased_chunks,
            "time_elapsed_ms": time_elapsed_ms,
        }))
    }

    pub(super) fn handle_admin_erase_v2(&mut self, data: &serde_json::Value) -> RpcResponse {
        match self.admin_erase_v2(data) {
            Ok(()) => RpcResponse::success(serde_json::Value::Null),
            Err(error) => error.into_rpc_response(),
        }
    }

    fn admin_erase_v2(&mut self, data: &serde_json::Value) -> VaultOpsResult<()> {
        let request = AdminEraseRequest::parse(data)?;
        if !request.confirm {
            return Err(VaultOpsError::erase_no_confirm());
        }

        self.verify_master_password(request.master_password)?;

        self.session = None;

        if let Err(e) = self.storage.erase_all() {
            return Err(VaultOpsError::internal(format!(
                "Failed to erase storage: {}",
                e
            )));
        }

        // ADR-012: erase must remove master artifacts.
        self.remove_master_material_best_effort();

        // ADR-012: erase must remove portable pepper (best-effort).
        if let Some(keystore) = self.keystore.as_ref() {
            let _ = crate::crypto::StoragePepper::delete(keystore.as_ref());
        }

        Ok(())
    }
}
