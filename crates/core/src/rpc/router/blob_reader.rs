use std::io::{self, Read};
use zeroize::Zeroize;

use crate::storage::Storage;

pub struct CatalogBlobReader {
    storage: Storage,
    vault_key: zeroize::Zeroizing<[u8; crate::types::KEY_SIZE]>,
    node_id: u32,
    part_index: u32,
    buf: zeroize::Zeroizing<Vec<u8>>,
    pos: usize,
    done: bool,
}

impl CatalogBlobReader {
    pub fn new(storage: Storage, vault_key: &[u8; crate::types::KEY_SIZE], node_id: u32) -> Self {
        Self {
            storage,
            vault_key: zeroize::Zeroizing::new(*vault_key),
            node_id,
            part_index: 0,
            buf: zeroize::Zeroizing::new(Vec::new()),
            pos: 0,
            done: false,
        }
    }

    fn load_next_chunk(&mut self) -> io::Result<()> {
        let chunk_name =
            crate::crypto::blob_chunk_name(&*self.vault_key, self.node_id, self.part_index);
        let encrypted = match self.storage.read_chunk(&chunk_name) {
            Ok(d) => d,
            Err(_) => {
                self.done = true;
                return Ok(());
            }
        };

        let plaintext = crate::crypto::decrypt(&encrypted, &*self.vault_key, chunk_name.as_bytes())
            .map_err(|e| {
                io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!("Decryption failed: {e}"),
                )
            })?;

        self.part_index = self.part_index.saturating_add(1);
        self.buf = zeroize::Zeroizing::new(plaintext);
        self.pos = 0;
        Ok(())
    }
}

impl Read for CatalogBlobReader {
    fn read(&mut self, out: &mut [u8]) -> io::Result<usize> {
        if out.is_empty() {
            return Ok(0);
        }

        let mut written = 0usize;
        while written < out.len() {
            if self.done {
                break;
            }

            if self.pos >= self.buf.len() {
                self.buf.zeroize();
                self.pos = 0;
                self.load_next_chunk()?;
                continue;
            }

            let available = self.buf.len().saturating_sub(self.pos);
            if available == 0 {
                continue;
            }

            let to_copy = std::cmp::min(out.len() - written, available);
            out[written..written + to_copy]
                .copy_from_slice(&self.buf[self.pos..self.pos + to_copy]);

            self.pos = self.pos.saturating_add(to_copy);
            written = written.saturating_add(to_copy);
        }

        Ok(written)
    }
}
