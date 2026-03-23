//! SHA-256 helpers

use sha2::{Digest, Sha256};
use std::io::Read;

pub fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    let digest = hasher.finalize();
    hex::encode(&digest)
}

pub fn sha256_hex_reader<R: Read>(mut reader: R) -> std::io::Result<String> {
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 8192];
    loop {
        let read = reader.read(&mut buf)?;
        if read == 0 {
            break;
        }
        hasher.update(&buf[..read]);
    }
    let digest = hasher.finalize();
    Ok(hex::encode(&digest))
}

mod hex {
    const HEX_CHARS: &[u8; 16] = b"0123456789abcdef";

    pub fn encode(data: &[u8]) -> String {
        let mut result = String::with_capacity(data.len() * 2);
        for byte in data {
            result.push(HEX_CHARS[(byte >> 4) as usize] as char);
            result.push(HEX_CHARS[(byte & 0x0F) as usize] as char);
        }
        result
    }
}
