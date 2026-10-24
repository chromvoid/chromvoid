mod approval;
mod support;

use serde::Serialize;
use tauri::{Manager, Window};

use crate::app_state::AppState;
use crate::commands::ensure_main_window_caller;

use approval::resolve_sign_approval;
#[cfg(test)]
pub(crate) use support::build_private_key_reader;
use support::{agent_status, start_ssh_agent_with_entries};
pub(crate) use support::{
    collect_ssh_agent_entries, ensure_ssh_agent_feature_access, reconcile_ssh_agent_with_vault,
};
#[cfg(test)]
use support::{ensure_local_mode, refresh_action};

pub(crate) type SshAgentEntries = Vec<crate::ssh_agent::SshAgentEntry>;

#[derive(Debug, Serialize)]
pub struct SshAgentStatus {
    pub running: bool,
    pub socket_path: Option<String>,
    pub identities_count: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SshAgentRefreshAction {
    SkippedLockedOrRemote,
    SkippedAgentStopped,
    SkippedNoIdentities,
    Started,
    Refreshed,
}

#[tauri::command]
pub async fn ssh_agent_status(
    app: tauri::AppHandle,
    window: Window,
) -> Result<SshAgentStatus, String> {
    ensure_main_window_caller(window.label(), "ssh_agent_status")?;

    let state = app.state::<AppState>();
    let agent = state
        .ssh_agent
        .lock()
        .map_err(|_| "SSH agent mutex poisoned".to_string())?;

    Ok(agent_status(&agent))
}

#[tauri::command]
pub async fn ssh_agent_start(
    app: tauri::AppHandle,
    window: Window,
) -> Result<SshAgentStatus, String> {
    ensure_main_window_caller(window.label(), "ssh_agent_start")?;

    let entries = {
        let state = app.state::<AppState>();
        let mut adapter = state
            .adapter
            .lock()
            .map_err(|_| "Adapter mutex poisoned".to_string())?;

        ensure_ssh_agent_feature_access(adapter.as_mut(), "ssh_agent_start")?;

        if !adapter.is_unlocked() {
            return Err("Vault is locked".to_string());
        }

        collect_ssh_agent_entries(adapter.as_mut())?
    };

    start_ssh_agent_with_entries(app, entries)
}

#[tauri::command]
pub async fn ssh_agent_sign_approval_resolve(
    app: tauri::AppHandle,
    window: Window,
    request_id: String,
    approved: bool,
) -> Result<(), String> {
    ensure_main_window_caller(window.label(), "ssh_agent_sign_approval_resolve")?;

    {
        let state = app.state::<AppState>();
        let mut adapter = state
            .adapter
            .lock()
            .map_err(|_| "Adapter mutex poisoned".to_string())?;
        ensure_ssh_agent_feature_access(adapter.as_mut(), "ssh_agent_sign_approval_resolve")?;
    }

    resolve_sign_approval(app, request_id, approved).await
}

#[tauri::command]
pub async fn ssh_agent_stop(
    app: tauri::AppHandle,
    window: Window,
) -> Result<SshAgentStatus, String> {
    ensure_main_window_caller(window.label(), "ssh_agent_stop")?;

    let state = app.state::<AppState>();
    crate::ssh_agent::stop_shared_state(&state.ssh_agent, crate::ssh_agent::StopReason::Manual)
        .await;

    Ok(SshAgentStatus {
        running: false,
        socket_path: None,
        identities_count: 0,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        collect_ssh_agent_entries, ensure_local_mode, ensure_main_window_caller,
        reconcile_ssh_agent_with_vault, refresh_action, SshAgentRefreshAction,
    };
    use crate::app_state::AppState;
    use crate::core_adapter::{ConnectionState, CoreAdapter, CoreMode, RemoteHost};
    use crate::gateway::GatewayState;
    use crate::session_settings::SessionSettings;
    use crate::ssh_agent::{stop_shared_state, SshAgentEntry, SshAgentState, StopReason};
    use crate::volume_manager::VolumeManager;
    use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
    use chromvoid_core::rpc::{RpcInputStream, RpcReply};
    use serde_json::json;
    use std::collections::HashMap;
    use std::sync::atomic::AtomicBool;
    use std::sync::{Arc, Mutex, OnceLock};
    use tauri::test::MockRuntime;
    use tauri::Manager;
    use tempfile::TempDir;

    struct TestAdapterData {
        mode: CoreMode,
        unlocked: bool,
        entries: Vec<serde_json::Value>,
        secrets: HashMap<(String, String), String>,
    }

    struct TestAdapter {
        shared: Arc<Mutex<TestAdapterData>>,
    }

    impl CoreAdapter for TestAdapter {
        fn mode(&self) -> CoreMode {
            self.shared.lock().expect("adapter lock").mode.clone()
        }

        fn connection_state(&self) -> ConnectionState {
            ConnectionState::Disconnected
        }

        fn is_unlocked(&self) -> bool {
            self.shared.lock().expect("adapter lock").unlocked
        }

        fn handle(&mut self, req: &RpcRequest) -> RpcResponse {
            let shared = self.shared.lock().expect("adapter lock");
            match req.command.as_str() {
                "passmanager:ssh:list" => RpcResponse::success(json!({
                    "sshKeys": shared.entries,
                })),
                "passmanager:ssh:secret:read" => {
                    let key_id = req
                        .data
                        .get("key_id")
                        .and_then(|value| value.as_str())
                        .unwrap_or_default()
                        .to_string();
                    let secret_type = req
                        .data
                        .get("secret_type")
                        .and_then(|value| value.as_str())
                        .unwrap_or_default()
                        .to_string();

                    match shared.secrets.get(&(key_id, secret_type)) {
                        Some(value) => RpcResponse::success(json!({"value": value})),
                        None => RpcResponse::error("missing", Some("NOT_FOUND")),
                    }
                }
                other => RpcResponse::error(format!("unexpected command: {other}"), Some("TEST")),
            }
        }

        fn handle_with_stream(
            &mut self,
            req: &RpcRequest,
            _stream: Option<RpcInputStream>,
        ) -> RpcReply {
            RpcReply::Json(self.handle(req))
        }

        fn save(&mut self) -> Result<(), String> {
            Ok(())
        }

        fn take_events(&mut self) -> Vec<serde_json::Value> {
            Vec::new()
        }

        fn set_master_key(&mut self, _key: Option<String>) {}
    }

    struct XdgConfigGuard {
        previous: Option<std::ffi::OsString>,
    }

    impl XdgConfigGuard {
        fn set(path: &std::path::Path) -> Self {
            let previous = std::env::var_os("XDG_CONFIG_HOME");
            // SAFETY: env mutation in test fixture; serialised by env_lock() Mutex (line 239) and restored on Drop.
            unsafe {
                std::env::set_var("XDG_CONFIG_HOME", path);
            }
            Self { previous }
        }
    }

    impl Drop for XdgConfigGuard {
        fn drop(&mut self) {
            match self.previous.take() {
                // SAFETY: env mutation in test fixture; serialised by env_lock() Mutex (line 239) and restored on Drop.
                Some(value) => unsafe {
                    std::env::set_var("XDG_CONFIG_HOME", value);
                },
                // SAFETY: env mutation in test fixture; serialised by env_lock() Mutex (line 239) and restored on Drop.
                None => unsafe {
                    std::env::remove_var("XDG_CONFIG_HOME");
                },
            }
        }
    }

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn sample_pubkey(comment: &str) -> String {
        format!(
            "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIO+I0O6tnVW8gFDrWZ15l6WO3ol8YV0P4i4R6Jr4h9rB {comment}"
        )
    }

    fn app_with_state(
        adapter_shared: Arc<Mutex<TestAdapterData>>,
    ) -> (TempDir, tauri::App<MockRuntime>) {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let app = tauri::test::mock_app();

        let adapter: Arc<Mutex<Box<dyn CoreAdapter>>> =
            Arc::new(Mutex::new(Box::new(TestAdapter {
                shared: adapter_shared,
            }) as Box<dyn CoreAdapter>));
        let remote_io_runtime = Arc::new(crate::remote_io_runtime::RemoteIoRuntimeState::new());

        app.manage(AppState {
            adapter: adapter.clone(),
            core_rpc_dispatcher: crate::core_rpc_dispatcher::CoreRpcDispatcher::try_new()
                .expect("core RPC dispatcher"),
            sync_runtime: Arc::new(crate::commands::sync_cmds::SyncRuntimeState::new()),
            storage_root: Arc::new(Mutex::new(tempdir.path().join("storage"))),
            gateway: Arc::new(Mutex::new(GatewayState::load_or_default(
                tempdir.path().join("gateway.json"),
            ))),
            env_runtime: Arc::new(
                crate::env_runtime::EnvRuntimeState::new(
                    tempdir.path().join("env-runtime-device.enc.json"),
                )
                .expect("env runtime"),
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
            image_preview_runtime: Arc::new(crate::image_preview::ImagePreviewRuntimeState::new()),
            prepared_preview_runtime: Arc::new(
                crate::commands::catalog::PreparedPreviewRuntimeState::new(),
            ),
            media_streams: Arc::new(crate::media_source::LocalMediaSourceManager::new()),
            media_protocol_runtime: Arc::new(crate::media_stream::MediaProtocolRuntimeState::new()),
            media_http_stream_runtime: Arc::new(
                crate::media_stream::MediaHttpStreamRuntimeState::new(),
            ),
            network_pairing_runtime: Arc::new(
                crate::network::pairing::NetworkPairingRuntimeState::new(),
            ),
            remote_io_runtime: remote_io_runtime.clone(),
            mobile_usb_runtime: Arc::new(crate::mobile_usb::MobileUsbController::new(
                Arc::new(crate::mobile_usb::UnsupportedMobileUsbBridge),
                Arc::new(crate::mobile_usb::JsonMobileUsbPairingStore::new(
                    tempdir.path().join("storage"),
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
        });

        (tempdir, app)
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
                session_id: "test-session".to_string(),
                host_unlocked: false,
                transport_session_generation: 1,
            })
        }
    }

    #[test]
    fn ssh_agent_main_window_gate_rejects_non_main_callers() {
        let error = ensure_main_window_caller("settings", "ssh_agent_status")
            .expect_err("non-main window must be denied");

        assert_eq!(error, "ssh_agent_status is restricted to the main window");
    }

    #[test]
    fn ssh_agent_privileged_commands_require_local_mode() {
        let error = ensure_local_mode(
            CoreMode::Remote {
                host: RemoteHost::TauriRemoteWss {
                    peer_id: "peer".to_string(),
                },
            },
            "ssh_agent_start",
        )
        .expect_err("remote mode must be denied");

        assert_eq!(error, "ssh_agent_start requires local Core adapter mode");
    }

    #[test]
    fn collect_entries_reads_indexed_ssh_keys() {
        let shared = Arc::new(Mutex::new(TestAdapterData {
            mode: CoreMode::Local,
            unlocked: true,
            entries: vec![json!({
                "id": "key-a",
                "comment": "deploy",
                "fingerprint": "SHA256:metadata-is-not-trusted",
            })],
            secrets: HashMap::from([(
                ("key-a".to_string(), "ssh_public_key".to_string()),
                "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIO+I0O6tnVW8gFDrWZ15l6WO3ol8YV0P4i4R6Jr4h9rB deploy".to_string(),
            )]),
        }));
        let mut adapter = TestAdapter { shared };

        let entries = collect_ssh_agent_entries(&mut adapter).expect("collect entries");
        assert_eq!(
            entries,
            vec![SshAgentEntry::new(
                "key-a",
                "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIO+I0O6tnVW8gFDrWZ15l6WO3ol8YV0P4i4R6Jr4h9rB deploy"
                    .to_string(),
                "deploy".to_string(),
            )]
        );
    }

    #[test]
    fn collect_entries_ignores_malformed_root_metadata() {
        let shared = Arc::new(Mutex::new(TestAdapterData {
            mode: CoreMode::Local,
            unlocked: true,
            entries: vec![json!({
                "id": "",
                "sshKeyType": "ed25519",
                "sshKeyFingerprint": "SHA256:legacy",
                "sshKeyComment": "legacy",
            })],
            secrets: HashMap::new(),
        }));
        let mut adapter = TestAdapter { shared };

        let entries = collect_ssh_agent_entries(&mut adapter).expect("malformed metadata skipped");
        assert!(entries.is_empty());
    }

    #[test]
    fn collect_entries_propagates_entry_list_errors() {
        let shared = Arc::new(Mutex::new(TestAdapterData {
            mode: CoreMode::Local,
            unlocked: true,
            entries: vec![],
            secrets: HashMap::new(),
        }));
        struct FailingListAdapter {
            shared: Arc<Mutex<TestAdapterData>>,
        }
        impl CoreAdapter for FailingListAdapter {
            fn mode(&self) -> CoreMode {
                self.shared.lock().expect("adapter lock").mode.clone()
            }
            fn connection_state(&self) -> ConnectionState {
                ConnectionState::Disconnected
            }
            fn is_unlocked(&self) -> bool {
                self.shared.lock().expect("adapter lock").unlocked
            }
            fn handle(&mut self, req: &RpcRequest) -> RpcResponse {
                if req.command == "passmanager:ssh:list" {
                    return RpcResponse::error("transient list failure", Some("TEST"));
                }
                RpcResponse::error("unexpected", Some("TEST"))
            }
            fn handle_with_stream(
                &mut self,
                req: &RpcRequest,
                _stream: Option<RpcInputStream>,
            ) -> RpcReply {
                RpcReply::Json(self.handle(req))
            }
            fn save(&mut self) -> Result<(), String> {
                Ok(())
            }
            fn take_events(&mut self) -> Vec<serde_json::Value> {
                Vec::new()
            }
            fn set_master_key(&mut self, _key: Option<String>) {}
        }

        let mut adapter = FailingListAdapter { shared };
        let error = collect_ssh_agent_entries(&mut adapter).expect_err("list error must bubble");
        assert!(error.contains("transient list failure"));
    }

    #[test]
    fn refresh_action_noops_when_locked_or_stopped_without_restart_permission() {
        assert_eq!(
            refresh_action(false, false, true, false),
            SshAgentRefreshAction::SkippedLockedOrRemote
        );
        assert_eq!(
            refresh_action(true, false, false, false),
            SshAgentRefreshAction::SkippedAgentStopped
        );
        assert_eq!(
            refresh_action(true, false, true, true),
            SshAgentRefreshAction::SkippedNoIdentities
        );
        assert_eq!(
            refresh_action(true, true, false, true),
            SshAgentRefreshAction::Refreshed
        );
    }

    #[tokio::test]
    async fn unlock_auto_start_enabled_starts_only_when_identities_exist() {
        let _env_lock = env_lock().lock().expect("env lock");
        let shared = Arc::new(Mutex::new(TestAdapterData {
            mode: CoreMode::Local,
            unlocked: true,
            entries: vec![],
            secrets: HashMap::new(),
        }));
        let (_tempdir, app) = app_with_state(shared.clone());
        let _xdg_guard = XdgConfigGuard::set(_tempdir.path());

        let skipped = reconcile_ssh_agent_with_vault(app.handle(), true)
            .await
            .expect("reconcile without identities");
        assert_eq!(skipped, SshAgentRefreshAction::SkippedNoIdentities);

        {
            let mut state = shared.lock().expect("adapter data");
            state.entries = vec![json!({
                "id": "key-a",
                "comment": "deploy",
                "fingerprint": "SHA256:abc",
            })];
            state.secrets.insert(
                ("key-a".to_string(), "ssh_public_key".to_string()),
                sample_pubkey("deploy"),
            );
        }

        let started = reconcile_ssh_agent_with_vault(app.handle(), true)
            .await
            .expect("reconcile with identities");
        assert_eq!(started, SshAgentRefreshAction::Started);

        let ssh_agent = app.state::<AppState>().ssh_agent.clone();
        {
            let agent = ssh_agent.lock().expect("agent lock");
            assert!(agent.is_running());
            assert_eq!(agent.identities_count(), 1);
        }

        stop_shared_state(&ssh_agent, StopReason::Manual).await;
    }

    #[tokio::test]
    async fn unlock_auto_start_disabled_and_runtime_refresh_updates_running_identities() {
        let _env_lock = env_lock().lock().expect("env lock");
        let shared = Arc::new(Mutex::new(TestAdapterData {
            mode: CoreMode::Local,
            unlocked: true,
            entries: vec![json!({
                "id": "key-a",
                "comment": "deploy",
                "fingerprint": "SHA256:abc",
            })],
            secrets: HashMap::from([(
                ("key-a".to_string(), "ssh_public_key".to_string()),
                sample_pubkey("deploy"),
            )]),
        }));
        let (_tempdir, app) = app_with_state(shared.clone());
        let _xdg_guard = XdgConfigGuard::set(_tempdir.path());

        let skipped = reconcile_ssh_agent_with_vault(app.handle(), false)
            .await
            .expect("reconcile without restart permission");
        assert_eq!(skipped, SshAgentRefreshAction::SkippedAgentStopped);

        let started = reconcile_ssh_agent_with_vault(app.handle(), true)
            .await
            .expect("start agent");
        assert_eq!(started, SshAgentRefreshAction::Started);

        {
            let mut state = shared.lock().expect("adapter data");
            state.entries = vec![
                json!({
                    "id": "key-a",
                    "comment": "deploy",
                    "fingerprint": "SHA256:abc",
                }),
                json!({
                    "id": "key-b",
                    "comment": "backup",
                    "fingerprint": "SHA256:def",
                }),
            ];
            state.secrets.insert(
                ("key-b".to_string(), "ssh_public_key".to_string()),
                sample_pubkey("backup"),
            );
        }

        let refreshed = reconcile_ssh_agent_with_vault(app.handle(), false)
            .await
            .expect("refresh identities");
        assert_eq!(refreshed, SshAgentRefreshAction::Refreshed);

        let ssh_agent = app.state::<AppState>().ssh_agent.clone();
        {
            let agent = ssh_agent.lock().expect("agent lock");
            assert!(agent.is_running());
            assert_eq!(agent.identities_count(), 2);
        }

        stop_shared_state(&ssh_agent, StopReason::Manual).await;
    }
}
