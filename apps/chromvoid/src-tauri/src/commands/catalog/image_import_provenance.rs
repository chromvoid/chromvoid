use std::io::Read;
use std::sync::{Arc, Mutex};

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::RpcReply;
#[cfg(any(target_os = "android", test))]
use chromvoid_core::rpc::{RpcInputStream, RpcStreamMeta};
use serde::{Deserialize, Serialize};

use crate::types::StreamOut;

type CatalogDerivativeError = (String, Option<String>);

const IMAGE_IMPORT_PROVENANCE_TIER: &str = "image-import-provenance";
const IMAGE_IMPORT_PROVENANCE_VERSION: u32 = 1;
#[cfg(any(target_os = "android", test))]
const IMAGE_IMPORT_PROVENANCE_MIME: &str = "application/vnd.chromvoid.image-import-provenance+json";
#[cfg(any(target_os = "android", test))]
const IMAGE_IMPORT_PROVENANCE_CHUNK_SIZE: u32 = 64 * 1024;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CatalogImageImportProvenance {
    pub(crate) source_revision: u64,
    pub(crate) platform: String,
    pub(crate) image_candidate: bool,
    pub(crate) permission_status: String,
    pub(crate) require_original_status: String,
    pub(crate) original_stream_used: bool,
    pub(crate) regular_stream_fallback: bool,
    pub(crate) uri_scheme: Option<String>,
    pub(crate) uri_authority: Option<String>,
    pub(crate) captured_at_ms: Option<u64>,
}

#[cfg(any(target_os = "android", test))]
pub(crate) fn persist_image_import_provenance(
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    node_id: u64,
    source_revision: u64,
    provenance: &CatalogImageImportProvenance,
) -> Result<(), CatalogDerivativeError> {
    let bytes = serde_json::to_vec(provenance).map_err(|error| {
        (
            format!("Failed to serialize image import provenance: {error}"),
            Some("INTERNAL".to_string()),
        )
    })?;
    let stream = StreamOut {
        meta: RpcStreamMeta {
            name: "image-import-provenance.json".to_string(),
            mime_type: IMAGE_IMPORT_PROVENANCE_MIME.to_string(),
            size: bytes.len() as u64,
            chunk_size: IMAGE_IMPORT_PROVENANCE_CHUNK_SIZE,
        },
        bytes,
    };

    let reply = {
        let mut adapter = adapter.lock().map_err(|_| {
            (
                "Adapter mutex poisoned".to_string(),
                Some("INTERNAL".to_string()),
            )
        })?;
        let req = RpcRequest::new(
            "catalog:derivative:write".to_string(),
            serde_json::json!({
                "node_id": node_id,
                "source_version": source_revision,
                "tier": IMAGE_IMPORT_PROVENANCE_TIER,
                "version": IMAGE_IMPORT_PROVENANCE_VERSION,
                "size": stream.bytes.len() as u64,
                "name": stream.meta.name,
                "mime_type": stream.meta.mime_type,
                "file_extension": "json",
                "chunk_size": stream.meta.chunk_size.max(1),
            }),
        );
        let reply =
            adapter.handle_with_stream(&req, Some(RpcInputStream::from_bytes(stream.bytes)));
        let _ = adapter.save();
        reply
    };

    match reply {
        RpcReply::Json(RpcResponse::Success { .. }) => Ok(()),
        RpcReply::Json(RpcResponse::Error { error, code, .. }) => Err((error, code)),
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => Err((
            "Unexpected stream reply".to_string(),
            Some("INTERNAL".to_string()),
        )),
    }
}

pub(crate) fn load_image_import_provenance(
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    node_id: u64,
    source_revision: u64,
) -> Result<Option<CatalogImageImportProvenance>, CatalogDerivativeError> {
    let reply = {
        let mut adapter = adapter.lock().map_err(|_| {
            (
                "Adapter mutex poisoned".to_string(),
                Some("INTERNAL".to_string()),
            )
        })?;
        let req = RpcRequest::new(
            "catalog:derivative:read".to_string(),
            serde_json::json!({
                "node_id": node_id,
                "source_version": source_revision,
                "tier": IMAGE_IMPORT_PROVENANCE_TIER,
                "version": IMAGE_IMPORT_PROVENANCE_VERSION,
            }),
        );
        adapter.handle_with_stream(&req, None)
    };

    let stream = match stream_out_from_reply(reply) {
        Ok(stream) => stream,
        Err((_, code)) if code.as_deref() == Some("NODE_NOT_FOUND") => return Ok(None),
        Err(error) => return Err(error),
    };
    let provenance = serde_json::from_slice::<CatalogImageImportProvenance>(&stream.bytes)
        .map_err(|error| {
            (
                format!("Invalid image import provenance response: {error}"),
                Some("INTERNAL".to_string()),
            )
        })?;
    if provenance.source_revision != source_revision {
        tracing::warn!(
            "image_import_provenance stale_payload node_id={} expected_source_revision={} payload_source_revision={}",
            node_id,
            source_revision,
            provenance.source_revision,
        );
        return Ok(None);
    }

    Ok(Some(provenance))
}

fn stream_out_from_reply(reply: RpcReply) -> Result<StreamOut, CatalogDerivativeError> {
    match reply {
        RpcReply::Json(resp) => match resp {
            RpcResponse::Success { .. } => Err((
                "Unexpected JSON reply".to_string(),
                Some("INTERNAL".to_string()),
            )),
            RpcResponse::Error { error, code, .. } => Err((error, code)),
        },
        RpcReply::Stream(out) => {
            let mut bytes = Vec::new();
            let mut reader = out.reader;
            reader.read_to_end(&mut bytes).map_err(|error| {
                (
                    format!("Failed to read stream: {error}"),
                    Some("INTERNAL".to_string()),
                )
            })?;
            Ok(StreamOut {
                meta: out.meta,
                bytes,
            })
        }
        RpcReply::RangeStream(_) => Err((
            "Unexpected range stream reply".to_string(),
            Some("INTERNAL".to_string()),
        )),
    }
}
