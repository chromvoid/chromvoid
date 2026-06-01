use std::io::{self, Read};
use std::sync::Arc;
use zeroize::Zeroize;

use crate::storage::Storage;
use crate::vault::{DecryptedChunkCache, DecryptedChunkCacheKey};

pub struct CatalogBlobRangeReader {
    storage: Storage,
    vault_key: zeroize::Zeroizing<[u8; crate::types::KEY_SIZE]>,
    node_id: u32,
    chunk_size: u64,
    chunk_size_key: u32,
    file_size: u64,
    cursor: u64,
    end: u64,
    buf: zeroize::Zeroizing<Vec<u8>>,
    buf_chunk_index: Option<u64>,
    pos: usize,
    cache: Option<Arc<DecryptedChunkCache>>,
    source_revision: u64,
    cache_generation: u64,
}

impl CatalogBlobRangeReader {
    #[allow(clippy::too_many_arguments)]
    pub fn new_cached(
        storage: Storage,
        vault_key: &[u8; crate::types::KEY_SIZE],
        node_id: u32,
        source_revision: u64,
        cache: Arc<DecryptedChunkCache>,
        cache_generation: u64,
        offset: u64,
        length: u64,
        chunk_size: u32,
        file_size: u64,
    ) -> Self {
        Self {
            storage,
            vault_key: zeroize::Zeroizing::new(*vault_key),
            node_id,
            chunk_size: u64::from(chunk_size),
            chunk_size_key: chunk_size,
            file_size,
            cursor: offset,
            end: offset.saturating_add(length),
            buf: zeroize::Zeroizing::new(Vec::new()),
            buf_chunk_index: None,
            pos: 0,
            cache: Some(cache),
            source_revision,
            cache_generation,
        }
    }

    fn load_chunk_for_cursor(&mut self) -> io::Result<()> {
        if self.chunk_size == 0 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "invalid chunk size",
            ));
        }

        let chunk_index = self.cursor / self.chunk_size;
        if self.buf_chunk_index == Some(chunk_index) && self.pos < self.buf.len() {
            return Ok(());
        }

        let chunk_index_u32 = u32::try_from(chunk_index)
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "invalid chunk index"))?;
        let chunk_start = chunk_index.saturating_mul(self.chunk_size);
        let expected_len =
            std::cmp::min(self.chunk_size, self.file_size.saturating_sub(chunk_start)) as usize;
        if expected_len == 0 {
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                "range points past end of file",
            ));
        }

        let cache_key = DecryptedChunkCacheKey {
            node_id: u64::from(self.node_id),
            source_revision: self.source_revision,
            chunk_index,
            chunk_size: self.chunk_size_key,
        };
        if let Some(cache) = self.cache.as_ref() {
            if let Some(mut plaintext) = cache.get(&cache_key) {
                if plaintext.len() < expected_len {
                    plaintext.zeroize();
                    return Err(io::Error::new(
                        io::ErrorKind::UnexpectedEof,
                        "short cached chunk",
                    ));
                }
                plaintext.truncate(expected_len);
                self.buf.zeroize();
                self.buf = plaintext;
                self.buf_chunk_index = Some(chunk_index);
                self.pos = self.cursor.saturating_sub(chunk_start) as usize;
                return Ok(());
            }
        }

        let chunk_name =
            crate::crypto::blob_chunk_name(&*self.vault_key, self.node_id, chunk_index_u32);
        let encrypted = self.storage.read_chunk(&chunk_name).map_err(|error| {
            io::Error::new(
                io::ErrorKind::NotFound,
                format!("chunk read failed: {error}"),
            )
        })?;

        let mut plaintext =
            crate::crypto::decrypt(&encrypted, &*self.vault_key, chunk_name.as_bytes()).map_err(
                |error| {
                    io::Error::new(
                        io::ErrorKind::InvalidData,
                        format!("decryption failed: {error}"),
                    )
                },
            )?;

        if plaintext.len() < expected_len {
            plaintext.zeroize();
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                "short decrypted chunk",
            ));
        }
        plaintext.truncate(expected_len);

        if let Some(cache) = self.cache.as_ref() {
            cache.insert(self.cache_generation, cache_key, &plaintext);
        }

        self.buf.zeroize();
        self.buf = zeroize::Zeroizing::new(plaintext);
        self.buf_chunk_index = Some(chunk_index);
        self.pos = self.cursor.saturating_sub(chunk_start) as usize;
        Ok(())
    }
}

impl Read for CatalogBlobRangeReader {
    fn read(&mut self, out: &mut [u8]) -> io::Result<usize> {
        if out.is_empty() || self.cursor >= self.end {
            return Ok(0);
        }

        let mut written = 0usize;
        while written < out.len() && self.cursor < self.end {
            self.load_chunk_for_cursor()?;

            if self.pos >= self.buf.len() {
                self.buf.zeroize();
                self.buf_chunk_index = None;
                continue;
            }

            let available = self.buf.len().saturating_sub(self.pos);
            let requested = (self.end - self.cursor) as usize;
            let to_copy = std::cmp::min(out.len() - written, std::cmp::min(available, requested));
            if to_copy == 0 {
                break;
            }

            out[written..written + to_copy]
                .copy_from_slice(&self.buf[self.pos..self.pos + to_copy]);
            self.pos = self.pos.saturating_add(to_copy);
            self.cursor = self.cursor.saturating_add(to_copy as u64);
            written = written.saturating_add(to_copy);
        }

        Ok(written)
    }
}
