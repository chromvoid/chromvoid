//! Explicit admin storage garbage collection for unreachable chunks.

mod delete_service;
mod error;
mod live_set;
mod manifest;
mod registry;
mod scan_service;
mod types;

use serde_json::Value;

use crate::rpc::types::RpcResponse;

use super::session_lifecycle::now_ms;
use super::state::RpcRouter;
use delete_service::StorageGcDeleteService;
use error::{StorageGcError, StorageGcResult};
use scan_service::StorageGcScanService;
use types::{StorageGcDeleteResult, StorageGcScanOptions};

pub(in crate::rpc::router) use registry::StorageGcScanRegistry;

impl RpcRouter {
    pub(super) fn handle_admin_storage_gc_scan(&mut self, data: &Value) -> RpcResponse {
        match self.admin_storage_gc_scan(data) {
            Ok(response) => RpcResponse::success(response),
            Err(error) => error.into_rpc_response(),
        }
    }

    fn admin_storage_gc_scan(&mut self, data: &Value) -> StorageGcResult<Value> {
        self.recover_storage_gc_delete_manifest_for_command("scan")?;
        self.storage_gc_scan_registry.expire_idle(now_ms());
        let options = StorageGcScanOptions {
            include_system: data
                .get("include_system")
                .and_then(|value| value.as_bool())
                .unwrap_or(false),
        };
        let Some(session) = self.session.as_ref() else {
            return Err(StorageGcError::vault_required());
        };

        let scan = StorageGcScanService::scan(&self.storage, session, options, now_ms())
            .map_err(StorageGcError::scan_failed)?;
        let response = serde_json::json!({
            "gc_id": scan.gc_id,
            "candidates": scan.candidates,
            "total_bytes": scan.total_bytes,
        });
        self.storage_gc_scan_registry.insert(scan);
        Ok(response)
    }

    pub(super) fn handle_admin_storage_gc_delete(&mut self, data: &Value) -> RpcResponse {
        match self.admin_storage_gc_delete(data) {
            Ok(response) => RpcResponse::success(response),
            Err(error) => error.into_rpc_response(),
        }
    }

    fn admin_storage_gc_delete(&mut self, data: &Value) -> StorageGcResult<Value> {
        self.recover_storage_gc_delete_manifest_for_command("delete")?;
        self.storage_gc_scan_registry.expire_idle(now_ms());
        let gc_id = required_str(data, "gc_id")?.to_string();
        let confirm_delete = required_bool(data, "confirm_delete")?;
        if !confirm_delete {
            return Err(StorageGcError::confirm_delete_required_true());
        }
        let Some(session) = self.session.as_ref() else {
            return Err(StorageGcError::vault_required());
        };
        let scan = self
            .storage_gc_scan_registry
            .get_refresh_cloned(&gc_id, now_ms())?;

        let result = StorageGcDeleteService::delete_scan(&self.storage, session, scan)
            .map_err(StorageGcError::delete_failed)?;
        self.storage_gc_scan_registry.remove(&gc_id);
        Ok(storage_gc_delete_response(result))
    }

    pub(super) fn recover_storage_gc_delete_manifest_best_effort(&self) {
        let Some(session) = self.session.as_ref() else {
            return;
        };
        if let Err(error) = StorageGcDeleteService::recover_manifest(&self.storage, session) {
            tracing::warn!("storage-gc:manifest_recovery_failed error={error}");
        }
    }

    fn recover_storage_gc_delete_manifest_for_command(
        &self,
        operation: &str,
    ) -> StorageGcResult<()> {
        let Some(session) = self.session.as_ref() else {
            return Ok(());
        };
        StorageGcDeleteService::recover_manifest(&self.storage, session)
            .map_err(|error| StorageGcError::recovery_failed(operation, error))
    }
}

fn storage_gc_delete_response(result: StorageGcDeleteResult) -> Value {
    serde_json::json!({
        "gc_id": result.gc_id,
        "deleted_chunks": result.deleted_chunks,
        "deleted_bytes": result.deleted_bytes,
        "skipped_chunks": result.skipped_chunks,
    })
}

fn required_str<'a>(data: &'a Value, field: &str) -> StorageGcResult<&'a str> {
    data.get(field)
        .and_then(|value| value.as_str())
        .ok_or_else(|| StorageGcError::empty_payload(field))
}

fn required_bool(data: &Value, field: &str) -> StorageGcResult<bool> {
    data.get(field)
        .and_then(|value| value.as_bool())
        .ok_or_else(|| StorageGcError::empty_payload(field))
}
