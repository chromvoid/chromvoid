use chromvoid_client_runtime::rpc_data::clear_rpc_strings;
use serde_json::Value;
use tracing::info;

use crate::app_state::AppState;
use crate::core_rpc_dispatcher::{command_policy, CoreRpcDispatchError, CoreRpcDispatchOutcome};
use crate::helpers::*;
use crate::types::*;

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};

use super::helpers::optional_secret_type_for_log;
use super::lock_transition::handle_lock_transition;
#[cfg(desktop)]
use super::lock_transition::handle_lock_transition_with_reason;
use super::result::{bounded_env_runtime_command, rpc_response_to_result};

#[cfg(any(desktop, test))]
fn should_reconcile_ssh_agent_after_success(command: &str) -> bool {
    matches!(
        command,
        "passmanager:ssh:keygen"
            | "passmanager:ssh:key:import"
            | "passmanager:ssh:key:edit"
            | "passmanager:ssh:key:update"
            | "passmanager:ssh:key:delete"
            | "passmanager:ssh:secret:save"
            | "passmanager:ssh:secret:delete"
            | "passmanager:root:import"
            | "passmanager:import:commit"
    )
}

fn wallet_network_for_log(data: &Value) -> Option<&str> {
    data.get("network").and_then(Value::as_str)
}

fn log_wallet_rpc_outcome(command: &str, network: Option<&str>, response: &RpcResponse) {
    if !command.starts_with("wallet:") {
        return;
    }

    let error_code = response.code().unwrap_or("OK");
    info!(
        wallet_command = command,
        network = network.unwrap_or("<none>"),
        error_code,
        spec_id = "SPEC-217",
        "rpc_dispatch: wallet command completed"
    );
}

fn rpc_command_for_log(command: &str) -> &str {
    if command.starts_with("env_runtime:") {
        bounded_env_runtime_command(command)
    } else {
        command
    }
}

fn log_rpc_dispatch_request(command: &str, data: &Value) {
    info!(
        "rpc_dispatch: command={} data={}",
        rpc_command_for_log(command),
        redact_rpc_data(command, data)
    );
}

#[cfg(any(desktop, test))]
fn env_runtime_reauth_denial_code(command: &str, response: &RpcResponse) -> Option<&'static str> {
    if command != "env_runtime:secret:reveal" {
        return None;
    }
    match response.code() {
        Some("ENV_RUNTIME_REAUTH_FAILED") => Some("ENV_RUNTIME_REAUTH_FAILED"),
        Some("ENV_RUNTIME_REAUTH_LOCKED") => Some("ENV_RUNTIME_REAUTH_LOCKED"),
        _ => None,
    }
}

fn zeroize_sensitive_rpc_data(command: &str, data: &mut Value) {
    if !command.starts_with("passmanager:import:")
        && !matches!(
            command,
            "env_runtime:secret:create"
                | "env_runtime:secret:update"
                | "env_runtime:secret:reveal"
                | "passmanager:entry:create"
                | "passmanager:ssh:key:import"
                | "passmanager:ssh:key:export"
        )
    {
        return;
    }

    clear_rpc_strings(data);
}

fn env_runtime_boundary_error(
    command: &str,
    mode: &crate::core_adapter::CoreMode,
) -> Option<(&'static str, &'static str)> {
    if !command.starts_with("env_runtime:") {
        return None;
    }
    if !cfg!(all(desktop, target_os = "macos")) {
        return Some((
            "Env Runtime is available on macOS desktop only",
            "UNSUPPORTED_PLATFORM",
        ));
    }
    if mode != &crate::core_adapter::CoreMode::Local {
        return Some((
            "Env Runtime requires the local desktop vault",
            "REMOTE_CORE_UNSUPPORTED",
        ));
    }
    None
}

fn guard_env_runtime_adapter_at_dispatch(
    command: &str,
    adapter: &mut dyn crate::core_adapter::CoreAdapter,
) -> Option<RpcResult<Value>> {
    let (message, code) = env_runtime_boundary_error(command, &adapter.mode())?;
    Some(rpc_err(message, Some(code.to_string())))
}

fn guard_env_runtime_access_at_dispatch(
    command: &str,
    adapter: &mut dyn crate::core_adapter::CoreAdapter,
) -> Option<RpcResult<Value>> {
    if let Some(error) = guard_env_runtime_adapter_at_dispatch(command, adapter) {
        return Some(error);
    }
    if !command.starts_with("env_runtime:") || command == "env_runtime:status" {
        return None;
    }
    let capabilities = crate::types::runtime_capabilities_for_current_target();
    crate::module_access::guard_module_for_adapter(
        adapter,
        crate::module_access::MODULE_ENV_RUNTIME,
        &capabilities,
    )
    .err()
}

#[tauri::command]
pub(crate) async fn rpc_dispatch(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    args: RpcDispatchArgs,
) -> Result<RpcResult<Value>, String> {
    touch_last_activity(&state.last_activity, "rpc_dispatch");

    let (command, mut data) = match command_and_data(args) {
        Ok(v) => v,
        Err(e) => return Ok(rpc_err(e, Some("BAD_REQUEST".to_string()))),
    };

    normalize_u64_fields(&mut data);

    let env_runtime_boundary = if command.starts_with("env_runtime:") {
        let mode = state
            .adapter
            .lock()
            .map_err(|_| "Adapter mutex poisoned".to_string())?
            .mode();
        env_runtime_boundary_error(&command, &mode)
    } else {
        None
    };
    if let Some((message, code)) = env_runtime_boundary {
        return Ok(rpc_err(message, Some(code.to_string())));
    }
    if command.starts_with("env_runtime:") && command != "env_runtime:status" {
        if let Err(error) = crate::module_access::guard_module_async(
            &state,
            crate::module_access::MODULE_ENV_RUNTIME,
        )
        .await
        {
            return Ok(error);
        }
        if command == "env_runtime:profile:delete" {
            return Ok(rpc_err(
                "Profile deletion must use the Env Runtime desktop mutation boundary",
                Some("INVALID_REQUEST".to_string()),
            ));
        }
    }

    if command == "catalog:rename" {
        let node_id = data
            .get("node_id")
            .map(|v| v.to_string())
            .unwrap_or_else(|| "null".to_string());
        let new_parent_path = data
            .get("new_parent_path")
            .and_then(|v| v.as_str())
            .unwrap_or("<none>");
        let new_name = match data.get("new_name") {
            Some(v) if v.is_null() => "<null>",
            Some(v) => v.as_str().unwrap_or("<non_string>"),
            None => "<missing>",
        };

        info!(
            target: "chromvoid_lib::rpc::rename",
            node_id,
            new_parent_path,
            new_name,
            "rpc_dispatch: catalog rename request"
        );
    }

    let command_for_log = rpc_command_for_log(&command).to_string();
    log_rpc_dispatch_request(&command, &data);
    let optional_secret_type = optional_secret_type_for_log(&command, &data);
    let wallet_network = wallet_network_for_log(&data).map(str::to_string);

    #[cfg(desktop)]
    if command == "vault:lock" && lock_active_mobile_usb_remote(&app, &state) {
        return rpc_response_to_result(
            &command,
            RpcResponse::success(Value::Null),
            optional_secret_type.as_deref(),
        );
    }

    let policy = command_policy(&command);
    let command_priority = policy.priority;
    let requires_split_handler = policy.requires_split_handler;
    let command_start = state.core_rpc_dispatcher.begin_command(policy);

    #[cfg(desktop)]
    if policy.cancels_low_priority {
        let cancel_epoch = state.vault_background_io_runtime.cancel_low_priority();
        if command == "vault:lock" {
            cancel_remote_media_inspection_for_lock(&state, cancel_epoch).await;
        }
    }

    #[cfg(not(desktop))]
    if policy.cancels_low_priority {
        state.vault_background_io_runtime.cancel_low_priority();
    }

    if command == "catalog:media:inspect" {
        let node_id = match data.get("node_id").and_then(|value| value.as_u64()) {
            Some(node_id) => node_id,
            None => {
                return Ok(rpc_err(
                    "node_id is required",
                    Some("EMPTY_PAYLOAD".to_string()),
                ))
            }
        };
        match crate::core_rpc_dispatcher::media_inspect::dispatch_media_inspect(
            state.core_rpc_dispatcher.clone(),
            state.adapter.clone(),
            app.clone(),
            state
                .vault_background_io_runtime
                .cancellation_epoch_handle(),
            command_start.cancellation_generation,
            node_id,
        )
        .await
        {
            Ok(Some(resp)) => {
                return rpc_response_to_result(&command, resp, optional_secret_type.as_deref())
            }
            Ok(None) => {
                // Non-local adapters keep the existing CoreAdapter RPC path.
            }
            Err(result) => return Ok(result),
        }
    }

    if command == "wallet:balance:get" {
        match crate::core_rpc_dispatcher::wallet_balance::dispatch_wallet_balance(
            state.core_rpc_dispatcher.clone(),
            state.adapter.clone(),
            app.clone(),
            command_start.cancellation_generation,
            data.clone(),
        )
        .await
        {
            Ok(Some(resp)) => {
                log_wallet_rpc_outcome(&command, wallet_network.as_deref(), &resp);
                return rpc_response_to_result(&command, resp, optional_secret_type.as_deref());
            }
            Ok(None) => {
                // Remote and legacy adapters keep the existing CoreAdapter RPC path.
            }
            Err(result) => return Ok(result),
        }
    }

    if command == "wallet:transactions:sync" {
        match crate::core_rpc_dispatcher::wallet_history::dispatch_wallet_history(
            state.core_rpc_dispatcher.clone(),
            state.adapter.clone(),
            app.clone(),
            command_start.cancellation_generation,
            data.clone(),
        )
        .await
        {
            Ok(Some(resp)) => {
                log_wallet_rpc_outcome(&command, wallet_network.as_deref(), &resp);
                return rpc_response_to_result(&command, resp, optional_secret_type.as_deref());
            }
            Ok(None) => {
                // Remote and legacy adapters keep the existing CoreAdapter RPC path.
            }
            Err(result) => return Ok(result),
        }
    }

    let adapter = state.adapter.clone();
    let storage_root = state.storage_root.clone();
    let app_bg = app.clone();
    let command_bg = command.clone();
    let start = std::time::Instant::now();
    let phase = match state
        .core_rpc_dispatcher
        .run_adapter_phase(
            command_priority,
            command_for_log.clone(),
            "generic",
            command_start.cancellation_generation,
            move || {
                let lock_wait_start = std::time::Instant::now();
                let mut adapter = match adapter.lock() {
                    Ok(g) => g,
                    Err(_) => {
                        return Err(rpc_err(
                            "Adapter mutex poisoned",
                            Some("INTERNAL".to_string()),
                        ))
                    }
                };
                // The adapter can switch while this request is queued. Repeat
                // the local-Core and module checks under the same lock used by
                // `handle` so Env Runtime can never be forwarded remotely or
                // mutate after module access was withdrawn.
                if let Some(error) =
                    guard_env_runtime_access_at_dispatch(&command_bg, adapter.as_mut())
                {
                    return Err(error);
                }
                let lock_wait_ms = lock_wait_start.elapsed().as_millis();
                if requires_split_handler && adapter.mode() == crate::core_adapter::CoreMode::Local
                {
                    return Err(rpc_err(
                        format!("Low-priority RPC command requires split handler: {command_bg}"),
                        Some("INTERNAL".to_string()),
                    ));
                }
                if command_bg == "vault:lock" || lock_wait_ms > 5 {
                    let group = if command_bg == "vault:lock" {
                        "perf:vault_lock"
                    } else {
                        "perf:rpc_dispatch"
                    };
                    info!(
                        "{} event=mutex_wait command={} lock_wait_ms={} was_unlocked={}",
                        group,
                        rpc_command_for_log(&command_bg),
                        lock_wait_ms,
                        adapter.is_unlocked()
                    );
                }

                let was_unlocked = adapter.is_unlocked();
                let mut req = RpcRequest::new(command_bg.clone(), data);
                let handle_start = std::time::Instant::now();
                let resp = adapter.handle(&req);
                zeroize_sensitive_rpc_data(&command_bg, &mut req.data);
                let handle_ms = handle_start.elapsed().as_millis();
                if command_bg == "vault:lock" || handle_ms > 10 {
                    let group = if command_bg == "vault:lock" {
                        "perf:vault_lock"
                    } else {
                        "perf:rpc_dispatch"
                    };
                    info!(
                        "{} event=handle command={} handle_ms={} was_unlocked={} now_unlocked={}",
                        group,
                        rpc_command_for_log(&command_bg),
                        handle_ms,
                        was_unlocked,
                        adapter.is_unlocked()
                    );
                }

                if command_bg == "vault:lock" && !resp.is_ok() {
                    let now_unlocked = adapter.is_unlocked();
                    return Ok::<(RpcResponse, bool, bool), RpcResult<Value>>((
                        resp,
                        was_unlocked,
                        now_unlocked,
                    ));
                }

                if let Err(error) = adapter.save() {
                    if command_bg == "vault:lock" {
                        return Err(rpc_err(
                            format!("Failed to save vault lock state: {error}"),
                            Some("INTERNAL".to_string()),
                        ));
                    }
                }
                flush_core_events(&app_bg, adapter.as_mut());

                let now_unlocked = adapter.is_unlocked();
                if was_unlocked != now_unlocked {
                    info!(
                        "rpc_dispatch: unlocked state changed: {} -> {} (command={})",
                        was_unlocked,
                        now_unlocked,
                        rpc_command_for_log(&command_bg)
                    );
                }

                match command_bg.as_str() {
                    "master:setup" | "vault:unlock" | "vault:lock" | "erase:execute" => {
                        let root = match storage_root.lock() {
                            Ok(p) => p.clone(),
                            Err(_) => {
                                return Err(rpc_err(
                                    "Storage root mutex poisoned",
                                    Some("INTERNAL".to_string()),
                                ))
                            }
                        };
                        emit_basic_state(&app_bg, &root, adapter.as_ref());
                    }
                    _ => {}
                }

                Ok::<(RpcResponse, bool, bool), RpcResult<Value>>((
                    resp,
                    was_unlocked,
                    now_unlocked,
                ))
            },
        )
        .await
    {
        Ok(phase) => phase,
        Err(CoreRpcDispatchError::Cancelled) => {
            return Ok(rpc_err(
                "rpc_dispatch cancelled before adapter phase",
                Some("CANCELLED".to_string()),
            ))
        }
        Err(error) => {
            return Ok(rpc_err(
                format!("rpc_dispatch dispatcher error: {error}"),
                Some("INTERNAL".to_string()),
            ))
        }
    };
    let (resp, was_unlocked, now_unlocked) = match phase.value {
        Ok(result) => result,
        Err(error) => return Ok(error),
    };
    let outcome = CoreRpcDispatchOutcome {
        response: resp,
        was_unlocked,
        now_unlocked,
        timing: phase.timing,
    };

    info!(
        "perf:rpc_dispatch event=done command={} dt_ms={} dispatcher_wait_ms={} adapter_phase_ms={}",
        command_for_log,
        start.elapsed().as_millis(),
        outcome.timing.dispatcher_wait_ms,
        outcome.timing.adapter_phase_ms
    );

    handle_lock_transition(&app, &state, outcome.was_unlocked, outcome.now_unlocked);
    log_wallet_rpc_outcome(&command, wallet_network.as_deref(), &outcome.response);
    #[cfg(desktop)]
    if let Some(code) = env_runtime_reauth_denial_code(&command, &outcome.response) {
        state.env_runtime.observability().record_reauth_denied(code);
    }

    if matches!(outcome.response, RpcResponse::Success { .. }) {
        crate::credential_provider_bridge::on_passmanager_mutation(&app, &command);
        #[cfg(desktop)]
        if should_reconcile_ssh_agent_after_success(&command) {
            if let Err(error) =
                crate::commands::ssh_agent_cmds::reconcile_ssh_agent_with_vault(&app, false).await
            {
                tracing::warn!(
                    "rpc_dispatch: ssh-agent reconcile failed after command={} error={}",
                    command,
                    error
                );
            }
        }
    }

    rpc_response_to_result(&command, outcome.response, optional_secret_type.as_deref())
}

#[cfg(desktop)]
fn lock_active_mobile_usb_remote(
    app: &tauri::AppHandle,
    state: &tauri::State<'_, AppState>,
) -> bool {
    let (is_mobile_usb_remote, was_unlocked, now_unlocked) = {
        let mut adapter = match state.adapter.lock() {
            Ok(adapter) => adapter,
            Err(_) => {
                tracing::warn!(
                    "rpc_dispatch: adapter mutex poisoned while locking mobile USB remote"
                );
                return false;
            }
        };
        let is_mobile_usb_remote = matches!(
            adapter.mode(),
            crate::core_adapter::CoreMode::Remote {
                host: crate::core_adapter::RemoteHost::MobileUsb { .. }
            }
        );
        if !is_mobile_usb_remote {
            return false;
        }
        let was_unlocked = adapter.is_unlocked();
        adapter.mark_remote_locked();
        let now_unlocked = adapter.is_unlocked();
        if let Ok(root) = state.storage_root.lock() {
            emit_basic_state(app, &root, adapter.as_ref());
        }
        (is_mobile_usb_remote, was_unlocked, now_unlocked)
    };
    if !is_mobile_usb_remote {
        return false;
    }

    handle_lock_transition_with_reason(app, state, was_unlocked, now_unlocked, "manual");
    true
}

#[cfg(desktop)]
async fn cancel_remote_media_inspection_for_lock(
    state: &tauri::State<'_, AppState>,
    cancel_epoch: u64,
) {
    let adapter = state.adapter.clone();
    let vault_background_io_runtime = state.vault_background_io_runtime.clone();

    match vault_background_io_runtime
        .spawn_blocking(move || {
            let remote_client = match adapter.lock() {
                Ok(adapter) => adapter.remote_json_client(),
                Err(_) => {
                    tracing::warn!(
                        "rpc_dispatch: adapter mutex poisoned while cancelling remote media inspection"
                    );
                    None
                }
            };
            if let Some(remote_client) = remote_client {
                if remote_client.try_send_cancel_media_inspection(cancel_epoch) {
                    tracing::info!(
                        "perf:media_inspection event=cancel_send command=catalog:media:inspect:cancel epoch={}",
                        cancel_epoch
                    );
                } else {
                    tracing::warn!(
                        "rpc_dispatch: remote media inspection cancel was not sent epoch={}",
                        cancel_epoch
                    );
                }
            }
        })
        .await
    {
        Ok(()) => {}
        Err(error) => {
            let (error, _code) = error.into_rpc_error("Remote media inspection cancel");
            tracing::warn!("rpc_dispatch: remote media inspection cancel failed: {error}");
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use chromvoid_core::rpc::{RpcInputStream, RpcReply};
    use serde_json::json;

    use super::{
        env_runtime_boundary_error, env_runtime_reauth_denial_code,
        guard_env_runtime_access_at_dispatch, log_rpc_dispatch_request, rpc_command_for_log,
        should_reconcile_ssh_agent_after_success, wallet_network_for_log,
        zeroize_sensitive_rpc_data,
    };

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

    struct RemoteBoundaryAdapter;

    impl crate::core_adapter::CoreAdapter for RemoteBoundaryAdapter {
        fn mode(&self) -> crate::core_adapter::CoreMode {
            crate::core_adapter::CoreMode::Remote {
                host: crate::core_adapter::RemoteHost::TauriRemoteWss {
                    peer_id: "peer-1".to_string(),
                },
            }
        }

        fn is_unlocked(&self) -> bool {
            true
        }

        fn handle(
            &mut self,
            _req: &chromvoid_core::rpc::types::RpcRequest,
        ) -> chromvoid_core::rpc::types::RpcResponse {
            panic!("boundary guard must reject before forwarding")
        }

        fn handle_with_stream(
            &mut self,
            _req: &chromvoid_core::rpc::types::RpcRequest,
            _stream: Option<RpcInputStream>,
        ) -> RpcReply {
            panic!("boundary guard must reject before forwarding")
        }

        fn save(&mut self) -> Result<(), String> {
            Ok(())
        }

        fn take_events(&mut self) -> Vec<serde_json::Value> {
            Vec::new()
        }

        fn set_master_key(&mut self, _key: Option<String>) {}
    }

    #[test]
    fn ssh_agent_reconcile_triggers_for_root_ssh_mutations() {
        assert!(should_reconcile_ssh_agent_after_success(
            "passmanager:import:commit"
        ));
        assert!(!should_reconcile_ssh_agent_after_success(
            "passmanager:import:review"
        ));
        assert!(should_reconcile_ssh_agent_after_success(
            "passmanager:ssh:key:edit"
        ));
        assert!(should_reconcile_ssh_agent_after_success(
            "passmanager:ssh:keygen"
        ));
        assert!(should_reconcile_ssh_agent_after_success(
            "passmanager:ssh:key:import"
        ));
        assert!(!should_reconcile_ssh_agent_after_success(
            "passmanager:ssh:key:export"
        ));
        assert!(should_reconcile_ssh_agent_after_success(
            "passmanager:ssh:key:update"
        ));
        assert!(should_reconcile_ssh_agent_after_success(
            "passmanager:ssh:key:delete"
        ));
        assert!(should_reconcile_ssh_agent_after_success(
            "passmanager:ssh:secret:save"
        ));
        assert!(should_reconcile_ssh_agent_after_success(
            "passmanager:ssh:secret:delete"
        ));
        assert!(should_reconcile_ssh_agent_after_success(
            "passmanager:root:import"
        ));
        assert!(!should_reconcile_ssh_agent_after_success(
            "passmanager:entry:delete"
        ));
        assert!(!should_reconcile_ssh_agent_after_success(
            "passmanager:secret:save"
        ));
        assert!(!should_reconcile_ssh_agent_after_success("vault:unlock"));
    }

    #[test]
    fn env_runtime_dispatch_log_bounds_command_and_redacts_every_payload_field() {
        let markers = [
            "raw-command-marker",
            "secret-value-marker",
            "master-password-marker",
            "untrusted-reason-marker",
            "/private/raw/path-marker",
            "raw-id-marker",
        ];
        let command = format!("env_runtime:unknown:{}", markers[0]);
        let data = json!({
            "value": markers[1],
            "master_password": markers[2],
            "reason": markers[3],
            "cwd": markers[4],
            "id": markers[5],
        });
        let writer = TestWriter::default();
        let subscriber = tracing_subscriber::fmt()
            .without_time()
            .with_ansi(false)
            .with_max_level(tracing::Level::INFO)
            .with_writer(writer.clone())
            .finish();

        tracing::subscriber::with_default(subscriber, || {
            log_rpc_dispatch_request(&command, &data);
        });

        assert_eq!(rpc_command_for_log(&command), "env_runtime:unknown");
        let log = String::from_utf8(writer.0.lock().expect("log buffer").clone())
            .expect("UTF-8 dispatch log");
        assert!(log.contains("command=env_runtime:unknown"));
        assert!(log.contains("data=\"<redacted>\""));
        for marker in markers {
            assert!(!log.contains(marker), "leaked {marker}: {log}");
        }
    }

    #[test]
    fn wallet_network_log_field_reads_only_top_level_network() {
        assert_eq!(
            wallet_network_for_log(&json!({"network": "testchain"})),
            Some("testchain")
        );
        assert_eq!(
            wallet_network_for_log(&json!({"outputs": [{"network": "nested"}]})),
            None
        );
    }

    #[test]
    fn env_runtime_rpc_never_forwards_to_remote_core() {
        let remote = crate::core_adapter::CoreMode::Remote {
            host: crate::core_adapter::RemoteHost::TauriRemoteWss {
                peer_id: "peer-1".to_string(),
            },
        };
        let error = env_runtime_boundary_error("env_runtime:secret:create", &remote)
            .expect("remote Core must be denied");
        let expected_code = if cfg!(all(desktop, target_os = "macos")) {
            "REMOTE_CORE_UNSUPPORTED"
        } else {
            "UNSUPPORTED_PLATFORM"
        };
        assert_eq!(error.1, expected_code);
        assert!(env_runtime_boundary_error("passmanager:entry:list", &remote).is_none());

        if cfg!(all(desktop, target_os = "macos")) {
            assert!(env_runtime_boundary_error(
                "env_runtime:secret:create",
                &crate::core_adapter::CoreMode::Local,
            )
            .is_none());
        }
    }

    #[test]
    fn final_dispatch_guard_rechecks_remote_adapter_before_forwarding() {
        let mut adapter = RemoteBoundaryAdapter;
        let error = guard_env_runtime_access_at_dispatch("env_runtime:secret:create", &mut adapter)
            .expect("remote adapter must be denied at final dispatch");
        let expected_code = if cfg!(all(desktop, target_os = "macos")) {
            "REMOTE_CORE_UNSUPPORTED"
        } else {
            "UNSUPPORTED_PLATFORM"
        };

        assert!(matches!(
            error,
            crate::types::RpcResult::Error {
                code: Some(ref code),
                ..
            } if code == expected_code
        ));
    }

    #[test]
    fn env_runtime_reauth_denial_metric_accepts_only_reveal_failures() {
        let failed = chromvoid_core::rpc::types::RpcResponse::error(
            "sentinel-master-password-must-not-be-observed",
            Some("ENV_RUNTIME_REAUTH_FAILED"),
        );
        assert_eq!(
            env_runtime_reauth_denial_code("env_runtime:secret:reveal", &failed),
            Some("ENV_RUNTIME_REAUTH_FAILED")
        );
        assert_eq!(
            env_runtime_reauth_denial_code("env_runtime:secret:update", &failed),
            None
        );

        let unrelated = chromvoid_core::rpc::types::RpcResponse::error(
            "sentinel-error-must-not-be-observed",
            Some("ENV_RUNTIME_VALIDATION_FAILED"),
        );
        assert_eq!(
            env_runtime_reauth_denial_code("env_runtime:secret:reveal", &unrelated),
            None
        );
        assert_eq!(
            env_runtime_reauth_denial_code(
                "env_runtime:secret:reveal",
                &chromvoid_core::rpc::types::RpcResponse::success(serde_json::Value::Null),
            ),
            None
        );
    }

    #[test]
    fn ssh_exchange_logs_never_include_private_payloads() {
        for command in [
            "passmanager:ssh:key:import",
            "passmanager:ssh:key:export",
            "passmanager:import:append",
            "passmanager:import:review",
        ] {
            let data = json!({"chunk_base64": "file-body-marker", "source_password": "database-password-marker", "private_key": "private-key-marker", "passphrase": "passphrase-marker"});
            assert_eq!(
                crate::helpers::redact_rpc_data(command, &data),
                json!("<redacted>")
            );
        }
    }

    #[test]
    fn sensitive_rpc_payloads_are_zeroized_after_core_handle() {
        for command in [
            "env_runtime:secret:create",
            "env_runtime:secret:update",
            "env_runtime:secret:reveal",
            "passmanager:entry:create",
            "passmanager:ssh:key:import",
            "passmanager:ssh:key:export",
            "passmanager:import:append",
            "passmanager:import:review",
        ] {
            let mut data = json!({
                "id": "secret-id",
                "nested": ["secret-value", {"master_password": "password"}],
            });

            zeroize_sensitive_rpc_data(command, &mut data);

            assert_eq!(data["id"], "", "{command}");
            assert_eq!(data["nested"][0], "", "{command}");
            assert_eq!(data["nested"][1]["master_password"], "", "{command}");
        }
    }

    #[test]
    fn unrelated_rpc_payloads_are_not_zeroized() {
        let mut data = json!({"value": "keep"});

        zeroize_sensitive_rpc_data("passmanager:entry:list", &mut data);

        assert_eq!(data["value"], "keep");
    }
}
