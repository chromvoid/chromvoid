#[cfg(all(test, target_os = "macos"))]
mod tests {
    use std::collections::HashMap;
    use std::ffi::OsString;
    use std::io::Write as _;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::{mpsc, Arc, Mutex};
    use std::time::Duration;

    use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
    use base64::Engine as _;
    use chromvoid_core::env_runtime::{
        EnvRuntimeResult, PrivateSpawnResolutionRequestV1, ResolvedEnvLeaseV1,
    };
    use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
    use chromvoid_core::rpc::{RpcInputStream, RpcReply};
    use chromvoid_protocol::{
        AgentEventDataV1, AgentPresetDraftV1, AgentProfileMetadataV1, AgentRunStatusV1,
        AgentVariableMappingV1, AGENT_OUTPUT_CHUNK_BYTES,
    };
    use serde::de::DeserializeOwned;
    use serde_json::{json, Value};
    use tempfile::TempDir;

    use crate::app_state::AppState;
    use crate::core_adapter::{CoreAdapter, CoreMode, LocalCoreAdapter};
    use crate::env_runtime::{EnvRuntimeErrorCode, RunApprovalDecision};
    use crate::gateway::GatewayState;
    use crate::session_settings::SessionSettings;
    use crate::ssh_agent::SshAgentState;
    use crate::volume_manager::VolumeManager;

    const ACTOR_ID: &str = "env-runtime-process-test-agent";
    const VAULT_PASSWORD: &str = "env-runtime-test-vault";
    const MASTER_PASSWORD: &str = "env-runtime-test-master";
    const STDOUT_LEN: usize = 70_017;
    const STDERR_LEN: usize = 66_003;

    struct EnvironmentGuard {
        saved: Vec<(&'static str, Option<OsString>)>,
    }

    impl EnvironmentGuard {
        fn set(values: &[(&'static str, &'static str)]) -> Self {
            let saved = values
                .iter()
                .map(|(name, value)| {
                    let previous = std::env::var_os(name);
                    // SAFETY: this integration test is run with one test thread,
                    // and every mutation is restored by this guard.
                    unsafe { std::env::set_var(name, value) };
                    (*name, previous)
                })
                .collect();
            Self { saved }
        }
    }

    impl Drop for EnvironmentGuard {
        fn drop(&mut self) {
            for (name, previous) in self.saved.drain(..).rev() {
                // SAFETY: see `EnvironmentGuard::set`; restoration is serialized.
                unsafe {
                    match previous {
                        Some(value) => std::env::set_var(name, value),
                        None => std::env::remove_var(name),
                    }
                }
            }
        }
    }

    struct RecordingLocalCoreAdapter {
        inner: LocalCoreAdapter,
        resolution_calls: Arc<AtomicUsize>,
        profile_get_calls: Arc<AtomicUsize>,
        mutate_after_resolution: Arc<Mutex<Option<PathBuf>>>,
    }

    impl CoreAdapter for RecordingLocalCoreAdapter {
        fn mode(&self) -> CoreMode {
            self.inner.mode()
        }

        fn is_unlocked(&self) -> bool {
            self.inner.is_unlocked()
        }

        fn handle(&mut self, req: &RpcRequest) -> RpcResponse {
            if req.command == "env_runtime:profile:get" {
                self.profile_get_calls.fetch_add(1, Ordering::SeqCst);
            }
            self.inner.handle(req)
        }

        fn resolve_env_runtime_for_spawn(
            &mut self,
            request: PrivateSpawnResolutionRequestV1,
        ) -> Option<EnvRuntimeResult<ResolvedEnvLeaseV1>> {
            self.resolution_calls.fetch_add(1, Ordering::SeqCst);
            let resolution = self.inner.resolve_env_runtime_for_spawn(request);
            if let Some(path) = self
                .mutate_after_resolution
                .lock()
                .expect("post-resolution mutation lock")
                .take()
            {
                let mut executable = std::fs::OpenOptions::new()
                    .append(true)
                    .open(path)
                    .expect("open executable for identity race");
                executable
                    .write_all(b"post-resolution-identity-change")
                    .expect("mutate executable identity");
                executable.sync_all().expect("sync identity mutation");
            }
            resolution
        }

        fn handle_with_stream(
            &mut self,
            req: &RpcRequest,
            stream: Option<RpcInputStream>,
        ) -> RpcReply {
            self.inner.handle_with_stream(req, stream)
        }

        fn save(&mut self) -> Result<(), String> {
            self.inner.save()
        }

        fn take_events(&mut self) -> Vec<Value> {
            self.inner.take_events()
        }

        fn set_master_key(&mut self, key: Option<String>) {
            self.inner.set_master_key(key);
        }
    }

    struct NoopMobileUsbSessionStarter;

    #[async_trait::async_trait]
    impl crate::mobile_usb::MobileUsbSessionStarter for NoopMobileUsbSessionStarter {
        async fn start_session(
            &self,
            _request: crate::mobile_usb::MobileUsbStartSessionRequest,
        ) -> Result<crate::mobile_usb::MobileUsbSessionHandle, crate::mobile_usb::MobileUsbError>
        {
            Ok(crate::mobile_usb::MobileUsbSessionHandle {
                session_id: "env-runtime-test-mobile-session".to_string(),
                host_unlocked: false,
                transport_session_generation: 1,
            })
        }
    }

    struct ProcessFixture {
        _temp: TempDir,
        state: AppState,
        profile: AgentProfileMetadataV1,
        workspace: PathBuf,
        cwd: PathBuf,
        probe_source: PathBuf,
        resolution_calls: Arc<AtomicUsize>,
        profile_get_calls: Arc<AtomicUsize>,
        mutate_after_resolution: Arc<Mutex<Option<PathBuf>>>,
    }

    struct CanonicalPathMismatch {
        original: PathBuf,
        relocated: PathBuf,
    }

    impl CanonicalPathMismatch {
        fn install(original: &Path, relocated: PathBuf) -> Self {
            std::fs::rename(original, &relocated).expect("relocate canonical directory");
            std::os::unix::fs::symlink(&relocated, original)
                .expect("replace canonical directory with symlink");
            Self {
                original: original.to_path_buf(),
                relocated,
            }
        }
    }

    impl Drop for CanonicalPathMismatch {
        fn drop(&mut self) {
            std::fs::remove_file(&self.original).expect("remove mismatch symlink");
            std::fs::rename(&self.relocated, &self.original).expect("restore canonical directory");
        }
    }

    impl ProcessFixture {
        fn new(probe_source: PathBuf) -> Self {
            let temp = tempfile::tempdir().expect("create process integration tempdir");
            let storage_root = temp.path().join("vault-storage");
            let workspace = temp.path().join("workspace");
            let cwd = workspace.join("project");
            std::fs::create_dir_all(&cwd).expect("create probe cwd");
            std::fs::write(cwd.join(".env-runtime-test-cwd"), b"cwd marker")
                .expect("write cwd marker");

            let mut local = LocalCoreAdapter::new_with_test_keystore(storage_root.clone())
                .expect("create LocalCoreAdapter");
            local.set_master_key(Some(MASTER_PASSWORD.to_string()));
            rpc_ok_value(
                &mut local,
                "master:setup",
                json!({"master_password": MASTER_PASSWORD}),
            );
            rpc_ok_value(
                &mut local,
                "vault:unlock",
                json!({"password": VAULT_PASSWORD}),
            );

            let precedence = create_secret(
                &mut local,
                "Precedence dummy",
                "profile-overrides-passthrough",
            );
            let baseline =
                create_secret(&mut local, "Baseline dummy", "profile-overrides-baseline");
            let profile_only = create_secret(&mut local, "Profile dummy", "profile-only-dummy");
            let core_profile: chromvoid_core::env_runtime::AgentProfileMetadataV1 = rpc_ok(
                &mut local,
                "env_runtime:profile:create",
                json!({
                    "slug": "process_integration",
                    "label": "Process integration",
                    "description": "Dummy values for the local process probe",
                    "variables": [
                        {"name": "W6_PRECEDENCE", "secret_id": precedence.id},
                        {"name": "HOME", "secret_id": baseline.id},
                        {"name": "W6_PROFILE_ONLY", "secret_id": profile_only.id},
                    ],
                }),
            );
            let profile = AgentProfileMetadataV1 {
                id: core_profile.id,
                slug: core_profile.slug,
                label: core_profile.label,
                description: core_profile.description,
                revision: core_profile.revision,
                variables: core_profile
                    .variables
                    .into_iter()
                    .map(|variable| AgentVariableMappingV1 {
                        name: variable.name,
                        secret_id: Some(variable.secret_id),
                    })
                    .collect(),
            };

            let resolution_calls = Arc::new(AtomicUsize::new(0));
            let profile_get_calls = Arc::new(AtomicUsize::new(0));
            let mutate_after_resolution = Arc::new(Mutex::new(None));
            let adapter: Arc<Mutex<Box<dyn CoreAdapter>>> =
                Arc::new(Mutex::new(Box::new(RecordingLocalCoreAdapter {
                    inner: local,
                    resolution_calls: Arc::clone(&resolution_calls),
                    profile_get_calls: Arc::clone(&profile_get_calls),
                    mutate_after_resolution: Arc::clone(&mutate_after_resolution),
                })));

            let remote_io_runtime = Arc::new(crate::remote_io_runtime::RemoteIoRuntimeState::new());
            let mut gateway = GatewayState::load_or_default(temp.path().join("gateway.json"));
            gateway.config.enabled = true;
            gateway.upsert_paired_agent(ACTOR_ID.to_string());
            let state = AppState {
                adapter,
                core_rpc_dispatcher: crate::core_rpc_dispatcher::CoreRpcDispatcher::try_new()
                    .expect("core RPC dispatcher"),
                sync_runtime: Arc::new(crate::commands::sync_cmds::SyncRuntimeState::new()),
                storage_root: Arc::new(Mutex::new(storage_root.clone())),
                gateway: Arc::new(Mutex::new(gateway)),
                env_runtime: Arc::new(
                    crate::env_runtime::EnvRuntimeState::new(
                        temp.path().join("env-runtime-device.enc.json"),
                    )
                    .expect("env runtime state"),
                ),
                session_settings: Arc::new(Mutex::new(SessionSettings::default())),
                mobile_is_foreground: Arc::new(Mutex::new(false)),
                last_activity: Arc::new(Mutex::new(std::time::Instant::now())),
                vault_background_io_runtime: Arc::new(
                    crate::vault_background_io::VaultBackgroundIoRuntimeState::new(),
                ),
                catalog_blocking_io_runtime: Arc::new(
                    crate::catalog_blocking_io::CatalogBlockingIoRuntimeState::new(),
                ),
                host_path_capabilities: Arc::new(
                    crate::host_path_capability::HostPathCapabilityRegistry::new(),
                ),
                task_lifecycle: Arc::new(crate::task_lifecycle::TaskLifecycleRuntime::new()),
                image_preview_runtime: Arc::new(
                    crate::image_preview::ImagePreviewRuntimeState::new(),
                ),
                prepared_preview_runtime: Arc::new(
                    crate::commands::catalog::PreparedPreviewRuntimeState::new(),
                ),
                media_streams: Arc::new(crate::media_source::LocalMediaSourceManager::new()),
                media_protocol_runtime: Arc::new(
                    crate::media_stream::MediaProtocolRuntimeState::new(),
                ),
                media_http_stream_runtime: Arc::new(
                    crate::media_stream::MediaHttpStreamRuntimeState::new(),
                ),
                network_pairing_runtime: Arc::new(
                    crate::network::pairing::NetworkPairingRuntimeState::new(),
                ),
                remote_io_runtime: Arc::clone(&remote_io_runtime),
                mobile_usb_runtime: Arc::new(crate::mobile_usb::MobileUsbController::new(
                    Arc::new(crate::mobile_usb::UnsupportedMobileUsbBridge),
                    Arc::new(crate::mobile_usb::JsonMobileUsbPairingStore::new(
                        storage_root,
                    )),
                    Arc::new(crate::mobile_usb::KeyringMobileUsbSecretStore::default()),
                    Arc::new(NoopMobileUsbSessionStarter),
                )),
                mode_transition_coordinator: Arc::new(
                    crate::mode_transition_coordinator::ModeTransitionCoordinator::new(),
                ),
                mobile_acceptor_runtime: Arc::new(
                    crate::network::mobile_acceptor::MobileAcceptorRuntimeState::new(),
                ),
                ios_lifecycle_runtime: Arc::new(
                    crate::network::ios_lifecycle::IosLifecycleRuntimeState::new(),
                ),
                ios_host_runtime: Arc::new(crate::network::ios_pairing::IosHostRuntimeState::new()),
                android_host_runtime: Arc::new(
                    crate::network::mobile_host::AndroidHostRuntimeState::new(),
                ),
                native_audio_sessions: Arc::new(crate::mobile::NativeAudioSessionRegistry::new()),
                ios_native_bridge_runtime: Arc::new(
                    crate::mobile::ios::native_bridge::IosNativeBridgeRuntimeState::new(),
                ),
                volume_manager: Arc::new(Mutex::new(VolumeManager::new())),
                exit_in_progress: Arc::new(AtomicBool::new(false)),
                _sleep_watcher: None,
                ssh_agent: Arc::new(Mutex::new(SshAgentState::new())),
            };

            Self {
                _temp: temp,
                state,
                profile,
                workspace,
                cwd,
                probe_source,
                resolution_calls,
                profile_get_calls,
                mutate_after_resolution,
            }
        }

        fn state(&self) -> &AppState {
            &self.state
        }

        fn copy_probe(&self, name: &str) -> PathBuf {
            let destination = self.workspace.join(name);
            std::fs::copy(&self.probe_source, &destination).expect("copy probe executable");
            destination.canonicalize().expect("canonical copied probe")
        }

        fn preset(
            &self,
            slug: &str,
            executable: &Path,
            args: &[&str],
        ) -> crate::env_runtime::DevicePreset {
            let state = self.state();
            state
                .env_runtime
                .save_preset(
                    None,
                    None,
                    AgentPresetDraftV1 {
                        profile_id: self.profile.id.clone(),
                        slug: slug.to_string(),
                        label: format!("Process test {slug}"),
                        workspace_root: self
                            .workspace
                            .canonicalize()
                            .expect("canonical workspace")
                            .to_string_lossy()
                            .into_owned(),
                        cwd: self
                            .cwd
                            .canonicalize()
                            .expect("canonical cwd")
                            .to_string_lossy()
                            .into_owned(),
                        executable: executable.to_string_lossy().into_owned(),
                        args: args.iter().map(|arg| (*arg).to_string()).collect(),
                        passthrough_env: vec!["W6_PASSTHROUGH".into(), "W6_PRECEDENCE".into()],
                    },
                )
                .expect("save device preset")
        }

        fn approved_ticket(
            &self,
            preset: crate::env_runtime::DevicePreset,
            session_id: &str,
        ) -> crate::env_runtime::AgentRunTicket {
            let state = self.state();
            let ticket = state
                .env_runtime
                .request_run(
                    ACTOR_ID.to_string(),
                    Some("Process integration agent".to_string()),
                    session_id.to_string(),
                    self.profile.clone(),
                    preset,
                    &HashMap::new(),
                    Some("Exercise production process coordinator".to_string()),
                )
                .expect("request run approval");
            state
                .env_runtime
                .resolve_run_approval(&ticket.snapshot.run.id, RunApprovalDecision::Approve)
                .expect("approve process run");
            ticket
        }

        fn bump_preset_revision(
            &self,
            preset: &crate::env_runtime::DevicePreset,
        ) -> crate::env_runtime::DevicePreset {
            self.state
                .env_runtime
                .save_preset(
                    Some(&preset.id),
                    Some(preset.revision),
                    AgentPresetDraftV1 {
                        profile_id: preset.profile_id.clone(),
                        slug: preset.slug.clone(),
                        label: preset.label.clone(),
                        workspace_root: preset.workspace_root.clone(),
                        cwd: preset.cwd.clone(),
                        executable: preset.executable.clone(),
                        args: preset.args.clone(),
                        passthrough_env: preset.passthrough_env.clone(),
                    },
                )
                .expect("advance stored preset revision")
        }

        fn bump_profile_revision(&self) {
            let variables = self
                .profile
                .variables
                .iter()
                .map(|variable| {
                    json!({
                        "name": variable.name,
                        "secret_id": variable.secret_id.as_deref().expect("bound test secret"),
                    })
                })
                .collect::<Vec<_>>();
            let mut adapter = self.state.adapter.lock().expect("adapter lock");
            let updated: chromvoid_core::env_runtime::AgentProfileMetadataV1 = rpc_ok(
                adapter.as_mut(),
                "env_runtime:profile:update",
                json!({
                    "target": self.profile.id,
                    "base_revision": self.profile.revision,
                    "draft": {
                        "slug": self.profile.slug,
                        "label": self.profile.label,
                        "description": self.profile.description,
                        "variables": variables,
                    },
                }),
            );
            assert_eq!(updated.revision, self.profile.revision + 1);
        }

        async fn start(
            &self,
            ticket: crate::env_runtime::AgentRunTicket,
        ) -> Result<
            tokio::sync::mpsc::Receiver<AgentEventDataV1>,
            crate::env_runtime::EnvRuntimeError,
        > {
            crate::gateway::resolve_and_start_run(self.state(), ACTOR_ID.to_string(), ticket).await
        }

        fn core_rpc(&self, command: &str, data: Value) -> RpcResponse {
            self.state()
                .adapter
                .lock()
                .expect("adapter lock")
                .handle(&RpcRequest::new(command, data))
        }
    }

    struct CollectedEvents {
        stdout: Vec<u8>,
        stderr: Vec<u8>,
        exit_code: Option<i32>,
        signal: Option<i32>,
        saw_started: bool,
        saw_backpressure: bool,
        max_chunk: usize,
        event_count: u64,
    }

    async fn collect_until_exit(
        receiver: &mut tokio::sync::mpsc::Receiver<AgentEventDataV1>,
    ) -> CollectedEvents {
        tokio::time::timeout(Duration::from_secs(15), async {
            let mut collected = CollectedEvents {
                stdout: Vec::new(),
                stderr: Vec::new(),
                exit_code: None,
                signal: None,
                saw_started: false,
                saw_backpressure: false,
                max_chunk: 0,
                event_count: 0,
            };
            while let Some(event) = receiver.recv().await {
                collected.event_count = collected.event_count.saturating_add(1);
                match event {
                    AgentEventDataV1::RunStarted { .. } => collected.saw_started = true,
                    AgentEventDataV1::Stdout { data_base64, .. } => {
                        let bytes = BASE64_STANDARD
                            .decode(data_base64)
                            .expect("decode stdout chunk");
                        collected.max_chunk = collected.max_chunk.max(bytes.len());
                        collected.stdout.extend(bytes);
                    }
                    AgentEventDataV1::Stderr { data_base64, .. } => {
                        let bytes = BASE64_STANDARD
                            .decode(data_base64)
                            .expect("decode stderr chunk");
                        collected.max_chunk = collected.max_chunk.max(bytes.len());
                        collected.stderr.extend(bytes);
                    }
                    AgentEventDataV1::Error(error) => {
                        if error.code == "OUTPUT_BACKPRESSURE" {
                            collected.saw_backpressure = true;
                        }
                    }
                    AgentEventDataV1::RunExited {
                        exit_code, signal, ..
                    } => {
                        collected.exit_code = exit_code;
                        collected.signal = signal;
                        break;
                    }
                    AgentEventDataV1::SignalForwarded { .. }
                    | AgentEventDataV1::ApprovalPending { .. }
                    | AgentEventDataV1::ProposalPending { .. } => {}
                }
            }
            collected
        })
        .await
        .expect("process event stream timed out")
    }

    async fn wait_for_started(receiver: &mut tokio::sync::mpsc::Receiver<AgentEventDataV1>) {
        tokio::time::timeout(Duration::from_secs(5), async {
            while let Some(event) = receiver.recv().await {
                if matches!(event, AgentEventDataV1::RunStarted { .. }) {
                    return;
                }
            }
            panic!("process stream closed before run_started");
        })
        .await
        .expect("run_started timed out");
    }

    fn payload(seed: usize, len: usize) -> Vec<u8> {
        (0..len)
            .map(|index| ((index.wrapping_mul(31).wrapping_add(seed)) & 0xff) as u8)
            .collect()
    }

    fn rpc_ok_value(adapter: &mut dyn CoreAdapter, command: &str, data: Value) -> Value {
        match adapter.handle(&RpcRequest::new(command, data)) {
            RpcResponse::Success { result, .. } => result,
            other => panic!("{command} failed: {other:?}"),
        }
    }

    fn rpc_ok<T: DeserializeOwned>(adapter: &mut dyn CoreAdapter, command: &str, data: Value) -> T {
        serde_json::from_value(rpc_ok_value(adapter, command, data))
            .unwrap_or_else(|error| panic!("decode {command}: {error}"))
    }

    fn create_secret(
        adapter: &mut dyn CoreAdapter,
        label: &str,
        value: &str,
    ) -> chromvoid_core::env_runtime::AgentSecretMetadataV1 {
        rpc_ok(
            adapter,
            "env_runtime:secret:create",
            json!({"label": label, "value": value}),
        )
    }

    async fn run_local_core_process_integration() {
        let probe_source = std::env::var_os("CHROMVOID_ENV_RUNTIME_TEST_PROBE")
            .map(PathBuf::from)
            .expect("CHROMVOID_ENV_RUNTIME_TEST_PROBE must point at the built test probe")
            .canonicalize()
            .expect("canonical test probe");
        let _environment = EnvironmentGuard::set(&[
            ("CHROMVOID_TEST_INMEMORY_KEYSTORE", "1"),
            ("CHROMVOID_TEST_FAST_KDF", "1"),
            ("CHROMVOID_ENV_RUNTIME_V1_ENABLED", "1"),
            ("W6_PASSTHROUGH", "passthrough-dummy"),
            ("W6_PRECEDENCE", "passthrough-dummy"),
            ("W6_NOT_ALLOWED", "must-not-reach-child"),
        ]);
        let fixture = ProcessFixture::new(probe_source);

        let verify_probe = fixture.copy_probe("verify-probe");
        let verify_preset = fixture.preset(
            "verify",
            &verify_probe,
            &["verify", "sentinel-arg", "two words", "23"],
        );
        let verify_ticket = fixture.approved_ticket(verify_preset, "session-verify");
        let verify_run_id = verify_ticket.snapshot.run.id.clone();
        let mut events = fixture
            .start(verify_ticket)
            .await
            .expect("start verified run");
        let collected = collect_until_exit(&mut events).await;
        assert!(collected.saw_started);
        assert_eq!(collected.exit_code, Some(23));
        assert_eq!(collected.signal, None);
        assert_eq!(collected.stdout, payload(17, STDOUT_LEN));
        assert_eq!(collected.stderr, payload(93, STDERR_LEN));
        assert!(collected.max_chunk <= AGENT_OUTPUT_CHUNK_BYTES);
        assert!(collected.event_count >= 6, "expected chunked binary output");
        let verify_terminal = fixture
            .state()
            .env_runtime
            .list_runs()
            .expect("list terminal run")
            .into_iter()
            .find(|run| run.id == verify_run_id)
            .expect("verified run metadata");
        assert_eq!(verify_terminal.status, AgentRunStatusV1::Exited);
        assert_eq!(verify_terminal.exit_code, Some(23));

        let wait_probe = fixture.copy_probe("wait-probe");
        let wait_preset = fixture.preset("wait", &wait_probe, &["wait"]);

        let stop_ticket = fixture.approved_ticket(wait_preset.clone(), "session-stop");
        let stop_id = stop_ticket.snapshot.run.id.clone();
        let mut stop_events = fixture.start(stop_ticket).await.expect("start stop run");
        wait_for_started(&mut stop_events).await;
        fixture
            .state()
            .env_runtime
            .stop_run(&stop_id)
            .await
            .expect("stop active run");
        let stopped = collect_until_exit(&mut stop_events).await;
        assert!(stopped.signal.is_some() || stopped.exit_code.is_some());

        let disconnect_ticket = fixture.approved_ticket(wait_preset.clone(), "session-disconnect");
        let mut disconnect_events = fixture
            .start(disconnect_ticket)
            .await
            .expect("start disconnect run");
        wait_for_started(&mut disconnect_events).await;
        fixture
            .state()
            .env_runtime
            .stop_runs_for_session("session-disconnect")
            .await;
        let disconnected = collect_until_exit(&mut disconnect_events).await;
        assert!(disconnected.signal.is_some() || disconnected.exit_code.is_some());

        let lock_ticket = fixture.approved_ticket(wait_preset.clone(), "session-lock");
        let lock_id = lock_ticket.snapshot.run.id.clone();
        let mut lock_events = fixture.start(lock_ticket).await.expect("start lock run");
        wait_for_started(&mut lock_events).await;
        assert!(matches!(
            fixture.core_rpc("vault:lock", Value::Null),
            RpcResponse::Success { .. }
        ));
        fixture.state().env_runtime.cancel_pending_for_lock();
        assert_eq!(
            fixture
                .state()
                .env_runtime
                .list_runs()
                .expect("list lock-time run")
                .into_iter()
                .find(|run| run.id == lock_id)
                .expect("lock-time run")
                .status,
            AgentRunStatusV1::Running,
            "an already attached process remains controllable after vault lock"
        );
        fixture
            .state()
            .env_runtime
            .stop_run(&lock_id)
            .await
            .expect("stop lock-time run");
        let _ = collect_until_exit(&mut lock_events).await;
        assert!(matches!(
            fixture.core_rpc("vault:unlock", json!({"password": VAULT_PASSWORD})),
            RpcResponse::Success { .. }
        ));

        let shutdown_ticket = fixture.approved_ticket(wait_preset, "session-shutdown");
        let mut shutdown_events = fixture
            .start(shutdown_ticket)
            .await
            .expect("start shutdown run");
        wait_for_started(&mut shutdown_events).await;
        fixture.state().env_runtime.stop_all_and_wait().await;
        let shutdown = collect_until_exit(&mut shutdown_events).await;
        assert!(shutdown.signal.is_some() || shutdown.exit_code.is_some());

        let pressure_probe = fixture.copy_probe("backpressure-probe");
        let pressure_preset = fixture.preset("backpressure", &pressure_probe, &["backpressure"]);
        let pressure_ticket = fixture.approved_ticket(pressure_preset, "session-backpressure");
        let mut pressure_events = fixture
            .start(pressure_ticket)
            .await
            .expect("start backpressure run");
        tokio::time::sleep(Duration::from_millis(300)).await;
        let pressure = collect_until_exit(&mut pressure_events).await;
        assert!(pressure.saw_backpressure);
        assert!(pressure.max_chunk <= AGENT_OUTPUT_CHUNK_BYTES);

        let preflight_probe = fixture.copy_probe("preflight-race-probe");
        let preflight_preset = fixture.preset("preflight-race", &preflight_probe, &["wait"]);
        let preflight_ticket = fixture.approved_ticket(preflight_preset, "session-preflight-race");
        std::fs::OpenOptions::new()
            .append(true)
            .open(&preflight_probe)
            .expect("open preflight probe")
            .write_all(b"pre-existing-identity-change")
            .expect("mutate before coordinator preflight");
        let calls_before = fixture.resolution_calls.load(Ordering::SeqCst);
        let preflight_error = fixture
            .start(preflight_ticket)
            .await
            .expect_err("identity mismatch must fail before private resolution");
        assert_eq!(
            preflight_error.code,
            EnvRuntimeErrorCode::EXECUTABLE_IDENTITY_MISMATCH
        );
        assert_eq!(
            fixture.resolution_calls.load(Ordering::SeqCst),
            calls_before,
            "pre-existing executable mismatch must not call the resolver"
        );

        let preset_revision_probe = fixture.copy_probe("preset-revision-probe");
        let preset_revision_preset =
            fixture.preset("preset-revision", &preset_revision_probe, &["wait"]);
        let preset_revision_ticket =
            fixture.approved_ticket(preset_revision_preset.clone(), "session-preset-revision");
        fixture.bump_preset_revision(&preset_revision_preset);
        let calls_before = fixture.resolution_calls.load(Ordering::SeqCst);
        let preset_revision_error = fixture
            .start(preset_revision_ticket)
            .await
            .expect_err("preset revision mismatch must fail before private resolution");
        assert_eq!(
            preset_revision_error.code,
            EnvRuntimeErrorCode::REVISION_CONFLICT
        );
        assert_eq!(
            fixture.resolution_calls.load(Ordering::SeqCst),
            calls_before,
            "preset revision mismatch must not call the resolver"
        );

        let workspace_probe = fixture.copy_probe("workspace-mismatch-probe");
        let workspace_preset = fixture.preset("workspace-mismatch", &workspace_probe, &["wait"]);
        let workspace_ticket =
            fixture.approved_ticket(workspace_preset, "session-workspace-mismatch");
        let workspace_relocated = fixture
            .workspace
            .parent()
            .expect("workspace parent")
            .join("workspace-canonical-mismatch");
        let workspace_mismatch =
            CanonicalPathMismatch::install(&fixture.workspace, workspace_relocated);
        let calls_before = fixture.resolution_calls.load(Ordering::SeqCst);
        let workspace_error = fixture
            .start(workspace_ticket)
            .await
            .expect_err("workspace mismatch must fail before private resolution");
        drop(workspace_mismatch);
        assert_eq!(
            workspace_error.code,
            EnvRuntimeErrorCode::WORKSPACE_MISMATCH
        );
        assert_eq!(
            fixture.resolution_calls.load(Ordering::SeqCst),
            calls_before,
            "workspace mismatch must not call the resolver"
        );

        let cwd_probe = fixture.copy_probe("cwd-mismatch-probe");
        let cwd_preset = fixture.preset("cwd-mismatch", &cwd_probe, &["wait"]);
        let cwd_ticket = fixture.approved_ticket(cwd_preset, "session-cwd-mismatch");
        let cwd_relocated = fixture.workspace.join("project-canonical-mismatch");
        let cwd_mismatch = CanonicalPathMismatch::install(&fixture.cwd, cwd_relocated);
        let calls_before = fixture.resolution_calls.load(Ordering::SeqCst);
        let cwd_error = fixture
            .start(cwd_ticket)
            .await
            .expect_err("cwd mismatch must fail before private resolution");
        drop(cwd_mismatch);
        assert_eq!(cwd_error.code, EnvRuntimeErrorCode::WORKSPACE_MISMATCH);
        assert_eq!(
            fixture.resolution_calls.load(Ordering::SeqCst),
            calls_before,
            "cwd mismatch must not call the resolver"
        );

        let cancelled_probe = fixture.copy_probe("cancelled-before-preflight-probe");
        let cancelled_marker = fixture.workspace.join("cancelled-child-spawned");
        let cancelled_marker_arg = cancelled_marker.to_string_lossy().into_owned();
        let cancelled_preset = fixture.preset(
            "cancelled-before-preflight",
            &cancelled_probe,
            &["touch", cancelled_marker_arg.as_str()],
        );
        let cancelled_ticket =
            fixture.approved_ticket(cancelled_preset, "session-cancelled-before-preflight");
        let cancelled_run_id = cancelled_ticket.snapshot.run.id.clone();
        fixture
            .state()
            .env_runtime
            .stop_run(&cancelled_run_id)
            .await
            .expect("Stop starting reservation before preflight");
        let profile_gets_before = fixture.profile_get_calls.load(Ordering::SeqCst);
        let resolutions_before = fixture.resolution_calls.load(Ordering::SeqCst);
        let cancelled_error = fixture
            .start(cancelled_ticket)
            .await
            .expect_err("cancelled reservation must fail before Core metadata preflight");
        assert_eq!(cancelled_error.code, EnvRuntimeErrorCode::CANCELLED);
        assert_eq!(
            fixture.profile_get_calls.load(Ordering::SeqCst),
            profile_gets_before,
            "Stop-won reservation must not read Core profile metadata"
        );
        assert_eq!(
            fixture.resolution_calls.load(Ordering::SeqCst),
            resolutions_before,
            "Stop-won reservation must not call the resolver"
        );
        assert!(!cancelled_marker.exists(), "cancelled run must not spawn");

        let post_resolution_probe = fixture.copy_probe("post-resolution-race-probe");
        let spawn_marker = fixture.workspace.join("unexpected-child-spawned");
        let marker_arg = spawn_marker.to_string_lossy().into_owned();
        let post_resolution_preset = fixture.preset(
            "post-resolution-race",
            &post_resolution_probe,
            &["touch", marker_arg.as_str()],
        );
        let post_resolution_ticket =
            fixture.approved_ticket(post_resolution_preset, "session-post-resolution-race");
        *fixture
            .mutate_after_resolution
            .lock()
            .expect("arm post-resolution mutation") = Some(post_resolution_probe);
        let calls_before = fixture.resolution_calls.load(Ordering::SeqCst);
        let post_resolution_error = fixture
            .start(post_resolution_ticket)
            .await
            .expect_err("post-resolution identity race must prevent spawn");
        assert_eq!(
            post_resolution_error.code,
            EnvRuntimeErrorCode::EXECUTABLE_IDENTITY_MISMATCH
        );
        assert_eq!(
            fixture.resolution_calls.load(Ordering::SeqCst),
            calls_before + 1,
            "post-resolution race must occur after one private resolution"
        );
        assert!(
            !spawn_marker.exists(),
            "identity race must not spawn the child"
        );

        let stop_race_probe = fixture.copy_probe("stop-before-spawn-probe");
        let stop_race_marker = fixture.workspace.join("stop-race-child-spawned");
        let stop_race_marker_arg = stop_race_marker.to_string_lossy().into_owned();
        let stop_race_preset = fixture.preset(
            "stop-before-spawn",
            &stop_race_probe,
            &["touch", stop_race_marker_arg.as_str()],
        );
        let stop_race_ticket =
            fixture.approved_ticket(stop_race_preset, "session-stop-before-spawn");
        let stop_race_id = stop_race_ticket.snapshot.run.id.clone();
        let (hook_reached_tx, hook_reached_rx) = mpsc::sync_channel(1);
        let (stop_finished_tx, stop_finished_rx) = mpsc::sync_channel(1);
        let stop_finished_rx = Arc::new(Mutex::new(stop_finished_rx));
        let hook_stop_finished_rx = Arc::clone(&stop_finished_rx);
        fixture
            .state()
            .env_runtime
            .set_before_spawn_hook(Some(Arc::new(move || {
                hook_reached_tx.send(()).expect("signal pre-spawn boundary");
                hook_stop_finished_rx
                    .lock()
                    .expect("stop completion receiver")
                    .recv_timeout(Duration::from_secs(5))
                    .expect("Stop did not finish at pre-spawn boundary");
            })));
        let stop_runtime = Arc::clone(&fixture.state().env_runtime);
        let stop_thread = std::thread::spawn(move || {
            hook_reached_rx
                .recv_timeout(Duration::from_secs(5))
                .expect("pre-spawn boundary was not reached");
            tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("build stop-before-spawn runtime")
                .block_on(stop_runtime.stop_run(&stop_race_id))
                .expect("Stop must cancel the starting reservation");
            stop_finished_tx.send(()).expect("release pre-spawn hook");
        });
        let calls_before = fixture.resolution_calls.load(Ordering::SeqCst);
        let stop_race_error = fixture
            .start(stop_race_ticket)
            .await
            .expect_err("Stop that wins before spawn must prevent child creation");
        stop_thread.join().expect("join stop-before-spawn thread");
        fixture.state().env_runtime.set_before_spawn_hook(None);
        assert_eq!(stop_race_error.code, EnvRuntimeErrorCode::CANCELLED);
        assert_eq!(
            fixture.resolution_calls.load(Ordering::SeqCst),
            calls_before + 1,
            "Stop race must be exercised after private resolution"
        );
        assert!(
            !stop_race_marker.exists(),
            "Stop that wins the starting reservation must not spawn the child"
        );

        let profile_revision_probe = fixture.copy_probe("profile-revision-probe");
        let profile_revision_preset =
            fixture.preset("profile-revision", &profile_revision_probe, &["wait"]);
        let profile_revision_ticket =
            fixture.approved_ticket(profile_revision_preset, "session-profile-revision");
        fixture.bump_profile_revision();
        let calls_before = fixture.resolution_calls.load(Ordering::SeqCst);
        let profile_revision_error = fixture
            .start(profile_revision_ticket)
            .await
            .expect_err("profile revision mismatch must fail before private resolution");
        assert_eq!(
            profile_revision_error.code,
            EnvRuntimeErrorCode::REVISION_CONFLICT
        );
        assert_eq!(
            fixture.resolution_calls.load(Ordering::SeqCst),
            calls_before,
            "profile revision mismatch must not call the resolver"
        );

        fixture
            .state()
            .catalog_blocking_io_runtime
            .shutdown_with_grace(Duration::from_secs(2))
            .await
            .expect("shutdown test blocking-I/O admission");
        assert!(matches!(
            fixture
                .state()
                .core_rpc_dispatcher
                .shutdown_with_timeout(Duration::from_secs(2)),
            Ok(crate::core_rpc_dispatcher::CoreRpcDispatcherShutdown::Joined)
                | Ok(crate::core_rpc_dispatcher::CoreRpcDispatcherShutdown::AlreadyStopped)
        ));
    }

    #[test]
    #[ignore = "run through scripts/testing/run-env-runtime-integration.sh"]
    fn local_core_process_integration() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("build Env Runtime integration executor")
            .block_on(run_local_core_process_integration());
        let _ = std::io::stdout().flush();
        let _ = std::io::stderr().flush();
        // The desktop test binary links Apple's security frameworks. On
        // macOS 26 their process-finalizer calls CFRelease(NULL) after this
        // LocalCore/process suite, even though every Rust assertion and worker
        // shutdown has completed. This ignored, exact-only harness exits after
        // all checks instead of entering that unrelated platform finalizer.
        // SAFETY: the integration runner executes only this ignored test, and
        // all assertions, child supervisors, and worker shutdowns are complete.
        unsafe { libc::_exit(0) }
    }
}
