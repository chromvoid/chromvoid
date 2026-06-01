mod error;

use crate::rpc::commands::{is_system_path_guarded, normalize_path};

use super::derivative_store::{
    cleanup_catalog_derivative_write_result, CatalogDerivativeWriteError,
    CatalogDerivativeWriteRequest, CatalogDerivativeWriteResult, CatalogDerivativeWriteSnapshot,
    DerivativeStore,
};
use super::state::RpcRouter;

pub use error::{CatalogDerivativeSplitWriteError, CatalogDerivativeSplitWriteResult};

pub fn write_catalog_derivative_snapshot<F>(
    snapshot: &CatalogDerivativeWriteSnapshot,
    content: &[u8],
    is_cancelled: F,
) -> Result<CatalogDerivativeWriteResult, CatalogDerivativeWriteError>
where
    F: Fn() -> bool,
{
    DerivativeStore::write_chunks(snapshot, content, is_cancelled)
}

impl RpcRouter {
    pub fn snapshot_catalog_derivative_write(
        &mut self,
        request: CatalogDerivativeWriteRequest,
    ) -> CatalogDerivativeSplitWriteResult<CatalogDerivativeWriteSnapshot> {
        let session = self
            .session
            .as_mut()
            .ok_or_else(CatalogDerivativeSplitWriteError::vault_required)?;

        let path = session
            .catalog()
            .get_path(request.node_id)
            .map(|path| normalize_path(&path))
            .ok_or_else(CatalogDerivativeSplitWriteError::node_not_found)?;
        if is_system_path_guarded(&path) {
            return Err(CatalogDerivativeSplitWriteError::access_denied());
        }

        let current_source_revision = {
            let node = session
                .catalog_mut()
                .find_by_id_mut(request.node_id)
                .ok_or_else(CatalogDerivativeSplitWriteError::node_not_found)?;
            if !node.is_file() {
                return Err(CatalogDerivativeSplitWriteError::not_file());
            }
            node.ensure_source_revision()
        };
        if current_source_revision != request.source_version {
            return Err(CatalogDerivativeSplitWriteError::media_stream_stale());
        }

        Ok(CatalogDerivativeWriteSnapshot {
            storage: self.storage.clone(),
            vault_key: *session.vault_key(),
            node_id: request.node_id,
            source_version: request.source_version,
            tier: request.tier,
            version: request.version,
            size: request.size,
            name: request.name,
            mime_type: request.mime_type,
            file_extension: request.file_extension,
            chunk_size: request.chunk_size.max(1),
        })
    }

    pub fn commit_catalog_derivative_write(
        &mut self,
        snapshot: &CatalogDerivativeWriteSnapshot,
        write_result: &CatalogDerivativeWriteResult,
    ) -> CatalogDerivativeSplitWriteResult<serde_json::Value> {
        let Some(session) = self.session.as_ref() else {
            cleanup_catalog_derivative_write_result(snapshot, write_result);
            return Err(CatalogDerivativeSplitWriteError::vault_required());
        };
        let Some(node) = session.catalog().find_by_id(snapshot.node_id) else {
            cleanup_catalog_derivative_write_result(snapshot, write_result);
            return Err(CatalogDerivativeSplitWriteError::node_not_found());
        };
        if node.source_revision() != snapshot.source_version {
            cleanup_catalog_derivative_write_result(snapshot, write_result);
            return Ok(serde_json::json!({
                "node_id": snapshot.node_id,
                "source_revision": node.source_revision(),
                "stale": true,
            }));
        }

        if let Err(error) = DerivativeStore::commit_write(snapshot, write_result) {
            return Err(CatalogDerivativeSplitWriteError::internal(error.message));
        }

        Ok(serde_json::json!({
            "node_id": snapshot.node_id,
            "source_revision": snapshot.source_version,
            "stale": false,
        }))
    }
}
