//! Metadata projection only; platform persistence and lifecycle belong to the host adapter.
use chromvoid_client_runtime::provider::{
    CredentialIdentityProjection, project_credential_identities,
};
use chromvoid_core::rpc::types::RpcResponse;

use crate::{BridgeError, MAX_METADATA_BYTES};

#[derive(Debug, PartialEq, Eq, uniffi::Record)]
pub struct AirPasswordIdentity {
    pub record_identifier: String,
    pub username: String,
    pub domain: String,
}

/// Projects an authorized Core search response; this pure function grants no provider authority.
/// iOS OTP identities remain disabled by the existing platform capability contract.
#[uniffi::export]
pub fn apple_password_identities(
    response: Vec<u8>,
) -> Result<Vec<AirPasswordIdentity>, BridgeError> {
    let response = zeroize::Zeroizing::new(response);
    if response.len() > MAX_METADATA_BYTES {
        return Err(BridgeError::PayloadTooLarge);
    }
    let mut response: RpcResponse =
        serde_json::from_slice(&response).map_err(|_| BridgeError::InvalidRequest)?;
    let result = match &mut response {
        RpcResponse::Success { result, .. } => result,
        RpcResponse::Error { .. } => return Err(BridgeError::CapabilityUnavailable),
    };
    let projected = (|| {
        let candidates = result
            .get("candidates")
            .and_then(serde_json::Value::as_array)
            .ok_or(BridgeError::InvalidRequest)?;
        Ok(project_credential_identities(candidates, false)
            .into_iter()
            .filter_map(|identity| match identity {
                CredentialIdentityProjection::Password {
                    credential_id,
                    username,
                    domain,
                } => Some(AirPasswordIdentity {
                    record_identifier: credential_id,
                    username,
                    domain,
                }),
                CredentialIdentityProjection::OneTimeCode { .. } => None,
            })
            .collect())
    })();
    chromvoid_client_runtime::rpc_data::clear_rpc_strings(result);
    projected
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn preserves_shared_metadata_projection_and_omits_secret_fields() {
        let response = RpcResponse::success(json!({"candidates":[
            {"credential_id":"alpha", "username":"alice", "domain":" example.test ",
             "password":"must-not-cross", "otp_options":[{"id":"totp", "type":"totp"}]},
            {"credential_id":"beta", "domain":"second.test"},
            {"credential_id":"no-domain", "username":"discard"}
        ]}));
        let actual = apple_password_identities(serde_json::to_vec(&response).unwrap()).unwrap();
        assert_eq!(
            actual,
            vec![
                AirPasswordIdentity {
                    record_identifier: "alpha".into(),
                    username: "alice".into(),
                    domain: "example.test".into()
                },
                AirPasswordIdentity {
                    record_identifier: "beta".into(),
                    username: "".into(),
                    domain: "second.test".into()
                },
            ]
        );
    }

    #[test]
    fn failed_malformed_and_oversized_responses_never_produce_identities() {
        let denied = RpcResponse::error("Locked", Some("VAULT_REQUIRED".to_string()));
        assert!(matches!(
            apple_password_identities(serde_json::to_vec(&denied).unwrap()),
            Err(BridgeError::CapabilityUnavailable)
        ));
        for response in [
            b"{".to_vec(),
            serde_json::to_vec(&RpcResponse::success(json!({}))).unwrap(),
        ] {
            assert!(matches!(
                apple_password_identities(response),
                Err(BridgeError::InvalidRequest)
            ));
        }
        assert!(matches!(
            apple_password_identities(vec![0; MAX_METADATA_BYTES + 1]),
            Err(BridgeError::PayloadTooLarge)
        ));
    }
}
