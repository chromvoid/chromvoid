//! ADR-002: AAD MUST bind ciphertext to chunk identity.
//!
//! The encrypted bytes for chunk `name_a` must NOT be decryptable as chunk `name_b`.

use chromvoid_core::storage::{EncryptedChunk, Storage};
use tempfile::TempDir;

#[test]
fn test_chunk_name_is_authenticated_via_aad() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let storage = Storage::new(temp_dir.path()).expect("failed to create storage");

    let key = [7u8; 32];
    let plaintext = b"sensitive payload";

    // Two distinct valid 64-hex chunk names.
    let name_a = "01".repeat(32);
    let name_b = "02".repeat(32);

    let chunk_a = EncryptedChunk::from_plaintext(name_a.clone(), plaintext, &key)
        .expect("encryption should succeed");
    storage
        .write_chunk(&name_a, &chunk_a.data)
        .expect("write chunk_a");

    // Attacker-controlled swap: write bytes of chunk_a under a different name.
    storage
        .write_chunk(&name_b, &chunk_a.data)
        .expect("write swapped chunk");

    // Sanity: decrypting as the original name must work.
    let read_a = storage.read_chunk(&name_a).expect("read chunk_a");
    let roundtrip_a = EncryptedChunk {
        name: name_a.clone(),
        data: read_a,
    }
    .decrypt(&key)
    .expect("decrypt chunk_a");
    assert_eq!(roundtrip_a, plaintext);

    // ADR-002 requirement: decrypting swapped bytes under a different name MUST fail.
    let read_b = storage.read_chunk(&name_b).expect("read swapped chunk");
    let swapped = EncryptedChunk {
        name: name_b,
        data: read_b,
    }
    .decrypt(&key);

    assert!(
        swapped.is_err(),
        "expected AAD binding to chunk name: decrypt should fail after name swap"
    );
}
