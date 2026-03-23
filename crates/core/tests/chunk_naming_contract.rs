//! ADR-003 chunk naming contract tests.
//!
//! These tests intentionally encode the ADR-003 naming rules.

use chromvoid_core::crypto::{
    chunk_name, chunk_name_u64, delta_chunk_name, root_index_chunk_name, shard_chunk_name,
};

const KEY_SIZE: usize = 32;

#[test]
fn test_root_index_chunk_name_matches_context() {
    let vault_key = [1u8; KEY_SIZE];

    let expected = chunk_name(&vault_key, b"catalog:root", 0);
    let actual = root_index_chunk_name(&vault_key, 0);
    assert_eq!(actual, expected);
}

#[test]
fn test_shard_chunk_name_matches_context() {
    let vault_key = [1u8; KEY_SIZE];

    let expected = chunk_name(&vault_key, b"shard:.passmanager", 0);
    let actual = shard_chunk_name(&vault_key, ".passmanager", 0);
    assert_eq!(actual, expected);
}

#[test]
fn test_delta_chunk_name_matches_adr_003_context_and_index() {
    let vault_key = [1u8; KEY_SIZE];

    // ADR-003: Delta context is "delta:{name}" and sequence is the index.
    let expected = chunk_name_u64(&vault_key, b"delta:.passmanager", 1);
    let actual = delta_chunk_name(&vault_key, ".passmanager", 1);
    assert_eq!(actual, expected);
}
