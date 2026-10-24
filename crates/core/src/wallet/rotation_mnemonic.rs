//! TEP-0003 §3.3 Rotation mnemonic: 24 BIP39 words made of two independent 12-word halves.
//!
//! Words 1–12 (the *anchor* half) fix the WalletTg account address and authorize the first
//! rotation. Words 13–24 (the *signing* half) sign ordinary requests and are replaced by every
//! on-chain `ChangePublicKey`. Before the first rotation the two halves are identical, so the
//! user holds a single 12-word phrase; the 24-word form appears after the first rotation.
//! Each half is converted to keys on its own; the halves are never joined or combined.

use bip39::{Language, Mnemonic};
use zeroize::Zeroizing;

use super::WalletChainError;

/// Words in one BIP39 half.
pub const ROTATION_HALF_WORD_COUNT: usize = 12;
/// Words in a rotated (two-half) phrase.
pub const ROTATION_FULL_WORD_COUNT: usize = 2 * ROTATION_HALF_WORD_COUNT;

pub fn normalize_rotation_words(words: &[String]) -> Vec<String> {
    words
        .iter()
        .map(|word| word.trim().to_lowercase())
        .filter(|word| !word.is_empty())
        .collect()
}

/// Accepts the 12-word initial form or the 24-word rotated form; each half must carry a valid
/// BIP39 checksum. Halves that repeat each other are the initial form spelled out in full.
pub fn validate_rotation_mnemonic(words: &[String]) -> Result<(), WalletChainError> {
    let (anchor, signing) = rotation_halves(words)?;
    validate_half(anchor)?;
    validate_half(signing)?;
    Ok(())
}

/// Splits a phrase into `(anchor, signing)` halves. A 12-word phrase yields the same half twice.
pub fn rotation_halves(words: &[String]) -> Result<(&[String], &[String]), WalletChainError> {
    match words.len() {
        ROTATION_HALF_WORD_COUNT => Ok((words, words)),
        ROTATION_FULL_WORD_COUNT => Ok((
            &words[..ROTATION_HALF_WORD_COUNT],
            &words[ROTATION_HALF_WORD_COUNT..],
        )),
        _ => Err(WalletChainError::invalid_input(
            "rotation mnemonic must contain 12 or 24 words",
        )),
    }
}

/// True when the phrase is still in its initial form (signing half equals the anchor half).
pub fn is_initial_form(words: &[String]) -> bool {
    match rotation_halves(words) {
        Ok((anchor, signing)) => anchor == signing,
        Err(_) => false,
    }
}

/// Canonical stored form: 12 words before the first rotation, 24 words after it.
pub fn canonical_rotation_words(anchor: &[String], signing: &[String]) -> Vec<String> {
    if anchor == signing {
        anchor.to_vec()
    } else {
        anchor.iter().chain(signing.iter()).cloned().collect()
    }
}

/// BIP39 seed of one half (empty passphrase, per TEP-0003 §3.1 Multichain derivation).
pub fn rotation_half_seed(half: &[String]) -> Result<Zeroizing<[u8; 64]>, WalletChainError> {
    let mnemonic = parse_half(half)?;
    Ok(Zeroizing::new(mnemonic.to_seed("")))
}

/// A fresh 12-word half from the OS random source.
pub fn generate_rotation_half() -> Result<Vec<String>, WalletChainError> {
    let mnemonic =
        Mnemonic::generate_in(Language::English, ROTATION_HALF_WORD_COUNT).map_err(|error| {
            WalletChainError::internal(format!("rotation mnemonic generation failed: {error}"))
        })?;
    Ok(mnemonic.words().map(str::to_string).collect())
}

fn validate_half(half: &[String]) -> Result<(), WalletChainError> {
    parse_half(half).map(|_| ())
}

fn parse_half(half: &[String]) -> Result<Mnemonic, WalletChainError> {
    if half.len() != ROTATION_HALF_WORD_COUNT {
        return Err(WalletChainError::invalid_input(
            "rotation mnemonic half must contain 12 words",
        ));
    }
    let phrase = Zeroizing::new(half.join(" "));
    Mnemonic::parse_in_normalized(Language::English, phrase.as_str()).map_err(|error| {
        WalletChainError::invalid_input(format!("invalid rotation mnemonic half: {error}"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn words(text: &str) -> Vec<String> {
        text.split_whitespace().map(str::to_string).collect()
    }

    const HALF: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const OTHER_HALF: &str =
        "notice tortoise soup strong gun divide offer process salon siren general carry";

    #[test]
    fn accepts_initial_and_rotated_forms() {
        validate_rotation_mnemonic(&words(HALF)).expect("12-word initial form");
        validate_rotation_mnemonic(&words(&format!("{HALF} {HALF}")))
            .expect("24-word initial form spelled out");
        validate_rotation_mnemonic(&words(&format!("{HALF} {OTHER_HALF}")))
            .expect("24-word rotated form");
        assert!(is_initial_form(&words(HALF)));
        assert!(!is_initial_form(&words(&format!("{HALF} {OTHER_HALF}"))));
    }

    #[test]
    fn rejects_wrong_lengths_and_broken_half_checksums() {
        assert!(validate_rotation_mnemonic(&words("abandon abandon")).is_err());
        let mut broken = words(&format!("{HALF} {OTHER_HALF}"));
        broken[23] = "abandon".to_string();
        assert!(validate_rotation_mnemonic(&broken).is_err());
        let mut broken_anchor = words(HALF);
        broken_anchor[11] = "abandon".to_string();
        assert!(validate_rotation_mnemonic(&broken_anchor).is_err());
    }

    #[test]
    fn halves_are_seeded_independently_and_never_joined() {
        let anchor = words(HALF);
        let full = words(&format!("{HALF} {OTHER_HALF}"));
        let (a, s) = rotation_halves(&full).expect("halves");
        assert_eq!(a, anchor.as_slice());
        assert_eq!(
            rotation_half_seed(a).expect("anchor seed").as_slice(),
            rotation_half_seed(&anchor)
                .expect("same anchor seed")
                .as_slice()
        );
        assert_ne!(
            rotation_half_seed(a).expect("anchor").as_slice(),
            rotation_half_seed(s).expect("signing").as_slice()
        );
        assert_eq!(canonical_rotation_words(a, a), anchor);
        assert_eq!(canonical_rotation_words(a, s), full);
    }

    #[test]
    fn generated_half_is_valid_and_unique() {
        let first = generate_rotation_half().expect("half");
        let second = generate_rotation_half().expect("half");
        assert_eq!(first.len(), 12);
        validate_rotation_mnemonic(&first).expect("valid");
        assert_ne!(first, second);
    }
}
