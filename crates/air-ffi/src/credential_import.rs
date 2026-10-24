use super::{AirExecution, AirRuntime, BridgeError, LocalSession, map_error};
use chromvoid_client_runtime::session::credential_import::{
    ImportError, ImportHandle, ImportMode, MAX_IMPORT_BYTES, MAX_IMPORT_CHUNK_BYTES,
};
use std::sync::Arc;

#[derive(uniffi::Enum)]
pub enum AirImportMode {
    Merge,
    Replace,
    Restore,
}

#[derive(uniffi::Record)]
pub struct AirImportLimits {
    pub total_bytes: u64,
    pub chunk_bytes: u64,
}

#[derive(uniffi::Object)]
pub struct AirImport {
    session: Arc<LocalSession>,
    handle: ImportHandle,
    generation: u64,
}

#[uniffi::export]
impl AirRuntime {
    pub fn credential_import_limits(&self) -> AirImportLimits {
        AirImportLimits {
            total_bytes: MAX_IMPORT_BYTES as u64,
            chunk_bytes: MAX_IMPORT_CHUNK_BYTES as u64,
        }
    }

    /// Core-supported credential exports. No file path or document-supplied authority.
    pub fn begin_root_import(
        &self,
        generation: u64,
        byte_count: u64,
        mode: AirImportMode,
    ) -> Result<Arc<AirImport>, BridgeError> {
        let mode = match mode {
            AirImportMode::Merge => ImportMode::Merge,
            AirImportMode::Replace => ImportMode::Replace,
            AirImportMode::Restore => ImportMode::Restore,
        };
        let handle = self
            .session
            .begin_root_import(generation, byte_count, mode)
            .map_err(import_error)?;
        Ok(Arc::new(AirImport {
            session: self.session.clone(),
            handle,
            generation,
        }))
    }
}

#[uniffi::export]
impl AirImport {
    pub fn append(&self, chunk: Vec<u8>) -> Result<u64, BridgeError> {
        let chunk = zeroize::Zeroizing::new(chunk);
        self.handle.append(&chunk).map_err(import_error)
    }

    pub fn cancel(&self) -> Result<(), BridgeError> {
        self.handle.cancel().map_err(import_error)
    }

    /// Synchronous admission before Swift suspension uses the same request ID sequence as RPC.
    pub fn begin_review(
        &self,
        request_id: u64,
        source_password: Option<String>,
    ) -> Result<Arc<AirExecution>, BridgeError> {
        let source_password = source_password.map(zeroize::Zeroizing::new);
        let admitted = self
            .session
            .review_root_import_with_password(request_id, &self.handle, source_password)
            .map_err(import_error)?;
        Ok(AirExecution::new(
            self.session.clone(),
            admitted,
            request_id,
            self.generation,
        ))
    }

    /// Explicit, single-use confirmation of the exact Rust-owned preview input.
    pub fn begin_commit(&self, request_id: u64) -> Result<Arc<AirExecution>, BridgeError> {
        let admitted = self
            .session
            .commit_root_import(request_id, &self.handle)
            .map_err(import_error)?;
        Ok(AirExecution::new(
            self.session.clone(),
            admitted,
            request_id,
            self.generation,
        ))
    }
}

fn import_error(error: ImportError) -> BridgeError {
    match error {
        ImportError::Session(error) => map_error(error),
        ImportError::TooLarge => BridgeError::ImportTooLarge,
        ImportError::Length => BridgeError::ImportLengthMismatch,
        ImportError::State => BridgeError::InvalidImportState,
    }
}
