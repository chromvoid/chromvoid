//! Tests for Plausible Deniability feature
//!
//! Key properties:
//! - Any password "works" - it opens a corresponding vault
//! - Wrong password shows empty vault, not an error
//! - Different passwords access different vaults
//! - Cannot determine if a vault exists

mod test_helpers;

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::rpc::RpcRouter;
use chromvoid_core::storage::Storage;
use std::path::Path;
use std::sync::Arc;
use tempfile::TempDir;
use test_helpers::*;

fn router_for_path(storage_path: &Path, keystore: Arc<InMemoryKeystore>) -> RpcRouter {
    let storage = Storage::new(storage_path).expect("storage");
    RpcRouter::new(storage).with_keystore(keystore)
}

#[test]
fn test_different_passwords_create_different_vaults() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let storage_path = temp_dir.path();
    let keystore = Arc::new(InMemoryKeystore::new());

    {
        let mut router = router_for_path(storage_path, keystore.clone());

        unlock_vault(&mut router, "password1");
        create_dir(&mut router, "vault1_data");
        lock_vault(&mut router);
    }

    {
        let mut router = router_for_path(storage_path, keystore.clone());

        unlock_vault(&mut router, "password2");
        create_dir(&mut router, "vault2_data");
        lock_vault(&mut router);
    }

    {
        let mut router = router_for_path(storage_path, keystore.clone());

        unlock_vault(&mut router, "password1");
        let items = get_items(&list_dir(&mut router, "/"));
        let names = get_item_names(&items);

        assert!(names.contains(&"vault1_data".to_string()));
        assert!(!names.contains(&"vault2_data".to_string()));
    }

    {
        let mut router = router_for_path(storage_path, keystore.clone());

        unlock_vault(&mut router, "password2");
        let items = get_items(&list_dir(&mut router, "/"));
        let names = get_item_names(&items);

        assert!(names.contains(&"vault2_data".to_string()));
        assert!(!names.contains(&"vault1_data".to_string()));
    }
}

#[test]
fn test_wrong_password_shows_empty_vault() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let storage_path = temp_dir.path();
    let keystore = Arc::new(InMemoryKeystore::new());

    {
        let mut router = router_for_path(storage_path, keystore.clone());

        unlock_vault(&mut router, "correct_password");
        create_dir(&mut router, "secret_data");
        create_dir(&mut router, "more_secrets");
        lock_vault(&mut router);
    }

    {
        let mut router = router_for_path(storage_path, keystore.clone());

        let response = unlock_vault(&mut router, "wrong_password");
        assert_rpc_ok(&response);

        let items = get_items(&list_dir(&mut router, "/"));
        assert!(items.is_empty(), "wrong password should show empty vault");
    }
}

#[test]
fn test_unlock_never_fails_with_error() {
    let (mut router, _temp_dir) = create_test_router();

    let passwords = vec![
        "password123",
        "",
        "very_long_password_that_exceeds_normal_length_limits_if_there_were_any",
        "пароль",
        "密码",
        "🔐🗝️",
        "pass\0word",
        " ",
        "   leading_trailing   ",
    ];

    for password in passwords {
        let response = unlock_vault(&mut router, password);
        assert_rpc_ok(&response);
        lock_vault(&mut router);
    }
}

#[test]
fn test_vault_data_isolation() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let storage_path = temp_dir.path();
    let keystore = Arc::new(InMemoryKeystore::new());

    let passwords = vec!["alpha", "beta", "gamma"];

    for (i, password) in passwords.iter().enumerate() {
        let mut router = router_for_path(storage_path, keystore.clone());

        unlock_vault(&mut router, password);
        create_dir(&mut router, &format!("data_for_{}", i));
        lock_vault(&mut router);
    }

    for (i, password) in passwords.iter().enumerate() {
        let mut router = router_for_path(storage_path, keystore.clone());

        unlock_vault(&mut router, password);
        let items = get_items(&list_dir(&mut router, "/"));

        assert_eq!(items.len(), 1, "each vault should have exactly 1 item");

        let names = get_item_names(&items);
        assert!(
            names.contains(&format!("data_for_{}", i)),
            "vault {} should contain its own data",
            i
        );
    }
}

#[test]
fn test_unlock_status_does_not_reveal_vault_existence() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let storage_path = temp_dir.path();
    let keystore = Arc::new(InMemoryKeystore::new());

    {
        let mut router = router_for_path(storage_path, keystore.clone());
        unlock_vault(&mut router, "existing_vault");
        create_dir(&mut router, "data");
        lock_vault(&mut router);
    }
    let mut router = router_for_path(storage_path, keystore.clone());

    let response_existing = unlock_vault(&mut router, "existing_vault");
    let result_existing = response_existing.result().unwrap();
    lock_vault(&mut router);

    let response_new = unlock_vault(&mut router, "totally_new_vault");
    let result_new = response_new.result().unwrap();

    assert_eq!(
        result_existing, result_new,
        "response for existing and new vault should be identical"
    );
}

#[test]
fn test_multiple_vault_operations_in_session() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let storage_path = temp_dir.path();
    let keystore = Arc::new(InMemoryKeystore::new());

    {
        let mut router = router_for_path(storage_path, keystore.clone());

        unlock_vault(&mut router, "vault_a");
        create_dir(&mut router, "folder_a");
        lock_vault(&mut router);

        unlock_vault(&mut router, "vault_b");
        create_dir(&mut router, "folder_b");
        lock_vault(&mut router);

        unlock_vault(&mut router, "vault_a");
        let items = get_items(&list_dir(&mut router, "/"));
        assert_eq!(items.len(), 1);
        assert_eq!(get_item_names(&items), vec!["folder_a"]);
    }
}

#[test]
fn test_decoy_vault_scenario() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let storage_path = temp_dir.path();
    let keystore = Arc::new(InMemoryKeystore::new());

    {
        let mut router = router_for_path(storage_path, keystore.clone());

        unlock_vault(&mut router, "real_secret_password");
        create_dir(&mut router, "real_passwords");
        create_dir(&mut router, "real_documents");
        lock_vault(&mut router);
    }

    {
        let mut router = router_for_path(storage_path, keystore.clone());

        unlock_vault(&mut router, "decoy_password");
        create_dir(&mut router, "fake_passwords");
        lock_vault(&mut router);
    }

    {
        let mut router = router_for_path(storage_path, keystore.clone());

        unlock_vault(&mut router, "decoy_password");
        let items = get_items(&list_dir(&mut router, "/"));
        let names = get_item_names(&items);

        assert_eq!(names, vec!["fake_passwords"]);
        assert!(!names.contains(&"real_passwords".to_string()));
        assert!(!names.contains(&"real_documents".to_string()));
    }
}

#[test]
fn test_vault_persistence_after_multiple_accesses() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let storage_path = temp_dir.path();
    let keystore = Arc::new(InMemoryKeystore::new());

    for _ in 0..5 {
        let mut router = router_for_path(storage_path, keystore.clone());

        unlock_vault(&mut router, "persistent_vault");
        let items = get_items(&list_dir(&mut router, "/"));

        if items.is_empty() {
            create_dir(&mut router, "accumulator");
        } else {
            let response = list_dir(&mut router, "/");
            let items = get_items(&response);
            assert_eq!(items.len(), 1);
        }

        lock_vault(&mut router);
    }
}

#[test]
fn test_concurrent_vault_modifications() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let storage_path = temp_dir.path();
    let keystore = Arc::new(InMemoryKeystore::new());

    {
        let mut router = router_for_path(storage_path, keystore.clone());
        unlock_vault(&mut router, "shared_vault");
        create_dir(&mut router, "initial");
        lock_vault(&mut router);
    }

    {
        let mut router = router_for_path(storage_path, keystore.clone());
        unlock_vault(&mut router, "shared_vault");
        create_dir(&mut router, "added_later");
        lock_vault(&mut router);
    }

    {
        let mut router = router_for_path(storage_path, keystore.clone());
        unlock_vault(&mut router, "shared_vault");
        let items = get_items(&list_dir(&mut router, "/"));
        assert_eq!(items.len(), 2);
    }
}
