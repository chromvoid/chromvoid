use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use rand::RngCore;

use super::super::types::{
    CapabilityPolicy, GatewayActorKind, GrantStore, PairedAgent, PairedExtension,
};
use super::config::{GatewayConfig, PairingSession, GATEWAY_PAIRING_MAX_ATTEMPTS};
use super::{hex_encode, now_ms};

#[derive(Debug)]
pub struct GatewayState {
    pub config: GatewayConfig,
    pub pairing: Option<PairingSession>,
    config_path: PathBuf,
    config_persistence: Arc<GatewayConfigPersistence>,
    /// In-memory grant stores per extension (not serialized).
    pub grant_stores: HashMap<String, GrantStore>,
}

#[derive(Debug, Default)]
struct GatewayConfigPersistence {
    next_revision: AtomicU64,
    writes: Mutex<GatewayConfigWriteState>,
}

#[derive(Debug, Default)]
struct GatewayConfigWriteState {
    latest_attempted_revision: u64,
}

#[derive(Debug)]
pub(crate) struct GatewayConfigSaveSnapshot {
    path: PathBuf,
    config: GatewayConfig,
    persistence: Arc<GatewayConfigPersistence>,
    revision: u64,
}

impl GatewayConfigSaveSnapshot {
    /// Persists this snapshot unless a newer snapshot has already attempted a
    /// write. The return value is `true` only when this exact snapshot reached
    /// the atomic writer.
    pub(crate) fn persist(self) -> Result<bool, String> {
        let mut writes = self
            .persistence
            .writes
            .lock()
            .map_err(|_| "Gateway config persistence mutex poisoned".to_string())?;
        if self.revision <= writes.latest_attempted_revision {
            return Ok(false);
        }

        // Advance this even when the filesystem write fails. An older queued
        // snapshot must never overwrite a newer security-sensitive mutation.
        writes.latest_attempted_revision = self.revision;
        crate::helpers::storage::write_json_pretty_atomic(&self.path, &self.config)?;
        Ok(true)
    }
}

impl GatewayState {
    pub fn load_or_default(config_path: PathBuf) -> Self {
        let mut config = match std::fs::read(&config_path) {
            Ok(bytes) => match serde_json::from_slice::<GatewayConfig>(&bytes) {
                Ok(config) => config,
                Err(error) => {
                    tracing::warn!(
                        "gateway: failed to parse config {}: {error}",
                        config_path.display()
                    );
                    GatewayConfig::default()
                }
            },
            Err(error) => {
                if error.kind() != std::io::ErrorKind::NotFound {
                    tracing::warn!(
                        "gateway: failed to read config {}: {error}",
                        config_path.display()
                    );
                }
                GatewayConfig::default()
            }
        };
        let legacy_key = config.gateway_privkey_hex.take();
        let mut migrated_legacy_key = false;
        config.gateway_privkey_hex = match load_gateway_key(&config_path) {
            Ok(Some(key)) => Some(key),
            Ok(None) => match legacy_key {
                Some(key) => match save_gateway_key(&config_path, &key) {
                    Ok(()) => {
                        migrated_legacy_key = true;
                        Some(key)
                    }
                    Err(error) => {
                        tracing::warn!(
                            "gateway: refused plaintext Noise key because keychain migration failed: {error}"
                        );
                        None
                    }
                },
                None => None,
            },
            Err(error) => {
                tracing::warn!("gateway: failed to load Noise key from keychain: {error}");
                None
            }
        };
        let state = Self {
            config,
            pairing: None,
            config_path,
            config_persistence: Arc::new(GatewayConfigPersistence::default()),
            grant_stores: HashMap::new(),
        };
        if migrated_legacy_key {
            state.save_config();
        }
        state
    }

    pub fn save_config(&self) {
        if let Err(error) = self.config_save_snapshot().persist() {
            tracing::warn!(
                "gateway: failed to save config {}: {error}",
                self.config_path.display()
            );
        }
    }

    pub(crate) fn config_save_snapshot(&self) -> GatewayConfigSaveSnapshot {
        let revision = self
            .config_persistence
            .next_revision
            .fetch_add(1, Ordering::Relaxed)
            .saturating_add(1);
        GatewayConfigSaveSnapshot {
            path: self.config_path.clone(),
            config: self.config.clone(),
            persistence: self.config_persistence.clone(),
            revision,
        }
    }

    pub fn start_pairing(&mut self, pairing_token: String, pin: String) -> PairingSession {
        self.start_pairing_for_actor(GatewayActorKind::BrowserExtension, pairing_token, pin)
    }

    pub fn start_pairing_for_actor(
        &mut self,
        actor_kind: GatewayActorKind,
        pairing_token: String,
        pin: String,
    ) -> PairingSession {
        let now = now_ms();
        let token_ttl = Duration::from_secs(5 * 60);
        let pin_ttl = Duration::from_secs(2 * 60);
        let mut ceremony_nonce = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut ceremony_nonce);
        let session = PairingSession {
            ceremony_nonce,
            actor_kind,
            pairing_token,
            pin,
            token_expires_at_ms: now.saturating_add(token_ttl.as_millis() as u64),
            pin_expires_at_ms: now.saturating_add(pin_ttl.as_millis() as u64),
            attempts_left: GATEWAY_PAIRING_MAX_ATTEMPTS,
            locked_until_ms: None,
        };
        self.pairing = Some(session.clone());
        session
    }

    pub fn cancel_pairing(&mut self) {
        self.pairing = None;
    }

    pub fn upsert_paired_extension(&mut self, id: String) {
        let now = now_ms();
        if let Some(existing) = self
            .config
            .paired_extensions
            .iter_mut()
            .find(|e| e.id == id)
        {
            existing.revoked = false;
            existing.last_active_ms = Some(now);
            return;
        }

        self.config.paired_extensions.push(PairedExtension {
            id,
            created_at_ms: now,
            last_active_ms: Some(now),
            revoked: false,
            label: None,
        });
    }

    pub fn upsert_paired_agent(&mut self, id: String) {
        let now = now_ms();
        if let Some(existing) = self
            .config
            .paired_agents
            .iter_mut()
            .find(|agent| agent.id == id)
        {
            existing.revoked = false;
            existing.last_active_ms = Some(now);
            return;
        }

        self.config.paired_agents.push(PairedAgent {
            id,
            created_at_ms: now,
            last_active_ms: Some(now),
            revoked: false,
            label: None,
        });
    }

    pub fn mark_extension_active(&mut self, id: &str) {
        let now = now_ms();
        if let Some(existing) = self
            .config
            .paired_extensions
            .iter_mut()
            .find(|e| e.id == id)
        {
            existing.last_active_ms = Some(now);
        }
    }

    pub fn mark_agent_active(&mut self, id: &str) {
        let now = now_ms();
        if let Some(existing) = self
            .config
            .paired_agents
            .iter_mut()
            .find(|agent| agent.id == id)
        {
            existing.last_active_ms = Some(now);
        }
    }

    pub fn revoke_extension(&mut self, id: &str) {
        if let Some(existing) = self
            .config
            .paired_extensions
            .iter_mut()
            .find(|e| e.id == id)
        {
            existing.revoked = true;
        }
    }

    pub fn revoke_agent(&mut self, id: &str) {
        if let Some(existing) = self
            .config
            .paired_agents
            .iter_mut()
            .find(|agent| agent.id == id)
        {
            existing.revoked = true;
        }
    }

    /// Revokes an agent in memory first, then persists the mutation while the
    /// caller holds the `GatewayState` lock. A write failure intentionally
    /// leaves the in-memory identity revoked (fail closed) and is returned to
    /// the caller, so it cannot be reported as a successful durable revoke.
    ///
    /// This performs filesystem IO and must run on a blocking-IO worker.
    pub(crate) fn revoke_agent_persisted(&mut self, id: &str) -> Result<Vec<PairedAgent>, String> {
        self.revoke_agent(id);
        if !self.config_save_snapshot().persist()? {
            return Err("Gateway agent revocation snapshot was superseded".to_string());
        }
        Ok(self.config.paired_agents.clone())
    }

    pub fn set_session_max_duration(&mut self, mins: u32) -> u32 {
        self.config.session_max_duration_mins = mins.clamp(15, 240);
        self.save_config();
        self.config.session_max_duration_mins
    }

    pub fn is_paired_and_active(&self, id: &str) -> bool {
        self.config
            .paired_extensions
            .iter()
            .any(|e| e.id == id && !e.revoked)
    }

    pub fn is_agent_paired_and_active(&self, id: &str) -> bool {
        self.config
            .paired_agents
            .iter()
            .any(|agent| agent.id == id && !agent.revoked)
    }

    // ---- Capability policy methods ----

    /// Get the policy for an extension, or create a default one.
    pub fn get_or_create_policy(&mut self, extension_id: &str) -> CapabilityPolicy {
        if let Some(p) = self
            .config
            .capability_policies
            .iter()
            .find(|p| p.extension_id == extension_id)
        {
            return p.clone();
        }
        let policy = CapabilityPolicy::default_for(extension_id.to_string());
        self.config.capability_policies.push(policy.clone());
        self.save_config();
        policy
    }

    /// Set (upsert) the policy for an extension.
    pub fn set_policy(&mut self, policy: CapabilityPolicy) {
        if let Some(existing) = self
            .config
            .capability_policies
            .iter_mut()
            .find(|p| p.extension_id == policy.extension_id)
        {
            *existing = policy;
        } else {
            self.config.capability_policies.push(policy);
        }
        self.save_config();
    }

    /// Get or create a mutable reference to the grant store for an extension.
    pub fn grant_store_mut(&mut self, extension_id: &str) -> &mut GrantStore {
        self.grant_stores
            .entry(extension_id.to_string())
            .or_default()
    }

    /// Revoke all grants for all extensions (used on vault lock).
    pub fn revoke_all_grants(&mut self) {
        for store in self.grant_stores.values_mut() {
            store.revoke_all();
        }
    }

    /// Store the gateway's Noise keypair if not already set.
    /// Called after the first successful pairing to enable IK reconnects.
    pub fn ensure_gateway_keypair(&mut self, keypair: &snow::Keypair) {
        if self.config.gateway_privkey_hex.is_none() {
            self.config.gateway_privkey_hex = Some(hex_encode(&keypair.private));
        }
    }

    pub fn persist_gateway_keypair(&mut self, keypair: &snow::Keypair) -> Result<(), String> {
        if self.config.gateway_privkey_hex.is_some() {
            return Ok(());
        }
        let encoded = hex_encode(&keypair.private);
        save_gateway_key(&self.config_path, &encoded)?;
        self.config.gateway_privkey_hex = Some(encoded);
        Ok(())
    }
}

#[cfg(not(test))]
fn gateway_key_account(config_path: &std::path::Path) -> String {
    use sha2::{Digest as _, Sha256};

    let mut hasher = Sha256::new();
    hasher.update(b"chromvoid:gateway-noise-key:v1:");
    hasher.update(config_path.to_string_lossy().as_bytes());
    format!("{:x}", hasher.finalize())
}

#[cfg(not(test))]
fn gateway_key_entry(config_path: &std::path::Path) -> Result<keyring::Entry, String> {
    keyring::Entry::new(
        "com.chromvoid.gateway.noise",
        &gateway_key_account(config_path),
    )
    .map_err(|error| format!("create keychain entry: {error}"))
}

#[cfg(not(test))]
fn load_gateway_key(config_path: &std::path::Path) -> Result<Option<String>, String> {
    match gateway_key_entry(config_path)?.get_password() {
        Ok(value) if value.len() == 64 => Ok(Some(value)),
        Ok(_) => Err("stored Noise key has invalid length".to_string()),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("read keychain entry: {error}")),
    }
}

#[cfg(not(test))]
fn save_gateway_key(config_path: &std::path::Path, value: &str) -> Result<(), String> {
    if value.len() != 64 {
        return Err("Noise key has invalid length".to_string());
    }
    gateway_key_entry(config_path)?
        .set_password(value)
        .map_err(|error| format!("write keychain entry: {error}"))
}

#[cfg(test)]
fn load_gateway_key(_config_path: &std::path::Path) -> Result<Option<String>, String> {
    Ok(None)
}

#[cfg(test)]
fn save_gateway_key(_config_path: &std::path::Path, _value: &str) -> Result<(), String> {
    Ok(())
}
