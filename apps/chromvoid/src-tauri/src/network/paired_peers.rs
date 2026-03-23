//! Persistent storage for paired network peers.
//! Mirrors `usb/paired_devices.rs` for the network transport layer.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// A record of a paired network peer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairedPeer {
    pub peer_id: String,
    pub label: String,
    pub relay_url: String,
    pub peer_pubkey: Vec<u8>,
    pub client_pubkey: Vec<u8>,
    pub client_privkey_hex: String,
    pub last_seen: u64,
    pub paired_at: u64,
}

/// Manages the list of paired network peers on disk.
pub struct PairedPeerStore {
    path: PathBuf,
    peers: HashMap<String, PairedPeer>,
}

impl PairedPeerStore {
    /// Load paired peers from a JSON file at `path`.
    /// If the file does not exist or is unreadable, returns an empty store.
    pub fn load(path: &Path) -> Self {
        let peers = if path.exists() {
            match std::fs::read_to_string(path) {
                Ok(contents) => serde_json::from_str::<HashMap<String, PairedPeer>>(&contents)
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

    /// Persist the current peer list to the JSON file on disk.
    pub fn save(&self) -> Result<(), String> {
        let json =
            serde_json::to_string_pretty(&self.peers).map_err(|e| format!("serialize: {e}"))?;
        std::fs::write(&self.path, json).map_err(|e| format!("write: {e}"))
    }

    /// Look up a paired peer by peer_id.
    pub fn get(&self, peer_id: &str) -> Option<&PairedPeer> {
        self.peers.get(peer_id)
    }

    /// Check whether a peer with the given ID is paired.
    pub fn is_paired(&self, peer_id: &str) -> bool {
        self.peers.contains_key(peer_id)
    }

    /// Insert or update a paired peer record.
    pub fn upsert(&mut self, peer: PairedPeer) {
        self.peers.insert(peer.peer_id.clone(), peer);
    }

    /// Remove a paired peer by ID, returning it if it existed.
    pub fn remove(&mut self, peer_id: &str) -> Option<PairedPeer> {
        self.peers.remove(peer_id)
    }

    /// Return a list of all paired peers.
    pub fn list(&self) -> Vec<&PairedPeer> {
        self.peers.values().collect()
    }

    /// Find a peer by ID.
    pub fn find_by_id(&self, peer_id: &str) -> Option<&PairedPeer> {
        self.peers.get(peer_id)
    }

    /// Update the `last_seen` timestamp to now.
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
#[path = "paired_peers_tests.rs"]
mod tests;
