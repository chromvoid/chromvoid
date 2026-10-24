//! Binary resources share the ordinary execution sequence, without generic stream RPC access.
use super::{AirExecution, AirRuntime, BridgeError, LocalSession, map_error};
use chromvoid_client_runtime::session::document_save::{DocumentSaveError, MAX_DOCUMENT_BYTES};
use chromvoid_client_runtime::session::file_reader::{
    FileReadError, FileReaderHandle, MAX_FILE_READ_BYTES, MAX_FILE_READERS,
};
use chromvoid_client_runtime::session::file_writer::{
    FileWriteError, FileWriteTarget, FileWriterHandle, MAX_FILE_WRITE_BYTES,
};
use std::sync::Arc;

#[derive(uniffi::Record)]
pub struct AirFileLimits {
    pub read_chunk_bytes: u64,
    pub write_chunk_bytes: u64,
    pub readers: u64,
    pub document_bytes: u64,
}

/// Catalog destination only. It never grants access to a device filesystem path.
#[derive(uniffi::Record)]
pub struct AirFileWriteTarget {
    pub parent_path: String,
    pub name: String,
    pub mime_type: Option<String>,
    pub byte_count: u64,
}

#[derive(uniffi::Object)]
pub struct AirFileReader {
    session: Arc<LocalSession>,
    handle: FileReaderHandle,
    generation: u64,
}

#[derive(uniffi::Object)]
pub struct AirFileWriter {
    session: Arc<LocalSession>,
    handle: FileWriterHandle,
    generation: u64,
}

#[uniffi::export]
impl AirRuntime {
    pub fn file_transfer_limits(&self) -> AirFileLimits {
        AirFileLimits {
            read_chunk_bytes: MAX_FILE_READ_BYTES as u64,
            write_chunk_bytes: MAX_FILE_WRITE_BYTES as u64,
            readers: MAX_FILE_READERS as u64,
            document_bytes: MAX_DOCUMENT_BYTES as u64,
        }
    }

    /// Explicit bounded save; Core checks the opened source revision before replacing bytes.
    pub fn begin_document_save(
        &self,
        request_id: u64,
        generation: u64,
        node_id: u64,
        expected_source_revision: u64,
        bytes: Vec<u8>,
    ) -> Result<Arc<AirExecution>, BridgeError> {
        let admitted = self
            .session
            .prepare_document_save(
                request_id,
                generation,
                node_id,
                expected_source_revision,
                bytes,
            )
            .map_err(|error| match error {
                DocumentSaveError::Session(error) => map_error(error),
                DocumentSaveError::Length => BridgeError::InvalidFileLength,
            })?;
        Ok(AirExecution::new(
            self.session.clone(),
            admitted,
            request_id,
            generation,
        ))
    }

    pub fn begin_file_reader(
        &self,
        generation: u64,
        node_id: u64,
    ) -> Result<Arc<AirFileReader>, BridgeError> {
        let handle = self
            .session
            .begin_file_reader(generation, node_id)
            .map_err(read_error)?;
        Ok(Arc::new(AirFileReader {
            session: self.session.clone(),
            handle,
            generation,
        }))
    }

    pub fn begin_file_writer(
        &self,
        generation: u64,
        target: AirFileWriteTarget,
    ) -> Result<Arc<AirFileWriter>, BridgeError> {
        let target = FileWriteTarget {
            parent_path: target.parent_path,
            name: target.name,
            mime_type: target.mime_type,
            byte_count: target.byte_count,
        };
        let handle = self
            .session
            .begin_file_writer(generation, target)
            .map_err(write_error)?;
        Ok(Arc::new(AirFileWriter {
            session: self.session.clone(),
            handle,
            generation,
        }))
    }
}

#[uniffi::export]
impl AirFileReader {
    /// Reply contains Core source metadata; consume binary output separately with take_chunk.
    pub fn begin_read(
        &self,
        request_id: u64,
        offset: u64,
        length: u64,
    ) -> Result<Arc<AirExecution>, BridgeError> {
        let length = usize::try_from(length).map_err(|_| BridgeError::InvalidFileLength)?;
        let admitted = self
            .session
            .prepare_file_read(request_id, &self.handle, offset, length)
            .map_err(read_error)?;
        Ok(AirExecution::new(
            self.session.clone(),
            admitted,
            request_id,
            self.generation,
        ))
    }

    /// One consume per successful read. The foreign caller owns the returned plaintext bytes.
    pub fn take_chunk(&self) -> Result<Vec<u8>, BridgeError> {
        self.handle.take_chunk().map_err(read_error)
    }

    pub fn cancel(&self) -> Result<(), BridgeError> {
        self.handle.cancel().map_err(read_error)
    }
}

#[uniffi::export]
impl AirFileWriter {
    pub fn begin_append(
        &self,
        request_id: u64,
        chunk: Vec<u8>,
    ) -> Result<Arc<AirExecution>, BridgeError> {
        let admitted = self
            .session
            .prepare_file_append(request_id, &self.handle, chunk)
            .map_err(write_error)?;
        Ok(AirExecution::new(
            self.session.clone(),
            admitted,
            request_id,
            self.generation,
        ))
    }

    pub fn begin_finish(&self, request_id: u64) -> Result<Arc<AirExecution>, BridgeError> {
        let admitted = self
            .session
            .prepare_file_finish(request_id, &self.handle)
            .map_err(write_error)?;
        Ok(AirExecution::new(
            self.session.clone(),
            admitted,
            request_id,
            self.generation,
        ))
    }

    /// Revokes immediately; a finish already executing Core may still commit.
    pub fn cancel(&self) -> Result<(), BridgeError> {
        self.handle.cancel().map_err(write_error)
    }

    /// Wait for worker cleanup, then release this object before starting another writer.
    pub async fn cancel_and_wait(&self) -> Result<(), BridgeError> {
        self.handle.cancel_and_wait().await.map_err(write_error)
    }
}

fn read_error(error: FileReadError) -> BridgeError {
    match error {
        FileReadError::Session(error) => map_error(error),
        FileReadError::State => BridgeError::InvalidFileReadState,
        FileReadError::Length => BridgeError::InvalidFileLength,
    }
}

fn write_error(error: FileWriteError) -> BridgeError {
    match error {
        FileWriteError::Session(error) => map_error(error),
        FileWriteError::State => BridgeError::InvalidFileWriteState,
        FileWriteError::Length => BridgeError::InvalidFileLength,
    }
}
