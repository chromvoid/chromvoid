use serde::de::DeserializeOwned;
use serde_json::Value;
use std::collections::HashSet;

use crate::rpc::request_parse::field_present_any;
use crate::rpc::types::WalletNetwork;

use super::{WalletCommandError, WalletResult};

pub(super) fn parse<T: DeserializeOwned>(data: &Value) -> WalletResult<T> {
    if field_present_any(data, "vault_id", &[]) {
        return Err(WalletCommandError::invalid_input(
            "wallet commands must not include vault_id",
        ));
    }
    serde_json::from_value(data.clone()).map_err(|error| {
        let message = format!("Invalid wallet payload: {error}");
        if error.to_string().contains("unknown field") {
            WalletCommandError::invalid_input(message)
        } else {
            WalletCommandError::empty_payload(message)
        }
    })
}

pub(super) fn has_disallowed_prepare_fields(data: &Value) -> bool {
    field_present_any(data, "unsigned_tx", &[]) || field_present_any(data, "memo", &[])
}

pub(super) fn ton_prepare_boundary_error(data: &Value) -> Option<WalletCommandError> {
    if data.get("network").and_then(Value::as_str) != Some("ton") {
        return None;
    }
    if has_any_key(
        data,
        &[
            "ton_connect",
            "tonConnect",
            "provider_request",
            "providerRequest",
        ],
    ) {
        return Some(WalletCommandError::unsupported_provider_surface(
            "TON Connect/provider requests are outside TON wallet v1",
        ));
    }
    if has_any_key(data, TON_ASSET_KEYS) || outputs_have_any(data, TON_ASSET_KEYS) {
        return Some(WalletCommandError::unsupported_asset(
            "TON wallet v1 supports only implicit Toncoin transfers",
        ));
    }
    if has_any_key(data, TON_PAYLOAD_KEYS) || outputs_have_any(data, TON_PAYLOAD_KEYS) {
        return Some(WalletCommandError::unsupported_ton_payload(
            "TON wallet v1 does not accept raw payload, BOC, or cell fields",
        ));
    }
    None
}

pub(super) fn has_disallowed_fee_policy_fields(data: &Value) -> bool {
    data.get("fee_policy")
        .and_then(Value::as_object)
        .is_some_and(|policy| policy.keys().any(|key| key != "tier"))
}

pub(super) fn has_balance_freshness(data: &Value) -> bool {
    field_present_any(data, "freshness", &[])
}

pub(super) fn has_duplicate_networks(networks: &[WalletNetwork]) -> bool {
    let mut seen = HashSet::new();
    networks
        .iter()
        .any(|network| !seen.insert(network.as_str().to_string()))
}

const TON_ASSET_KEYS: &[&str] = &[
    "asset",
    "asset_id",
    "assetId",
    "jetton",
    "jetton_address",
    "jettonAddress",
    "jetton_payload",
    "jettonPayload",
];

const TON_PAYLOAD_KEYS: &[&str] = &[
    "payload",
    "boc",
    "cell",
    "body",
    "state_init",
    "stateInit",
    "unsigned_tx",
    "unsignedTx",
];

fn has_any_key(data: &Value, keys: &[&str]) -> bool {
    data.as_object()
        .is_some_and(|object| keys.iter().any(|key| object.contains_key(*key)))
}

fn outputs_have_any(data: &Value, keys: &[&str]) -> bool {
    data.get("outputs")
        .and_then(Value::as_array)
        .is_some_and(|outputs| outputs.iter().any(|output| has_any_key(output, keys)))
}
