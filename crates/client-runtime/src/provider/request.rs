use serde::Deserialize;
use serde_json::Value;

/// SPEC-215 transport envelope, separate from the versioned Core RPC request.
#[derive(Deserialize)]
pub struct AppleProviderRequest {
    pub request_id: String,
    pub command: String,
    #[serde(default)]
    pub data: Value,
}

impl Drop for AppleProviderRequest {
    fn drop(&mut self) {
        crate::rpc_data::clear_rpc_strings(&mut self.data);
    }
}
