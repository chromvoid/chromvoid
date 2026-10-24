use std::str::FromStr;

use ::bitcoin::bip32::{DerivationPath, Xpriv, Xpub};
use ::bitcoin::key::{CompressedPublicKey, PrivateKey};
use ::bitcoin::secp256k1::Secp256k1;
use ::bitcoin::{Address, Network};
use zeroize::Zeroizing;

use crate::wallet::{hex_string, SecretPayloadV1, WalletChainError};

use super::account::DerivedAddress;

pub(super) fn parse_wif_private_key(wif: &str) -> Result<PrivateKey, WalletChainError> {
    let private_key = PrivateKey::from_wif(wif.trim()).map_err(|error| {
        WalletChainError::invalid_input(format!("invalid Bitcoin WIF private key: {error}"))
    })?;
    if private_key.network != Network::Bitcoin.into() {
        return Err(WalletChainError::invalid_input(
            "Bitcoin WIF must be mainnet",
        ));
    }
    if !private_key.compressed {
        return Err(WalletChainError::invalid_input(
            "Bitcoin WIF must encode a compressed public key",
        ));
    }
    Ok(private_key)
}

pub(super) fn p2wpkh_address(public_key: &CompressedPublicKey) -> Address {
    Address::p2wpkh(public_key, Network::Bitcoin)
}

fn hd_seed(secret: &SecretPayloadV1) -> Result<Zeroizing<[u8; 64]>, WalletChainError> {
    let Some((root, _)) = secret.wallet_root() else {
        return Err(WalletChainError::unsupported_account_model(
            "Bitcoin derived account requires HD root",
        ));
    };
    root.bip39_seed()
}

pub(super) fn derive_hd_private_key(
    secret: &SecretPayloadV1,
    account_index: u32,
    chain: u32,
    index: u32,
) -> Result<PrivateKey, WalletChainError> {
    let seed = hd_seed(secret)?;
    let secp = Secp256k1::new();
    let xpriv = Xpriv::new_master(Network::Bitcoin, seed.as_ref())
        .map_err(|error| WalletChainError::invalid_input(format!("invalid BIP32 root: {error}")))?;
    let path = DerivationPath::from_str(&format!("m/84'/0'/{account_index}'/{chain}/{index}"))
        .map_err(|error| WalletChainError::invalid_input(format!("invalid BIP84 path: {error}")))?;
    let derived = xpriv.derive_priv(&secp, &path).map_err(|error| {
        WalletChainError::invalid_input(format!("BIP84 derivation failed: {error}"))
    })?;
    Ok(PrivateKey::new(derived.private_key, Network::Bitcoin))
}

pub(super) fn derive_account_xpub(
    secret: &SecretPayloadV1,
    account_index: u32,
) -> Result<Xpub, WalletChainError> {
    let seed = hd_seed(secret)?;
    let secp = Secp256k1::new();
    let xpriv = Xpriv::new_master(Network::Bitcoin, seed.as_ref())
        .map_err(|error| WalletChainError::invalid_input(format!("invalid BIP32 root: {error}")))?;
    let path = DerivationPath::from_str(&format!("m/84'/0'/{account_index}'"))
        .map_err(|error| WalletChainError::invalid_input(format!("invalid BIP84 path: {error}")))?;
    let account = xpriv.derive_priv(&secp, &path).map_err(|error| {
        WalletChainError::invalid_input(format!("BIP84 account derivation failed: {error}"))
    })?;
    Ok(Xpub::from_priv(&secp, &account))
}

pub(super) fn derive_address_from_account_xpub(
    account_xpub: &Xpub,
    account_index: u32,
    chain: u32,
    index: u32,
) -> Result<DerivedAddress, WalletChainError> {
    let secp = Secp256k1::new();
    let path = DerivationPath::from_str(&format!("m/{chain}/{index}"))
        .map_err(|error| WalletChainError::invalid_input(format!("invalid BIP84 path: {error}")))?;
    let public_key = account_xpub
        .derive_pub(&secp, &path)
        .map_err(|error| {
            WalletChainError::invalid_input(format!("BIP84 public derivation failed: {error}"))
        })?
        .to_pub();
    let address = p2wpkh_address(&public_key);
    Ok(DerivedAddress {
        address: address.to_string(),
        public_key: public_key.to_string(),
        derivation_path: format!("m/84'/0'/{account_index}'/{chain}/{index}"),
        script_pubkey: hex_string(address.script_pubkey().as_bytes()),
    })
}

pub(super) fn derive_hd_address(
    secret: &SecretPayloadV1,
    account_index: u32,
    chain: u32,
    index: u32,
) -> Result<DerivedAddress, WalletChainError> {
    let secp = Secp256k1::new();
    let private_key = derive_hd_private_key(secret, account_index, chain, index)?;
    let public_key = CompressedPublicKey::from_private_key(&secp, &private_key)
        .map_err(|_| WalletChainError::internal("Bitcoin derived key is uncompressed"))?;
    let address = p2wpkh_address(&public_key);
    Ok(DerivedAddress {
        address: address.to_string(),
        public_key: public_key.to_string(),
        derivation_path: format!("m/84'/0'/{account_index}'/{chain}/{index}"),
        script_pubkey: hex_string(address.script_pubkey().as_bytes()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn anchor_root_address_matches_bip39_with_the_same_passphrase() {
        let words = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
            .split_whitespace()
            .map(str::to_string)
            .collect::<Vec<_>>();
        let address = |standard: &str, passphrase: Option<&str>| {
            let payload = SecretPayloadV1::hd_root_v2(
                standard,
                "00000000000000000000000000000000".to_string(),
                "english".to_string(),
                Some(words.clone()),
                passphrase.map(str::to_string),
            );
            derive_hd_address(&payload, 0, 0, 0)
                .expect("derived address")
                .address
        };
        for passphrase in [None, Some("passphrase")] {
            assert_eq!(
                address("rotation", passphrase),
                address("bip39", passphrase)
            );
        }
        assert_ne!(address("bip39", None), address("bip39", Some("passphrase")));
    }
}
