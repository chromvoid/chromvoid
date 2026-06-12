use sha2::{Digest, Sha256};

use super::encoding::cbor_bytes;
use super::types::{PasskeyError, PasskeyInvocationContext};

const FLAG_UP: u8 = 0x01;
const FLAG_UV: u8 = 0x04;
const FLAG_BE: u8 = 0x08;
const FLAG_BS: u8 = 0x10;
const FLAG_AT: u8 = 0x40;

pub(super) fn client_data_json(typ: &str, challenge: &str, origin: &str) -> String {
    serde_json::json!({
        "type": typ,
        "challenge": challenge,
        "origin": origin,
        "crossOrigin": false,
    })
    .to_string()
}

pub(super) fn client_data_hash(
    context: &PasskeyInvocationContext,
    client_data_json: &[u8],
) -> Result<Vec<u8>, PasskeyError> {
    if let Some(hash) = &context.client_data_hash {
        if hash.len() != 32 {
            return Err(PasskeyError::new(
                "INVALID_CONTEXT",
                "clientDataHash must be 32 bytes",
            ));
        }
        return Ok(hash.clone());
    }
    Ok(Sha256::digest(client_data_json).to_vec())
}

pub(super) fn response_client_data_json(
    context: &PasskeyInvocationContext,
    generated_client_data_json: &str,
) -> String {
    if context.client_data_hash.is_some() {
        "{}".to_string()
    } else {
        generated_client_data_json.to_string()
    }
}

pub(super) fn registration_authenticator_data(
    rp_id: &str,
    credential_id: &[u8],
    public_key_cose: &[u8],
) -> Vec<u8> {
    let rp_id_hash = Sha256::digest(rp_id.as_bytes());
    authenticator_data(
        &rp_id_hash,
        FLAG_UP | FLAG_UV | FLAG_BE | FLAG_BS | FLAG_AT,
        0,
        Some((credential_id, public_key_cose)),
    )
}

pub(super) fn assertion_authenticator_data(rp_id: &str, sign_count: u64) -> Vec<u8> {
    let rp_id_hash = Sha256::digest(rp_id.as_bytes());
    authenticator_data(
        &rp_id_hash,
        FLAG_UP | FLAG_UV | FLAG_BE | FLAG_BS,
        sign_count,
        None,
    )
}

pub(super) fn attestation_object_none(auth_data: &[u8]) -> Vec<u8> {
    let mut out = vec![
        0xa3, 0x63, b'f', b'm', b't', 0x64, b'n', b'o', b'n', b'e', 0x67, b'a', b't', b't', b'S',
        b't', b'm', b't', 0xa0, 0x68, b'a', b'u', b't', b'h', b'D', b'a', b't', b'a',
    ];
    cbor_bytes(auth_data, &mut out);
    out
}

fn authenticator_data(
    rp_id_hash: &[u8],
    flags: u8,
    sign_count: u64,
    attested: Option<(&[u8], &[u8])>,
) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(rp_id_hash);
    out.push(flags);
    let webauthn_sign_count = u32::try_from(sign_count).unwrap_or(u32::MAX);
    out.extend_from_slice(&webauthn_sign_count.to_be_bytes());
    if let Some((credential_id, public_key_cose)) = attested {
        out.extend_from_slice(&[0u8; 16]);
        out.extend_from_slice(&(credential_id.len() as u16).to_be_bytes());
        out.extend_from_slice(credential_id);
        out.extend_from_slice(public_key_cose);
    }
    out
}
