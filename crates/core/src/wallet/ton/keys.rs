use std::str::FromStr;

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use ed25519_dalek::SigningKey;
use zeroize::Zeroizing;

use crate::rpc::types::WalletAccountMeta;
use crate::wallet::rotation_mnemonic::{normalize_rotation_words, rotation_half_seed};
use crate::wallet::slip10::slip10_ed25519_derive;
use crate::wallet::ton_mnemonic::ton_native_seed_from_words;
use crate::wallet::{
    hex_string, parse_hex, AccountScheme, SecretPayloadV1, TonSigningState, WalletChainError,
    WalletRoot,
};

use super::account::ensure_ton_network;
use super::provider::TonProviderAccountState;
use super::wallet_tg::WalletTg;

type KeyPair = ::ton::ton_wallet::KeyPair;

/// SLIP-0010 path shared by the BIP39 and Rotation profiles: `m/44'/607'/<index>'`.
const TON_SLIP10_PURPOSE: u32 = 44;
const TON_SLIP10_COIN: u32 = 607;

/// Key material behind one TON account.
///
/// `anchor` fixes the WalletTg address. `signing` is the current signing half of a rotated
/// TEP-0003 phrase (absent for non-rotation phrases and before the first rotation). `pending`
/// is a rotation that was broadcast but not yet observed on-chain.
pub(super) struct TonKeyMaterial {
    anchor: KeyPair,
    signing: Option<KeyPair>,
    pending: Option<KeyPair>,
    pending_valid_until: Option<u32>,
}

impl std::fmt::Debug for TonKeyMaterial {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("TonKeyMaterial")
            .field("anchor_public_key", &hex_string(&self.anchor.public_key))
            .field("rotated", &self.signing.is_some())
            .field("pending", &self.pending.is_some())
            .field("pending_valid_until", &self.pending_valid_until)
            .finish_non_exhaustive()
    }
}

impl TonKeyMaterial {
    fn single(anchor: KeyPair) -> Self {
        Self {
            anchor,
            signing: None,
            pending: None,
            pending_valid_until: None,
        }
    }

    #[cfg(test)]
    pub(super) fn anchor_public_key(&self) -> &[u8; 32] {
        &self.anchor.public_key
    }

    /// The key the phrase currently designates for signing (signing half, else anchor).
    #[cfg(test)]
    pub(super) fn current_signing_public_key(&self) -> &[u8; 32] {
        self.signing
            .as_ref()
            .map_or(&self.anchor.public_key, |pair| &pair.public_key)
    }

    pub(super) fn pending_public_key(&self) -> Option<&[u8; 32]> {
        self.pending.as_ref().map(|pair| &pair.public_key)
    }

    pub(super) fn pending_valid_until(&self) -> Option<u32> {
        self.pending_valid_until
    }

    /// Wallet addressed by the anchor key and signing with the anchor key.
    pub(super) fn anchor_wallet(&self) -> Result<WalletTg, WalletChainError> {
        WalletTg::new(self.anchor.clone())
    }

    /// Wallet addressed by the anchor key and signing with `signing_key_pair`.
    pub(super) fn wallet_with_signing(
        &self,
        signing_key_pair: KeyPair,
    ) -> Result<WalletTg, WalletChainError> {
        WalletTg::with_signing_key(self.anchor.public_key, signing_key_pair)
    }

    /// Picks the signing key that matches the account's on-chain state.
    ///
    /// An undeployed account can only be driven by the anchor key. For an active account the
    /// observed `get_public_key` selects among the pending, current and anchor keys; when the
    /// provider cannot report it, the phrase's current signing key is assumed.
    pub(super) fn wallet(
        &self,
        account_state: TonProviderAccountState,
        on_chain_public_key: Option<&[u8; 32]>,
    ) -> Result<WalletTg, WalletChainError> {
        if account_state == TonProviderAccountState::Uninitialized {
            return self.anchor_wallet();
        }
        let Some(on_chain) = on_chain_public_key else {
            return match &self.signing {
                Some(signing) => self.wallet_with_signing(signing.clone()),
                None => self.anchor_wallet(),
            };
        };
        let anchor = Some(self.anchor.clone());
        for candidate in [&self.pending, &self.signing, &anchor]
            .into_iter()
            .flatten()
        {
            if &candidate.public_key == on_chain {
                return self.wallet_with_signing(candidate.clone());
            }
        }
        Err(WalletChainError::invalid_input(
            "TON recovery phrase does not hold the wallet's current signing key",
        ))
    }
}

pub(super) fn key_material_from_root(
    root: &WalletRoot,
    ton_signing: Option<&TonSigningState>,
    scheme: AccountScheme,
    account_index: u32,
) -> Result<TonKeyMaterial, WalletChainError> {
    scheme.ensure_compatible(root)?;
    match scheme {
        AccountScheme::TonNativeWalletTgAccount => {
            let WalletRoot::TonNative { words } = root else {
                return Err(WalletChainError::unsupported_account_model(
                    "TON native scheme requires a TON-native root",
                ));
            };
            let signing_seed = ton_native_seed_from_words(words)?;
            Ok(TonKeyMaterial::single(key_pair_from_signing_seed(
                &signing_seed,
            )))
        }
        AccountScheme::TonBip39WalletTgAccount => {
            let seed = root.bip39_seed()?;
            let signing_seed = slip10_ed25519_derive(
                seed.as_slice(),
                &[TON_SLIP10_PURPOSE, TON_SLIP10_COIN, account_index],
            )?;
            Ok(TonKeyMaterial::single(key_pair_from_signing_seed(
                &signing_seed,
            )))
        }
        AccountScheme::TonRotationWalletTgAccount => {
            if account_index != 0 {
                return Err(WalletChainError::unsupported_account_model(
                    "TON rotation wallets support only account_index=0",
                ));
            }
            let seed = root.bip39_bare_seed()?;
            let signing_seed =
                slip10_ed25519_derive(seed.as_slice(), &[TON_SLIP10_PURPOSE, TON_SLIP10_COIN, 0])?;
            let signing = ton_signing
                .and_then(|state| state.signing_words.as_ref())
                .map(|words| {
                    let words = Zeroizing::new(normalize_rotation_words(words));
                    rotation_key_pair_from_half(&words)
                })
                .transpose()?;
            let pending = ton_signing
                .and_then(|state| state.pending_words.as_ref())
                .map(|words| {
                    let words = Zeroizing::new(normalize_rotation_words(words));
                    rotation_key_pair_from_half(&words)
                })
                .transpose()?;
            Ok(TonKeyMaterial {
                anchor: key_pair_from_signing_seed(&signing_seed),
                signing,
                pending,
                pending_valid_until: ton_signing.and_then(|state| state.pending_valid_until),
            })
        }
        _ => Err(WalletChainError::unsupported_account_model(
            "Unsupported TON account scheme",
        )),
    }
}

/// Derives anchor, signing and pending keys from TEP-0003 rotation words.
#[cfg(test)]
pub(super) fn key_material_from_rotation_words(
    words: &[String],
    pending_signing_words: Option<&[String]>,
    pending_valid_until: Option<u32>,
) -> Result<TonKeyMaterial, WalletChainError> {
    use crate::wallet::{HdRootRecoveryMaterialV2, BIP39_ENGLISH_WORDLIST};

    let secret = SecretPayloadV1::HdRootV2 {
        wordlist: BIP39_ENGLISH_WORDLIST.to_string(),
        recovery: HdRootRecoveryMaterialV2::Rotation {
            mnemonic_words: words.to_vec(),
            pending_signing_words: pending_signing_words.map(<[String]>::to_vec),
            pending_signing_valid_until: pending_valid_until,
            bip39_passphrase: None,
        },
    };
    let (root, ton_signing) = secret
        .wallet_root()
        .ok_or_else(|| WalletChainError::invalid_input("invalid TON rotation root"))?;
    key_material_from_root(
        &root,
        ton_signing.as_ref(),
        AccountScheme::TonRotationWalletTgAccount,
        0,
    )
}

/// One rotation half → Ed25519 key pair: BIP39 seed, SLIP-0010 `m/44'/607'/0'`.
pub(super) fn rotation_key_pair_from_half(half: &[String]) -> Result<KeyPair, WalletChainError> {
    let seed = rotation_half_seed(half)?;
    let signing_seed =
        slip10_ed25519_derive(seed.as_slice(), &[TON_SLIP10_PURPOSE, TON_SLIP10_COIN, 0])?;
    Ok(key_pair_from_signing_seed(&signing_seed))
}

pub(super) fn key_material_from_imported(
    private_key: &str,
    encoding: &str,
) -> Result<TonKeyMaterial, WalletChainError> {
    let key_bytes = Zeroizing::new(match encoding {
        "hex" => parse_hex(private_key)?,
        "base64" => BASE64_STANDARD
            .decode(private_key)
            .map_err(|error| WalletChainError::invalid_input(format!("invalid base64: {error}")))?,
        _ => {
            return Err(WalletChainError::invalid_input(
                "TON private_key encoding must be hex or base64",
            ))
        }
    });
    let key_pair = match key_bytes.len() {
        32 => {
            let mut seed = Zeroizing::new([0u8; 32]);
            seed.copy_from_slice(key_bytes.as_slice());
            key_pair_from_signing_seed(&seed)
        }
        64 => {
            let mut keypair_bytes = Zeroizing::new([0u8; 64]);
            keypair_bytes.copy_from_slice(key_bytes.as_slice());
            let signing_key = SigningKey::from_keypair_bytes(&*keypair_bytes).map_err(|error| {
                WalletChainError::invalid_input(format!("invalid Ed25519 keypair: {error}"))
            })?;
            KeyPair {
                public_key: signing_key.verifying_key().to_bytes(),
                secret_key: signing_key.to_keypair_bytes(),
            }
        }
        _ => {
            return Err(WalletChainError::invalid_input(
                "TON Ed25519 private key must be 32-byte seed or 64-byte keypair",
            ))
        }
    };
    Ok(TonKeyMaterial::single(key_pair))
}

fn key_pair_from_signing_seed(seed: &[u8; 32]) -> KeyPair {
    let signing_key = SigningKey::from_bytes(seed);
    KeyPair {
        public_key: signing_key.verifying_key().to_bytes(),
        secret_key: signing_key.to_keypair_bytes(),
    }
}

#[cfg(test)]
pub(super) fn ton_native_account_identity(
    words: &[String],
) -> Result<(String, String, String), WalletChainError> {
    let signing_seed = ton_native_seed_from_words(words)?;
    let wallet = WalletTg::new(key_pair_from_signing_seed(&signing_seed))?;
    Ok((
        wallet.address().to_string(),
        wallet.address().to_hex(),
        hex_string(wallet.public_key()),
    ))
}

/// Address, raw account and anchor public key of a TEP-0003 rotation phrase.
#[cfg(test)]
pub(super) fn ton_rotation_account_identity(
    words: &[String],
) -> Result<(String, String, String), WalletChainError> {
    let material = key_material_from_rotation_words(words, None, None)?;
    let wallet = material.anchor_wallet()?;
    Ok((
        wallet.address().to_string(),
        wallet.address().to_hex(),
        hex_string(wallet.public_key()),
    ))
}

pub(super) fn key_material_from_secret(
    account: &WalletAccountMeta,
    secret: &SecretPayloadV1,
) -> Result<TonKeyMaterial, WalletChainError> {
    match account {
        WalletAccountMeta::Derived(meta) => {
            let (root, ton_signing) = secret.wallet_root().ok_or_else(|| {
                WalletChainError::internal("TON derived account requires HD root")
            })?;
            key_material_from_root(
                &root,
                ton_signing.as_ref(),
                AccountScheme::from_str(&meta.derivation_profile)?,
                meta.account_index.ok_or_else(|| {
                    WalletChainError::invalid_input("TON derived account is missing account_index")
                })?,
            )
        }
        WalletAccountMeta::Imported(_) => {
            let SecretPayloadV1::ImportedKey {
                network,
                curve,
                private_key,
                encoding,
            } = secret
            else {
                return Err(WalletChainError::internal(
                    "TON account and signing secret kind mismatch",
                ));
            };
            ensure_ton_network(network)?;
            if curve != "ed25519" {
                return Err(WalletChainError::invalid_input(
                    "TON imported key requires curve=ed25519",
                ));
            }
            key_material_from_imported(private_key, encoding)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ANCHOR: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const SIGNING: &str =
        "notice tortoise soup strong gun divide offer process salon siren general carry";
    // Reference keys computed independently with `bip39` + `ed25519-hd-key` (m/44'/607'/0').
    const ANCHOR_PUBLIC_KEY: &str =
        "7952e94118f34607c75e23258dd9220d66ccac5a3ee074125c25068e8107bfbf";
    const SIGNING_PUBLIC_KEY: &str =
        "b15818c2ee759a300db662988f9b0b484e4135071075d67b478704030b2a1514";

    fn words(text: &str) -> Vec<String> {
        text.split_whitespace().map(str::to_string).collect()
    }

    #[test]
    fn rotation_halves_derive_reference_keys() {
        let anchor = rotation_key_pair_from_half(&words(ANCHOR)).expect("anchor");
        let signing = rotation_key_pair_from_half(&words(SIGNING)).expect("signing");
        assert_eq!(hex_string(&anchor.public_key), ANCHOR_PUBLIC_KEY);
        assert_eq!(hex_string(&signing.public_key), SIGNING_PUBLIC_KEY);
    }

    #[test]
    fn initial_form_signs_with_anchor_and_rotated_form_with_signing_half() {
        let initial = key_material_from_rotation_words(&words(ANCHOR), None, None).expect("12");
        assert_eq!(hex_string(initial.anchor_public_key()), ANCHOR_PUBLIC_KEY);
        assert_eq!(
            hex_string(initial.current_signing_public_key()),
            ANCHOR_PUBLIC_KEY
        );
        let rotated =
            key_material_from_rotation_words(&words(&format!("{ANCHOR} {SIGNING}")), None, None)
                .expect("24");
        assert_eq!(hex_string(rotated.anchor_public_key()), ANCHOR_PUBLIC_KEY);
        assert_eq!(
            hex_string(rotated.current_signing_public_key()),
            SIGNING_PUBLIC_KEY
        );
        // The address is fixed by the anchor half regardless of rotation state.
        assert_eq!(
            initial.anchor_wallet().expect("wallet").address(),
            rotated.anchor_wallet().expect("wallet").address()
        );
        let (address, raw, public_key) =
            ton_rotation_account_identity(&words(ANCHOR)).expect("identity");
        assert_eq!(
            raw,
            initial.anchor_wallet().expect("wallet").address().to_hex()
        );
        assert!(address.starts_with("EQ"));
        assert_eq!(public_key, ANCHOR_PUBLIC_KEY);
    }

    #[test]
    fn signing_key_resolution_follows_on_chain_state() {
        let anchor = rotation_key_pair_from_half(&words(ANCHOR)).expect("anchor");
        let signing = rotation_key_pair_from_half(&words(SIGNING)).expect("signing");
        let pending_words =
            words("legal winner thank year wave sausage worth useful legal winner thank yellow");
        let pending = rotation_key_pair_from_half(&pending_words).expect("pending");
        let material = key_material_from_rotation_words(
            &words(&format!("{ANCHOR} {SIGNING}")),
            Some(&pending_words),
            Some(123),
        )
        .expect("material");
        assert_eq!(material.pending_public_key(), Some(&pending.public_key));
        assert_eq!(material.pending_valid_until(), Some(123));

        // Undeployed: only the anchor key can deploy the account.
        let wallet = material
            .wallet(
                TonProviderAccountState::Uninitialized,
                Some(&signing.public_key),
            )
            .expect("anchor");
        assert_eq!(wallet.signing_public_key(), &anchor.public_key);
        // Active, key unknown: assume the phrase's signing half.
        let wallet = material
            .wallet(TonProviderAccountState::Active, None)
            .expect("signing");
        assert_eq!(wallet.signing_public_key(), &signing.public_key);
        // Active, chain reports each candidate.
        for candidate in [&pending, &signing, &anchor] {
            let wallet = material
                .wallet(TonProviderAccountState::Active, Some(&candidate.public_key))
                .expect("candidate");
            assert_eq!(wallet.signing_public_key(), &candidate.public_key);
            assert_eq!(wallet.public_key(), &anchor.public_key);
        }
        // Active, chain reports a key the phrase does not hold.
        let error = material
            .wallet(TonProviderAccountState::Active, Some(&[0xAB; 32]))
            .expect_err("foreign key");
        assert!(error.message.contains("current signing key"));
    }

    #[test]
    fn rotation_material_rejects_passphrase_index_and_profile_mismatch() {
        let root = WalletRoot::Bip39 {
            entropy: Zeroizing::new("00000000000000000000000000000000".to_string()),
            passphrase: None,
        };
        assert!(
            key_material_from_root(&root, None, AccountScheme::TonRotationWalletTgAccount, 1,)
                .is_err()
        );
        assert!(
            key_material_from_root(&root, None, AccountScheme::TonNativeWalletTgAccount, 0,)
                .is_err()
        );
        assert!(
            key_material_from_root(&root, None, AccountScheme::TonRotationWalletTgAccount, 0,)
                .is_ok()
        );
        // A multichain passphrase protects non-TON networks only; TON keys ignore it.
        let with_passphrase = key_material_from_root(
            &WalletRoot::Bip39 {
                entropy: Zeroizing::new("00000000000000000000000000000000".to_string()),
                passphrase: Some(Zeroizing::new("secret".to_string())),
            },
            None,
            AccountScheme::TonRotationWalletTgAccount,
            0,
        )
        .expect("passphrase is ignored for rotation roots");
        assert_eq!(
            hex_string(with_passphrase.anchor_public_key()),
            ANCHOR_PUBLIC_KEY
        );
    }

    #[test]
    fn rotation_root_address_matches_bip39_and_ignores_passphrase() {
        use crate::wallet::{
            BIP39_ENGLISH_WORDLIST, BIP39_MNEMONIC_STANDARD, ROTATION_MNEMONIC_STANDARD,
        };

        let address = |standard, passphrase: Option<&str>, scheme| {
            let secret = SecretPayloadV1::hd_root_v2(
                standard,
                "00000000000000000000000000000000".to_string(),
                BIP39_ENGLISH_WORDLIST.to_string(),
                Some(words(ANCHOR)),
                passphrase.map(str::to_string),
            );
            let (root, ton_signing) = secret.wallet_root().expect("root");
            key_material_from_root(&root, ton_signing.as_ref(), scheme, 0)
                .expect("material")
                .anchor_wallet()
                .expect("wallet")
                .address()
                .to_string()
        };
        let bare_address = address(
            BIP39_MNEMONIC_STANDARD,
            None,
            AccountScheme::TonBip39WalletTgAccount,
        );
        assert_eq!(
            address(
                ROTATION_MNEMONIC_STANDARD,
                None,
                AccountScheme::TonRotationWalletTgAccount,
            ),
            bare_address
        );
        assert_eq!(
            address(
                ROTATION_MNEMONIC_STANDARD,
                Some("secret"),
                AccountScheme::TonRotationWalletTgAccount,
            ),
            bare_address
        );
        assert_ne!(
            address(
                BIP39_MNEMONIC_STANDARD,
                Some("secret"),
                AccountScheme::TonBip39WalletTgAccount,
            ),
            bare_address
        );
    }
}
