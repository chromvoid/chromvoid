use crate::app_state::AppState;
use crate::core_adapter::{CoreAdapter, CoreMode};
use crate::types::{rpc_err, rpc_ok, MasterRekeyResult, RpcResult, TauriRpcResult};
use crate::vault_background_io::VaultBackgroundIoTaskError;

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use serde_json::Value;

#[tauri::command]
pub(crate) async fn master_rekey(
    state: tauri::State<'_, AppState>,
    current_password: String,
    new_master_password: String,
) -> TauriRpcResult<MasterRekeyResult> {
    if let Some(error) = validate_master_rekey_input(&current_password, &new_master_password) {
        return Ok(error);
    }

    let adapter = state.adapter.clone();
    let vault_background_io_runtime = state.vault_background_io_runtime.clone();
    match vault_background_io_runtime
        .spawn_blocking(move || {
            let mut adapter = match adapter.lock() {
                Ok(adapter) => adapter,
                Err(_) => return rpc_err("Adapter mutex poisoned", Some("INTERNAL".to_string())),
            };
            master_rekey_inner(adapter.as_mut(), current_password, new_master_password)
        })
        .await
    {
        Ok(result) => Ok(result),
        Err(error) => Ok(vault_background_io_rpc_err(error, "Master rekey")),
    }
}

fn validate_master_rekey_input(
    current_password: &str,
    new_master_password: &str,
) -> Option<RpcResult<MasterRekeyResult>> {
    if current_password.is_empty() {
        return Some(RpcResult::Error {
            ok: false,
            error: "current_password is required".to_string(),
            code: Some("BAD_REQUEST".to_string()),
        });
    }
    if new_master_password.is_empty() {
        return Some(RpcResult::Error {
            ok: false,
            error: "new_master_password is required".to_string(),
            code: Some("BAD_REQUEST".to_string()),
        });
    }
    None
}

fn master_rekey_inner(
    adapter: &mut dyn CoreAdapter,
    current_password: String,
    new_master_password: String,
) -> RpcResult<MasterRekeyResult> {
    if let Some(error) = validate_master_rekey_input(&current_password, &new_master_password) {
        return error;
    }

    if adapter.mode() != CoreMode::Local {
        return RpcResult::Error {
            ok: false,
            error: "Master password migration is only available for local storage".to_string(),
            code: Some("UNSUPPORTED_REMOTE_MODE".to_string()),
        };
    }

    let req = RpcRequest::new(
        "master:rekey",
        serde_json::json!({
            "current_password": current_password,
            "new_master_password": new_master_password,
        }),
    );
    let resp = adapter.handle(&req);
    let _ = adapter.save();

    match resp {
        RpcResponse::Success { result, .. } => rpc_ok(parse_master_rekey_success(&result)),
        RpcResponse::Error { error, code, .. } => RpcResult::Error {
            ok: false,
            error,
            code,
        },
    }
}

fn parse_master_rekey_success(result: &Value) -> MasterRekeyResult {
    let rewrapped_artifacts = parse_rewrapped_artifacts(result);
    let backup_recommended = match result.get("backup_recommended") {
        Some(value) => match value.as_bool() {
            Some(value) => value,
            None => {
                tracing::warn!(
                    "vault: master rekey success response backup_recommended field is not boolean"
                );
                true
            }
        },
        None => {
            tracing::warn!("vault: master rekey success response missing backup_recommended field");
            true
        }
    };

    MasterRekeyResult {
        rewrapped_artifacts,
        backup_recommended,
    }
}

fn parse_rewrapped_artifacts(result: &Value) -> Vec<String> {
    let Some(value) = result.get("rewrapped_artifacts") else {
        tracing::warn!("vault: master rekey success response missing rewrapped_artifacts field");
        return Vec::new();
    };
    let Some(items) = value.as_array() else {
        tracing::warn!("vault: master rekey success response rewrapped_artifacts is not an array");
        return Vec::new();
    };

    let mut artifacts = Vec::with_capacity(items.len());
    let mut skipped = 0usize;
    for item in items {
        if let Some(item) = item.as_str() {
            artifacts.push(item.to_string());
        } else {
            skipped += 1;
        }
    }
    if skipped > 0 {
        tracing::warn!(
            skipped,
            "vault: master rekey success response skipped non-string rewrapped artifacts"
        );
    }
    artifacts
}

fn vault_background_io_rpc_err<T>(
    error: VaultBackgroundIoTaskError,
    task_label: &'static str,
) -> RpcResult<T> {
    let (error, code) = error.into_rpc_error(task_label);
    rpc_err(error, code)
}

#[cfg(test)]
mod tests {
    use chromvoid_core::rpc::{RpcInputStream, RpcReply};
    use serde_json::{json, Value};

    use super::*;

    struct ScriptedAdapter {
        mode: CoreMode,
        response: RpcResponse,
        last_request: Option<RpcRequest>,
        save_calls: usize,
    }

    impl ScriptedAdapter {
        fn new(mode: CoreMode, response: RpcResponse) -> Self {
            Self {
                mode,
                response,
                last_request: None,
                save_calls: 0,
            }
        }
    }

    impl CoreAdapter for ScriptedAdapter {
        fn mode(&self) -> CoreMode {
            self.mode.clone()
        }

        fn is_unlocked(&self) -> bool {
            true
        }

        fn handle(&mut self, req: &RpcRequest) -> RpcResponse {
            self.last_request = Some(req.clone());
            self.response.clone()
        }

        fn handle_with_stream(
            &mut self,
            req: &RpcRequest,
            _stream: Option<RpcInputStream>,
        ) -> RpcReply {
            RpcReply::Json(self.handle(req))
        }

        fn save(&mut self) -> Result<(), String> {
            self.save_calls += 1;
            Ok(())
        }

        fn take_events(&mut self) -> Vec<Value> {
            Vec::new()
        }

        fn set_master_key(&mut self, _key: Option<String>) {}
    }

    fn assert_result_error<T>(result: RpcResult<T>, expected_code: &str) {
        match result {
            RpcResult::Error { code, .. } => assert_eq!(code.as_deref(), Some(expected_code)),
            RpcResult::Success { .. } => panic!("expected {expected_code} error"),
        }
    }

    #[test]
    fn master_rekey_inner_rejects_empty_passwords_before_adapter_call() {
        let mut adapter = ScriptedAdapter::new(CoreMode::Local, RpcResponse::success(json!({})));

        assert_result_error(
            master_rekey_inner(
                &mut adapter,
                String::new(),
                "new master password".to_string(),
            ),
            "BAD_REQUEST",
        );
        assert_result_error(
            master_rekey_inner(
                &mut adapter,
                "current master password".to_string(),
                String::new(),
            ),
            "BAD_REQUEST",
        );

        assert!(adapter.last_request.is_none());
        assert_eq!(adapter.save_calls, 0);
    }

    #[test]
    fn master_rekey_inner_rejects_non_local_adapter() {
        let mut adapter =
            ScriptedAdapter::new(CoreMode::Switching, RpcResponse::success(json!({})));

        assert_result_error(
            master_rekey_inner(
                &mut adapter,
                "current master password".to_string(),
                "new master password".to_string(),
            ),
            "UNSUPPORTED_REMOTE_MODE",
        );

        assert!(adapter.last_request.is_none());
        assert_eq!(adapter.save_calls, 0);
    }

    #[test]
    fn master_rekey_inner_forwards_snake_case_payload_and_maps_success() {
        let mut adapter = ScriptedAdapter::new(
            CoreMode::Local,
            RpcResponse::success(json!({
                "rewrapped_artifacts": ["master.verify"],
                "backup_recommended": false,
            })),
        );

        let result = master_rekey_inner(
            &mut adapter,
            "current master password".to_string(),
            "new master password".to_string(),
        );

        let RpcResult::Success { result, .. } = result else {
            panic!("expected success");
        };
        assert_eq!(result.rewrapped_artifacts, vec!["master.verify"]);
        assert!(!result.backup_recommended);
        let request = adapter.last_request.expect("core request");
        assert_eq!(request.command, "master:rekey");
        assert_eq!(
            request.data,
            json!({
                "current_password": "current master password",
                "new_master_password": "new master password",
            })
        );
        assert_eq!(adapter.save_calls, 1);
    }

    #[test]
    fn master_rekey_success_parser_preserves_defaults_for_malformed_shape() {
        let parsed = parse_master_rekey_success(&json!({
            "rewrapped_artifacts": "master.verify",
            "backup_recommended": "yes",
        }));

        assert!(parsed.rewrapped_artifacts.is_empty());
        assert!(parsed.backup_recommended);
    }

    #[test]
    fn master_rekey_success_parser_skips_malformed_artifact_entries() {
        let parsed = parse_master_rekey_success(&json!({
            "rewrapped_artifacts": ["master.verify", 1, null, "media.keys"],
            "backup_recommended": false,
        }));

        assert_eq!(
            parsed.rewrapped_artifacts,
            vec!["master.verify".to_string(), "media.keys".to_string()]
        );
        assert!(!parsed.backup_recommended);
    }

    #[test]
    fn master_rekey_inner_preserves_core_error_code() {
        let mut adapter = ScriptedAdapter::new(
            CoreMode::Local,
            RpcResponse::error(
                "Current master password is invalid",
                Some("MASTER_REKEY_INVALID_CURRENT_PASSWORD"),
            ),
        );

        let result = master_rekey_inner(
            &mut adapter,
            "wrong master password".to_string(),
            "new master password".to_string(),
        );

        match result {
            RpcResult::Error { error, code, .. } => {
                assert_eq!(error, "Current master password is invalid");
                assert_eq!(
                    code.as_deref(),
                    Some("MASTER_REKEY_INVALID_CURRENT_PASSWORD")
                );
            }
            RpcResult::Success { .. } => panic!("expected core error"),
        }
        assert_eq!(adapter.save_calls, 1);
    }

    #[test]
    fn vault_background_io_rpc_err_preserves_shutdown_code() {
        match vault_background_io_rpc_err::<MasterRekeyResult>(
            VaultBackgroundIoTaskError::ShuttingDown,
            "Master rekey",
        ) {
            RpcResult::Error { error, code, .. } => {
                assert_eq!(error, "Vault background IO is shutting down");
                assert_eq!(code.as_deref(), Some("SHUTTING_DOWN"));
            }
            RpcResult::Success { .. } => panic!("expected shutdown error"),
        }
    }
}
