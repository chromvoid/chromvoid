use super::*;

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
        store.upsert(sample_peer("peer-1"));
        store.save().expect("save");
    }

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
    store.upsert(sample_peer("peer-x"));
    assert!(store.is_paired("peer-x"));
}

#[test]
fn store_remove() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("paired_network_peers.json");
    let mut store = PairedPeerStore::load(&path);

    store.upsert(sample_peer("peer-del"));
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

    store.upsert(sample_peer("peer-find"));
    assert!(store.find_by_id("peer-find").is_some());
    assert!(store.find_by_id("nonexistent").is_none());
}
