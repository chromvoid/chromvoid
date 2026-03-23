use super::*;
use std::sync::Once;

static INIT: Once = Once::new();

fn init_mock_keyring() {
    INIT.call_once(|| {
        keyring::set_default_credential_builder(keyring::mock::default_credential_builder());
    });
}

#[test]
fn keyring_keystore_roundtrip_store_load_delete() {
    init_mock_keyring();

    let ks = KeyringKeystore::new("chromvoid-test", "pepper").unwrap();
    assert_eq!(ks.load_storage_pepper().unwrap(), None);

    let p = [7u8; STORAGE_PEPPER_LEN];
    ks.store_storage_pepper(p).unwrap();
    assert_eq!(ks.load_storage_pepper().unwrap(), Some(p));

    ks.delete_storage_pepper().unwrap();
    assert_eq!(ks.load_storage_pepper().unwrap(), None);
}

#[test]
fn keyring_keystore_corrupted_len_is_typed_error() {
    init_mock_keyring();

    let ks = KeyringKeystore::new("chromvoid-test", "pepper-corrupt").unwrap();

    ks.entry.set_secret(&[1u8; 31]).unwrap();

    let err = ks
        .load_storage_pepper()
        .expect_err("must reject invalid length");
    assert!(matches!(err, KeystoreError::Corrupted));
}
