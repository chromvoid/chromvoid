use super::error::CredentialProviderCommandError;

fn required_str<'a>(
    data: &'a serde_json::Value,
    field: &str,
) -> Result<&'a str, CredentialProviderCommandError> {
    data.get(field)
        .and_then(|value| value.as_str())
        .ok_or_else(|| CredentialProviderCommandError::empty_payload(field))
}

fn optional_str<'a>(data: &'a serde_json::Value, field: &str) -> Option<&'a str> {
    data.get(field).and_then(|value| value.as_str())
}

fn optional_bool(data: &serde_json::Value, field: &str) -> Option<bool> {
    data.get(field).and_then(|value| value.as_bool())
}

#[derive(Debug, Clone, Copy)]
pub(in crate::rpc::router) struct CredentialProviderListRequest {
    pub(in crate::rpc::router) include_debug: bool,
}

impl CredentialProviderListRequest {
    pub(in crate::rpc::router) fn parse(data: &serde_json::Value) -> Self {
        Self {
            include_debug: optional_bool(data, "include_debug").unwrap_or(false),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub(in crate::rpc::router) struct CredentialProviderSearchRequest<'a> {
    pub(in crate::rpc::router) query: &'a str,
}

impl<'a> CredentialProviderSearchRequest<'a> {
    pub(in crate::rpc::router) fn parse(data: &'a serde_json::Value) -> Self {
        Self {
            query: optional_str(data, "query").unwrap_or(""),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub(in crate::rpc::router) struct CredentialProviderCloseSessionRequest<'a> {
    pub(in crate::rpc::router) provider_session: &'a str,
}

impl<'a> CredentialProviderCloseSessionRequest<'a> {
    pub(in crate::rpc::router) fn parse(
        data: &'a serde_json::Value,
    ) -> Result<Self, CredentialProviderCommandError> {
        Ok(Self {
            provider_session: required_str(data, "provider_session")?,
        })
    }
}

#[derive(Debug, Clone, Copy)]
pub(in crate::rpc::router) struct CredentialProviderSecretRequest<'a> {
    pub(in crate::rpc::router) provider_session: &'a str,
    pub(in crate::rpc::router) credential_id: &'a str,
    pub(in crate::rpc::router) requested_otp_id: Option<&'a str>,
}

impl<'a> CredentialProviderSecretRequest<'a> {
    pub(in crate::rpc::router) fn parse(
        data: &'a serde_json::Value,
    ) -> Result<Self, CredentialProviderCommandError> {
        Ok(Self {
            provider_session: required_str(data, "provider_session")?,
            credential_id: required_str(data, "credential_id")?,
            requested_otp_id: optional_str(data, "otp_id").map(str::trim),
        })
    }
}

#[derive(Debug, Clone, Copy)]
pub(in crate::rpc::router) struct CredentialProviderRecordUseRequest<'a> {
    pub(in crate::rpc::router) provider_session: &'a str,
    pub(in crate::rpc::router) credential_id: &'a str,
}

impl<'a> CredentialProviderRecordUseRequest<'a> {
    pub(in crate::rpc::router) fn parse(
        data: &'a serde_json::Value,
    ) -> Result<Self, CredentialProviderCommandError> {
        Ok(Self {
            provider_session: required_str(data, "provider_session")?,
            credential_id: required_str(data, "credential_id")?,
        })
    }
}
