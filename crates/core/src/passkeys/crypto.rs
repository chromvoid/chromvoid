use p256::ecdsa::{signature::Signer, Signature, SigningKey, VerifyingKey};
use p256::pkcs8::{DecodePrivateKey, EncodePrivateKey, EncodePublicKey};
use rand_core::{OsRng, RngCore};
use zeroize::Zeroizing;

use super::encoding::{decode_b64url, encode_b64url};
use super::types::PasskeyError;

pub(super) struct PasskeyKeyMaterial {
    pub(super) private_key_pkcs8: Zeroizing<Vec<u8>>,
    pub(super) public_key_der: Vec<u8>,
    pub(super) public_key_cose: Vec<u8>,
}

pub(super) fn generate_key_material() -> Result<PasskeyKeyMaterial, PasskeyError> {
    let signing_key = SigningKey::random(&mut OsRng);
    let verifying_key = signing_key.verifying_key();
    let pkcs8 = signing_key
        .to_pkcs8_der()
        .map_err(|_| PasskeyError::new("INTERNAL_ERROR", "failed to encode private key"))?;
    let public_der = verifying_key
        .to_public_key_der()
        .map_err(|_| PasskeyError::new("INTERNAL_ERROR", "failed to encode public key"))?;
    let public_key_cose = public_key_cose(verifying_key)?;
    Ok(PasskeyKeyMaterial {
        private_key_pkcs8: Zeroizing::new(pkcs8.as_bytes().to_vec()),
        public_key_der: public_der.as_bytes().to_vec(),
        public_key_cose,
    })
}

pub(super) fn generate_credential_id() -> ([u8; 32], String) {
    let mut credential_id = [0u8; 32];
    OsRng.fill_bytes(&mut credential_id);
    let credential_id_b64url = encode_b64url(&credential_id);
    (credential_id, credential_id_b64url)
}

pub(super) fn sign_assertion(
    private_key_pkcs8_b64url: &str,
    signed_bytes: &[u8],
) -> Result<Vec<u8>, PasskeyError> {
    let pkcs8 = Zeroizing::new(
        decode_b64url(private_key_pkcs8_b64url)
            .map_err(|_| PasskeyError::new("INTERNAL_ERROR", "stored private key is invalid"))?,
    );
    let signing_key = SigningKey::from_pkcs8_der(pkcs8.as_slice())
        .map_err(|_| PasskeyError::new("INTERNAL_ERROR", "stored private key is invalid"))?;
    let signature: Signature = signing_key.sign(signed_bytes);
    Ok(signature.to_der().as_bytes().to_vec())
}

fn public_key_cose(verifying_key: &VerifyingKey) -> Result<Vec<u8>, PasskeyError> {
    let point = verifying_key.to_encoded_point(false);
    let x = point
        .x()
        .ok_or_else(|| PasskeyError::new("INTERNAL_ERROR", "missing public key x coordinate"))?;
    let y = point
        .y()
        .ok_or_else(|| PasskeyError::new("INTERNAL_ERROR", "missing public key y coordinate"))?;
    let mut out = vec![0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20];
    out.extend_from_slice(x);
    out.extend_from_slice(&[0x22, 0x58, 0x20]);
    out.extend_from_slice(y);
    Ok(out)
}
