//! Debug payloads for `credential_provider:list` diagnostics.

use super::super::credential_types::{CredentialProviderEntry, ProviderContext};
use super::super::state::RpcRouter;

impl RpcRouter {
    pub(in crate::rpc::router::credential_provider) fn credential_provider_debug_context(
        context: &ProviderContext,
    ) -> serde_json::Value {
        match context {
            ProviderContext::Web(web) => serde_json::json!({
                "kind": "web",
                "origin": web.origin_url.as_str(),
                "domain": web.domain,
            }),
            ProviderContext::App { app_id } => serde_json::json!({
                "kind": "app",
                "app_id": app_id,
            }),
        }
    }

    pub(in crate::rpc::router::credential_provider) fn credential_provider_debug_entry(
        &self,
        entry: &CredentialProviderEntry,
        context: Option<&ProviderContext>,
        query: Option<&str>,
    ) -> serde_json::Value {
        let query_matched = self.credential_provider_matches_query(entry, query);
        let context_match = if query_matched {
            self.credential_provider_match_entry_context(entry, context)
        } else {
            None
        };
        let rejection_reason = if !query_matched {
            Some("query_miss")
        } else if context_match.is_none() {
            Some(match context {
                Some(ProviderContext::Web(_))
                    if entry.url_rules.is_empty() && entry.domain.is_none() =>
                {
                    "no_web_match_metadata"
                }
                Some(ProviderContext::Web(_)) => "web_context_miss",
                Some(ProviderContext::App { .. }) if entry.app_id.is_none() => "no_app_id",
                Some(ProviderContext::App { .. }) => "app_context_miss",
                None => "context_miss",
            })
        } else {
            None
        };
        let (match_kind, matched_domain) = match context_match {
            Some((kind, domain)) => (Some(kind.as_str()), domain),
            None => (None, None),
        };

        serde_json::json!({
            "credential_id": entry.credential_id,
            "label": entry.label,
            "entry_domain": entry.domain,
            "app_id": entry.app_id,
            "has_password": entry.password_node_id.is_some(),
            "url_rules": entry.url_rules.iter().map(|rule| serde_json::json!({
                "value": rule.value,
                "match": rule.r#match,
            })).collect::<Vec<_>>(),
            "query_matched": query_matched,
            "matched": match_kind.is_some(),
            "match_kind": match_kind,
            "matched_domain": matched_domain,
            "rejection_reason": rejection_reason,
        })
    }
}
