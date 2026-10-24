use crate::rpc::types::{WalletAccountMeta, WalletNetwork};
use crate::wallet::WalletChainError;

use super::constants::{
    TON_ACCOUNT_MODEL, TON_BIP39_DERIVATION_PROFILE, TON_NATIVE_DERIVATION_PROFILE, TON_NETWORK,
    TON_ROTATION_DERIVATION_PROFILE, TON_WALLET_CONTRACT, TON_WORKCHAIN,
};
use super::provider::TonProviderAccount;
use super::transfer::parse_ton_address;

fn is_supported_ton_derivation_profile(derivation_profile: &str) -> bool {
    matches!(
        derivation_profile,
        TON_NATIVE_DERIVATION_PROFILE
            | TON_BIP39_DERIVATION_PROFILE
            | TON_ROTATION_DERIVATION_PROFILE
    )
}

pub(super) fn ensure_ton_network(network: &WalletNetwork) -> Result<(), WalletChainError> {
    if network.as_str() != TON_NETWORK {
        return Err(WalletChainError::unsupported_chain("wrong TON network"));
    }
    Ok(())
}

pub(super) fn provider_account_from_meta(
    account: &WalletAccountMeta,
) -> Result<TonProviderAccount, WalletChainError> {
    ensure_ton_network(account.network())?;
    let (address, raw_account) = match account {
        WalletAccountMeta::Derived(meta) => {
            if meta.account_model != TON_ACCOUNT_MODEL {
                return Err(WalletChainError::unsupported_account_model(
                    "TON account metadata requires account_model=account",
                ));
            }
            if !is_supported_ton_derivation_profile(&meta.derivation_profile) {
                return Err(WalletChainError::unsupported_account_model(
                    "Unsupported TON derivation profile",
                ));
            }
            if meta.wallet_contract.as_deref() != Some(TON_WALLET_CONTRACT) {
                return Err(WalletChainError::unsupported_wallet_contract(
                    "TON accounts require the WalletTg contract",
                ));
            }
            if meta.workchain != Some(TON_WORKCHAIN) {
                return Err(WalletChainError::unsupported_chain(
                    "TON v1 supports only workchain 0",
                ));
            }
            (
                meta.address.as_deref().ok_or_else(|| {
                    WalletChainError::invalid_input("TON account address is missing")
                })?,
                meta.raw_account
                    .as_deref()
                    .ok_or_else(|| WalletChainError::invalid_input("TON raw account is missing"))?,
            )
        }
        WalletAccountMeta::Imported(meta) => {
            if meta.curve.as_deref() != Some("ed25519") {
                return Err(WalletChainError::invalid_input(
                    "TON imported account requires curve=ed25519",
                ));
            }
            if meta.wallet_contract.as_deref() != Some(TON_WALLET_CONTRACT) {
                return Err(WalletChainError::unsupported_wallet_contract(
                    "TON accounts require the WalletTg contract",
                ));
            }
            if meta.workchain != Some(TON_WORKCHAIN) {
                return Err(WalletChainError::unsupported_chain(
                    "TON v1 supports only workchain 0",
                ));
            }
            (
                meta.address.as_str(),
                meta.raw_account
                    .as_deref()
                    .ok_or_else(|| WalletChainError::invalid_input("TON raw account is missing"))?,
            )
        }
    };
    let parsed = parse_ton_address(address)?;
    if parsed.to_hex() != raw_account {
        return Err(WalletChainError::invalid_input(
            "TON account address does not match raw_account",
        ));
    }
    Ok(TonProviderAccount {
        account_id: account.account_id().to_string(),
        wallet_id: account.wallet_id().to_string(),
        address: parsed.to_string(),
        raw_account: raw_account.to_string(),
    })
}
