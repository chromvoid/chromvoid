use super::*;

#[test]
fn test_encrypt_decrypt_roundtrip() {
    let key = [42u8; KEY_SIZE];
    let plaintext = b"Hello, ChromVoid!";

    let encrypted = encrypt(plaintext, &key, b"").expect("encryption should succeed");
    let decrypted = decrypt(&encrypted, &key, b"").expect("decryption should succeed");

    assert_eq!(decrypted, plaintext);
}

#[test]
fn test_encrypt_adds_overhead() {
    let key = [42u8; KEY_SIZE];
    let plaintext = b"Hello, ChromVoid!";

    let encrypted = encrypt(plaintext, &key, b"").expect("encryption should succeed");

    assert_eq!(encrypted.len(), plaintext.len() + NONCE_SIZE + TAG_SIZE);
}

#[test]
fn test_decrypt_wrong_key_fails() {
    let key1 = [42u8; KEY_SIZE];
    let key2 = [43u8; KEY_SIZE];
    let plaintext = b"Hello, ChromVoid!";

    let encrypted = encrypt(plaintext, &key1, b"").expect("encryption should succeed");
    let result = decrypt(&encrypted, &key2, b"");

    assert!(result.is_err());
    assert!(matches!(result, Err(Error::DecryptionFailed(_))));
}

#[test]
fn test_decrypt_tampered_data_fails() {
    let key = [42u8; KEY_SIZE];
    let plaintext = b"Hello, ChromVoid!";

    let mut encrypted = encrypt(plaintext, &key, b"").expect("encryption should succeed");

    if let Some(byte) = encrypted.get_mut(NONCE_SIZE + 5) {
        *byte ^= 0xFF;
    }

    let result = decrypt(&encrypted, &key, b"");
    assert!(result.is_err());
}

#[test]
fn test_decrypt_too_short_fails() {
    let key = [42u8; KEY_SIZE];
    let short_data = [0u8; 20];

    let result = decrypt(&short_data, &key, b"");
    assert!(result.is_err());
    assert!(matches!(result, Err(Error::InvalidDataFormat(_))));
}

#[test]
fn test_encrypt_empty_data() {
    let key = [42u8; KEY_SIZE];
    let plaintext = b"";

    let encrypted = encrypt(plaintext, &key, b"").expect("encryption should succeed");
    let decrypted = decrypt(&encrypted, &key, b"").expect("decryption should succeed");

    assert_eq!(decrypted, plaintext);
}

#[test]
fn test_encrypt_produces_different_output() {
    let key = [42u8; KEY_SIZE];
    let plaintext = b"Hello, ChromVoid!";

    let encrypted1 = encrypt(plaintext, &key, b"").expect("encryption should succeed");
    let encrypted2 = encrypt(plaintext, &key, b"").expect("encryption should succeed");

    assert_ne!(encrypted1, encrypted2);

    let decrypted1 = decrypt(&encrypted1, &key, b"").expect("decryption should succeed");
    let decrypted2 = decrypt(&encrypted2, &key, b"").expect("decryption should succeed");

    assert_eq!(decrypted1, decrypted2);
    assert_eq!(decrypted1, plaintext);
}
