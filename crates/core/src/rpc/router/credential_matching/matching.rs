//! Rule-against-context matching for credential entries.

use regex::Regex;

use super::super::credential_types::{
    CredentialProviderEntry, PassmanagerUrlRule, ProviderContext, ProviderContextWeb,
    ProviderMatchKind,
};
use super::super::state::RpcRouter;

impl RpcRouter {
    pub(in crate::rpc::router::credential_matching) fn credential_provider_match_rule_for_web(
        &self,
        rule: &PassmanagerUrlRule,
        context: &ProviderContextWeb,
    ) -> Option<(ProviderMatchKind, String)> {
        let match_kind = rule.r#match.trim().to_ascii_lowercase();
        if match_kind == "never" {
            return None;
        }

        if match_kind == "regex" {
            let regex = Regex::new(rule.value.as_str()).ok()?;
            if regex.is_match(&Self::credential_provider_strip_hash(&context.origin_url)) {
                return Some((ProviderMatchKind::Exact, context.domain.clone()));
            }
            return None;
        }

        let parsed = Self::credential_provider_parse_rule_url(&rule.value)?;
        let parsed_host = parsed
            .host_str()
            .map(Self::credential_provider_normalize_hostname)?;

        let matched = match match_kind.as_str() {
            "exact" => {
                Self::credential_provider_strip_hash(&parsed)
                    == Self::credential_provider_strip_hash(&context.origin_url)
            }
            "starts_with" => Self::credential_provider_strip_hash(&context.origin_url)
                .starts_with(&Self::credential_provider_strip_hash(&parsed)),
            "host" => {
                let ctx_host = Self::credential_provider_normalize_hostname(
                    context.origin_url.host_str().unwrap_or_default(),
                );
                if ctx_host != parsed_host {
                    false
                } else if parsed.port().is_some() {
                    context.origin_url.port_or_known_default() == parsed.port_or_known_default()
                } else {
                    true
                }
            }
            "base_domain" | "" => {
                let left = Self::credential_provider_base_domain(&parsed_host)?;
                let right = Self::credential_provider_base_domain(&context.domain)?;
                left == right
            }
            _ => false,
        };
        if !matched {
            return None;
        }

        let relationship =
            Self::credential_provider_classify_domain_match(&context.domain, &parsed_host)
                .unwrap_or(ProviderMatchKind::EtldPlusOne);
        Some((relationship, parsed_host))
    }

    pub(in crate::rpc::router) fn credential_provider_match_entry_context(
        &self,
        entry: &CredentialProviderEntry,
        context: Option<&ProviderContext>,
    ) -> Option<(ProviderMatchKind, Option<String>)> {
        let Some(context) = context else {
            return Some((ProviderMatchKind::Exact, entry.domain.clone()));
        };

        match context {
            ProviderContext::App { app_id } => {
                if entry
                    .app_id
                    .as_deref()
                    .map(|v| v.eq_ignore_ascii_case(app_id))
                    .unwrap_or(false)
                {
                    Some((ProviderMatchKind::App, None))
                } else {
                    None
                }
            }
            ProviderContext::Web(web) => {
                let mut best: Option<(ProviderMatchKind, Option<String>)> = None;

                for rule in &entry.url_rules {
                    if let Some((kind, domain)) =
                        self.credential_provider_match_rule_for_web(rule, web)
                    {
                        match best {
                            Some((best_kind, _)) if best_kind >= kind => {}
                            _ => best = Some((kind, Some(domain))),
                        }
                    }
                }

                if best.is_none() {
                    if let Some(domain) = entry.domain.as_deref() {
                        if let Some(kind) =
                            Self::credential_provider_classify_domain_match(&web.domain, domain)
                        {
                            best = Some((kind, Some(domain.to_string())));
                        }
                    }
                }

                best
            }
        }
    }

    pub(in crate::rpc::router) fn credential_provider_matches_query(
        &self,
        entry: &CredentialProviderEntry,
        query: Option<&str>,
    ) -> bool {
        let Some(query) = query
            .map(|q| q.trim().to_ascii_lowercase())
            .filter(|q| !q.is_empty())
        else {
            return true;
        };

        entry.credential_id.to_ascii_lowercase().contains(&query)
            || entry.label.to_ascii_lowercase().contains(&query)
            || entry.username.to_ascii_lowercase().contains(&query)
            || entry
                .domain
                .as_deref()
                .map(|d| d.to_ascii_lowercase().contains(&query))
                .unwrap_or(false)
            || entry
                .app_id
                .as_deref()
                .map(|a| a.to_ascii_lowercase().contains(&query))
                .unwrap_or(false)
    }
}
