use super::*;

#[test]
fn test_system_shard_passmanager() {
    assert!(is_system_shard_id(".passmanager"));
}

#[test]
fn test_system_shard_wallet() {
    assert!(is_system_shard_id(".wallet"));
}

#[test]
fn test_non_system_shard_docs() {
    assert!(!is_system_shard_id("documents"));
}

#[test]
fn test_non_system_shard_empty() {
    assert!(!is_system_shard_id(""));
}

#[test]
fn test_non_system_shard_without_leading_dot() {
    assert!(!is_system_shard_id("passmanager"));
}

#[test]
fn test_non_system_shard_superset_names() {
    assert!(!is_system_shard_id(".passmanager2"));
    assert!(!is_system_shard_id(".wallets"));
}

#[test]
fn test_shard_id_from_path_passmanager_root() {
    assert_eq!(
        shard_id_from_path("/.passmanager"),
        Some(".passmanager".to_string())
    );
}

#[test]
fn test_shard_id_from_path_nested() {
    assert_eq!(
        shard_id_from_path("/.passmanager/group/entry"),
        Some(".passmanager".to_string())
    );
}

#[test]
fn test_shard_id_from_path_double_slashes() {
    assert_eq!(
        shard_id_from_path("//.passmanager//x"),
        Some(".passmanager".to_string())
    );
}

#[test]
fn test_shard_id_from_path_wallet() {
    assert_eq!(shard_id_from_path("/.wallet"), Some(".wallet".to_string()));
}

#[test]
fn test_shard_id_from_path_root_returns_none() {
    assert_eq!(shard_id_from_path("/"), None);
}

#[test]
fn test_shard_id_from_path_empty_returns_none() {
    assert_eq!(shard_id_from_path(""), None);
}

#[test]
fn test_shard_id_from_path_user_shard() {
    assert_eq!(shard_id_from_path("/docs"), Some("docs".to_string()));
}

#[test]
fn test_is_system_path_passmanager_root() {
    assert!(is_system_path("/.passmanager"));
}

#[test]
fn test_is_system_path_passmanager_nested() {
    assert!(is_system_path("/.passmanager/group/entry"));
}

#[test]
fn test_is_system_path_double_slashes() {
    assert!(is_system_path("//.passmanager//x"));
}

#[test]
fn test_is_system_path_wallet() {
    assert!(is_system_path("/.wallet"));
}

#[test]
fn test_non_system_path_docs() {
    assert!(!is_system_path("/docs"));
}

#[test]
fn test_non_system_path_root() {
    assert!(!is_system_path("/"));
}

#[test]
fn test_non_system_path_empty() {
    assert!(!is_system_path(""));
}

#[test]
fn test_is_system_path_without_leading_slash() {
    assert!(is_system_path(".passmanager"));
}

#[test]
fn test_non_system_path_dot_prefix_not_in_list() {
    assert!(!is_system_path("/.notes"));
}
