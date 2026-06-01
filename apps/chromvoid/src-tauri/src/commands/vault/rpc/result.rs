use serde_json::Value;

use crate::types::{rpc_ok, RpcResult};

use chromvoid_core::rpc::types::RpcResponse;

use super::helpers::should_downgrade_secret_read_error;

pub(super) fn rpc_response_to_result(
    command: &str,
    resp: RpcResponse,
    optional_secret_type: Option<&str>,
) -> Result<RpcResult<Value>, String> {
    match resp {
        RpcResponse::Success { ok: _, result } => {
            let wrapper = serde_json::json!({
                "command": command,
                "result": result,
            });
            match serde_json::from_value::<chromvoid_core::rpc::types::RpcCommandResult>(
                wrapper.clone(),
            ) {
                Ok(typed) => {
                    let typed_value = serde_json::to_value(typed).unwrap_or(wrapper);
                    Ok(rpc_ok(typed_value))
                }
                Err(_) => Ok(rpc_ok(wrapper)),
            }
        }
        RpcResponse::Error { ok: _, error, code } => {
            if should_downgrade_secret_read_error(command, optional_secret_type, code.as_deref()) {
                tracing::info!(
                    "rpc_dispatch: optional secret missing command={} secret_type={} code={:?} optional_secret_missing=true error={}",
                    command,
                    optional_secret_type.unwrap_or("<missing>"),
                    code,
                    error
                );
            } else {
                tracing::error!(
                    "rpc_dispatch: error command={} code={:?} error={}",
                    command,
                    code,
                    error
                );
            }
            Ok(RpcResult::Error {
                ok: false,
                error,
                code,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rpc_response_to_result_wraps_success_response_with_command() {
        let result = rpc_response_to_result(
            "catalog:list",
            RpcResponse::success(json!({"items": []})),
            None,
        )
        .expect("finalize");

        match result {
            RpcResult::Success { result, .. } => {
                assert_eq!(
                    result.get("command").and_then(|v| v.as_str()),
                    Some("catalog:list")
                );
                assert_eq!(result.get("result"), Some(&json!({"items": []})));
            }
            RpcResult::Error { .. } => panic!("expected success"),
        }
    }

    #[test]
    fn rpc_response_to_result_wraps_error_response() {
        let result = rpc_response_to_result(
            "catalog:list",
            RpcResponse::error("Vault not unlocked", Some("VAULT_REQUIRED")),
            None,
        )
        .expect("finalize");

        match result {
            RpcResult::Error { error, code, .. } => {
                assert_eq!(error, "Vault not unlocked");
                assert_eq!(code.as_deref(), Some("VAULT_REQUIRED"));
            }
            RpcResult::Success { .. } => panic!("expected error"),
        }
    }

    #[test]
    fn rpc_response_to_result_optional_secret_missing_still_returns_original_error() {
        let result = rpc_response_to_result(
            "passmanager:secret:read",
            RpcResponse::error("Node not found", Some("NODE_NOT_FOUND")),
            Some("password"),
        )
        .expect("finalize");

        match result {
            RpcResult::Error { error, code, .. } => {
                assert_eq!(error, "Node not found");
                assert_eq!(code.as_deref(), Some("NODE_NOT_FOUND"));
            }
            RpcResult::Success { .. } => panic!("expected error"),
        }
    }
}
