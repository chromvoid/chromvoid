use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Output, Stdio};
use std::sync::{Arc, Mutex as StdMutex, OnceLock};
use std::time::Duration;

use tokio::net::UnixStream;
use tokio::sync::Notify;

use super::server::{
    AgentShared, ApprovalEventEmitter, SignApprovalEventPayload, SignApprovalExpiredEventPayload,
};
use super::SshAgentState;

const OPENSSH_COMMAND_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Default)]
pub(super) struct TestApprovalEmitter {
    pub(super) events: StdMutex<Vec<SignApprovalEventPayload>>,
    expired_events: StdMutex<Vec<SignApprovalExpiredEventPayload>>,
    notify: Notify,
}

impl TestApprovalEmitter {
    pub(super) async fn wait_for_request(&self) -> SignApprovalEventPayload {
        self.wait_for_request_count(1).await
    }

    pub(super) async fn wait_for_request_count(&self, count: usize) -> SignApprovalEventPayload {
        loop {
            if let Some(payload) = self
                .events
                .lock()
                .expect("events lock")
                .get(count.saturating_sub(1))
                .cloned()
            {
                return payload;
            }
            self.notify.notified().await;
        }
    }

    pub(super) async fn wait_for_expired_request(&self) -> SignApprovalExpiredEventPayload {
        loop {
            if let Some(payload) = self
                .expired_events
                .lock()
                .expect("expired events lock")
                .first()
                .cloned()
            {
                return payload;
            }
            self.notify.notified().await;
        }
    }
}

impl ApprovalEventEmitter for TestApprovalEmitter {
    fn emit_sign_request(&self, payload: &SignApprovalEventPayload) -> Result<(), String> {
        self.events
            .lock()
            .expect("events lock")
            .push(payload.clone());
        self.notify.notify_waiters();
        Ok(())
    }

    fn emit_sign_request_expired(
        &self,
        payload: &SignApprovalExpiredEventPayload,
    ) -> Result<(), String> {
        self.expired_events
            .lock()
            .expect("expired events lock")
            .push(payload.clone());
        self.notify.notify_waiters();
        Ok(())
    }
}

pub(super) struct EnvVarGuard {
    name: &'static str,
    previous: Option<OsString>,
}

impl EnvVarGuard {
    pub(super) fn set(name: &'static str, value: impl AsRef<std::ffi::OsStr>) -> Self {
        let previous = std::env::var_os(name);
        // SAFETY: test environment mutation is serialized by env_lock() and restored on Drop.
        unsafe {
            std::env::set_var(name, value);
        }
        Self { name, previous }
    }
}

impl Drop for EnvVarGuard {
    fn drop(&mut self) {
        match self.previous.take() {
            // SAFETY: test environment mutation is serialized by env_lock() and restored on Drop.
            Some(value) => unsafe { std::env::set_var(self.name, value) },
            // SAFETY: test environment mutation is serialized by env_lock() and restored on Drop.
            None => unsafe { std::env::remove_var(self.name) },
        }
    }
}

pub(super) struct XdgConfigGuard {
    _guard: EnvVarGuard,
}

impl XdgConfigGuard {
    pub(super) fn set(path: &Path) -> Self {
        Self {
            _guard: EnvVarGuard::set("XDG_CONFIG_HOME", path),
        }
    }
}

pub(super) fn env_lock() -> &'static StdMutex<()> {
    static LOCK: OnceLock<StdMutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| StdMutex::new(()))
}

pub(super) async fn connect_with_retry(socket_path: &Path) -> UnixStream {
    for _ in 0..50 {
        match UnixStream::connect(socket_path).await {
            Ok(stream) => return stream,
            Err(_) => tokio::time::sleep(Duration::from_millis(20)).await,
        }
    }

    panic!("failed to connect to {}", socket_path.display());
}

pub(super) async fn wait_for_agent_ready(socket_path: &Path) {
    let stream = connect_with_retry(socket_path).await;
    drop(stream);
}

pub(super) fn shared_state(
    agent_state: &Arc<StdMutex<SshAgentState>>,
) -> Arc<tokio::sync::Mutex<AgentShared>> {
    let agent = agent_state.lock().expect("agent lock");
    agent.shared().expect("shared state")
}

pub(super) fn socket_path_for(agent_state: &Arc<StdMutex<SshAgentState>>) -> PathBuf {
    let agent = agent_state.lock().expect("agent lock");
    agent.socket_path().cloned().expect("socket path")
}

pub(super) fn available_tcp_port() -> u16 {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind ephemeral tcp port");
    let port = listener.local_addr().expect("local addr").port();
    drop(listener);
    port
}

pub(super) fn wait_for_sshd_ready(pid_file: &Path, child: &mut Child) -> bool {
    for _ in 0..20 {
        if pid_file.exists() {
            return true;
        }

        if let Ok(Some(_status)) = child.try_wait() {
            return false;
        }

        std::thread::sleep(Duration::from_millis(250));
    }

    pid_file.exists()
}

pub(super) fn current_user_name() -> String {
    std::env::var("USER")
        .ok()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "unknown".to_string())
}

pub(super) fn stop_process(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

fn command_output_with_timeout(mut command: Command, label: &str, redact_output: bool) -> Output {
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .unwrap_or_else(|error| panic!("{label}: failed to spawn command: {error}"));
    let started_at = std::time::Instant::now();

    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                return child
                    .wait_with_output()
                    .unwrap_or_else(|error| panic!("{label}: failed to collect output: {error}"));
            }
            Ok(None) if started_at.elapsed() >= OPENSSH_COMMAND_TIMEOUT => {
                let _ = child.kill();
                let output = child.wait_with_output().unwrap_or_else(|error| {
                    panic!("{label}: timed out and failed to collect output: {error}")
                });
                if redact_output {
                    panic!("{label}: timed out after {OPENSSH_COMMAND_TIMEOUT:?}");
                }
                panic!(
                    "{label}: timed out after {:?}: stdout={} stderr={}",
                    OPENSSH_COMMAND_TIMEOUT,
                    String::from_utf8_lossy(&output.stdout),
                    String::from_utf8_lossy(&output.stderr),
                );
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(error) => panic!("{label}: failed to wait on child: {error}"),
        }
    }
}

pub(super) async fn run_command_with_timeout(command: Command, label: &'static str) -> Output {
    tokio::task::spawn_blocking(move || command_output_with_timeout(command, label, false))
        .await
        .expect("join command task")
}

pub(super) async fn run_sensitive_command_with_timeout(
    command: Command,
    label: &'static str,
) -> Output {
    tokio::task::spawn_blocking(move || command_output_with_timeout(command, label, true))
        .await
        .expect("join command task")
}
