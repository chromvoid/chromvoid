use crate::rpc::types::RpcResponse;

#[derive(Debug, Clone)]
pub(super) struct RootExportError {
    message: String,
    code: Option<String>,
}

impl RootExportError {
    fn new(message: impl Into<String>, code: Option<String>) -> Self {
        Self {
            message: message.into(),
            code,
        }
    }

    pub(super) fn from_group_meta_load(error: super::super::group::GroupMetaLoadError) -> Self {
        let (message, code) = error.into_parts();
        Self::new(message, code)
    }

    pub(super) fn into_rpc_response(self) -> RpcResponse {
        RpcResponse::error(self.message, self.code)
    }
}
