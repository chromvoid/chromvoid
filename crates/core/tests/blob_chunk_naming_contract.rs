//! ADR-003 blob chunk naming contract tests.
//!
//! ADR-003: File chunks use context "blob" and a 64-bit chunk_idx.

use chromvoid_core::crypto::{blob_chunk_idx, blob_chunk_name, chunk_name_u64};

const KEY_SIZE: usize = 32;

#[test]
fn test_blob_chunk_name_matches_context_and_index() {
    let vault_key = [1u8; KEY_SIZE];
    let node_id: u32 = 42;
    let part_index: u32 = 3;

    let chunk_idx = blob_chunk_idx(node_id, part_index);
    let expected = chunk_name_u64(&vault_key, b"blob", chunk_idx);
    let actual = blob_chunk_name(&vault_key, node_id, part_index);
    assert_eq!(actual, expected);
}

#[test]
fn test_blob_chunk_name_changes_with_node_id_or_part_index() {
    let vault_key = [1u8; KEY_SIZE];

    let a = blob_chunk_name(&vault_key, 1, 0);
    let b = blob_chunk_name(&vault_key, 2, 0);
    let c = blob_chunk_name(&vault_key, 1, 1);

    assert_ne!(a, b);
    assert_ne!(a, c);
}
