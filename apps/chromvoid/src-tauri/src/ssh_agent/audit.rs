use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use chrono::Utc;
use serde::Serialize;
use tokio::sync::{mpsc, oneshot};
use tokio::time::timeout;
use tracing::warn;

const DEFAULT_ROTATED_FILES: usize = 3;
const DEFAULT_ROTATE_BYTES: u64 = 256 * 1024;
const AUDIT_WRITE_QUEUE_SIZE: usize = 64;

#[derive(Clone)]
pub struct SshAgentAuditLog {
    writer: Arc<SshAgentAuditWriter>,
}

impl std::fmt::Debug for SshAgentAuditLog {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("SshAgentAuditLog")
            .field("path", &self.writer.path)
            .field("rotate_bytes", &self.writer.rotate_bytes)
            .field("rotated_files", &self.writer.rotated_files)
            .finish_non_exhaustive()
    }
}

struct SshAgentAuditWriter {
    path: PathBuf,
    rotate_bytes: u64,
    rotated_files: usize,
    closed: AtomicBool,
    sender: Mutex<Option<mpsc::Sender<AuditWriteJob>>>,
    task_handle: Mutex<Option<tokio::task::JoinHandle<()>>>,
}

impl SshAgentAuditLog {
    pub fn new(path: PathBuf) -> Self {
        Self {
            writer: Arc::new(SshAgentAuditWriter::new(
                path,
                DEFAULT_ROTATE_BYTES,
                DEFAULT_ROTATED_FILES,
            )),
        }
    }

    #[cfg(test)]
    pub fn new_for_tests(path: PathBuf, rotate_bytes: u64, rotated_files: usize) -> Self {
        Self {
            writer: Arc::new(SshAgentAuditWriter::new(path, rotate_bytes, rotated_files)),
        }
    }

    pub async fn log(&self, event: SshAgentAuditEvent) {
        let sender = match self.writer.sender() {
            Ok(sender) => sender,
            Err(error) => {
                warn!("ssh-agent: audit log writer unavailable: {error}");
                return;
            }
        };

        let (ack_tx, ack_rx) = oneshot::channel();
        if sender.send(AuditWriteJob { event, ack_tx }).await.is_err() {
            warn!("ssh-agent: audit log writer stopped before accepting event");
            return;
        }

        match ack_rx.await {
            Ok(Ok(())) => {}
            Ok(Err(AuditWriteFailure::Write(error))) => {
                warn!("ssh-agent: audit log write failed: {error}");
            }
            Ok(Err(AuditWriteFailure::Task(error))) => {
                warn!("ssh-agent: audit log task failed: {error}");
            }
            Err(_) => warn!("ssh-agent: audit log writer stopped before write completed"),
        }
    }

    pub async fn shutdown_with_grace(&self, grace: Duration) -> Result<(), String> {
        self.writer.shutdown_with_grace(grace).await
    }
}

impl SshAgentAuditWriter {
    fn new(path: PathBuf, rotate_bytes: u64, rotated_files: usize) -> Self {
        Self {
            path,
            rotate_bytes,
            rotated_files,
            closed: AtomicBool::new(false),
            sender: Mutex::new(None),
            task_handle: Mutex::new(None),
        }
    }

    fn sender(&self) -> Result<mpsc::Sender<AuditWriteJob>, String> {
        if self.closed.load(Ordering::Acquire) {
            return Err("SSH agent audit writer shut down".to_string());
        }

        let mut sender = self
            .sender
            .lock()
            .map_err(|_| "SSH agent audit writer mutex poisoned".to_string())?;
        let mut task_handle = self
            .task_handle
            .lock()
            .map_err(|_| "SSH agent audit writer task mutex poisoned".to_string())?;

        if self.closed.load(Ordering::Acquire) {
            return Err("SSH agent audit writer shut down".to_string());
        }

        if let Some(sender) = sender.as_ref().filter(|sender| !sender.is_closed()) {
            return Ok(sender.clone());
        }

        if let Some(handle) = task_handle.take() {
            if !handle.is_finished() {
                handle.abort();
            }
        }

        let (next_sender, receiver) = mpsc::channel(AUDIT_WRITE_QUEUE_SIZE);
        let handle = tokio::spawn(run_audit_writer(
            self.path.clone(),
            self.rotate_bytes,
            self.rotated_files,
            receiver,
        ));

        *sender = Some(next_sender.clone());
        *task_handle = Some(handle);
        Ok(next_sender)
    }

    async fn shutdown_with_grace(&self, grace: Duration) -> Result<(), String> {
        self.closed.store(true, Ordering::Release);
        let handle = self.take_writer_task()?;

        let Some(mut handle) = handle else {
            return Ok(());
        };

        if handle.is_finished() {
            return match handle.await {
                Ok(()) => Ok(()),
                Err(error) if error.is_cancelled() => Ok(()),
                Err(error) => Err(format!("SSH agent audit writer task failed: {error}")),
            };
        }

        if grace.is_zero() {
            handle.abort();
            return Err("SSH agent audit writer shutdown timed out".to_string());
        }

        match timeout(grace, async { (&mut handle).await }).await {
            Ok(Ok(())) => Ok(()),
            Ok(Err(error)) if error.is_cancelled() => Ok(()),
            Ok(Err(error)) => Err(format!("SSH agent audit writer task failed: {error}")),
            Err(_) => {
                handle.abort();
                Err("SSH agent audit writer shutdown timed out".to_string())
            }
        }
    }

    fn take_writer_task(&self) -> Result<Option<tokio::task::JoinHandle<()>>, String> {
        {
            let mut sender = self
                .sender
                .lock()
                .map_err(|_| "SSH agent audit writer mutex poisoned".to_string())?;
            sender.take();
        }

        let mut task_handle = self
            .task_handle
            .lock()
            .map_err(|_| "SSH agent audit writer task mutex poisoned".to_string())?;
        Ok(task_handle.take())
    }
}

impl Drop for SshAgentAuditWriter {
    fn drop(&mut self) {
        self.closed.store(true, Ordering::Release);
        match self.sender.lock() {
            Ok(mut sender) => {
                sender.take();
            }
            Err(_) => tracing::warn!("ssh_agent_audit: sender mutex poisoned during drop"),
        }
        match self.task_handle.lock() {
            Ok(mut task_handle) => {
                if let Some(handle) = task_handle.take() {
                    handle.abort();
                }
            }
            Err(_) => tracing::warn!("ssh_agent_audit: task handle mutex poisoned during drop"),
        }
    }
}

struct AuditWriteJob {
    event: SshAgentAuditEvent,
    ack_tx: oneshot::Sender<Result<(), AuditWriteFailure>>,
}

enum AuditWriteFailure {
    Write(String),
    Task(String),
}

async fn run_audit_writer(
    path: PathBuf,
    rotate_bytes: u64,
    rotated_files: usize,
    mut receiver: mpsc::Receiver<AuditWriteJob>,
) {
    while let Some(job) = receiver.recv().await {
        let path = path.clone();
        let event = job.event;
        let result = tauri::async_runtime::spawn_blocking(move || {
            append_event(&path, rotate_bytes, rotated_files, &event)
        })
        .await
        .map_err(|error| AuditWriteFailure::Task(error.to_string()))
        .and_then(|result| result.map_err(AuditWriteFailure::Write));

        let _ = job.ack_tx.send(result);
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct SshAgentAuditEvent {
    timestamp: String,
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    decision: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    approval_mode: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    socket_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    identities_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    connection_id: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    fingerprint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    comment: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    peer_pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    peer_process: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    host_hint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    latency_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stop_mode: Option<&'static str>,
}

impl SshAgentAuditEvent {
    fn base(kind: &'static str) -> Self {
        Self {
            timestamp: Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            kind,
            decision: None,
            approval_mode: None,
            reason: None,
            socket_path: None,
            identities_count: None,
            request_id: None,
            connection_id: None,
            fingerprint: None,
            comment: None,
            peer_pid: None,
            peer_process: None,
            host_hint: None,
            latency_ms: None,
            error: None,
            stop_mode: None,
        }
    }

    pub fn agent_start(socket_path: &Path, identities_count: usize) -> Self {
        let mut event = Self::base("agent_start");
        event.socket_path = Some(socket_path.display().to_string());
        event.identities_count = Some(identities_count);
        event
    }

    pub fn agent_stop(
        reason: &'static str,
        stop_mode: &'static str,
        socket_path: Option<&Path>,
        identities_count: usize,
    ) -> Self {
        let mut event = Self::base("agent_stop");
        event.reason = Some(reason);
        event.stop_mode = Some(stop_mode);
        event.socket_path = socket_path.map(|path| path.display().to_string());
        event.identities_count = Some(identities_count);
        event
    }

    #[allow(clippy::too_many_arguments)]
    pub fn approval_requested(
        request_id: &str,
        connection_id: u64,
        fingerprint: &str,
        comment: &str,
        peer_pid: Option<u32>,
        peer_process: Option<&str>,
        host_hint: Option<&str>,
    ) -> Self {
        let mut event = Self::base("approval_requested");
        event.request_id = Some(request_id.to_string());
        event.connection_id = Some(connection_id);
        event.fingerprint = Some(fingerprint.to_string());
        event.comment = Some(comment.to_string());
        event.peer_pid = peer_pid;
        event.peer_process = peer_process.map(str::to_string);
        event.host_hint = host_hint.map(str::to_string);
        event.approval_mode = Some("prompt");
        event
    }

    #[allow(clippy::too_many_arguments)]
    pub fn approval_resolved(
        request_id: &str,
        connection_id: u64,
        fingerprint: &str,
        comment: &str,
        peer_pid: Option<u32>,
        peer_process: Option<&str>,
        host_hint: Option<&str>,
        approved: bool,
        latency_ms: u64,
    ) -> Self {
        let mut event = Self::base("approval_resolved");
        event.request_id = Some(request_id.to_string());
        event.connection_id = Some(connection_id);
        event.fingerprint = Some(fingerprint.to_string());
        event.comment = Some(comment.to_string());
        event.peer_pid = peer_pid;
        event.peer_process = peer_process.map(str::to_string);
        event.host_hint = host_hint.map(str::to_string);
        event.approval_mode = Some("prompt");
        event.decision = Some(if approved { "approved" } else { "denied" });
        event.latency_ms = Some(latency_ms);
        event
    }

    #[allow(clippy::too_many_arguments)]
    pub fn approval_timeout(
        request_id: &str,
        connection_id: u64,
        fingerprint: &str,
        comment: &str,
        peer_pid: Option<u32>,
        peer_process: Option<&str>,
        host_hint: Option<&str>,
        latency_ms: u64,
    ) -> Self {
        let mut event = Self::base("approval_timeout");
        event.request_id = Some(request_id.to_string());
        event.connection_id = Some(connection_id);
        event.fingerprint = Some(fingerprint.to_string());
        event.comment = Some(comment.to_string());
        event.peer_pid = peer_pid;
        event.peer_process = peer_process.map(str::to_string);
        event.host_hint = host_hint.map(str::to_string);
        event.approval_mode = Some("prompt");
        event.decision = Some("timeout");
        event.latency_ms = Some(latency_ms);
        event
    }

    pub fn approval_stale(request_id: &str) -> Self {
        let mut event = Self::base("approval_stale");
        event.request_id = Some(request_id.to_string());
        event.decision = Some("stale");
        event
    }

    #[allow(clippy::too_many_arguments)]
    pub fn sign_result(
        connection_id: u64,
        fingerprint: &str,
        comment: &str,
        peer_pid: Option<u32>,
        peer_process: Option<&str>,
        host_hint: Option<&str>,
        success: bool,
        latency_ms: u64,
        error: Option<&str>,
    ) -> Self {
        let mut event = Self::base(if success {
            "sign_success"
        } else {
            "sign_failure"
        });
        event.connection_id = Some(connection_id);
        event.fingerprint = Some(fingerprint.to_string());
        event.comment = Some(comment.to_string());
        event.peer_pid = peer_pid;
        event.peer_process = peer_process.map(str::to_string);
        event.host_hint = host_hint.map(str::to_string);
        event.decision = Some(if success { "success" } else { "failure" });
        event.latency_ms = Some(latency_ms);
        event.error = error.map(str::to_string);
        event
    }
}

fn append_event(
    path: &Path,
    rotate_bytes: u64,
    rotated_files: usize,
    event: &SshAgentAuditEvent,
) -> Result<(), String> {
    let line =
        serde_json::to_string(event).map_err(|error| format!("serialize audit event: {error}"))?;
    append_line(path, rotate_bytes, rotated_files, &line)
}

fn append_line(
    path: &Path,
    rotate_bytes: u64,
    rotated_files: usize,
    line: &str,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("create audit dir '{}': {error}", parent.display()))?;
    }

    let next_len = line.len() as u64 + 1;
    if path.exists() {
        let metadata = std::fs::metadata(path)
            .map_err(|error| format!("stat audit log '{}': {error}", path.display()))?;
        if metadata.len().saturating_add(next_len) > rotate_bytes {
            rotate_files(path, rotated_files)?;
        }
    }

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| format!("open audit log '{}': {error}", path.display()))?;
    writeln!(file, "{line}")
        .map_err(|error| format!("append audit log '{}': {error}", path.display()))
}

fn rotate_files(path: &Path, rotated_files: usize) -> Result<(), String> {
    if rotated_files == 0 {
        std::fs::remove_file(path)
            .map_err(|error| format!("truncate audit log '{}': {error}", path.display()))?;
        return Ok(());
    }

    for index in (1..=rotated_files).rev() {
        let current = rotated_path(path, index);
        let next = rotated_path(path, index + 1);

        if index == rotated_files && current.exists() {
            std::fs::remove_file(&current).map_err(|error| {
                format!("remove rotated audit log '{}': {error}", current.display())
            })?;
            continue;
        }

        if current.exists() {
            std::fs::rename(&current, &next).map_err(|error| {
                format!(
                    "rotate audit log '{}' -> '{}': {error}",
                    current.display(),
                    next.display()
                )
            })?;
        }
    }

    let first_rotated = rotated_path(path, 1);
    if path.exists() {
        std::fs::rename(path, &first_rotated).map_err(|error| {
            format!(
                "rotate audit log '{}' -> '{}': {error}",
                path.display(),
                first_rotated.display()
            )
        })?;
    }

    Ok(())
}

fn rotated_path(path: &Path, index: usize) -> PathBuf {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("ssh-agent-audit.jsonl");
    path.with_file_name(format!("{file_name}.{index}"))
}

#[cfg(test)]
mod tests {
    use super::{append_line, rotated_path, SshAgentAuditEvent, SshAgentAuditLog};
    use std::fs;
    use std::sync::Arc;
    use std::time::Duration;

    #[tokio::test]
    async fn audit_log_rotates_bounded_jsonl_files() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let path = tempdir.path().join("audit").join("ssh-agent-audit.jsonl");
        let logger = SshAgentAuditLog::new_for_tests(path.clone(), 80, 2);

        logger
            .log(SshAgentAuditEvent::approval_stale("request-a"))
            .await;
        logger
            .log(SshAgentAuditEvent::approval_stale("request-b"))
            .await;
        logger
            .log(SshAgentAuditEvent::approval_stale("request-c"))
            .await;

        assert!(path.exists());
        assert!(rotated_path(&path, 1).exists());
        assert!(!rotated_path(&path, 3).exists());
    }

    #[test]
    fn audit_log_clones_share_writer() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let logger =
            SshAgentAuditLog::new_for_tests(tempdir.path().join("ssh-agent-audit.jsonl"), 1024, 1);
        let clone = logger.clone();

        assert!(Arc::ptr_eq(&logger.writer, &clone.writer));
    }

    #[tokio::test]
    async fn audit_log_serializes_concurrent_writes() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let path = tempdir.path().join("audit").join("ssh-agent-audit.jsonl");
        let logger = SshAgentAuditLog::new_for_tests(path.clone(), 1024 * 1024, 1);
        let mut tasks = Vec::new();

        for index in 0..16 {
            let logger = logger.clone();
            tasks.push(tokio::spawn(async move {
                logger
                    .log(SshAgentAuditEvent::approval_stale(&format!(
                        "request-{index}"
                    )))
                    .await;
            }));
        }

        for task in tasks {
            task.await.expect("audit write task");
        }

        let contents = fs::read_to_string(path).expect("read log");
        assert_eq!(contents.lines().count(), 16);
        for line in contents.lines() {
            serde_json::from_str::<serde_json::Value>(line).expect("audit line is json");
        }
    }

    #[tokio::test]
    async fn audit_log_shutdown_drains_and_rejects_late_writes() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let path = tempdir.path().join("audit").join("ssh-agent-audit.jsonl");
        let logger = SshAgentAuditLog::new_for_tests(path.clone(), 1024 * 1024, 1);

        logger
            .log(SshAgentAuditEvent::approval_stale(
                "request-before-shutdown",
            ))
            .await;
        logger
            .shutdown_with_grace(Duration::from_secs(1))
            .await
            .expect("audit writer shutdown");
        logger
            .log(SshAgentAuditEvent::approval_stale("request-after-shutdown"))
            .await;

        let contents = fs::read_to_string(path).expect("read log");
        assert_eq!(contents.lines().count(), 1);
        assert!(contents.contains("request-before-shutdown"));
        assert!(!contents.contains("request-after-shutdown"));
    }

    #[tokio::test]
    async fn audit_log_shutdown_is_idempotent() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let logger =
            SshAgentAuditLog::new_for_tests(tempdir.path().join("ssh-agent-audit.jsonl"), 1024, 1);

        logger
            .shutdown_with_grace(Duration::from_secs(1))
            .await
            .expect("first shutdown");
        logger
            .shutdown_with_grace(Duration::from_secs(1))
            .await
            .expect("second shutdown");
    }

    #[test]
    fn append_line_creates_parent_directory() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let path = tempdir.path().join("nested").join("ssh-agent-audit.jsonl");

        append_line(&path, 1024, 1, "{\"kind\":\"test\"}").expect("append line");

        let contents = fs::read_to_string(path).expect("read log");
        assert!(contents.contains("\"kind\":\"test\""));
    }
}
