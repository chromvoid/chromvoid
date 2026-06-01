//! Central recovery gates for durable router transactions.

use crate::error::ErrorCode;
use crate::rpc::types::RpcResponse;

use super::state::RpcRouter;

#[derive(Debug, Clone)]
pub(in crate::rpc::router) struct RecoveryError {
    message: String,
    code: Option<String>,
}

pub(in crate::rpc::router) type RecoveryResult<T> = Result<T, RecoveryError>;

impl RecoveryError {
    pub(in crate::rpc::router) fn new(message: impl Into<String>, code: Option<ErrorCode>) -> Self {
        Self {
            message: message.into(),
            code: code.map(String::from),
        }
    }

    pub(in crate::rpc::router) fn internal(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::InternalError))
    }

    pub(in crate::rpc::router) fn master_rekey_integrity_failed(
        message: impl Into<String>,
    ) -> Self {
        Self::new(message, Some(ErrorCode::MasterRekeyIntegrityFailed))
    }

    pub(in crate::rpc::router) fn restore_transaction_failed(
        message: impl std::fmt::Display,
    ) -> Self {
        Self::internal(format!("Failed to recover restore transaction: {message}"))
    }

    pub(in crate::rpc::router) fn message(&self) -> &str {
        &self.message
    }

    pub(in crate::rpc::router) fn code(&self) -> Option<&str> {
        self.code.as_deref()
    }

    pub(in crate::rpc::router) fn into_parts(self) -> (String, Option<String>) {
        let message = self.message().to_owned();
        let code = self.code().map(str::to_owned);
        (message, code)
    }

    pub(in crate::rpc::router) fn into_rpc_response(self) -> RpcResponse {
        let (message, code) = self.into_parts();
        RpcResponse::error(message, code)
    }
}

impl RpcRouter {
    pub(super) fn recover_after_vault_unlock(&mut self) -> RecoveryResult<()> {
        if let Err(error) = self.recover_catalog_file_replace_transaction() {
            self.session = None;
            return Err(RecoveryError::internal(error.to_string()));
        }

        if let Err(error) = super::blob_io::recover_single_blob_write_transaction(self) {
            self.session = None;
            return Err(RecoveryError::internal(error.to_string()));
        }

        if let Err(error) = super::blob_io::recover_single_blob_erase_transaction(self) {
            self.session = None;
            return Err(RecoveryError::internal(error.to_string()));
        }

        if let Some(session) = self.session.as_ref() {
            if let Err(error) = super::otp_sidecar::recover_otp_sidecar_transaction(
                &self.storage,
                session.vault_key(),
            ) {
                self.session = None;
                return Err(RecoveryError::internal(error.to_string()));
            }
        }

        if let Err(error) = super::domain_uow::recover_domain_unit_of_work(self) {
            self.session = None;
            return Err(RecoveryError::internal(error.to_string()));
        }

        self.recover_wallet_preparations_best_effort();

        if let Err(error) = self.recover_catalog_upload_session_transaction() {
            self.session = None;
            return Err(RecoveryError::internal(error.to_string()));
        }

        if let Some(session) = self.session.as_ref() {
            if let Err(error) = super::derivative_store::DerivativeStore::recover_pending_overwrite(
                &self.storage,
                session.vault_key(),
            ) {
                self.session = None;
                return Err(RecoveryError::internal(error.to_string()));
            }
        }

        if let Some(session) = self.session.as_mut() {
            if let Err(error) = session.recover_rekey_transaction(&self.storage) {
                self.session = None;
                return Err(RecoveryError::internal(error.to_string()));
            }
        }

        self.recover_storage_gc_delete_manifest_best_effort();

        Ok(())
    }

    pub(super) fn recover_before_master_material_access(&self) -> RecoveryResult<()> {
        self.recover_master_rekey_transaction()
            .map_err(|error| RecoveryError::master_rekey_integrity_failed(error.into_message()))
    }

    pub(super) fn recover_before_restore_entry(&mut self) -> RecoveryResult<()> {
        super::restore::recover_restore_transaction(self)
            .map_err(RecoveryError::restore_transaction_failed)
    }
}
