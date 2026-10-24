//! Persistent storage for paired network peers.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
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
    #[serde(default = "default_platform")]
    pub platform: String,
}

fn default_platform() -> String {
    "network".to_string()
}

/// Key selection remains at the client boundary; keys are requested on each load/save.
pub type PeerStoreKeyProvider = Arc<dyn Fn(&Path) -> Result<[u8; 32], String> + Send + Sync>;

/// Manages paired network peers on disk using the client’s explicitly selected key provider.
pub struct PairedPeerStore {
    key_provider: PeerStoreKeyProvider,
    path: PathBuf,
    peers: HashMap<String, PairedPeer>,
    load_error: Option<String>,
}

impl PairedPeerStore {
    /// Load paired peers from a JSON file at `path`.
    /// If the file does not exist, returns an empty mutable store.
    /// If the file is present but unreadable or corrupt, returns a fail-closed store that refuses
    /// mutation so trust records cannot be wiped by a later save.
    pub fn load(path: &Path, key_provider: PeerStoreKeyProvider) -> Self {
        let load_error = match crate::paired_store_crypto::load_store(
            path,
            "network: paired peer store",
            key_provider.as_ref(),
        ) {
            Ok(loaded) => {
                return Self {
                    path: path.to_path_buf(),
                    peers: canonical_pubkey_index(loaded),
                    load_error: None,
                    key_provider,
                };
            }
            Err(error) => {
                tracing::warn!("{error}");
                error
            }
        };

        Self {
            path: path.to_path_buf(),
            peers: HashMap::new(),
            load_error: Some(load_error),
            key_provider,
        }
    }

    /// Persist the current peer list to the JSON file on disk.
    pub fn save(&self) -> Result<(), String> {
        self.ensure_loaded()?;
        crate::paired_store_crypto::save_store(&self.path, &self.peers, self.key_provider.as_ref())
    }

    pub fn load_error(&self) -> Option<&str> {
        self.load_error.as_deref()
    }

    /// Look up a paired peer by peer_id.
    pub fn get(&self, peer_id: &str) -> Option<&PairedPeer> {
        self.find_by_id(peer_id)
    }

    /// Check whether a peer with the given ID is paired.
    pub fn is_paired(&self, peer_id: &str) -> bool {
        self.find_by_id(peer_id).is_some()
    }

    /// Insert or update a paired peer record.
    pub fn upsert(&mut self, peer: PairedPeer) -> Result<(), String> {
        self.ensure_loaded()?;
        if peer.peer_pubkey.is_empty() {
            return Err("paired peer pubkey is required".to_string());
        }
        let pubkey_key = peer_pubkey_key(&peer.peer_pubkey);
        if let Some(existing) = self.find_by_id(&peer.peer_id) {
            if existing.peer_pubkey != peer.peer_pubkey {
                return Err(format!(
                    "paired peer id {} is already bound to a different public key",
                    peer.peer_id
                ));
            }
        }
        self.peers.insert(pubkey_key, peer);
        Ok(())
    }

    /// Remove a paired peer by ID, returning it if it existed.
    pub fn remove(&mut self, peer_id: &str) -> Option<PairedPeer> {
        if self.load_error.is_some() {
            return None;
        }
        let key = self
            .peers
            .iter()
            .find_map(|(key, peer)| (peer.peer_id == peer_id).then(|| key.clone()))?;
        self.peers.remove(&key)
    }

    /// Return a list of all paired peers.
    pub fn list(&self) -> Vec<&PairedPeer> {
        self.peers.values().collect()
    }

    /// Find the trust record for the authenticated Noise static public key.
    pub fn find_by_public_key(&self, peer_pubkey: &[u8]) -> Option<&PairedPeer> {
        self.peers
            .values()
            .find(|peer| peer.peer_pubkey == peer_pubkey)
    }

    /// Find a peer by ID.
    pub fn find_by_id(&self, peer_id: &str) -> Option<&PairedPeer> {
        self.peers.values().find(|peer| peer.peer_id == peer_id)
    }

    /// Update the `last_seen` timestamp to now.
    pub fn touch(&mut self, peer_id: &str) {
        if self.load_error.is_some() {
            return;
        }
        let key = self
            .peers
            .iter()
            .find_map(|(key, peer)| (peer.peer_id == peer_id).then(|| key.clone()));
        if let Some(peer) = key.and_then(|key| self.peers.get_mut(&key)) {
            peer.last_seen = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
        }
    }

    fn ensure_loaded(&self) -> Result<(), String> {
        match self.load_error.as_ref() {
            Some(error) => Err(format!(
                "paired peer store is unavailable; refusing to mutate trust store: {error}"
            )),
            None => Ok(()),
        }
    }
}

fn canonical_pubkey_index(loaded: HashMap<String, PairedPeer>) -> HashMap<String, PairedPeer> {
    let mut peers = HashMap::new();
    for peer in loaded.into_values() {
        if peer.peer_pubkey.is_empty() {
            tracing::warn!("network: paired peer without pubkey ignored during load");
            continue;
        }
        let key = peer_pubkey_key(&peer.peer_pubkey);
        if peers.contains_key(&key) {
            tracing::warn!(
                peer_id = %peer.peer_id,
                "network: duplicate paired peer pubkey ignored during load"
            );
            continue;
        }
        if peers
            .values()
            .any(|existing: &PairedPeer| existing.peer_id == peer.peer_id)
        {
            tracing::warn!(
                peer_id = %peer.peer_id,
                "network: duplicate paired peer id with different pubkey ignored during load"
            );
            continue;
        }
        peers.insert(key, peer);
    }
    peers
}

fn peer_pubkey_key(peer_pubkey: &[u8]) -> String {
    hex::encode(peer_pubkey)
}
