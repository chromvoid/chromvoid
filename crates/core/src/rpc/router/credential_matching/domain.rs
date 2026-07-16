//! URL/host normalization helpers.

use url::Url;

use super::super::credential_types::ProviderMatchKind;
use super::super::state::RpcRouter;

impl RpcRouter {
    pub(in crate::rpc::router::credential_matching) fn credential_provider_normalize_hostname(
        hostname: &str,
    ) -> String {
        hostname
            .trim()
            .to_ascii_lowercase()
            .trim_start_matches("www.")
            .to_string()
    }

    pub(in crate::rpc::router::credential_matching) fn credential_provider_base_domain(
        hostname: &str,
    ) -> Option<String> {
        let host = Self::credential_provider_normalize_hostname(hostname);
        psl::domain_str(&host).map(str::to_string)
    }

    pub(in crate::rpc::router::credential_matching) fn credential_provider_strip_hash(
        url: &Url,
    ) -> String {
        let mut out = format!("{}{}", url.origin().ascii_serialization(), url.path());
        if let Some(query) = url.query() {
            out.push('?');
            out.push_str(query);
        }
        out
    }

    pub(in crate::rpc::router::credential_matching) fn credential_provider_parse_rule_url(
        raw: &str,
    ) -> Option<Url> {
        let input = raw.trim();
        if input.is_empty() {
            return None;
        }
        Url::parse(input)
            .ok()
            .or_else(|| Url::parse(&format!("http://{input}")).ok())
    }

    pub(in crate::rpc::router::credential_matching) fn credential_provider_classify_domain_match(
        context_domain: &str,
        candidate_domain: &str,
    ) -> Option<ProviderMatchKind> {
        let ctx = Self::credential_provider_normalize_hostname(context_domain);
        let candidate = Self::credential_provider_normalize_hostname(candidate_domain);

        if ctx.is_empty() || candidate.is_empty() {
            return None;
        }
        if ctx == candidate {
            return Some(ProviderMatchKind::Exact);
        }
        if ctx.ends_with(&format!(".{candidate}")) {
            return Some(ProviderMatchKind::Subdomain);
        }

        let ctx_base = Self::credential_provider_base_domain(&ctx);
        let candidate_base = Self::credential_provider_base_domain(&candidate);
        if ctx_base.is_some() && ctx_base == candidate_base {
            return Some(ProviderMatchKind::EtldPlusOne);
        }

        None
    }
}
