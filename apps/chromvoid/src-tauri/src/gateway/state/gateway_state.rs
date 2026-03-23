use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

use super::super::types::{CapabilityPolicy, GrantStore, PairedExtension};
use super::config::{GatewayConfig, PairingSession};
use super::{hex_encode, now_ms};

#[derive(Debug)]
pub struct GatewayState {
    pub config: GatewayConfig,
    pub pairing: Option<PairingSession>,
    config_path: PathBuf,
    /// In-memory grant stores per extension (not serialized).
    pub grant_stores: HashMap<String, GrantStore>,
}

impl GatewayState {
    pub fn load_or_default(config_path: PathBuf) -> Self {
        let config = match std::fs::read(&config_path) {
            Ok(bytes) => serde_json::from_slice::<GatewayConfig>(&bytes).unwrap_or_default(),
            Err(_) => GatewayConfig::default(),
        };
        Self {
            config,
            pairing: None,
            config_path,
            grant_stores: HashMap::new(),
        }
    }

    pub fn save_config(&self) {
        let Ok(json) = serde_json::to_vec_pretty(&self.config) else {
            return;
        };
        let _ = std::fs::write(&self.config_path, json);
    }

    pub fn start_pairing(&mut self, pairing_token: String, pin: String) -> PairingSession {
        let now = now_ms();
        let token_ttl = Duration::from_secs(5 * 60);
        let pin_ttl = Duration::from_secs(2 * 60);
        let session = PairingSession {
            pairing_token,
            pin,
            token_expires_at_ms: now.saturating_add(token_ttl.as_millis() as u64),
            pin_expires_at_ms: now.saturating_add(pin_ttl.as_millis() as u64),
            attempts_left: 5,
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
}
