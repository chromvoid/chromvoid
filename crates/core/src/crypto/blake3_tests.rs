use super::*;

#[test]
fn test_hash_basic() {
    let data = b"Hello, ChromVoid!";
    let hash_result = hash(data);

    assert_eq!(hash_result.len(), 32);
    assert!(hash_result.iter().any(|&b| b != 0));
}

#[test]
fn test_hash_deterministic() {
    let data = b"Hello, ChromVoid!";

    let hash1 = hash(data);
    let hash2 = hash(data);

    assert_eq!(hash1, hash2);
}

#[test]
fn test_hash_different_inputs() {
    let hash1 = hash(b"Hello");
    let hash2 = hash(b"World");

    assert_ne!(hash1, hash2);
}

#[test]
fn test_chunk_name_format() {
    let vault_key = [1u8; KEY_SIZE];
    let name = chunk_name(&vault_key, b"catalog", 0);

    assert_eq!(name.len(), 64);
    assert!(name.chars().all(|c| c.is_ascii_hexdigit()));
}

#[test]
fn test_chunk_name_deterministic() {
    let vault_key = [1u8; KEY_SIZE];

    let name1 = chunk_name(&vault_key, b"catalog", 0);
    let name2 = chunk_name(&vault_key, b"catalog", 0);

    assert_eq!(name1, name2);
}

#[test]
fn test_chunk_name_different_keys() {
    let key1 = [1u8; KEY_SIZE];
    let key2 = [2u8; KEY_SIZE];

    let name1 = chunk_name(&key1, b"catalog", 0);
    let name2 = chunk_name(&key2, b"catalog", 0);

    assert_ne!(name1, name2);
}

#[test]
fn test_chunk_name_different_contexts() {
    let vault_key = [1u8; KEY_SIZE];

    let name1 = chunk_name(&vault_key, b"catalog", 0);
    let name2 = chunk_name(&vault_key, b"file", 0);

    assert_ne!(name1, name2);
}

#[test]
fn test_chunk_name_different_indices() {
    let vault_key = [1u8; KEY_SIZE];

    let name1 = chunk_name(&vault_key, b"catalog", 0);
    let name2 = chunk_name(&vault_key, b"catalog", 1);

    assert_ne!(name1, name2);
}

#[test]
fn test_catalog_chunk_name() {
    let vault_key = [1u8; KEY_SIZE];

    let name = catalog_chunk_name(&vault_key, 0);

    assert_eq!(name.len(), 64);
    assert!(name.chars().all(|c| c.is_ascii_hexdigit()));
}

#[test]
fn test_shard_snapshot_zero_uses_legacy_chunk_name() {
    let vault_key = [1u8; KEY_SIZE];

    assert_eq!(
        shard_snapshot_chunk_name(&vault_key, "docs", 0),
        shard_chunk_name(&vault_key, "docs", 0)
    );
    assert_ne!(
        shard_snapshot_chunk_name(&vault_key, "docs", 1),
        shard_chunk_name(&vault_key, "docs", 0)
    );
}

#[test]
fn test_catalog_commit_chunk_name_is_isolated() {
    let vault_key = [1u8; KEY_SIZE];

    assert_ne!(
        catalog_commit_chunk_name(&vault_key),
        catalog_chunk_name(&vault_key, 0)
    );
    assert_ne!(
        catalog_commit_chunk_name(&vault_key),
        root_index_chunk_name(&vault_key, 0)
    );
}

#[test]
fn test_derivative_chunk_name_is_deterministic_and_isolated() {
    let vault_key = [7u8; KEY_SIZE];

    let first = derivative_chunk_name(&vault_key, 42, 100, "preview", 1, 0);
    let second = derivative_chunk_name(&vault_key, 42, 100, "preview", 1, 0);
    let changed_tier = derivative_chunk_name(&vault_key, 42, 100, "thumbnail", 1, 0);
    let meta = derivative_meta_chunk_name(&vault_key, 42, 100, "preview", 1);
    let index = derivative_index_chunk_name(&vault_key);

    assert_eq!(first, second);
    assert_ne!(first, changed_tier);
    assert_ne!(first, meta);
    assert_ne!(first, index);
    assert_ne!(meta, index);
}
