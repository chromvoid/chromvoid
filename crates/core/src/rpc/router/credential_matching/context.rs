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
                let canonical_domain = origin_url
                    .host_str()
                    .map(Self::credential_provider_normalize_hostname)
                    .filter(|domain| !domain.is_empty())
                    .ok_or_else(|| {
                        CredentialProviderCommandError::invalid_context(
                            "context.origin must contain a hostname",
                        )
                    })?;

                if let Some(domain_value) = value.get("domain") {
                    let supplied_domain = domain_value
                        .as_str()
                        .map(Self::credential_provider_normalize_hostname)
                        .filter(|domain| !domain.is_empty())
                        .ok_or_else(|| {
                            CredentialProviderCommandError::invalid_context(
                                "context.domain must be a non-empty string",
                            )
                        })?;
                    if supplied_domain != canonical_domain {
                        return Err(CredentialProviderCommandError::invalid_context(
                            "context.domain must match context.origin hostname",
                        ));
                    }
                }

                Ok(ProviderContext::Web(ProviderContextWeb {
                    origin_url,
                    domain: canonical_domain,
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
