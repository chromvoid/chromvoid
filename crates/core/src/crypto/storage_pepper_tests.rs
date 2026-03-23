use super::*;

#[test]
fn test_wrap_unwrap_roundtrip() {
    let pepper = [7u8; STORAGE_PEPPER_LEN];
    let backup_key = [3u8; 32];

    let wrapped = StoragePepper::wrap_for_backup(pepper, &backup_key).expect("wrap");
    assert_eq!(wrapped.len(), 12 + STORAGE_PEPPER_LEN + 16);

    let unwrapped = StoragePepper::unwrap_from_backup(&wrapped, &backup_key).expect("unwrap");
    assert_eq!(unwrapped, pepper);
}

#[test]
fn test_unwrap_rejects_wrong_key() {
    let pepper = [7u8; STORAGE_PEPPER_LEN];
    let backup_key = [3u8; 32];
    let wrong_key = [4u8; 32];

    let wrapped = StoragePepper::wrap_for_backup(pepper, &backup_key).expect("wrap");
    let err = StoragePepper::unwrap_from_backup(&wrapped, &wrong_key).unwrap_err();
    match err {
        StoragePepperError::UnwrapFailed => {}
        _ => panic!("unexpected error: {err:?}"),
    }
}
