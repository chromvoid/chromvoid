//! Scoped internal reads for system-domain files.

use crate::error::ErrorCode;
use crate::rpc::commands::with_system_shard_guard_bypass;
use crate::rpc::types::RpcResponse;
use crate::storage::Storage;
use crate::vault::VaultSession;

use super::blob_io::{read_single_blob, BlobIoError};

#[derive(Debug, Clone)]
pub(in crate::rpc::router) struct DomainReadError {
    message: String,
    code: Option<String>,
}

pub(in crate::rpc::router) type DomainReadResult<T> = Result<T, DomainReadError>;

impl DomainReadError {
    pub(in crate::rpc::router) fn new(message: impl Into<String>, code: Option<ErrorCode>) -> Self {
        Self {
            message: message.into(),
            code: code.map(String::from),
        }
    }

    pub(in crate::rpc::router) fn internal(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::InternalError))
    }

    pub(in crate::rpc::router) fn access_denied(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::AccessDenied))
    }

    pub(in crate::rpc::router) fn node_not_found(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::NodeNotFound))
    }

    pub(in crate::rpc::router) fn message(&self) -> &str {
        &self.message
    }

    pub(in crate::rpc::router) fn code(&self) -> Option<&str> {
        self.code.as_deref()
    }

    pub(in crate::rpc::router) fn into_parts(self) -> (String, Option<String>) {
        (self.message, self.code)
    }

    pub(in crate::rpc::router) fn into_rpc_response(self) -> RpcResponse {
        let (message, code) = self.into_parts();
        RpcResponse::error(message, code)
    }
}

impl From<BlobIoError> for DomainReadError {
    fn from(error: BlobIoError) -> Self {
        match error {
            BlobIoError::AccessDenied => Self::access_denied("Access denied"),
            BlobIoError::NodeNotFound => Self::node_not_found("Node not found"),
            BlobIoError::NotFile => Self::internal("Node is not a file"),
            BlobIoError::InvalidNodeId => Self::internal("Invalid node_id"),
            BlobIoError::Crypto(error)
            | BlobIoError::Storage(error)
            | BlobIoError::Save(error)
            | BlobIoError::DerivativeIndex(error) => Self::internal(error),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum DomainReadScope {
    Passmanager,
    Passkeys,
    Wallet,
}

impl DomainReadScope {
    fn root(self) -> &'static str {
        match self {
            Self::Passmanager => "/.passmanager",
            Self::Passkeys => "/.passkeys",
            Self::Wallet => "/.wallet",
        }
    }

    fn contains_path(self, path: &str) -> bool {
        let root = self.root();
        path == root
            || path
                .strip_prefix(root)
                .is_some_and(|tail| tail.starts_with('/'))
    }
}

pub(super) fn read_blob_by_node(
    session: &VaultSession,
    storage: &Storage,
    scope: DomainReadScope,
    node_id: u64,
) -> DomainReadResult<Vec<u8>> {
    let Some(path) = session.catalog().get_path(node_id) else {
        return Err(DomainReadError::node_not_found("Node not found"));
    };
    if !scope.contains_path(&path) {
        return Err(DomainReadError::access_denied("Access denied"));
    }
    let Some(node) = session.catalog().find_by_id(node_id) else {
        return Err(DomainReadError::node_not_found("Node not found"));
    };
    if !node.is_file() {
        return Err(DomainReadError::internal("Node is not a file"));
    }

    with_system_shard_guard_bypass(|| {
        read_single_blob(session, storage, node_id).map_err(Into::into)
    })
}

pub(super) fn read_blob_by_path(
    session: &VaultSession,
    storage: &Storage,
    scope: DomainReadScope,
    path: &str,
) -> DomainReadResult<Option<Vec<u8>>> {
    if !scope.contains_path(path) {
        return Err(DomainReadError::access_denied("Access denied"));
    }
    let Some(node) = session.catalog().find_by_path(path) else {
        return Ok(None);
    };
    if !node.is_file() {
        return Ok(None);
    }
    read_blob_by_node(session, storage, scope, node.node_id).map(Some)
}

#[cfg(test)]
mod tests {
    use super::super::blob_io::BlobIoError;
    use super::{DomainReadError, DomainReadScope};

    #[test]
    fn scope_contains_only_exact_root_or_children() {
        assert!(DomainReadScope::Passmanager.contains_path("/.passmanager"));
        assert!(DomainReadScope::Passmanager.contains_path("/.passmanager/a"));
        assert!(!DomainReadScope::Passmanager.contains_path("/.passmanager2"));
        assert!(!DomainReadScope::Passmanager.contains_path("/docs/.passmanager"));
        assert!(!DomainReadScope::Passmanager.contains_path("/.wallet/a"));
    }

    #[test]
    fn domain_read_error_maps_known_failures_to_rpc_response() {
        let cases = [
            (
                DomainReadError::from(BlobIoError::AccessDenied),
                "Access denied",
                "ACCESS_DENIED",
            ),
            (
                DomainReadError::from(BlobIoError::NodeNotFound),
                "Node not found",
                "NODE_NOT_FOUND",
            ),
            (
                DomainReadError::from(BlobIoError::NotFile),
                "Node is not a file",
                "INTERNAL_ERROR",
            ),
            (
                DomainReadError::from(BlobIoError::InvalidNodeId),
                "Invalid node_id",
                "INTERNAL_ERROR",
            ),
            (
                DomainReadError::from(BlobIoError::Crypto("crypto failed".to_string())),
                "crypto failed",
                "INTERNAL_ERROR",
            ),
            (
                DomainReadError::from(BlobIoError::Storage(
                    "Failed to read chunk: missing".to_string(),
                )),
                "Failed to read chunk: missing",
                "INTERNAL_ERROR",
            ),
            (
                DomainReadError::from(BlobIoError::Save("save failed".to_string())),
                "save failed",
                "INTERNAL_ERROR",
            ),
            (
                DomainReadError::from(BlobIoError::DerivativeIndex(
                    "derivative failed".to_string(),
                )),
                "derivative failed",
                "INTERNAL_ERROR",
            ),
        ];

        for (error, message, code) in cases {
            assert_eq!(error.message(), message);
            assert_eq!(error.code(), Some(code));
            let response = error.into_rpc_response();
            assert_eq!(response.error_message(), Some(message));
            assert_eq!(response.code(), Some(code));
        }
    }
}
