use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    ChaCha20Poly1305, Nonce,
};
use chromvoid_core::crypto::{decrypt, encrypt};
use chromvoid_core::{KEY_SIZE, NONCE_SIZE, TAG_SIZE};

#[test]
fn test_decrypt_accepts_nonce_ciphertext_tag_layout() {
    let key = [7u8; KEY_SIZE];
    let nonce_bytes = [1u8; NONCE_SIZE];
    let aad = b"chunk-name-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let plaintext = b"layout-vector-plaintext";

    let cipher = ChaCha20Poly1305::new((&key).into());
    let nonce = Nonce::from_slice(&nonce_bytes);

    // chacha20poly1305::encrypt returns ciphertext || tag
    let ciphertext = cipher
        .encrypt(
            nonce,
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .expect("encrypt");

    let mut encoded = Vec::with_capacity(NONCE_SIZE + ciphertext.len());
    encoded.extend_from_slice(&nonce_bytes);
    encoded.extend_from_slice(&ciphertext);

    let out = decrypt(&encoded, &key, aad).expect("decrypt");
    assert_eq!(out, plaintext);
}

#[test]
fn test_encrypt_output_is_compatible_with_chacha20poly1305() {
    let key = [9u8; KEY_SIZE];
    let aad = b"chunk-name-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    let plaintext = b"compat-plaintext";

    let encoded = encrypt(plaintext, &key, aad).expect("encrypt");
    assert_eq!(
        encoded.len(),
        plaintext.len() + NONCE_SIZE + TAG_SIZE,
        "expected nonce||ciphertext||tag layout"
    );

    let nonce_bytes: [u8; NONCE_SIZE] = encoded[..NONCE_SIZE].try_into().expect("nonce bytes");
    let ciphertext = &encoded[NONCE_SIZE..];

    let cipher = ChaCha20Poly1305::new((&key).into());
    let nonce = Nonce::from_slice(&nonce_bytes);

    let out = cipher
        .decrypt(
            nonce,
            Payload {
                msg: ciphertext,
                aad,
            },
        )
        .expect("decrypt");
    assert_eq!(out, plaintext);

    // AAD binding: same bytes must not decrypt under a different AAD.
    let wrong = cipher.decrypt(
        nonce,
        Payload {
            msg: ciphertext,
            aad: b"wrong-aad",
        },
    );
    assert!(wrong.is_err());
}
