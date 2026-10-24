use chromvoid_client_runtime::provider::{AppleProviderRequest, in_memory_response_envelope};
use chromvoid_client_runtime::rpc_data::clear_rpc_strings;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};

use crate::{BridgeError, MAX_METADATA_BYTES};

#[derive(uniffi::Record)]
pub struct AirProviderCoreRequest {
    pub identifier: String,
    pub request: Vec<u8>,
}

#[uniffi::export]
pub fn decode_apple_provider_request(
    payload: Vec<u8>,
) -> Result<AirProviderCoreRequest, BridgeError> {
    let payload = zeroize::Zeroizing::new(payload);
    if payload.len() > MAX_METADATA_BYTES {
        return Err(BridgeError::PayloadTooLarge);
    }
    let mut envelope: AppleProviderRequest =
        serde_json::from_slice(&payload).map_err(|_| BridgeError::InvalidRequest)?;
    if envelope.request_id.trim().is_empty() || envelope.request_id.len() > 128 {
        return Err(BridgeError::InvalidRequest);
    }
    let mut request = RpcRequest::new(envelope.command.clone(), std::mem::take(&mut envelope.data));
    let encoded = serde_json::to_vec(&request).map_err(|_| BridgeError::InvalidRequest);
    clear_rpc_strings(&mut request.data);
    let mut request = zeroize::Zeroizing::new(encoded?);
    if request.len() > MAX_METADATA_BYTES {
        return Err(BridgeError::PayloadTooLarge);
    }
    Ok(AirProviderCoreRequest {
        identifier: envelope.request_id.clone(),
        request: std::mem::take(&mut *request),
    })
}

/// Converts a Core reply for direct memory-only IPC, never for a persisted carrier.
#[uniffi::export]
pub fn encode_apple_provider_response(
    identifier: String,
    response: Vec<u8>,
) -> Result<Vec<u8>, BridgeError> {
    let response = zeroize::Zeroizing::new(response);
    if response.len() > MAX_METADATA_BYTES || identifier.len() > 128 {
        return Err(BridgeError::PayloadTooLarge);
    }
    let response: RpcResponse =
        serde_json::from_slice(&response).map_err(|_| BridgeError::InvalidRequest)?;
    let mut envelope = in_memory_response_envelope(&identifier, response);
    let encoded = serde_json::to_vec(&envelope).map_err(|_| BridgeError::InvalidRequest);
    clear_rpc_strings(&mut envelope);
    let mut encoded = zeroize::Zeroizing::new(encoded?);
    if encoded.len() > MAX_METADATA_BYTES {
        return Err(BridgeError::PayloadTooLarge);
    }
    Ok(std::mem::take(&mut *encoded))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn apple_and_core_envelopes_remain_distinct() {
        let message = decode_apple_provider_request(
            serde_json::to_vec(&json!({
                "request_id":"request-1", "command":"credential_provider:list",
                "data":{"context":{"kind":"web", "origin":"https://example.test"}}
            }))
            .unwrap(),
        )
        .unwrap();
        let request: serde_json::Value = serde_json::from_slice(&message.request).unwrap();
        assert_eq!(message.identifier, "request-1");
        assert_eq!(request["v"], 1);
        assert_eq!(request["data"]["context"]["origin"], "https://example.test");
        assert!(request.get("request_id").is_none());
        for response in [
            RpcResponse::success(json!({"password":"synthetic"})),
            RpcResponse::error("Locked", Some("VAULT_REQUIRED".to_string())),
        ] {
            let core = serde_json::to_vec(&response).unwrap();
            let bytes = encode_apple_provider_response(message.identifier.clone(), core).unwrap();
            let apple: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
            assert_eq!(apple["request_id"], "request-1");
            assert!(apple.get("ok").is_none());
            if response.is_ok() {
                assert_eq!(
                    apple,
                    json!({"request_id":"request-1","success":true,"result":{"password":"synthetic"}})
                );
            } else {
                assert_eq!(
                    apple,
                    json!({"request_id":"request-1","success":false,"error":"Locked","error_code":"VAULT_REQUIRED"})
                );
            }
        }
    }

    #[test]
    fn malformed_or_unbounded_messages_are_rejected() {
        for payload in [
            b"{".to_vec(),
            br#"{"command":"credential_provider:status"}"#.to_vec(),
            br#"{"request_id":" ","command":"credential_provider:status"}"#.to_vec(),
        ] {
            assert!(matches!(
                decode_apple_provider_request(payload),
                Err(BridgeError::InvalidRequest)
            ));
        }
        assert!(matches!(
            decode_apple_provider_request(vec![0; MAX_METADATA_BYTES + 1]),
            Err(BridgeError::PayloadTooLarge)
        ));
        assert!(matches!(
            encode_apple_provider_response("id".into(), b"{}".to_vec()),
            Err(BridgeError::InvalidRequest)
        ));
    }
}
