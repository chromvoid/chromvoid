//! RpcRouter state — struct definition, constructors, builders, and utility helpers

use crate::crypto::keystore::Keystore;
use crate::error::ErrorCode;
use crate::license::LicenseStore;
use crate::storage::Storage;
use crate::vault::VaultSession;
use crate::wallet::{WalletProvider, WalletRuntimeConfig};
use std::sync::{Arc, Mutex};

use super::credential_provider::runtime::CredentialProviderRuntime;
use super::events::RouterEventQueue;
use super::passmanager::otp_target::PassmanagerOtpTargetCache;
use super::session_lifecycle::{LongRunningSessionTtls, LongRunningSessions};
use super::storage_gc::StorageGcScanRegistry;
use crate::rpc::types::RpcResponse;

#[derive(Debug, Clone)]
pub(super) struct EraseTokenState {
    pub(super) token: String,
    pub(super) expires_at: std::time::SystemTime,
}

/// RPC Router state
pub struct RpcRouter {
    /// Storage backend
    pub(super) storage: Storage,
    /// Active vault session (if unlocked)
    pub(super) session: Option<VaultSession>,
    /// Master key for admin operations
    pub(super) master_key: Option<String>,

    /// Platform keystore for device-local secrets (portable pepper, etc.)
    pub(super) keystore: Option<Arc<dyn Keystore>>,
    pub(super) license_store: Option<LicenseStore>,

    pub(super) erase_token: Option<EraseTokenState>,

    pub(super) long_running_sessions: LongRunningSessions,

    pub(super) event_queue: RouterEventQueue,

    pub(super) credential_provider_runtime: CredentialProviderRuntime,

    pub(super) wallet_runtime_config: WalletRuntimeConfig,
    pub(super) wallet_provider: Option<Arc<dyn WalletProvider>>,

    pub(super) passmanager_otp_target_cache: Mutex<PassmanagerOtpTargetCache>,

    pub(super) storage_gc_scan_registry: StorageGcScanRegistry,
}

impl RpcRouter {
    /// Create a new router with the given storage
    pub fn new(storage: Storage) -> Self {
        Self {
            storage,
            session: None,
            master_key: None,
            keystore: None,
            license_store: None,
            erase_token: None,
            long_running_sessions: LongRunningSessions::default(),
            event_queue: RouterEventQueue::default(),
            credential_provider_runtime: CredentialProviderRuntime::default(),
            wallet_runtime_config: WalletRuntimeConfig::default(),
            wallet_provider: None,
            passmanager_otp_target_cache: Mutex::new(PassmanagerOtpTargetCache::default()),
            storage_gc_scan_registry: StorageGcScanRegistry::default(),
        }
    }

    pub fn with_backup_local_max_size(mut self, max_size: u64) -> Self {
        self.long_running_sessions.backup_local_max_size = Some(max_size);
        self
    }

    pub fn with_backup_local_idle_ttl_ms(mut self, ttl_ms: u64) -> Self {
        self.long_running_sessions.ttls.backup_local_ms = ttl_ms;
        self
    }

    pub fn with_long_running_session_idle_ttl_ms(mut self, ttl_ms: u64) -> Self {
        self.long_running_sessions.ttls = LongRunningSessionTtls {
            backup_local_ms: ttl_ms,
            restore_local_ms: ttl_ms,
            vault_export_ms: ttl_ms,
        };
        self
    }

    pub fn with_storage_gc_scan_idle_ttl_ms(mut self, ttl_ms: u64) -> Self {
        self.storage_gc_scan_registry.set_idle_ttl_ms(ttl_ms);
        self
    }

    pub fn take_events(&mut self) -> Vec<serde_json::Value> {
        self.event_queue.take_events()
    }

    pub fn with_keystore(mut self, keystore: Arc<dyn Keystore>) -> Self {
        self.keystore = Some(keystore);
        self
    }

    pub fn with_license_store(mut self, license_store: LicenseStore) -> Self {
        self.license_store = Some(license_store);
        self
    }

    pub fn with_master_key(mut self, master_key: impl Into<String>) -> Self {
        self.master_key = Some(master_key.into());
        self
    }

    pub fn with_wallet_runtime_config(mut self, config: WalletRuntimeConfig) -> Self {
        self.wallet_runtime_config = config;
        self
    }

    pub fn with_wallet_provider(mut self, provider: Arc<dyn WalletProvider>) -> Self {
        self.wallet_provider = Some(provider);
        self
    }

    pub fn set_master_key(&mut self, master_key: Option<String>) {
        self.master_key = master_key;
    }

    /// Check if vault is unlocked
    pub fn is_unlocked(&self) -> bool {
        self.session.is_some()
    }

    /// Get the current session (if unlocked)
    pub fn session(&self) -> Option<&VaultSession> {
        self.session.as_ref()
    }

    /// Execute a handler that requires an active session (read-only)
    pub(super) fn with_session<F>(&self, f: F) -> RpcResponse
    where
        F: FnOnce(&VaultSession) -> RpcResponse,
    {
        match &self.session {
            Some(session) => f(session),
            None => RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultRequired)),
        }
    }

    /// Execute a handler that requires an active session (mutable)
    pub(super) fn with_session_mut<F>(&mut self, f: F) -> RpcResponse
    where
        F: FnOnce(&mut VaultSession) -> RpcResponse,
    {
        match &mut self.session {
            Some(session) => f(session),
            None => RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultRequired)),
        }
    }

    /// Execute a catalog mutation and make command success mean durable catalog persistence.
    pub(super) fn commit_catalog_mutation<F>(&mut self, f: F) -> RpcResponse
    where
        F: FnOnce(&mut VaultSession) -> RpcResponse,
    {
        self.commit_catalog_mutation_with_output(|session| (f(session), ()), |_, _, _| {})
    }

    pub(super) fn commit_catalog_mutation_with_output<F, T, P>(
        &mut self,
        f: F,
        post_commit: P,
    ) -> RpcResponse
    where
        F: FnOnce(&mut VaultSession) -> (RpcResponse, T),
        P: FnOnce(&mut VaultSession, &Storage, T),
    {
        let Some(session) = self.session.as_mut() else {
            return RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultRequired));
        };
        let snapshot = session.snapshot_persistence_state();
        let (response, output) = f(session);
        if !response.is_ok() {
            return response;
        }

        if let Err(error) = self.save() {
            if let Some(session) = self.session.as_mut() {
                let (catalog, dirty, pending_deltas) = snapshot;
                session.restore_persistence_state(catalog, dirty, pending_deltas);
            }
            return RpcResponse::error(
                format!("Catalog save failed: {error}"),
                Some(ErrorCode::InternalError),
            );
        }

        if let Some(session) = self.session.as_mut() {
            post_commit(session, &self.storage, output);
        }

        response
    }

    /// Save current session (if any)
    pub fn save(&mut self) -> crate::error::Result<()> {
        if let Some(session) = &mut self.session {
            let persisted = session.save(&self.storage)?;
            self.event_queue.enqueue_catalog_events(persisted);
        }
        Ok(())
    }

    #[cfg(test)]
    pub fn session_mut(&mut self) -> Option<&mut VaultSession> {
        self.session.as_mut()
    }

    #[cfg(test)]
    pub fn storage(&self) -> &Storage {
        &self.storage
    }
}
