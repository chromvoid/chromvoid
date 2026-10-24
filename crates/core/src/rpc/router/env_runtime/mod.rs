mod store;

use std::mem;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;
use zeroize::Zeroizing;

use crate::env_runtime::{
    validate_secret_value, EnvRuntimeError, EnvRuntimeErrorCode, EnvRuntimeResult,
    EnvSecretValueRecordV1, PrivateSpawnResolutionRequestV1, ResolvedEnvLeaseV1,
};
use crate::rpc::types::{
    EnvDeleteResponse, EnvProfileCreateRequest, EnvProfileDeleteRequest, EnvProfileGetRequest,
    EnvProfileListRequest, EnvProfileUpdateRequest, EnvRuntimeStatusRequest,
    EnvRuntimeStatusResponse, EnvSecretCreateRequest, EnvSecretDeleteRequest, EnvSecretListRequest,
    EnvSecretRevealRequest, EnvSecretRevealResponse, EnvSecretUpdateRequest, RpcResponse,
};

use super::state::RpcRouter;
use store::{
    begin_uow, commit_uow, load_secret_value, load_state, stage_delete_secret_value,
    stage_secret_value, stage_state,
};

impl RpcRouter {
    pub(super) fn handle_env_runtime_status(&self, data: &Value) -> RpcResponse {
        if let Err(error) = parse_request::<EnvRuntimeStatusRequest>(data) {
            return error_response(error);
        }
        let counts = match self.session.as_ref() {
            Some(session) => match load_state(session, &self.storage) {
                Ok(state) => Some((state.secret_count(), state.profile_count())),
                Err(error) => return error_response(error),
            },
            None => None,
        };
        RpcResponse::success(EnvRuntimeStatusResponse {
            vault_unlocked: self.session.is_some(),
            secret_count: counts.map(|(secrets, _)| secrets as u32),
            profile_count: counts.map(|(_, profiles)| profiles as u32),
        })
    }

    pub(super) fn handle_env_runtime_secret_list(&self, data: &Value) -> RpcResponse {
        let result = (|| {
            parse_request::<EnvSecretListRequest>(data)?;
            let session = self.require_env_runtime_session()?;
            Ok(load_state(session, &self.storage)?.list_secrets())
        })();
        result_response(result)
    }

    pub(super) fn handle_env_runtime_secret_create(&mut self, data: &Value) -> RpcResponse {
        let result = (|| {
            let mut request = parse_request::<EnvSecretCreateRequest>(data)?;
            validate_secret_value(&request.value)?;
            let storage = self.storage.clone();
            let session = self.require_env_runtime_session_mut()?;
            let mut state = load_state(session, &storage)?;
            let metadata = state.create_secret(mem::take(&mut request.label), now_epoch_ms())?;
            let value = EnvSecretValueRecordV1::new(
                metadata.id.clone(),
                metadata.revision,
                mem::take(&mut request.value),
            );
            let mut uow = begin_uow(session, &storage, "env-secret-create");
            stage_state(&mut uow, &state)?;
            stage_secret_value(&mut uow, &value)?;
            commit_uow(uow, session)?;
            Ok(metadata)
        })();
        result_response(result)
    }

    pub(super) fn handle_env_runtime_secret_update(&mut self, data: &Value) -> RpcResponse {
        let result = (|| {
            let mut request = parse_request::<EnvSecretUpdateRequest>(data)?;
            if request.label.is_none() && request.value.is_none() {
                return Err(EnvRuntimeError::validation(
                    "secret update requires label or value",
                ));
            }
            if let Some(value) = request.value.as_deref() {
                validate_secret_value(value)?;
            }
            let storage = self.storage.clone();
            let session = self.require_env_runtime_session_mut()?;
            let mut state = load_state(session, &storage)?;
            let mut value = load_secret_value(session, &storage, state.secret_by_id(&request.id)?)?;
            let metadata = state.update_secret(
                &request.id,
                request.base_revision,
                request.label.take(),
                now_epoch_ms(),
            )?;
            value.revision = metadata.revision;
            if let Some(replacement) = request.value.as_mut() {
                value.value = mem::take(replacement);
            }
            let mut uow = begin_uow(session, &storage, "env-secret-update");
            stage_state(&mut uow, &state)?;
            stage_secret_value(&mut uow, &value)?;
            commit_uow(uow, session)?;
            Ok(metadata)
        })();
        result_response(result)
    }

    pub(super) fn handle_env_runtime_secret_delete(&mut self, data: &Value) -> RpcResponse {
        let result = (|| {
            let request = parse_request::<EnvSecretDeleteRequest>(data)?;
            let storage = self.storage.clone();
            let session = self.require_env_runtime_session_mut()?;
            let mut state = load_state(session, &storage)?;
            let _ = load_secret_value(session, &storage, state.secret_by_id(&request.id)?)?;
            state.delete_secret(&request.id, request.base_revision)?;
            let mut uow = begin_uow(session, &storage, "env-secret-delete");
            stage_state(&mut uow, &state)?;
            stage_delete_secret_value(&mut uow, &request.id)?;
            commit_uow(uow, session)?;
            Ok(EnvDeleteResponse { deleted: true })
        })();
        result_response(result)
    }

    pub(super) fn handle_env_runtime_secret_reveal(&mut self, data: &Value) -> RpcResponse {
        let result = (|| {
            let mut request = parse_request::<EnvSecretRevealRequest>(data)?;
            if request.master_password.is_empty() {
                return Err(EnvRuntimeError::validation("master_password is required"));
            }
            self.verify_env_runtime_reauth(&request.master_password)?;
            let session = self.require_env_runtime_session()?;
            let state = load_state(session, &self.storage)?;
            let mut value =
                load_secret_value(session, &self.storage, state.secret_by_id(&request.id)?)?;
            Ok(EnvSecretRevealResponse {
                id: mem::take(&mut request.id),
                value: mem::take(&mut value.value),
                revealed_at_epoch_ms: now_epoch_ms(),
            })
        })();
        result_response(result)
    }

    pub(super) fn handle_env_runtime_profile_list(&self, data: &Value) -> RpcResponse {
        let result = (|| {
            parse_request::<EnvProfileListRequest>(data)?;
            let session = self.require_env_runtime_session()?;
            Ok(load_state(session, &self.storage)?.list_profiles())
        })();
        result_response(result)
    }

    pub(super) fn handle_env_runtime_profile_get(&self, data: &Value) -> RpcResponse {
        let result = (|| {
            let request = parse_request::<EnvProfileGetRequest>(data)?;
            let session = self.require_env_runtime_session()?;
            load_state(session, &self.storage)?.get_profile(&request.profile)
        })();
        result_response(result)
    }

    pub(super) fn handle_env_runtime_profile_create(&mut self, data: &Value) -> RpcResponse {
        let result = (|| {
            let request = parse_request::<EnvProfileCreateRequest>(data)?;
            let storage = self.storage.clone();
            let session = self.require_env_runtime_session_mut()?;
            let mut state = load_state(session, &storage)?;
            let profile = state.create_profile(
                request.slug,
                request.label,
                request.description,
                request.variables,
                now_epoch_ms(),
            )?;
            let mut uow = begin_uow(session, &storage, "env-profile-create");
            stage_state(&mut uow, &state)?;
            commit_uow(uow, session)?;
            Ok(profile)
        })();
        result_response(result)
    }

    pub(super) fn handle_env_runtime_profile_update(&mut self, data: &Value) -> RpcResponse {
        let result = (|| {
            let request = parse_request::<EnvProfileUpdateRequest>(data)?;
            let storage = self.storage.clone();
            let session = self.require_env_runtime_session_mut()?;
            let mut state = load_state(session, &storage)?;
            let profile_id = state.get_profile(&request.target)?.id;
            let draft = request.draft;
            let profile = state.update_profile(
                &profile_id,
                request.base_revision,
                draft.slug,
                draft.label,
                draft.description,
                draft.variables,
                now_epoch_ms(),
            )?;
            let mut uow = begin_uow(session, &storage, "env-profile-update");
            stage_state(&mut uow, &state)?;
            commit_uow(uow, session)?;
            Ok(profile)
        })();
        result_response(result)
    }

    pub(super) fn handle_env_runtime_profile_delete(&mut self, data: &Value) -> RpcResponse {
        let result = (|| {
            let request = parse_request::<EnvProfileDeleteRequest>(data)?;
            let storage = self.storage.clone();
            let session = self.require_env_runtime_session_mut()?;
            let mut state = load_state(session, &storage)?;
            let profile_id = state.get_profile(&request.target)?.id;
            state.delete_profile(&profile_id, request.base_revision)?;
            let mut uow = begin_uow(session, &storage, "env-profile-delete");
            stage_state(&mut uow, &state)?;
            commit_uow(uow, session)?;
            Ok(EnvDeleteResponse { deleted: true })
        })();
        result_response(result)
    }

    /// Private local-only resolution boundary for the Tauri process supervisor.
    ///
    /// There is intentionally no generic RPC dispatch arm or serializable
    /// result type for this method.
    pub fn resolve_for_tauri_spawn(
        &mut self,
        request: PrivateSpawnResolutionRequestV1,
    ) -> EnvRuntimeResult<ResolvedEnvLeaseV1> {
        let session = self.require_env_runtime_session()?;
        let state = load_state(session, &self.storage)?;
        let profile = state.profile_by_id(&request.profile_id)?;
        if profile.revision != request.expected_profile_revision {
            return Err(EnvRuntimeError::revision_conflict());
        }

        let mut entries = Zeroizing::new(Vec::with_capacity(profile.variables.len()));
        for variable in &profile.variables {
            let metadata = state.secret_by_id(&variable.secret_id).map_err(|_| {
                EnvRuntimeError::new(
                    EnvRuntimeErrorCode::ResolutionFailed,
                    "Env Runtime secret resolution failed",
                )
            })?;
            let mut value = load_secret_value(session, &self.storage, metadata)?;
            entries.push((variable.name.clone(), mem::take(&mut value.value)));
        }
        Ok(ResolvedEnvLeaseV1::new(mem::take(&mut *entries)))
    }

    fn require_env_runtime_session(&self) -> EnvRuntimeResult<&crate::vault::VaultSession> {
        self.session.as_ref().ok_or_else(|| {
            EnvRuntimeError::new(EnvRuntimeErrorCode::VaultRequired, "Vault not unlocked")
        })
    }

    fn require_env_runtime_session_mut(
        &mut self,
    ) -> EnvRuntimeResult<&mut crate::vault::VaultSession> {
        self.session.as_mut().ok_or_else(|| {
            EnvRuntimeError::new(EnvRuntimeErrorCode::VaultRequired, "Vault not unlocked")
        })
    }

    fn verify_env_runtime_reauth(&mut self, master_password: &str) -> EnvRuntimeResult<()> {
        let now = now_epoch_ms();
        if self.env_runtime_reauth_limiter.is_locked(now) {
            return Err(EnvRuntimeError::new(
                EnvRuntimeErrorCode::ReauthLocked,
                "Env Runtime re-authentication is locked out",
            ));
        }
        match self.verify_master_password(master_password) {
            Ok(()) => {
                self.env_runtime_reauth_limiter.record_success();
                Ok(())
            }
            Err(_) => {
                self.env_runtime_reauth_limiter.record_failure(now);
                Err(EnvRuntimeError::new(
                    EnvRuntimeErrorCode::ReauthFailed,
                    "Master password verification failed",
                ))
            }
        }
    }
}

fn parse_request<T: DeserializeOwned>(data: &Value) -> EnvRuntimeResult<T> {
    serde_json::from_value(data.clone()).map_err(|error| {
        EnvRuntimeError::validation(format!("Invalid Env Runtime request: {error}"))
    })
}

fn result_response<T: Serialize>(result: EnvRuntimeResult<T>) -> RpcResponse {
    match result {
        Ok(value) => RpcResponse::success(value),
        Err(error) => error_response(error),
    }
}

fn error_response(error: EnvRuntimeError) -> RpcResponse {
    RpcResponse::error(error.message(), Some(error.code().as_str()))
}

fn now_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
