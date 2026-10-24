//! Test fixtures shared by this crate's tests and the shell's.
//!
//! The helpers build a real local vault over a temporary directory. They are
//! forbidden in release builds: a shipped binary has no business constructing
//! a test keystore.

#![allow(dead_code)]

use chromvoid_client_runtime::adapter::CoreAdapter;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use serde_json::{Value, json};
use std::collections::VecDeque;
use std::sync::{Mutex, Once};

pub static SHARED_PROVIDER_TEST_LOCK: Mutex<()> = Mutex::new(());
pub static TEST_ENV_INIT: Once = Once::new();

pub fn enable_local_core_test_keystore() {
    TEST_ENV_INIT.call_once(|| {
        // SAFETY: set once, before any test thread reads these, and only in a
        // build where the fixtures are compiled at all.
        unsafe {
            std::env::set_var("CHROMVOID_TEST_INMEMORY_KEYSTORE", "1");
            std::env::set_var("CHROMVOID_TEST_FAST_KDF", "1");
        }
    });
}

pub fn unlocked_adapter() -> (tempfile::TempDir, Box<dyn CoreAdapter>) {
    enable_local_core_test_keystore();

    let tmp = tempfile::tempdir().expect("tempdir");
    let storage_root = tmp.path().join("storage");

    let mut adapter =
        chromvoid_client_runtime::LocalCoreAdapter::new_with_test_keystore(storage_root)
            .expect("LocalCoreAdapter::new_with_test_keystore");
    adapter.set_master_key(Some("test-master-password".to_string()));

    let setup = RpcRequest::new(
        "master:setup".to_string(),
        json!({"master_password": "test-master-password"}),
    );
    let _ = adapter.handle(&setup);

    let unlock = RpcRequest::new("vault:unlock".to_string(), json!({"password": "test"}));
    let _ = adapter.handle(&unlock);

    (tmp, Box::new(adapter))
}

pub fn ensure_entry(adapter: &mut dyn CoreAdapter) {
    use chromvoid_core::rpc::commands::set_bypass_system_shard_guards;

    set_bypass_system_shard_guards(true);
    let _ = adapter.handle(&RpcRequest::new(
        "catalog:createDir".to_string(),
        json!({"name": ".passmanager", "parent_path": "/"}),
    ));
    let entry = adapter.handle(&RpcRequest::new(
        "catalog:createDir".to_string(),
        json!({"name": "Example", "parent_path": "/.passmanager"}),
    ));
    let _ = entry
        .result()
        .and_then(|v| v.get("node_id"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    let meta = serde_json::json!({
      "id": "cred-example",
      "title": "Example Account",
      "username": "alice@example.com",
      "urls": [{"value": "https://example.com/login", "match": "base_domain"}],
    })
    .to_string();
    let meta_resp = adapter.handle_with_stream(
        &RpcRequest::new(
            "catalog:upload".to_string(),
            json!({
                "name": "meta.json",
                "total_size": meta.len(),
                "size": meta.len(),
                "offset": 0,
                "parent_path": "/.passmanager/Example",
                "mime_type": "application/json",
            }),
        ),
        Some(chromvoid_core::rpc::RpcInputStream::from_bytes(
            meta.into_bytes(),
        )),
    );
    let meta_node = match meta_resp {
        chromvoid_core::rpc::RpcReply::Json(response) => response
            .result()
            .and_then(|v| v.get("node_id"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
        _ => 0,
    };
    let _ = meta_node;

    let pwd = b"correct horse battery staple".to_vec();
    let pwd_resp = adapter.handle_with_stream(
        &RpcRequest::new(
            "catalog:upload".to_string(),
            json!({
                "name": ".password",
                "total_size": 0,
                "size": 0,
                "offset": 0,
                "parent_path": "/.passmanager/Example",
                "mime_type": "text/plain",
            }),
        ),
        Some(chromvoid_core::rpc::RpcInputStream::from_bytes(Vec::new())),
    );
    let pwd_node = match pwd_resp {
        chromvoid_core::rpc::RpcReply::Json(response) => response
            .result()
            .and_then(|v| v.get("node_id"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
        _ => 0,
    };
    let _ = adapter.handle_with_stream(
        &RpcRequest::new(
            "catalog:secret:write".to_string(),
            json!({
                "node_id": pwd_node,
                "total_size": pwd.len(),
                "size": pwd.len(),
                "offset": 0,
                "finish": true,
            }),
        ),
        Some(chromvoid_core::rpc::RpcInputStream::from_bytes(pwd)),
    );

    let _ = adapter.handle(&RpcRequest::new(
        "passmanager:otp:setSecret".to_string(),
        json!({
          "entry_id": "cred-example",
          "label": "default",
          "secret": "JBSWY3DPEHPK3PXP",
          "encoding": "base32",
          "algorithm": "SHA1",
          "digits": 6,
          "period": 30,
        }),
    ));
    set_bypass_system_shard_guards(false);
}

pub struct ScriptedPasskeyAdapter {
    pub commands: Vec<String>,
    status_queue: VecDeque<Value>,
}

impl ScriptedPasskeyAdapter {
    pub fn new(status_queue: Vec<Value>) -> Self {
        Self {
            commands: Vec::new(),
            status_queue: VecDeque::from(status_queue),
        }
    }
}

impl CoreAdapter for ScriptedPasskeyAdapter {
    fn mode(&self) -> chromvoid_client_runtime::adapter::CoreMode {
        chromvoid_client_runtime::adapter::CoreMode::Local
    }

    fn is_unlocked(&self) -> bool {
        true
    }

    fn handle(&mut self, req: &RpcRequest) -> RpcResponse {
        self.commands.push(req.command.clone());
        match req.command.as_str() {
            "credential_provider:status" => {
                let status = self
                    .status_queue
                    .pop_front()
                    .unwrap_or_else(|| json!({"enabled": true, "vault_open": true}));
                RpcResponse::success(status)
            }
            "credential_provider:passkey:create" | "credential_provider:passkey:get" => {
                RpcResponse::success(json!({"credentialIdB64Url": "cred-a"}))
            }
            "credential_provider:passkey:query" => RpcResponse::success(json!({"passkeys": []})),
            _ => RpcResponse::error("unsupported command", Some("UNKNOWN_COMMAND")),
        }
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
