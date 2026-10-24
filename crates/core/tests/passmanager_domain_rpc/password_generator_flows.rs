use crate::test_helpers::{assert_rpc_error, assert_rpc_ok, create_test_router, unlock_vault};
use chromvoid_core::rpc::types::RpcRequest;
use serde_json::json;

#[test]
fn generated_passwords_respect_selected_sets_and_leave_the_vault_unchanged() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic-generator"));
    let catalog = RpcRequest::new("passmanager:entry:list", json!({}));
    let before = router.handle(&catalog);
    assert_rpc_ok(&before);
    // Every nonempty set selection, minimum length and the upper boundary.
    for mask in 1..16 {
        for length in [4, 16, 128] {
            let request = RpcRequest::new(
                "passmanager:password:generate",
                json!({
                    "length":length, "lowercase":mask & 1 != 0, "uppercase":mask & 2 != 0,
                    "digits":mask & 4 != 0, "symbols":mask & 8 != 0
                }),
            );
            let response = router.handle(&request);
            assert_rpc_ok(&response);
            let password = response.result().unwrap()["password"].as_str().unwrap();
            assert_eq!(password.len(), length);
            for (bit, predicate) in [
                (1, u8::is_ascii_lowercase as fn(&u8) -> bool),
                (2, u8::is_ascii_uppercase),
                (4, u8::is_ascii_digit),
                (8, u8::is_ascii_punctuation),
            ] {
                assert_eq!(password.as_bytes().iter().any(predicate), mask & bit != 0);
            }
            assert!(password.bytes().all(|b| b.is_ascii_graphic()));
        }
    }
    let after = router.handle(&catalog);
    assert_rpc_ok(&after);
    assert_eq!(after.result(), before.result());
}

#[test]
fn generator_rejects_locked_and_invalid_requests() {
    let (mut router, _tmp) = create_test_router();
    let valid =
        json!({"length":16,"lowercase":true,"uppercase":true,"digits":true,"symbols":false});
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:password:generate",
            valid.clone(),
        )),
        "VAULT_REQUIRED",
    );
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic-generator"));
    for length in [
        json!(0),
        json!(3),
        json!(129),
        json!(-1),
        json!(4.5),
        json!(65536),
    ] {
        let mut payload = valid.clone();
        payload["length"] = length;
        assert_rpc_error(
            &router.handle(&RpcRequest::new("passmanager:password:generate", payload)),
            "EMPTY_PAYLOAD",
        );
    }
    for payload in [
        json!({"length":16,"lowercase":false,"uppercase":false,"digits":false,"symbols":false}),
        json!({"length":16}),
        json!({"length":16,"lowercase":true,"uppercase":true,"digits":true,"symbols":false,"password":"must-not-be-accepted"}),
    ] {
        assert_rpc_error(
            &router.handle(&RpcRequest::new("passmanager:password:generate", payload)),
            "EMPTY_PAYLOAD",
        );
    }
}
