use crate::error::{Error, Result};
use crate::rpc::derivative_index;
use crate::storage::Storage;

use super::names::entry_data_chunk_name;
use super::types::{DerivativeStore, DerivativeStreamMetaRecord, ValidatedDerivativeRead};

impl DerivativeStore {
    pub(crate) fn read_validated(
        storage: &Storage,
        vault_key: &[u8; crate::types::KEY_SIZE],
        node_id: u64,
        source_version: u64,
        tier: &str,
        version: u32,
    ) -> Result<Option<ValidatedDerivativeRead>> {
        let Some(entry) = derivative_index::get_derivative_entry(
            storage,
            vault_key,
            node_id,
            source_version,
            tier,
            version,
        )?
        else {
            return Ok(None);
        };
        let encrypted_meta = match storage.read_chunk(&entry.meta_chunk_name) {
            Ok(bytes) => bytes,
            Err(Error::ChunkNotFound(_)) => return Ok(None),
            Err(error) => return Err(error),
        };
        let decrypted_meta = match crate::crypto::decrypt(
            &encrypted_meta,
            vault_key,
            entry.meta_chunk_name.as_bytes(),
        ) {
            Ok(bytes) => bytes,
            Err(_) => return Ok(None),
        };
        let meta = match serde_json::from_slice::<DerivativeStreamMetaRecord>(&decrypted_meta) {
            Ok(meta) => meta,
            Err(_) => return Ok(None),
        };

        for part_index in 0..entry.part_count {
            let chunk_name = entry_data_chunk_name(vault_key, &entry, part_index);
            if !storage.chunk_exists(&chunk_name)? {
                return Ok(None);
            }
        }

        Ok(Some(ValidatedDerivativeRead { meta, entry }))
    }
}
