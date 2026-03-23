//! Persisted iOS push registration and relay sync helpers.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tracing::info;

use super::ios_control::{
    register_push_registration, PushRegistration, RegisterPushRegistrationRequest,
};
use super::local_identity::LocalDeviceIdentityStore;

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn local_identity_path(storage_root: &Path) -> PathBuf {
    storage_root.join("network_local_identity.json")
}

fn push_registration_path(storage_root: &Path) -> PathBuf {
    storage_root.join("ios_push_registration.json")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalIosPushRegistration {
    pub device_token: String,
    pub environment: String,
    pub bundle_id: String,
    pub updated_at: u64,
}

pub struct LocalIosPushRegistrationStore {
    path: PathBuf,
    registration: Option<LocalIosPushRegistration>,
}

impl LocalIosPushRegistrationStore {
    pub fn load(path: &Path) -> Self {
        let registration = if path.exists() {
            std::fs::read_to_string(path).ok().and_then(|contents| {
                serde_json::from_str::<LocalIosPushRegistration>(&contents).ok()
            })
        } else {
            None
        };

        Self {
            path: path.to_path_buf(),
            registration,
        }
    }

    pub fn get(&self) -> Option<&LocalIosPushRegistration> {
        self.registration.as_ref()
    }

    pub fn set(
        &mut self,
        device_token: &str,
        environment: &str,
        bundle_id: &str,
    ) -> Result<LocalIosPushRegistration, String> {
        let registration = LocalIosPushRegistration {
            device_token: device_token.trim().to_string(),
            environment: environment.trim().to_string(),
            bundle_id: bundle_id.trim().to_string(),
            updated_at: now_secs(),
        };
        self.registration = Some(registration.clone());
        self.save()?;
        Ok(registration)
    }

    pub fn save(&self) -> Result<(), String> {
        let registration = self
            .registration
            .as_ref()
            .ok_or("no iOS push registration to save".to_string())?;
        let json =
            serde_json::to_string_pretty(registration).map_err(|e| format!("serialize: {e}"))?;
        std::fs::write(&self.path, json).map_err(|e| format!("write: {e}"))
    }
}

pub fn save_local_push_registration(
    storage_root: &Path,
    device_token: &str,
    environment: &str,
    bundle_id: &str,
) -> Result<LocalIosPushRegistration, String> {
    let token = device_token.trim();
    let env = environment.trim();
    let bundle = bundle_id.trim();
    if token.is_empty() || env.is_empty() || bundle.is_empty() {
        return Err("device_token, environment, and bundle_id are required".to_string());
    }

    let mut store = LocalIosPushRegistrationStore::load(&push_registration_path(storage_root));
    store.set(token, env, bundle)
}

pub async fn sync_push_registration_for_relay(
    relay_url: &str,
    storage_root: &Path,
) -> Result<Option<PushRegistration>, String> {
    let store = LocalIosPushRegistrationStore::load(&push_registration_path(storage_root));
    let Some(registration) = store.get().cloned() else {
        return Ok(None);
    };

    let identity = {
        let store = LocalDeviceIdentityStore::load(&local_identity_path(storage_root));
        let Some(identity) = store.get().cloned() else {
            return Ok(None);
        };
        identity
    };

    let remote = register_push_registration(
        relay_url,
        &identity.device_id,
        &RegisterPushRegistrationRequest {
            relay_url: relay_url.to_string(),
            device_token: registration.device_token,
            environment: registration.environment,
            bundle_id: registration.bundle_id,
        },
    )
    .await?;

    info!(
        "ios_push: relay registration synced for peer_id={}",
        remote.peer_id
    );
    Ok(Some(remote))
}

pub async fn sync_push_registration_for_host_mode(
    storage_root: &Path,
) -> Result<Option<PushRegistration>, String> {
    if !super::ios_pairing::is_host_mode_enabled(storage_root) {
        return Ok(None);
    }

    let Some(relay_url) = super::ios_pairing::persisted_host_mode_relay_url(storage_root) else {
        return Ok(None);
    };

    sync_push_registration_for_relay(&relay_url, storage_root).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn push_registration_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let saved = save_local_push_registration(
            dir.path(),
            "deadbeef",
            "development",
            "com.chromvoid.app",
        )
        .unwrap();
        assert_eq!(saved.device_token, "deadbeef");

        let store = LocalIosPushRegistrationStore::load(&push_registration_path(dir.path()));
        let persisted = store.get().unwrap();
        assert_eq!(persisted.device_token, "deadbeef");
        assert_eq!(persisted.environment, "development");
        assert_eq!(persisted.bundle_id, "com.chromvoid.app");
    }
}
