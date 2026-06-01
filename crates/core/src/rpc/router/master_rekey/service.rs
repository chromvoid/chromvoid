use crate::durable_tx::{DurableTxArtifactStore, DurableTxPhase, DurableTxRecord};
use crate::storage::{Storage, StorageArtifact};

use super::error::{MasterRekeyError, MasterRekeyResult};
use super::participant::MasterRekeyParticipant;
use super::types::{
    master_rekey_temp_name, MasterRekeyArtifact, MasterRekeyArtifactKind, MasterRekeyArtifactNames,
    MasterRekeyTransaction, MasterRekeyTransactionArtifact, MASTER_REKEY_ARTIFACTS,
    MASTER_REKEY_TX_KIND,
};

pub(in crate::rpc::router::master_rekey) struct MasterRekeyService<'a> {
    storage: &'a Storage,
}

impl<'a> MasterRekeyService<'a> {
    pub(in crate::rpc::router::master_rekey) fn new(storage: &'a Storage) -> Self {
        Self { storage }
    }

    pub(in crate::rpc::router::master_rekey) fn recover(&self) -> MasterRekeyResult<()> {
        let store = self.store();
        if let Some(record) = store.read_participant_record().map_err(|error| {
            MasterRekeyError::integrity_failed(format!(
                "Failed to read master rekey transaction: {error}"
            ))
        })? {
            return store.recover_record(record).map_err(|error| {
                MasterRekeyError::integrity_failed(format!(
                    "Failed to recover master rekey transaction: {error}"
                ))
            });
        }

        let Some(transaction) = store
            .read_legacy_payload_strict::<MasterRekeyTransaction>()
            .map_err(|error| {
                MasterRekeyError::integrity_failed(format!(
                    "Failed to read master rekey transaction: {error}"
                ))
            })?
        else {
            self.cleanup_orphaned_temps();
            return Ok(());
        };
        Self::validate_transaction_payload(&transaction)?;
        let record = DurableTxRecord {
            version: 1,
            kind: MASTER_REKEY_TX_KIND.to_string(),
            tx_id: "master-rekey".to_string(),
            phase: transaction.phase,
            payload: transaction,
        };
        store.recover_record(record).map_err(|error| {
            MasterRekeyError::integrity_failed(format!(
                "Failed to recover master rekey transaction: {error}"
            ))
        })
    }

    pub(in crate::rpc::router::master_rekey) fn stage_and_commit_verify(
        &self,
        new_verify: &[u8; 32],
    ) -> MasterRekeyResult<MasterRekeyArtifactNames> {
        let mut transaction = MasterRekeyTransaction {
            version: 1,
            phase: DurableTxPhase::Staging,
            artifacts: Vec::with_capacity(MASTER_REKEY_ARTIFACTS.len()),
        };
        let mut rewrapped = Vec::with_capacity(MASTER_REKEY_ARTIFACTS.len());

        for artifact in MASTER_REKEY_ARTIFACTS {
            let temp_name = master_rekey_temp_name(artifact);

            match artifact.kind {
                MasterRekeyArtifactKind::MasterVerify => {
                    self.write_master_rekey_temp_durable(artifact, new_verify)?;
                    self.validate_master_verify_stage(artifact.temp_artifact, new_verify)?;
                }
            }

            let target_exists = self
                .storage
                .artifact_exists(artifact.target_artifact)
                .map_err(|error| {
                    MasterRekeyError::artifact_unsupported(format!(
                        "Failed to check registered master rekey artifact {}: {error}",
                        artifact.name
                    ))
                })?;
            if !target_exists {
                return Err(MasterRekeyError::artifact_unsupported(format!(
                    "Registered master rekey artifact missing: {}",
                    artifact.name
                )));
            }

            transaction.artifacts.push(MasterRekeyTransactionArtifact {
                name: artifact.name.to_string(),
                target_name: artifact.file_name.to_string(),
                temp_name,
            });
            rewrapped.push(artifact.name.to_string());
        }

        self.persist_legacy_phase(&transaction)?;

        transaction.phase = DurableTxPhase::Committing;
        self.persist_legacy_phase(&transaction)?;
        self.recover_committing_artifacts(&transaction)?;
        self.store().delete().map_err(|error| {
            MasterRekeyError::integrity_failed(format!(
                "Failed to remove master rekey transaction: {error}"
            ))
        })?;

        Ok(rewrapped)
    }

    pub(in crate::rpc::router::master_rekey) fn rollback_staged_artifacts(
        &self,
        transaction: &MasterRekeyTransaction,
    ) -> MasterRekeyResult<()> {
        for record in &transaction.artifacts {
            let artifact = Self::registry_artifact_for_record(record)?;
            self.storage
                .remove_artifact(artifact.temp_artifact)
                .map_err(|error| {
                    MasterRekeyError::integrity_failed(format!(
                        "Failed to remove staged master rekey artifact: {error}"
                    ))
                })?;
        }
        Ok(())
    }

    pub(in crate::rpc::router::master_rekey) fn recover_committing_artifacts(
        &self,
        transaction: &MasterRekeyTransaction,
    ) -> MasterRekeyResult<()> {
        for record in &transaction.artifacts {
            let artifact = Self::registry_artifact_for_record(record)?;
            let staged = self
                .storage
                .read_artifact(artifact.temp_artifact)
                .map_err(|error| {
                    MasterRekeyError::integrity_failed(format!(
                        "Failed to read staged master rekey artifact {}: {error}",
                        record.name
                    ))
                })?;
            if let Some(staged) = staged {
                self.write_master_rekey_target_durable(artifact, &staged)?;
                self.storage
                    .remove_artifact(artifact.temp_artifact)
                    .map_err(|error| {
                        MasterRekeyError::integrity_failed(format!(
                            "Failed to remove staged master rekey artifact {}: {error}",
                            record.name
                        ))
                    })?;
            } else if !self
                .storage
                .artifact_exists(artifact.target_artifact)
                .map_err(|error| {
                    MasterRekeyError::integrity_failed(format!(
                        "Failed to check committed master rekey artifact {}: {error}",
                        record.name
                    ))
                })?
            {
                return Err(MasterRekeyError::integrity_failed(format!(
                    "Master rekey artifact {} is missing both staged and committed files",
                    record.name
                )));
            }
        }
        Ok(())
    }

    pub(in crate::rpc::router::master_rekey) fn validate_transaction_payload(
        transaction: &MasterRekeyTransaction,
    ) -> MasterRekeyResult<()> {
        if transaction.version != 1 {
            return Err(MasterRekeyError::integrity_failed(format!(
                "Unsupported master rekey transaction version: {}",
                transaction.version
            )));
        }
        if transaction.artifacts.len() != MASTER_REKEY_ARTIFACTS.len() {
            return Err(MasterRekeyError::integrity_failed(
                "Master rekey transaction artifact registry mismatch",
            ));
        }

        for artifact in MASTER_REKEY_ARTIFACTS {
            let Some(record) = transaction
                .artifacts
                .iter()
                .find(|record| record.name == artifact.name)
            else {
                return Err(MasterRekeyError::integrity_failed(format!(
                    "Master rekey transaction missing artifact: {}",
                    artifact.name
                )));
            };

            let expected_temp_name = master_rekey_temp_name(artifact);
            if record.target_name != artifact.file_name || record.temp_name != expected_temp_name {
                return Err(MasterRekeyError::integrity_failed(format!(
                    "Master rekey transaction artifact {} does not match registry",
                    artifact.name
                )));
            }
        }

        Ok(())
    }

    fn validate_master_verify_stage(
        &self,
        temp_artifact: StorageArtifact,
        new_verify: &[u8; 32],
    ) -> MasterRekeyResult<()> {
        let staged = self
            .storage
            .read_artifact(temp_artifact)
            .map_err(|error| {
                MasterRekeyError::integrity_failed(format!(
                    "Failed to read staged master.verify: {error}"
                ))
            })?
            .ok_or_else(|| {
                MasterRekeyError::integrity_failed("Failed to read staged master.verify: not found")
            })?;
        if staged.as_slice() != new_verify {
            return Err(MasterRekeyError::integrity_failed(
                "Staged master.verify failed validation",
            ));
        }
        Ok(())
    }

    fn persist_legacy_phase(&self, transaction: &MasterRekeyTransaction) -> MasterRekeyResult<()> {
        self.store()
            .write_legacy_payload(transaction)
            .map_err(|error| {
                MasterRekeyError::integrity_failed(format!(
                    "Failed to write master rekey transaction: {error}"
                ))
            })
    }

    fn write_master_rekey_temp_durable(
        &self,
        artifact: &MasterRekeyArtifact,
        bytes: &[u8],
    ) -> MasterRekeyResult<()> {
        self.storage
            .write_artifact_durable(artifact.temp_artifact, bytes)
            .map_err(|error| {
                MasterRekeyError::integrity_failed(format!(
                    "Failed to stage master.verify: {}",
                    error.error
                ))
            })?;
        Ok(())
    }

    fn write_master_rekey_target_durable(
        &self,
        artifact: &MasterRekeyArtifact,
        bytes: &[u8],
    ) -> MasterRekeyResult<()> {
        self.storage
            .write_artifact_durable(artifact.target_artifact, bytes)
            .map_err(|error| {
                MasterRekeyError::integrity_failed(format!(
                    "Failed to commit master rekey artifact {}: {}",
                    artifact.name, error.error
                ))
            })?;
        Ok(())
    }

    fn registry_artifact_for_record(
        record: &MasterRekeyTransactionArtifact,
    ) -> MasterRekeyResult<&'static MasterRekeyArtifact> {
        MASTER_REKEY_ARTIFACTS
            .iter()
            .find(|artifact| {
                record.name == artifact.name
                    && record.target_name == artifact.file_name
                    && record.temp_name == master_rekey_temp_name(artifact)
            })
            .ok_or_else(|| {
                MasterRekeyError::integrity_failed(format!(
                    "Master rekey transaction artifact {} does not match registry",
                    record.name
                ))
            })
    }

    fn cleanup_orphaned_temps(&self) {
        for artifact in MASTER_REKEY_ARTIFACTS {
            let _ = self.storage.remove_artifact(artifact.temp_artifact);
        }
    }

    fn store(&self) -> DurableTxArtifactStore<'_, MasterRekeyParticipant> {
        DurableTxArtifactStore::new(
            self.storage,
            StorageArtifact::MasterRekeyTransaction,
            MasterRekeyParticipant,
        )
    }
}
