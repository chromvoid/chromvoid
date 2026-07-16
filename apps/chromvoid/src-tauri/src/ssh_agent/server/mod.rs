#[cfg(unix)]
mod connection;
#[cfg(unix)]
mod listener;
#[cfg(not(unix))]
mod listener_stub;
mod models;
#[cfg(unix)]
mod upstream;

#[cfg(unix)]
pub use listener::{bind_agent_listener, remove_socket_if_matches, run_agent, SocketFileIdentity};
#[cfg(not(unix))]
pub use listener_stub::{
    bind_agent_listener, remove_socket_if_matches, run_agent, SocketFileIdentity,
};
pub use models::{
    emit_sign_request_expired, AgentShared, ApprovalEmitterHandle, Identity, PrivateKeyPem,
    ReadPrivateKeyFuture, TauriApprovalEventEmitter,
};
#[cfg(test)]
pub use models::{ApprovalEventEmitter, SignApprovalEventPayload, SignApprovalExpiredEventPayload};

use crate::ssh_agent::signing::public_key_material_from_openssh;
use crate::ssh_agent::SshAgentEntry;
use tracing::warn;

pub fn load_identities(entries: &[SshAgentEntry]) -> Vec<Identity> {
    let mut identities = Vec::new();
    for entry in entries {
        match public_key_material_from_openssh(&entry.public_key_openssh) {
            Ok(material) => {
                identities.push(Identity {
                    key_blob: material.key_blob,
                    comment: entry.comment.clone(),
                    fingerprint: material.fingerprint,
                    key_id: entry.key_id.clone(),
                });
            }
            Err(e) => {
                warn!(
                    "ssh-agent: failed to parse public key {}: {e}",
                    entry.key_id
                );
            }
        }
    }
    identities
}
