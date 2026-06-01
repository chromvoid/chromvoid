use std::sync::{Arc, Mutex};
use std::time::Instant;

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcOutputStream, RpcReply};

use crate::types::*;

use super::CatalogDownloadError;

pub(super) fn rpc_stream_err(
    error: impl Into<String>,
    code: Option<String>,
) -> RpcResult<StreamOut> {
    RpcResult::Error {
        ok: false,
        error: error.into(),
        code,
    }
}

pub(super) fn rpc_result_err<T>(error: impl Into<String>, code: Option<String>) -> RpcResult<T> {
    RpcResult::Error {
        ok: false,
        error: error.into(),
        code,
    }
}

pub(super) fn stream_out_from_reply(reply: RpcReply) -> Result<StreamOut, CatalogDownloadError> {
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
            let read_started = Instant::now();
            std::io::Read::read_to_end(&mut reader, &mut bytes).map_err(|error| {
                (
                    format!("Failed to read stream: {error}"),
                    Some("INTERNAL".to_string()),
                )
            })?;
            tracing::info!(
                "perf:catalog_stream event=read stream-read:read_ms={} stream-read:bytes={} stream-read:mime_type={}",
                read_started.elapsed().as_millis(),
                bytes.len(),
                out.meta.mime_type,
            );
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

pub(super) fn load_catalog_download_stream(
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    node_id: u64,
) -> Result<RpcOutputStream, CatalogDownloadError> {
    let handle_started = Instant::now();
    let reply = {
        let mut adapter = adapter.lock().map_err(|_| {
            (
                "Adapter mutex poisoned".to_string(),
                Some("INTERNAL".to_string()),
            )
        })?;
        let req = RpcRequest::new(
            "catalog:download".to_string(),
            serde_json::json!({
                "node_id": node_id,
            }),
        );
        adapter.handle_with_stream(&req, None)
    };
    tracing::info!(
        "perf:catalog_download event=handle download:handle_ms={} node_id={}",
        handle_started.elapsed().as_millis(),
        node_id,
    );

    match reply {
        RpcReply::Json(resp) => match resp {
            RpcResponse::Success { .. } => Err((
                "Unexpected JSON reply".to_string(),
                Some("INTERNAL".to_string()),
            )),
            RpcResponse::Error { error, code, .. } => Err((error, code)),
        },
        RpcReply::Stream(out) => Ok(out),
        RpcReply::RangeStream(_) => Err((
            "Unexpected range stream reply".to_string(),
            Some("INTERNAL".to_string()),
        )),
    }
}

pub(super) fn load_catalog_download_bytes(
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    node_id: u64,
) -> Result<StreamOut, CatalogDownloadError> {
    let handle_started = Instant::now();
    let reply = {
        let mut adapter = adapter.lock().map_err(|_| {
            (
                "Adapter mutex poisoned".to_string(),
                Some("INTERNAL".to_string()),
            )
        })?;
        let req = RpcRequest::new(
            "catalog:download".to_string(),
            serde_json::json!({
                "node_id": node_id,
            }),
        );
        adapter.handle_with_stream(&req, None)
    };
    tracing::info!(
        "perf:catalog_download event=handle download:handle_ms={} node_id={}",
        handle_started.elapsed().as_millis(),
        node_id,
    );

    stream_out_from_reply(reply)
}

pub(super) fn load_catalog_download_range_bytes(
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    node_id: u64,
    offset: u64,
    length: u64,
    expected_source_revision: u64,
) -> Result<Vec<u8>, CatalogDownloadError> {
    let handle_started = Instant::now();
    let reply = {
        let mut adapter = adapter.lock().map_err(|_| {
            (
                "Adapter mutex poisoned".to_string(),
                Some("INTERNAL".to_string()),
            )
        })?;
        let req = RpcRequest::new(
            "catalog:downloadRange".to_string(),
            serde_json::json!({
                "node_id": node_id,
                "offset": offset,
                "length": length,
                "expected_source_revision": expected_source_revision,
            }),
        );
        adapter.handle_with_stream(&req, None)
    };
    tracing::info!(
        "perf:catalog_download event=range_handle download-range:handle_ms={} node_id={} offset={} length={} expected_source_revision={}",
        handle_started.elapsed().as_millis(),
        node_id,
        offset,
        length,
        expected_source_revision,
    );

    match reply {
        RpcReply::RangeStream(out) => {
            let mut reader = out.reader;
            let mut bytes = Vec::with_capacity(out.meta.range_length as usize);
            let read_started = Instant::now();
            std::io::Read::read_to_end(&mut reader, &mut bytes).map_err(|error| {
                (
                    format!("Failed to read range stream: {error}"),
                    Some("INTERNAL".to_string()),
                )
            })?;
            tracing::info!(
                "perf:catalog_download event=range_read download-range:read_ms={} node_id={} bytes={} source_revision={}",
                read_started.elapsed().as_millis(),
                node_id,
                bytes.len(),
                out.meta.source_revision,
            );
            Ok(bytes)
        }
        RpcReply::Json(resp) => match resp {
            RpcResponse::Success { .. } => Err((
                "Unexpected JSON reply".to_string(),
                Some("INTERNAL".to_string()),
            )),
            RpcResponse::Error { error, code, .. } => Err((error, code)),
        },
        RpcReply::Stream(_) => Err((
            "Unexpected stream reply".to_string(),
            Some("INTERNAL".to_string()),
        )),
    }
}
