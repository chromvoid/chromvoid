use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// A record of a paired Orange Pi device.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairedDevice {
    pub serial_number: String,
    pub device_pubkey: Vec<u8>,
    pub client_pubkey: Vec<u8>,
    pub client_privkey_hex: String,
    pub label: String,
    pub last_seen: u64,
    pub paired_at: u64,
}

/// Manages the list of paired devices on disk.
pub struct PairedDeviceStore {
    path: PathBuf,
    devices: HashMap<String, PairedDevice>,
}

impl PairedDeviceStore {
    /// Load paired devices from a JSON file at `path`.
    /// If the file does not exist or is unreadable, returns an empty store.
    pub fn load(path: &Path) -> Self {
        let devices = if path.exists() {
            match std::fs::read_to_string(path) {
                Ok(contents) => serde_json::from_str::<HashMap<String, PairedDevice>>(&contents)
                    .unwrap_or_default(),
                Err(_) => HashMap::new(),
            }
        } else {
            HashMap::new()
        };

        Self {
            path: path.to_path_buf(),
            devices,
        }
    }

    /// Persist the current device list to the JSON file on disk.
    pub fn save(&self) -> Result<(), String> {
        let json =
            serde_json::to_string_pretty(&self.devices).map_err(|e| format!("serialize: {e}"))?;
        std::fs::write(&self.path, json).map_err(|e| format!("write: {e}"))
    }

    /// Look up a paired device by serial number.
    pub fn get(&self, serial_number: &str) -> Option<&PairedDevice> {
        self.devices.get(serial_number)
    }

    /// Check whether a device with the given serial number is paired.
    pub fn is_paired(&self, serial_number: &str) -> bool {
        self.devices.contains_key(serial_number)
    }

    /// Insert or update a paired device record. The serial number inside the
    /// `PairedDevice` is used as the key.
    pub fn upsert(&mut self, device: PairedDevice) {
        self.devices.insert(device.serial_number.clone(), device);
    }

    /// Remove a paired device by serial number, returning it if it existed.
    pub fn remove(&mut self, serial_number: &str) -> Option<PairedDevice> {
        self.devices.remove(serial_number)
    }

    /// Return a list of all paired devices.
    pub fn list(&self) -> Vec<&PairedDevice> {
        self.devices.values().collect()
    }

    /// Update the `last_seen` timestamp to now (seconds since UNIX epoch).
    pub fn touch(&mut self, serial_number: &str) {
        if let Some(device) = self.devices.get_mut(serial_number) {
            device.last_seen = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
        }
    }
}

#[cfg(test)]
#[path = "paired_devices_tests.rs"]
mod tests;
