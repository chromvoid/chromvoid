mod test_helpers;

use chromvoid_core::crypto::keystore::Keystore;
use chromvoid_core::rpc::{
    LocalRestoreInput, RpcInputStream, RpcReply, RpcRequest, StorageMutationError,
    StorageMutationGuard,
};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use test_helpers::{assert_rpc_ok, create_test_router_with_keystore, unlock_vault};

fn tree(root: &Path) -> BTreeMap<PathBuf, Option<Vec<u8>>> {
    fn visit(root: &Path, directory: &Path, entries: &mut BTreeMap<PathBuf, Option<Vec<u8>>>) {
        for entry in fs::read_dir(directory).unwrap() {
            let path = entry.unwrap().path();
            let relative = path.strip_prefix(root).unwrap().to_path_buf();
            if path.is_dir() {
                entries.insert(relative, None);
                visit(root, &path, entries);
            } else {
                entries.insert(relative, Some(fs::read(path).unwrap()));
            }
        }
    }
    let mut entries = BTreeMap::new();
    visit(root, root, &mut entries);
    entries
}

#[test]
fn adoption_guard_refuses_every_destructive_rpc_before_mutating_storage_or_pepper() {
    let (mut router, root, key) = create_test_router_with_keystore();
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic adoption guard vault"));
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "catalog:createDir",
        serde_json::json!({"name":"preserved while adoption is pending"}),
    )));
    router.save().unwrap();
    let before = tree(root.path());
    let pepper = key.load_storage_pepper().unwrap();
    assert!(pepper.is_some());
    router = router.with_storage_mutation_guard(StorageMutationGuard::new(|| {
        Err(StorageMutationError::AdoptionRequired)
    }));

    for command in [
        "vault:unlock",
        "vault:rekey",
        "vault:repair:diagnose",
        "vault:repair:apply",
        "master:setup",
        "master:rekey",
        "admin:erase",
        "admin:restore",
        "erase:initiate",
        "erase:confirm",
        "erase:execute",
        "restore:local:validate",
        "restore:local:validatePayload",
        "restore:local:validateMasterMaterial",
        "restore:local:start",
        "restore:local:uploadPack",
        "restore:local:commit",
        "restore:local:cancel",
    ] {
        let request = RpcRequest::new(command, serde_json::json!({"confirm":true}));
        let response = router.handle(&request);
        assert_eq!(
            response.code(),
            Some("ADOPTION_ACTION_FORBIDDEN"),
            "{command}"
        );
        let RpcReply::Json(response) = router.handle_with_stream(
            &request,
            Some(RpcInputStream::from_bytes(
                b"synthetic backup bytes".to_vec(),
            )),
        ) else {
            panic!("{command} must refuse before opening a stream");
        };
        assert_eq!(
            response.code(),
            Some("ADOPTION_ACTION_FORBIDDEN"),
            "stream {command}"
        );
        assert_eq!(tree(root.path()), before, "{command} changed storage");
        assert_eq!(
            key.load_storage_pepper().unwrap(),
            pepper,
            "{command} changed pepper"
        );
    }
    assert_rpc_ok(&router.handle(&RpcRequest::new("ping", serde_json::json!({}))));
}

#[test]
fn adoption_guard_blocks_repair_diagnosis_before_initializing_empty_storage() {
    let (router, root, key) = create_test_router_with_keystore();
    assert_eq!(key.load_storage_pepper().unwrap(), None);
    assert!(!root.path().join("salt").exists());
    let permitted = Arc::new(AtomicBool::new(false));
    let admission = permitted.clone();
    let mut router = router.with_storage_mutation_guard(StorageMutationGuard::new(move || {
        if admission.load(Ordering::SeqCst) {
            Ok(())
        } else {
            Err(StorageMutationError::AdoptionRequired)
        }
    }));
    let request = RpcRequest::new(
        "vault:repair:diagnose",
        serde_json::json!({"password":"synthetic adoption guard vault"}),
    );

    // The owner can finish adoption, then refuse later admissions again.
    for allowed in [false, true, false] {
        permitted.store(allowed, Ordering::SeqCst);
        let before = tree(root.path());
        let pepper_before = key.load_storage_pepper().unwrap();
        for with_stream in [false, true] {
            let response = if with_stream {
                let RpcReply::Json(response) = router
                    .handle_with_stream(&request, Some(RpcInputStream::from_bytes(Vec::new())))
                else {
                    panic!("repair diagnosis must return JSON");
                };
                response
            } else {
                router.handle(&request)
            };
            if allowed {
                assert_rpc_ok(&response);
                assert_eq!(response.result().unwrap()["status"], "clean");
                assert!(root.path().join("salt").is_file());
                assert!(key.load_storage_pepper().unwrap().is_some());
            } else {
                assert_eq!(response.code(), Some("ADOPTION_ACTION_FORBIDDEN"));
                assert_eq!(tree(root.path()), before);
                assert_eq!(key.load_storage_pepper().unwrap(), pepper_before);
            }
        }
    }

    let before = tree(root.path());
    let pepper = key.load_storage_pepper().unwrap();
    router = router.with_storage_mutation_guard(StorageMutationGuard::default());
    assert_rpc_ok(&router.handle(&request));
    assert_eq!(tree(root.path()), before);
    assert_eq!(key.load_storage_pepper().unwrap(), pepper);
}

#[test]
fn adoption_guard_protects_typed_restore_and_cancellable_erase_bypassing_dispatch() {
    let (router, root, key) = create_test_router_with_keystore();
    key.store_storage_pepper([53; 32]).unwrap();
    let mut router = router.with_storage_mutation_guard(StorageMutationGuard::new(|| {
        Err(StorageMutationError::AdoptionRequired)
    }));
    let before = tree(root.path());
    let response = router
        .prepare_local_restore(
            LocalRestoreInput::new().unwrap(),
            "synthetic master".into(),
            &|| false,
        )
        .err()
        .unwrap();
    assert_eq!(response.code(), Some("ADOPTION_ACTION_FORBIDDEN"));
    let mut started = false;
    let response =
        router.handle_erase_execute_cancellable(&serde_json::json!({}), &|| false, &mut || {
            started = true
        });
    assert_eq!(response.code(), Some("ADOPTION_ACTION_FORBIDDEN"));
    assert!(!started);
    assert_eq!(tree(root.path()), before);
    assert_eq!(key.load_storage_pepper().unwrap(), Some([53; 32]));
}
