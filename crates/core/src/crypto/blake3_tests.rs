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
