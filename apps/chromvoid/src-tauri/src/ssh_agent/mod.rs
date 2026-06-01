//! SSH Agent service for ChromVoid.
//!
//! Provides a standard SSH agent protocol endpoint so that external tools
//! (git, ssh, etc.) can use SSH keys stored in the encrypted vault.

pub mod audit;
pub mod protocol;
pub mod server;
pub mod signing;

#[cfg(test)]
mod socket_tests;

use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use tokio::sync::{watch, Mutex};
use tokio::time::{timeout, Duration};
use tracing::{info, warn};

use audit::{SshAgentAuditEvent, SshAgentAuditLog};
use server::{load_identities, AgentShared, ApprovalEmitterHandle, ReadPrivateKeyFuture};

const GRACEFUL_STOP_TIMEOUT: Duration = Duration::from_secs(1);
const CLEANUP_TASK_DRAIN_TIMEOUT: Duration = Duration::from_secs(1);
const AUDIT_WRITER_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(1);

type CleanupFuture = Pin<Box<dyn Future<Output = ()> + Send + 'static>>;

struct DeferredCleanup {
    label: &'static str,
    future: CleanupFuture,
}

impl DeferredCleanup {
    fn new(label: &'static str, future: impl Future<Output = ()> + Send + 'static) -> Self {
        Self {
            label,
            future: Box::pin(future),
        }
    }

    async fn run(self) {
        self.future.await;
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StopReason {
    Manual,
    Restart,
    VaultLock,
    SystemSleep,
    AppShutdown,
}

impl StopReason {
    fn label(self) -> &'static str {
        match self {
            Self::Manual => "manual_stop",
            Self::Restart => "restart",
            Self::VaultLock => "vault_lock",
            Self::SystemSleep => "system_sleep",
            Self::AppShutdown => "app_shutdown",
        }
    }

    fn abort_immediately(self) -> bool {
        matches!(self, Self::Restart | Self::VaultLock | Self::SystemSleep)
    }
}

#[derive(Clone)]
pub struct SshAgentUpdater {
    shared: Arc<Mutex<AgentShared>>,
    identities_count: Arc<AtomicUsize>,
}

impl SshAgentUpdater {
    pub async fn update_identities(&self, entries: &[(String, String, String, String)]) {
        let new_identities = load_identities(entries);
        let next_count = new_identities.len();
        let mut guard = self.shared.lock().await;
        guard.identities = new_identities;
        self.identities_count.store(next_count, Ordering::Relaxed);
    }
}

struct StopExecution {
    reason: StopReason,
    task_handle: Option<tokio::task::JoinHandle<()>>,
    socket_path: Option<PathBuf>,
    shutdown_tx: Option<watch::Sender<bool>>,
    shared: Option<Arc<Mutex<AgentShared>>>,
    identities_count: Arc<AtomicUsize>,
    audit_log: Option<Arc<SshAgentAuditLog>>,
}

impl StopExecution {
    fn finish_immediate(mut self) -> Option<DeferredCleanup> {
        let cleanup = self.take_immediate_cleanup();
        self.abort_listener_and_remove_socket();
        self.identities_count.store(0, Ordering::Relaxed);
        info!("ssh-agent: stopped ({})", self.reason.label());
        cleanup
    }

    fn finish_immediate_without_cleanup(mut self) {
        self.abort_listener_and_remove_socket();
        self.identities_count.store(0, Ordering::Relaxed);
        info!("ssh-agent: stopped ({})", self.reason.label());
    }

    fn take_immediate_cleanup(&mut self) -> Option<DeferredCleanup> {
        let shared = self.shared.take();
        let audit_log = self.audit_log.clone();
        if shared.is_none() && audit_log.is_none() {
            return None;
        }

        let identities_count = self.identities_count.load(Ordering::Relaxed);
        let socket_path_for_audit = self.socket_path.clone();
        let reason = self.reason;

        Some(DeferredCleanup::new(
            "ssh_agent_immediate_stop_cleanup",
            async move {
                let rejected = match shared {
                    Some(shared) => {
                        let mut guard = shared.lock().await;
                        guard.reject_all_pending()
                    }
                    None => Vec::new(),
                };

                if !rejected.is_empty() {
                    info!(
                        "ssh-agent: rejected {} pending approval(s) during {}",
                        rejected.len(),
                        reason.label()
                    );
                }

                if let Some(audit_log) = audit_log {
                    for pending in rejected {
                        audit_log
                            .log(SshAgentAuditEvent::approval_resolved(
                                &pending.request_id,
                                pending.connection_id,
                                &pending.fingerprint,
                                &pending.comment,
                                pending.peer_pid,
                                pending.peer_process.as_deref(),
                                pending.host_hint.as_deref(),
                                false,
                                pending.requested_at.elapsed().as_millis() as u64,
                            ))
                            .await;
                    }

                    audit_log
                        .log(SshAgentAuditEvent::agent_stop(
                            reason.label(),
                            "immediate",
                            socket_path_for_audit.as_deref(),
                            identities_count,
                        ))
                        .await;
                }
            },
        ))
    }

    fn abort_listener_and_remove_socket(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(true);
        }

        if let Some(handle) = self.task_handle.take() {
            handle.abort();
        }

        if let Some(path) = self.socket_path.take() {
            let _ = std::fs::remove_file(path);
        }
    }

    async fn finish_graceful(mut self) {
        let identities_count = self.identities_count.load(Ordering::Relaxed);
        let socket_path_for_audit = self.socket_path.clone();
        if let Some(shared) = self.shared.take() {
            let rejected = {
                let mut guard = shared.lock().await;
                guard.reject_all_pending()
            };

            if !rejected.is_empty() {
                info!(
                    "ssh-agent: rejected {} pending approval(s) during {}",
                    rejected.len(),
                    self.reason.label()
                );
            }

            if let Some(audit_log) = self.audit_log.clone() {
                for pending in rejected {
                    audit_log
                        .log(SshAgentAuditEvent::approval_resolved(
                            &pending.request_id,
                            pending.connection_id,
                            &pending.fingerprint,
                            &pending.comment,
                            pending.peer_pid,
                            pending.peer_process.as_deref(),
                            pending.host_hint.as_deref(),
                            false,
                            pending.requested_at.elapsed().as_millis() as u64,
                        ))
                        .await;
                }
            }
        }

        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(true);
        }

        if let Some(mut handle) = self.task_handle.take() {
            let join_result = timeout(GRACEFUL_STOP_TIMEOUT, async { (&mut handle).await }).await;

            match join_result {
                Ok(Ok(())) => {}
                Ok(Err(error)) => {
                    warn!(
                        "ssh-agent: listener join failed during {}: {error}",
                        self.reason.label()
                    );
                }
                Err(_) => {
                    warn!(
                        "ssh-agent: graceful stop timed out after {:?} during {}, aborting listener",
                        GRACEFUL_STOP_TIMEOUT,
                        self.reason.label()
                    );
                    handle.abort();
                    let _ = handle.await;
                }
            }
        }

        if let Some(path) = self.socket_path.take() {
            let _ = std::fs::remove_file(path);
        }

        self.identities_count.store(0, Ordering::Relaxed);
        if let Some(audit_log) = self.audit_log.clone() {
            audit_log
                .log(SshAgentAuditEvent::agent_stop(
                    self.reason.label(),
                    "graceful",
                    socket_path_for_audit.as_deref(),
                    identities_count,
                ))
                .await;
        }
        info!("ssh-agent: stopped ({})", self.reason.label());
    }
}

/// Public state managed by the application.
pub struct SshAgentState {
    task_handle: Option<tokio::task::JoinHandle<()>>,
    socket_path: Option<PathBuf>,
    shutdown_tx: Option<watch::Sender<bool>>,
    shared: Option<Arc<Mutex<AgentShared>>>,
    identities_count: Arc<AtomicUsize>,
    audit_log: Option<Arc<SshAgentAuditLog>>,
    cleanup_tasks: Vec<tokio::task::JoinHandle<()>>,
}

impl SshAgentState {
    pub fn new() -> Self {
        Self {
            task_handle: None,
            socket_path: None,
            shutdown_tx: None,
            shared: None,
            identities_count: Arc::new(AtomicUsize::new(0)),
            audit_log: None,
            cleanup_tasks: Vec::new(),
        }
    }

    /// Whether the agent is currently running.
    pub fn is_running(&self) -> bool {
        self.task_handle
            .as_ref()
            .map(|h| !h.is_finished())
            .unwrap_or(false)
    }

    /// The socket path the agent is listening on, if running.
    pub fn socket_path(&self) -> Option<&PathBuf> {
        if self.is_running() {
            self.socket_path.as_ref()
        } else {
            None
        }
    }

    /// Number of loaded identities.
    pub fn identities_count(&self) -> usize {
        self.identities_count.load(Ordering::Relaxed)
    }

    /// Start the SSH agent.
    ///
    /// `entries`: list of (entry_id, public_key_openssh, comment) for all SSH keys.
    /// `read_private_key`: async callback to read a private key PEM from the vault by entry_id.
    pub fn start(
        &mut self,
        entries: Vec<(String, String, String, String)>,
        upstream_socket_path: Option<PathBuf>,
        approval_emitter: ApprovalEmitterHandle,
        audit_log: Option<Arc<SshAgentAuditLog>>,
        read_private_key: impl Fn(&str) -> ReadPrivateKeyFuture + Send + Sync + 'static,
    ) {
        if let Some(stop) = self.take_stop_execution(StopReason::Restart) {
            warn!("ssh-agent: already running, stopping first");
            self.finish_immediate_tracked(stop);
        }
        self.prune_finished_cleanup_tasks();

        let socket_path = default_socket_path();
        let identities = load_identities(&entries);
        let identities_count = identities.len();

        let shared = Arc::new(Mutex::new(AgentShared {
            identities,
            read_private_key: Box::new(read_private_key),
            approval_emitter,
            audit_log: audit_log.clone(),
            socket_path: socket_path.clone(),
            upstream_socket_path,
            pending_approvals: std::collections::HashMap::new(),
        }));

        let (shutdown_tx, shutdown_rx) = watch::channel(false);

        let path = socket_path.clone();
        let shared_clone = shared.clone();
        let handle = tokio::spawn(async move {
            server::run_agent(path, shared_clone, shutdown_rx).await;
        });

        self.task_handle = Some(handle);
        self.socket_path = Some(socket_path.clone());
        self.shutdown_tx = Some(shutdown_tx);
        self.shared = Some(shared);
        self.audit_log = audit_log.clone();
        self.identities_count
            .store(identities_count, Ordering::Relaxed);

        if let Some(audit_log) = audit_log {
            let socket_path_for_audit = socket_path.clone();
            self.spawn_cleanup_task("ssh_agent_start_audit", async move {
                audit_log
                    .log(SshAgentAuditEvent::agent_start(
                        &socket_path_for_audit,
                        identities_count,
                    ))
                    .await;
            });
        }

        info!(
            "ssh-agent: started with {identities_count} identities on {}",
            socket_path.display()
        );
    }

    pub fn shared(&self) -> Option<Arc<Mutex<AgentShared>>> {
        self.shared.clone()
    }

    pub fn updater(&self) -> Option<SshAgentUpdater> {
        self.shared.as_ref().map(|shared| SshAgentUpdater {
            shared: shared.clone(),
            identities_count: self.identities_count.clone(),
        })
    }

    pub fn audit_log(&self) -> Option<Arc<SshAgentAuditLog>> {
        self.audit_log.clone()
    }

    pub fn stop_with_reason(&mut self, reason: StopReason) {
        self.prune_finished_cleanup_tasks();
        let Some(stop) = self.take_stop_execution(reason) else {
            self.identities_count.store(0, Ordering::Relaxed);
            return;
        };

        if reason.abort_immediately() {
            self.finish_immediate_tracked(stop);
            return;
        }

        self.spawn_cleanup_task("ssh_agent_graceful_stop", async move {
            stop.finish_graceful().await;
        });
    }

    fn take_stop_execution(&mut self, reason: StopReason) -> Option<StopExecution> {
        let has_state = self.task_handle.is_some()
            || self.socket_path.is_some()
            || self.shutdown_tx.is_some()
            || self.shared.is_some();

        if !has_state {
            return None;
        }

        Some(StopExecution {
            reason,
            task_handle: self.task_handle.take(),
            socket_path: self.socket_path.take(),
            shutdown_tx: self.shutdown_tx.take(),
            shared: self.shared.take(),
            identities_count: self.identities_count.clone(),
            audit_log: self.audit_log.take(),
        })
    }

    fn finish_immediate_tracked(&mut self, stop: StopExecution) {
        if let Some(cleanup) = stop.finish_immediate() {
            self.spawn_deferred_cleanup(cleanup);
        }
    }

    fn spawn_deferred_cleanup(&mut self, cleanup: DeferredCleanup) {
        let label = cleanup.label;
        self.spawn_cleanup_task(label, cleanup.run());
    }

    fn spawn_cleanup_task(
        &mut self,
        label: &'static str,
        future: impl Future<Output = ()> + Send + 'static,
    ) {
        self.prune_finished_cleanup_tasks();
        let handle = tokio::spawn(async move {
            future.await;
            tracing::debug!("ssh-agent: cleanup task finished: {label}");
        });
        self.cleanup_tasks.push(handle);
    }

    fn prune_finished_cleanup_tasks(&mut self) {
        self.cleanup_tasks.retain(|handle| !handle.is_finished());
    }

    fn take_cleanup_tasks(&mut self) -> Vec<tokio::task::JoinHandle<()>> {
        self.prune_finished_cleanup_tasks();
        std::mem::take(&mut self.cleanup_tasks)
    }

    fn abort_cleanup_tasks(&mut self) {
        for handle in self.cleanup_tasks.drain(..) {
            handle.abort();
        }
    }

    fn abort_without_async_cleanup(&mut self) {
        self.abort_cleanup_tasks();
        let Some(stop) = self.take_stop_execution(StopReason::AppShutdown) else {
            self.identities_count.store(0, Ordering::Relaxed);
            return;
        };
        stop.finish_immediate_without_cleanup();
    }
}

impl Drop for SshAgentState {
    fn drop(&mut self) {
        self.abort_without_async_cleanup();
    }
}

pub async fn stop_shared_state(
    agent_state: &Arc<std::sync::Mutex<SshAgentState>>,
    reason: StopReason,
) {
    let (execution, cleanup_tasks, audit_log) = match agent_state.lock() {
        Ok(mut agent) => {
            let audit_log = agent.audit_log.clone();
            (
                agent.take_stop_execution(reason),
                agent.take_cleanup_tasks(),
                audit_log,
            )
        }
        Err(_) => (None, Vec::new(), None),
    };

    if let Some(stop) = execution {
        if reason.abort_immediately() {
            if let Some(cleanup) = stop.finish_immediate() {
                cleanup.run().await;
            }
        } else {
            stop.finish_graceful().await;
        }
    }

    drain_cleanup_tasks(
        cleanup_tasks,
        CLEANUP_TASK_DRAIN_TIMEOUT,
        "ssh_agent_stop_shared_state",
    )
    .await;

    if let Some(audit_log) = audit_log {
        if let Err(error) = audit_log
            .shutdown_with_grace(AUDIT_WRITER_SHUTDOWN_TIMEOUT)
            .await
        {
            warn!("ssh-agent: audit writer shutdown failed: {error}");
        }
    }
}

async fn drain_cleanup_tasks(
    mut handles: Vec<tokio::task::JoinHandle<()>>,
    total_grace: Duration,
    context: &'static str,
) {
    if handles.is_empty() {
        return;
    }

    let result = timeout(total_grace, async {
        for handle in &mut handles {
            if let Err(error) = (&mut *handle).await {
                if !error.is_cancelled() {
                    warn!("ssh-agent: cleanup task failed during {context}: {error}");
                }
            }
        }
    })
    .await;

    if result.is_err() {
        warn!(
            "ssh-agent: cleanup tasks timed out after {:?} during {context}",
            total_grace
        );
        for handle in handles {
            if !handle.is_finished() {
                handle.abort();
            }
        }
    }
}

/// Get the default socket path for the current platform.
fn default_socket_path() -> PathBuf {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        let config_dir = std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var_os("HOME")
                    .map(PathBuf::from)
                    .map(|home| home.join(".config"))
            })
            .unwrap_or_else(|| PathBuf::from("/tmp"));

        return config_dir.join("chromvoid").join("agent.sock");
    }

    #[cfg(target_os = "windows")]
    {
        PathBuf::from(r"\\.\pipe\chromvoid-ssh-agent")
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        PathBuf::from("/tmp/chromvoid-agent.sock")
    }
}

#[cfg(test)]
mod tests {
    use super::{default_socket_path, StopReason};

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    #[test]
    fn default_socket_path_prefers_xdg_config_home() {
        let original = std::env::var_os("XDG_CONFIG_HOME");
        // SAFETY: test-only fixture, single-threaded #[test] runner; original value restored at the end of this test.
        unsafe {
            std::env::set_var("XDG_CONFIG_HOME", "/tmp/chromvoid-test-config");
        }

        let resolved = default_socket_path();
        assert_eq!(
            resolved,
            std::path::PathBuf::from("/tmp/chromvoid-test-config")
                .join("chromvoid")
                .join("agent.sock")
        );

        match original {
            // SAFETY: test-only fixture, single-threaded #[test] runner; restoring the original value.
            Some(value) => unsafe {
                std::env::set_var("XDG_CONFIG_HOME", value);
            },
            // SAFETY: test-only fixture, single-threaded #[test] runner; restoring the unset state.
            None => unsafe {
                std::env::remove_var("XDG_CONFIG_HOME");
            },
        }
    }

    #[test]
    fn stop_reason_abort_policy_is_fail_closed_for_revocation_paths() {
        assert!(StopReason::Restart.abort_immediately());
        assert!(StopReason::VaultLock.abort_immediately());
        assert!(StopReason::SystemSleep.abort_immediately());
        assert!(!StopReason::Manual.abort_immediately());
        assert!(!StopReason::AppShutdown.abort_immediately());
    }
}
