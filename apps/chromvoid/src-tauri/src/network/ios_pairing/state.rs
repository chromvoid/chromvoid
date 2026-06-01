use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use super::{host_mode_path, mobile_acceptor, now_ms, now_secs, HostPresence, IosHostStatus};
use crate::network::host_responder_task::HostResponderTaskRuntime;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub(super) struct PersistedIosHostMode {
    pub(super) relay_url: Option<String>,
    pub(super) enabled: bool,
    pub(super) updated_at: u64,
}

pub(super) fn load_persisted_host_mode(storage_root: &Path) -> PersistedIosHostMode {
    let path = host_mode_path(storage_root);
    crate::helpers::storage::read_json_or_default(&path, "network: iOS host mode")
}

pub(super) async fn load_persisted_host_mode_blocking(
    storage_root: PathBuf,
    task_label: &'static str,
) -> Result<PersistedIosHostMode, String> {
    tauri::async_runtime::spawn_blocking(move || load_persisted_host_mode(&storage_root))
        .await
        .map_err(|error| format!("{task_label} task failed: {error}"))
}

fn save_persisted_host_mode(
    storage_root: &Path,
    mut config: PersistedIosHostMode,
) -> Result<(), String> {
    config.updated_at = now_secs();
    crate::helpers::storage::write_json_pretty_atomic(&host_mode_path(storage_root), &config)
        .map_err(|e| format!("write ios host mode: {e}"))
}

pub(super) fn update_persisted_host_mode(
    storage_root: &Path,
    relay_url: Option<&str>,
    enabled: bool,
) -> Result<(), String> {
    let mut config = load_persisted_host_mode(storage_root);
    if let Some(url) = relay_url.map(str::trim).filter(|url| !url.is_empty()) {
        config.relay_url = Some(url.to_string());
    }
    config.enabled = enabled;
    save_persisted_host_mode(storage_root, config)
}

pub(super) async fn update_persisted_host_mode_blocking(
    storage_root: PathBuf,
    relay_url: Option<String>,
    enabled: bool,
    task_label: &'static str,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        update_persisted_host_mode(&storage_root, relay_url.as_deref(), enabled)
    })
    .await
    .map_err(|error| format!("{task_label} task failed: {error}"))?
}

pub struct IosHostRuntimeState {
    status: Mutex<IosHostStatus>,
    responder_task: HostResponderTaskRuntime,
}

impl IosHostRuntimeState {
    pub fn new() -> Self {
        Self {
            status: Mutex::new(IosHostStatus::default()),
            responder_task: HostResponderTaskRuntime::new(),
        }
    }

    pub(crate) fn set_status(
        &self,
        mutator: impl FnOnce(&mut IosHostStatus),
    ) -> Result<IosHostStatus, String> {
        let mut guard = self
            .status
            .lock()
            .map_err(|_| "iOS host status mutex poisoned".to_string())?;
        mutator(&mut guard);
        Ok(guard.clone())
    }

    pub fn host_status(&self) -> Result<IosHostStatus, String> {
        self.status
            .lock()
            .map(|guard| guard.clone())
            .map_err(|_| "iOS host status mutex poisoned".to_string())
    }

    pub(super) fn begin_responder_task(&self) -> Result<u64, String> {
        self.responder_task
            .begin("iOS host responder mutex poisoned")
    }

    pub(super) fn store_responder_task(
        &self,
        generation: u64,
        handle: tauri::async_runtime::JoinHandle<()>,
    ) -> Result<(), String> {
        self.responder_task
            .store(generation, handle, "iOS host responder mutex poisoned")
    }

    pub(super) fn cancel_responder_task(&self) -> Result<(), String> {
        self.responder_task
            .cancel("iOS host responder mutex poisoned")
    }

    pub(super) fn is_responder_generation_current(&self, generation: u64) -> bool {
        self.responder_task.is_generation_current(generation)
    }

    pub(super) fn clear_responder_task_if_current(&self, generation: u64) -> Result<(), String> {
        self.responder_task
            .clear_if_current(generation, "iOS host responder mutex poisoned")
    }
}

impl Default for IosHostRuntimeState {
    fn default() -> Self {
        Self::new()
    }
}

pub(super) fn has_effective_ready_presence(presence: Option<&HostPresence>) -> bool {
    presence.is_some_and(|presence| presence.status == "ready" && presence.expires_at_ms > now_ms())
}

pub(super) fn should_republish_presence_for_active_acceptor(
    relay_url: &str,
    acceptor: &mobile_acceptor::AcceptorStatus,
    status: &IosHostStatus,
) -> bool {
    matches!(
        acceptor.state,
        mobile_acceptor::AcceptorState::Listening | mobile_acceptor::AcceptorState::Connected
    ) && acceptor.relay_url.as_deref() == Some(relay_url)
        && !has_effective_ready_presence(status.presence.as_ref())
}

pub fn is_host_mode_enabled(storage_root: &Path) -> bool {
    load_persisted_host_mode(storage_root).enabled
}

pub fn persisted_host_mode_relay_url(storage_root: &Path) -> Option<String> {
    load_persisted_host_mode(storage_root)
        .relay_url
        .as_deref()
        .map(str::trim)
        .filter(|url| !url.is_empty())
        .map(ToOwned::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::time::Duration;

    struct DropFlag(Arc<AtomicBool>);

    impl Drop for DropFlag {
        fn drop(&mut self) {
            self.0.store(true, Ordering::Release);
        }
    }

    #[tokio::test]
    async fn ios_responder_replacement_invalidates_and_aborts_previous_task() {
        let runtime = IosHostRuntimeState::new();
        let generation = runtime.begin_responder_task().expect("begin responder");
        let dropped = Arc::new(AtomicBool::new(false));
        let drop_flag = DropFlag(dropped.clone());
        let handle = tauri::async_runtime::spawn(async move {
            let _drop_flag = drop_flag;
            std::future::pending::<()>().await;
        });
        runtime
            .store_responder_task(generation, handle)
            .expect("store responder");

        let replacement_generation = runtime.begin_responder_task().expect("replace responder");

        assert!(!runtime.is_responder_generation_current(generation));
        assert!(runtime.is_responder_generation_current(replacement_generation));
        tokio::time::sleep(Duration::from_millis(20)).await;
        assert!(dropped.load(Ordering::Acquire));
    }

    #[tokio::test]
    async fn ios_responder_cancel_invalidates_generation() {
        let runtime = IosHostRuntimeState::new();
        let generation = runtime.begin_responder_task().expect("begin responder");
        let handle = tauri::async_runtime::spawn(async {});
        runtime
            .store_responder_task(generation, handle)
            .expect("store responder");

        runtime.cancel_responder_task().expect("cancel responder");

        assert!(!runtime.is_responder_generation_current(generation));
        assert!(!runtime
            .responder_task
            .has_task_for_test("iOS host responder mutex poisoned")
            .expect("responder task status"));
    }

    #[tokio::test]
    async fn ios_responder_clear_only_clears_current_generation() {
        let runtime = IosHostRuntimeState::new();
        let generation = runtime.begin_responder_task().expect("begin responder");
        let handle = tauri::async_runtime::spawn(async {});
        runtime
            .store_responder_task(generation, handle)
            .expect("store responder");

        runtime
            .clear_responder_task_if_current(generation.saturating_sub(1))
            .expect("clear stale generation");
        assert!(runtime
            .responder_task
            .has_task_for_test("iOS host responder mutex poisoned")
            .expect("responder task status"));

        runtime
            .clear_responder_task_if_current(generation)
            .expect("clear current generation");
        assert!(!runtime
            .responder_task
            .has_task_for_test("iOS host responder mutex poisoned")
            .expect("responder task status"));
    }

    #[test]
    fn ios_responder_poison_returns_controlled_error() {
        let runtime = IosHostRuntimeState::new();
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            runtime.responder_task.poison_for_test();
        }));

        assert_eq!(
            runtime
                .begin_responder_task()
                .expect_err("poison should fail"),
            "iOS host responder mutex poisoned"
        );
    }
}
