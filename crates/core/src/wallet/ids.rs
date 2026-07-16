use super::error::WalletChainError;

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

pub fn new_wallet_id() -> String {
    random_id("wallet")
}

pub fn new_account_id() -> String {
    random_id("account")
}

pub fn new_secret_id() -> String {
    random_id("secret")
}

pub fn new_preparation_id() -> String {
    random_id("prep")
}

pub fn new_mnemonic_draft_id() -> String {
    random_id("mnemonic-draft")
}

pub fn new_tx_ref() -> String {
    random_id("tx")
}

pub fn new_address_book_entry_id() -> String {
    random_id("contact")
}

fn random_id(prefix: &str) -> String {
    let mut bytes = [0u8; 16];
    if getrandom::getrandom(&mut bytes).is_err() {
        let fallback = now_ms().to_le_bytes();
        bytes[..fallback.len()].copy_from_slice(&fallback);
    }
    format!("{prefix}-{}", hex_string(&bytes))
}

pub fn hex_string(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

pub fn parse_hex(input: &str) -> Result<Vec<u8>, WalletChainError> {
    if !input.len().is_multiple_of(2) {
        return Err(WalletChainError::invalid_input("hex string length is odd"));
    }
    input
        .as_bytes()
        .chunks(2)
        .map(|chunk| {
            let hi = hex_nibble(chunk[0])?;
            let lo = hex_nibble(chunk[1])?;
            Ok((hi << 4) | lo)
        })
        .collect()
}

fn hex_nibble(byte: u8) -> Result<u8, WalletChainError> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        b'A'..=b'F' => Ok(byte - b'A' + 10),
        _ => Err(WalletChainError::invalid_input("invalid hex character")),
    }
}

pub fn hash_hex(parts: &[&[u8]]) -> String {
    let mut hasher = blake3::Hasher::new();
    for part in parts {
        hasher.update(part);
    }
    hasher.finalize().to_hex().to_string()
}
