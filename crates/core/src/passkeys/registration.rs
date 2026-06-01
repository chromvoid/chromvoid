use serde_json::Value;

use super::crypto::{generate_credential_id, generate_key_material};
use super::encoding::encode_b64url;
use super::request::{
    decode_b64url_field, has_client_data_hash, object_field, optional_str, origin_for_request,
    public_key_request, required_str,
};
use super::types::{
    now_epoch_ms, PasskeyCredentialSource, PasskeyError, PasskeyRegistration, ES256_ALGORITHM,
    P256_CURVE, PASSKEY_SCHEMA_V1, STORAGE_KIND_VAULT,
};
use super::validation::{
    reject_excluded_credentials, require_attestation_none, require_es256, validate_rp_id,
};
use super::webauthn::{
    attestation_object_none, client_data_hash, client_data_json, registration_authenticator_data,
    response_client_data_json,
};

pub fn create_registration(
    data: &Value,
    existing_sources: &[PasskeyCredentialSource],
) -> Result<PasskeyRegistration, PasskeyError> {
    let request = public_key_request(data);
    let rp = object_field(request, "rp")?;
    let user = object_field(request, "user")?;
    let rp_id = required_str(rp, "id")?.to_string();
    validate_rp_id(&rp_id)?;
    let rp_name = optional_str(rp, "name").unwrap_or(&rp_id).to_string();
    let user_name = required_str(user, "name")?.to_string();
    let user_display_name = optional_str(user, "displayName")
        .or_else(|| optional_str(user, "display_name"))
        .unwrap_or(&user_name)
        .to_string();
    let user_handle = decode_b64url_field(user, "id")?;
    if user_handle.is_empty() {
        return Err(PasskeyError::new("EMPTY_PAYLOAD", "user.id is required"));
    }
    require_es256(request)?;
    require_attestation_none(request)?;
    reject_excluded_credentials(request, existing_sources)?;

    let key_material = generate_key_material()?;
    let (credential_id, credential_id_b64url) = generate_credential_id();
    let now = now_epoch_ms();
    let source = PasskeyCredentialSource {
        schema: PASSKEY_SCHEMA_V1.to_string(),
        credential_id_b64url: credential_id_b64url.clone(),
        rp_id: rp_id.clone(),
        rp_name,
        user_handle_b64url: encode_b64url(&user_handle),
        user_name,
        user_display_name,
        algorithm: ES256_ALGORITHM,
        curve: P256_CURVE.to_string(),
        private_key_pkcs8_b64url: encode_b64url(&key_material.private_key_pkcs8),
        public_key_cose_b64url: encode_b64url(&key_material.public_key_cose),
        public_key_der_b64url: encode_b64url(&key_material.public_key_der),
        backup_eligible: true,
        backup_state: true,
        sign_count: 0,
        created_at_epoch_ms: now,
        last_used_epoch_ms: now,
    };

    let challenge = required_str(request, "challenge")?;
    let origin = origin_for_request(request, &rp_id);
    let client_data_json = client_data_json("webauthn.create", challenge, &origin);
    if has_client_data_hash(request) {
        client_data_hash(request, client_data_json.as_bytes())?;
    }
    let response_client_data_json = response_client_data_json(request, &client_data_json);
    let auth_data =
        registration_authenticator_data(&rp_id, &credential_id, &key_material.public_key_cose);
    let attestation_object = attestation_object_none(&auth_data);

    let response = serde_json::json!({
        "id": credential_id_b64url,
        "rawId": credential_id_b64url,
        "type": "public-key",
        "authenticatorAttachment": "platform",
        "response": {
            "clientDataJSON": encode_b64url(response_client_data_json.as_bytes()),
            "attestationObject": encode_b64url(&attestation_object),
            "authenticatorData": encode_b64url(&auth_data),
            "publicKey": source.public_key_der_b64url,
            "publicKeyAlgorithm": ES256_ALGORITHM,
            "transports": ["internal", "hybrid"],
        },
        "clientExtensionResults": {
            "credProps": {
                "rk": true
            }
        },
        "credentialIdB64Url": source.credential_id_b64url,
        "storageKind": STORAGE_KIND_VAULT,
        "portable": true,
    });

    Ok(PasskeyRegistration { source, response })
}
