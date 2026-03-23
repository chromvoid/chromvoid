use crate::core_adapter::{CoreAdapter, CoreMode};
use crate::credential_provider_contract::CREDENTIAL_PROVIDER_STATUS_COMMAND;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use serde_json::{json, Value};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PasskeyRuntimeError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PasskeyProviderPolicy {
    pub provider_enabled: bool,
    pub vault_open: bool,
}

pub fn ensure_local_mode(mode: CoreMode, platform_label: &str) -> Result<(), PasskeyRuntimeError> {
    if matches!(mode, CoreMode::Local) {
        return Ok(());
    }

    Err(PasskeyRuntimeError {
        code: "POLICY_DENIED".to_string(),
        message: format!("{platform_label} passkey adapter requires local Core adapter mode"),
    })
}

pub fn ensure_passkeys_supported(
    is_ready: bool,
    unsupported_reason: Option<&str>,
    fallback_message: &str,
) -> Result<(), PasskeyRuntimeError> {
    if is_ready {
        return Ok(());
    }

    Err(PasskeyRuntimeError {
        code: "UNSUPPORTED".to_string(),
        message: unsupported_reason.unwrap_or(fallback_message).to_string(),
    })
}

pub fn dispatch_provider_rpc(
    adapter: &mut dyn CoreAdapter,
    command: &str,
    data: Value,
) -> Result<Value, PasskeyRuntimeError> {
    match adapter.handle(&RpcRequest::new(command.to_string(), data)) {
        RpcResponse::Success { result, .. } => Ok(result),
        RpcResponse::Error { error, code, .. } => {
            let code = code.unwrap_or_else(|| "PROVIDER_UNAVAILABLE".to_string());
            if code == "PROVIDER_UNAVAILABLE" && error.starts_with("UNSUPPORTED:") {
                return Err(PasskeyRuntimeError {
                    code: "UNSUPPORTED".to_string(),
                    message: error,
                });
            }
            Err(PasskeyRuntimeError {
                code,
                message: error,
            })
        }
    }
}

pub fn provider_policy_preflight(
    adapter: &mut dyn CoreAdapter,
) -> Result<PasskeyProviderPolicy, PasskeyRuntimeError> {
    let status = dispatch_provider_rpc(adapter, CREDENTIAL_PROVIDER_STATUS_COMMAND, json!({}))?;

    let provider_enabled = status
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let vault_open = status
        .get("vault_open")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if !provider_enabled {
        return Err(PasskeyRuntimeError {
            code: "PROVIDER_DISABLED".to_string(),
            message: "Passkeys unavailable: provider is disabled in settings".to_string(),
        });
    }
    if !vault_open {
        return Err(PasskeyRuntimeError {
            code: "VAULT_REQUIRED".to_string(),
            message: "Passkeys unavailable: unlock vault to use passkeys".to_string(),
        });
    }

    Ok(PasskeyProviderPolicy {
        provider_enabled,
        vault_open,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core_adapter::{CoreAdapter, RemoteHost};
    use chromvoid_core::rpc::types::RpcResponse;
    use std::collections::VecDeque;

    struct ScriptedAdapter {
        mode: CoreMode,
        responses: VecDeque<RpcResponse>,
    }

    impl ScriptedAdapter {
        fn new(mode: CoreMode, responses: Vec<RpcResponse>) -> Self {
            Self {
                mode,
                responses: VecDeque::from(responses),
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

        fn handle(&mut self, _req: &RpcRequest) -> RpcResponse {
            self.responses
                .pop_front()
                .unwrap_or_else(|| RpcResponse::success(json!({})))
        }

        fn handle_with_stream(
            &mut self,
            req: &RpcRequest,
            _stream: Option<chromvoid_core::rpc::RpcInputStream>,
        ) -> chromvoid_core::rpc::RpcReply {
            chromvoid_core::rpc::RpcReply::Json(self.handle(req))
        }

        fn save(&mut self) -> Result<(), String> {
            Ok(())
        }

        fn take_events(&mut self) -> Vec<Value> {
            Vec::new()
        }

        fn set_master_key(&mut self, _key: Option<String>) {}
    }

    #[test]
    fn ensure_local_mode_rejects_non_local_adapters() {
        let error = ensure_local_mode(
            CoreMode::Remote {
                host: RemoteHost::MobileBle {
                    device_id: "peer".to_string(),
                },
            },
            "Android",
        )
        .expect_err("remote adapter must fail closed");

        assert_eq!(error.code, "POLICY_DENIED");
        assert_eq!(
            error.message,
            "Android passkey adapter requires local Core adapter mode"
        );
    }

    #[test]
    fn provider_policy_preflight_denies_disabled_provider() {
        let mut adapter = ScriptedAdapter::new(
            CoreMode::Local,
            vec![RpcResponse::success(json!({
                "enabled": false,
                "vault_open": true
            }))],
        );

        let error =
            provider_policy_preflight(&mut adapter).expect_err("disabled provider must be denied");
        assert_eq!(error.code, "PROVIDER_DISABLED");
    }

    #[test]
    fn dispatch_provider_rpc_maps_unsupported_provider_unavailable() {
        let mut adapter = ScriptedAdapter::new(
            CoreMode::Local,
            vec![RpcResponse::error(
                "UNSUPPORTED: passkeys-lite is unavailable",
                Some("PROVIDER_UNAVAILABLE"),
            )],
        );

        let error = dispatch_provider_rpc(
            &mut adapter,
            "credential_provider:passkey:get",
            json!({"platform":"android"}),
        )
        .expect_err("unsupported provider path must map consistently");

        assert_eq!(error.code, "UNSUPPORTED");
        assert_eq!(error.message, "UNSUPPORTED: passkeys-lite is unavailable");
    }
}
