use super::*;

#[test]
fn in_memory_roundtrip() {
    let ks = InMemoryKeystore::new();
    assert_eq!(ks.load_storage_pepper().unwrap(), None);
    let p = [42u8; STORAGE_PEPPER_LEN];
    ks.store_storage_pepper(p).unwrap();
    assert_eq!(ks.load_storage_pepper().unwrap(), Some(p));
    ks.delete_storage_pepper().unwrap();
    assert_eq!(ks.load_storage_pepper().unwrap(), None);
}

#[test]
fn in_memory_overwrite() {
    let ks = InMemoryKeystore::new();
    let p1 = [1u8; STORAGE_PEPPER_LEN];
    let p2 = [2u8; STORAGE_PEPPER_LEN];
    ks.store_storage_pepper(p1).unwrap();
    ks.store_storage_pepper(p2).unwrap();
    assert_eq!(ks.load_storage_pepper().unwrap(), Some(p2));
}

#[test]
fn in_memory_delete_when_empty() {
    let ks = InMemoryKeystore::new();
    ks.delete_storage_pepper().unwrap();
    assert_eq!(ks.load_storage_pepper().unwrap(), None);
}
