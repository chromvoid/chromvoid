//! Best-effort cleanup of owned JSON string values at the client boundary.
pub use chromvoid_core::rpc::helpers::clear_rpc_strings;
use zeroize::Zeroize;

/// Clears an owned response when delivery is revoked or its consumer finishes.
#[derive(Debug, serde::Serialize)]
#[serde(transparent)]
pub struct OwnedRpcResponse(pub(crate) chromvoid_core::rpc::types::RpcResponse);

impl std::ops::Deref for OwnedRpcResponse {
    type Target = chromvoid_core::rpc::types::RpcResponse;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl Drop for OwnedRpcResponse {
    fn drop(&mut self) {
        use chromvoid_core::rpc::types::RpcResponse;
        match &mut self.0 {
            RpcResponse::Success { result, .. } => clear_rpc_strings(result),
            RpcResponse::Error { error, code, .. } => {
                error.zeroize();
                if let Some(code) = code {
                    code.zeroize();
                }
            }
        }
    }
}
