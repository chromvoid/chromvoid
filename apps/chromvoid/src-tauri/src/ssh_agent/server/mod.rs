mod connection;
mod listener;
mod models;
mod upstream;

pub use listener::run_agent;
pub use models::{AgentShared, Identity};

use crate::ssh_agent::signing::public_key_blob_from_openssh;
use tracing::warn;

pub fn load_identities(entries: &[(String, String, String, String)]) -> Vec<Identity> {
    let mut identities = Vec::new();
    for (entry_id, public_key_openssh, comment, fingerprint) in entries {
        match public_key_blob_from_openssh(public_key_openssh) {
            Ok(blob) => {
                identities.push(Identity {
                    key_blob: blob,
                    comment: comment.clone(),
                    fingerprint: fingerprint.clone(),
                    entry_id: entry_id.clone(),
                });
            }
            Err(e) => {
                warn!("ssh-agent: failed to parse public key for entry {entry_id}: {e}");
            }
        }
    }
    identities
}
