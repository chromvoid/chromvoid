//! Allowlist TTL pruning + candidate collection for credential-provider RPCs.

use serde::Serialize;

use super::super::credential_types::{CredentialProviderEntry, ProviderContext};
use super::super::state::RpcRouter;

#[derive(Debug, Clone, Serialize)]
pub(in crate::rpc::router) struct CredentialProviderOtpCandidate {
    id: String,
    label: Option<String>,
    #[serde(rename = "type")]
    otp_type: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub(in crate::rpc::router) struct CredentialProviderCandidate {
    pub(in crate::rpc::router) credential_id: String,
    label: String,
    username: String,
    domain: Option<String>,
    app_id: Option<String>,
    #[serde(rename = "match")]
    match_kind: &'static str,
    otp_options: Vec<CredentialProviderOtpCandidate>,
    last_used_at: Option<u64>,
}

impl RpcRouter {
    pub(in crate::rpc::router) fn credential_provider_now_ms() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    }

    pub(in crate::rpc::router) fn credential_provider_allow(&mut self, credential_id: &str) {
        self.credential_provider_runtime.allow(credential_id);
    }

    pub(in crate::rpc::router) fn credential_provider_collect_candidates(
        &self,
        entries: &[CredentialProviderEntry],
        context: Option<&ProviderContext>,
        query: Option<&str>,
    ) -> Vec<CredentialProviderCandidate> {
        let mut candidates = Vec::<CredentialProviderCandidate>::new();

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
                .credential_provider_runtime
                .last_used_at_ms(&entry.credential_id);

            candidates.push(CredentialProviderCandidate {
                credential_id: entry.credential_id.clone(),
                label: entry.label.clone(),
                username: entry.username.clone(),
                domain: matched_domain.or_else(|| entry.domain.clone()),
                app_id: entry.app_id.clone(),
                match_kind: kind.as_str(),
                otp_options: entry
                    .otp_options
                    .iter()
                    .map(|otp| CredentialProviderOtpCandidate {
                        id: otp.id.clone(),
                        label: otp.label.clone(),
                        otp_type: otp.otp_type.clone(),
                    })
                    .collect(),
                last_used_at,
            });
        }

        candidates.sort_by(|left, right| {
            let l_used = left.last_used_at.unwrap_or(0);
            let r_used = right.last_used_at.unwrap_or(0);
            r_used
                .cmp(&l_used)
                .then_with(|| left.label.cmp(&right.label))
        });

        candidates
    }
}
