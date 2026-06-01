use crate::catalog::RootIndex;
use crate::crypto::{decrypt, encrypt, root_index_chunk_name};
use crate::error::Result;
use crate::storage::Storage;
use crate::types::KEY_SIZE;

pub(crate) fn read_root_index(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    root_name: &str,
) -> Result<Option<RootIndex>> {
    if !storage.chunk_exists(root_name)? {
        return Ok(None);
    }

    let encrypted = storage.read_chunk(root_name)?;
    let plaintext = decrypt(&encrypted, vault_key, root_name.as_bytes())?;
    let root_index: RootIndex = serde_json::from_slice(&plaintext)?;
    Ok(root_index.is_sharded().then_some(root_index))
}

pub(crate) fn write_root_index(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    root_index: &RootIndex,
) -> Result<()> {
    let root_name = root_index_chunk_name(vault_key, 0);
    let root_plain = serde_json::to_vec(root_index)?;
    let root_enc = encrypt(&root_plain, vault_key, root_name.as_bytes())?;
    storage.write_chunk_atomic(&root_name, &root_enc)
}
