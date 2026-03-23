use super::*;

#[test]
fn test_argon2_derivation() {
    let password = "test_password";
    let salt = [1u8; 16];

    let key = derive_vault_key(password, &salt).expect("derivation should succeed");

    assert_eq!(key.len(), 32);
    assert!(key.iter().any(|&b| b != 0));
}

#[test]
fn test_argon2_deterministic() {
    let password = "test_password";
    let salt = [1u8; 16];

    let key1 = derive_vault_key(password, &salt).expect("derivation should succeed");
    let key2 = derive_vault_key(password, &salt).expect("derivation should succeed");

    assert_eq!(*key1, *key2);
}

#[test]
fn test_argon2_different_passwords() {
    let salt = [1u8; 16];

    let key1 = derive_vault_key("password1", &salt).expect("derivation should succeed");
    let key2 = derive_vault_key("password2", &salt).expect("derivation should succeed");

    assert_ne!(*key1, *key2);
}

#[test]
fn test_argon2_different_salts() {
    let password = "test_password";

    let key1 = derive_vault_key(password, &[1u8; 16]).expect("derivation should succeed");
    let key2 = derive_vault_key(password, &[2u8; 16]).expect("derivation should succeed");

    assert_ne!(*key1, *key2);
}

#[test]
fn test_argon2_works_with_32_byte_salt() {
    let password = "test_password";
    let salt32 = [9u8; 32];
    let key = derive_vault_key_with_salt(password, &salt32).expect("derivation should succeed");
    assert_eq!(key.len(), 32);
    assert!(key.iter().any(|&b| b != 0));
}
