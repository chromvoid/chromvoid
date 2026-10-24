use super::*;
use chromvoid_core::crypto::keystore::Keystore;
use chromvoid_network_runtime::ios_host::configuration::IosHostConfiguration;
use chromvoid_network_runtime::local_identity::{LocalDeviceIdentity, LocalDeviceIdentityStore};
use chromvoid_network_runtime::paired_peers::{PairedPeerStore, PeerStoreKeyProvider};
use std::path::PathBuf;

#[derive(Clone)]
pub(in crate::session) struct HostStorage {
    root: PathBuf,
    key_provider: PeerStoreKeyProvider,
}

impl HostStorage {
    /// Caller holds the session's host gate and has retired all existing controllers.
    pub(super) fn erase(root: &std::path::Path) -> Result<(), String> {
        let mut failed = chromvoid_network_runtime::paired_store_crypto::erase_store(
            &root.join("paired_network_peers.json"),
        )
        .is_err();
        for name in ["network_local_identity.json", "ios_host_mode.json"] {
            if let Err(error) = std::fs::remove_file(root.join(name)) {
                failed |= error.kind() != std::io::ErrorKind::NotFound;
            }
        }
        failed |= chromvoid_core::storage::atomic_file::remove_temporary_files(root).is_err();
        failed |= std::fs::File::open(root)
            .and_then(|directory| directory.sync_all())
            .is_err();
        if failed {
            Err("Host metadata cleanup did not finish".into())
        } else {
            Ok(())
        }
    }
    pub(super) fn configuration(&self) -> IosHostConfiguration {
        IosHostConfiguration::load(&self.root.join("ios_host_mode.json"))
    }
    pub(in crate::session) fn new(root: PathBuf, keystore: Arc<dyn Keystore>) -> Self {
        Self {
            root,
            key_provider: Arc::new(move |_| {
                chromvoid_network_runtime::paired_store_crypto::load_storage_key(keystore.as_ref())
            }),
        }
    }

    pub(super) fn peers(&self) -> Result<PairedPeerStore, String> {
        let store = PairedPeerStore::load(
            &self.root.join("paired_network_peers.json"),
            self.key_provider.clone(),
        );
        if store.load_error().is_some() {
            return Err("Trusted devices could not be read".into());
        }
        Ok(store)
    }

    pub(super) fn identity(&self, label: &str) -> Result<LocalDeviceIdentity, String> {
        // Pairing cannot finish without the established device key; fail before publishing an offer.
        let _key = zeroize::Zeroizing::new((self.key_provider)(&self.root)?);
        let path = self.root.join("network_local_identity.json");
        let mut store = LocalDeviceIdentityStore::load(&path);
        if path.exists() && store.get().is_none() {
            return Err("Host identity could not be read".into());
        }
        store.get_or_create(label)
    }

    pub(super) fn enabled(&self, relay_url: Option<&str>, enabled: bool) -> Result<(), String> {
        IosHostConfiguration::update(&self.root.join("ios_host_mode.json"), relay_url, enabled)
    }
}

impl HostInner {
    pub(super) async fn persist_enabled(
        self: &Arc<Self>,
        operation: u64,
        relay_url: Option<String>,
        enabled: bool,
    ) -> Result<(), String> {
        let inner = self.clone();
        tokio::task::spawn_blocking(move || {
            let _gate = inner.gate.lock().map_err(|_| "Host unavailable")?;
            inner.require_live()?;
            if !inner.host.is_responder_generation_current(operation) {
                return Err("Host operation canceled".into());
            }
            inner.storage.enabled(relay_url.as_deref(), enabled)
        })
        .await
        .map_err(|_| "Host storage task unavailable")?
    }
}
