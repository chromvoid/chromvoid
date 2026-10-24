//! The embedding runtime owns admission for operations that replace storage or its pepper.
use std::sync::Arc;

use super::RpcResponse;

#[derive(Clone, Copy, Debug, PartialEq, Eq, thiserror::Error)]
pub enum StorageMutationError {
    #[error("Storage adoption must finish before this action")]
    AdoptionRequired,
}

impl StorageMutationError {
    pub const fn code(self) -> &'static str {
        match self {
            Self::AdoptionRequired => "ADOPTION_ACTION_FORBIDDEN",
        }
    }

    pub fn into_rpc_response(self) -> RpcResponse {
        RpcResponse::error(self.to_string(), Some(self.code()))
    }
}

/// The callback is evaluated on every admission and again at the destructive boundary.
/// Core deliberately does not interpret Android legacy paths or migration journals.
#[derive(Clone)]
pub struct StorageMutationGuard(Arc<dyn Fn() -> Result<(), StorageMutationError> + Send + Sync>);

impl Default for StorageMutationGuard {
    fn default() -> Self {
        Self::new(|| Ok(()))
    }
}

impl StorageMutationGuard {
    pub fn new(
        check: impl Fn() -> Result<(), StorageMutationError> + Send + Sync + 'static,
    ) -> Self {
        Self(Arc::new(check))
    }

    pub fn check(&self) -> Result<(), StorageMutationError> {
        self.0()
    }

    pub(crate) fn protects_command(command: &str) -> bool {
        // Unlock and repair diagnosis can initialize pepper and salt for an empty target.
        matches!(
            command,
            "admin:erase"
                | "admin:restore"
                | "vault:unlock"
                | "vault:rekey"
                | "vault:repair:diagnose"
                | "vault:repair:apply"
                | "master:setup"
                | "master:rekey"
        ) || command.starts_with("erase:")
            || command.starts_with("restore:local:")
    }
}
