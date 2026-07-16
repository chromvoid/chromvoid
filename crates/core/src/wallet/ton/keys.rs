use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use bip39::{Language, Mnemonic};
use ed25519_dalek::SigningKey;
use hmac::{Hmac, Mac};
use sha2::Sha512;
use zeroize::Zeroizing;

use crate::rpc::types::WalletAccountMeta;
use crate::wallet::ton_mnemonic::ton_native_seed_from_words;
use crate::wallet::{
    hex_string, parse_hex, SecretPayloadV1, WalletChainError, BIP39_ENGLISH_WORDLIST,
    BIP39_MNEMONIC_STANDARD, TON_NATIVE_MNEMONIC_STANDARD,
};

use super::account::ensure_ton_network;
use super::constants::{TON_BIP39_DERIVATION_PROFILE, TON_NATIVE_DERIVATION_PROFILE};
use super::error::ton_error;

type HmacSha512 = Hmac<Sha512>;

pub(super) fn key_pair_from_hd_root(
    mnemonic_standard: &str,
    mnemonic_entropy: &str,
    mnemonic_words: Option<&[String]>,
    wordlist: &str,
    bip39_passphrase: Option<&str>,
    account_index: u32,
    derivation_profile: &str,
) -> Result<::ton::ton_wallet::KeyPair, WalletChainError> {
    match (mnemonic_standard, derivation_profile) {
        (BIP39_MNEMONIC_STANDARD, TON_BIP39_DERIVATION_PROFILE) => {}
        (TON_NATIVE_MNEMONIC_STANDARD, TON_NATIVE_DERIVATION_PROFILE) => {
            if bip39_passphrase.is_some() {
                return Err(WalletChainError::invalid_input(
                    "TON native mnemonic does not support BIP39 passphrase",
                ));
            }
        }
        _ => {
            return Err(WalletChainError::unsupported_account_model(
                "TON mnemonic standard and derivation profile mismatch",
            ))
        }
    }
    if wordlist != BIP39_ENGLISH_WORDLIST {
        return Err(WalletChainError::invalid_input(
            "TON HD derivation supports only english BIP39 wordlist",
        ));
    }
    if mnemonic_standard == TON_NATIVE_MNEMONIC_STANDARD {
        let words = mnemonic_words
            .ok_or_else(|| WalletChainError::invalid_input("TON-native wallet requires repair"))?;
        let signing_seed = ton_native_seed_from_words(words)?;
        return Ok(key_pair_from_signing_seed(&signing_seed));
    }
    let entropy = Zeroizing::new(parse_hex(mnemonic_entropy)?);
    let mnemonic = Mnemonic::from_entropy_in(Language::English, entropy.as_slice())
        .map_err(|error| WalletChainError::invalid_input(format!("invalid HD root: {error}")))?;
    let seed = Zeroizing::new(mnemonic.to_seed(bip39_passphrase.unwrap_or("")));
    let signing_seed = slip10_ed25519_derive(seed.as_slice(), &[44, 607, account_index])?;
    Ok(key_pair_from_signing_seed(&signing_seed))
}

fn slip10_ed25519_derive(
    seed: &[u8],
    path: &[u32],
) -> Result<Zeroizing<[u8; 32]>, WalletChainError> {
    let master = slip10_hmac(b"ed25519 seed", seed)?;
    let mut key = Zeroizing::new([0u8; 32]);
    let mut chain_code = Zeroizing::new([0u8; 32]);
    key.copy_from_slice(&master[..32]);
    chain_code.copy_from_slice(&master[32..]);
    for index in path {
        let hardened_index = index
            .checked_add(0x8000_0000)
            .ok_or_else(|| WalletChainError::invalid_input("TON derivation index is too large"))?;
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
    let mut mac = HmacSha512::new_from_slice(key).map_err(|error| {
        WalletChainError::internal(format!("TON SLIP-0010 HMAC failed: {error}"))
    })?;
    mac.update(data);
    let bytes = mac.finalize().into_bytes();
    let mut output = Zeroizing::new([0u8; 64]);
    output.copy_from_slice(&bytes);
    Ok(output)
}

pub(super) fn key_pair_from_imported(
    private_key: &str,
    encoding: &str,
) -> Result<::ton::ton_wallet::KeyPair, WalletChainError> {
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
    match key_bytes.len() {
        32 => {
            let mut seed = Zeroizing::new([0u8; 32]);
            seed.copy_from_slice(key_bytes.as_slice());
            Ok(key_pair_from_signing_seed(&seed))
        }
        64 => {
            let mut keypair_bytes = Zeroizing::new([0u8; 64]);
            keypair_bytes.copy_from_slice(key_bytes.as_slice());
            let signing_key = SigningKey::from_keypair_bytes(&*keypair_bytes).map_err(|error| {
                WalletChainError::invalid_input(format!("invalid Ed25519 keypair: {error}"))
            })?;
            Ok(::ton::ton_wallet::KeyPair {
                public_key: signing_key.verifying_key().to_bytes(),
                secret_key: signing_key.to_keypair_bytes(),
            })
        }
        _ => Err(WalletChainError::invalid_input(
            "TON Ed25519 private key must be 32-byte seed or 64-byte keypair",
        )),
    }
}

fn key_pair_from_signing_seed(seed: &[u8; 32]) -> ::ton::ton_wallet::KeyPair {
    let signing_key = SigningKey::from_bytes(seed);
    ::ton::ton_wallet::KeyPair {
        public_key: signing_key.verifying_key().to_bytes(),
        secret_key: signing_key.to_keypair_bytes(),
    }
}

pub(crate) fn ton_native_v5r1_account_identity(
    words: &[String],
) -> Result<(String, String, String), WalletChainError> {
    let signing_seed = ton_native_seed_from_words(words)?;
    let key_pair = key_pair_from_signing_seed(&signing_seed);
    let wallet = ton_wallet_from_key_pair(key_pair)?;
    Ok((
        wallet.address.to_string(),
        wallet.address.to_hex(),
        hex_string(&wallet.key_pair.public_key),
    ))
}

pub(super) fn ton_wallet_from_secret(
    account: &WalletAccountMeta,
    secret: &SecretPayloadV1,
) -> Result<::ton::ton_wallet::TonWallet, WalletChainError> {
    let key_pair = match account {
        WalletAccountMeta::Derived(meta) => {
            let root = secret.hd_root_material().ok_or_else(|| {
                WalletChainError::internal("TON derived account requires HD root")
            })?;
            key_pair_from_hd_root(
                &root.mnemonic_standard,
                &root.mnemonic_entropy,
                root.mnemonic_words.as_deref(),
                &root.wordlist,
                root.bip39_passphrase.as_deref(),
                meta.account_index.ok_or_else(|| {
                    WalletChainError::invalid_input("TON derived account is missing account_index")
                })?,
                &meta.derivation_profile,
            )?
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
            key_pair_from_imported(private_key, encoding)?
        }
    };
    ton_wallet_from_key_pair(key_pair)
}

pub(super) fn ton_wallet_from_key_pair(
    key_pair: ::ton::ton_wallet::KeyPair,
) -> Result<::ton::ton_wallet::TonWallet, WalletChainError> {
    ::ton::ton_wallet::TonWallet::new(::ton::ton_wallet::WalletVersion::V5R1, key_pair)
        .map_err(ton_error)
}
