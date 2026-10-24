//! Vault lifecycle operations — unlock, lock, master setup, erase

mod erase;
mod error;
mod request;

use crate::rpc::types::{
    RpcResponse, VaultRekeyResponse, VaultRepairApplyResponse, VaultRepairDiagnosisResponse,
    VaultUnlockResponse,
};
use crate::vault::{Vault, VaultRekeyProgress, VaultRekeyRequest};

use super::state::RpcRouter;
use error::{VaultOpsError, VaultOpsResult};
use request::{
    AdminEraseRequest, MasterSetupRequest, VaultRekeyRpcRequest, VaultRepairApplyRequest,
    VaultRepairDiagnoseRequest, VaultUnlockRequest,
};

impl RpcRouter {
    /// Handle vault:unlock command
    pub(super) fn handle_vault_unlock(&mut self, data: &serde_json::Value) -> RpcResponse {
        match self.vault_unlock(data) {
            Ok(response) => RpcResponse::success(response),
            Err(error) => error.into_rpc_response(),
        }
    }

    fn vault_unlock(&mut self, data: &serde_json::Value) -> VaultOpsResult<VaultUnlockResponse> {
        self.storage_mutation_guard.check()?;
        if self.session.is_some() {
            return Err(VaultOpsError::already_unlocked());
        }
        self.derivative_index_state.invalidate();

        let request = VaultUnlockRequest::parse(data)?;

        let keystore = self.keystore.as_ref().map(|k| k.as_ref());
        let outcome =
            Vault::unlock_with_keystore_outcome(&self.storage, request.password, keystore)
                .map_err(VaultOpsError::from_unlock_error)?;
        self.clear_credential_import();
        self.session = Some(outcome.session);
        self.recover_after_vault_unlock()?;
        self.derivative_index_state.invalidate();
        self.credential_provider_runtime.clear_all();
        Ok(VaultUnlockResponse {
            repair: outcome.repair,
        })
    }

    pub(super) fn handle_vault_repair_diagnose(&mut self, data: &serde_json::Value) -> RpcResponse {
        match self.vault_repair_diagnose(data) {
            Ok(response) => RpcResponse::success(response),
            Err(error) => error.into_rpc_response(),
        }
    }

    fn vault_repair_diagnose(
        &mut self,
        data: &serde_json::Value,
    ) -> VaultOpsResult<VaultRepairDiagnosisResponse> {
        if self.session.is_some() {
            return Err(VaultOpsError::already_unlocked());
        }

        let request = VaultRepairDiagnoseRequest::parse(data)?;
        let keystore = self.keystore.as_ref().map(|k| k.as_ref());
        let diagnosis =
            Vault::diagnose_catalog_repair_with_keystore(&self.storage, request.password, keystore)
                .map_err(VaultOpsError::from_unlock_error)?;
        Ok(VaultRepairDiagnosisResponse::from(diagnosis))
    }

    pub(super) fn handle_vault_repair_apply(&mut self, data: &serde_json::Value) -> RpcResponse {
        match self.vault_repair_apply(data) {
            Ok(response) => RpcResponse::success(response),
            Err(error) => error.into_rpc_response(),
        }
    }

    fn vault_repair_apply(
        &mut self,
        data: &serde_json::Value,
    ) -> VaultOpsResult<VaultRepairApplyResponse> {
        if self.session.is_some() {
            return Err(VaultOpsError::already_unlocked());
        }
        self.derivative_index_state.invalidate();

        let request = VaultRepairApplyRequest::parse(data)?;
        let keystore = self.keystore.as_ref().map(|k| k.as_ref());
        let outcome = Vault::apply_catalog_repair_with_keystore(
            &self.storage,
            request.password,
            keystore,
            request.repair_id,
            request.allow_lossy,
        )
        .map_err(VaultOpsError::from_unlock_error)?;
        let repair = outcome.repair.ok_or_else(|| {
            VaultOpsError::internal("repair apply completed without repair summary")
        })?;

        self.clear_credential_import();
        self.session = Some(outcome.session);
        self.recover_after_vault_unlock()?;
        self.derivative_index_state.invalidate();
        self.credential_provider_runtime.clear_all();
        Ok(VaultRepairApplyResponse {
            unlocked: true,
            repair,
        })
    }

    /// Handle vault:lock command
    pub(super) fn handle_vault_lock(&mut self) -> RpcResponse {
        match self.vault_lock() {
            Ok(()) => RpcResponse::success(serde_json::Value::Null),
            Err(error) => error.into_rpc_response(),
        }
    }

    fn vault_lock(&mut self) -> VaultOpsResult<()> {
        self.erase_token = None;
        self.clear_credential_import();
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
            self.wallet_auth_runtime.spend_authorizations.clear();
            self.wallet_mnemonic_drafts.clear();

            // Push event (ADR-004 attachments): emitted when push pipeline is enabled.
            self.event_queue.push_vault_locked("manual");
        }
        self.credential_provider_runtime.clear_all();
        self.clear_vault_export();
        if self.session.is_none() {
            self.wallet_auth_runtime.spend_authorizations.clear();
            self.wallet_mnemonic_drafts.clear();
        }
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
        self.storage_mutation_guard.check()?;
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
        self.wallet_auth_runtime.spend_authorizations.clear();
        self.wallet_mnemonic_drafts.clear();
        self.clear_vault_export();
        self.clear_credential_import();
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

    pub(super) fn handle_admin_erase_v2(&mut self, data: &serde_json::Value) -> RpcResponse {
        match self.admin_erase_v2(data) {
            Ok(()) => RpcResponse::success(serde_json::Value::Null),
            Err(error) => error.into_rpc_response(),
        }
    }

    fn admin_erase_v2(&mut self, data: &serde_json::Value) -> VaultOpsResult<()> {
        self.storage_mutation_guard.check()?;
        let request = AdminEraseRequest::parse(data)?;
        if !request.confirm {
            return Err(VaultOpsError::erase_no_confirm());
        }

        self.verify_master_password(request.master_password)?;

        self.storage_mutation_guard.check()?;

        self.clear_credential_import();
        self.session = None;
        self.wallet_auth_runtime.spend_authorizations.clear();
        self.wallet_mnemonic_drafts.clear();

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
