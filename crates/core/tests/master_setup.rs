//! ADR-017 master_password setup (target contract)

mod test_helpers;

use chromvoid_core::rpc::types::RpcRequest;
use std::fs;
use test_helpers::*;

const MASTER_PASSWORD: &str = "correct horse battery staple";

#[test]
fn test_master_setup_creates_master_salt_once() {
    let (mut router, temp_dir) = create_test_router();

    let r1 = router.handle(&RpcRequest::new(
        "master:setup",
        serde_json::json!({"master_password": MASTER_PASSWORD}),
    ));
    assert_rpc_ok(&r1);
    assert_eq!(
        r1.result()
            .unwrap()
            .get("created")
            .and_then(|v| v.as_bool()),
        Some(true)
    );

    let salt_path = temp_dir.path().join("master.salt");
    let verify_path = temp_dir.path().join("master.verify");

    let salt1 = fs::read(&salt_path).expect("master.salt must exist");
    assert_eq!(salt1.len(), 16, "ADR-017: master.salt must be 16 bytes");
    assert!(
        salt1.iter().any(|&b| b != 0),
        "master.salt must not be all zeros"
    );

    let verify1 = fs::read(&verify_path).expect("master.verify must exist");
    assert_eq!(verify1.len(), 32, "ADR-006: master.verify must be 32 bytes");

    // Second call must not regenerate master.salt (created exactly once per storage volume).
    let r2 = router.handle(&RpcRequest::new(
        "master:setup",
        serde_json::json!({"master_password": MASTER_PASSWORD}),
    ));
    assert_rpc_ok(&r2);
    assert_eq!(
        r2.result()
            .unwrap()
            .get("created")
            .and_then(|v| v.as_bool()),
        Some(false)
    );

    let salt2 = fs::read(&salt_path).expect("master.salt must exist");
    let verify2 = fs::read(&verify_path).expect("master.verify must exist");
    assert_eq!(
        salt1, salt2,
        "master.salt must be stable across setup calls"
    );
    assert_eq!(
        verify1, verify2,
        "master.verify must be stable across setup calls"
    );
}

#[test]
fn test_master_setup_wrong_password_after_init_is_typed_error() {
    let (mut router, _temp_dir) = create_test_router();

    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "master:setup",
        serde_json::json!({"master_password": MASTER_PASSWORD}),
    )));

    let r = router.handle(&RpcRequest::new(
        "master:setup",
        serde_json::json!({"master_password": "wrong-password"}),
    ));
    assert_rpc_error(&r, "INVALID_MASTER_PASSWORD");
}
