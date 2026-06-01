//! RPC context parsing for credential-provider commands.

use url::Url;

use crate::rpc::request_parse::optional_value;
use crate::rpc::router::credential_provider::error::CredentialProviderCommandError;

use super::super::credential_types::{ProviderContext, ProviderContextWeb};
use super::super::state::RpcRouter;

impl RpcRouter {
    pub(in crate::rpc::router) fn credential_provider_parse_context(
        &self,
        value: &serde_json::Value,
    ) -> Result<ProviderContext, CredentialProviderCommandError> {
        let kind = value
            .get("kind")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase();

        match kind.as_str() {
            "web" => {
                let origin = value
                    .get("origin")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if origin.is_empty() {
                    return Err(CredentialProviderCommandError::invalid_context(
                        "context.origin is required",
                    ));
                }
                let origin_url = Url::parse(&origin).map_err(|_| {
                    CredentialProviderCommandError::invalid_context("context.origin is invalid")
                })?;

                let domain = value
                    .get("domain")
                    .and_then(|v| v.as_str())
                    .map(Self::credential_provider_normalize_hostname)
                    .filter(|s| !s.is_empty())
                    .or_else(|| {
                        origin_url
                            .host_str()
                            .map(Self::credential_provider_normalize_hostname)
                    })
                    .unwrap_or_default();

                if domain.is_empty() {
                    return Err(CredentialProviderCommandError::invalid_context(
                        "context.domain is required",
                    ));
                }

                Ok(ProviderContext::Web(ProviderContextWeb {
                    origin_url,
                    domain,
                }))
            }
            "app" => {
                let app_id = value
                    .get("app_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if app_id.is_empty() {
                    return Err(CredentialProviderCommandError::invalid_context(
                        "context.app_id is required",
                    ));
                }
                Ok(ProviderContext::App { app_id })
            }
            _ => Err(CredentialProviderCommandError::invalid_context(
                "context.kind must be 'web' or 'app'",
            )),
        }
    }

    pub(in crate::rpc::router) fn credential_provider_extract_context(
        &self,
        data: &serde_json::Value,
        required: bool,
    ) -> Result<Option<ProviderContext>, CredentialProviderCommandError> {
        let context_value = optional_value(data, "context");
        if context_value.is_none() {
            if required {
                return Err(CredentialProviderCommandError::invalid_context(
                    "context is required",
                ));
            }
            return Ok(None);
        }

        match context_value {
            Some(v) if v.is_object() => self.credential_provider_parse_context(v).map(Some),
            _ => Err(CredentialProviderCommandError::invalid_context(
                "context must be an object",
            )),
        }
    }
}
