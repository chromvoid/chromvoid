use serde_json::Value;

use super::request::{allow_credential_ids, public_key_request, rp_id_from_get_request};
use super::types::{PasskeyCredentialSource, PasskeyError};

pub fn query_candidates(
    data: &Value,
    sources: &[PasskeyCredentialSource],
) -> Result<Vec<PasskeyCredentialSource>, PasskeyError> {
    let request = public_key_request(data);
    let rp_id = rp_id_from_get_request(request)?;
    let allow_credentials = allow_credential_ids(request)?;
    let mut candidates: Vec<PasskeyCredentialSource> = sources
        .iter()
        .filter(|source| source.rp_id == rp_id)
        .filter(|source| {
            allow_credentials.is_empty() || allow_credentials.contains(&source.credential_id_b64url)
        })
        .cloned()
        .collect();
    candidates.sort_by(|a, b| {
        b.last_used_epoch_ms
            .cmp(&a.last_used_epoch_ms)
            .then_with(|| b.created_at_epoch_ms.cmp(&a.created_at_epoch_ms))
            .then_with(|| a.credential_id_b64url.cmp(&b.credential_id_b64url))
    });
    Ok(candidates)
}
