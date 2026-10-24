use base64::{engine::general_purpose::STANDARD, Engine as _};
use chromvoid_core::crypto::keystore::{InMemoryKeystore, Keystore};
use chromvoid_network_runtime::{paired_peers::*, paired_store_crypto::load_storage_key};
use serde_json::{json, Value};
use std::{fs, path::Path, sync::Arc};

fn peer(id: &str) -> PairedPeer {
    PairedPeer {
        peer_id: id.into(),
        label: "Synthetic desktop".into(),
        relay_url: "wss://relay.test".into(),
        peer_pubkey: vec![7; 32],
        client_pubkey: vec![8; 32],
        client_privkey_hex: "ab".repeat(32),
        last_seen: 100,
        paired_at: 90,
        platform: "desktop".into(),
    }
}

fn provider(keystore: Arc<InMemoryKeystore>) -> PeerStoreKeyProvider {
    Arc::new(move |_| load_storage_key(keystore.as_ref()))
}

fn keystore() -> Arc<InMemoryKeystore> {
    let store = Arc::new(InMemoryKeystore::new());
    store.store_storage_pepper([42; 32]).unwrap();
    store
}

fn files(root: &Path) -> Vec<std::ffi::OsString> {
    let mut files: Vec<_> = fs::read_dir(root)
        .unwrap()
        .map(|entry| entry.unwrap().file_name())
        .collect();
    files.sort();
    files
}

#[test]
fn encrypted_file_is_compatible_with_existing_envelope_and_pubkey_index() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("paired_network_peers.json");
    let key = provider(keystore());
    let mut store = PairedPeerStore::load(&path, key.clone());
    store.upsert(peer("desktop-1")).unwrap();
    store.save().unwrap();
    let raw = fs::read(&path).unwrap();
    assert!(!String::from_utf8_lossy(&raw).contains(&"ab".repeat(32)));
    let wrapper: Value = serde_json::from_slice(&raw).unwrap();
    assert_eq!(wrapper["kind"], "chromvoid.paired_store");
    assert_eq!(wrapper["version"], 1);
    let ciphertext = STANDARD
        .decode(wrapper["ciphertext_b64"].as_str().unwrap())
        .unwrap();
    let plaintext =
        chromvoid_core::crypto::decrypt(&ciphertext, &[42; 32], b"chromvoid:paired-store:v1")
            .unwrap();
    let document: Value = serde_json::from_slice(&plaintext).unwrap();
    assert_eq!(document[hex::encode([7; 32])]["peer_id"], "desktop-1");
    assert_eq!(
        document[hex::encode([7; 32])]["client_privkey_hex"],
        "ab".repeat(32)
    );
    let mut loaded = PairedPeerStore::load(&path, key.clone());
    assert_eq!(loaded.get("desktop-1").unwrap().peer_pubkey, vec![7; 32]);
    let mut takeover = peer("desktop-1");
    takeover.peer_pubkey = vec![9; 32];
    assert!(loaded
        .upsert(takeover)
        .unwrap_err()
        .contains("different public key"));
    assert_eq!(loaded.get("desktop-1").unwrap().peer_pubkey, vec![7; 32]);
    loaded.remove("desktop-1").unwrap();
    loaded.save().unwrap();
    assert!(PairedPeerStore::load(&path, key).list().is_empty());
}

#[test]
fn unavailable_key_at_save_cannot_overwrite_or_backup_the_existing_store() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("peers.json");
    let keystore = keystore();
    let mut store = PairedPeerStore::load(&path, provider(keystore.clone()));
    store.upsert(peer("desktop-1")).unwrap();
    store.save().unwrap();
    let before = fs::read(&path).unwrap();
    let before_files = files(dir.path());
    keystore.delete_storage_pepper().unwrap();
    store.remove("desktop-1");
    assert_eq!(
        store.save().unwrap_err(),
        "paired store key unavailable: storage pepper is missing"
    );
    assert_eq!(fs::read(&path).unwrap(), before);
    assert_eq!(files(dir.path()), before_files);
    assert!(keystore.load_storage_pepper().unwrap().is_none());
    let unavailable = PairedPeerStore::load(&path, provider(keystore));
    assert!(unavailable.load_error().is_some() && unavailable.list().is_empty());
    assert!(unavailable.save().is_err());
}

#[test]
fn wrong_key_and_corrupt_input_fail_closed_without_losing_existing_records() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("peers.json");
    let keystore = keystore();
    let mut store = PairedPeerStore::load(&path, provider(keystore.clone()));
    store.upsert(peer("desktop-1")).unwrap();
    store.save().unwrap();
    let before = fs::read(&path).unwrap();
    keystore.store_storage_pepper([24; 32]).unwrap();
    let mut unavailable = PairedPeerStore::load(&path, provider(keystore.clone()));
    assert!(unavailable.load_error().is_some());
    assert!(unavailable.upsert(peer("desktop-2")).is_err());
    assert!(unavailable.save().is_err());
    assert_eq!(fs::read(&path).unwrap(), before);
    fs::write(&path, b"{corrupt").unwrap();
    let mut corrupt = PairedPeerStore::load(&path, provider(keystore));
    assert!(corrupt.load_error().is_some());
    assert!(corrupt.upsert(peer("desktop-2")).is_err());
    assert!(corrupt.save().is_err());
    assert_eq!(fs::read(&path).unwrap(), b"{corrupt");
}

#[test]
fn legacy_plaintext_records_keep_existing_backup_and_migration_behavior() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("peers.json");
    let legacy = json!({"desktop-1": {
        "peer_id": "desktop-1", "label": "Old desktop", "relay_url": "wss://relay.test",
        "peer_pubkey": [1,2,3], "client_pubkey": [4,5,6], "client_privkey_hex": "deadbeef",
        "last_seen": 5, "paired_at": 3
    }});
    let bytes = serde_json::to_vec(&legacy).unwrap();
    fs::write(&path, &bytes).unwrap();
    let store = PairedPeerStore::load(&path, provider(keystore()));
    assert_eq!(store.get("desktop-1").unwrap().platform, "network");
    assert_eq!(
        store.get("desktop-1").unwrap().client_privkey_hex,
        "deadbeef"
    );
    let encoded: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    assert_eq!(encoded["version"], 1);
    let backup = files(dir.path())
        .into_iter()
        .find(|name| name.to_string_lossy().starts_with("peers.json.bak."))
        .unwrap();
    assert_eq!(fs::read(dir.path().join(backup)).unwrap(), bytes);
}
