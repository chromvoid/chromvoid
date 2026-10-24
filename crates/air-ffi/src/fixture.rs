//! Disposable wire fixture, not a vault implementation or password validator.
use crate::{BridgeError, FixtureHarness};
use chromvoid_core::rpc::types::{
    PassmanagerEntryListResponse, RpcCommand, RpcRequest, RpcResponse, VaultStatusResponse,
};
use serde_json::json;
use std::sync::atomic::Ordering;

impl FixtureHarness {
    pub(super) fn dispatch(&self, request: RpcRequest) -> Result<Vec<u8>, BridgeError> {
        let command: RpcCommand =
            serde_json::from_value(json!({"command": request.command, "data": request.data}))
                .map_err(|_| BridgeError::InvalidRequest)?;
        let reply = match command {
            RpcCommand::VaultStatus {} => RpcResponse::success(VaultStatusResponse {
                is_unlocked: self.unlocked.load(Ordering::SeqCst),
                session_started_at: None,
            }),
            RpcCommand::VaultUnlock { password } => {
                if password.is_empty() {
                    RpcResponse::error("Fixture password is required", Some("EMPTY_PAYLOAD"))
                } else {
                    self.unlocked.store(true, Ordering::SeqCst);
                    RpcResponse::success(json!({}))
                }
            }
            RpcCommand::VaultLock {} => {
                self.unlocked.store(false, Ordering::SeqCst);
                RpcResponse::success(json!({}))
            }
            RpcCommand::PassmanagerEntryList {} => {
                if self.unlocked.load(Ordering::SeqCst) {
                    RpcResponse::success(PassmanagerEntryListResponse::new(
                        vec![json!({"id":"air-fixture-one","title":"Synthetic entry"})],
                        vec!["Synthetic folder".into()],
                    ))
                } else {
                    RpcResponse::error("Vault required", Some("VAULT_REQUIRED"))
                }
            }
            _ => RpcResponse::error(
                "Not implemented by the test fixture",
                Some("UNSUPPORTED_CAPABILITY"),
            ),
        };
        serde_json::to_vec(&reply).map_err(|_| BridgeError::InvalidRequest)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{BUILD_FINGERPRINT, MAX_METADATA_BYTES};

    fn call(h: &FixtureHarness, command: &str, data: serde_json::Value) -> serde_json::Value {
        let request = serde_json::to_vec(&RpcRequest::new(command, data)).unwrap();
        serde_json::from_slice(&h.execute(request).unwrap()).unwrap()
    }

    #[test]
    fn fixture_roundtrip_and_lock_gate_use_existing_wire_shapes() {
        let h = FixtureHarness::new(BUILD_FINGERPRINT.into()).unwrap();
        assert_eq!(
            call(&h, "vault:status", json!({})),
            json!({"ok":true,"result":{"is_unlocked":false}})
        );
        assert_eq!(
            call(&h, "passmanager:entry:list", json!({}))["code"],
            "VAULT_REQUIRED"
        );
        assert_eq!(
            call(&h, "vault:unlock", json!({"password":""}))["ok"],
            false
        );
        assert_eq!(
            call(&h, "vault:unlock", json!({"password":"synthetic"}))["ok"],
            true
        );
        let list = call(&h, "passmanager:entry:list", json!({}));
        assert_eq!(list["result"]["entries"].as_array().unwrap().len(), 1);
        assert_eq!(list["result"]["folders"], json!(["Synthetic folder"]));
        call(&h, "vault:lock", json!({}));
        assert_eq!(
            call(&h, "passmanager:entry:list", json!({}))["code"],
            "VAULT_REQUIRED"
        );
    }

    #[test]
    fn malformed_oversize_and_wrong_version_fail_without_state_change() {
        let h = FixtureHarness::new(BUILD_FINGERPRINT.into()).unwrap();
        assert!(matches!(
            h.execute(b"{".to_vec()),
            Err(BridgeError::InvalidRequest)
        ));
        assert!(matches!(
            h.execute(vec![0; MAX_METADATA_BYTES + 1]),
            Err(BridgeError::PayloadTooLarge)
        ));
        assert!(matches!(
            h.execute(
                br#"{"v":2,"command":"vault:unlock","data":{"password":"synthetic"}}"#.to_vec()
            ),
            Err(BridgeError::UnsupportedVersion)
        ));
        assert_eq!(
            call(&h, "vault:status", json!({}))["result"]["is_unlocked"],
            false
        );
    }

    #[test]
    fn optional_unknown_envelope_fields_are_forward_compatible() {
        let h = FixtureHarness::new(BUILD_FINGERPRINT.into()).unwrap();
        let reply = h
            .execute(br#"{"v":1,"command":"vault:status","data":{},"future":true}"#.to_vec())
            .unwrap();
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&reply).unwrap()["ok"],
            true
        );
    }
}
