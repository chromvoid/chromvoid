use super::*;

#[test]
fn test_encrypted_chunk_roundtrip() {
    let key = [42u8; KEY_SIZE];
    let name = "01a2b3c4d5e6f7890123456789abcdef01a2b3c4d5e6f7890123456789abcdef".to_string();
    let plaintext = b"Hello, KeepPrivy!";

    let chunk = EncryptedChunk::from_plaintext(name.clone(), plaintext, &key)
        .expect("encryption should succeed");

    assert_eq!(chunk.name, name);

    let decrypted = chunk.decrypt(&key).expect("decryption should succeed");
    assert_eq!(decrypted, plaintext);
}

#[test]
fn test_path_components() {
    let chunk = EncryptedChunk {
        name: "01a2b3c4d5e6f7890123456789abcdef01a2b3c4d5e6f7890123456789abcdef".to_string(),
        data: vec![],
    };

    let (first, next_two, full) = chunk
        .path_components()
        .expect("should have path components");

    assert_eq!(first, "0");
    assert_eq!(next_two, "1a");
    assert_eq!(full, chunk.name);
}

#[test]
fn test_path_components_short_name() {
    let chunk = EncryptedChunk {
        name: "ab".to_string(),
        data: vec![],
    };

    assert!(chunk.path_components().is_none());
}
