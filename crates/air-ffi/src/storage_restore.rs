use super::{AirExecution, AirRuntime, BridgeError, LocalSession, map_error};
use chromvoid_client_runtime::session::storage_restore::{
    LocalRestoreArtifact, MAX_RESTORE_APPEND_BYTES, RestoreError, RestoreHandle,
};
use std::sync::Arc;

#[derive(Clone, Copy, uniffi::Enum)]
pub enum AirRestoreArtifact {
    Metadata,
    MasterSalt,
    MasterVerify,
    Manifest,
    Pack,
}

impl AirRestoreArtifact {
    fn core(self) -> LocalRestoreArtifact {
        match self {
            Self::Metadata => LocalRestoreArtifact::Metadata,
            Self::MasterSalt => LocalRestoreArtifact::MasterSalt,
            Self::MasterVerify => LocalRestoreArtifact::MasterVerify,
            Self::Manifest => LocalRestoreArtifact::Manifest,
            Self::Pack => LocalRestoreArtifact::Pack,
        }
    }
}

#[derive(uniffi::Record)]
pub struct AirRestoreArtifactSpec {
    pub artifact: AirRestoreArtifact,
    pub name: String,
    pub maximum_bytes: u64,
    pub required: bool,
}

#[derive(uniffi::Record)]
pub struct AirRestoreLimits {
    pub chunk_bytes: u64,
    pub artifacts: Vec<AirRestoreArtifactSpec>,
}

#[derive(uniffi::Record)]
pub struct AirRestorePreview {
    pub version: u64,
    pub chunk_count: u64,
    pub byte_count: u64,
}

#[derive(uniffi::Object)]
pub struct AirStorageRestore {
    session: Arc<LocalSession>,
    handle: RestoreHandle,
    generation: u64,
}

#[uniffi::export]
impl AirRuntime {
    pub fn storage_restore_limits(&self) -> AirRestoreLimits {
        AirRestoreLimits {
            chunk_bytes: MAX_RESTORE_APPEND_BYTES as u64,
            artifacts: [
                AirRestoreArtifact::Metadata,
                AirRestoreArtifact::MasterSalt,
                AirRestoreArtifact::MasterVerify,
                AirRestoreArtifact::Manifest,
                AirRestoreArtifact::Pack,
            ]
            .into_iter()
            .map(|artifact| AirRestoreArtifactSpec {
                artifact,
                name: artifact.core().name().to_string(),
                maximum_bytes: artifact.core().byte_limit(),
                required: artifact.core().required(),
            })
            .collect(),
        }
    }

    pub fn begin_storage_restore(
        &self,
        generation: u64,
    ) -> Result<Arc<AirStorageRestore>, BridgeError> {
        let handle = self
            .session
            .begin_storage_restore(generation)
            .map_err(restore_error)?;
        Ok(Arc::new(AirStorageRestore {
            session: self.session.clone(),
            handle,
            generation,
        }))
    }
}

#[uniffi::export]
impl AirStorageRestore {
    pub fn begin_append(
        &self,
        request_id: u64,
        artifact: AirRestoreArtifact,
        bytes: Vec<u8>,
    ) -> Result<Arc<AirExecution>, BridgeError> {
        let admitted = self
            .session
            .append_storage_restore(request_id, &self.handle, artifact.core(), bytes)
            .map_err(restore_error)?;
        Ok(AirExecution::new(
            self.session.clone(),
            admitted,
            request_id,
            self.generation,
        ))
    }

    pub fn begin_review(
        &self,
        request_id: u64,
        master_password: String,
    ) -> Result<Arc<AirExecution>, BridgeError> {
        let admitted = self
            .session
            .review_storage_restore(request_id, &self.handle, master_password)
            .map_err(restore_error)?;
        Ok(AirExecution::new(
            self.session.clone(),
            admitted,
            request_id,
            self.generation,
        ))
    }

    pub fn preview(&self) -> Result<AirRestorePreview, BridgeError> {
        let preview = self.handle.preview().map_err(restore_error)?;
        Ok(AirRestorePreview {
            version: preview.version,
            chunk_count: preview.chunk_count,
            byte_count: preview.byte_count,
        })
    }

    pub fn begin_commit(&self, request_id: u64) -> Result<Arc<AirExecution>, BridgeError> {
        let admitted = self
            .session
            .commit_storage_restore(request_id, &self.handle)
            .map_err(restore_error)?;
        Ok(AirExecution::new(
            self.session.clone(),
            admitted,
            request_id,
            self.generation,
        ))
    }

    pub fn cancel(&self) -> Result<(), BridgeError> {
        self.handle.cancel().map_err(restore_error)
    }

    pub async fn cancel_and_wait(&self) -> Result<(), BridgeError> {
        self.handle.cancel_and_wait().await.map_err(restore_error)
    }
}

fn restore_error(error: RestoreError) -> BridgeError {
    match error {
        RestoreError::Session(error) => map_error(error),
        RestoreError::State => BridgeError::InvalidRestoreState,
        RestoreError::TooLarge => BridgeError::RestoreInputTooLarge,
        RestoreError::Expired => BridgeError::RestoreExpired,
    }
}
