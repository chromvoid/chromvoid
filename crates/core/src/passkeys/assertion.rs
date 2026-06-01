use serde_json::Value;

use super::crypto::sign_assertion;
use super::encoding::encode_b64url;
use super::query::query_candidates;
use super::request::{
    origin_for_request, public_key_request, required_str, rp_id_from_get_request,
    selected_credential_id,
};
use super::types::{
    now_epoch_ms, PasskeyAssertion, PasskeyCredentialSource, PasskeyError, STORAGE_KIND_VAULT,
};
use super::webauthn::{
    assertion_authenticator_data, client_data_hash, client_data_json, response_client_data_json,
};

pub fn create_assertion(
    data: &Value,
    sources: &[PasskeyCredentialSource],
) -> Result<PasskeyAssertion, PasskeyError> {
    let request = public_key_request(data);
    let rp_id = rp_id_from_get_request(request)?;
    let candidates = query_candidates(data, sources)?;
    let selected_id = selected_credential_id(data)
        .or_else(|| selected_credential_id(request))
        .or_else(|| {
            candidates
                .first()
                .map(|source| source.credential_id_b64url.as_str())
        })
        .ok_or_else(|| PasskeyError::new("NO_MATCH", "No matching passkey"))?;
    let selected_id = selected_id.to_string();
    let mut source = candidates
        .into_iter()
        .find(|source| source.credential_id_b64url == selected_id)
        .ok_or_else(|| PasskeyError::new("NO_MATCH", "No matching passkey"))?;

    let challenge = required_str(request, "challenge")?;
    let origin = origin_for_request(request, &rp_id);
    let client_data_json = client_data_json("webauthn.get", challenge, &origin);
    let client_data_hash = client_data_hash(request, client_data_json.as_bytes())?;
    let response_client_data_json = response_client_data_json(request, &client_data_json);
    let auth_data = assertion_authenticator_data(&rp_id);
    let mut signed = auth_data.clone();
    signed.extend_from_slice(&client_data_hash);
    let signature = sign_assertion(&source.private_key_pkcs8_b64url, &signed)?;
    source.last_used_epoch_ms = now_epoch_ms();
    source.sign_count = 0;

    let response = serde_json::json!({
        "id": source.credential_id_b64url,
        "rawId": source.credential_id_b64url,
        "type": "public-key",
        "authenticatorAttachment": "platform",
        "response": {
            "authenticatorData": encode_b64url(&auth_data),
            "clientDataJSON": encode_b64url(response_client_data_json.as_bytes()),
            "signature": encode_b64url(&signature),
            "userHandle": source.user_handle_b64url,
        },
        "clientExtensionResults": {},
        "credentialIdB64Url": source.credential_id_b64url,
        "storageKind": STORAGE_KIND_VAULT,
        "portable": true,
    });

    Ok(PasskeyAssertion { source, response })
}
