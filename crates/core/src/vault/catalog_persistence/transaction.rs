use crate::crypto::catalog_commit_chunk_name;
use crate::durable_tx::{
    DurableTxEncryptedParticipant, DurableTxParticipant, DurableTxPhase, DurableTxRecord,
    DurableTxStore,
};
use crate::error::Result;
use crate::storage::Storage;
use crate::types::KEY_SIZE;

use super::chunks::{delete_chunks, unique};
use super::root_index::write_root_index;
use super::types::CatalogCommitRecord;

struct CatalogCommitParticipant;

impl DurableTxParticipant for CatalogCommitParticipant {
    const KIND: &'static str = "catalog_commit";
    const VERSION: u8 = 1;
    type Payload = CatalogCommitRecord;

    fn marker_context(&self) -> &'static [u8] {
        b"catalog:commit:v1"
    }

    fn marker_name(&self, vault_key: &[u8; KEY_SIZE]) -> String {
        catalog_commit_chunk_name(vault_key)
    }

    fn validate_payload(&self, payload: &Self::Payload) -> bool {
        payload.v == 1
    }
}

impl DurableTxEncryptedParticipant for CatalogCommitParticipant {
    fn rollback_staging_encrypted(
        &self,
        storage: &Storage,
        _vault_key: &[u8; KEY_SIZE],
        record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()> {
        delete_chunks(storage, &record.payload.new_chunks)
    }

    fn recover_committing_encrypted(
        &self,
        storage: &Storage,
        vault_key: &[u8; KEY_SIZE],
        record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()> {
        let payload = &record.payload;
        if payload
            .new_chunks
            .iter()
            .all(|chunk| storage.chunk_exists(chunk).unwrap_or(false))
        {
            write_root_index(storage, vault_key, &payload.root_index)?;
            delete_chunks(storage, &payload.old_chunks)
        } else {
            delete_chunks(storage, &payload.new_chunks)
        }
    }

    fn cleanup_encrypted(
        &self,
        storage: &Storage,
        _vault_key: &[u8; KEY_SIZE],
        _record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()> {
        storage.sync()
    }
}

pub(crate) struct CatalogCommitService<'a> {
    storage: &'a Storage,
    vault_key: &'a [u8; KEY_SIZE],
}

impl<'a> CatalogCommitService<'a> {
    pub(crate) fn new(storage: &'a Storage, vault_key: &'a [u8; KEY_SIZE]) -> Self {
        Self { storage, vault_key }
    }

    pub(crate) fn recover_incomplete_commit(&self) -> Result<()> {
        let store = self.store();
        if store.read_participant_record()?.is_some() {
            return store.recover_encrypted_participant();
        }

        let Some(record) = self.read_legacy_commit_record()? else {
            return Ok(());
        };

        match record.phase {
            DurableTxPhase::Staging => {
                delete_chunks(self.storage, &record.new_chunks)?;
                self.delete_commit_record()?;
            }
            DurableTxPhase::Committing => {
                if record
                    .new_chunks
                    .iter()
                    .all(|chunk| self.storage.chunk_exists(chunk).unwrap_or(false))
                {
                    write_root_index(self.storage, self.vault_key, &record.root_index)?;
                    delete_chunks(self.storage, &record.old_chunks)?;
                } else {
                    delete_chunks(self.storage, &record.new_chunks)?;
                }
                self.delete_commit_record()?;
            }
        }

        self.storage.sync()?;
        Ok(())
    }

    pub(crate) fn commit_root_index_update(
        &self,
        root_index: &crate::catalog::RootIndex,
        new_chunks: Vec<String>,
        old_chunks: Vec<String>,
        commit_id: String,
    ) -> Result<()> {
        let mut record = CatalogCommitRecord {
            v: 1,
            id: commit_id,
            phase: DurableTxPhase::Staging,
            root_version: root_index.root_version,
            new_chunks: unique(new_chunks),
            old_chunks: unique(old_chunks),
            root_index: root_index.clone(),
        };
        self.write_commit_record(&record)?;
        self.storage.sync()?;

        record.phase = DurableTxPhase::Committing;
        self.write_commit_record(&record)?;
        self.storage.sync()?;

        write_root_index(self.storage, self.vault_key, root_index)?;

        self.delete_commit_record()?;
        delete_chunks(self.storage, &record.old_chunks)?;
        self.storage.sync()?;

        Ok(())
    }

    pub(crate) fn write_commit_record(&self, record: &CatalogCommitRecord) -> Result<()> {
        let store = self.store();
        match record.phase {
            DurableTxPhase::Staging => store.write_staging(record.id.clone(), record),
            DurableTxPhase::Committing => store.write_committing(record.id.clone(), record),
        }
    }

    pub(crate) fn delete_commit_record(&self) -> Result<()> {
        self.store().delete()
    }

    fn read_legacy_commit_record(&self) -> Result<Option<CatalogCommitRecord>> {
        let store = self.store();
        match store.read_legacy_payload::<CatalogCommitRecord>()? {
            Some(record) if record.v == 1 => Ok(Some(record)),
            Some(_) => {
                let _ = store.delete_record();
                Ok(None)
            }
            None => {
                if self
                    .storage
                    .chunk_exists(&catalog_commit_chunk_name(self.vault_key))?
                {
                    let _ = store.delete_record();
                }
                Ok(None)
            }
        }
    }

    fn store(&self) -> DurableTxStore<'_, CatalogCommitParticipant> {
        DurableTxStore::new(self.storage, self.vault_key, CatalogCommitParticipant)
    }
}
