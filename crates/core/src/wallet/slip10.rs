//! SLIP-0010 Ed25519 hardened derivation shared by the TON and Solana profiles.

use hmac::{Hmac, Mac};
use sha2::Sha512;
use zeroize::Zeroizing;

use super::error::WalletChainError;

type HmacSha512 = Hmac<Sha512>;

/// Derives the 32-byte Ed25519 signing seed at `path`; every index is hardened, as SLIP-0010
/// requires for Ed25519.
pub(crate) fn slip10_ed25519_derive(
    seed: &[u8],
    path: &[u32],
) -> Result<Zeroizing<[u8; 32]>, WalletChainError> {
    let master = slip10_hmac(b"ed25519 seed", seed)?;
    let mut key = Zeroizing::new([0u8; 32]);
    let mut chain_code = Zeroizing::new([0u8; 32]);
    key.copy_from_slice(&master[..32]);
    chain_code.copy_from_slice(&master[32..]);
    for index in path {
        let hardened_index = index.checked_add(0x8000_0000).ok_or_else(|| {
            WalletChainError::invalid_input("SLIP-0010 derivation index is too large")
        })?;
        let mut data = Zeroizing::new(Vec::with_capacity(37));
        data.push(0);
        data.extend_from_slice(key.as_slice());
        data.extend_from_slice(&hardened_index.to_be_bytes());
        let digest = slip10_hmac(chain_code.as_slice(), data.as_slice())?;
        key.copy_from_slice(&digest[..32]);
        chain_code.copy_from_slice(&digest[32..]);
    }
    Ok(key)
}

fn slip10_hmac(key: &[u8], data: &[u8]) -> Result<Zeroizing<[u8; 64]>, WalletChainError> {
    let mut mac = HmacSha512::new_from_slice(key)
        .map_err(|error| WalletChainError::internal(format!("SLIP-0010 HMAC failed: {error}")))?;
    mac.update(data);
    let bytes = mac.finalize().into_bytes();
    let mut output = Zeroizing::new([0u8; 64]);
    output.copy_from_slice(&bytes);
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wallet::{hex_string, parse_hex};

    /// SLIP-0010 "Test vector 1 for ed25519" (seed `000102030405060708090a0b0c0d0e0f`).
    #[test]
    fn matches_slip10_ed25519_test_vector_one() {
        let seed = parse_hex("000102030405060708090a0b0c0d0e0f").expect("seed");
        let master = slip10_ed25519_derive(&seed, &[]).expect("master");
        assert_eq!(
            hex_string(master.as_slice()),
            "2b4be7f19ee27bbf30c667b642d5f4aa69fd169872f8fc3059c08ebae2eb19e7"
        );
        let child = slip10_ed25519_derive(&seed, &[0]).expect("m/0'");
        assert_eq!(
            hex_string(child.as_slice()),
            "68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3"
        );
        let deep = slip10_ed25519_derive(&seed, &[0, 1, 2, 2, 1_000_000_000])
            .expect("m/0'/1'/2'/2'/1000000000'");
        assert_eq!(
            hex_string(deep.as_slice()),
            "8f94d394a8e8fd6b1bc2f3f49f5c47e385281d5c17e65324b0f62483e37e8793"
        );
    }
}
