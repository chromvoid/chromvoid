use super::types::{PasskeyCredentialSource, STORAGE_KIND_VAULT};

pub fn source_to_summary(
    source: &PasskeyCredentialSource,
) -> crate::rpc::types::VaultPasskeySummary {
    crate::rpc::types::VaultPasskeySummary {
        credential_id_b64url: source.credential_id_b64url.clone(),
        rp_id: source.rp_id.clone(),
        rp_name: source.rp_name.clone(),
        user_name: source.user_name.clone(),
        user_display_name: source.user_display_name.clone(),
        sign_count: source.sign_count,
        created_at_epoch_ms: source.created_at_epoch_ms,
        last_used_epoch_ms: source.last_used_epoch_ms,
        storage_kind: STORAGE_KIND_VAULT.to_string(),
        portable: true,
    }
}
