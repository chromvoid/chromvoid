//! Dedicated erase handle; confirmation tokens never enter the foreign-language interface.
use super::{AirExecution, AirRuntime, BridgeError, LocalSession, map_error};
use chromvoid_client_runtime::session::storage_erase::{EraseError, EraseHandle, EraseReceipt};
use std::sync::Arc;

#[derive(Debug, uniffi::Enum)]
pub enum AirEraseReceipt {
    Completed {
        erased_bytes: u64,
        erased_chunks: u64,
        time_elapsed_ms: u64,
    },
    Incomplete {
        key_cleanup_failed: bool,
        host_cleanup_failed: bool,
    },
}

impl From<EraseReceipt> for AirEraseReceipt {
    fn from(receipt: EraseReceipt) -> Self {
        match receipt {
            EraseReceipt::Completed(stats) => Self::Completed {
                erased_bytes: stats.erased_bytes,
                erased_chunks: stats.erased_chunks,
                time_elapsed_ms: stats.time_elapsed_ms,
            },
            EraseReceipt::Incomplete {
                key_cleanup_failed,
                host_cleanup_failed,
            } => Self::Incomplete {
                key_cleanup_failed,
                host_cleanup_failed,
            },
        }
    }
}

#[derive(uniffi::Object)]
pub struct AirStorageErase {
    session: Arc<LocalSession>,
    handle: EraseHandle,
    generation: u64,
}

#[uniffi::export]
impl AirRuntime {
    pub fn begin_storage_erase(
        &self,
        generation: u64,
    ) -> Result<Arc<AirStorageErase>, BridgeError> {
        let handle = self
            .session
            .begin_storage_erase(generation)
            .map_err(erase_error)?;
        Ok(Arc::new(AirStorageErase {
            session: self.session.clone(),
            handle,
            generation,
        }))
    }
}

#[uniffi::export]
impl AirStorageErase {
    pub fn begin_review(&self, request_id: u64) -> Result<Arc<AirExecution>, BridgeError> {
        let admitted = self
            .session
            .review_storage_erase(request_id, &self.handle)
            .map_err(erase_error)?;
        Ok(AirExecution::new(
            self.session.clone(),
            admitted,
            request_id,
            self.generation,
        ))
    }

    pub fn storage_paths(&self) -> Result<Vec<String>, BridgeError> {
        Ok(self.handle.preview().map_err(erase_error)?.storage_paths)
    }

    pub fn begin_commit(
        &self,
        request_id: u64,
        master_password: String,
    ) -> Result<Arc<AirExecution>, BridgeError> {
        let admitted = self
            .session
            .commit_storage_erase(request_id, &self.handle, master_password)
            .map_err(erase_error)?;
        Ok(AirExecution::new(
            self.session.clone(),
            admitted,
            request_id,
            self.generation,
        ))
    }

    /// Status only: a receipt survives revocation but never permits another erase.
    pub fn receipt(&self) -> Result<Option<AirEraseReceipt>, BridgeError> {
        Ok(self.handle.receipt().map_err(map_error)?.map(Into::into))
    }

    pub fn cancel(&self) -> Result<(), BridgeError> {
        self.handle.cancel().map_err(map_error)
    }

    pub async fn cancel_and_wait(&self) -> Result<Option<AirEraseReceipt>, BridgeError> {
        Ok(self
            .handle
            .cancel_and_wait()
            .await
            .map_err(map_error)?
            .map(Into::into))
    }
}

fn erase_error(error: EraseError) -> BridgeError {
    match error {
        EraseError::Session(error) => map_error(error),
        EraseError::State => BridgeError::InvalidEraseState,
    }
}

#[cfg(test)]
mod adoption_guard_tests {
    use super::*;
    use chromvoid_core::rpc::{StorageMutationError, StorageMutationGuard};
    use std::sync::atomic::{AtomicBool, Ordering};

    #[tokio::test]
    async fn adoption_guard_refuses_air_erase_and_restore_handles_with_typed_errors() {
        let root = tempfile::TempDir::new().unwrap();
        let denied = Arc::new(AtomicBool::new(false));
        let policy = denied.clone();
        let adapter = chromvoid_client_runtime::LocalCoreAdapter::new_with_test_keystore(
            root.path().join("storage"),
        )
        .unwrap()
        .with_storage_mutation_guard(StorageMutationGuard::new(move || {
            if policy.load(Ordering::SeqCst) {
                Err(StorageMutationError::AdoptionRequired)
            } else {
                Ok(())
            }
        }));
        let runtime = AirRuntime {
            session: Arc::new(LocalSession::new(adapter).unwrap()),
            host: std::sync::Mutex::new(None),
        };
        let erase = runtime.begin_storage_erase(1).unwrap();
        let restore = runtime.begin_storage_restore(1).unwrap();
        denied.store(true, Ordering::SeqCst);
        assert!(matches!(
            runtime.begin_storage_erase(1),
            Err(BridgeError::AdoptionActionForbidden)
        ));
        assert!(matches!(
            runtime.begin_storage_restore(1),
            Err(BridgeError::AdoptionActionForbidden)
        ));
        assert!(matches!(
            erase.begin_review(1),
            Err(BridgeError::AdoptionActionForbidden)
        ));
        assert!(matches!(
            erase.begin_commit(2, "synthetic master".into()),
            Err(BridgeError::AdoptionActionForbidden)
        ));
        assert!(matches!(
            restore.begin_append(3, super::super::AirRestoreArtifact::Pack, vec![1]),
            Err(BridgeError::AdoptionActionForbidden)
        ));
        assert!(matches!(
            restore.begin_review(4, "synthetic master".into()),
            Err(BridgeError::AdoptionActionForbidden)
        ));
        assert!(matches!(
            restore.begin_commit(5),
            Err(BridgeError::AdoptionActionForbidden)
        ));
        erase.cancel_and_wait().await.unwrap();
        restore.cancel_and_wait().await.unwrap();
        runtime.session.close().unwrap();
    }
}
