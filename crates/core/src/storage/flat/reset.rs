use crate::error::Result;
use crate::storage::backend::StorageResetOutcome;
use crate::storage::StorageArtifact;

use super::Storage;

impl Storage {
    pub(crate) fn reset_vault_contents(&self) -> Result<StorageResetOutcome> {
        self.backend.reset_vault_contents()
    }
}

impl StorageArtifact {
    pub(crate) fn reset_artifacts() -> &'static [StorageArtifact] {
        &[
            StorageArtifact::FormatVersion,
            StorageArtifact::Salt,
            StorageArtifact::RekeyTransaction,
            StorageArtifact::RestoreTransaction,
        ]
    }
}
