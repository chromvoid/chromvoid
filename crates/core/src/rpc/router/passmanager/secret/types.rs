use serde::Serialize;

pub(super) struct SecretSaveRequest {
    pub(super) entry_id: String,
    pub(super) secret_type: String,
    pub(super) value: String,
}

impl SecretSaveRequest {
    pub(super) fn new(entry_id: String, secret_type: String, value: String) -> Self {
        Self {
            entry_id,
            secret_type,
            value,
        }
    }
}

pub(super) struct SecretTargetRequest {
    pub(super) entry_id: String,
    pub(super) secret_type: String,
}

impl SecretTargetRequest {
    pub(super) fn new(entry_id: String, secret_type: String) -> Self {
        Self {
            entry_id,
            secret_type,
        }
    }
}

#[derive(Serialize)]
pub(super) struct SecretReadResult {
    pub(super) value: String,
}

impl SecretReadResult {
    pub(super) fn new(value: String) -> Self {
        Self { value }
    }
}
