use std::{fmt, str::FromStr};

use bip39::{Language, Mnemonic};
use zeroize::Zeroizing;

use crate::rpc::types::{DerivedAccountMetaV1, WalletNetwork};

use super::{new_account_id, parse_hex, WalletChainError};

#[derive(Clone)]
pub enum WalletRoot {
    Bip39 {
        entropy: Zeroizing<String>,
        passphrase: Option<Zeroizing<String>>,
    },
    TonNative {
        words: Zeroizing<Vec<String>>,
    },
}

impl WalletRoot {
    pub fn bip39_seed(&self) -> Result<Zeroizing<[u8; 64]>, WalletChainError> {
        let passphrase = match self {
            Self::Bip39 { passphrase, .. } => passphrase.as_ref().map(|value| value.as_str()),
            Self::TonNative { .. } => None,
        };
        self.seed_with_passphrase(passphrase.unwrap_or(""))
    }

    pub fn bip39_bare_seed(&self) -> Result<Zeroizing<[u8; 64]>, WalletChainError> {
        self.seed_with_passphrase("")
    }

    fn seed_with_passphrase(
        &self,
        passphrase: &str,
    ) -> Result<Zeroizing<[u8; 64]>, WalletChainError> {
        let Self::Bip39 { entropy, .. } = self else {
            return Err(WalletChainError::unsupported_account_model(
                "account scheme requires a BIP39 root",
            ));
        };
        let entropy = Zeroizing::new(parse_hex(entropy)?);
        let mnemonic = Mnemonic::from_entropy_in(Language::English, &entropy).map_err(|error| {
            WalletChainError::invalid_input(format!("invalid BIP39 root: {error}"))
        })?;
        Ok(Zeroizing::new(mnemonic.to_seed(passphrase)))
    }
}

impl fmt::Debug for WalletRoot {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Bip39 { .. } => formatter
                .debug_struct("Bip39")
                .field("entropy", &"[redacted]")
                .field("passphrase", &"[redacted]")
                .finish(),
            Self::TonNative { .. } => formatter
                .debug_struct("TonNative")
                .field("words", &"[redacted]")
                .finish(),
        }
    }
}

#[derive(Clone)]
pub struct TonSigningState {
    pub signing_words: Option<Zeroizing<Vec<String>>>,
    pub pending_words: Option<Zeroizing<Vec<String>>>,
    pub pending_valid_until: Option<u32>,
}

impl fmt::Debug for TonSigningState {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("TonSigningState")
            .field("signing_words", &"[redacted]")
            .field("pending_words", &"[redacted]")
            .field("pending_valid_until", &self.pending_valid_until)
            .finish()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccountScheme {
    BitcoinBip84Account,
    EthereumEip44Account,
    SolanaBip44Account,
    TonBip39WalletTgAccount,
    TonRotationWalletTgAccount,
    TonNativeWalletTgAccount,
}

impl AccountScheme {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::BitcoinBip84Account => "bitcoin_bip84_account",
            Self::EthereumEip44Account => "ethereum_eip44_account",
            Self::SolanaBip44Account => "solana_bip44_account",
            Self::TonBip39WalletTgAccount => "ton_bip39_wallet_tg_account",
            Self::TonRotationWalletTgAccount => "ton_rotation_wallet_tg_account",
            Self::TonNativeWalletTgAccount => "ton_native_wallet_tg_account",
        }
    }

    pub fn ensure_compatible(self, root: &WalletRoot) -> Result<(), WalletChainError> {
        let compatible = match self {
            Self::TonNativeWalletTgAccount => matches!(root, WalletRoot::TonNative { .. }),
            _ => matches!(root, WalletRoot::Bip39 { .. }),
        };
        if !compatible {
            return Err(WalletChainError::unsupported_account_model(
                "account scheme is incompatible with wallet root",
            ));
        }
        Ok(())
    }
}

impl FromStr for AccountScheme {
    type Err = WalletChainError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "bitcoin_bip84_account" => Ok(Self::BitcoinBip84Account),
            "ethereum_eip44_account" => Ok(Self::EthereumEip44Account),
            "solana_bip44_account" => Ok(Self::SolanaBip44Account),
            "ton_bip39_wallet_tg_account" => Ok(Self::TonBip39WalletTgAccount),
            "ton_rotation_wallet_tg_account" => Ok(Self::TonRotationWalletTgAccount),
            "ton_native_wallet_tg_account" => Ok(Self::TonNativeWalletTgAccount),
            _ => Err(WalletChainError::unsupported_account_model(
                "unsupported account scheme",
            )),
        }
    }
}

pub(crate) fn derived_account_meta(
    wallet_id: String,
    network: WalletNetwork,
    scheme: AccountScheme,
    account_index: u32,
    now: u64,
) -> DerivedAccountMetaV1 {
    DerivedAccountMetaV1 {
        account_id: new_account_id(),
        wallet_id,
        network,
        wallet_mode: None,
        mnemonic_standard: String::new(),
        account_model: "account".to_string(),
        derivation_profile: scheme.as_str().to_string(),
        wallet_contract: None,
        account_index: Some(account_index),
        workchain: None,
        label: None,
        address: None,
        raw_account: None,
        public_key: None,
        derivation_path: None,
        current_receive_address: None,
        current_receive_derivation_path: None,
        next_receive_index: None,
        next_change_index: None,
        created_at: now,
        updated_at: now,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wallet::{HdRootRecoveryMaterialV2, SecretPayloadV1, WalletChainErrorCode};

    const ENTROPY: &str = "00000000000000000000000000000000";
    const WORDS: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const SIGNING_WORDS: &str =
        "notice tortoise soup strong gun divide offer process salon siren general carry";

    fn words(phrase: &str) -> Vec<String> {
        phrase.split_whitespace().map(str::to_string).collect()
    }

    fn bip39_secret(passphrase: Option<&str>) -> SecretPayloadV1 {
        SecretPayloadV1::hd_root_v2(
            "bip39",
            ENTROPY.to_string(),
            "english".to_string(),
            None,
            passphrase.map(str::to_string),
        )
    }

    fn rotation_secret(phrase: &str, passphrase: Option<&str>) -> SecretPayloadV1 {
        SecretPayloadV1::hd_root_v2(
            "rotation",
            String::new(),
            "english".to_string(),
            Some(words(phrase)),
            passphrase.map(str::to_string),
        )
    }

    #[test]
    fn bip39_v2_maps_to_bip39_root() {
        let (root, signing) = bip39_secret(None).wallet_root().expect("root");
        let WalletRoot::Bip39 {
            entropy,
            passphrase,
        } = &root
        else {
            panic!("expected BIP39 root");
        };
        assert_eq!(entropy.as_str(), ENTROPY);
        assert!(passphrase.is_none());
        assert!(signing.is_none());
        let mnemonic = Mnemonic::parse_in_normalized(Language::English, WORDS).expect("words");
        assert_eq!(*root.bip39_seed().expect("seed"), mnemonic.to_seed(""));
        assert_eq!(
            *root.bip39_bare_seed().expect("bare seed"),
            mnemonic.to_seed("")
        );
    }

    #[test]
    fn bip39_v2_preserves_passphrase() {
        let (root, signing) = bip39_secret(Some("TREZOR")).wallet_root().expect("root");
        let WalletRoot::Bip39 {
            entropy,
            passphrase,
        } = &root
        else {
            panic!("expected BIP39 root");
        };
        assert_eq!(entropy.as_str(), ENTROPY);
        assert_eq!(
            passphrase.as_ref().map(|value| value.as_str()),
            Some("TREZOR")
        );
        assert!(signing.is_none());
        let mnemonic = Mnemonic::parse_in_normalized(Language::English, WORDS).expect("words");
        assert_eq!(
            *root.bip39_seed().expect("seed"),
            mnemonic.to_seed("TREZOR")
        );
        assert_eq!(
            *root.bip39_bare_seed().expect("bare seed"),
            mnemonic.to_seed("")
        );
        let debug = format!("{root:?}");
        assert!(!debug.contains(ENTROPY));
        assert!(!debug.contains("TREZOR"));
    }

    #[test]
    fn ton_native_v2_maps_to_native_root() {
        let phrase = words(&format!("{WORDS} {SIGNING_WORDS}"));
        let secret = SecretPayloadV1::HdRootV2 {
            wordlist: "english".to_string(),
            recovery: HdRootRecoveryMaterialV2::TonNative {
                mnemonic_words: phrase.clone(),
            },
        };
        let (root, signing) = secret.wallet_root().expect("root");
        let WalletRoot::TonNative { words } = &root else {
            panic!("expected TON native root");
        };
        assert_eq!(words.as_slice(), phrase.as_slice());
        assert!(signing.is_none());
        assert_eq!(
            root.bip39_seed().expect_err("unsupported root").code,
            WalletChainErrorCode::UnsupportedAccountModel
        );
        assert_eq!(
            root.bip39_bare_seed().expect_err("unsupported root").code,
            WalletChainErrorCode::UnsupportedAccountModel
        );
        assert!(!format!("{root:?}").contains("abandon"));
    }

    #[test]
    fn initial_rotation_v2_uses_anchor_without_signing_override() {
        for phrase in [WORDS.to_string(), format!("{WORDS} {WORDS}")] {
            let (root, signing) = rotation_secret(&phrase, None).wallet_root().expect("root");
            let WalletRoot::Bip39 {
                entropy,
                passphrase,
            } = &root
            else {
                panic!("expected BIP39 anchor root");
            };
            assert_eq!(entropy.as_str(), ENTROPY);
            assert!(passphrase.is_none());
            let signing = signing.expect("rotation state");
            assert!(signing.signing_words.is_none());
            assert!(signing.pending_words.is_none());
            assert_eq!(signing.pending_valid_until, None);
        }
    }

    #[test]
    fn rotated_v2_separates_signing_and_pending_state() {
        let secret = SecretPayloadV1::HdRootV2 {
            wordlist: "english".to_string(),
            recovery: HdRootRecoveryMaterialV2::Rotation {
                mnemonic_words: words(&format!("{WORDS} {SIGNING_WORDS}")),
                pending_signing_words: Some(words(WORDS)),
                pending_signing_valid_until: Some(1_900_000_000),
                bip39_passphrase: None,
            },
        };
        let (root, signing) = secret.wallet_root().expect("root");
        let WalletRoot::Bip39 {
            entropy,
            passphrase,
        } = &root
        else {
            panic!("expected BIP39 anchor root");
        };
        assert_eq!(entropy.as_str(), ENTROPY);
        assert!(passphrase.is_none());
        let signing = signing.expect("rotation state");
        assert_eq!(
            signing.signing_words.as_ref().expect("signing").as_slice(),
            words(SIGNING_WORDS).as_slice()
        );
        assert_eq!(
            signing.pending_words.as_ref().expect("pending").as_slice(),
            words(WORDS).as_slice()
        );
        assert_eq!(signing.pending_valid_until, Some(1_900_000_000));
        let debug = format!("{signing:?}");
        assert!(!debug.contains("abandon"));
        assert!(!debug.contains("notice"));
    }

    #[test]
    fn rotation_v2_preserves_passphrase_for_seed_but_not_bare_seed() {
        let (root, signing) = rotation_secret(WORDS, Some("TREZOR"))
            .wallet_root()
            .expect("root");
        let (bip39, _) = bip39_secret(Some("TREZOR")).wallet_root().expect("root");
        let (bare, _) = bip39_secret(None).wallet_root().expect("root");
        let WalletRoot::Bip39 {
            entropy,
            passphrase,
        } = &root
        else {
            panic!("expected BIP39 anchor root");
        };
        assert_eq!(entropy.as_str(), ENTROPY);
        assert_eq!(
            passphrase.as_ref().map(|value| value.as_str()),
            Some("TREZOR")
        );
        assert!(signing.expect("rotation state").signing_words.is_none());
        assert_eq!(
            *root.bip39_seed().expect("seed"),
            *bip39.bip39_seed().expect("BIP39 seed")
        );
        assert_eq!(
            *root.bip39_bare_seed().expect("bare seed"),
            *bare.bip39_seed().expect("BIP39 bare seed")
        );
        assert_ne!(
            *root.bip39_seed().expect("seed"),
            *root.bip39_bare_seed().expect("bare seed")
        );
    }
}
