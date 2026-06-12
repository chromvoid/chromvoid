//! Master password rekeying.

mod error;
mod participant;
mod request;
mod service;
#[cfg(test)]
mod tests;
mod types;

use serde_json::Value;

use crate::crypto::{derive_vault_key, hash};
use crate::rpc::types::{MasterRekeyResponse, RpcResponse};
use crate::types::SALT_SIZE;

use super::state::RpcRouter;
use error::{MasterRekeyError, MasterRekeyResult};
use request::parse_master_rekey_request;
use service::MasterRekeyService;
use types::MasterRekeyArtifactNames;

const MASTER_REKEY_MIN_PASSWORD_LEN: usize = 12;

impl RpcRouter {
    pub(super) fn handle_master_rekey(&mut self, data: &Value) -> RpcResponse {
        if let Err(error) = self.recover_before_master_material_access() {
            return error.into_rpc_response();
        }

        match self.handle_master_rekey_result(data) {
            Ok(response) => RpcResponse::success(response),
            Err(error) => error.into_rpc_response(),
        }
    }

    fn handle_master_rekey_result(
        &mut self,
        data: &Value,
    ) -> MasterRekeyResult<MasterRekeyResponse> {
        let request = parse_master_rekey_request(data)?;
        let current_password = request.current_password;
        let new_master_password = request.new_master_password;

        if new_master_password.len() < MASTER_REKEY_MIN_PASSWORD_LEN {
            return Err(MasterRekeyError::password_policy(format!(
                "New master password must be at least {MASTER_REKEY_MIN_PASSWORD_LEN} characters"
            )));
        }
        if new_master_password == current_password {
            return Err(MasterRekeyError::password_policy(
                "New master password must be different from the current master password",
            ));
        }

        let (master_salt, expected_verify) = self.read_master_rekey_material()?;

        let old_master_key = derive_vault_key(current_password, &master_salt)
            .map_err(|error| MasterRekeyError::internal(error.to_string()))?;
        if hash(&*old_master_key) != expected_verify {
            return Err(MasterRekeyError::invalid_current_password());
        }

        let new_master_key = derive_vault_key(new_master_password, &master_salt)
            .map_err(|error| MasterRekeyError::internal(error.to_string()))?;
        let new_verify = hash(&*new_master_key);

        let rewrapped_artifacts = self.rewrap_master_key_artifacts(&new_verify)?;

        self.clear_backup_local_session();
        self.clear_restore_local_session();
        self.erase_token = None;
        self.clear_vault_export();
        self.credential_provider_runtime.clear_all();
        if self.master_key.is_some() {
            self.set_master_key(Some(new_master_password.to_string()));
        }

        Ok(MasterRekeyResponse {
            rewrapped_artifacts,
            backup_recommended: true,
        })
    }

    pub(super) fn recover_master_rekey_transaction(&self) -> MasterRekeyResult<()> {
        MasterRekeyService::new(&self.storage).recover()
    }

    fn read_master_rekey_material(&self) -> MasterRekeyResult<([u8; SALT_SIZE], [u8; 32])> {
        let material = self.read_master_material()?;
        Ok((material.salt, material.verify))
    }

    fn rewrap_master_key_artifacts(
        &self,
        new_verify: &[u8; 32],
    ) -> MasterRekeyResult<MasterRekeyArtifactNames> {
        MasterRekeyService::new(&self.storage).stage_and_commit_verify(new_verify)
    }
}
