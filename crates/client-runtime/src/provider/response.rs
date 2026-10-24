use chromvoid_core::rpc::types::RpcResponse;
use serde_json::{Value, json};

use crate::rpc_data::clear_rpc_strings;

/// Builds the existing Apple bridge envelope. Sensitive results must be written
/// to the platform's transient Keychain carrier before publishing a reference.
/// The writer must not include result contents in its error message.
pub fn response_envelope(
    command: &str,
    request_id: &str,
    response: RpcResponse,
    store_secret: impl FnOnce(&str, &Value) -> Result<String, String>,
) -> Value {
    let response = match response {
        RpcResponse::Success { mut result, .. } if requires_secret_reference(command) => {
            let stored = store_secret(request_id, &result);
            clear_rpc_strings(&mut result);
            match stored {
                Ok(secret_ref) => RpcResponse::success(json!({"secret_ref": secret_ref})),
                Err(error) => RpcResponse::error(error, Some("INTERNAL".to_string())),
            }
        }
        other => other,
    };
    in_memory_response_envelope(request_id, response)
}

/// Direct IPC only: the result may contain secrets and must never be persisted.
pub fn in_memory_response_envelope(request_id: &str, response: RpcResponse) -> Value {
    match response {
        RpcResponse::Success { result, .. } => json!({
            "request_id": request_id,
            "success": true,
            "result": result,
        }),
        RpcResponse::Error { error, code, .. } => json!({
            "request_id": request_id,
            "success": false,
            "error": error,
            "error_code": code,
        }),
    }
}

fn requires_secret_reference(command: &str) -> bool {
    matches!(
        command.trim(),
        "credential_provider:getSecret"
            | "credential_provider:getOneTimeCode"
            | "credential_provider:session:open"
            | "credential_provider:passkey:create"
            | "credential_provider:passkey:get"
    )
}

pub fn secret_ref_for_request(request_id: &str) -> Result<String, String> {
    let trimmed = request_id.trim();
    if trimmed.is_empty() {
        return Err("credential secret request_id is empty".to_string());
    }
    Ok(format!("credential-provider-secret:{trimmed}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sensitive_results_are_available_only_through_the_transient_store() {
        let cases = [
            (
                "credential_provider:getSecret",
                json!({"password": "synthetic-password"}),
            ),
            (
                "credential_provider:getOneTimeCode",
                json!({"code": "123456", "valid_until_ms": 123}),
            ),
            (
                "credential_provider:session:open",
                json!({"provider_session": "synthetic-session"}),
            ),
            (
                "credential_provider:passkey:create",
                json!({"response": {"attestationObject": "synthetic-attestation"}}),
            ),
            (
                "credential_provider:passkey:get",
                json!({"response": {"authenticatorData": "synthetic-auth-data", "signature": "synthetic-signature", "clientDataJSON": "synthetic-client-data"}}),
            ),
        ];
        for (command, result) in cases {
            let mut stored = None;
            let envelope = response_envelope(
                command,
                "req-1",
                RpcResponse::success(result.clone()),
                |id, value| {
                    assert_eq!(id, "req-1");
                    stored = Some(value.clone());
                    secret_ref_for_request(id)
                },
            );
            assert_eq!(
                envelope,
                json!({
                    "request_id": "req-1", "success": true,
                    "result": {"secret_ref": "credential-provider-secret:req-1"},
                }),
                "{command}"
            );
            assert_eq!(stored, Some(result), "{command}");
        }
    }

    #[test]
    fn failed_secret_storage_never_falls_back_to_raw_result() {
        let envelope = response_envelope(
            "credential_provider:passkey:get",
            "req-1",
            RpcResponse::success(json!({"response": {"signature": "synthetic-signature"}})),
            |_, _| Err("Keychain unavailable".to_string()),
        );
        assert_eq!(
            envelope,
            json!({"request_id": "req-1", "success": false,
            "error": "Keychain unavailable", "error_code": "INTERNAL"})
        );
    }

    #[test]
    fn metadata_and_rpc_errors_keep_the_existing_envelope_without_secret_storage() {
        let result = json!({"credentials": [{"credentialId": "id", "rpId": "example.com"}]});
        let envelope = response_envelope(
            "credential_provider:passkey:query",
            "req-1",
            RpcResponse::success(result.clone()),
            |_, _| panic!("metadata must not enter the secret store"),
        );
        assert_eq!(
            envelope,
            json!({"request_id": "req-1", "success": true, "result": result})
        );
        for code in [None, Some("PROVIDER_UNAVAILABLE".to_string())] {
            let envelope = response_envelope(
                "credential_provider:getSecret",
                "req-2",
                RpcResponse::error("Unavailable", code.clone()),
                |_, _| panic!("errors must not enter the secret store"),
            );
            assert_eq!(
                envelope,
                json!({"request_id": "req-2", "success": false,
                "error": "Unavailable", "error_code": code})
            );
        }
    }

    #[test]
    fn reference_preserves_existing_request_id_format() {
        assert_eq!(
            secret_ref_for_request(" req-2 ").as_deref(),
            Ok("credential-provider-secret:req-2")
        );
        assert!(secret_ref_for_request(" ").is_err());
    }
}
