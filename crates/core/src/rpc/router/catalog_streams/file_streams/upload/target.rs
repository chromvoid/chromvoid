use crate::durable_tx::DurableTxPhase;
use crate::error::Error;
use crate::rpc::commands::{is_system_path_guarded, normalize_path};

use super::super::super::super::state::RpcRouter;
use super::context::{require_session, require_session_mut, UploadVaultContext};
use super::error::{UploadCommandError, UploadResult};
use super::request::UploadRequest;
use super::tx::{
    read_pending_upload_transaction, write_upload_marker, UploadSessionTransaction,
    UPLOAD_TX_VERSION,
};

pub(super) enum UploadTarget {
    Pending(UploadSessionTransaction),
    Existing {
        node_id: u64,
        total_size: Option<u64>,
        mime_type: Option<String>,
    },
    New {
        node_id: u64,
        parent_path: String,
        name: String,
        total_size: Option<u64>,
        mime_type: Option<String>,
        chunk_size: Option<u32>,
    },
}

pub(super) fn resolve_upload_target(
    router: &mut RpcRouter,
    context: &UploadVaultContext,
    request: &UploadRequest,
) -> UploadResult<UploadTarget> {
    let pending = read_pending_upload_transaction(router, context)?;
    let session = require_session_mut(router)?;

    if let Some(node_id) = request.node_id {
        if let Some(transaction) = pending {
            if transaction.node_id != node_id {
                return Err(UploadCommandError::internal(
                    "Another upload session is active",
                ));
            }
            return Ok(UploadTarget::Pending(transaction));
        }

        let Some(node) = session.catalog().find_by_id(node_id) else {
            return Err(UploadCommandError::node_not_found("Node not found"));
        };
        if !node.is_file() {
            return Err(UploadCommandError::internal("Node is not a file"));
        }
        if let Some(path) = session.catalog().get_path(node_id) {
            if is_system_path_guarded(&path) {
                return Err(UploadCommandError::access_denied());
            }
        }
        return Ok(UploadTarget::Existing {
            node_id,
            total_size: request.total_size,
            mime_type: request.mime_type.clone(),
        });
    }

    let name = request.required_name()?.to_string();
    let parent_path = request
        .parent_path
        .clone()
        .unwrap_or_else(|| "/".to_string());
    if is_system_path_guarded(&parent_path) {
        return Err(UploadCommandError::access_denied());
    }
    if pending.is_some() {
        return Err(UploadCommandError::internal(
            "Another upload session is active",
        ));
    }

    let full_path = normalize_path(&format!(
        "{}/{}",
        if parent_path == "/" { "" } else { &parent_path },
        name
    ));
    if let Some(existing) = session.catalog().find_by_path(&full_path) {
        if !existing.is_file() {
            return Err(UploadCommandError::name_exists(
                Error::NameExists(name).to_string(),
            ));
        }
        return Ok(UploadTarget::Existing {
            node_id: existing.node_id,
            total_size: request.total_size,
            mime_type: request.mime_type.clone(),
        });
    }

    let Some(parent) = session.catalog().find_by_path(&parent_path) else {
        return Err(UploadCommandError::node_not_found(
            Error::InvalidPath(parent_path).to_string(),
        ));
    };
    if !parent.is_dir() {
        return Err(UploadCommandError::not_a_dir(
            Error::NotADirectory(parent.node_id).to_string(),
        ));
    }
    let node_id = session.catalog_mut().reserve_node_id();
    Ok(UploadTarget::New {
        node_id,
        parent_path,
        name,
        total_size: request.total_size,
        mime_type: request.mime_type.clone(),
        chunk_size: request.chunk_size,
    })
}

pub(super) fn begin_existing_upload_transaction(
    router: &mut RpcRouter,
    context: &UploadVaultContext,
    node_id: u64,
    requested_total_size: Option<u64>,
    requested_mime_type: Option<String>,
) -> UploadResult<UploadSessionTransaction> {
    let session = require_session(router)?;
    let node = session
        .catalog()
        .find_by_id(node_id)
        .ok_or_else(|| UploadCommandError::node_not_found("Node not found"))?;
    let path = session.catalog().get_path(node_id).unwrap_or_default();
    let (parent_path, name) = split_catalog_path(&path);
    let chunk_size = if node.chunk_size == 0 {
        crate::types::DEFAULT_CHUNK_SIZE
    } else {
        node.chunk_size
    };
    let total_size = requested_total_size.or(Some(node.size));
    let transaction = UploadSessionTransaction {
        version: UPLOAD_TX_VERSION,
        node_id,
        parent_path,
        name,
        mime_type: requested_mime_type.or_else(|| node.mime_type.clone()),
        chunk_size,
        total_size,
        uploaded_bytes: 0,
        is_new: false,
        old_size: Some(node.size),
        old_modtime: Some(node.modtime),
        old_source_revision: Some(node.source_revision),
        old_media_info: node.media_info.clone(),
        old_media_inspected_revision: Some(node.media_inspected_revision),
        temp_chunks: Vec::new(),
        backups: Vec::new(),
        stale_tail_names: Vec::new(),
        new_modtime: None,
        new_source_revision: None,
    };
    write_upload_marker(router, context, &transaction, DurableTxPhase::Staging)?;
    Ok(transaction)
}

pub(super) fn begin_new_upload_transaction(
    router: &mut RpcRouter,
    context: &UploadVaultContext,
    node_id: u64,
    parent_path: String,
    name: String,
    total_size: Option<u64>,
    mime_type: Option<String>,
    chunk_size: Option<u32>,
) -> UploadResult<UploadSessionTransaction> {
    let chunk_size = chunk_size.unwrap_or(crate::types::DEFAULT_CHUNK_SIZE);
    if chunk_size == 0 {
        return Err(UploadCommandError::internal("Invalid chunk size"));
    }
    let transaction = UploadSessionTransaction {
        version: UPLOAD_TX_VERSION,
        node_id,
        parent_path,
        name,
        mime_type,
        chunk_size,
        total_size,
        uploaded_bytes: 0,
        is_new: true,
        old_size: None,
        old_modtime: None,
        old_source_revision: None,
        old_media_info: None,
        old_media_inspected_revision: None,
        temp_chunks: Vec::new(),
        backups: Vec::new(),
        stale_tail_names: Vec::new(),
        new_modtime: None,
        new_source_revision: None,
    };
    write_upload_marker(router, context, &transaction, DurableTxPhase::Staging)?;
    Ok(transaction)
}

fn split_catalog_path(path: &str) -> (String, String) {
    let normalized = normalize_path(path);
    if normalized == "/" {
        return ("/".to_string(), String::new());
    }
    let trimmed = normalized.trim_end_matches('/');
    match trimmed.rsplit_once('/') {
        Some(("", name)) => ("/".to_string(), name.to_string()),
        Some((parent, name)) => (parent.to_string(), name.to_string()),
        None => ("/".to_string(), trimmed.to_string()),
    }
}
