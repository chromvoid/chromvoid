use std::collections::BTreeMap;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::{DateTime, Utc};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};

use super::error::LicenseError;
use super::types::SignedCert;

pub(super) fn validate_cert(
    cert: &SignedCert,
    trusted_keys: &BTreeMap<String, VerifyingKey>,
    expected_fingerprint: &str,
) -> Result<(), LicenseError> {
    if cert.payload.v != 1 {
        return Err(LicenseError::UnsupportedCertVersion);
    }
    if cert.payload.featureset != "pro" {
        return Err(LicenseError::UnsupportedFeatureset);
    }
    if cert.payload.device_fingerprint != expected_fingerprint {
        return Err(LicenseError::FingerprintMismatch);
    }
    if let Some(exp) = cert.payload.exp.as_deref() {
        let expires_at = DateTime::parse_from_rfc3339(exp)
            .map_err(|_| LicenseError::InvalidExpiration)?
            .with_timezone(&Utc);
        if expires_at <= Utc::now() {
            return Err(LicenseError::CertExpired);
        }
    }
    if trusted_keys.is_empty() {
        return Err(LicenseError::NoTrustedPublicKey);
    }
    let verifying_key = trusted_keys
        .get(&cert.payload.kid)
        .ok_or(LicenseError::UnknownKeyId)?;
    let payload_bytes = serde_json::to_vec(&cert.payload).map_err(LicenseError::message)?;
    let signature_bytes = URL_SAFE_NO_PAD
        .decode(&cert.signature)
        .or_else(|_| base64::engine::general_purpose::STANDARD.decode(&cert.signature))
        .map_err(|error| LicenseError::InvalidSignatureEncoding(error.to_string()))?;
    let signature_bytes: [u8; 64] = signature_bytes
        .try_into()
        .map_err(|_| LicenseError::InvalidSignatureLength)?;
    let signature = Signature::from_bytes(&signature_bytes);
    verifying_key
        .verify(&payload_bytes, &signature)
        .map_err(|_| LicenseError::InvalidSignature)
}
