use super::*;
use std::collections::HashMap;

fn sample_peer(id: &str) -> PairedPeer {
    PairedPeer {
        peer_id: id.to_string(),
        label: format!("peer-{id}"),
        relay_url: "wss://relay.example.com".to_string(),
        peer_pubkey: vec![1, 2, 3],
        client_pubkey: vec![4, 5, 6],
        client_privkey_hex: "deadbeef".to_string(),
        last_seen: 1000,
        paired_at: 900,
        platform: "network".to_string(),
    }
}

#[test]
fn store_load_empty() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("paired_network_peers.json");
    let store = PairedPeerStore::load(&path);
    assert!(store.list().is_empty());
}

#[test]
fn store_add_save_reload() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("paired_network_peers.json");

    {
        let mut store = PairedPeerStore::load(&path);
        store.upsert(sample_peer("peer-1")).expect("upsert peer");
        store.save().expect("save");
    }

    let raw = std::fs::read_to_string(&path).expect("read encrypted store");
    assert!(raw.contains("ciphertext_b64"));
    assert!(!raw.contains("deadbeef"));

    {
        let store = PairedPeerStore::load(&path);
        assert_eq!(store.list().len(), 1);
        let p = store.get("peer-1").expect("peer present");
        assert_eq!(p.label, "peer-peer-1");
        assert_eq!(p.relay_url, "wss://relay.example.com");
    }
}

#[test]
fn store_is_paired() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("paired_network_peers.json");
    let mut store = PairedPeerStore::load(&path);

    assert!(!store.is_paired("peer-x"));
    store.upsert(sample_peer("peer-x")).expect("upsert peer");
    assert!(store.is_paired("peer-x"));
}

#[test]
fn store_remove() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("paired_network_peers.json");
    let mut store = PairedPeerStore::load(&path);

    store.upsert(sample_peer("peer-del")).expect("upsert peer");
    assert!(store.is_paired("peer-del"));

    let removed = store.remove("peer-del");
    assert!(removed.is_some());
    assert!(!store.is_paired("peer-del"));
    assert!(store.list().is_empty());
}

#[test]
fn store_find_by_id() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("paired_network_peers.json");
    let mut store = PairedPeerStore::load(&path);

    store.upsert(sample_peer("peer-find")).expect("upsert peer");
    assert!(store.find_by_id("peer-find").is_some());
    assert!(store.find_by_id("nonexistent").is_none());
}

#[test]
fn legacy_plaintext_store_migrates_to_encrypted() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("paired_network_peers.json");
    let mut legacy = HashMap::new();
    legacy.insert("peer-legacy".to_string(), sample_peer("peer-legacy"));
    crate::helpers::storage::write_json_pretty_atomic(&path, &legacy).expect("write legacy");

    let store = PairedPeerStore::load(&path);
    let peer = store.get("peer-legacy").expect("legacy peer loaded");
    assert_eq!(peer.client_privkey_hex, "deadbeef");

    let raw = std::fs::read_to_string(&path).expect("read migrated store");
    assert!(raw.contains("ciphertext_b64"));
    assert!(!raw.contains("deadbeef"));

    let backup = std::fs::read_dir(dir.path())
        .expect("read dir")
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .find(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("paired_network_peers.json.bak."))
        })
        .expect("legacy backup");
    let backup_raw = std::fs::read_to_string(backup).expect("read legacy backup");
    assert!(backup_raw.contains("deadbeef"));
}

#[test]
fn store_rejects_peer_id_takeover_with_different_pubkey() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("paired_network_peers.json");
    let mut store = PairedPeerStore::load(&path);
    let original = sample_peer("peer-1");
    store
        .upsert(original.clone())
        .expect("insert original peer");

    let mut attacker = sample_peer("peer-1");
    attacker.peer_pubkey = vec![9, 9, 9];
    let error = store
        .upsert(attacker)
        .expect_err("same peer_id with different pubkey must fail");

    assert!(error.contains("different public key"));
    assert_eq!(
        store.get("peer-1").expect("original kept").peer_pubkey,
        original.peer_pubkey
    );
}

#[test]
fn corrupt_store_fails_closed_and_refuses_mutation() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("paired_network_peers.json");
    std::fs::write(&path, b"{not valid json").expect("write corrupt store");

    let mut store = PairedPeerStore::load(&path);
    assert!(store.load_error().is_some());
    assert!(store.list().is_empty());

    let error = store
        .upsert(sample_peer("peer-1"))
        .expect_err("corrupt store must reject mutation");
    assert!(error.contains("refusing to mutate trust store"));
    assert!(store.save().is_err());
    assert_eq!(
        std::fs::read(&path).expect("read original corrupt file"),
        b"{not valid json"
    );
}
