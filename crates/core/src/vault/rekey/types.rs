use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

#[derive(Clone)]
pub struct VaultRekeyRequest {
    pub current_password: Zeroizing<String>,
    pub new_password: Zeroizing<String>,
}

impl VaultRekeyRequest {
    pub fn new(current_password: impl Into<String>, new_password: impl Into<String>) -> Self {
        Self {
            current_password: Zeroizing::new(current_password.into()),
            new_password: Zeroizing::new(new_password.into()),
        }
    }
}

impl std::fmt::Debug for VaultRekeyRequest {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("VaultRekeyRequest")
            .field("current_password", &"[redacted]")
            .field("new_password", &"[redacted]")
            .finish()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultRekeyProgress {
    pub phase: String,
    pub processed_chunks: u64,
    pub total_chunks: u64,
    pub can_cancel: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultRekeyResult {
    pub migrated_chunks: u64,
    pub deleted_old_chunks: u64,
    pub preserved_unknown_chunks: u64,
    pub deleted_derivative_chunks: u64,
    pub duration_ms: u64,
    pub backup_recommended: bool,
}

#[derive(Debug, Clone)]
pub(super) struct ChunkPair {
    pub(super) old_name: String,
    pub(super) new_name: String,
}

#[cfg(test)]
mod tests {
    use zeroize::Zeroizing;

    use super::VaultRekeyRequest;

    #[test]
    fn rekey_request_debug_redacts_passwords_and_uses_zeroizing_fields() {
        let request = VaultRekeyRequest::new("old-secret-password", "new-secret-password");
        let debug = format!("{request:?}");

        assert!(!debug.contains("old-secret-password"));
        assert!(!debug.contains("new-secret-password"));
        assert!(debug.contains("[redacted]"));

        fn assert_zeroizing_string(_: &Zeroizing<String>) {}
        assert_zeroizing_string(&request.current_password);
        assert_zeroizing_string(&request.new_password);
    }
}
