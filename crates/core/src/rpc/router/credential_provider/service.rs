use base64::{engine::general_purpose, Engine as _};
use zeroize::Zeroizing;

use crate::rpc::router::credential_matching::CredentialProviderCandidate;
use crate::rpc::router::otp_sidecar::{generate_otp, OtpGenerateRequest};
use crate::rpc::router::passmanager::otp::generate_by_id_lookup;
use crate::rpc::router::passmanager::otp_target::PassmanagerOtpTargetRequest;

use super::super::credential_types::{
    CredentialProviderEntry, CredentialProviderOtpResolution, CredentialProviderSession,
    ProviderContext, CREDENTIAL_PROVIDER_SESSION_TTL_SECS,
};
use super::super::state::RpcRouter;
use super::error::CredentialProviderCommandError;
use super::request::{
    CredentialProviderListRequest, CredentialProviderRecordUseRequest,
    CredentialProviderSearchRequest, CredentialProviderSecretRequest,
};

pub(in crate::rpc::router) struct CredentialProviderOpenSessionResult {
    pub(in crate::rpc::router) provider_session: String,
    pub(in crate::rpc::router) expires_at_ms: u64,
}

pub(in crate::rpc::router) struct CredentialProviderCandidateList {
    pub(in crate::rpc::router) candidates: Vec<CredentialProviderCandidate>,
    pub(in crate::rpc::router) debug: Option<serde_json::Value>,
}

pub(in crate::rpc::router) struct CredentialProviderSecretResult {
    pub(in crate::rpc::router) credential_id: String,
    pub(in crate::rpc::router) username: String,
    pub(in crate::rpc::router) password: Option<String>,
    pub(in crate::rpc::router) otp: Option<String>,
}

impl RpcRouter {
    pub(in crate::rpc::router::credential_provider) fn credential_provider_preflight_typed(
        &self,
    ) -> Result<(), CredentialProviderCommandError> {
        if !self.credential_provider_runtime.is_enabled() {
            return Err(CredentialProviderCommandError::provider_disabled());
        }
        if self.session.is_none() {
            return Err(CredentialProviderCommandError::vault_required());
        }
        Ok(())
    }

    pub(in crate::rpc::router::credential_provider) fn credential_provider_open_session_service(
        &mut self,
    ) -> Result<CredentialProviderOpenSessionResult, CredentialProviderCommandError> {
        self.credential_provider_preflight_typed()?;

        self.credential_provider_runtime.prune_sessions();
        self.credential_provider_runtime.prune_allowlist();

        let mut buf = [0u8; 24];
        if let Err(e) = getrandom::getrandom(&mut buf) {
            return Err(CredentialProviderCommandError::internal(format!(
                "Failed to generate provider session: {e}"
            )));
        }
        let token = general_purpose::URL_SAFE_NO_PAD.encode(buf);
        let ttl = std::time::Duration::from_secs(CREDENTIAL_PROVIDER_SESSION_TTL_SECS);
        let expires_at = std::time::SystemTime::now()
            .checked_add(ttl)
            .unwrap_or_else(std::time::SystemTime::now);
        let expires_at_ms = expires_at
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        self.credential_provider_runtime.insert_session(
            token.clone(),
            CredentialProviderSession {
                expires_at,
                secret_uses: 0,
            },
        );

        Ok(CredentialProviderOpenSessionResult {
            provider_session: token,
            expires_at_ms,
        })
    }

    pub(in crate::rpc::router::credential_provider) fn credential_provider_close_session_service(
        &mut self,
        provider_session: &str,
    ) {
        self.credential_provider_runtime
            .remove_session(provider_session);
    }

    pub(in crate::rpc::router::credential_provider) fn credential_provider_validate_session_typed(
        &mut self,
        token: &str,
        consume_secret_use: bool,
    ) -> Result<(), CredentialProviderCommandError> {
        if !self
            .credential_provider_runtime
            .validate_session(token, consume_secret_use)
        {
            return Err(CredentialProviderCommandError::provider_session_expired());
        }
        Ok(())
    }

    pub(in crate::rpc::router::credential_provider) fn credential_provider_require_allowlisted_typed(
        &self,
        credential_id: &str,
    ) -> Result<(), CredentialProviderCommandError> {
        if !self
            .credential_provider_runtime
            .is_allowlisted(credential_id)
        {
            return Err(CredentialProviderCommandError::credential_not_allowlisted());
        }
        Ok(())
    }

    pub(in crate::rpc::router::credential_provider) fn credential_provider_list_service(
        &mut self,
        request: CredentialProviderListRequest,
        context: ProviderContext,
    ) -> Result<CredentialProviderCandidateList, CredentialProviderCommandError> {
        if request.include_debug {
            let (entries, collection_diagnostics) =
                self.credential_provider_collect_entries_with_diagnostics()?;
            let debug_entries = entries
                .iter()
                .map(|entry| self.credential_provider_debug_entry(entry, Some(&context), None))
                .collect::<Vec<_>>();
            let candidates =
                self.credential_provider_collect_candidates(&entries, Some(&context), None);
            let debug = serde_json::json!({
                "context": Self::credential_provider_debug_context(&context),
                "entry_count": entries.len(),
                "candidate_count": candidates.len(),
                "collection": collection_diagnostics.to_json(),
                "entries": debug_entries,
            });

            #[cfg(debug_assertions)]
            {
                let diagnostics_json = debug.to_string();
                tracing::info!(
                    target: "chromvoid_core::credential_provider",
                    diagnostics = %diagnostics_json,
                    "credential_provider:list diagnostics"
                );
            }

            self.credential_provider_allow_candidates(&candidates);
            return Ok(CredentialProviderCandidateList {
                candidates,
                debug: Some(debug),
            });
        }

        let entries = self.credential_provider_collect_entries()?;
        let candidates =
            self.credential_provider_collect_candidates(&entries, Some(&context), None);
        self.credential_provider_allow_candidates(&candidates);
        Ok(CredentialProviderCandidateList {
            candidates,
            debug: None,
        })
    }

    pub(in crate::rpc::router::credential_provider) fn credential_provider_search_service(
        &mut self,
        request: CredentialProviderSearchRequest<'_>,
        context: Option<ProviderContext>,
    ) -> Result<CredentialProviderCandidateList, CredentialProviderCommandError> {
        let entries = self.credential_provider_collect_entries()?;
        let candidates = self.credential_provider_collect_candidates(
            &entries,
            context.as_ref(),
            Some(request.query),
        );
        self.credential_provider_allow_candidates(&candidates);
        Ok(CredentialProviderCandidateList {
            candidates,
            debug: None,
        })
    }

    pub(in crate::rpc::router::credential_provider) fn credential_provider_get_secret_service(
        &mut self,
        request: CredentialProviderSecretRequest<'_>,
        context: Option<ProviderContext>,
    ) -> Result<CredentialProviderSecretResult, CredentialProviderCommandError> {
        self.credential_provider_validate_session_typed(request.provider_session, false)?;
        self.credential_provider_require_allowlisted_typed(request.credential_id)?;

        let entries = self.credential_provider_collect_entries()?;
        let entry = self.credential_provider_find_context_entry(
            entries,
            request.credential_id,
            context.as_ref(),
        )?;

        self.credential_provider_validate_session_typed(request.provider_session, true)?;

        let Some(session) = self.session.as_ref() else {
            return Err(CredentialProviderCommandError::vault_required());
        };

        let password = match entry.password_node_id {
            Some(node_id) => self
                .read_file_plain(session.vault_key(), node_id)
                .ok()
                .map(|bytes| {
                    let bytes = Zeroizing::new(bytes);
                    String::from_utf8_lossy(bytes.as_slice()).to_string()
                }),
            None => None,
        };

        let otp =
            self.credential_provider_generate_otp(&entry, session, request.requested_otp_id)?;

        let now_ms = Self::credential_provider_now_ms();
        self.credential_provider_runtime
            .record_last_used(request.credential_id, now_ms);
        self.credential_provider_allow(request.credential_id);

        Ok(CredentialProviderSecretResult {
            credential_id: request.credential_id.to_string(),
            username: entry.username,
            password,
            otp,
        })
    }

    pub(in crate::rpc::router::credential_provider) fn credential_provider_record_use_service(
        &mut self,
        request: CredentialProviderRecordUseRequest<'_>,
        context: Option<ProviderContext>,
    ) -> Result<(), CredentialProviderCommandError> {
        self.credential_provider_validate_session_typed(request.provider_session, false)?;
        self.credential_provider_require_allowlisted_typed(request.credential_id)?;

        let entries = self.credential_provider_collect_entries()?;
        let _entry = self.credential_provider_find_context_entry(
            entries,
            request.credential_id,
            context.as_ref(),
        )?;

        let now_ms = Self::credential_provider_now_ms();
        self.credential_provider_runtime
            .record_last_used(request.credential_id, now_ms);

        Ok(())
    }

    fn credential_provider_allow_candidates(&mut self, candidates: &[CredentialProviderCandidate]) {
        for candidate in candidates {
            self.credential_provider_allow(&candidate.credential_id);
        }
    }

    fn credential_provider_find_context_entry(
        &self,
        entries: Vec<CredentialProviderEntry>,
        credential_id: &str,
        context: Option<&ProviderContext>,
    ) -> Result<CredentialProviderEntry, CredentialProviderCommandError> {
        let Some(entry) = entries
            .into_iter()
            .find(|entry| entry.credential_id == credential_id)
        else {
            return Err(CredentialProviderCommandError::no_credential_match());
        };

        if self
            .credential_provider_match_entry_context(&entry, context)
            .is_none()
        {
            return Err(CredentialProviderCommandError::access_denied());
        }

        Ok(entry)
    }

    fn credential_provider_generate_otp(
        &self,
        entry: &CredentialProviderEntry,
        session: &crate::vault::VaultSession,
        requested_otp_id: Option<&str>,
    ) -> Result<Option<String>, CredentialProviderCommandError> {
        let selected = if let Some(otp_id) = requested_otp_id {
            let otp_id = otp_id.trim();
            if otp_id.is_empty() {
                None
            } else {
                match entry.otp_options.iter().find(|option| option.id == otp_id) {
                    Some(option) => Some(option),
                    None => return Err(CredentialProviderCommandError::no_otp_match()),
                }
            }
        } else {
            entry
                .otp_options
                .iter()
                .find(|option| option.otp_type.as_deref() != Some("HOTP"))
        };

        let Some(option) = selected else {
            return Ok(None);
        };

        if option.otp_type.as_deref() == Some("HOTP") {
            return Err(CredentialProviderCommandError::hotp_autofill_unsupported());
        }

        let result = match &option.resolution {
            CredentialProviderOtpResolution::ById(otp_id) => generate_by_id_lookup(
                session,
                &self.storage,
                &self.passmanager_otp_target_cache,
                PassmanagerOtpTargetRequest {
                    otp_id: Some(otp_id.as_str()),
                    entry_id: Some(entry.entry_id.as_str()),
                    fallback_label: None,
                },
                None,
            )
            .map(|response| response.otp)
            .map_err(CredentialProviderCommandError::from),
            CredentialProviderOtpResolution::ByLabel(label) => generate_otp(
                session,
                &self.storage,
                OtpGenerateRequest {
                    node_id: entry.entry_node_id,
                    label: Some(label.as_str()),
                    ts: None,
                },
            )
            .map(|response| response.otp)
            .map_err(CredentialProviderCommandError::from),
            CredentialProviderOtpResolution::FirstAvailable => generate_otp(
                session,
                &self.storage,
                OtpGenerateRequest {
                    node_id: entry.entry_node_id,
                    label: None,
                    ts: None,
                },
            )
            .map(|response| response.otp)
            .map_err(CredentialProviderCommandError::from),
        };

        match result {
            Ok(otp) => Ok(Some(otp)),
            Err(error) => {
                if requested_otp_id.is_some() {
                    Err(error)
                } else {
                    Ok(None)
                }
            }
        }
    }
}
