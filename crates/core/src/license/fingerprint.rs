use sha2::{Digest, Sha256};

const CORE_INSTANCE_FINGERPRINT_PREFIX: &str = "chromvoid-core-instance-v1:";

pub(super) fn device_fingerprint_for_instance_id(instance_id: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(CORE_INSTANCE_FINGERPRINT_PREFIX.as_bytes());
    hasher.update(instance_id.as_bytes());
    to_hex(&hasher.finalize())
}

fn to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}
