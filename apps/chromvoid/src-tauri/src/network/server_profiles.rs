use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use url::Url;

const PROFILE_SCHEMA_VERSION: u16 = 1;
const DEFAULT_ROTATE_AFTER_FAILURES: u32 = 2;
const MAX_ENDPOINTS_PER_PROFILE: usize = 16;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProfileMode {
    Byo,
    Managed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StrictTransport {
    Tcp443Stealth,
    Auto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrictModeDefaults {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_strict_transport")]
    pub transport: StrictTransport,
    #[serde(default = "default_true")]
    pub fail_closed: bool,
    #[serde(default)]
    pub allow_udp_fallback: bool,
}

impl Default for StrictModeDefaults {
    fn default() -> Self {
        Self {
            enabled: true,
            transport: StrictTransport::Tcp443Stealth,
            fail_closed: true,
            allow_udp_fallback: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EndpointRotationPolicy {
    #[serde(default = "default_rotate_after_failures")]
    pub rotate_after_failures: u32,
    #[serde(default = "default_true")]
    pub enable_rollback: bool,
}

impl Default for EndpointRotationPolicy {
    fn default() -> Self {
        Self {
            rotate_after_failures: DEFAULT_ROTATE_AFTER_FAILURES,
            enable_rollback: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerEndpoint {
    pub id: String,
    pub relay_url: String,
    #[serde(default = "default_ready_path")]
    pub readiness_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManagedMetadata {
    pub provider: String,
    #[serde(default)]
    pub profile_signature: Option<String>,
    #[serde(default)]
    pub issued_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileAuth {
    #[serde(default)]
    pub token: Option<String>,
    #[serde(default)]
    pub tls_cert_sha256: Option<String>,
    #[serde(default)]
    pub pinned_cert_pem: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerProfile {
    #[serde(default = "default_schema_version")]
    pub version: u16,
    pub profile_id: String,
    pub label: String,
    pub mode: ProfileMode,
    #[serde(default)]
    pub strict_mode: StrictModeDefaults,
    #[serde(default)]
    pub auth: Option<ProfileAuth>,
    pub endpoints: Vec<ServerEndpoint>,
    #[serde(default)]
    pub rotation: EndpointRotationPolicy,
    #[serde(default)]
    pub managed: Option<ManagedMetadata>,
    #[serde(default)]
    pub updated_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RotationRuntimeState {
    #[serde(default)]
    pub consecutive_failures: u32,
    #[serde(default)]
    pub last_failure_at: Option<u64>,
    #[serde(default)]
    pub last_rotation_at: Option<u64>,
    #[serde(default)]
    pub rollback_endpoint_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredServerProfile {
    pub profile: ServerProfile,
    pub active_endpoint_id: String,
    #[serde(default)]
    pub rotation_state: RotationRuntimeState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportedProfile {
    pub profile_id: String,
    pub mode: ProfileMode,
    pub version: u16,
    pub endpoint_count: usize,
    pub active_endpoint_id: String,
    pub strict_mode_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RotationAction {
    None,
    Rotated,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RotationResult {
    pub action: RotationAction,
    pub profile_id: String,
    pub active_endpoint_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BootstrapProfile {
    pub profile_id: String,
    pub mode: ProfileMode,
    pub relay_url: String,
    pub strict_mode: StrictModeDefaults,
    pub tls_cert_sha256: Option<String>,
    pub pinned_cert_pem: Option<String>,
}

pub struct ServerProfileStore {
    path: PathBuf,
    profiles: HashMap<String, StoredServerProfile>,
}

impl ServerProfileStore {
    pub fn load(path: &Path) -> Self {
        let profiles = if path.exists() {
            match std::fs::read_to_string(path) {
                Ok(contents) => {
                    serde_json::from_str::<HashMap<String, StoredServerProfile>>(&contents)
                        .unwrap_or_default()
                }
                Err(_) => HashMap::new(),
            }
        } else {
            HashMap::new()
        };

        Self {
            path: path.to_path_buf(),
            profiles,
        }
    }

    pub fn save(&self) -> Result<(), String> {
        let json =
            serde_json::to_string_pretty(&self.profiles).map_err(|e| format!("serialize: {e}"))?;
        std::fs::write(&self.path, json).map_err(|e| format!("write: {e}"))
    }

    pub fn list(&self) -> Vec<ImportedProfile> {
        self.profiles
            .values()
            .map(|stored| ImportedProfile {
                profile_id: stored.profile.profile_id.clone(),
                mode: stored.profile.mode.clone(),
                version: stored.profile.version,
                endpoint_count: stored.profile.endpoints.len(),
                active_endpoint_id: stored.active_endpoint_id.clone(),
                strict_mode_enabled: stored.profile.strict_mode.enabled,
            })
            .collect()
    }

    pub fn import_profile_json(
        &mut self,
        raw_profile: &str,
        allow_update: bool,
    ) -> Result<ImportedProfile, String> {
        let mut profile = serde_json::from_str::<ServerProfile>(raw_profile)
            .map_err(|_| "invalid profile json".to_string())?;

        validate_profile(&mut profile)?;

        let existing = self.profiles.get(&profile.profile_id);
        if existing.is_some() && !allow_update {
            return Err("profile already exists".to_string());
        }

        let previous_active = existing.map(|s| s.active_endpoint_id.clone());
        let active_endpoint_id = select_active_endpoint(&profile, previous_active.as_deref())
            .ok_or_else(|| "profile has no usable endpoints".to_string())?;

        let imported = ImportedProfile {
            profile_id: profile.profile_id.clone(),
            mode: profile.mode.clone(),
            version: profile.version,
            endpoint_count: profile.endpoints.len(),
            active_endpoint_id: active_endpoint_id.clone(),
            strict_mode_enabled: profile.strict_mode.enabled,
        };

        self.profiles.insert(
            profile.profile_id.clone(),
            StoredServerProfile {
                profile,
                active_endpoint_id,
                rotation_state: RotationRuntimeState::default(),
            },
        );

        Ok(imported)
    }

    pub fn export_profile_json(&self, profile_id: &str) -> Result<String, String> {
        let stored = self
            .profiles
            .get(profile_id)
            .ok_or_else(|| "profile not found".to_string())?;
        serde_json::to_string_pretty(&stored.profile)
            .map_err(|_| "serialize profile failed".to_string())
    }

    pub fn bootstrap_profile(&self, profile_id: &str) -> Result<BootstrapProfile, String> {
        let stored = self
            .profiles
            .get(profile_id)
            .ok_or_else(|| "profile not found".to_string())?;
        let endpoint = stored
            .profile
            .endpoints
            .iter()
            .find(|endpoint| endpoint.id == stored.active_endpoint_id)
            .ok_or_else(|| "active endpoint missing".to_string())?;

        Ok(BootstrapProfile {
            profile_id: stored.profile.profile_id.clone(),
            mode: stored.profile.mode.clone(),
            relay_url: endpoint.relay_url.clone(),
            strict_mode: stored.profile.strict_mode.clone(),
            tls_cert_sha256: stored
                .profile
                .auth
                .as_ref()
                .and_then(|auth| auth.tls_cert_sha256.clone()),
            pinned_cert_pem: stored
                .profile
                .auth
                .as_ref()
                .and_then(|auth| auth.pinned_cert_pem.clone()),
        })
    }

    pub fn record_endpoint_failure(&mut self, profile_id: &str) -> Result<RotationResult, String> {
        let stored = self
            .profiles
            .get_mut(profile_id)
            .ok_or_else(|| "profile not found".to_string())?;

        let now = unix_now();
        stored.rotation_state.consecutive_failures += 1;
        stored.rotation_state.last_failure_at = Some(now);

        let rotate_after = stored.profile.rotation.rotate_after_failures.max(1);
        if stored.rotation_state.consecutive_failures < rotate_after
            || stored.profile.endpoints.len() <= 1
        {
            return Ok(RotationResult {
                action: RotationAction::None,
                profile_id: profile_id.to_string(),
                active_endpoint_id: stored.active_endpoint_id.clone(),
            });
        }

        let current_idx = stored
            .profile
            .endpoints
            .iter()
            .position(|endpoint| endpoint.id == stored.active_endpoint_id)
            .ok_or_else(|| "active endpoint missing".to_string())?;
        let next_idx = (current_idx + 1) % stored.profile.endpoints.len();
        let next_endpoint_id = stored.profile.endpoints[next_idx].id.clone();

        if stored.profile.rotation.enable_rollback {
            stored.rotation_state.rollback_endpoint_id = Some(stored.active_endpoint_id.clone());
        }
        stored.active_endpoint_id = next_endpoint_id.clone();
        stored.rotation_state.consecutive_failures = 0;
        stored.rotation_state.last_rotation_at = Some(now);

        Ok(RotationResult {
            action: RotationAction::Rotated,
            profile_id: profile_id.to_string(),
            active_endpoint_id: next_endpoint_id,
        })
    }

    pub fn rollback_endpoint(&mut self, profile_id: &str) -> Result<RotationResult, String> {
        let stored = self
            .profiles
            .get_mut(profile_id)
            .ok_or_else(|| "profile not found".to_string())?;

        let rollback_id = match stored.rotation_state.rollback_endpoint_id.clone() {
            Some(v) => v,
            None => {
                return Ok(RotationResult {
                    action: RotationAction::None,
                    profile_id: profile_id.to_string(),
                    active_endpoint_id: stored.active_endpoint_id.clone(),
                })
            }
        };

        if !stored.profile.endpoints.iter().any(|e| e.id == rollback_id) {
            stored.rotation_state.rollback_endpoint_id = None;
            return Ok(RotationResult {
                action: RotationAction::None,
                profile_id: profile_id.to_string(),
                active_endpoint_id: stored.active_endpoint_id.clone(),
            });
        }

        stored.active_endpoint_id = rollback_id.clone();
        stored.rotation_state.rollback_endpoint_id = None;
        stored.rotation_state.consecutive_failures = 0;

        Ok(RotationResult {
            action: RotationAction::Rotated,
            profile_id: profile_id.to_string(),
            active_endpoint_id: rollback_id,
        })
    }
}

fn validate_profile(profile: &mut ServerProfile) -> Result<(), String> {
    if profile.version != PROFILE_SCHEMA_VERSION {
        return Err("unsupported profile schema version".to_string());
    }

    if !is_valid_id(&profile.profile_id) {
        return Err("invalid profile_id".to_string());
    }

    if profile.label.trim().is_empty() {
        return Err("invalid profile label".to_string());
    }

    if profile.endpoints.is_empty() {
        return Err("profile must include at least one endpoint".to_string());
    }
    if profile.endpoints.len() > MAX_ENDPOINTS_PER_PROFILE {
        return Err("too many endpoints".to_string());
    }

    let mut seen = std::collections::HashSet::new();
    for endpoint in &profile.endpoints {
        if !is_valid_id(&endpoint.id) {
            return Err("invalid endpoint id".to_string());
        }
        if !seen.insert(endpoint.id.as_str()) {
            return Err("duplicate endpoint id".to_string());
        }
        validate_relay_url(&endpoint.relay_url)?;
        if !endpoint.readiness_path.starts_with('/') {
            return Err("invalid readiness_path".to_string());
        }
    }

    if profile.strict_mode.enabled && !profile.strict_mode.fail_closed {
        return Err("strict mode requires fail_closed".to_string());
    }

    if profile.rotation.rotate_after_failures == 0 {
        profile.rotation.rotate_after_failures = DEFAULT_ROTATE_AFTER_FAILURES;
    }

    match profile.mode {
        ProfileMode::Managed => {
            let managed = profile
                .managed
                .as_ref()
                .ok_or_else(|| "managed profile metadata required".to_string())?;
            if managed.provider.trim().is_empty() {
                return Err("invalid managed provider".to_string());
            }
        }
        ProfileMode::Byo => {
            if profile.managed.is_some() {
                return Err("byo profile must not include managed metadata".to_string());
            }
        }
    }

    profile.updated_at.get_or_insert_with(unix_now);
    Ok(())
}

fn select_active_endpoint(
    profile: &ServerProfile,
    previous_active: Option<&str>,
) -> Option<String> {
    if let Some(previous) = previous_active {
        if profile.endpoints.iter().any(|e| e.id == previous) {
            return Some(previous.to_string());
        }
    }
    profile.endpoints.first().map(|e| e.id.clone())
}

fn validate_relay_url(relay_url: &str) -> Result<(), String> {
    let parsed = Url::parse(relay_url).map_err(|_| "invalid relay_url".to_string())?;
    match parsed.scheme() {
        "ws" | "wss" => Ok(()),
        _ => Err("relay_url must use ws or wss".to_string()),
    }
}

fn is_valid_id(value: &str) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty()
        && trimmed.len() <= 128
        && trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn default_true() -> bool {
    true
}

fn default_schema_version() -> u16 {
    PROFILE_SCHEMA_VERSION
}

fn default_rotate_after_failures() -> u32 {
    DEFAULT_ROTATE_AFTER_FAILURES
}

fn default_ready_path() -> String {
    "/ready".to_string()
}

fn default_strict_transport() -> StrictTransport {
    StrictTransport::Tcp443Stealth
}

#[cfg(test)]
#[path = "server_profiles_tests.rs"]
mod tests;
