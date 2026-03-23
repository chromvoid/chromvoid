use super::*;

#[test]
fn derive_stretched_salt_is_deterministic() {
    let vault_salt = [1u8; 16];
    let pepper = [2u8; 32];
    assert_eq!(
        derive_stretched_salt(&vault_salt, &pepper),
        derive_stretched_salt(&vault_salt, &pepper)
    );
}

#[test]
fn different_pepper_changes_stretched_salt() {
    let vault_salt = [1u8; 16];
    let pepper1 = [1u8; 32];
    let pepper2 = [2u8; 32];
    assert_ne!(
        derive_stretched_salt(&vault_salt, &pepper1),
        derive_stretched_salt(&vault_salt, &pepper2)
    );
}

#[test]
fn different_vault_salt_changes_stretched_salt() {
    let pepper = [2u8; 32];
    assert_ne!(
        derive_stretched_salt(&[1u8; 16], &pepper),
        derive_stretched_salt(&[2u8; 16], &pepper)
    );
}

#[test]
fn derive_vault_key_v2_changes_with_pepper() {
    let password = "test_password";
    let vault_salt = [1u8; 16];
    let pepper1 = [1u8; 32];
    let pepper2 = [2u8; 32];

    let k1 = derive_vault_key_v2(password, &vault_salt, &pepper1).expect("kdf v2");
    let k2 = derive_vault_key_v2(password, &vault_salt, &pepper2).expect("kdf v2");

    assert_ne!(*k1, *k2);
}
