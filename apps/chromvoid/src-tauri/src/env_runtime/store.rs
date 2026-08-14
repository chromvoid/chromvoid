use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};
use zeroize::Zeroizing;

use super::types::{DevicePreset, EnvRuntimeError};

#[path = "store_validation.rs"]
mod store_validation;

use self::store_validation::validate_presets;

const STORE_KIND: &str = "chromvoid.env_runtime.device_presets";
const STORE_VERSION: u8 = 1;
const STORE_AAD: &[u8] = b"chromvoid:env-runtime:device-presets:v1";

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct EncryptedPresetStore {
    kind: String,
    version: u8,
    ciphertext_b64: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct PresetStorePayload {
    presets: HashMap<String, DevicePreset>,
}

pub struct DevicePresetStore {
    path: PathBuf,
    state: Mutex<DevicePresetStoreState>,
}

enum DevicePresetStoreState {
    Ready(HashMap<String, DevicePreset>),
    Unavailable(EnvRuntimeError),
}

impl DevicePresetStore {
    pub fn load(path: PathBuf) -> Self {
        let state = match load_payload(&path) {
            Ok(payload) => DevicePresetStoreState::Ready(payload.presets),
            Err(error) => DevicePresetStoreState::Unavailable(error),
        };
        Self {
            path,
            state: Mutex::new(state),
        }
    }

    pub fn health_error(&self) -> Option<EnvRuntimeError> {
        let state = self.state.lock().ok()?;
        match &*state {
            DevicePresetStoreState::Ready(_) => None,
            DevicePresetStoreState::Unavailable(error) => Some(error.clone()),
        }
    }

    pub fn list(&self) -> Result<Vec<DevicePreset>, EnvRuntimeError> {
        let state = self.state.lock().map_err(|_| {
            EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::INTERNAL,
                "Preset store mutex poisoned",
            )
        })?;
        let presets = match &*state {
            DevicePresetStoreState::Ready(presets) => presets,
            DevicePresetStoreState::Unavailable(error) => return Err(store_unavailable(error)),
        };
        let mut presets = presets.values().cloned().collect::<Vec<_>>();
        presets.sort_by(|left, right| left.slug.cmp(&right.slug));
        Ok(presets)
    }

    pub fn get(&self, id_or_slug: &str) -> Result<Option<DevicePreset>, EnvRuntimeError> {
        let state = self.state.lock().map_err(|_| {
            EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::INTERNAL,
                "Preset store mutex poisoned",
            )
        })?;
        let presets = match &*state {
            DevicePresetStoreState::Ready(presets) => presets,
            DevicePresetStoreState::Unavailable(error) => return Err(store_unavailable(error)),
        };
        Ok(presets.get(id_or_slug).cloned().or_else(|| {
            presets
                .values()
                .find(|preset| preset.slug == id_or_slug)
                .cloned()
        }))
    }

    pub fn insert(&self, preset: DevicePreset) -> Result<(), EnvRuntimeError> {
        let mut state = self.state.lock().map_err(|_| {
            EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::INTERNAL,
                "Preset store mutex poisoned",
            )
        })?;
        let presets = match &mut *state {
            DevicePresetStoreState::Ready(presets) => presets,
            DevicePresetStoreState::Unavailable(error) => return Err(store_unavailable(error)),
        };
        if presets
            .values()
            .any(|existing| existing.slug == preset.slug && existing.id != preset.id)
        {
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::CONFLICT,
                format!("Preset slug '{}' already exists", preset.slug),
            ));
        }
        let mut next = presets.clone();
        next.insert(preset.id.clone(), preset);
        save_payload(
            &self.path,
            &PresetStorePayload {
                presets: next.clone(),
            },
        )?;
        *presets = next;
        Ok(())
    }

    pub fn remove(
        &self,
        id_or_slug: &str,
        base_revision: Option<u64>,
    ) -> Result<DevicePreset, EnvRuntimeError> {
        let mut state = self.state.lock().map_err(|_| {
            EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::INTERNAL,
                "Preset store mutex poisoned",
            )
        })?;
        let presets = match &mut *state {
            DevicePresetStoreState::Ready(presets) => presets,
            DevicePresetStoreState::Unavailable(error) => return Err(store_unavailable(error)),
        };
        let id = if presets.contains_key(id_or_slug) {
            id_or_slug.to_string()
        } else {
            presets
                .iter()
                .find_map(|(id, preset)| (preset.slug == id_or_slug).then(|| id.clone()))
                .ok_or_else(|| {
                    EnvRuntimeError::new(
                        crate::env_runtime::EnvRuntimeErrorCode::NOT_FOUND,
                        "Preset not found",
                    )
                })?
        };
        let existing = presets.get(&id).ok_or_else(|| {
            EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::NOT_FOUND,
                "Preset not found",
            )
        })?;
        if base_revision.is_some_and(|revision| revision != existing.revision) {
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::REVISION_CONFLICT,
                "Preset changed since the proposal was created",
            ));
        }
        let mut next = presets.clone();
        let removed = next.remove(&id).ok_or_else(|| {
            EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::NOT_FOUND,
                "Preset not found",
            )
        })?;
        save_payload(
            &self.path,
            &PresetStorePayload {
                presets: next.clone(),
            },
        )?;
        *presets = next;
        Ok(removed)
    }
}

fn store_unavailable(cause: &EnvRuntimeError) -> EnvRuntimeError {
    EnvRuntimeError::new(
        crate::env_runtime::EnvRuntimeErrorCode::DEVICE_STORE_UNAVAILABLE,
        format!("Device preset store is unavailable ({})", cause.code),
    )
}

fn load_payload(path: &Path) -> Result<PresetStorePayload, EnvRuntimeError> {
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(PresetStorePayload::default())
        }
        Err(error) => {
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::DEVICE_STORE_UNAVAILABLE,
                format!("Failed to read device preset store: {error}"),
            ))
        }
    };
    let wrapper: EncryptedPresetStore = serde_json::from_slice(&bytes).map_err(|error| {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::DEVICE_STORE_CORRUPT,
            format!("Failed to parse device preset store: {error}"),
        )
    })?;
    if wrapper.kind != STORE_KIND || wrapper.version != STORE_VERSION {
        return Err(EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::DEVICE_STORE_VERSION,
            "Unsupported device preset store format",
        ));
    }
    let ciphertext = BASE64_STANDARD
        .decode(wrapper.ciphertext_b64.as_bytes())
        .map_err(|_| {
            EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::DEVICE_STORE_CORRUPT,
                "Invalid preset ciphertext",
            )
        })?;
    let key = Zeroizing::new(device_store_key(path)?);
    let plaintext = Zeroizing::new(
        chromvoid_core::crypto::decrypt(&ciphertext, &*key, STORE_AAD).map_err(|_| {
            EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::DEVICE_STORE_LOCKED,
                "Device preset store could not be decrypted",
            )
        })?,
    );
    let payload: PresetStorePayload =
        serde_json::from_slice(plaintext.as_slice()).map_err(|error| {
            EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::DEVICE_STORE_CORRUPT,
                format!("Invalid device preset payload: {error}"),
            )
        })?;
    validate_presets(&payload.presets).map_err(|error| {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::DEVICE_STORE_CORRUPT,
            format!("Invalid device preset payload: {error}"),
        )
    })?;
    Ok(payload)
}

fn save_payload(path: &Path, payload: &PresetStorePayload) -> Result<(), EnvRuntimeError> {
    validate_presets(&payload.presets).map_err(|error| {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::DEVICE_STORE_WRITE_FAILED,
            format!("Refusing to save invalid device preset payload: {error}"),
        )
    })?;
    let plaintext = Zeroizing::new(serde_json::to_vec(payload).map_err(|error| {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::DEVICE_STORE_WRITE_FAILED,
            format!("Failed to serialize device presets: {error}"),
        )
    })?);
    let key = Zeroizing::new(device_store_key(path)?);
    let ciphertext = chromvoid_core::crypto::encrypt(plaintext.as_slice(), &*key, STORE_AAD)
        .map_err(|error| {
            EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::DEVICE_STORE_WRITE_FAILED,
                format!("Failed to encrypt device presets: {error}"),
            )
        })?;
    let wrapper = EncryptedPresetStore {
        kind: STORE_KIND.to_string(),
        version: STORE_VERSION,
        ciphertext_b64: BASE64_STANDARD.encode(ciphertext),
    };
    crate::helpers::storage::write_json_pretty_atomic(path, &wrapper).map_err(|error| {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::DEVICE_STORE_WRITE_FAILED,
            format!("Failed to save device presets: {error}"),
        )
    })
}

#[cfg(test)]
fn device_store_key(path: &Path) -> Result<[u8; 32], EnvRuntimeError> {
    let mut hasher = Sha256::new();
    hasher.update(b"chromvoid:test:env-runtime-device-store:");
    hasher.update(path.to_string_lossy().as_bytes());
    Ok(hasher.finalize().into())
}

#[cfg(all(not(test), target_os = "macos"))]
fn device_store_key(path: &Path) -> Result<[u8; 32], EnvRuntimeError> {
    use chromvoid_core::crypto::keystore::KeyringKeystore;

    let root = path.parent().unwrap_or_else(|| Path::new("."));
    let keystore = KeyringKeystore::for_storage_path(root).map_err(|error| {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::DEVICE_STORE_KEY_UNAVAILABLE,
            format!("Device keychain is unavailable: {error}"),
        )
    })?;
    let pepper = Zeroizing::new(load_device_store_pepper(&keystore)?);
    let mut hasher = Sha256::new();
    hasher.update(b"chromvoid:env-runtime:device-store-key:v1:");
    hasher.update(pepper.as_slice());
    Ok(hasher.finalize().into())
}

#[cfg(all(not(test), not(target_os = "macos")))]
fn device_store_key(_path: &Path) -> Result<[u8; 32], EnvRuntimeError> {
    Err(EnvRuntimeError::new(
        crate::env_runtime::EnvRuntimeErrorCode::PLATFORM_UNSUPPORTED,
        "Env Runtime v1 is available on macOS only",
    ))
}

fn load_device_store_pepper(
    keystore: &dyn chromvoid_core::crypto::keystore::Keystore,
) -> Result<[u8; 32], EnvRuntimeError> {
    chromvoid_core::crypto::StoragePepper::load(keystore)
        .map_err(|error| {
            EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::DEVICE_STORE_KEY_UNAVAILABLE,
                format!("Device keychain is unavailable: {error}"),
            )
        })?
        .ok_or_else(|| {
            EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::DEVICE_STORE_KEY_UNAVAILABLE,
                "Device keychain material is missing for the preset store",
            )
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn preset() -> DevicePreset {
        DevicePreset {
            id: "preset-1".to_string(),
            profile_id: "profile-1".to_string(),
            slug: "test".to_string(),
            label: "Test".to_string(),
            revision: 1,
            workspace_root: "/tmp".to_string(),
            cwd: "/tmp".to_string(),
            executable: "/usr/bin/true".to_string(),
            executable_sha256: "00".repeat(32),
            args: Vec::new(),
            passthrough_env: Vec::new(),
            created_at_epoch_ms: 1,
            updated_at_epoch_ms: 1,
        }
    }

    fn write_authenticated_payload(path: &Path, payload: &PresetStorePayload) -> Vec<u8> {
        let plaintext = Zeroizing::new(serde_json::to_vec(payload).expect("serialize payload"));
        let key = Zeroizing::new(device_store_key(path).expect("fixture key"));
        let ciphertext = chromvoid_core::crypto::encrypt(plaintext.as_slice(), &*key, STORE_AAD)
            .expect("encrypt payload");
        let wrapper = EncryptedPresetStore {
            kind: STORE_KIND.to_string(),
            version: STORE_VERSION,
            ciphertext_b64: BASE64_STANDARD.encode(ciphertext),
        };
        let envelope = serde_json::to_vec_pretty(&wrapper).expect("serialize envelope");
        std::fs::write(path, &envelope).expect("write encrypted fixture");
        envelope
    }

    fn payload_with_preset(mutate: impl FnOnce(&mut DevicePreset)) -> PresetStorePayload {
        let mut candidate = preset();
        mutate(&mut candidate);
        PresetStorePayload {
            presets: HashMap::from([(candidate.id.clone(), candidate)]),
        }
    }

    #[test]
    fn encrypted_store_roundtrips_without_plaintext_fields() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let path = tempdir.path().join("presets.enc.json");
        let store = DevicePresetStore::load(path.clone());
        store.insert(preset()).expect("insert");

        let bytes = std::fs::read(&path).expect("read");
        let text = String::from_utf8(bytes).expect("utf8");
        assert!(!text.contains("/usr/bin/true"));
        assert!(!text.contains("profile-1"));

        let reopened = DevicePresetStore::load(path);
        assert_eq!(reopened.get("test").expect("get"), Some(preset()));
    }

    #[test]
    fn missing_pepper_maps_to_typed_device_store_failure() {
        let keystore = chromvoid_core::crypto::keystore::InMemoryKeystore::new();

        let error = load_device_store_pepper(&keystore).expect_err("missing pepper");

        assert_eq!(error.code, "DEVICE_STORE_KEY_UNAVAILABLE");
        assert_eq!(
            error.message,
            "Device keychain material is missing for the preset store"
        );
    }

    #[test]
    fn stale_delete_fails_closed() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let store = DevicePresetStore::load(tempdir.path().join("presets.enc.json"));
        store.insert(preset()).expect("insert");

        let error = store.remove("preset-1", Some(9)).expect_err("stale");
        assert_eq!(error.code, "REVISION_CONFLICT");
        assert!(store.get("preset-1").expect("get").is_some());
    }

    #[test]
    fn corrupt_store_degrades_without_losing_status_access() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let path = tempdir.path().join("presets.enc.json");
        std::fs::write(&path, b"not-json").expect("write corrupt store");

        let store = DevicePresetStore::load(path);
        assert_eq!(
            store.health_error().expect("degraded").code,
            "DEVICE_STORE_CORRUPT"
        );
        assert_eq!(
            store.list().expect_err("preset access fails closed").code,
            "DEVICE_STORE_UNAVAILABLE"
        );
    }

    #[test]
    fn authenticated_semantically_malformed_stores_are_unavailable_and_untouched() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let mut duplicate_slug = preset();
        duplicate_slug.id = "preset-2".to_string();
        let duplicate_slugs = PresetStorePayload {
            presets: HashMap::from([
                ("preset-1".to_string(), preset()),
                ("preset-2".to_string(), duplicate_slug),
            ]),
        };
        let too_many_records = PresetStorePayload {
            presets: (0..=crate::env_runtime::validation::MAX_DEVICE_PRESETS)
                .map(|index| {
                    let id = format!("preset-{index}");
                    let mut candidate = preset();
                    candidate.id = id.clone();
                    candidate.slug = format!("preset-{index}");
                    (id, candidate)
                })
                .collect(),
        };

        let fixtures = vec![
            ("record-count", too_many_records),
            (
                "map-key-identity",
                PresetStorePayload {
                    presets: HashMap::from([("other-id".to_string(), preset())]),
                },
            ),
            (
                "preset-id-shape",
                payload_with_preset(|candidate| candidate.id = "invalid/id".to_string()),
            ),
            (
                "preset-id-byte-limit",
                payload_with_preset(|candidate| candidate.id = "i".repeat(129)),
            ),
            (
                "profile-id-shape",
                payload_with_preset(|candidate| candidate.profile_id = "invalid/id".to_string()),
            ),
            (
                "profile-id-byte-limit",
                payload_with_preset(|candidate| candidate.profile_id = "p".repeat(129)),
            ),
            (
                "slug-shape",
                payload_with_preset(|candidate| candidate.slug = "Uppercase".to_string()),
            ),
            (
                "slug-byte-limit",
                payload_with_preset(|candidate| candidate.slug = "s".repeat(65)),
            ),
            ("slug-unique", duplicate_slugs),
            (
                "label-trimmed",
                payload_with_preset(|candidate| candidate.label = " Test".to_string()),
            ),
            (
                "label-control",
                payload_with_preset(|candidate| candidate.label = "Bad\nlabel".to_string()),
            ),
            (
                "label-byte-limit",
                payload_with_preset(|candidate| candidate.label = "x".repeat(81)),
            ),
            (
                "revision-positive",
                payload_with_preset(|candidate| candidate.revision = 0),
            ),
            (
                "timestamp-order",
                payload_with_preset(|candidate| {
                    candidate.created_at_epoch_ms = 2;
                    candidate.updated_at_epoch_ms = 1;
                }),
            ),
            (
                "workspace-absolute",
                payload_with_preset(|candidate| candidate.workspace_root = "tmp".to_string()),
            ),
            (
                "cwd-normalized",
                payload_with_preset(|candidate| candidate.cwd = "/tmp/../tmp".to_string()),
            ),
            (
                "executable-normalized",
                payload_with_preset(|candidate| {
                    candidate.executable = "/usr//bin/true".to_string()
                }),
            ),
            (
                "path-byte-limit",
                payload_with_preset(|candidate| {
                    candidate.workspace_root = format!("/{}", "x".repeat(4_096))
                }),
            ),
            (
                "path-nul",
                payload_with_preset(|candidate| candidate.cwd = "/tmp/\0child".to_string()),
            ),
            (
                "sha-length",
                payload_with_preset(|candidate| candidate.executable_sha256 = "0".repeat(63)),
            ),
            (
                "sha-lowercase-hex",
                payload_with_preset(|candidate| candidate.executable_sha256 = "A".repeat(64)),
            ),
            (
                "args-count",
                payload_with_preset(|candidate| candidate.args = vec![String::new(); 129]),
            ),
            (
                "arg-byte-limit",
                payload_with_preset(|candidate| candidate.args = vec!["x".repeat(4_097)]),
            ),
            (
                "args-total-byte-limit",
                payload_with_preset(|candidate| candidate.args = vec!["x".repeat(4_096); 17]),
            ),
            (
                "arg-nul",
                payload_with_preset(|candidate| candidate.args = vec!["bad\0arg".to_string()]),
            ),
            (
                "passthrough-count",
                payload_with_preset(|candidate| {
                    candidate.passthrough_env =
                        (0..33).map(|index| format!("ENV_{index}")).collect()
                }),
            ),
            (
                "passthrough-unique",
                payload_with_preset(|candidate| {
                    candidate.passthrough_env = vec!["PATH".to_string(), "PATH".to_string()]
                }),
            ),
            (
                "passthrough-name-shape",
                payload_with_preset(|candidate| {
                    candidate.passthrough_env = vec!["9INVALID".to_string()]
                }),
            ),
            (
                "passthrough-name-byte-limit",
                payload_with_preset(|candidate| {
                    candidate.passthrough_env = vec![format!("A{}", "X".repeat(128))]
                }),
            ),
            (
                "passthrough-name-nul",
                payload_with_preset(|candidate| {
                    candidate.passthrough_env = vec!["BAD\0NAME".to_string()]
                }),
            ),
        ];

        for (fixture_name, payload) in fixtures {
            let path = tempdir.path().join(format!("{fixture_name}.enc.json"));
            let before = write_authenticated_payload(&path, &payload);

            let store = DevicePresetStore::load(path.clone());
            assert_eq!(
                store.health_error().expect("degraded").code,
                "DEVICE_STORE_CORRUPT"
            );
            assert_eq!(
                store.list().expect_err("preset access fails closed").code,
                "DEVICE_STORE_UNAVAILABLE"
            );
            assert_eq!(std::fs::read(path).expect("read preserved fixture"), before);
        }
    }

    #[test]
    fn failed_pre_save_validation_preserves_previous_file_and_memory_state() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let path = tempdir.path().join("presets.enc.json");
        let store = DevicePresetStore::load(path.clone());
        let original = preset();
        store.insert(original.clone()).expect("insert valid preset");
        let before = std::fs::read(&path).expect("read valid envelope");

        let mut invalid = preset();
        invalid.id = "preset-2".to_string();
        invalid.slug = "second".to_string();
        invalid.args = vec!["bad\0argument".to_string()];
        assert_eq!(
            store
                .insert(invalid)
                .expect_err("semantic validation must fail")
                .code,
            "DEVICE_STORE_WRITE_FAILED"
        );

        assert_eq!(
            std::fs::read(&path).expect("read preserved envelope"),
            before
        );
        assert_eq!(store.list().expect("ready store"), vec![original.clone()]);
        assert_eq!(
            DevicePresetStore::load(path)
                .get("preset-1")
                .expect("reopen preserved store"),
            Some(original)
        );
    }

    #[test]
    fn failed_insert_does_not_mutate_in_memory_state() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let path = tempdir.path().join("presets.enc.json");
        let store = DevicePresetStore::load(path.clone());
        std::fs::create_dir(&path).expect("block atomic destination");

        assert_eq!(
            store.insert(preset()).expect_err("write must fail").code,
            "DEVICE_STORE_WRITE_FAILED"
        );
        assert!(store
            .list()
            .expect("ready state remains readable")
            .is_empty());
    }

    #[test]
    fn failed_remove_does_not_mutate_in_memory_state() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let path = tempdir.path().join("presets.enc.json");
        let store = DevicePresetStore::load(path.clone());
        store.insert(preset()).expect("insert");
        std::fs::remove_file(&path).expect("remove envelope");
        std::fs::create_dir(&path).expect("block atomic destination");

        assert_eq!(
            store
                .remove("preset-1", Some(1))
                .expect_err("write must fail")
                .code,
            "DEVICE_STORE_WRITE_FAILED"
        );
        assert!(store.get("preset-1").expect("get").is_some());
    }
}
