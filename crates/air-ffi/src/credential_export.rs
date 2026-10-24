use super::{AirExecution, AirRuntime, BridgeError, LocalSession, map_error};
use chromvoid_client_runtime::session::credential_export::{
    ExportError, ExportHandle, MAX_EXPORT_BYTES, MAX_EXPORT_CHUNK_BYTES,
};
use std::sync::Arc;

#[derive(uniffi::Record)]
pub struct AirExportLimits {
    pub total_bytes: u64,
    pub chunk_bytes: u64,
}

#[derive(uniffi::Object)]
pub struct AirExport {
    session: Arc<LocalSession>,
    handle: ExportHandle,
    generation: u64,
}

#[uniffi::export]
impl AirRuntime {
    pub fn credential_export_limits(&self) -> AirExportLimits {
        AirExportLimits {
            total_bytes: MAX_EXPORT_BYTES as u64,
            chunk_bytes: MAX_EXPORT_CHUNK_BYTES as u64,
        }
    }

    /// Explicit credential export only, without granting large generic metadata replies.
    pub fn begin_root_export(&self, generation: u64) -> Result<Arc<AirExport>, BridgeError> {
        let handle = self
            .session
            .begin_root_export(generation)
            .map_err(export_error)?;
        Ok(Arc::new(AirExport {
            session: self.session.clone(),
            handle,
            generation,
        }))
    }
}

#[uniffi::export]
impl AirExport {
    /// Admits snapshot preparation in the same increasing request sequence as ordinary RPC.
    pub fn begin_prepare(&self, request_id: u64) -> Result<Arc<AirExecution>, BridgeError> {
        let admitted = self
            .session
            .prepare_root_export(request_id, &self.handle)
            .map_err(export_error)?;
        Ok(AirExecution::new(
            self.session.clone(),
            admitted,
            request_id,
            self.generation,
        ))
    }

    pub fn byte_count(&self) -> Result<u64, BridgeError> {
        self.handle.byte_count().map_err(export_error)
    }

    pub fn read_chunk(&self) -> Result<Vec<u8>, BridgeError> {
        self.handle.read_chunk().map_err(export_error)
    }

    pub fn cancel(&self) -> Result<(), BridgeError> {
        self.handle.cancel().map_err(export_error)
    }
}

fn export_error(error: ExportError) -> BridgeError {
    match error {
        ExportError::Session(error) => map_error(error),
        ExportError::State => BridgeError::InvalidExportState,
    }
}
