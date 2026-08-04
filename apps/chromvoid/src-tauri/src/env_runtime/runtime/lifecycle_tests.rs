use super::super::observability::EnvRuntimeMetricsSnapshot;
use super::*;

use std::sync::{Arc, Mutex};
use tokio::sync::{oneshot, watch};

#[derive(Clone, Default)]
struct TestWriter(Arc<Mutex<Vec<u8>>>);

struct TestWriterGuard(Arc<Mutex<Vec<u8>>>);

impl std::io::Write for TestWriterGuard {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.0.lock().expect("log buffer").extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

impl<'writer> tracing_subscriber::fmt::MakeWriter<'writer> for TestWriter {
    type Writer = TestWriterGuard;

    fn make_writer(&'writer self) -> Self::Writer {
        TestWriterGuard(Arc::clone(&self.0))
    }
}

fn test_state() -> (tempfile::TempDir, EnvRuntimeState) {
    let tempdir = tempfile::tempdir().expect("tempdir");
    let state = EnvRuntimeState::new(tempdir.path().join("presets.enc.json")).expect("state");
    (tempdir, state)
}

fn run_metadata(id: &str, actor_id: &str, status: AgentRunStatusV1) -> AgentRunMetadataV1 {
    AgentRunMetadataV1 {
        id: id.to_string(),
        actor_id: actor_id.to_string(),
        profile_id: format!("profile-{actor_id}"),
        preset_id: format!("preset-{actor_id}"),
        status,
        process_id: None,
        started_at_epoch_ms: None,
        finished_at_epoch_ms: None,
        exit_code: None,
        signal: None,
    }
}

fn approval_snapshot(id: &str, actor_id: &str) -> RunApprovalSnapshot {
    RunApprovalSnapshot {
        run: run_metadata(id, actor_id, AgentRunStatusV1::ApprovalPending),
        actor_label: None,
        profile_label: format!("Profile {actor_id}"),
        profile_revision: 1,
        preset_label: format!("Preset {actor_id}"),
        preset_revision: 1,
        workspace_root: "/test/workspace".to_string(),
        executable: "/test/workspace/tool".to_string(),
        executable_sha256: "00".repeat(32),
        args: Vec::new(),
        cwd: "/test/workspace".to_string(),
        passthrough_env: Vec::new(),
        env_sources: Vec::new(),
        reason: None,
        created_at_epoch_ms: 1,
        expires_at_epoch_ms: u64::MAX,
    }
}

fn insert_approval(
    inner: &mut RuntimeInner,
    id: &str,
    actor_id: &str,
    session_id: &str,
) -> oneshot::Receiver<RunApprovalDecision> {
    let (sender, receiver) = oneshot::channel();
    inner.approvals.insert(
        id.to_string(),
        PendingRunApproval {
            snapshot: approval_snapshot(id, actor_id),
            session_id: session_id.to_string(),
            sender: Some(sender),
        },
    );
    receiver
}

fn insert_starting(inner: &mut RuntimeInner, id: &str, actor_id: &str, session_id: &str) {
    let mut snapshot = approval_snapshot(id, actor_id);
    snapshot.run.status = AgentRunStatusV1::Starting;
    inner.starting_runs.insert(
        id.to_string(),
        StartingRun {
            snapshot,
            session_id: session_id.to_string(),
        },
    );
}

fn insert_active(
    inner: &mut RuntimeInner,
    id: &str,
    actor_id: &str,
    session_id: &str,
) -> watch::Receiver<bool> {
    let (stop, receiver) = watch::channel(false);
    inner.active_runs.insert(
        id.to_string(),
        ActiveRunControl {
            metadata: run_metadata(id, actor_id, AgentRunStatusV1::Running),
            session_id: session_id.to_string(),
            stop,
        },
    );
    receiver
}

fn assert_recent_cancelled(inner: &RuntimeInner, expected_ids: &[&str]) {
    for id in expected_ids {
        let run = inner
            .recent_runs
            .iter()
            .find(|run| run.id == *id)
            .unwrap_or_else(|| panic!("missing terminal run {id}"));
        assert_eq!(run.status, AgentRunStatusV1::Cancelled);
        assert!(run.finished_at_epoch_ms.is_some());
    }
}

fn metric_count(metrics: &EnvRuntimeMetricsSnapshot, family: &str, key: &str) -> u64 {
    let counters = match family {
        "approval" => &metrics.approval_total,
        "run" => &metrics.run_total,
        _ => panic!("unknown metric family {family}"),
    };
    counters.get(key).copied().unwrap_or_default()
}

#[tokio::test]
async fn single_stop_cancels_pending_approval_and_preserves_actor_opacity() {
    let (_tempdir, state) = test_state();
    let (owned, mut other) = {
        let mut inner = state.inner.lock().expect("runtime state");
        let owned = insert_approval(&mut inner, "pending-owned", "actor-owned", "session-owned");
        let other = insert_approval(&mut inner, "pending-other", "actor-other", "session-other");
        insert_active(&mut inner, "active-other", "actor-other", "session-other");
        (owned, other)
    };

    let hidden = state
        .stop_run_for_actor("pending-other", "actor-owned")
        .await
        .expect_err("another actor's approval must stay opaque");
    assert_eq!(hidden.code, "RUN_NOT_FOUND");
    assert!(matches!(
        other.try_recv(),
        Err(oneshot::error::TryRecvError::Empty)
    ));
    let hidden_active = state
        .stop_run_for_actor("active-other", "actor-owned")
        .await
        .expect_err("another actor's active run must stay opaque");
    let missing = state
        .stop_run_for_actor("missing-run", "actor-owned")
        .await
        .expect_err("missing run");
    assert_eq!(hidden_active.code, missing.code);
    assert_eq!(hidden_active.message, missing.message);

    state
        .stop_run_for_actor("pending-owned", "actor-owned")
        .await
        .expect("stop pending approval");
    assert_eq!(
        owned.await.expect("pending cancellation decision"),
        RunApprovalDecision::Cancelled
    );
    let terminal = state
        .stop_run_for_actor("pending-owned", "actor-owned")
        .await
        .expect_err("known terminal run");
    assert_eq!(terminal.code, "RUN_ALREADY_TERMINAL");
    let hidden_terminal = state
        .stop_run_for_actor("pending-owned", "actor-other")
        .await
        .expect_err("another actor's terminal run must stay opaque");
    assert_eq!(hidden_terminal.code, "RUN_NOT_FOUND");

    let inner = state.inner.lock().expect("runtime state");
    assert!(inner.approvals.contains_key("pending-other"));
    assert!(inner.active_runs.contains_key("active-other"));
    assert_recent_cancelled(&inner, &["pending-owned"]);
}

#[tokio::test]
async fn vault_lock_cancels_unspawned_runs_without_signalling_active_run() {
    let (_tempdir, state) = test_state();
    let (approval, mut active_stop) = {
        let mut inner = state.inner.lock().expect("runtime state");
        let approval = insert_approval(&mut inner, "approval-lock", "actor", "session");
        insert_starting(&mut inner, "starting-lock", "actor", "session");
        let active_stop = insert_active(&mut inner, "active-lock", "actor", "session");
        (approval, active_stop)
    };

    state.cancel_pending_for_lock();

    assert_eq!(
        approval.await.expect("lock cancellation decision"),
        RunApprovalDecision::Cancelled
    );
    assert!(!active_stop.has_changed().expect("active stop channel"));
    assert!(!*active_stop.borrow_and_update());
    let inner = state.inner.lock().expect("runtime state");
    assert!(inner.approvals.is_empty());
    assert!(inner.starting_runs.is_empty());
    assert!(inner.active_runs.contains_key("active-lock"));
    assert_recent_cancelled(&inner, &["approval-lock", "starting-lock"]);
    drop(inner);

    let metrics = state.observability().snapshot();
    assert_eq!(metric_count(&metrics, "approval", "cancelled"), 1);
    assert_eq!(metric_count(&metrics, "run", "cancelled"), 2);
    assert_eq!(metrics.active_runs, 1);
}

#[tokio::test]
async fn session_disconnect_cancels_owned_unspawned_runs_and_signals_only_owned_active_runs() {
    let (_tempdir, state) = test_state();
    let (owned_approval, mut other_approval, mut owned_stop, mut other_stop) = {
        let mut inner = state.inner.lock().expect("runtime state");
        let owned_approval =
            insert_approval(&mut inner, "approval-owned", "actor-owned", "session-owned");
        let other_approval =
            insert_approval(&mut inner, "approval-other", "actor-other", "session-other");
        insert_starting(&mut inner, "starting-owned", "actor-owned", "session-owned");
        insert_starting(&mut inner, "starting-other", "actor-other", "session-other");
        let owned_stop = insert_active(&mut inner, "active-owned", "actor-owned", "session-owned");
        let other_stop = insert_active(&mut inner, "active-other", "actor-other", "session-other");
        (owned_approval, other_approval, owned_stop, other_stop)
    };

    state.stop_runs_for_session("session-owned").await;

    assert_eq!(
        owned_approval.await.expect("disconnect decision"),
        RunApprovalDecision::Cancelled
    );
    assert!(matches!(
        other_approval.try_recv(),
        Err(oneshot::error::TryRecvError::Empty)
    ));
    owned_stop.changed().await.expect("owned stop notification");
    assert!(*owned_stop.borrow_and_update());
    assert!(!other_stop.has_changed().expect("other stop channel"));
    assert!(!*other_stop.borrow_and_update());

    let inner = state.inner.lock().expect("runtime state");
    assert!(!inner.approvals.contains_key("approval-owned"));
    assert!(inner.approvals.contains_key("approval-other"));
    assert!(!inner.starting_runs.contains_key("starting-owned"));
    assert!(inner.starting_runs.contains_key("starting-other"));
    assert!(inner.active_runs.contains_key("active-owned"));
    assert!(inner.active_runs.contains_key("active-other"));
    assert_recent_cancelled(&inner, &["approval-owned", "starting-owned"]);
    assert!(inner
        .recent_runs
        .iter()
        .all(|run| !run.id.ends_with("-other")));
    drop(inner);

    let metrics = state.observability().snapshot();
    assert_eq!(metric_count(&metrics, "approval", "cancelled"), 1);
    assert_eq!(metric_count(&metrics, "run", "cancelled"), 2);
    assert_eq!(metrics.active_runs, 3);
}

#[tokio::test(flavor = "current_thread")]
async fn actor_stop_all_and_revocation_record_distinct_typed_terminal_reasons() {
    for (revoked, expected, forbidden) in [
        (false, "CANCELLED", "AGENT_REVOKED"),
        (true, "AGENT_REVOKED", "CANCELLED"),
    ] {
        let (_tempdir, state) = test_state();
        let approval = {
            let mut inner = state.inner.lock().expect("runtime state");
            let approval = insert_approval(&mut inner, "approval", "actor", "session");
            insert_starting(&mut inner, "starting", "actor", "session");
            approval
        };
        let writer = TestWriter::default();
        let subscriber = tracing_subscriber::fmt()
            .without_time()
            .with_ansi(false)
            .with_max_level(tracing::Level::INFO)
            .with_writer(writer.clone())
            .finish();
        let capture = tracing::subscriber::set_default(subscriber);

        if revoked {
            state.revoke_runs_for_actor("actor").await;
        } else {
            state.stop_runs_for_actor("actor").await;
        }
        drop(capture);

        assert_eq!(
            approval.await.expect("actor cancellation decision"),
            RunApprovalDecision::Cancelled
        );
        let log = String::from_utf8(writer.0.lock().expect("log buffer").clone())
            .expect("UTF-8 audit log");
        assert!(
            log.contains(&format!("error_code=\"{expected}\"")),
            "missing {expected} terminal reason: {log}"
        );
        assert!(
            !log.contains(&format!("error_code=\"{forbidden}\"")),
            "unexpected {forbidden} terminal reason: {log}"
        );
        let inner = state.inner.lock().expect("runtime state");
        assert_recent_cancelled(&inner, &["approval", "starting"]);
    }
}

#[tokio::test]
async fn normal_shutdown_cancels_all_unspawned_runs_and_signals_every_active_run() {
    let (_tempdir, state) = test_state();
    let (approval, mut first_stop, mut second_stop) = {
        let mut inner = state.inner.lock().expect("runtime state");
        let approval = insert_approval(&mut inner, "approval", "actor-a", "session-a");
        insert_starting(&mut inner, "starting", "actor-b", "session-b");
        let first_stop = insert_active(&mut inner, "active-a", "actor-a", "session-a");
        let second_stop = insert_active(&mut inner, "active-b", "actor-b", "session-b");
        (approval, first_stop, second_stop)
    };

    state.stop_all().await;

    assert_eq!(
        approval.await.expect("shutdown decision"),
        RunApprovalDecision::Cancelled
    );
    first_stop.changed().await.expect("first stop notification");
    second_stop
        .changed()
        .await
        .expect("second stop notification");
    assert!(*first_stop.borrow_and_update());
    assert!(*second_stop.borrow_and_update());
    let inner = state.inner.lock().expect("runtime state");
    assert!(inner.approvals.is_empty());
    assert!(inner.starting_runs.is_empty());
    assert_recent_cancelled(&inner, &["approval", "starting"]);
    drop(inner);

    let metrics = state.observability().snapshot();
    assert_eq!(metric_count(&metrics, "approval", "cancelled"), 1);
    assert_eq!(metric_count(&metrics, "run", "cancelled"), 2);
    assert_eq!(metrics.active_runs, 2);
}

#[tokio::test]
async fn expired_approval_is_accounted_once_and_never_as_rejected() {
    let (_tempdir, state) = test_state();
    let mut approval = {
        let mut inner = state.inner.lock().expect("runtime state");
        let receiver = insert_approval(&mut inner, "approval-expired", "actor", "session");
        inner
            .approvals
            .get_mut("approval-expired")
            .expect("inserted approval")
            .snapshot
            .expires_at_epoch_ms = 0;
        receiver
    };

    state.collect_expired().expect("first expiry collection");
    state.collect_expired().expect("second expiry collection");

    assert_eq!(
        approval.try_recv().expect("expiry decision"),
        RunApprovalDecision::Expired
    );
    let inner = state.inner.lock().expect("runtime state");
    assert!(inner.approvals.is_empty());
    assert_recent_cancelled(&inner, &["approval-expired"]);
    assert_eq!(
        inner
            .recent_runs
            .iter()
            .filter(|run| run.id == "approval-expired")
            .count(),
        1
    );
    drop(inner);

    let metrics = state.observability().snapshot();
    assert_eq!(metric_count(&metrics, "approval", "expired"), 1);
    assert_eq!(metric_count(&metrics, "approval", "rejected"), 0);
    assert_eq!(metric_count(&metrics, "run", "cancelled"), 1);
    assert_eq!(metrics.active_runs, 0);
}

#[cfg(unix)]
mod unix_process_groups {
    use super::*;

    use std::os::unix::process::{CommandExt as _, ExitStatusExt as _};
    use std::time::Duration;

    use tokio::io::{AsyncBufReadExt as _, BufReader};

    static PROCESS_GROUP_TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

    struct ProcessGroupGuard(Option<u32>);

    impl ProcessGroupGuard {
        fn new(process_group: u32) -> Self {
            Self(Some(process_group))
        }

        fn disarm(&mut self) {
            self.0 = None;
        }
    }

    impl Drop for ProcessGroupGuard {
        fn drop(&mut self) {
            if let Some(process_group) = self.0 {
                signal_process_group(process_group, libc::SIGKILL);
            }
        }
    }

    async fn spawn_group(script: &str) -> (tokio::process::Child, u32, i32) {
        let mut command = tokio::process::Command::new("/bin/sh");
        command
            .arg("-c")
            .arg(script)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        command.as_std_mut().process_group(0);
        let mut child = command.spawn().expect("spawn process group");
        let process_id = child.id().expect("process id");
        let stdout = child.stdout.take().expect("child stdout");
        let mut ready = String::new();
        tokio::time::timeout(
            Duration::from_secs(2),
            BufReader::new(stdout).read_line(&mut ready),
        )
        .await
        .expect("process group readiness timeout")
        .expect("read child pid");
        let descendant_id = ready.trim().parse::<i32>().expect("descendant pid");
        (child, process_id, descendant_id)
    }

    fn process_exists(process_id: i32) -> bool {
        // SAFETY: signal 0 only checks process existence/permissions.
        let result = unsafe { libc::kill(process_id, 0) };
        result == 0 || std::io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH)
    }

    async fn assert_group_and_descendant_gone(process_group: u32, descendant_id: i32) {
        let deadline = tokio::time::Instant::now() + Duration::from_secs(2);
        while tokio::time::Instant::now() < deadline
            && (process_group_exists(process_group) || process_exists(descendant_id))
        {
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        assert!(!process_group_exists(process_group), "process group leaked");
        assert!(!process_exists(descendant_id), "descendant process leaked");
    }

    fn forwarded_signals(receiver: &mut mpsc::Receiver<AgentEventDataV1>) -> Vec<i32> {
        let mut signals = Vec::new();
        while let Ok(event) = receiver.try_recv() {
            if let AgentEventDataV1::SignalForwarded { signal, .. } = event {
                signals.push(signal);
            }
        }
        signals
    }

    #[tokio::test]
    async fn graceful_group_stop_uses_term_and_leaves_no_descendant() {
        let _process_guard = PROCESS_GROUP_TEST_LOCK.lock().await;
        // Preserve the pipe before starting the asynchronous list: POSIX shells
        // otherwise redirect a background command's stdin from /dev/null.
        let script = "trap 'wait \"$child\" 2>/dev/null || true; exit 0' TERM; exec 3<&0; /bin/sh -c 'trap \"exit 0\" TERM; printf \"%s\\n\" \"$$\"; read _ <&3' & child=$!; wait \"$child\"";
        let (mut child, process_group, descendant_id) = spawn_group(script).await;
        let mut guard = ProcessGroupGuard::new(process_group);
        let (events, mut receiver) = mpsc::channel(8);

        let status = tokio::time::timeout(
            Duration::from_secs(5),
            terminate_process_group(&mut child, process_group, "graceful", &events),
        )
        .await
        .expect("graceful stop timeout")
        .expect("graceful exit status");

        assert!(
            status.success() || status.signal() == Some(libc::SIGTERM),
            "unexpected graceful exit status: {status:?}"
        );
        assert_eq!(forwarded_signals(&mut receiver), vec![libc::SIGTERM]);
        assert_group_and_descendant_gone(process_group, descendant_id).await;
        guard.disarm();
    }

    #[tokio::test]
    async fn term_ignoring_group_is_killed_after_grace_period_without_residual_child() {
        let _process_guard = PROCESS_GROUP_TEST_LOCK.lock().await;
        let script =
            "trap '' TERM; sleep 30 & child=$!; printf '%s\\n' \"$child\"; wait \"$child\"";
        let (mut child, process_group, descendant_id) = spawn_group(script).await;
        let mut guard = ProcessGroupGuard::new(process_group);
        let (events, mut receiver) = mpsc::channel(8);
        let started = tokio::time::Instant::now();

        let status = tokio::time::timeout(
            PROCESS_STOP_GRACE + Duration::from_secs(3),
            terminate_process_group(&mut child, process_group, "forced", &events),
        )
        .await
        .expect("forced stop timeout")
        .expect("forced exit status");

        assert!(started.elapsed() >= PROCESS_STOP_GRACE);
        assert_eq!(status.signal(), Some(libc::SIGKILL));
        assert_eq!(
            forwarded_signals(&mut receiver),
            vec![libc::SIGTERM, libc::SIGKILL]
        );
        assert_group_and_descendant_gone(process_group, descendant_id).await;
        guard.disarm();
    }
}
