//! TON-native mnemonic derivation helpers (SPEC-228).

use bip39::Language;
use hmac::{Hmac, Mac};
use pbkdf2::pbkdf2_hmac;
use sha2::Sha512;
use zeroize::Zeroizing;

use super::{parse_hex, WalletChainError};

pub const TON_NATIVE_WORD_COUNT: usize = 24;
const TON_DEFAULT_SEED: &[u8] = b"TON default seed";
const TON_SEED_VERSION: &[u8] = b"TON seed version";
const TON_DEFAULT_SEED_ITERATIONS: u32 = 100_000;
const TON_SEED_VERSION_ITERATIONS: u32 = 390;

type HmacSha512 = Hmac<Sha512>;

pub fn normalize_ton_native_words(words: &[String]) -> Vec<String> {
    words
        .iter()
        .map(|word| word.trim().to_ascii_lowercase())
        .collect()
}

pub fn validate_ton_native_mnemonic(words: &[String]) -> Result<(), WalletChainError> {
    let words = normalize_ton_native_words(words);
    if words.len() != TON_NATIVE_WORD_COUNT {
        return Err(WalletChainError::invalid_input(
            "ton_native mnemonic must contain 24 words",
        ));
    }
    let wordlist = Language::English.word_list();
    for word in &words {
        if wordlist.binary_search(&word.as_str()).is_err() {
            return Err(WalletChainError::invalid_input(
                "ton_native mnemonic contains a word outside the english wordlist",
            ));
        }
    }
    let seed_version = ton_native_seed64(&words, TON_SEED_VERSION, TON_SEED_VERSION_ITERATIONS)?;
    if seed_version[0] != 0 {
        return Err(WalletChainError::invalid_input(
            "ton_native mnemonic does not match TON seed version",
        ));
    }
    Ok(())
}

pub fn ton_native_seed_from_words(
    words: &[String],
) -> Result<Zeroizing<[u8; 32]>, WalletChainError> {
    let words = normalize_ton_native_words(words);
    validate_ton_native_mnemonic(&words)?;
    let seed = ton_native_seed64(&words, TON_DEFAULT_SEED, TON_DEFAULT_SEED_ITERATIONS)?;
    let mut signing_seed = Zeroizing::new([0u8; 32]);
    signing_seed.copy_from_slice(&seed[..32]);
    Ok(signing_seed)
}

pub fn generate_ton_native_mnemonic() -> Result<Vec<String>, WalletChainError> {
    let wordlist = Language::English.word_list();
    loop {
        let mut random = Zeroizing::new([0u8; TON_NATIVE_WORD_COUNT * 2]);
        getrandom::getrandom(&mut *random).map_err(|error| {
            WalletChainError::internal(format!("TON mnemonic generation failed: {error}"))
        })?;
        let words = random
            .chunks_exact(2)
            .map(|chunk| {
                let index = (u16::from_le_bytes([chunk[0], chunk[1]]) as usize) & 2047;
                wordlist[index].to_string()
            })
            .collect::<Vec<_>>();
        if validate_ton_native_mnemonic(&words).is_ok() {
            return Ok(words);
        }
    }
}

pub fn legacy_ton_native_words_from_bip39_entropy(
    mnemonic_entropy: &str,
) -> Result<Vec<String>, WalletChainError> {
    let entropy = Zeroizing::new(parse_hex(mnemonic_entropy)?);
    let mnemonic = bip39::Mnemonic::from_entropy_in(Language::English, entropy.as_slice())
        .map_err(|error| WalletChainError::invalid_input(format!("invalid HD root: {error}")))?;
    Ok(mnemonic.words().map(str::to_string).collect())
}

fn ton_native_seed64(
    words: &[String],
    salt: &[u8],
    iterations: u32,
) -> Result<Zeroizing<[u8; 64]>, WalletChainError> {
    let phrase = Zeroizing::new(words.join(" "));
    let mut mac = HmacSha512::new_from_slice(phrase.as_bytes()).map_err(|error| {
        WalletChainError::internal(format!("TON mnemonic HMAC initialization failed: {error}"))
    })?;
    mac.update(b"");
    let entropy = Zeroizing::new(mac.finalize().into_bytes().to_vec());
    let mut seed = Zeroizing::new([0u8; 64]);
    pbkdf2_hmac::<Sha512>(&entropy, salt, iterations, &mut *seed);
    Ok(seed)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn non_bip39_ton_native_words() -> Vec<String> {
        "open price dish charge law skirt alien churn fire swap number brass outdoor diamond lesson april remain puzzle title elbow valley grant champion staff"
            .split_whitespace()
            .map(str::to_string)
            .collect()
    }

    #[test]
    fn ton_native_vector_validates_and_derives_seed() {
        let words = non_bip39_ton_native_words();
        validate_ton_native_mnemonic(&words).expect("valid TON-native mnemonic");
        let seed = ton_native_seed_from_words(&words).expect("TON-native seed");
        assert_eq!(
            crate::wallet::hex_string(seed.as_slice()),
            "0f531e609f8ccf8548fcb7f018c60a7049af809dfd112e9809b64693316af236"
        );
    }

    #[test]
    fn ton_native_rejects_seed_version_mismatch() {
        let words = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art"
            .split_whitespace()
            .map(str::to_string)
            .collect::<Vec<_>>();
        assert!(validate_ton_native_mnemonic(&words).is_err());
    }

    #[test]
    fn ton_native_generate_returns_valid_phrase() {
        let words = generate_ton_native_mnemonic().expect("generated TON-native mnemonic");
        assert_eq!(words.len(), TON_NATIVE_WORD_COUNT);
        validate_ton_native_mnemonic(&words).expect("generated mnemonic validates");
    }
}
