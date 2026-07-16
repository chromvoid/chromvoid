use std::collections::HashSet;
use std::panic::AssertUnwindSafe;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;

use futures_util::FutureExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;

use super::signing::public_key_blob_from_openssh;
use super::test_support::{
    env_lock, run_command_with_timeout, run_sensitive_command_with_timeout, shared_state,
    socket_path_for, wait_for_agent_ready, EnvVarGuard, TestApprovalEmitter, XdgConfigGuard,
};
use super::{stop_shared_state, SshAgentState, StopReason};
use crate::commands::ssh_agent_cmds::{build_private_key_reader, collect_ssh_agent_entries};
use crate::core_adapter::{CoreAdapter, LocalCoreAdapter};
use crate::core_rpc_dispatcher::CoreRpcDispatcher;
use crate::ssh_keygen::{generate_ssh_key_material, store_generated_ssh_key, SshKeygenResult};
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};

const CONTROL_URL_ENV: &str = "CHROMVOID_SSH_AGENT_TEST_CONTROL_URL";
const CLIENT_IDENTITY_ENV: &str = "CHROMVOID_SSH_AGENT_TEST_CLIENT_IDENTITY_PEM_PATH";
const CA_PEM_ENV: &str = "CHROMVOID_SSH_AGENT_TEST_CA_PEM_PATH";

struct VaultAgentFixture {
    _tempdir: tempfile::TempDir,
    keys: Vec<SshKeygenResult>,
    approval_emitter: Arc<TestApprovalEmitter>,
    agent_state: Arc<StdMutex<SshAgentState>>,
    dispatcher: CoreRpcDispatcher,
}

impl VaultAgentFixture {
    fn create(key_types: &[&str]) -> Self {
        let tempdir = tempfile::tempdir().expect("create SSH verifier tempdir");
        let storage_root = tempdir.path().join("vault");
        let mut adapter = LocalCoreAdapter::new(storage_root).expect("create LocalCoreAdapter");
        let master_password = "ssh-verifier-master-password";
        adapter.set_master_key(Some(master_password.to_string()));

        expect_rpc_success(
            &mut adapter,
            "master:setup",
            json!({"master_password": master_password}),
        );
        expect_rpc_success(
            &mut adapter,
            "vault:unlock",
            json!({"password": master_password}),
        );

        let mut keys = Vec::with_capacity(key_types.len());
        for key_type in key_types {
            let comment = format!("ssh-verifier-{key_type}");
            let material = generate_ssh_key_material(key_type, &comment)
                .unwrap_or_else(|error| panic!("generate {key_type} material: {error}"));
            let result =
                store_generated_ssh_key(&mut adapter, material, Some(&comment), &comment, None)
                    .unwrap_or_else(|error| panic!("persist {key_type} material: {error}"));
            keys.push(result);
        }

        let adapter: Arc<StdMutex<Box<dyn CoreAdapter>>> =
            Arc::new(StdMutex::new(Box::new(adapter)));
        let entries = {
            let mut adapter_guard = adapter.lock().expect("adapter lock");
            collect_ssh_agent_entries(adapter_guard.as_mut())
                .expect("collect production SSH agent entries")
        };
        assert_eq!(entries.len(), keys.len());

        let dispatcher = CoreRpcDispatcher::try_new().expect("create Core RPC dispatcher");
        let approval_emitter = Arc::new(TestApprovalEmitter::default());
        let agent_state = Arc::new(StdMutex::new(SshAgentState::new()));
        agent_state
            .lock()
            .expect("agent lock")
            .start(
                entries,
                None,
                approval_emitter.clone(),
                None,
                build_private_key_reader(adapter, dispatcher.clone()),
            )
            .expect("start vault-backed SSH agent");

        Self {
            _tempdir: tempdir,
            keys,
            approval_emitter,
            agent_state,
            dispatcher,
        }
    }

    async fn stop(&self) {
        stop_shared_state(&self.agent_state, StopReason::Manual).await;
        self.dispatcher
            .shutdown_with_timeout_async(Duration::from_secs(2))
            .await
            .expect("stop Core RPC dispatcher");
    }
}

fn expect_rpc_success(adapter: &mut dyn CoreAdapter, command: &str, data: serde_json::Value) {
    let request = RpcRequest::new(command.to_string(), data);
    match adapter.handle(&request) {
        RpcResponse::Success { .. } => {}
        RpcResponse::Error { error, .. } => panic!("{command} failed: {error}"),
    }
}

fn test_environment(tempdir: &Path) -> (EnvVarGuard, EnvVarGuard, XdgConfigGuard) {
    (
        EnvVarGuard::set("CHROMVOID_TEST_INMEMORY_KEYSTORE", "1"),
        EnvVarGuard::set("CHROMVOID_TEST_FAST_KDF", "1"),
        XdgConfigGuard::set(tempdir),
    )
}

async fn resolve_next_approval(fixture: &VaultAgentFixture, request_number: usize, approved: bool) {
    let approval = tokio::time::timeout(
        Duration::from_secs(20),
        fixture
            .approval_emitter
            .wait_for_request_count(request_number),
    )
    .await
    .expect("OpenSSH did not request an SSH agent signature");
    let shared_state = shared_state(&fixture.agent_state);
    let mut shared = shared_state.lock().await;
    let resolution = shared
        .resolve_approval(&approval.request_id, approved)
        .expect("pending SSH approval");
    assert!(
        resolution.delivered,
        "SSH approval receiver was unavailable"
    );
}

#[tokio::test]
#[ignore = "requires local OpenSSH desktop tools"]
async fn vault_backed_openssh_inventory_and_signing() {
    let _env_lock = env_lock()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    let environment_root = tempfile::tempdir().expect("environment tempdir");
    let _environment = test_environment(environment_root.path());
    let fixture = VaultAgentFixture::create(&["ed25519", "ecdsa", "rsa"]);
    let socket_path = socket_path_for(&fixture.agent_state);
    wait_for_agent_ready(&socket_path).await;

    let mut list_keys = Command::new("ssh-add");
    list_keys.arg("-L").env("SSH_AUTH_SOCK", &socket_path);
    let list_keys_output = run_command_with_timeout(list_keys, "ssh-add -L vault inventory").await;
    assert!(
        list_keys_output.status.success(),
        "ssh-add -L failed for the vault-backed agent"
    );
    let listed_key_output = String::from_utf8(list_keys_output.stdout)
        .unwrap_or_else(|_| panic!("ssh-add -L returned non-UTF-8 output"));
    let listed_blobs = listed_key_output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| public_key_blob_from_openssh(line).expect("parse listed public key"))
        .collect::<HashSet<_>>();
    let expected_blobs = fixture
        .keys
        .iter()
        .map(|key| {
            public_key_blob_from_openssh(&key.public_key_openssh)
                .expect("parse persisted public key")
        })
        .collect::<HashSet<_>>();
    assert!(
        listed_blobs == expected_blobs,
        "ssh-add -L identities differ from persisted public key blobs"
    );

    let mut list_fingerprints = Command::new("ssh-add");
    list_fingerprints
        .args(["-l", "-E", "sha256"])
        .env("SSH_AUTH_SOCK", &socket_path);
    let list_fingerprints_output =
        run_command_with_timeout(list_fingerprints, "ssh-add -l vault inventory").await;
    assert!(
        list_fingerprints_output.status.success(),
        "ssh-add -l failed for the vault-backed agent"
    );
    let listed_fingerprint_output = String::from_utf8(list_fingerprints_output.stdout)
        .unwrap_or_else(|_| panic!("ssh-add -l returned non-UTF-8 output"));
    let listed_fingerprints = listed_fingerprint_output
        .lines()
        .filter_map(|line| line.split_whitespace().nth(1).map(str::to_string))
        .collect::<HashSet<_>>();
    let expected_fingerprints = fixture
        .keys
        .iter()
        .map(|key| key.fingerprint.clone())
        .collect::<HashSet<_>>();
    assert!(
        listed_fingerprints == expected_fingerprints,
        "ssh-add -l fingerprints differ from persisted key fingerprints"
    );

    let signing_key = fixture
        .keys
        .iter()
        .find(|key| key.key_type == "ed25519")
        .expect("persisted Ed25519 key");
    let public_key_path = environment_root.path().join("signing-key.pub");
    let approved_data_path = environment_root.path().join("approved-message.txt");
    std::fs::write(&public_key_path, &signing_key.public_key_openssh)
        .expect("write public identity");
    std::fs::write(&approved_data_path, b"vault-backed SSH signing")
        .expect("write approved signing input");

    let approve_command =
        ssh_keygen_sign_command(&socket_path, &public_key_path, &approved_data_path);
    let approve_task = tokio::spawn(async move {
        run_command_with_timeout(approve_command, "ssh-keygen -Y sign vault approve").await
    });
    resolve_next_approval(&fixture, 1, true).await;
    let approve_output = approve_task.await.expect("join approved signing command");
    assert!(
        approve_output.status.success(),
        "approved ssh-keygen signing failed"
    );
    assert!(
        approved_data_path.with_extension("txt.sig").exists(),
        "approved ssh-keygen signing did not create a signature"
    );

    let denied_data_path = environment_root.path().join("denied-message.txt");
    std::fs::write(&denied_data_path, b"vault-backed SSH signing denial")
        .expect("write denied signing input");
    let deny_command = ssh_keygen_sign_command(&socket_path, &public_key_path, &denied_data_path);
    let deny_task = tokio::spawn(async move {
        run_command_with_timeout(deny_command, "ssh-keygen -Y sign vault deny").await
    });
    resolve_next_approval(&fixture, 2, false).await;
    let deny_output = deny_task.await.expect("join denied signing command");
    assert!(
        !deny_output.status.success(),
        "denied ssh-keygen signing unexpectedly succeeded"
    );
    assert!(
        !denied_data_path.with_extension("txt.sig").exists(),
        "denied ssh-keygen signing created a signature"
    );

    fixture.stop().await;
}

fn ssh_keygen_sign_command(
    socket_path: &Path,
    public_key_path: &Path,
    data_path: &Path,
) -> Command {
    let mut command = Command::new("ssh-keygen");
    command
        .args(["-Y", "sign", "-U", "-f"])
        .arg(public_key_path)
        .args(["-n", "file"])
        .arg(data_path)
        .env("SSH_AUTH_SOCK", socket_path);
    command
}

#[derive(Serialize)]
struct CreateSessionRequest<'a> {
    run_id: &'a str,
    public_key: &'a str,
}

#[derive(Deserialize)]
struct CreateSessionResponse {
    session_id: String,
    ssh_username: String,
    ssh_endpoint: SshEndpoint,
    nonce: String,
    fingerprint: String,
    key_algorithm: String,
}

#[derive(Deserialize)]
struct SshEndpoint {
    host: String,
    port: u16,
    host_public_key: String,
}

#[derive(Deserialize)]
struct SessionStatusResponse {
    state: String,
}

struct RemoteSessionCleanup {
    client: Option<Client>,
    control_url: String,
    session_id: String,
}

impl RemoteSessionCleanup {
    fn new(client: Client, control_url: &str, session_id: &str) -> Self {
        Self {
            client: Some(client),
            control_url: control_url.to_string(),
            session_id: session_id.to_string(),
        }
    }

    async fn delete(mut self) -> Result<(), reqwest::Error> {
        let client = self.client.as_ref().expect("active remote session cleanup");
        let url = format!("{}/v1/sessions/{}", self.control_url, self.session_id);
        client
            .delete(url)
            .send()
            .await
            .and_then(reqwest::Response::error_for_status)?;
        self.client = None;
        Ok(())
    }
}

impl Drop for RemoteSessionCleanup {
    fn drop(&mut self) {
        if let Some(client) = self.client.take() {
            let url = format!("{}/v1/sessions/{}", self.control_url, self.session_id);
            if let Ok(runtime) = tokio::runtime::Handle::try_current() {
                runtime.spawn(async move {
                    let _ = client.delete(url).send().await;
                });
            }
        }
    }
}

fn required_env_path(name: &'static str) -> PathBuf {
    let value = std::env::var_os(name).unwrap_or_else(|| {
        panic!("required SSH agent verifier environment variable is missing: {name}")
    });
    let path = PathBuf::from(value);
    assert!(
        path.is_file(),
        "SSH agent verifier credential path does not exist: {name}"
    );
    path
}

fn remote_control_client() -> (Client, String) {
    let control_url = std::env::var(CONTROL_URL_ENV).unwrap_or_else(|_| {
        panic!("required SSH agent verifier environment variable is missing: {CONTROL_URL_ENV}")
    });
    let identity_pem = std::fs::read(required_env_path(CLIENT_IDENTITY_ENV))
        .expect("read mTLS client identity PEM");
    let ca_pem = std::fs::read(required_env_path(CA_PEM_ENV)).expect("read SSH verifier CA PEM");
    let identity = reqwest::Identity::from_pem(&identity_pem).expect("parse mTLS client identity");
    let ca = reqwest::Certificate::from_pem(&ca_pem).expect("parse SSH verifier CA certificate");
    let client = Client::builder()
        .tls_built_in_root_certs(false)
        .identity(identity)
        .add_root_certificate(ca)
        .https_only(true)
        .timeout(Duration::from_secs(10))
        .build()
        .expect("build mTLS SSH verifier client");
    (client, control_url.trim_end_matches('/').to_string())
}

async fn create_remote_session(
    client: &Client,
    control_url: &str,
    run_id: String,
    public_key: String,
) -> CreateSessionResponse {
    client
        .post(format!("{control_url}/v1/sessions"))
        .json(&CreateSessionRequest {
            run_id: &run_id,
            public_key: &public_key,
        })
        .send()
        .await
        .expect("create SSH verifier session")
        .error_for_status()
        .expect("SSH verifier rejected session creation")
        .json()
        .await
        .expect("decode SSH verifier session")
}

async fn require_remote_health(client: &Client, control_url: &str) {
    client
        .get(format!("{control_url}/health"))
        .send()
        .await
        .expect("reach mTLS SSH verifier health endpoint")
        .error_for_status()
        .expect("mTLS SSH verifier health check failed");
}

async fn get_remote_session_status(
    client: &Client,
    control_url: &str,
    session_id: &str,
) -> SessionStatusResponse {
    client
        .get(format!("{control_url}/v1/sessions/{session_id}"))
        .send()
        .await
        .expect("get SSH verifier session")
        .error_for_status()
        .expect("SSH verifier status request failed")
        .json()
        .await
        .expect("decode SSH verifier status")
}

fn known_hosts_entry(endpoint: &SshEndpoint) -> String {
    known_hosts_entry_for_key(endpoint, &endpoint.host_public_key)
}

fn known_hosts_entry_for_key(endpoint: &SshEndpoint, host_public_key: &str) -> String {
    let mut fields = host_public_key.split_whitespace();
    let algorithm = fields.next().expect("SSH endpoint host key algorithm");
    let key = fields.next().expect("SSH endpoint host key body");
    let host = if endpoint.port == 22 {
        endpoint.host.clone()
    } else {
        format!("[{}]:{}", endpoint.host, endpoint.port)
    };
    format!("{host} {algorithm} {key}\n")
}

fn ssh_destination(username: &str, host: &str) -> String {
    if host.contains(':') {
        format!("{username}@[{host}]")
    } else {
        format!("{username}@{host}")
    }
}

fn verifier_ssh_command(
    socket_path: &Path,
    public_key_path: &Path,
    known_hosts_path: &Path,
    session: &CreateSessionResponse,
    rsa_sha2_only: bool,
) -> Command {
    let mut command = Command::new("ssh");
    command
        .args(["-F", "/dev/null", "-T", "-p"])
        .arg(session.ssh_endpoint.port.to_string())
        .args(["-o", "BatchMode=yes"])
        .args(["-o", "PreferredAuthentications=publickey"])
        .args(["-o", "PasswordAuthentication=no"])
        .args(["-o", "KbdInteractiveAuthentication=no"])
        .args(["-o", "IdentitiesOnly=yes"])
        .arg("-o")
        .arg(format!("IdentityAgent={}", socket_path.display()))
        .args(["-o", "StrictHostKeyChecking=yes"])
        .arg("-o")
        .arg(format!("UserKnownHostsFile={}", known_hosts_path.display()))
        .args(["-o", "GlobalKnownHostsFile=/dev/null"])
        .args(["-o", "ConnectionAttempts=1"])
        .args(["-o", "ConnectTimeout=10"])
        .args(["-o", "LogLevel=ERROR"])
        .arg("-i")
        .arg(public_key_path);
    if rsa_sha2_only {
        command.args(["-o", "PubkeyAcceptedAlgorithms=rsa-sha2-512"]);
    }
    command
        .arg(ssh_destination(
            &session.ssh_username,
            &session.ssh_endpoint.host,
        ))
        .arg("check");
    command
}

async fn exercise_remote_session(
    fixture: &VaultAgentFixture,
    environment_root: &Path,
    socket_path: &Path,
    control_client: &Client,
    control_url: &str,
    index: usize,
    key: &SshKeygenResult,
    session: &CreateSessionResponse,
) {
    assert_eq!(session.fingerprint, key.fingerprint);
    let expected_algorithm = match key.key_type.as_str() {
        "ed25519" => "ssh-ed25519",
        "ecdsa" => "ecdsa-sha2-nistp256",
        "rsa" => "ssh-rsa",
        other => panic!("unexpected persisted SSH key type: {other}"),
    };
    assert_eq!(session.key_algorithm, expected_algorithm);

    let case_dir = environment_root.join(format!("case-{index}"));
    std::fs::create_dir(&case_dir).expect("create SSH verification case directory");
    let public_key_path = case_dir.join("identity.pub");
    let known_hosts_path = case_dir.join("known_hosts");
    std::fs::write(&public_key_path, &key.public_key_openssh).expect("write SSH public identity");

    if index == 0 {
        let wrong_host_key = &fixture
            .keys
            .get(1)
            .expect("second persisted key for wrong host pin")
            .public_key_openssh;
        std::fs::write(
            &known_hosts_path,
            known_hosts_entry_for_key(&session.ssh_endpoint, wrong_host_key),
        )
        .expect("write deliberately wrong SSH host pin");
        let wrong_pin_command = verifier_ssh_command(
            socket_path,
            &public_key_path,
            &known_hosts_path,
            session,
            false,
        );
        let wrong_pin_output = run_sensitive_command_with_timeout(
            wrong_pin_command,
            "SSH verifier wrong host pin check",
        )
        .await;
        assert!(
            !wrong_pin_output.status.success(),
            "SSH verifier accepted a deliberately wrong host key pin"
        );
        assert!(
            fixture
                .approval_emitter
                .events
                .lock()
                .expect("events lock")
                .is_empty(),
            "wrong host key pin unexpectedly reached SSH agent signing"
        );
    }

    std::fs::write(&known_hosts_path, known_hosts_entry(&session.ssh_endpoint))
        .expect("write pinned SSH known_hosts");

    let ssh_command = verifier_ssh_command(
        socket_path,
        &public_key_path,
        &known_hosts_path,
        session,
        key.key_type == "rsa",
    );
    let ssh_task = tokio::spawn(async move {
        run_sensitive_command_with_timeout(ssh_command, "SSH verifier check").await
    });
    resolve_next_approval(fixture, index + 1, true).await;
    let ssh_output = ssh_task.await.expect("join SSH verifier command");
    assert!(ssh_output.status.success(), "SSH verifier check failed");
    let returned_nonce = String::from_utf8(ssh_output.stdout)
        .unwrap_or_else(|_| panic!("SSH verifier returned a non-UTF-8 payload"));
    assert!(
        returned_nonce.trim() == session.nonce,
        "SSH verifier returned an unexpected nonce"
    );

    let status = get_remote_session_status(control_client, control_url, &session.session_id).await;
    assert_eq!(status.state, "completed");

    let replay_command = verifier_ssh_command(
        socket_path,
        &public_key_path,
        &known_hosts_path,
        session,
        key.key_type == "rsa",
    );
    let replay_output =
        run_sensitive_command_with_timeout(replay_command, "SSH verifier replay check").await;
    assert!(
        !replay_output.status.success(),
        "consumed SSH verifier capability was accepted twice"
    );
    assert_eq!(
        fixture
            .approval_emitter
            .events
            .lock()
            .expect("events lock")
            .len(),
        index + 1,
        "replay unexpectedly reached SSH agent signing"
    );
    let replay_status =
        get_remote_session_status(control_client, control_url, &session.session_id).await;
    assert_eq!(replay_status.state, "completed");
}

#[tokio::test]
#[ignore = "requires configured mTLS SSH agent test target and local OpenSSH tools"]
async fn vault_backed_openssh_authenticates_against_test_target() {
    let _env_lock = env_lock()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    let environment_root = tempfile::tempdir().expect("environment tempdir");
    let _environment = test_environment(environment_root.path());
    let (control_client, control_url) = remote_control_client();
    require_remote_health(&control_client, &control_url).await;
    let fixture = VaultAgentFixture::create(&["ed25519", "ecdsa", "rsa"]);
    let socket_path = socket_path_for(&fixture.agent_state);
    wait_for_agent_ready(&socket_path).await;

    for (index, key) in fixture.keys.iter().enumerate() {
        let run_id = format!("desktop-e2e-{}-{index}", std::process::id());
        let session = create_remote_session(
            &control_client,
            &control_url,
            run_id,
            key.public_key_openssh.clone(),
        )
        .await;
        let session_cleanup =
            RemoteSessionCleanup::new(control_client.clone(), &control_url, &session.session_id);
        let verification = AssertUnwindSafe(exercise_remote_session(
            &fixture,
            environment_root.path(),
            &socket_path,
            &control_client,
            &control_url,
            index,
            key,
            &session,
        ))
        .catch_unwind()
        .await;
        let cleanup = session_cleanup.delete().await;

        if let Err(panic_payload) = verification {
            if cleanup.is_err() {
                eprintln!("SSH verifier session cleanup failed while unwinding");
            }
            std::panic::resume_unwind(panic_payload);
        }
        cleanup.expect("delete SSH verifier session");
    }

    fixture.stop().await;
}
