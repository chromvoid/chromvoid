//! Persisted iOS push registration and relay sync helpers.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tracing::info;

use super::ios_control::{
    register_push_registration, PushRegistration, RegisterPushRegistrationRequest,
};
use super::local_identity::{LocalDeviceIdentity, LocalDeviceIdentityStore};

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

struct PushRegistrationSyncInput {
    registration: LocalIosPushRegistration,
    identity: LocalDeviceIdentity,
}

impl LocalIosPushRegistrationStore {
    pub fn load(path: &Path) -> Self {
        let registration =
            crate::helpers::storage::read_optional_json(path, "network: iOS push registration");

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
        crate::helpers::storage::write_json_pretty_atomic(&self.path, registration)
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
    let Some(input) = load_push_registration_sync_input_blocking(
        storage_root.to_path_buf(),
        "iOS push registration sync input",
    )
    .await?
    else {
        return Ok(None);
    };

    let remote = register_push_registration(
        relay_url,
        &input.identity.device_id,
        &RegisterPushRegistrationRequest {
            relay_url: relay_url.to_string(),
            device_token: input.registration.device_token,
            environment: input.registration.environment,
            bundle_id: input.registration.bundle_id,
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
    let Some(relay_url) = host_mode_relay_url_for_push_sync_blocking(
        storage_root.to_path_buf(),
        "iOS push host mode config",
    )
    .await?
    else {
        return Ok(None);
    };

    sync_push_registration_for_relay(&relay_url, storage_root).await
}

fn load_push_registration_sync_input(root: &Path) -> Option<PushRegistrationSyncInput> {
    let registration_store = LocalIosPushRegistrationStore::load(&push_registration_path(root));
    let registration = registration_store.get().cloned()?;

    let identity_store = LocalDeviceIdentityStore::load(&local_identity_path(root));
    let identity = identity_store.get().cloned()?;

    Some(PushRegistrationSyncInput {
        registration,
        identity,
    })
}

async fn load_push_registration_sync_input_blocking(
    storage_root: PathBuf,
    task_label: &'static str,
) -> Result<Option<PushRegistrationSyncInput>, String> {
    tauri::async_runtime::spawn_blocking(move || load_push_registration_sync_input(&storage_root))
        .await
        .map_err(|error| format!("{task_label} task failed: {error}"))
}

fn host_mode_relay_url_for_push_sync(root: &Path) -> Option<String> {
    if !super::ios_pairing::is_host_mode_enabled(root) {
        return None;
    }
    super::ios_pairing::persisted_host_mode_relay_url(root)
}

async fn host_mode_relay_url_for_push_sync_blocking(
    storage_root: PathBuf,
    task_label: &'static str,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || host_mode_relay_url_for_push_sync(&storage_root))
        .await
        .map_err(|error| format!("{task_label} task failed: {error}"))
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
