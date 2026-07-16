use std::sync::{Arc, Mutex};

use crate::catalog_blocking_io::{CatalogBlockingIoError, CatalogBlockingIoRuntimeState};

pub(crate) use super::state::GatewayConfigSaveSnapshot;
use super::{GatewayState, PairedAgent};

const GATEWAY_CONFIG_SAVE_FAILED: &str = "GATEWAY_CONFIG_SAVE_FAILED";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct GatewayConfigPersistenceError {
    error: String,
    code: Option<String>,
}

impl GatewayConfigPersistenceError {
    pub(crate) fn into_rpc_error(self) -> (String, Option<String>) {
        (self.error, self.code)
    }

    fn save_failed(error: String) -> Self {
        Self {
            error: format!("Gateway config save failed: {error}"),
            code: Some(GATEWAY_CONFIG_SAVE_FAILED.to_string()),
        }
    }

    fn state_poisoned() -> Self {
        Self {
            error: "Gateway state mutex poisoned during agent revocation".to_string(),
            code: Some("INTERNAL".to_string()),
        }
    }
}

pub(crate) async fn save_config_snapshot_best_effort(
    catalog_blocking_io_runtime: Arc<CatalogBlockingIoRuntimeState>,
    snapshot: GatewayConfigSaveSnapshot,
    task_label: &'static str,
) {
    match catalog_blocking_io_runtime
        .spawn_blocking(move || snapshot.persist())
        .await
    {
        Ok(Ok(_written)) => {}
        Ok(Err(error)) => tracing::warn!("gateway: failed to save config: {error}"),
        Err(error) => {
            let (error, _code) = config_blocking_err(error, task_label);
            tracing::warn!("gateway: failed to save config: {error}");
        }
    }
}

/// Revokes a CLI agent and durably writes the resulting Gateway config before
/// returning success. The Gateway mutex stays held through persistence so no
/// concurrent state mutation can be omitted from the committed snapshot.
///
/// Every error path attempts to keep the identity revoked in memory. This
/// means callers can safely surface the persistence error without restoring
/// access in the current process.
pub(crate) async fn revoke_agent_durably(
    catalog_blocking_io_runtime: Arc<CatalogBlockingIoRuntimeState>,
    gateway: Arc<Mutex<GatewayState>>,
    env_runtime: Arc<crate::env_runtime::EnvRuntimeState>,
    agent_id: String,
) -> Result<Vec<PairedAgent>, GatewayConfigPersistenceError> {
    let fail_closed_gateway = gateway.clone();
    let fail_closed_env_runtime = env_runtime.clone();
    let fail_closed_agent_id = agent_id.clone();
    let task = catalog_blocking_io_runtime
        .spawn_blocking(move || {
            let _commit_guard = match env_runtime.commit_guard() {
                Ok(guard) => guard,
                Err(error) => {
                    revoke_agent_in_memory_fail_closed(&gateway, &agent_id);
                    env_runtime.cancel_pending_for_actor(&agent_id);
                    return Err(GatewayConfigPersistenceError {
                        error: error.message,
                        code: Some(error.code.to_string()),
                    });
                }
            };
            let mut state = match gateway.lock() {
                Ok(state) => state,
                Err(poisoned) => {
                    let mut state = poisoned.into_inner();
                    state.revoke_agent(&agent_id);
                    env_runtime.cancel_pending_for_actor(&agent_id);
                    return Err(GatewayConfigPersistenceError::state_poisoned());
                }
            };
            let result = state
                .revoke_agent_persisted(&agent_id)
                .map_err(GatewayConfigPersistenceError::save_failed);
            env_runtime.cancel_pending_for_actor(&agent_id);
            result
        })
        .await;

    match task {
        Ok(result) => result,
        Err(error) => {
            revoke_agent_in_memory_fail_closed(&fail_closed_gateway, &fail_closed_agent_id);
            fail_closed_env_runtime.cancel_pending_for_actor(&fail_closed_agent_id);
            let (error, code) = config_blocking_err(error, "Gateway CLI agent revocation");
            Err(GatewayConfigPersistenceError { error, code })
        }
    }
}

fn revoke_agent_in_memory_fail_closed(gateway: &Mutex<GatewayState>, agent_id: &str) {
    match gateway.lock() {
        Ok(mut state) => state.revoke_agent(agent_id),
        Err(poisoned) => poisoned.into_inner().revoke_agent(agent_id),
    }
}

fn config_blocking_err(
    error: CatalogBlockingIoError,
    task_label: &'static str,
) -> (String, Option<String>) {
    error.into_rpc_error(task_label)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    #[test]
    fn config_blocking_error_keeps_task_context() {
        let (error, code) = config_blocking_err(
            CatalogBlockingIoError::TaskFailed("join failed".to_string()),
            "Gateway config save",
        );

        assert_eq!(code.as_deref(), Some("INTERNAL"));
        assert!(error.contains("Gateway config save task failed"));
        assert!(error.contains("join failed"));
    }

    #[tokio::test]
    async fn durable_revoke_persists_before_returning_success() {
        let tmp = NamedTempFile::new().expect("tempfile");
        let path = tmp.path().to_path_buf();
        let mut state = GatewayState::load_or_default(path.clone());
        state.upsert_paired_agent("agent-success".to_string());
        state.save_config();
        let gateway = Arc::new(Mutex::new(state));

        let paired_agents = revoke_agent_durably(
            Arc::new(CatalogBlockingIoRuntimeState::new()),
            gateway,
            Arc::new(
                crate::env_runtime::EnvRuntimeState::new(
                    tempfile::tempdir()
                        .expect("env runtime tempdir")
                        .path()
                        .join("presets.enc.json"),
                )
                .expect("env runtime"),
            ),
            "agent-success".to_string(),
        )
        .await
        .expect("durable revoke");

        assert!(paired_agents[0].revoked);
        let persisted: crate::gateway::GatewayConfig =
            serde_json::from_slice(&std::fs::read(path).expect("read config"))
                .expect("parse config");
        assert!(persisted.paired_agents[0].revoked);
    }

    #[tokio::test]
    async fn unavailable_blocking_lane_still_revokes_in_memory() {
        let tmp = NamedTempFile::new().expect("tempfile");
        let mut state = GatewayState::load_or_default(tmp.path().to_path_buf());
        state.upsert_paired_agent("agent-runtime-down".to_string());
        let gateway = Arc::new(Mutex::new(state));
        let runtime = Arc::new(CatalogBlockingIoRuntimeState::new());
        runtime
            .shutdown_with_grace(std::time::Duration::ZERO)
            .await
            .expect("idle runtime shuts down");

        let error = revoke_agent_durably(
            runtime,
            gateway.clone(),
            Arc::new(
                crate::env_runtime::EnvRuntimeState::new(
                    tempfile::tempdir()
                        .expect("env runtime tempdir")
                        .path()
                        .join("presets.enc.json"),
                )
                .expect("env runtime"),
            ),
            "agent-runtime-down".to_string(),
        )
        .await
        .expect_err("closed blocking lane must fail");

        let (message, code) = error.into_rpc_error();
        assert!(message.contains("shutting down"));
        assert_eq!(code.as_deref(), Some("SHUTTING_DOWN"));
        assert!(!gateway
            .lock()
            .expect("gateway")
            .is_agent_paired_and_active("agent-runtime-down"));
    }
}
