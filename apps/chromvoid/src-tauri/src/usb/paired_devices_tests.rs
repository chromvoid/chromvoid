use super::*;

fn sample_device(serial: &str) -> PairedDevice {
    PairedDevice {
        serial_number: serial.to_string(),
        device_pubkey: vec![1, 2, 3],
        client_pubkey: vec![4, 5, 6],
        client_privkey_hex: "deadbeef".to_string(),
        label: format!("device-{serial}"),
        last_seen: 1000,
        paired_at: 900,
    }
}

#[test]
fn store_load_empty() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("paired.json");
    let store = PairedDeviceStore::load(&path);
    assert!(store.list().is_empty());
}

#[test]
fn store_add_save_reload() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("paired.json");

    {
        let mut store = PairedDeviceStore::load(&path);
        store.upsert(sample_device("ABC123"));
        store.save().expect("save");
    }

    {
        let store = PairedDeviceStore::load(&path);
        assert_eq!(store.list().len(), 1);
        let dev = store.get("ABC123").expect("device present");
        assert_eq!(dev.label, "device-ABC123");
        assert_eq!(dev.device_pubkey, vec![1, 2, 3]);
        assert_eq!(dev.client_privkey_hex, "deadbeef");
    }
}

#[test]
fn store_is_paired() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("paired.json");
    let mut store = PairedDeviceStore::load(&path);

    assert!(!store.is_paired("XYZ789"));
    store.upsert(sample_device("XYZ789"));
    assert!(store.is_paired("XYZ789"));
}

#[test]
fn store_remove() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("paired.json");
    let mut store = PairedDeviceStore::load(&path);

    store.upsert(sample_device("DEL001"));
    assert!(store.is_paired("DEL001"));

    let removed = store.remove("DEL001");
    assert!(removed.is_some());
    assert!(!store.is_paired("DEL001"));
    assert!(store.list().is_empty());
}
