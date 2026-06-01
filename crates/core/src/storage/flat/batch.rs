use std::collections::BTreeSet;
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use std::sync::Arc;

use crate::error::{Error, Result};
use crate::storage::backend::{ChunkWriteBatchTemp, StorageBackend};

use super::FlatStorageBackend;

pub(crate) struct ChunkWriteBatch {
    backend: Arc<dyn StorageBackend>,
    tx_id_hint: String,
    pending: Vec<(String, Vec<u8>)>,
    temps: Vec<ChunkWriteBatchTemp>,
    written_names: Vec<String>,
    committed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ChunkWriteBatchOutcome {
    pub(crate) written_names: Vec<String>,
}

impl ChunkWriteBatch {
    pub(super) fn new(backend: Arc<dyn StorageBackend>, tx_id_hint: &str) -> Self {
        Self {
            backend,
            tx_id_hint: batch_tx_id(tx_id_hint),
            pending: Vec::new(),
            temps: Vec::new(),
            written_names: Vec::new(),
            committed: false,
        }
    }

    pub(crate) fn write_chunk(&mut self, name: impl Into<String>, bytes: &[u8]) -> Result<()> {
        let name = name.into();
        if name.len() < 3 || !name.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(Error::InvalidChunkName(format!(
                "chunk name must be hex: {name}"
            )));
        }
        self.pending.push((name, bytes.to_vec()));
        Ok(())
    }

    pub(crate) fn commit(&mut self) -> Result<ChunkWriteBatchOutcome> {
        let mut touched_parents = BTreeSet::new();

        for (sequence, (name, bytes)) in self.pending.iter().enumerate() {
            let temp =
                self.backend
                    .write_chunk_batch_temp(&self.tx_id_hint, sequence, name, bytes)?;
            touched_parents.insert(temp.parent_path.clone());
            let temp_index = self.temps.len();
            self.temps.push(temp);
            let Some(temp) = self.temps.get(temp_index) else {
                return Err(Error::StorageIo(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    "batch temp tracking failed",
                )));
            };
            self.backend.sync_chunk_batch_temp(temp)?;
        }

        for temp in &self.temps {
            self.backend.rename_chunk_batch_temp(temp)?;
            self.written_names.push(temp.name.clone());
        }

        for parent in &touched_parents {
            self.backend.sync_chunk_batch_parent(parent)?;
        }
        self.backend.sync()?;

        self.committed = true;
        let outcome = ChunkWriteBatchOutcome {
            written_names: self.written_names.clone(),
        };
        self.temps.clear();
        self.pending.clear();
        Ok(outcome)
    }

    pub(crate) fn rollback_temps(&mut self) {
        for temp in self.temps.iter().rev() {
            let _ = self.backend.remove_chunk_batch_temp(temp);
        }
        self.temps.clear();
    }

    pub(crate) fn written_names(&self) -> &[String] {
        &self.written_names
    }
}

impl Drop for ChunkWriteBatch {
    fn drop(&mut self) {
        if !self.committed {
            self.rollback_temps();
        }
    }
}

impl FlatStorageBackend {
    pub(crate) fn write_chunk_batch_temp(
        &self,
        tx_id_hint: &str,
        sequence: usize,
        name: &str,
        data: &[u8],
    ) -> Result<ChunkWriteBatchTemp> {
        let final_path = self.chunk_path(name)?;
        let parent_path = final_path
            .parent()
            .ok_or_else(|| {
                Error::StorageIo(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    "chunk path has no parent",
                ))
            })?
            .to_path_buf();
        fs::create_dir_all(&parent_path)?;
        let temp_path = parent_path.join(format!(".batch.{tx_id_hint}.{sequence}.{name}.tmp"));

        let mut file = File::create(&temp_path)?;
        file.write_all(data)?;
        Ok(ChunkWriteBatchTemp {
            name: name.to_string(),
            temp_path,
            final_path,
            parent_path,
        })
    }

    pub(crate) fn sync_chunk_batch_temp(&self, temp: &ChunkWriteBatchTemp) -> Result<()> {
        File::open(&temp.temp_path)?.sync_all()?;
        Ok(())
    }

    pub(crate) fn rename_chunk_batch_temp(&self, temp: &ChunkWriteBatchTemp) -> Result<()> {
        fs::rename(&temp.temp_path, &temp.final_path)?;
        Ok(())
    }

    pub(crate) fn sync_chunk_batch_parent(&self, parent: &Path) -> Result<()> {
        File::open(parent)?.sync_all()?;
        Ok(())
    }

    pub(crate) fn remove_chunk_batch_temp(&self, temp: &ChunkWriteBatchTemp) -> Result<()> {
        match fs::remove_file(&temp.temp_path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(Error::StorageIo(error)),
        }
    }
}

fn batch_tx_id(tx_id_hint: &str) -> String {
    let sanitized = tx_id_hint
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>();
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let prefix = sanitized.trim_matches('-');
    if prefix.is_empty() {
        format!("batch-{nonce}")
    } else {
        format!("{prefix}-{nonce}")
    }
}
