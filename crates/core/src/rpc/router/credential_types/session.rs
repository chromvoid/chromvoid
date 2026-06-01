#[derive(Debug, Clone)]
pub(in crate::rpc::router) struct CredentialProviderSession {
    pub(in crate::rpc::router) expires_at: std::time::SystemTime,
    pub(in crate::rpc::router) secret_uses: u8,
}
