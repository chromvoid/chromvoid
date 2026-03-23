//! Persistent storage for paired iOS peers on Desktop.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairedIosPeer {
    pub peer_id: String,
    pub peer_label: String,
    pub peer_pubkey_hex: String,
    pub relay_url: String,
    pub last_seen: u64,
    pub paired_at: u64,
    pub platform: String,
}

pub struct PairedIosPeerStore {
    path: PathBuf,
    peers: HashMap<String, PairedIosPeer>,
}

impl PairedIosPeerStore {
    pub fn load(path: &Path) -> Self {
        let peers = if path.exists() {
            match std::fs::read_to_string(path) {
                Ok(contents) => serde_json::from_str::<HashMap<String, PairedIosPeer>>(&contents)
                    .unwrap_or_default(),
                Err(_) => HashMap::new(),
            }
        } else {
            HashMap::new()
        };

        Self {
            path: path.to_path_buf(),
            peers,
        }
    }

    pub fn save(&self) -> Result<(), String> {
        let json =
            serde_json::to_string_pretty(&self.peers).map_err(|e| format!("serialize: {e}"))?;
        std::fs::write(&self.path, json).map_err(|e| format!("write: {e}"))
    }

    pub fn get(&self, peer_id: &str) -> Option<&PairedIosPeer> {
        self.peers.get(peer_id)
    }

    pub fn list(&self) -> Vec<&PairedIosPeer> {
        self.peers.values().collect()
    }

    pub fn upsert(&mut self, peer: PairedIosPeer) {
        self.peers.insert(peer.peer_id.clone(), peer);
    }

    pub fn remove(&mut self, peer_id: &str) -> Option<PairedIosPeer> {
        self.peers.remove(peer_id)
    }

    pub fn touch(&mut self, peer_id: &str) {
        if let Some(peer) = self.peers.get_mut(peer_id) {
            peer.last_seen = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_peer() -> PairedIosPeer {
        PairedIosPeer {
            peer_id: "ios-peer-1".to_string(),
            peer_label: "Alice iPhone".to_string(),
            peer_pubkey_hex: "aa".repeat(32),
            relay_url: "wss://relay.test".to_string(),
            last_seen: 10,
            paired_at: 5,
            platform: "ios".to_string(),
        }
    }

    #[test]
    fn upsert_and_reload() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("paired_ios_peers.json");
        let mut store = PairedIosPeerStore::load(&path);
        store.upsert(fixture_peer());
        store.save().unwrap();

        let reloaded = PairedIosPeerStore::load(&path);
        let peer = reloaded.get("ios-peer-1").unwrap();
        assert_eq!(peer.peer_label, "Alice iPhone");
        assert_eq!(peer.platform, "ios");
    }

    #[test]
    fn touch_updates_last_seen() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("paired_ios_peers.json");
        let mut store = PairedIosPeerStore::load(&path);
        store.upsert(fixture_peer());
        let before = store.get("ios-peer-1").unwrap().last_seen;
        store.touch("ios-peer-1");
        let after = store.get("ios-peer-1").unwrap().last_seen;
        assert!(after >= before);
    }
}
