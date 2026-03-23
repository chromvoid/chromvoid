//! Credential provider matching and entry collection logic (ADR-020)

use std::collections::HashMap;

use regex::Regex;
use url::Url;

use crate::error::ErrorCode;
use crate::rpc::types::RpcResponse;
use crate::vault::VaultSession;

use super::credential_types::{
    CredentialProviderEntry, CredentialProviderOtpOption, CredentialProviderOtpResolution,
    PassmanagerMeta, PassmanagerUrlRule, PassmanagerUrlRuleCompat, ProviderContext,
    ProviderContextWeb, ProviderMatchKind, CREDENTIAL_PROVIDER_ALLOWLIST_TTL_SECS,
};
use super::state::RpcRouter;

impl RpcRouter {
    pub(super) fn credential_provider_now_ms() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    }

    fn credential_provider_normalize_hostname(hostname: &str) -> String {
        hostname
            .trim()
            .to_ascii_lowercase()
            .trim_start_matches("www.")
            .to_string()
    }

    fn credential_provider_base_domain(hostname: &str) -> Option<String> {
        const COMMON_SLD: &[&str] = &["co", "com", "net", "org", "gov", "edu", "ac"];

        let host = Self::credential_provider_normalize_hostname(hostname);
        let parts: Vec<&str> = host.split('.').filter(|s| !s.is_empty()).collect();
        if parts.len() < 2 {
            return None;
        }

        let last = parts[parts.len() - 1];
        let second_last = parts[parts.len() - 2];
        let third_last = parts.get(parts.len().saturating_sub(3)).copied();

        if last.len() == 2 && COMMON_SLD.contains(&second_last) {
            if let Some(third) = third_last {
                return Some(format!("{third}.{second_last}.{last}"));
            }
        }

        Some(format!("{second_last}.{last}"))
    }

    fn credential_provider_strip_hash(url: &Url) -> String {
        let mut out = format!("{}{}", url.origin().ascii_serialization(), url.path());
        if let Some(query) = url.query() {
            out.push('?');
            out.push_str(query);
        }
        out
    }

    fn credential_provider_parse_rule_url(raw: &str) -> Option<Url> {
        let input = raw.trim();
        if input.is_empty() {
            return None;
        }
        Url::parse(input)
            .ok()
            .or_else(|| Url::parse(&format!("http://{input}")).ok())
    }

    fn credential_provider_classify_domain_match(
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

    pub(super) fn credential_provider_parse_context(
        &self,
        value: &serde_json::Value,
    ) -> Result<ProviderContext, RpcResponse> {
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
                    return Err(RpcResponse::error(
                        "context.origin is required",
                        Some(ErrorCode::InvalidContext),
                    ));
                }
                let origin_url = Url::parse(&origin).map_err(|_| {
                    RpcResponse::error("context.origin is invalid", Some(ErrorCode::InvalidContext))
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
                    return Err(RpcResponse::error(
                        "context.domain is required",
                        Some(ErrorCode::InvalidContext),
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
                    return Err(RpcResponse::error(
                        "context.app_id is required",
                        Some(ErrorCode::InvalidContext),
                    ));
                }
                Ok(ProviderContext::App { app_id })
            }
            _ => Err(RpcResponse::error(
                "context.kind must be 'web' or 'app'",
                Some(ErrorCode::InvalidContext),
            )),
        }
    }

    pub(super) fn credential_provider_extract_context(
        &self,
        data: &serde_json::Value,
        required: bool,
    ) -> Result<Option<ProviderContext>, RpcResponse> {
        let context_value = data.get("context");
        if context_value.is_none() {
            if required {
                return Err(RpcResponse::error(
                    "context is required",
                    Some(ErrorCode::InvalidContext),
                ));
            }
            return Ok(None);
        }

        match context_value {
            Some(v) if v.is_object() => self.credential_provider_parse_context(v).map(Some),
            _ => Err(RpcResponse::error(
                "context must be an object",
                Some(ErrorCode::InvalidContext),
            )),
        }
    }

    fn credential_provider_match_rule_for_web(
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

    pub(super) fn credential_provider_match_entry_context(
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

    pub(super) fn credential_provider_matches_query(
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

    pub(super) fn credential_provider_entry_from_node(
        &self,
        session: &VaultSession,
        dir_node: &crate::catalog::CatalogNode,
    ) -> Option<CredentialProviderEntry> {
        let meta_node = dir_node.find_child("meta.json")?;
        if !meta_node.is_file() {
            return None;
        }

        let meta_bytes = self
            .read_file_plain(session.vault_key(), meta_node.node_id)
            .ok()?;
        let mut meta: PassmanagerMeta = serde_json::from_slice(&meta_bytes).ok()?;

        let mut url_rules = meta
            .urls
            .take()
            .unwrap_or_default()
            .into_iter()
            .filter_map(PassmanagerUrlRuleCompat::into_rule)
            .collect::<Vec<_>>();
        if url_rules.is_empty() {
            if let Some(url) = meta.url.take() {
                if !url.trim().is_empty() {
                    url_rules.push(PassmanagerUrlRule {
                        value: url,
                        r#match: "base_domain".to_string(),
                    });
                }
            }
        }

        let domain = url_rules
            .iter()
            .filter_map(|r| Self::credential_provider_parse_rule_url(&r.value))
            .filter_map(|u| {
                u.host_str()
                    .map(Self::credential_provider_normalize_hostname)
            })
            .find(|d| !d.is_empty());

        let password_node_id = dir_node
            .find_child(".password")
            .filter(|n| n.is_file())
            .map(|n| n.node_id);

        let entry_id = meta
            .id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(ToString::to_string)
            .unwrap_or_else(|| format!("entry-{}", dir_node.node_id));
        let credential_id = entry_id.clone();

        let raw_otps = meta.otps.as_ref().cloned().unwrap_or_default();
        let otp_count = raw_otps.len();
        let otp_options = raw_otps
            .into_iter()
            .enumerate()
            .filter_map(|(index, otp)| {
                let persisted_id = otp
                    .id
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(ToString::to_string);
                let label = otp
                    .label
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(ToString::to_string);
                let otp_type = otp
                    .r#type
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(|value| value.to_ascii_uppercase())
                    .or_else(|| Some("TOTP".to_string()));

                let resolution = if let Some(id) = persisted_id.clone() {
                    CredentialProviderOtpResolution::ById(id)
                } else if let Some(label) = label.clone() {
                    CredentialProviderOtpResolution::ByLabel(label)
                } else if otp_count == 1 {
                    CredentialProviderOtpResolution::FirstAvailable
                } else {
                    return None;
                };

                Some(CredentialProviderOtpOption {
                    id: persisted_id.unwrap_or_else(|| format!("otp-{}", index + 1)),
                    label,
                    otp_type,
                    resolution,
                })
            })
            .collect::<Vec<_>>();

        let label = meta
            .title
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(ToString::to_string)
            .unwrap_or_else(|| dir_node.name.clone());
        let username = meta
            .username
            .as_deref()
            .map(str::trim)
            .unwrap_or_default()
            .to_string();
        let app_id = meta
            .app_id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(ToString::to_string);

        Some(CredentialProviderEntry {
            credential_id,
            entry_id,
            label,
            username,
            domain,
            app_id,
            entry_node_id: dir_node.node_id,
            password_node_id,
            otp_options,
            url_rules,
        })
    }

    fn credential_provider_collect_entries_recursive(
        &self,
        session: &VaultSession,
        node: &crate::catalog::CatalogNode,
        out: &mut Vec<CredentialProviderEntry>,
    ) {
        for child in node.children() {
            if !child.is_dir() {
                continue;
            }
            if let Some(entry) = self.credential_provider_entry_from_node(session, child) {
                out.push(entry);
            }
            self.credential_provider_collect_entries_recursive(session, child, out);
        }
    }

    fn credential_provider_disambiguate_duplicate_ids(
        &self,
        entries: &mut [CredentialProviderEntry],
    ) {
        let mut counts = HashMap::<String, usize>::new();
        for entry in entries.iter() {
            *counts.entry(entry.credential_id.clone()).or_insert(0) += 1;
        }

        for entry in entries.iter_mut() {
            if counts.get(&entry.credential_id).copied().unwrap_or(0) > 1 {
                entry.credential_id = format!("{}@{}", entry.credential_id, entry.entry_node_id);
            }
        }
    }

    pub(super) fn credential_provider_collect_entries(
        &self,
    ) -> Result<Vec<CredentialProviderEntry>, RpcResponse> {
        let Some(session) = self.session.as_ref() else {
            return Err(RpcResponse::error(
                "Vault not unlocked",
                Some(ErrorCode::VaultRequired),
            ));
        };

        let Some(pm_root) = session.catalog().find_by_path("/.passmanager") else {
            return Ok(Vec::new());
        };

        let mut out: Vec<CredentialProviderEntry> = Vec::new();
        self.credential_provider_collect_entries_recursive(session, pm_root, &mut out);
        self.credential_provider_disambiguate_duplicate_ids(&mut out);
        Ok(out)
    }

    pub(super) fn credential_provider_prune_allowlist(&mut self) {
        let now = std::time::SystemTime::now();
        self.credential_provider_allowlist
            .retain(|_, expires_at| *expires_at > now);
    }

    pub(super) fn credential_provider_allow(&mut self, credential_id: &str) {
        self.credential_provider_prune_allowlist();
        let ttl = std::time::Duration::from_secs(CREDENTIAL_PROVIDER_ALLOWLIST_TTL_SECS);
        let expires_at = std::time::SystemTime::now()
            .checked_add(ttl)
            .unwrap_or_else(std::time::SystemTime::now);
        self.credential_provider_allowlist
            .insert(credential_id.to_string(), expires_at);
    }

    pub(super) fn credential_provider_collect_candidates(
        &self,
        entries: &[CredentialProviderEntry],
        context: Option<&ProviderContext>,
        query: Option<&str>,
    ) -> Vec<serde_json::Value> {
        let mut candidates = Vec::<serde_json::Value>::new();

        for entry in entries {
            if !self.credential_provider_matches_query(entry, query) {
                continue;
            }

            let Some((kind, matched_domain)) =
                self.credential_provider_match_entry_context(entry, context)
            else {
                continue;
            };

            let last_used_at = self
                .credential_provider_last_used_at_ms
                .get(&entry.credential_id)
                .copied();

            candidates.push(serde_json::json!({
                "credential_id": entry.credential_id,
                "label": entry.label,
                "username": entry.username,
                "domain": matched_domain.or_else(|| entry.domain.clone()),
                "app_id": entry.app_id,
                "match": kind.as_str(),
                "otp_options": entry.otp_options.iter().map(|otp| serde_json::json!({
                    "id": otp.id,
                    "label": otp.label,
                    "type": otp.otp_type,
                })).collect::<Vec<_>>(),
                "last_used_at": last_used_at,
            }));
        }

        candidates.sort_by(|left, right| {
            let l_used = left
                .get("last_used_at")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let r_used = right
                .get("last_used_at")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            r_used.cmp(&l_used).then_with(|| {
                left.get("label")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .cmp(right.get("label").and_then(|v| v.as_str()).unwrap_or(""))
            })
        });

        candidates
    }
}
