use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::rpc::request_parse::{field_present_any, optional_array, optional_str};
use crate::rpc::types::WalletNetwork;

use super::{WalletCommandError, WalletResult};

pub(super) fn parse<T: DeserializeOwned>(data: &Value) -> WalletResult<T> {
    serde_json::from_value(data.clone()).map_err(|error| {
        WalletCommandError::empty_payload(format!("Invalid wallet payload: {error}"))
    })
}

pub(super) fn reject_unsupported_network(data: &Value, field: &str) -> Option<WalletCommandError> {
    let network = optional_str(data, field)?;
    (!matches!(network, "bitcoin" | "ethereum")).then(|| {
        WalletCommandError::unsupported_chain(format!("Unsupported wallet network: {network}"))
    })
}

pub(super) fn reject_unsupported_supported_networks(data: &Value) -> Option<WalletCommandError> {
    let networks = optional_array(data, "supported_networks")?;
    networks.iter().find_map(|network| {
        let network = network.as_str()?;
        (!matches!(network, "bitcoin" | "ethereum")).then(|| {
            WalletCommandError::unsupported_chain(format!("Unsupported wallet network: {network}"))
        })
    })
}

pub(super) fn has_disallowed_prepare_fields(data: &Value) -> bool {
    field_present_any(data, "unsigned_tx", &[]) || field_present_any(data, "memo", &[])
}

pub(super) fn has_duplicate_networks(networks: &[WalletNetwork]) -> bool {
    let bitcoin = networks
        .iter()
        .filter(|network| **network == WalletNetwork::Bitcoin)
        .count();
    let ethereum = networks
        .iter()
        .filter(|network| **network == WalletNetwork::Ethereum)
        .count();
    bitcoin > 1 || ethereum > 1
}

pub(super) fn mnemonic_word(seed: u16) -> String {
    // A compact deterministic test-friendly word set; storage persists entropy hash
    // and the selected words, never a derived seed or xprv.
    const WORDS: &[&str] = &[
        "able", "acid", "agent", "album", "alpha", "anchor", "apple", "april", "arena", "asset",
        "august", "auto", "basic", "beach", "binary", "bonus", "brick", "budget", "cactus",
        "camera", "carbon", "casual", "census", "circle", "client", "copper", "delta", "device",
        "domain", "dragon", "eager", "earth", "echo", "energy", "fabric", "federal", "filter",
        "forest", "galaxy", "garden", "gold", "harbor", "hazel", "honest", "icon", "index",
        "ivory", "jacket", "jungle", "kernel", "kitten", "laser", "ledger", "limit", "magnet",
        "matrix", "memory", "native", "nectar", "object", "olive", "orange", "oxygen",
    ];
    WORDS[seed as usize % WORDS.len()].to_string()
}
