use super::{AirExecution, AirRuntime, BridgeError, LocalSession, map_error};
use chromvoid_client_runtime::session::storage_backup::{BackupError, BackupHandle};
use std::sync::Arc;

#[derive(uniffi::Record)]
pub struct AirBackupArtifact {
    pub name: String,
    pub byte_count: u64,
}

#[derive(uniffi::Object)]
pub struct AirStorageBackup {
    session: Arc<LocalSession>,
    handle: BackupHandle,
    generation: u64,
}

#[uniffi::export]
impl AirRuntime {
    pub fn begin_storage_backup(
        &self,
        generation: u64,
    ) -> Result<Arc<AirStorageBackup>, BridgeError> {
        let handle = self
            .session
            .begin_storage_backup(generation)
            .map_err(backup_error)?;
        Ok(Arc::new(AirStorageBackup {
            session: self.session.clone(),
            handle,
            generation,
        }))
    }
}

#[uniffi::export]
impl AirStorageBackup {
    pub fn begin_prepare(
        &self,
        request_id: u64,
        master_password: String,
    ) -> Result<Arc<AirExecution>, BridgeError> {
        let admitted = self
            .session
            .prepare_storage_backup(request_id, &self.handle, master_password)
            .map_err(backup_error)?;
        Ok(AirExecution::new(
            self.session.clone(),
            admitted,
            request_id,
            self.generation,
        ))
    }

    pub fn artifacts(&self) -> Result<Vec<AirBackupArtifact>, BridgeError> {
        Ok(self
            .handle
            .artifacts()
            .map_err(backup_error)?
            .into_iter()
            .map(|artifact| AirBackupArtifact {
                name: artifact.name,
                byte_count: artifact.size,
            })
            .collect())
    }

    pub fn begin_read(
        &self,
        request_id: u64,
        artifact: u32,
    ) -> Result<Arc<AirExecution>, BridgeError> {
        let admitted = self
            .session
            .read_storage_backup(request_id, &self.handle, artifact as usize)
            .map_err(backup_error)?;
        Ok(AirExecution::new(
            self.session.clone(),
            admitted,
            request_id,
            self.generation,
        ))
    }

    pub fn take_chunk(&self) -> Result<Vec<u8>, BridgeError> {
        self.handle.take_chunk().map_err(backup_error)
    }

    pub fn cancel(&self) -> Result<(), BridgeError> {
        self.handle.cancel().map_err(backup_error)
    }

    pub async fn cancel_and_wait(&self) -> Result<(), BridgeError> {
        self.handle.cancel_and_wait().await.map_err(backup_error)
    }
}

fn backup_error(error: BackupError) -> BridgeError {
    match error {
        BackupError::Session(error) => map_error(error),
        BackupError::State => BridgeError::InvalidBackupState,
        BackupError::Artifact => BridgeError::InvalidBackupArtifact,
    }
}
