use std::path::{Path, PathBuf};

use super::{host_mode_path, mobile_acceptor, now_ms, HostPresence, IosHostStatus};
pub use chromvoid_network_runtime::ios_host::IosHostRuntimeState;

use chromvoid_network_runtime::ios_host::configuration::IosHostConfiguration as PersistedIosHostMode;

pub(super) fn load_persisted_host_mode(storage_root: &Path) -> PersistedIosHostMode {
    PersistedIosHostMode::load(&host_mode_path(storage_root))
}

pub(super) async fn load_persisted_host_mode_blocking(
    storage_root: PathBuf,
    task_label: &'static str,
) -> Result<PersistedIosHostMode, String> {
    tauri::async_runtime::spawn_blocking(move || load_persisted_host_mode(&storage_root))
        .await
        .map_err(|error| format!("{task_label} task failed: {error}"))
}

pub(super) fn update_persisted_host_mode(
    storage_root: &Path,
    relay_url: Option<&str>,
    enabled: bool,
) -> Result<(), String> {
    PersistedIosHostMode::update(&host_mode_path(storage_root), relay_url, enabled)
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
