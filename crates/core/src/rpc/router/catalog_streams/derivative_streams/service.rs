use std::io::Read;

use serde_json::Value;

use crate::rpc::commands::is_system_path_guarded;
use crate::rpc::derivative_index;
use crate::rpc::stream::{RpcInputStream, RpcOutputStream, RpcStreamMeta};
use crate::vault::VaultSession;

use super::super::super::blob_reader::DerivativeBlobReader;
use super::super::super::derivative_store::{DerivativeStore, DerivativeWriteSnapshot};
use super::super::super::state::RpcRouter;
use super::error::{DerivativeCommandError, DerivativeResult};
use super::request::{DerivativeReadRequest, DerivativeWriteRequest};

pub(super) fn write_derivative(
    router: &mut RpcRouter,
    data: &Value,
    stream: Option<RpcInputStream>,
) -> DerivativeResult<()> {
    let session = router
        .session
        .as_mut()
        .ok_or_else(DerivativeCommandError::vault_required)?;
    let request = DerivativeWriteRequest::parse(data)?;
    validate_derivative_target(session, request.node_id)?;

    let stream = stream.ok_or_else(DerivativeCommandError::no_stream)?;
    let mut reader = stream.into_reader();
    let mut content = Vec::new();
    if let Err(error) = reader.read_to_end(&mut content) {
        return Err(DerivativeCommandError::internal(format!(
            "Failed to read stream: {error}"
        )));
    }
    if content.len() as u64 != request.expected_size {
        return Err(DerivativeCommandError::internal("Size mismatch"));
    }

    let vault_key = *session.vault_key();
    let snapshot = DerivativeWriteSnapshot {
        storage: router.storage.clone(),
        vault_key,
        node_id: request.node_id,
        source_version: request.source_version,
        tier: request.tier,
        version: request.version,
        size: request.expected_size,
        name: request.name,
        mime_type: request.mime_type,
        file_extension: request.file_extension,
        chunk_size: request.chunk_size,
    };

    let write_result = DerivativeStore::write_chunks(&snapshot, &content, || false)
        .map_err(|error| DerivativeCommandError::internal(error.message))?;
    DerivativeStore::commit_write(&snapshot, &write_result)
        .map_err(|error| DerivativeCommandError::internal(error.message))?;

    Ok(())
}

pub(super) fn read_derivative(
    router: &mut RpcRouter,
    data: &Value,
) -> DerivativeResult<RpcOutputStream> {
    let session = router
        .session
        .as_ref()
        .ok_or_else(DerivativeCommandError::vault_required)?;
    let request = DerivativeReadRequest::parse(data)?;
    validate_derivative_target(session, request.node_id)?;

    let validated = match DerivativeStore::read_validated(
        &router.storage,
        session.vault_key(),
        request.node_id,
        request.source_version,
        &request.tier,
        request.version,
    ) {
        Ok(Some(validated)) => validated,
        Ok(None) => return Err(DerivativeCommandError::derivative_not_found()),
        Err(error) => {
            return Err(DerivativeCommandError::internal(format!(
                "Derivative index read failed: {error}"
            )));
        }
    };

    let _ = derivative_index::touch_derivative_entry(
        &router.storage,
        session.vault_key(),
        validated.entry.node_id,
        validated.entry.source_revision,
        &validated.entry.tier,
        validated.entry.storage_version,
    );

    Ok(RpcOutputStream {
        meta: RpcStreamMeta {
            name: validated.meta.name,
            mime_type: validated.meta.mime_type,
            size: validated.meta.size,
            chunk_size: validated.meta.chunk_size,
        },
        reader: Box::new(DerivativeBlobReader::new(
            router.storage.clone(),
            session.vault_key(),
            validated.entry.node_id,
            validated.entry.source_revision,
            validated.entry.tier,
            validated.entry.storage_version,
        )),
    })
}

fn validate_derivative_target(session: &VaultSession, node_id: u64) -> DerivativeResult<()> {
    if let Some(path) = session.catalog().get_path(node_id) {
        if is_system_path_guarded(&path) {
            return Err(DerivativeCommandError::access_denied());
        }
    }

    let Some(node) = session.catalog().find_by_id(node_id) else {
        return Err(DerivativeCommandError::node_not_found());
    };
    if !node.is_file() {
        return Err(DerivativeCommandError::not_file_internal());
    }

    Ok(())
}
