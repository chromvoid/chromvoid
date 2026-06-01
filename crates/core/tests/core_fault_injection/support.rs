use std::io::Read;
use std::sync::Arc;

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::crypto::{chunk_name_u64, encrypt, sha256_hex};
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcInputStream, RpcReply, RpcRouter};
use chromvoid_core::storage::Storage;
use chromvoid_core::vault::Vault;
use tempfile::TempDir;

use crate::test_helpers::*;

pub(crate) const MASTER_PASSWORD: &str = "correct horse battery staple";
pub(crate) const OLD_VAULT_PASSWORD: &str = "old vault password";
pub(crate) const NEW_VAULT_PASSWORD: &str = "new vault password";
pub(crate) const STORAGE_GC_MANIFEST_CONTEXT: &[u8] = b"admin-storage-gc-delete-manifest:v1";
pub(crate) const STORAGE_GC_ORPHAN_CHUNK: &str =
    "1231231231231231231231231231231231231231231231231231231231231231";

#[derive(Clone)]
pub(crate) struct LocalBackupPack {
    pub(crate) manifest: serde_json::Value,
    pub(crate) pack: Vec<u8>,
    pub(crate) metadata: String,
    pub(crate) master_salt: String,
    pub(crate) master_verify: String,
}

pub(crate) fn router_with_storage(storage: Storage, keystore: Arc<InMemoryKeystore>) -> RpcRouter {
    RpcRouter::new(storage).with_keystore(keystore)
}

pub(crate) fn vault_key_for_storage(
    storage: &Storage,
    keystore: &InMemoryKeystore,
    password: &str,
) -> [u8; chromvoid_core::KEY_SIZE] {
    let session =
        Vault::unlock_with_keystore(storage, password, Some(keystore)).expect("unlock vault");
    *session.vault_key()
}

pub(crate) fn storage_gc_manifest_chunk_name(vault_key: &[u8; chromvoid_core::KEY_SIZE]) -> String {
    chunk_name_u64(vault_key, STORAGE_GC_MANIFEST_CONTEXT, 0)
}

pub(crate) fn write_storage_gc_manifest(
    storage: &Storage,
    vault_key: &[u8; chromvoid_core::KEY_SIZE],
    candidate_name: &str,
) {
    let candidate_data = storage
        .read_chunk(candidate_name)
        .expect("read storage GC candidate");
    let marker_name = storage_gc_manifest_chunk_name(vault_key);
    let manifest = serde_json::json!({
        "version": 1,
        "gc_id": "storage-gc-fault",
        "candidates": [{
            "name": candidate_name,
            "bytes": candidate_data.len() as u64,
            "sha256": sha256_hex(&candidate_data),
        }],
    });
    let plain = serde_json::to_vec(&manifest).expect("serialize storage GC manifest");
    let encrypted =
        encrypt(&plain, vault_key, marker_name.as_bytes()).expect("encrypt storage GC manifest");
    storage
        .write_chunk_atomic(&marker_name, &encrypted)
        .expect("write storage GC manifest");
    storage.sync().expect("sync storage GC manifest");
}

pub(crate) fn prepare_file(router: &mut RpcRouter, name: &str, bytes: &[u8]) -> u64 {
    prepare_file_with_chunk_size(router, name, bytes, None)
}

pub(crate) fn prepare_file_with_chunk_size(
    router: &mut RpcRouter,
    name: &str,
    bytes: &[u8],
    chunk_size: Option<u32>,
) -> u64 {
    let mut data = serde_json::json!({
        "parent_path": "/",
        "name": name,
        "total_size": bytes.len() as u64,
        "size": bytes.len() as u64,
        "offset": 0,
        "mime_type": "application/octet-stream",
    });
    if let Some(chunk_size) = chunk_size {
        data["chunk_size"] = serde_json::json!(chunk_size);
    }
    let upload = RpcRequest::new("catalog:upload", data);
    let response = match router
        .handle_with_stream(&upload, Some(RpcInputStream::from_bytes(bytes.to_vec())))
    {
        RpcReply::Json(response) => response,
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => panic!("upload must return JSON"),
    };
    assert_rpc_ok(&response);
    let node_id = get_node_id(&response);
    router.save().expect("save uploaded file");
    node_id
}

pub(crate) fn download_file(router: &mut RpcRouter, node_id: u64) -> Vec<u8> {
    let request = RpcRequest::new(
        "catalog:download",
        serde_json::json!({
            "node_id": node_id,
        }),
    );
    let mut reader = match router.handle_with_stream(&request, None) {
        RpcReply::Stream(stream) => stream.reader,
        RpcReply::Json(response) => panic!("download returned JSON: {response:?}"),
        RpcReply::RangeStream(_) => panic!("download must return full stream"),
    };
    let mut out = Vec::new();
    reader.read_to_end(&mut out).expect("read download");
    out
}

pub(crate) fn try_download_file(router: &mut RpcRouter, node_id: u64) -> Option<Vec<u8>> {
    let request = RpcRequest::new(
        "catalog:download",
        serde_json::json!({
            "node_id": node_id,
        }),
    );
    let mut reader = match router.handle_with_stream(&request, None) {
        RpcReply::Stream(stream) => stream.reader,
        RpcReply::Json(_) | RpcReply::RangeStream(_) => return None,
    };
    let mut out = Vec::new();
    reader.read_to_end(&mut out).ok()?;
    Some(out)
}

pub(crate) fn setup_master(router: &mut RpcRouter) {
    enable_fast_kdf_for_tests();
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "master:setup",
        serde_json::json!({"master_password": MASTER_PASSWORD}),
    )));
}

pub(crate) fn admin_backup_bytes(router: &mut RpcRouter) -> Vec<u8> {
    let request = RpcRequest::new(
        "admin:backup",
        serde_json::json!({"master_password": MASTER_PASSWORD}),
    );
    let mut stream = match router.handle_with_stream(&request, None) {
        RpcReply::Stream(stream) => stream,
        RpcReply::Json(response) => panic!("backup returned JSON: {response:?}"),
        RpcReply::RangeStream(_) => panic!("backup must return full stream"),
    };
    let mut bytes = Vec::new();
    stream.reader.read_to_end(&mut bytes).expect("read backup");
    bytes
}

pub(crate) fn admin_restore_stream(router: &mut RpcRouter, bytes: Vec<u8>) -> RpcResponse {
    let request = RpcRequest::new(
        "admin:restore",
        serde_json::json!({"master_password": MASTER_PASSWORD}),
    );
    match router.handle_with_stream(&request, Some(RpcInputStream::from_bytes(bytes))) {
        RpcReply::Json(response) => response,
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => panic!("restore must return JSON"),
    }
}

pub(crate) fn write_derivative(router: &mut RpcRouter, node_id: u64, bytes: &[u8]) -> bool {
    let request = RpcRequest::new(
        "catalog:derivative:write",
        serde_json::json!({
            "node_id": node_id,
            "source_version": 1,
            "version": 1,
            "tier": "preview",
            "size": bytes.len() as u64,
            "name": "preview.bin",
            "mime_type": "application/octet-stream",
            "file_extension": "bin",
        }),
    );
    match router.handle_with_stream(&request, Some(RpcInputStream::from_bytes(bytes.to_vec()))) {
        RpcReply::Json(response) => response.is_ok(),
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("derivative write must return JSON")
        }
    }
}

pub(crate) fn read_derivative(router: &mut RpcRouter, node_id: u64) -> Vec<u8> {
    try_read_derivative(router, node_id).expect("derivative must be readable")
}

pub(crate) fn try_read_derivative(router: &mut RpcRouter, node_id: u64) -> Option<Vec<u8>> {
    let request = RpcRequest::new(
        "catalog:derivative:read",
        serde_json::json!({
            "node_id": node_id,
            "source_version": 1,
            "version": 1,
            "tier": "preview",
        }),
    );
    let mut reader = match router.handle_with_stream(&request, None) {
        RpcReply::Stream(stream) => stream.reader,
        RpcReply::Json(_) | RpcReply::RangeStream(_) => return None,
    };
    let mut out = Vec::new();
    reader.read_to_end(&mut out).ok()?;
    Some(out)
}

pub(crate) fn password_can_read_file(
    temp_dir: &TempDir,
    keystore: Arc<InMemoryKeystore>,
    password: &str,
    node_id: u64,
    expected: &[u8],
) -> bool {
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut router = router_with_storage(storage, keystore);
    unlock_vault(&mut router, password).is_ok()
        && try_download_file(&mut router, node_id).as_deref() == Some(expected)
}

pub(crate) fn exactly_one_vault_password_can_read_file(
    temp_dir: &TempDir,
    keystore: Arc<InMemoryKeystore>,
    node_id: u64,
    expected: &[u8],
) {
    let new_valid = password_can_read_file(
        temp_dir,
        keystore.clone(),
        NEW_VAULT_PASSWORD,
        node_id,
        expected,
    );
    let old_valid =
        password_can_read_file(temp_dir, keystore, OLD_VAULT_PASSWORD, node_id, expected);
    assert_ne!(
        old_valid, new_valid,
        "exactly one vault password must read the persisted file"
    );
}

pub(crate) fn master_setup_ok(temp_dir: &TempDir, password: &str) -> bool {
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut router = RpcRouter::new(storage);
    router
        .handle(&RpcRequest::new(
            "master:setup",
            serde_json::json!({"master_password": password}),
        ))
        .is_ok()
}

pub(crate) fn exactly_one_master_password_is_valid(
    temp_dir: &TempDir,
    old_password: &str,
    new_password: &str,
) {
    let old_valid = master_setup_ok(temp_dir, old_password);
    let new_valid = master_setup_ok(temp_dir, new_password);
    assert_ne!(
        old_valid, new_valid,
        "exactly one master password must remain valid"
    );
}

pub(crate) fn build_admin_backup() -> Vec<u8> {
    let source_dir = TempDir::new().expect("source dir");
    let source_keystore = Arc::new(InMemoryKeystore::new());
    let storage = Storage::new(source_dir.path()).expect("storage");
    let mut router = router_with_storage(storage, source_keystore).with_master_key(MASTER_PASSWORD);
    setup_master(&mut router);
    assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
    prepare_file(&mut router, "restore.bin", b"restore me");
    admin_backup_bytes(&mut router)
}

pub(crate) fn restored_backup_is_readable(
    temp_dir: &TempDir,
    keystore: Arc<InMemoryKeystore>,
) -> bool {
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut router = router_with_storage(storage, keystore);
    unlock_vault(&mut router, OLD_VAULT_PASSWORD).is_ok() && list_dir(&mut router, "/").is_ok()
}

pub(crate) fn save_passmanager_secret(router: &mut RpcRouter, entry_id: &str, value: &str) -> bool {
    let saved_entry = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({"id": entry_id, "title": "Secret Entry"}),
    ));
    if !saved_entry.is_ok() {
        return false;
    }
    router
        .handle(&RpcRequest::new(
            "passmanager:secret:save",
            serde_json::json!({
                "entry_id": entry_id,
                "secret_type": "password",
                "value": value,
            }),
        ))
        .is_ok()
}

pub(crate) fn save_passmanager_otp_secret(router: &mut RpcRouter, secret: &str) -> bool {
    let saved_entry = router.handle(&RpcRequest::new(
        "passmanager:entry:save",
        serde_json::json!({
            "id": "otp-fault-entry",
            "title": "OTP Fault Entry",
            "otps": [{
                "id": "otp-fault",
                "label": "Main"
            }]
        }),
    ));
    if !saved_entry.is_ok() {
        return false;
    }
    router
        .handle(&RpcRequest::new(
            "passmanager:otp:setSecret",
            serde_json::json!({
                "entry_id": "otp-fault-entry",
                "otp_id": "otp-fault",
                "secret": secret,
                "encoding": "base32",
            }),
        ))
        .is_ok()
}

pub(crate) fn passmanager_otp_is_readable(
    temp_dir: &TempDir,
    keystore: Arc<InMemoryKeystore>,
) -> bool {
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut router = router_with_storage(storage, keystore);
    assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
    router
        .handle(&RpcRequest::new(
            "passmanager:otp:generate",
            serde_json::json!({
                "entry_id": "otp-fault-entry",
                "otp_id": "otp-fault",
                "ts": 0,
            }),
        ))
        .is_ok()
}

pub(crate) fn read_passmanager_secret(
    temp_dir: &TempDir,
    keystore: Arc<InMemoryKeystore>,
    entry_id: &str,
) -> Option<String> {
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut router = router_with_storage(storage, keystore);
    assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
    let response = router.handle(&RpcRequest::new(
        "passmanager:secret:read",
        serde_json::json!({
            "entry_id": entry_id,
            "secret_type": "password",
        }),
    ));
    response
        .result()
        .and_then(|value| value.get("value"))
        .and_then(|value| value.as_str())
        .map(str::to_string)
}

pub(crate) fn build_local_backup_pack() -> LocalBackupPack {
    let temp_dir = TempDir::new().expect("source dir");
    let keystore = Arc::new(InMemoryKeystore::new());
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut router = router_with_storage(storage, keystore).with_master_key(MASTER_PASSWORD);
    setup_master(&mut router);
    assert_rpc_ok(&unlock_vault(&mut router, OLD_VAULT_PASSWORD));
    prepare_file(&mut router, "restore-pack.bin", b"restore pack bytes");

    let start = router.handle(&RpcRequest::new(
        "backup:local:start",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&start);
    let backup_id = start
        .result()
        .unwrap()
        .get("backup_id")
        .and_then(|value| value.as_str())
        .expect("backup_id")
        .to_string();

    let manifest_response = router.handle(&RpcRequest::new(
        "backup:local:getChunkManifest",
        serde_json::json!({"backup_id": backup_id}),
    ));
    assert_rpc_ok(&manifest_response);
    let manifest = manifest_response
        .result()
        .unwrap()
        .get("manifest")
        .expect("manifest")
        .clone();

    let pack_request = RpcRequest::new(
        "backup:local:downloadPack",
        serde_json::json!({"backup_id": backup_id}),
    );
    let mut reader = match router.handle_with_stream(&pack_request, None) {
        RpcReply::Stream(stream) => stream.reader,
        RpcReply::Json(response) => panic!("downloadPack returned JSON: {response:?}"),
        RpcReply::RangeStream(_) => panic!("downloadPack must return full stream"),
    };
    let mut pack = Vec::new();
    reader.read_to_end(&mut pack).expect("read backup pack");

    let metadata_response = router.handle(&RpcRequest::new(
        "backup:local:getMetadata",
        serde_json::json!({"backup_id": backup_id}),
    ));
    assert_rpc_ok(&metadata_response);
    let metadata = metadata_response.result().expect("metadata result");
    let metadata_b64 = metadata
        .get("metadata")
        .and_then(|value| value.as_str())
        .expect("metadata")
        .to_string();
    let master_salt = metadata
        .get("master_salt")
        .and_then(|value| value.as_str())
        .expect("master_salt")
        .to_string();
    let master_verify = metadata
        .get("master_verify")
        .and_then(|value| value.as_str())
        .expect("master_verify")
        .to_string();

    LocalBackupPack {
        manifest,
        pack,
        metadata: metadata_b64,
        master_salt,
        master_verify,
    }
}

pub(crate) fn start_restore_session(router: &mut RpcRouter) -> String {
    let backup_dir = TempDir::new().expect("backup dir");
    let start = router.handle(&RpcRequest::new(
        "restore:local:start",
        serde_json::json!({"backup_path": backup_dir.path().to_string_lossy()}),
    ));
    assert_rpc_ok(&start);
    start
        .result()
        .unwrap()
        .get("restore_id")
        .and_then(|value| value.as_str())
        .expect("restore_id")
        .to_string()
}

pub(crate) fn try_start_restore_session(router: &mut RpcRouter) -> Option<String> {
    let backup_dir = TempDir::new().expect("backup dir");
    let start = router.handle(&RpcRequest::new(
        "restore:local:start",
        serde_json::json!({"backup_path": backup_dir.path().to_string_lossy()}),
    ));
    if !start.is_ok() {
        return None;
    }
    start
        .result()
        .and_then(|value| value.get("restore_id"))
        .and_then(|value| value.as_str())
        .map(str::to_string)
}

pub(crate) fn upload_restore_pack(
    router: &mut RpcRouter,
    restore_id: &str,
    manifest: serde_json::Value,
    pack: Vec<u8>,
) -> RpcResponse {
    let request = RpcRequest::new(
        "restore:local:uploadPack",
        serde_json::json!({
            "restore_id": restore_id,
            "manifest": manifest,
        }),
    );
    match router.handle_with_stream(&request, Some(RpcInputStream::from_bytes(pack))) {
        RpcReply::Json(response) => response,
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("restore:local:uploadPack must return JSON")
        }
    }
}

pub(crate) fn commit_restore_pack(
    router: &mut RpcRouter,
    restore_id: &str,
    metadata: &str,
    master_salt: &str,
    master_verify: &str,
) -> RpcResponse {
    router.handle(&RpcRequest::new(
        "restore:local:commit",
        serde_json::json!({
            "restore_id": restore_id,
            "metadata": metadata,
            "master_salt": master_salt,
            "master_verify": master_verify,
        }),
    ))
}

pub(crate) fn retry_local_restore(
    target_dir: &TempDir,
    target_keystore: Arc<InMemoryKeystore>,
    backup: LocalBackupPack,
) {
    if restored_backup_is_readable(target_dir, target_keystore.clone()) {
        return;
    }

    let storage = Storage::new(target_dir.path()).expect("storage");
    let mut retry =
        router_with_storage(storage, target_keystore.clone()).with_master_key(MASTER_PASSWORD);
    let restore_id = start_restore_session(&mut retry);
    assert_rpc_ok(&upload_restore_pack(
        &mut retry,
        &restore_id,
        backup.manifest,
        backup.pack,
    ));
    assert_rpc_ok(&commit_restore_pack(
        &mut retry,
        &restore_id,
        &backup.metadata,
        &backup.master_salt,
        &backup.master_verify,
    ));
    assert!(restored_backup_is_readable(target_dir, target_keystore));
}
