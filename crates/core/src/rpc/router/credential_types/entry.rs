use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub(in crate::rpc::router) struct PassmanagerUrlRule {
    pub(in crate::rpc::router) value: String,
    #[serde(default)]
    pub(in crate::rpc::router) r#match: String,
}

#[derive(Debug, Clone)]
pub(in crate::rpc::router) enum CredentialProviderOtpResolution {
    ById(String),
    ByLabel(String),
    FirstAvailable,
}

#[derive(Debug, Clone)]
pub(in crate::rpc::router) struct CredentialProviderOtpOption {
    pub(in crate::rpc::router) id: String,
    pub(in crate::rpc::router) label: Option<String>,
    pub(in crate::rpc::router) otp_type: Option<String>,
    pub(in crate::rpc::router) resolution: CredentialProviderOtpResolution,
}

#[derive(Debug, Clone)]
pub(in crate::rpc::router) struct CredentialProviderEntry {
    pub(in crate::rpc::router) credential_id: String,
    pub(in crate::rpc::router) entry_id: String,
    pub(in crate::rpc::router) label: String,
    pub(in crate::rpc::router) username: String,
    pub(in crate::rpc::router) domain: Option<String>,
    pub(in crate::rpc::router) app_id: Option<String>,
    pub(in crate::rpc::router) entry_node_id: u64,
    pub(in crate::rpc::router) password_node_id: Option<u64>,
    pub(in crate::rpc::router) otp_options: Vec<CredentialProviderOtpOption>,
    pub(in crate::rpc::router) url_rules: Vec<PassmanagerUrlRule>,
}
