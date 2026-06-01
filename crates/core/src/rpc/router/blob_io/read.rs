use crate::rpc::commands::is_system_node;
use crate::storage::Storage;
use crate::vault::VaultSession;

use super::error::BlobIoError;

pub(in crate::rpc::router) fn read_single_blob(
    session: &VaultSession,
    storage: &Storage,
    node_id: u64,
) -> Result<Vec<u8>, BlobIoError> {
    if is_system_node(session, node_id) {
        return Err(BlobIoError::AccessDenied);
    }

    let node = session
        .catalog()
        .find_by_id(node_id)
        .ok_or(BlobIoError::NodeNotFound)?;
    if !node.is_file() {
        return Err(BlobIoError::NotFile);
    }

    let vault_key = session.vault_key();
    let node_id32 = u32::try_from(node_id).map_err(|_| BlobIoError::InvalidNodeId)?;
    let chunk_name = crate::crypto::blob_chunk_name(vault_key, node_id32, 0);

    let encrypted = storage
        .read_chunk(&chunk_name)
        .map_err(|error| BlobIoError::Storage(format!("Failed to read chunk: {error}")))?;

    crate::crypto::decrypt(&encrypted, vault_key, chunk_name.as_bytes())
        .map_err(|error| BlobIoError::Crypto(format!("Decryption failed: {error}")))
}
