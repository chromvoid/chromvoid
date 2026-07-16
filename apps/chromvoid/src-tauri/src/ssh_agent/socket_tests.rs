use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{UnixListener, UnixStream};
use tokio::sync::oneshot;

use super::audit::SshAgentAuditLog;
use super::protocol::{
    build_message, parse_message, SSH_AGENTC_REQUEST_IDENTITIES, SSH_AGENTC_SIGN_REQUEST,
    SSH_AGENT_FAILURE, SSH_AGENT_IDENTITIES_ANSWER, SSH_AGENT_SIGN_RESPONSE,
};
use super::signing::public_key_blob_from_openssh;
use super::test_support::{
    available_tcp_port, connect_with_retry, current_user_name, env_lock, run_command_with_timeout,
    shared_state, socket_path_for, stop_process, wait_for_agent_ready, wait_for_sshd_ready,
    TestApprovalEmitter, XdgConfigGuard,
};
use super::{stop_shared_state, SshAgentEntry, StopReason};

const ED25519_PRIVATE_KEY: &str = include_str!("testdata/ed25519");
const ED25519_PUBLIC_KEY: &str = include_str!("testdata/ed25519.pub");
const ECDSA_PUBLIC_KEY: &str = include_str!("testdata/ecdsa.pub");
fn build_sign_request(key_blob: &[u8], data: &[u8], flags: u32) -> Vec<u8> {
    let mut payload = Vec::new();
    payload.extend_from_slice(&(key_blob.len() as u32).to_be_bytes());
    payload.extend_from_slice(key_blob);
    payload.extend_from_slice(&(data.len() as u32).to_be_bytes());
    payload.extend_from_slice(data);
    payload.extend_from_slice(&flags.to_be_bytes());
    build_message(SSH_AGENTC_SIGN_REQUEST, &payload)
}

async fn read_agent_message(stream: &mut UnixStream) -> (u8, Vec<u8>) {
    let mut header = [0u8; 4];
    stream.read_exact(&mut header).await.expect("read header");
    let len = u32::from_be_bytes(header) as usize;
    let mut body = vec![0u8; len];
    stream.read_exact(&mut body).await.expect("read body");
    let mut framed = header.to_vec();
    framed.extend_from_slice(&body);
    let (msg_type, payload, _) = parse_message(&framed).expect("parse framed response");
    (msg_type, payload)
}

async fn read_optional_agent_message(stream: &mut UnixStream) -> Option<(u8, Vec<u8>)> {
    let mut header = [0u8; 4];
    match stream.read_exact(&mut header).await {
        Ok(_) => {}
        Err(_) => return None,
    }

    let len = u32::from_be_bytes(header) as usize;
    let mut body = vec![0u8; len];
    match stream.read_exact(&mut body).await {
        Ok(_) => {}
        Err(_) => return None,
    }

    let mut framed = header.to_vec();
    framed.extend_from_slice(&body);
    parse_message(&framed).map(|(msg_type, payload, _)| (msg_type, payload))
}

fn decode_sign_response(payload: &[u8]) -> Vec<u8> {
    let len = u32::from_be_bytes([payload[0], payload[1], payload[2], payload[3]]) as usize;
    payload[4..4 + len].to_vec()
}

fn public_key_fingerprint(public_key: &str) -> String {
    ssh_key::PublicKey::from_openssh(public_key)
        .expect("public key")
        .fingerprint(ssh_key::HashAlg::Sha256)
        .to_string()
}

fn single_test_entry(public_key: &str, comment: &str) -> Vec<SshAgentEntry> {
    vec![SshAgentEntry::new(
        "entry-a/key-a",
        public_key.to_string(),
        comment.to_string(),
    )]
}

fn read_audit_log(path: &Path) -> String {
    std::fs::read_to_string(path.join("audit").join("ssh-agent.jsonl")).expect("read audit log")
}

fn start_test_agent(
    approval_emitter: Arc<TestApprovalEmitter>,
    entries: Vec<SshAgentEntry>,
    audit_log: Option<Arc<SshAgentAuditLog>>,
    upstream_socket_path: Option<PathBuf>,
) -> Arc<StdMutex<super::SshAgentState>> {
    let agent_state = Arc::new(StdMutex::new(super::SshAgentState::new()));

    {
        let mut agent = agent_state.lock().expect("agent lock");
        agent
            .start(
                entries,
                upstream_socket_path,
                approval_emitter,
                audit_log,
                |_identity_key| {
                    Box::pin(async {
                        Some(zeroize::Zeroizing::new(ED25519_PRIVATE_KEY.to_string()))
                    })
                },
            )
            .expect("start ssh agent");
    }

    agent_state
}

async fn start_test_upstream(
    socket_path: &Path,
    identities: Vec<(Vec<u8>, String)>,
) -> tokio::task::JoinHandle<()> {
    let _ = std::fs::remove_file(socket_path);
    let listener = UnixListener::bind(socket_path).expect("bind upstream listener");
    let response = build_message(
        SSH_AGENT_IDENTITIES_ANSWER,
        &super::protocol::build_identities_answer(&identities)[5..],
    );

    tokio::spawn(async move {
        if let Ok((mut stream, _)) = listener.accept().await {
            let mut header = [0u8; 4];
            if stream.read_exact(&mut header).await.is_err() {
                return;
            }
            let len = u32::from_be_bytes(header) as usize;
            let mut body = vec![0u8; len];
            if stream.read_exact(&mut body).await.is_err() {
                return;
            }
            let _ = stream.write_all(&response).await;
        }
    })
}

#[tokio::test]
async fn socket_agent_lists_identities_and_signs_after_approval() {
    let _env_lock = env_lock()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    let tempdir = tempfile::tempdir().expect("tempdir");
    let _xdg_guard = XdgConfigGuard::set(tempdir.path());

    let approval_emitter = Arc::new(TestApprovalEmitter::default());
    let audit_log = Arc::new(SshAgentAuditLog::new(
        tempdir.path().join("audit").join("ssh-agent.jsonl"),
    ));
    let agent_state = start_test_agent(
        approval_emitter.clone(),
        single_test_entry(ED25519_PUBLIC_KEY, "deploy"),
        Some(audit_log),
        None,
    );

    let socket_path = socket_path_for(&agent_state);
    let mut stream = connect_with_retry(&socket_path).await;

    stream
        .write_all(&build_message(SSH_AGENTC_REQUEST_IDENTITIES, &[]))
        .await
        .expect("write identities request");
    let (msg_type, payload) = read_agent_message(&mut stream).await;
    assert_eq!(msg_type, SSH_AGENT_IDENTITIES_ANSWER);
    let identities = super::protocol::parse_identities_answer(&payload).expect("parse identities");
    assert_eq!(identities.len(), 1);

    let key_blob = public_key_blob_from_openssh(ED25519_PUBLIC_KEY).expect("key blob");
    stream
        .write_all(&build_sign_request(&key_blob, b"socket sign", 0))
        .await
        .expect("write sign request");

    let approval = approval_emitter.wait_for_request().await;
    assert_eq!(approval.comment, "deploy");
    assert!(approval.peer_pid.is_none() || approval.peer_pid == Some(std::process::id()));

    {
        let shared = shared_state(&agent_state);
        let mut shared = shared.lock().await;
        let resolution = shared
            .resolve_approval(&approval.request_id, true)
            .expect("approval must exist");
        assert!(resolution.delivered);
    }

    let (msg_type, payload) = read_agent_message(&mut stream).await;
    assert_eq!(msg_type, SSH_AGENT_SIGN_RESPONSE);
    let signature = ssh_key::Signature::try_from(decode_sign_response(&payload).as_slice())
        .expect("decode signature");
    let public_key = ssh_key::PublicKey::from_openssh(ED25519_PUBLIC_KEY).expect("public key");
    signature::Verifier::verify(&public_key, b"socket sign", &signature)
        .expect("signature verifies");

    stop_shared_state(&agent_state, StopReason::Manual).await;

    let audit = read_audit_log(tempdir.path());
    assert!(audit.contains("\"kind\":\"agent_start\""));
    assert!(audit.contains("\"kind\":\"approval_requested\""));
    assert!(audit.contains("\"kind\":\"sign_success\""));
    assert!(audit.contains("\"kind\":\"agent_stop\""));
}

#[tokio::test]
async fn sign_approval_is_per_key_within_one_connection() {
    let _env_lock = env_lock()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    let tempdir = tempfile::tempdir().expect("tempdir");
    let _xdg_guard = XdgConfigGuard::set(tempdir.path());

    let approval_emitter = Arc::new(TestApprovalEmitter::default());
    let ed25519_key_blob = public_key_blob_from_openssh(ED25519_PUBLIC_KEY).expect("ed25519 blob");
    let ecdsa_key_blob = public_key_blob_from_openssh(ECDSA_PUBLIC_KEY).expect("ecdsa blob");
    let ed25519_fingerprint = public_key_fingerprint(ED25519_PUBLIC_KEY);
    let ecdsa_fingerprint = public_key_fingerprint(ECDSA_PUBLIC_KEY);
    let agent_state = start_test_agent(
        approval_emitter.clone(),
        vec![
            SshAgentEntry::new("entry-a/key-a", ED25519_PUBLIC_KEY, "deploy-a"),
            SshAgentEntry::new("entry-b/key-b", ECDSA_PUBLIC_KEY, "deploy-b"),
        ],
        None,
        None,
    );
    let socket_path = socket_path_for(&agent_state);
    wait_for_agent_ready(&socket_path).await;

    let mut stream = connect_with_retry(&socket_path).await;
    stream
        .write_all(&build_sign_request(&ed25519_key_blob, b"key a", 0))
        .await
        .expect("write key-a sign request");
    let approval_a = approval_emitter.wait_for_request().await;
    assert_eq!(approval_a.fingerprint, ed25519_fingerprint);
    {
        let shared = shared_state(&agent_state);
        shared
            .lock()
            .await
            .resolve_approval(&approval_a.request_id, true)
            .expect("approval a must exist");
    }
    let (msg_type, _) = read_agent_message(&mut stream).await;
    assert_eq!(msg_type, SSH_AGENT_SIGN_RESPONSE);

    stream
        .write_all(&build_sign_request(&ecdsa_key_blob, b"key b", 0))
        .await
        .expect("write key-b sign request");
    let approval_b = tokio::time::timeout(
        Duration::from_secs(2),
        approval_emitter.wait_for_request_count(2),
    )
    .await
    .expect("second key should require its own approval");
    assert_eq!(approval_b.fingerprint, ecdsa_fingerprint);
    {
        let shared = shared_state(&agent_state);
        shared
            .lock()
            .await
            .resolve_approval(&approval_b.request_id, true)
            .expect("approval b must exist");
    }
    let (msg_type, _) = read_agent_message(&mut stream).await;
    assert_eq!(msg_type, SSH_AGENT_SIGN_RESPONSE);

    stop_shared_state(&agent_state, StopReason::Manual).await;
}

#[tokio::test]
async fn sign_request_denied_returns_failure_and_never_signs() {
    let _env_lock = env_lock()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    let tempdir = tempfile::tempdir().expect("tempdir");
    let _xdg_guard = XdgConfigGuard::set(tempdir.path());

    let approval_emitter = Arc::new(TestApprovalEmitter::default());
    let audit_log = Arc::new(SshAgentAuditLog::new(
        tempdir.path().join("audit").join("ssh-agent.jsonl"),
    ));
    let agent_state = start_test_agent(
        approval_emitter.clone(),
        single_test_entry(ED25519_PUBLIC_KEY, "deploy"),
        Some(audit_log),
        None,
    );

    let socket_path = socket_path_for(&agent_state);
    let mut stream = connect_with_retry(&socket_path).await;
    let key_blob = public_key_blob_from_openssh(ED25519_PUBLIC_KEY).expect("key blob");
    stream
        .write_all(&build_sign_request(&key_blob, b"deny me", 0))
        .await
        .expect("write sign request");

    let approval = approval_emitter.wait_for_request().await;
    {
        let shared = shared_state(&agent_state);
        let mut shared = shared.lock().await;
        let resolution = shared
            .resolve_approval(&approval.request_id, false)
            .expect("approval must exist");
        assert!(resolution.delivered);
    }

    let (msg_type, payload) = read_agent_message(&mut stream).await;
    assert_eq!(msg_type, SSH_AGENT_FAILURE);
    assert!(payload.is_empty());

    stop_shared_state(&agent_state, StopReason::Manual).await;

    let audit = read_audit_log(tempdir.path());
    assert!(audit.contains("\"kind\":\"approval_requested\""));
    assert!(!audit.contains("\"kind\":\"sign_success\""));
}

#[tokio::test]
async fn sign_request_timeout_fails_closed_and_records_timeout() {
    let _env_lock = env_lock()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    let tempdir = tempfile::tempdir().expect("tempdir");
    let _xdg_guard = XdgConfigGuard::set(tempdir.path());

    let approval_emitter = Arc::new(TestApprovalEmitter::default());
    let audit_log = Arc::new(SshAgentAuditLog::new(
        tempdir.path().join("audit").join("ssh-agent.jsonl"),
    ));
    let agent_state = start_test_agent(
        approval_emitter.clone(),
        single_test_entry(ED25519_PUBLIC_KEY, "deploy"),
        Some(audit_log),
        None,
    );

    let socket_path = socket_path_for(&agent_state);
    let mut stream = connect_with_retry(&socket_path).await;
    let key_blob = public_key_blob_from_openssh(ED25519_PUBLIC_KEY).expect("key blob");
    stream
        .write_all(&build_sign_request(&key_blob, b"timeout me", 0))
        .await
        .expect("write sign request");

    let approval = approval_emitter.wait_for_request().await;
    {
        let shared = shared_state(&agent_state);
        let mut shared = shared.lock().await;
        let mut pending = shared
            .take_pending_approval(&approval.request_id)
            .expect("pending approval");
        let (dummy_tx, _dummy_rx) = oneshot::channel();
        drop(pending.tx);
        pending.tx = dummy_tx;
        shared.insert_pending_approval(pending);
    }

    let (msg_type, payload) = read_agent_message(&mut stream).await;
    assert_eq!(msg_type, SSH_AGENT_FAILURE);
    assert!(payload.is_empty());
    let expired = approval_emitter.wait_for_expired_request().await;
    assert_eq!(expired.request_id, approval.request_id);
    assert_eq!(expired.reason, "cancelled");

    stop_shared_state(&agent_state, StopReason::Manual).await;

    let audit = read_audit_log(tempdir.path());
    assert!(audit.contains("\"kind\":\"approval_timeout\""));
    assert!(!audit.contains("\"kind\":\"sign_success\""));
}

#[tokio::test]
async fn vault_lock_stop_denies_pending_approval_fail_closed() {
    let _env_lock = env_lock()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    let tempdir = tempfile::tempdir().expect("tempdir");
    let _xdg_guard = XdgConfigGuard::set(tempdir.path());

    let approval_emitter = Arc::new(TestApprovalEmitter::default());
    let agent_state = start_test_agent(
        approval_emitter.clone(),
        single_test_entry(ED25519_PUBLIC_KEY, "deploy"),
        None,
        None,
    );

    let socket_path = socket_path_for(&agent_state);
    let mut stream = connect_with_retry(&socket_path).await;
    let key_blob = public_key_blob_from_openssh(ED25519_PUBLIC_KEY).expect("key blob");
    stream
        .write_all(&build_sign_request(&key_blob, b"stop me", 0))
        .await
        .expect("write sign request");

    let approval = approval_emitter.wait_for_request().await;
    assert!(!approval.request_id.is_empty());

    stop_shared_state(&agent_state, StopReason::VaultLock).await;
    let expired = approval_emitter.wait_for_expired_request().await;
    assert_eq!(expired.request_id, approval.request_id);
    assert_eq!(expired.reason, "vault_lock");

    let response = tokio::time::timeout(
        Duration::from_millis(250),
        read_optional_agent_message(&mut stream),
    )
    .await
    .ok()
    .flatten();
    if let Some((msg_type, _)) = response {
        assert_eq!(msg_type, SSH_AGENT_FAILURE);
    }
    let agent = agent_state.lock().expect("agent lock");
    assert!(!agent.is_running());
    assert_eq!(agent.identities_count(), 0);
}

#[tokio::test]
async fn immediate_stop_clears_runtime_state_synchronously() {
    let _env_lock = env_lock()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    let tempdir = tempfile::tempdir().expect("tempdir");
    let _xdg_guard = XdgConfigGuard::set(tempdir.path());

    let approval_emitter = Arc::new(TestApprovalEmitter::default());
    let agent_state = start_test_agent(
        approval_emitter,
        single_test_entry(ED25519_PUBLIC_KEY, "deploy"),
        None,
        None,
    );

    let mut agent = agent_state.lock().expect("agent lock");
    assert!(agent.is_running());
    assert!(agent.socket_path().is_some());
    assert_eq!(agent.identities_count(), 1);

    agent.stop_with_reason(StopReason::VaultLock);

    assert!(!agent.is_running());
    assert!(agent.socket_path().is_none());
    assert_eq!(agent.identities_count(), 0);
}

#[tokio::test]
async fn stop_shared_state_drains_immediate_audit_cleanup() {
    let _env_lock = env_lock()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    let tempdir = tempfile::tempdir().expect("tempdir");
    let _xdg_guard = XdgConfigGuard::set(tempdir.path());

    let approval_emitter = Arc::new(TestApprovalEmitter::default());
    let audit_log = Arc::new(SshAgentAuditLog::new(
        tempdir.path().join("audit").join("ssh-agent.jsonl"),
    ));
    let agent_state = start_test_agent(
        approval_emitter.clone(),
        single_test_entry(ED25519_PUBLIC_KEY, "deploy"),
        Some(audit_log),
        None,
    );

    let socket_path = socket_path_for(&agent_state);
    let mut stream = connect_with_retry(&socket_path).await;
    let key_blob = public_key_blob_from_openssh(ED25519_PUBLIC_KEY).expect("key blob");
    stream
        .write_all(&build_sign_request(&key_blob, b"stop with audit", 0))
        .await
        .expect("write sign request");

    let approval = approval_emitter.wait_for_request().await;
    assert!(!approval.request_id.is_empty());

    stop_shared_state(&agent_state, StopReason::VaultLock).await;

    let audit = read_audit_log(tempdir.path());
    assert!(audit.contains("\"kind\":\"approval_resolved\""));
    assert!(audit.contains("\"decision\":\"denied\""));
    assert!(audit.contains("\"reason\":\"vault_lock\""));
    assert!(audit.contains("\"stop_mode\":\"immediate\""));
}

#[tokio::test]
async fn stale_approval_resolve_is_rejected_after_stop() {
    let _env_lock = env_lock()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    let tempdir = tempfile::tempdir().expect("tempdir");
    let _xdg_guard = XdgConfigGuard::set(tempdir.path());

    let approval_emitter = Arc::new(TestApprovalEmitter::default());
    let agent_state = start_test_agent(
        approval_emitter.clone(),
        single_test_entry(ED25519_PUBLIC_KEY, "deploy"),
        None,
        None,
    );

    let shared = shared_state(&agent_state);
    let socket_path = socket_path_for(&agent_state);
    let mut stream = connect_with_retry(&socket_path).await;
    let key_blob = public_key_blob_from_openssh(ED25519_PUBLIC_KEY).expect("key blob");
    stream
        .write_all(&build_sign_request(&key_blob, b"stop before resolve", 0))
        .await
        .expect("write sign request");

    let approval = approval_emitter.wait_for_request().await;
    stop_shared_state(&agent_state, StopReason::VaultLock).await;

    let stale = tokio::time::timeout(Duration::from_millis(250), async {
        loop {
            let mut guard = shared.lock().await;
            if guard.resolve_approval(&approval.request_id, true).is_none() {
                break true;
            }
            drop(guard);
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("stale approval should settle");
    assert!(stale);
}

#[tokio::test]
async fn sign_request_for_unknown_key_fails_without_emitting_approval() {
    let _env_lock = env_lock()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    let tempdir = tempfile::tempdir().expect("tempdir");
    let _xdg_guard = XdgConfigGuard::set(tempdir.path());

    let approval_emitter = Arc::new(TestApprovalEmitter::default());
    let agent_state = start_test_agent(
        approval_emitter.clone(),
        single_test_entry(ED25519_PUBLIC_KEY, "deploy"),
        None,
        None,
    );

    let socket_path = socket_path_for(&agent_state);
    let mut stream = connect_with_retry(&socket_path).await;
    let unknown_key_blob =
        public_key_blob_from_openssh(ECDSA_PUBLIC_KEY).expect("unknown key blob");
    stream
        .write_all(&build_sign_request(&unknown_key_blob, b"unknown key", 0))
        .await
        .expect("write sign request");

    let (msg_type, payload) = read_agent_message(&mut stream).await;
    assert_eq!(msg_type, SSH_AGENT_FAILURE);
    assert!(payload.is_empty());

    tokio::time::sleep(Duration::from_millis(50)).await;
    assert!(approval_emitter
        .events
        .lock()
        .expect("events lock")
        .is_empty());

    stop_shared_state(&agent_state, StopReason::Manual).await;
}

#[tokio::test]
async fn upstream_and_local_identity_merge_is_stable_and_deduplicated() {
    let _env_lock = env_lock()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    let tempdir = tempfile::tempdir().expect("tempdir");
    let _xdg_guard = XdgConfigGuard::set(tempdir.path());

    let approval_emitter = Arc::new(TestApprovalEmitter::default());
    let local_key_blob = public_key_blob_from_openssh(ED25519_PUBLIC_KEY).expect("local key blob");
    let upstream_unique_key_blob =
        public_key_blob_from_openssh(ECDSA_PUBLIC_KEY).expect("upstream unique key blob");
    let upstream_socket_path = tempdir.path().join("upstream.sock");
    let upstream = start_test_upstream(
        &upstream_socket_path,
        vec![
            (local_key_blob.clone(), "duplicate-local".to_string()),
            (
                upstream_unique_key_blob.clone(),
                "upstream-only".to_string(),
            ),
        ],
    )
    .await;
    let agent_state = start_test_agent(
        approval_emitter,
        single_test_entry(ED25519_PUBLIC_KEY, "local-first"),
        None,
        Some(upstream_socket_path),
    );

    let socket_path = socket_path_for(&agent_state);
    let mut stream = connect_with_retry(&socket_path).await;
    stream
        .write_all(&build_message(SSH_AGENTC_REQUEST_IDENTITIES, &[]))
        .await
        .expect("write identities request");

    let (msg_type, payload) = read_agent_message(&mut stream).await;
    assert_eq!(msg_type, SSH_AGENT_IDENTITIES_ANSWER);
    let identities = super::protocol::parse_identities_answer(&payload).expect("parse identities");
    assert_eq!(identities.len(), 2);
    assert_eq!(identities[0], (local_key_blob, "local-first".to_string()));
    assert_eq!(
        identities[1],
        (upstream_unique_key_blob, "upstream-only".to_string())
    );

    stop_shared_state(&agent_state, StopReason::Manual).await;
    upstream.abort();
}

#[tokio::test]
async fn manual_and_app_shutdown_keep_graceful_stop_contract() {
    let _env_lock = env_lock()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    let tempdir = tempfile::tempdir().expect("tempdir");
    let _xdg_guard = XdgConfigGuard::set(tempdir.path());

    let audit_log = Arc::new(SshAgentAuditLog::new(
        tempdir.path().join("audit").join("ssh-agent.jsonl"),
    ));
    let approval_emitter = Arc::new(TestApprovalEmitter::default());
    let agent_state = start_test_agent(
        approval_emitter,
        single_test_entry(ED25519_PUBLIC_KEY, "deploy"),
        Some(audit_log.clone()),
        None,
    );

    stop_shared_state(&agent_state, StopReason::Manual).await;

    let audit_log = Arc::new(SshAgentAuditLog::new(
        tempdir.path().join("audit").join("ssh-agent.jsonl"),
    ));
    let second_agent_state = start_test_agent(
        Arc::new(TestApprovalEmitter::default()),
        single_test_entry(ED25519_PUBLIC_KEY, "deploy"),
        Some(audit_log),
        None,
    );
    stop_shared_state(&second_agent_state, StopReason::AppShutdown).await;

    let audit = read_audit_log(tempdir.path());
    assert!(audit.contains("\"reason\":\"manual_stop\""));
    assert!(audit.contains("\"reason\":\"app_shutdown\""));
    assert!(audit.contains("\"stop_mode\":\"graceful\""));
    assert!(!audit.contains("\"stop_mode\":\"immediate\""));
}

#[tokio::test]
async fn start_fails_closed_when_socket_path_cannot_bind() {
    let _env_lock = env_lock()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    let tempdir = tempfile::tempdir().expect("tempdir");
    let _xdg_guard = XdgConfigGuard::set(tempdir.path());
    let socket_parent = tempdir.path().join("chromvoid");
    std::fs::create_dir_all(&socket_parent).expect("socket parent");
    std::fs::write(socket_parent.join("agent.sock"), b"not a socket").expect("socket blocker");

    let mut agent = super::SshAgentState::new();
    let error = agent
        .start(
            single_test_entry(ED25519_PUBLIC_KEY, "deploy"),
            None,
            Arc::new(TestApprovalEmitter::default()),
            None,
            |_identity_key| {
                Box::pin(async { Some(zeroize::Zeroizing::new(ED25519_PRIVATE_KEY.to_string())) })
            },
        )
        .expect_err("non-socket path must fail start");

    assert!(error.contains("refusing to remove non-socket path"));
    assert!(!agent.is_running());
    assert!(agent.socket_path().is_none());
    assert_eq!(agent.identities_count(), 0);
}

#[tokio::test]
#[ignore = "requires local OpenSSH desktop tools"]
async fn openssh_cli_can_list_and_sign_against_chromvoid_agent() {
    let _env_lock = env_lock()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    let tempdir = tempfile::tempdir().expect("tempdir");
    let _xdg_guard = XdgConfigGuard::set(tempdir.path());

    let approval_emitter = Arc::new(TestApprovalEmitter::default());
    let agent_state = start_test_agent(
        approval_emitter.clone(),
        single_test_entry(ED25519_PUBLIC_KEY, "deploy"),
        None,
        None,
    );

    let socket_path = socket_path_for(&agent_state);
    wait_for_agent_ready(&socket_path).await;

    let mut list_command = Command::new("ssh-add");
    list_command.arg("-L").env("SSH_AUTH_SOCK", &socket_path);
    let list_output = run_command_with_timeout(list_command, "ssh-add -L").await;
    assert!(
        list_output.status.success(),
        "ssh-add failed: {}",
        String::from_utf8_lossy(&list_output.stderr)
    );
    assert!(String::from_utf8_lossy(&list_output.stdout).contains("ssh-ed25519 "));

    let public_key_path = tempdir.path().join("key.pub");
    let data_path = tempdir.path().join("message.txt");
    std::fs::write(&public_key_path, ED25519_PUBLIC_KEY).expect("write public key");
    std::fs::write(&data_path, "ssh agent cli sign").expect("write message");

    let socket_path_for_command = socket_path.clone();
    let public_key_path_for_command = public_key_path.clone();
    let data_path_for_command = data_path.clone();
    let sign_task = tokio::spawn(async move {
        let mut command = Command::new("ssh-keygen");
        command
            .args([
                "-Y",
                "sign",
                "-U",
                "-f",
                public_key_path_for_command.to_str().expect("key path"),
                "-n",
                "file",
                data_path_for_command.to_str().expect("data path"),
            ])
            .env("SSH_AUTH_SOCK", socket_path_for_command);
        run_command_with_timeout(command, "ssh-keygen -Y sign approve").await
    });

    let approval = approval_emitter.wait_for_request().await;
    {
        let shared = {
            let agent = agent_state.lock().expect("agent lock");
            agent.shared().expect("shared state")
        };
        let mut shared = shared.lock().await;
        let resolution = shared
            .resolve_approval(&approval.request_id, true)
            .expect("approval must exist");
        assert!(resolution.delivered);
    }

    let sign_output = sign_task.await.expect("join sign task");
    assert!(
        sign_output.status.success(),
        "ssh-keygen sign failed: {}",
        String::from_utf8_lossy(&sign_output.stderr)
    );
    assert!(data_path.with_extension("txt.sig").exists());

    let deny_socket_path_for_command = socket_path.clone();
    let deny_public_key_path_for_command = public_key_path.clone();
    let deny_data_path_for_command = data_path.clone();
    let deny_task = tokio::spawn(async move {
        let mut command = Command::new("ssh-keygen");
        command
            .args([
                "-Y",
                "sign",
                "-U",
                "-f",
                deny_public_key_path_for_command.to_str().expect("key path"),
                "-n",
                "file",
                deny_data_path_for_command.to_str().expect("data path"),
            ])
            .env("SSH_AUTH_SOCK", deny_socket_path_for_command);
        run_command_with_timeout(command, "ssh-keygen -Y sign deny").await
    });

    let deny_approval = approval_emitter.wait_for_request_count(2).await;
    {
        let shared = shared_state(&agent_state);
        let mut shared = shared.lock().await;
        let resolution = shared
            .resolve_approval(&deny_approval.request_id, false)
            .expect("deny approval must exist");
        assert!(resolution.delivered);
    }

    let deny_output = deny_task.await.expect("join deny sign task");
    assert!(
        !deny_output.status.success(),
        "deny sign unexpectedly succeeded: {}",
        String::from_utf8_lossy(&deny_output.stderr)
    );

    stop_shared_state(&agent_state, StopReason::Manual).await;
}

#[tokio::test]
#[ignore = "requires local OpenSSH desktop tools and local sshd"]
async fn openssh_cli_localhost_login_approve_path_succeeds() {
    let _env_lock = env_lock()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    let tempdir = tempfile::tempdir().expect("tempdir");
    let _xdg_guard = XdgConfigGuard::set(tempdir.path());

    let approval_emitter = Arc::new(TestApprovalEmitter::default());
    let agent_state = start_test_agent(
        approval_emitter.clone(),
        single_test_entry(ED25519_PUBLIC_KEY, "deploy"),
        None,
        None,
    );

    let socket_path = socket_path_for(&agent_state);
    wait_for_agent_ready(&socket_path).await;
    let host_key_path = tempdir.path().join("hostkey");
    let authorized_keys_path = tempdir.path().join("authorized_keys");
    let pid_file = tempdir.path().join("sshd.pid");
    let log_path = tempdir.path().join("sshd.log");
    let sshd_config_path = tempdir.path().join("sshd_config");
    let ssh_config_path = tempdir.path().join("ssh_config");
    let port = available_tcp_port();
    let user_name = current_user_name();

    let mut hostkey_command = Command::new("ssh-keygen");
    hostkey_command.args([
        "-q",
        "-t",
        "ed25519",
        "-N",
        "",
        "-f",
        host_key_path.to_str().expect("hostkey path"),
    ]);
    let hostkey_output =
        run_command_with_timeout(hostkey_command, "ssh-keygen hostkey approve").await;
    assert!(
        hostkey_output.status.success(),
        "failed to generate host key: {}",
        String::from_utf8_lossy(&hostkey_output.stderr)
    );

    std::fs::write(&authorized_keys_path, ED25519_PUBLIC_KEY).expect("write authorized_keys");
    std::fs::write(
        &sshd_config_path,
        format!(
            "Port {port}\n\
ListenAddress 127.0.0.1\n\
HostKey {}\n\
PidFile {}\n\
AuthorizedKeysFile {}\n\
PasswordAuthentication no\n\
KbdInteractiveAuthentication no\n\
ChallengeResponseAuthentication no\n\
PubkeyAuthentication yes\n\
UsePAM no\n\
PermitRootLogin no\n\
AllowUsers {user_name}\n\
StrictModes no\n\
LogLevel VERBOSE\n",
            host_key_path.display(),
            pid_file.display(),
            authorized_keys_path.display(),
        ),
    )
    .expect("write sshd config");
    std::fs::write(
        &ssh_config_path,
        format!(
            "Host chromvoid-local\n\
  HostName 127.0.0.1\n\
  Port {port}\n\
  User {user_name}\n\
  IdentityAgent {}\n\
  PreferredAuthentications publickey\n\
  PubkeyAuthentication yes\n\
  PasswordAuthentication no\n\
  KbdInteractiveAuthentication no\n\
  BatchMode yes\n\
  StrictHostKeyChecking no\n\
  UserKnownHostsFile /dev/null\n",
            socket_path.display(),
        ),
    )
    .expect("write ssh config");

    let log_file = std::fs::File::create(&log_path).expect("create sshd log");
    let mut sshd = Command::new("/usr/sbin/sshd")
        .args([
            "-D",
            "-e",
            "-f",
            sshd_config_path.to_str().expect("sshd config path"),
        ])
        .stdout(log_file.try_clone().expect("clone log file"))
        .stderr(log_file)
        .spawn()
        .expect("spawn sshd");

    assert!(
        wait_for_sshd_ready(&pid_file, &mut sshd),
        "sshd did not become ready: {}",
        std::fs::read_to_string(&log_path).unwrap_or_default()
    );

    let ssh_config_path_for_command = ssh_config_path.clone();
    let ssh_task = tokio::spawn(async move {
        let mut command = Command::new("ssh");
        command.args([
            "-F",
            ssh_config_path_for_command
                .to_str()
                .expect("ssh config path"),
            "chromvoid-local",
            "echo chromvoid-ok",
        ]);
        run_command_with_timeout(command, "ssh localhost approve").await
    });

    let approval = approval_emitter.wait_for_request().await;
    {
        let shared = shared_state(&agent_state);
        let mut shared = shared.lock().await;
        let resolution = shared
            .resolve_approval(&approval.request_id, true)
            .expect("approval must exist");
        assert!(resolution.delivered);
    }

    let ssh_output = ssh_task.await.expect("join ssh login task");
    assert!(
        ssh_output.status.success(),
        "approved ssh login failed: stdout={} stderr={}",
        String::from_utf8_lossy(&ssh_output.stdout),
        String::from_utf8_lossy(&ssh_output.stderr)
    );
    assert_eq!(
        String::from_utf8_lossy(&ssh_output.stdout).trim(),
        "chromvoid-ok"
    );

    stop_process(&mut sshd);
    stop_shared_state(&agent_state, StopReason::Manual).await;
}

#[tokio::test]
#[ignore = "requires local OpenSSH desktop tools and local sshd"]
async fn openssh_cli_localhost_login_deny_path_fails_closed() {
    let _env_lock = env_lock()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    let tempdir = tempfile::tempdir().expect("tempdir");
    let _xdg_guard = XdgConfigGuard::set(tempdir.path());

    let approval_emitter = Arc::new(TestApprovalEmitter::default());
    let agent_state = start_test_agent(
        approval_emitter.clone(),
        single_test_entry(ED25519_PUBLIC_KEY, "deploy"),
        None,
        None,
    );

    let socket_path = socket_path_for(&agent_state);
    wait_for_agent_ready(&socket_path).await;
    let host_key_path = tempdir.path().join("hostkey");
    let authorized_keys_path = tempdir.path().join("authorized_keys");
    let pid_file = tempdir.path().join("sshd.pid");
    let log_path = tempdir.path().join("sshd.log");
    let sshd_config_path = tempdir.path().join("sshd_config");
    let ssh_config_path = tempdir.path().join("ssh_config");
    let port = available_tcp_port();
    let user_name = current_user_name();

    let mut hostkey_command = Command::new("ssh-keygen");
    hostkey_command.args([
        "-q",
        "-t",
        "ed25519",
        "-N",
        "",
        "-f",
        host_key_path.to_str().expect("hostkey path"),
    ]);
    let hostkey_output = run_command_with_timeout(hostkey_command, "ssh-keygen hostkey deny").await;
    assert!(
        hostkey_output.status.success(),
        "failed to generate host key: {}",
        String::from_utf8_lossy(&hostkey_output.stderr)
    );

    std::fs::write(&authorized_keys_path, ED25519_PUBLIC_KEY).expect("write authorized_keys");
    std::fs::write(
        &sshd_config_path,
        format!(
            "Port {port}\n\
ListenAddress 127.0.0.1\n\
HostKey {}\n\
PidFile {}\n\
AuthorizedKeysFile {}\n\
PasswordAuthentication no\n\
KbdInteractiveAuthentication no\n\
ChallengeResponseAuthentication no\n\
PubkeyAuthentication yes\n\
UsePAM no\n\
PermitRootLogin no\n\
AllowUsers {user_name}\n\
StrictModes no\n\
LogLevel VERBOSE\n",
            host_key_path.display(),
            pid_file.display(),
            authorized_keys_path.display(),
        ),
    )
    .expect("write sshd config");
    std::fs::write(
        &ssh_config_path,
        format!(
            "Host chromvoid-local\n\
  HostName 127.0.0.1\n\
  Port {port}\n\
  User {user_name}\n\
  IdentityAgent {}\n\
  PreferredAuthentications publickey\n\
  PubkeyAuthentication yes\n\
  PasswordAuthentication no\n\
  KbdInteractiveAuthentication no\n\
  BatchMode yes\n\
  StrictHostKeyChecking no\n\
  UserKnownHostsFile /dev/null\n",
            socket_path.display(),
        ),
    )
    .expect("write ssh config");

    let log_file = std::fs::File::create(&log_path).expect("create sshd log");
    let mut sshd = Command::new("/usr/sbin/sshd")
        .args([
            "-D",
            "-e",
            "-f",
            sshd_config_path.to_str().expect("sshd config path"),
        ])
        .stdout(log_file.try_clone().expect("clone log file"))
        .stderr(log_file)
        .spawn()
        .expect("spawn sshd");

    assert!(
        wait_for_sshd_ready(&pid_file, &mut sshd),
        "sshd did not become ready: {}",
        std::fs::read_to_string(&log_path).unwrap_or_default()
    );

    let ssh_config_path_for_command = ssh_config_path.clone();
    let ssh_task = tokio::spawn(async move {
        let mut command = Command::new("ssh");
        command.args([
            "-F",
            ssh_config_path_for_command
                .to_str()
                .expect("ssh config path"),
            "chromvoid-local",
            "echo chromvoid-ok",
        ]);
        run_command_with_timeout(command, "ssh localhost deny").await
    });

    let approval = approval_emitter.wait_for_request().await;
    {
        let shared = shared_state(&agent_state);
        let mut shared = shared.lock().await;
        let resolution = shared
            .resolve_approval(&approval.request_id, false)
            .expect("approval must exist");
        assert!(resolution.delivered);
    }

    let ssh_output = ssh_task.await.expect("join ssh login task");
    assert!(
        !ssh_output.status.success(),
        "denied ssh login unexpectedly succeeded: stdout={} stderr={}",
        String::from_utf8_lossy(&ssh_output.stdout),
        String::from_utf8_lossy(&ssh_output.stderr)
    );
    let stderr = String::from_utf8_lossy(&ssh_output.stderr);
    assert!(
        stderr.contains("Permission denied")
            || stderr.contains("signing failed")
            || stderr.contains("agent refused operation"),
        "unexpected denied ssh stderr: {stderr}"
    );

    stop_process(&mut sshd);
    stop_shared_state(&agent_state, StopReason::Manual).await;
}
