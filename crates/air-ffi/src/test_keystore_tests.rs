use chromvoid_client_runtime::LocalCoreAdapter;
use chromvoid_core::rpc::types::RpcRequest;
use serde_json::json;
use std::process::Command;

#[test]
fn test_keystore_keeps_master_authentication_consistent_across_fixture_opt_in() {
    const PHASE: &str = "CHROMVOID_AIR_TEST_KEYSTORE_PHASE";
    const ROOT: &str = "CHROMVOID_AIR_TEST_KEYSTORE_ROOT";
    const FAST_KDF: &str = "CHROMVOID_TEST_FAST_KDF";

    if let Ok(phase) = std::env::var(PHASE) {
        let root = std::env::var_os(ROOT).unwrap();
        let mut adapter = LocalCoreAdapter::new_with_test_keystore(root.into()).unwrap();
        let response = adapter.handle(&RpcRequest::new(
            "master:setup",
            json!({"master_password":"synthetic KDF regression password"}),
        ));
        assert!(response.is_ok(), "{phase}: {response:?}");
        assert_eq!(response.result().unwrap()["created"], phase == "create");
        return;
    }

    // Isolate the dependency's test-support build from the parallel suite's KDF opt-in.
    // A master created before that opt-in must still authenticate afterwards.
    let root = tempfile::tempdir().unwrap();
    for phase in ["create", "verify"] {
        let mut command = Command::new(std::env::current_exe().unwrap());
        command
            .args([
                "--exact",
                "test_keystore_tests::test_keystore_keeps_master_authentication_consistent_across_fixture_opt_in",
                "--test-threads=1",
                "--nocapture",
            ])
            .env(PHASE, phase)
            .env(ROOT, root.path());
        if phase == "create" {
            command.env_remove(FAST_KDF);
        } else {
            command.env(FAST_KDF, "1");
        }
        let output = command.output().unwrap();
        assert!(
            output.status.success(),
            "{phase} failed: {}\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr),
        );
    }
}
