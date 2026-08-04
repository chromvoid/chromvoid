use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use serde_json::{json, Value};

use crate::core_adapter::{CoreAdapter, CoreMode};

use super::keygen::{generate_ssh_key_material, store_generated_ssh_key};

struct RecordingAdapter {
    calls: Vec<&'static str>,
    fail_command: Option<&'static str>,
    save_calls: usize,
    private_key_is_openssh: bool,
    stored_public_key: Option<String>,
    metadata: Option<Value>,
}

impl RecordingAdapter {
    fn successful() -> Self {
        Self {
            calls: Vec::new(),
            fail_command: None,
            save_calls: 0,
            private_key_is_openssh: false,
            stored_public_key: None,
            metadata: None,
        }
    }

    fn fail_on(command: &'static str) -> Self {
        Self {
            fail_command: Some(command),
            ..Self::successful()
        }
    }

    fn required_string(data: &Value, field: &str) -> String {
        data.get(field)
            .and_then(Value::as_str)
            .unwrap_or_else(|| panic!("missing {field}"))
            .to_string()
    }
}

impl CoreAdapter for RecordingAdapter {
    fn mode(&self) -> CoreMode {
        CoreMode::Local
    }

    fn is_unlocked(&self) -> bool {
        true
    }

    fn handle(&mut self, request: &RpcRequest) -> RpcResponse {
        let response = match request.command.as_str() {
            "passmanager:ssh:list" => {
                self.calls.push("list");
                RpcResponse::success(json!({
                    "sshKeys": [{"id": "existing-key"}],
                }))
            }
            "passmanager:ssh:secret:save" => {
                let key_id = Self::required_string(&request.data, "key_id");
                let secret_type = Self::required_string(&request.data, "secret_type");
                let value = Self::required_string(&request.data, "value");

                if secret_type == "ssh_private_key" {
                    self.calls.push("save:private");
                    self.private_key_is_openssh =
                        ssh_key::PrivateKey::from_openssh(value.as_bytes()).is_ok();
                } else if secret_type == "ssh_public_key" {
                    self.calls.push("save:public");
                    self.stored_public_key = Some(value);
                } else {
                    return RpcResponse::error("unexpected secret type", Some("TEST"));
                }

                assert!(!key_id.is_empty());
                RpcResponse::success(Value::Null)
            }
            "passmanager:ssh:key:update" => {
                self.calls.push("update:metadata");
                self.metadata = request.data.get("key").cloned();
                RpcResponse::success(Value::Null)
            }
            "passmanager:ssh:secret:delete" => {
                let secret_type = Self::required_string(&request.data, "secret_type");
                self.calls.push(match secret_type.as_str() {
                    "ssh_private_key" => "delete:private",
                    "ssh_public_key" => "delete:public",
                    _ => return RpcResponse::error("unexpected secret type", Some("TEST")),
                });
                RpcResponse::success(Value::Null)
            }
            "passmanager:ssh:key:delete" => {
                self.calls.push("delete:key");
                RpcResponse::success(Value::Null)
            }
            other => {
                return RpcResponse::error(format!("unexpected command: {other}"), Some("TEST"))
            }
        };

        if self.fail_command == Some(request.command.as_str()) {
            RpcResponse::error("injected failure", Some("TEST"))
        } else {
            response
        }
    }

    fn handle_with_stream(
        &mut self,
        request: &RpcRequest,
        _stream: Option<RpcInputStream>,
    ) -> RpcReply {
        RpcReply::Json(self.handle(request))
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

#[test]
fn generates_ed25519_material() {
    let result = generate_ssh_key_material("ed25519", "user@test").expect("ed25519 keygen");
    assert_eq!(result.key_type, "ed25519");
    assert!(result.public_key_openssh.starts_with("ssh-ed25519 "));
    assert!(!result.fingerprint.is_empty());
}

#[test]
fn rejects_unsupported_key_type() {
    match generate_ssh_key_material("dsa", "user@test") {
        Ok(_) => panic!("must fail"),
        Err(error) => assert!(error.contains("Unsupported key type")),
    }
}

#[test]
fn store_generated_key_uses_the_production_rpc_contract() {
    let mut adapter = RecordingAdapter::successful();
    let material =
        generate_ssh_key_material("ed25519", "deploy@example.test").expect("generate key material");

    let result = store_generated_ssh_key(
        &mut adapter,
        material,
        Some("Deploy key"),
        "deploy@example.test",
        Some("entry-1"),
    )
    .expect("generate and store key");

    assert_eq!(result.key_type, "ed25519");
    assert!(result.public_key_openssh.starts_with("ssh-ed25519 "));
    assert!(adapter.private_key_is_openssh);
    assert_eq!(
        adapter.stored_public_key.as_deref(),
        Some(result.public_key_openssh.as_str())
    );
    assert_eq!(adapter.save_calls, 1);
    assert_eq!(
        adapter.calls,
        ["list", "save:private", "save:public", "update:metadata"]
    );
    assert_eq!(
        adapter.metadata,
        Some(json!({
            "id": result.key_id,
            "type": "ed25519",
            "fingerprint": result.fingerprint,
            "name": "Deploy key",
            "comment": "deploy@example.test",
            "sourceEntryId": "entry-1",
        }))
    );
}

#[test]
fn store_generated_key_rolls_back_secrets_when_metadata_fails() {
    let mut adapter = RecordingAdapter::fail_on("passmanager:ssh:key:update");
    let material =
        generate_ssh_key_material("ed25519", "deploy@example.test").expect("generate key material");

    let error = store_generated_ssh_key(
        &mut adapter,
        material,
        Some("Deploy key"),
        "deploy@example.test",
        None,
    )
    .expect_err("metadata failure must abort key generation");

    assert!(error.contains("Failed to save SSH key metadata"));
    assert_eq!(adapter.save_calls, 0);
    assert_eq!(
        adapter.calls,
        [
            "list",
            "save:private",
            "save:public",
            "update:metadata",
            "delete:private",
            "delete:public",
        ]
    );
}

#[cfg(desktop)]
#[test]
fn remote_mode_persists_generated_key_on_the_mobile_host_without_a_local_save() {
    use crate::core_adapter::{RemoteCoreAdapter, RemoteHost};
    use std::sync::mpsc;

    #[derive(Debug)]
    struct HostState {
        calls: Vec<String>,
        private_key_is_openssh: bool,
        public_key: Option<String>,
        metadata: Option<Value>,
    }

    let (remote_tx, mut remote_rx) =
        tokio::sync::mpsc::channel::<crate::remote_data_plane::RemoteIoRequest>(8);
    let (state_tx, state_rx) = mpsc::channel();
    let host_worker = std::thread::spawn(move || {
        let mut state = HostState {
            calls: Vec::new(),
            private_key_is_openssh: false,
            public_key: None,
            metadata: None,
        };

        for _ in 0..4 {
            let request = remote_rx.blocking_recv().expect("remote SSH RPC");
            state.calls.push(request.request.command.clone());

            let response = match request.request.command.as_str() {
                "passmanager:ssh:list" => RpcResponse::success(json!({"sshKeys": []})),
                "passmanager:ssh:secret:save" => {
                    let secret_type =
                        RecordingAdapter::required_string(&request.request.data, "secret_type");
                    let value = RecordingAdapter::required_string(&request.request.data, "value");
                    match secret_type.as_str() {
                        "ssh_private_key" => {
                            state.private_key_is_openssh =
                                ssh_key::PrivateKey::from_openssh(value.as_bytes()).is_ok();
                        }
                        "ssh_public_key" => state.public_key = Some(value),
                        other => panic!("unexpected remote secret type: {other}"),
                    }
                    RpcResponse::success(Value::Null)
                }
                "passmanager:ssh:key:update" => {
                    state.metadata = request.request.data.get("key").cloned();
                    RpcResponse::success(Value::Null)
                }
                other => panic!("unexpected remote command: {other}"),
            };

            assert!(request.reply_tx.send(RpcReply::Json(response)).is_ok());
        }

        state_tx.send(state).expect("host state result");
    });

    let mut adapter = RemoteCoreAdapter::from_remote_sender(
        RemoteHost::MobileUsb {
            host_id: "phone-host".to_string(),
            label: Some("Pixel".to_string()),
            platform: "android".to_string(),
        },
        remote_tx,
    );
    adapter.apply_startup_state(Vec::new(), true);
    assert!(matches!(adapter.mode(), CoreMode::Remote { .. }));

    let material = generate_ssh_key_material("ed25519", "remote@example.test")
        .expect("generate remote key material");
    let result = store_generated_ssh_key(
        &mut adapter,
        material,
        Some("Remote deploy key"),
        "remote@example.test",
        None,
    )
    .expect("store key on remote mobile host");

    let state = state_rx.recv().expect("remote host state");
    host_worker.join().expect("remote host worker");

    assert_eq!(
        state.calls,
        [
            "passmanager:ssh:list",
            "passmanager:ssh:secret:save",
            "passmanager:ssh:secret:save",
            "passmanager:ssh:key:update",
        ]
    );
    assert!(state.private_key_is_openssh);
    assert_eq!(
        state.public_key.as_deref(),
        Some(&*result.public_key_openssh)
    );
    assert_eq!(
        state.metadata,
        Some(json!({
            "id": result.key_id,
            "type": "ed25519",
            "fingerprint": result.fingerprint,
            "name": "Remote deploy key",
            "comment": "remote@example.test",
            "sourceEntryId": null,
        }))
    );
}
