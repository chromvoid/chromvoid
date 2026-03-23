#![cfg_attr(not(target_os = "android"), allow(dead_code))]

use serde::Deserialize;
use serde_json::{json, Value};

pub const ANDROID_BRIDGE_CONTRACT_VERSION: u64 = 1;

#[derive(Debug, Deserialize)]
struct BridgeRequestEnvelope {
    contract_version: u64,
    payload: Value,
}

pub fn encode_response(payload: Value) -> Value {
    json!({
        "contract_version": ANDROID_BRIDGE_CONTRACT_VERSION,
        "payload": payload,
    })
}

pub fn decode_request(raw: &str) -> Result<Value, Value> {
    let envelope: BridgeRequestEnvelope = serde_json::from_str(raw).map_err(|error| {
        json!({
            "ok": false,
            "code": "INVALID_BRIDGE_PAYLOAD",
            "message": format!("Invalid Android bridge payload: {error}"),
        })
    })?;
    if envelope.contract_version != ANDROID_BRIDGE_CONTRACT_VERSION {
        return Err(json!({
            "ok": false,
            "code": "CONTRACT_MISMATCH",
            "message": format!(
                "Unsupported Android bridge contract version: {}",
                envelope.contract_version
            ),
        }));
    }
    Ok(envelope.payload)
}
