//! Disposable cross-revision fixture; copied into an example target by verify-core-versions.py.

#[cfg(not(debug_assertions))]
compile_error!("The compatibility fixture must never be built for release");

use chromvoid_core::crypto::keystore::{Keystore, KeystoreError};
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse, PROTOCOL_VERSION};
use chromvoid_core::rpc::{RpcInputStream, RpcReply, RpcRouter};
use chromvoid_core::storage::Storage;
use serde_json::{json, Value};
use std::io::Read;
use std::path::PathBuf;
use std::sync::Arc;

const ENTRY: &str = "version-compatibility-entry";
const TITLE: &str = "Совместимость – Compatibility";
const PASSWORD: &str = "synthetic cross-version vault password";

// Both binaries use this deliberately public fixture value. No platform key is read,
// exported, copied or persisted; this does not establish Keychain/entitlement continuity.
struct FixtureKeystore;
impl Keystore for FixtureKeystore {
    fn load_storage_pepper(&self) -> Result<Option<[u8; 32]>, KeystoreError> {
        Ok(Some([0x41; 32]))
    }
    fn store_storage_pepper(&self, _: [u8; 32]) -> Result<(), KeystoreError> {
        panic!("The fixture key must not be replaced")
    }
    fn delete_storage_pepper(&self) -> Result<(), KeystoreError> {
        panic!("The fixture key must not be deleted")
    }
}

fn result(command: &str, response: RpcResponse) -> Value {
    assert!(
        response.is_ok(),
        "{command} failed: {:?}: {:?}",
        response.code(),
        response.error_message()
    );
    response.result().unwrap().clone()
}

fn call(router: &mut RpcRouter, command: &str, data: Value) -> Value {
    result(command, router.handle(&RpcRequest::new(command, data)))
}

fn payload(stage: u8) -> Vec<u8> {
    (0..131_137)
        .map(|i| ((i * 17 + usize::from(stage)) % 251) as u8)
        .collect()
}

fn write_file(router: &mut RpcRouter, node_id: Option<u64>, stage: u8) -> u64 {
    let bytes = payload(stage);
    let mut request = json!({"parent_path":"/", "name":"compatibility.bin",
        "total_size":bytes.len(), "size":bytes.len(), "offset":0});
    if let Some(id) = node_id {
        request["node_id"] = json!(id);
    }
    match router.handle_with_stream(
        &RpcRequest::new("catalog:upload", request),
        Some(RpcInputStream::from_bytes(bytes)),
    ) {
        RpcReply::Json(response) => result("catalog:upload", response)["node_id"]
            .as_u64()
            .unwrap(),
        _ => panic!("Upload must return metadata"),
    }
}

fn verify(router: &mut RpcRouter, node_id: u64, stage: u8) {
    let list = call(router, "passmanager:entry:list", json!({}));
    let entries = list["entries"].as_array().unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0]["id"], ENTRY);
    assert_eq!(entries[0]["title"], TITLE);
    let detail = call(router, "passmanager:entry:read", json!({"entry_id":ENTRY}));
    assert_eq!(detail["entry"]["groupPath"], "/Compat");
    let secret = call(
        router,
        "passmanager:secret:read",
        json!({"entry_id":ENTRY, "secret_type":"password"}),
    );
    assert_eq!(secret["value"], format!("synthetic stage {stage}"));
    match router.handle_with_stream(
        &RpcRequest::new("catalog:download", json!({"node_id":node_id})),
        None,
    ) {
        RpcReply::Stream(mut stream) => {
            let mut bytes = Vec::new();
            stream.reader.read_to_end(&mut bytes).unwrap();
            assert!(
                bytes == payload(stage),
                "Binary contents differ at stage {stage}"
            );
        }
        _ => panic!("Download must return a binary stream"),
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    assert!(
        args.len() == 3 || args.len() == 4,
        "Expected fixture directory, phase and optional file ID"
    );
    let directory = PathBuf::from(&args[1]);
    assert_eq!(
        std::fs::read_to_string(directory.join(".air-core-version-fixture")).unwrap(),
        "disposable synthetic compatibility fixture\n"
    );
    let phase = args[2].as_str();
    assert!(matches!(phase, "create" | "update" | "rollback" | "verify"));
    let root = directory.join("storage");
    assert_eq!(
        root.exists(),
        phase != "create",
        "Unexpected fixture storage state"
    );
    let mut router =
        RpcRouter::new(Storage::new(&root).unwrap()).with_keystore(Arc::new(FixtureKeystore));
    call(&mut router, "vault:unlock", json!({"password":PASSWORD}));

    let (node_id, stage) = if phase == "create" {
        call(
            &mut router,
            "passmanager:entry:create",
            json!({
                "entry_id":ENTRY, "entry_type":"login", "title":TITLE,
                "group_path":"/Compat", "secrets":{"password":"synthetic stage 0"}
            }),
        );
        (write_file(&mut router, None, 0), 0)
    } else {
        let node_id: u64 = args[3].parse().unwrap();
        let before = match phase {
            "update" => 0,
            "rollback" => 1,
            _ => 2,
        };
        verify(&mut router, node_id, before);
        if phase == "verify" {
            (node_id, before)
        } else {
            let after = before + 1;
            call(
                &mut router,
                "passmanager:secret:save",
                json!({
                    "entry_id":ENTRY, "secret_type":"password", "value":format!("synthetic stage {after}")
                }),
            );
            assert_eq!(write_file(&mut router, Some(node_id), after), node_id);
            (node_id, after)
        }
    };
    verify(&mut router, node_id, stage);
    router.save().unwrap();
    call(&mut router, "vault:lock", json!({}));
    drop(router);
    println!(
        "{}",
        json!({"phase":phase, "stage":stage, "entry_id":ENTRY,
        "file_id":node_id, "file_bytes":payload(stage).len(), "protocol_version":PROTOCOL_VERSION})
    );
}
