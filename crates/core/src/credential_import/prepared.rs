//! A reviewed document retained in Rust until an explicit, consuming commit action.
use crate::rpc::{
    helpers::clear_rpc_strings,
    types::{PassmanagerRootImportPreview, RpcRequest},
};
use serde_json::{json, Value};

#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(rename_all = "snake_case")]
pub enum CredentialImportMode {
    Merge,
    Replace,
    Restore,
}

impl CredentialImportMode {
    pub(crate) fn wire(self) -> &'static str {
        match self {
            Self::Merge => "merge",
            Self::Replace => "replace",
            Self::Restore => "restore",
        }
    }
}

/// Contains imported secrets. Platform clients receive only `preview()`; the document
/// stays with the runtime resource and is cleared when an unused review is dropped.
pub struct PreparedCredentialImport {
    document: Value,
    preview: PassmanagerRootImportPreview,
}

impl PreparedCredentialImport {
    pub(crate) fn new(document: Value, preview: PassmanagerRootImportPreview) -> Self {
        Self { document, preview }
    }

    pub fn preview(&self) -> &PassmanagerRootImportPreview {
        &self.preview
    }

    /// Call only for an explicit confirmation, after the owning runtime's authority
    /// and cancellation checks. Core revalidates the review revision during commit.
    pub fn into_commit_request(mut self) -> RpcRequest {
        self.document["allow_destructive"] = json!(true);
        self.document["expected_revision"] = json!(self.preview.revision);
        RpcRequest::new(
            "passmanager:root:import",
            std::mem::take(&mut self.document),
        )
    }
}

impl Drop for PreparedCredentialImport {
    fn drop(&mut self) {
        clear_rpc_strings(&mut self.document);
    }
}
