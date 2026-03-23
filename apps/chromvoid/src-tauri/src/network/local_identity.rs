//! Persistent local device identity for iOS/Desktop network pairing.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalDeviceIdentity {
    pub device_id: String,
    pub device_label: String,
    pub static_pubkey_hex: String,
    pub static_privkey_hex: String,
    pub created_at: u64,
}

pub struct LocalDeviceIdentityStore {
    path: PathBuf,
    identity: Option<LocalDeviceIdentity>,
}

impl LocalDeviceIdentityStore {
    pub fn load(path: &Path) -> Self {
        let identity = if path.exists() {
            std::fs::read_to_string(path)
                .ok()
                .and_then(|contents| serde_json::from_str::<LocalDeviceIdentity>(&contents).ok())
        } else {
            None
        };

        Self {
            path: path.to_path_buf(),
            identity,
        }
    }

    pub fn get(&self) -> Option<&LocalDeviceIdentity> {
        self.identity.as_ref()
    }

    pub fn get_or_create(&mut self, fallback_label: &str) -> Result<LocalDeviceIdentity, String> {
        if let Some(identity) = self.identity.clone() {
            return Ok(identity);
        }

        let label = fallback_label.trim();
        let label = if label.is_empty() {
            "ChromVoid Device"
        } else {
            label
        };

        let params: snow::params::NoiseParams = chromvoid_protocol::NOISE_PARAMS_XX
            .parse()
            .map_err(|e: snow::Error| format!("noise params: {e}"))?;
        let keypair = snow::Builder::new(params)
            .generate_keypair()
            .map_err(|e| format!("identity keypair gen: {e}"))?;

        let identity = LocalDeviceIdentity {
            device_id: Uuid::new_v4().to_string(),
            device_label: label.to_string(),
            static_pubkey_hex: hex::encode(keypair.public),
            static_privkey_hex: hex::encode(keypair.private),
            created_at: now_secs(),
        };
        self.identity = Some(identity.clone());
        self.save()?;
        Ok(identity)
    }

    pub fn save(&self) -> Result<(), String> {
        let identity = self
            .identity
            .as_ref()
            .ok_or("no local device identity to save".to_string())?;
        let json = serde_json::to_string_pretty(identity).map_err(|e| format!("serialize: {e}"))?;
        std::fs::write(&self.path, json).map_err(|e| format!("write: {e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_and_persists_identity() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("network_local_identity.json");
        let mut store = LocalDeviceIdentityStore::load(&path);
        let identity = store.get_or_create("iPhone 16").unwrap();

        assert!(!identity.device_id.is_empty());
        assert_eq!(identity.device_label, "iPhone 16");
        assert_eq!(identity.static_pubkey_hex.len(), 64);
        assert_eq!(identity.static_privkey_hex.len(), 64);

        let reloaded = LocalDeviceIdentityStore::load(&path);
        let persisted = reloaded.get().unwrap();
        assert_eq!(persisted.device_id, identity.device_id);
        assert_eq!(persisted.static_pubkey_hex, identity.static_pubkey_hex);
    }

    #[test]
    fn get_or_create_reuses_existing_identity() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("network_local_identity.json");
        let mut store = LocalDeviceIdentityStore::load(&path);
        let first = store.get_or_create("Phone A").unwrap();
        let second = store.get_or_create("Phone B").unwrap();
        assert_eq!(first.device_id, second.device_id);
        assert_eq!(second.device_label, "Phone A");
    }
}
