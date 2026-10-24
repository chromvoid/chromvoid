//! Platform construction for the shared trusted-peer owner.

use std::ops::{Deref, DerefMut};
use std::path::Path;
use std::sync::Arc;

pub use chromvoid_network_runtime::paired_peers::PairedPeer;
use chromvoid_network_runtime::paired_peers::PairedPeerStore as SharedPeerStore;

pub struct PairedPeerStore(SharedPeerStore);

impl PairedPeerStore {
    pub fn load(path: &Path) -> Self {
        Self(SharedPeerStore::load(
            path,
            Arc::new(crate::paired_store_crypto::paired_store_key),
        ))
    }
}

impl Deref for PairedPeerStore {
    type Target = SharedPeerStore;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
impl DerefMut for PairedPeerStore {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

#[cfg(test)]
#[path = "paired_peers_tests.rs"]
mod tests;
