//! Credential provider RPC handlers (ADR-020)

use base64::{engine::general_purpose, Engine as _};
use zeroize::Zeroizing;

use crate::error::ErrorCode;
use crate::rpc::commands::{catalog_otp_generate_core, handle_passmanager_otp_generate_by_id};
use crate::rpc::types::{CredentialProviderStatusResponse, RpcResponse};

use super::credential_types::{
    CredentialProviderOtpResolution, CredentialProviderSession,
    CREDENTIAL_PROVIDER_SESSION_MAX_SECRET_USES, CREDENTIAL_PROVIDER_SESSION_TTL_SECS,
};
use super::state::RpcRouter;

impl RpcRouter {
    pub(super) fn credential_provider_status(&self) -> RpcResponse {
        RpcResponse::success(CredentialProviderStatusResponse {
            enabled: self.credential_provider_enabled,
            vault_open: self.session.is_some(),
            capability_matrix: super::credential_types::capability_matrix(),
            passkeys_lite_status: super::credential_types::passkeys_lite_status_matrix(),
            command_error_map: super::credential_types::command_error_map(),
        })
    }

    fn credential_provider_prune_sessions(&mut self) {
        let now = std::time::SystemTime::now();
        self.credential_provider_sessions
            .retain(|_, s| s.expires_at > now);
    }

    pub(super) fn credential_provider_open_session(&mut self) -> RpcResponse {
        if !self.credential_provider_enabled {
            return RpcResponse::error("Provider disabled", Some(ErrorCode::ProviderDisabled));
        }
        if self.session.is_none() {
            return RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultRequired));
        }

        self.credential_provider_prune_sessions();
        self.credential_provider_prune_allowlist();

        let mut buf = [0u8; 24];
        if let Err(e) = getrandom::getrandom(&mut buf) {
            return RpcResponse::error(
                format!("Failed to generate provider session: {e}"),
                Some(ErrorCode::InternalError),
            );
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

        self.credential_provider_sessions.insert(
            token.clone(),
            CredentialProviderSession {
                expires_at,
                secret_uses: 0,
            },
        );

        RpcResponse::success(serde_json::json!({
            "provider_session": token,
            "expires_at_ms": expires_at_ms,
        }))
    }

    pub(super) fn credential_provider_close_session(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        let token = match data.get("provider_session").and_then(|v| v.as_str()) {
            Some(v) => v,
            None => {
                return RpcResponse::error(
                    "provider_session is required",
                    Some(ErrorCode::EmptyPayload),
                )
            }
        };
        self.credential_provider_sessions.remove(token);
        RpcResponse::success(serde_json::json!({}))
    }

    fn credential_provider_validate_session(
        &mut self,
        token: &str,
        consume_secret_use: bool,
    ) -> Result<(), RpcResponse> {
        self.credential_provider_prune_sessions();
        let mut should_expire = false;

        let Some(session) = self.credential_provider_sessions.get_mut(token) else {
            return Err(RpcResponse::error(
                "Provider session expired",
                Some(ErrorCode::ProviderSessionExpired),
            ));
        };
        if std::time::SystemTime::now() >= session.expires_at {
            should_expire = true;
        }

        if consume_secret_use && !should_expire {
            if session.secret_uses >= CREDENTIAL_PROVIDER_SESSION_MAX_SECRET_USES {
                should_expire = true;
            } else {
                session.secret_uses = session.secret_uses.saturating_add(1);
            }
        }

        if should_expire {
            self.credential_provider_sessions.remove(token);
            return Err(RpcResponse::error(
                "Provider session expired",
                Some(ErrorCode::ProviderSessionExpired),
            ));
        }

        self.credential_provider_prune_allowlist();
        Ok(())
    }

    fn credential_provider_require_allowlisted(
        &self,
        credential_id: &str,
    ) -> Result<(), RpcResponse> {
        if !self
            .credential_provider_allowlist
            .contains_key(credential_id)
        {
            return Err(RpcResponse::error(
                "Credential is not allowlisted",
                Some(ErrorCode::AccessDenied),
            ));
        }
        Ok(())
    }

    fn credential_provider_preflight(&self) -> Result<(), RpcResponse> {
        if !self.credential_provider_enabled {
            return Err(RpcResponse::error(
                "Provider disabled",
                Some(ErrorCode::ProviderDisabled),
            ));
        }
        if self.session.is_none() {
            return Err(RpcResponse::error(
                "Vault not unlocked",
                Some(ErrorCode::VaultRequired),
            ));
        }
        Ok(())
    }

    pub(super) fn credential_provider_list(&mut self, data: &serde_json::Value) -> RpcResponse {
        if let Err(err) = self.credential_provider_preflight() {
            return err;
        }

        let context = match self.credential_provider_extract_context(data, true) {
            Ok(Some(c)) => c,
            Ok(None) => {
                return RpcResponse::error("context is required", Some(ErrorCode::InvalidContext))
            }
            Err(e) => return e,
        };

        let entries = match self.credential_provider_collect_entries() {
            Ok(entries) => entries,
            Err(err) => return err,
        };

        let candidates =
            self.credential_provider_collect_candidates(&entries, Some(&context), None);
        for candidate in &candidates {
            if let Some(credential_id) = candidate.get("credential_id").and_then(|v| v.as_str()) {
                self.credential_provider_allow(credential_id);
            }
        }

        RpcResponse::success(serde_json::json!({
            "candidates": candidates
        }))
    }

    pub(super) fn credential_provider_search(&mut self, data: &serde_json::Value) -> RpcResponse {
        if let Err(err) = self.credential_provider_preflight() {
            return err;
        }

        let context = match self.credential_provider_extract_context(data, false) {
            Ok(c) => c,
            Err(e) => return e,
        };

        let query = data.get("query").and_then(|v| v.as_str()).unwrap_or("");
        let entries = match self.credential_provider_collect_entries() {
            Ok(entries) => entries,
            Err(err) => return err,
        };

        let candidates =
            self.credential_provider_collect_candidates(&entries, context.as_ref(), Some(query));
        for candidate in &candidates {
            if let Some(credential_id) = candidate.get("credential_id").and_then(|v| v.as_str()) {
                self.credential_provider_allow(credential_id);
            }
        }

        RpcResponse::success(serde_json::json!({
            "candidates": candidates
        }))
    }

    pub(super) fn credential_provider_get_secret(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        if let Err(err) = self.credential_provider_preflight() {
            return err;
        }

        let provider_session = match data.get("provider_session").and_then(|v| v.as_str()) {
            Some(v) => v,
            None => {
                return RpcResponse::error(
                    "provider_session is required",
                    Some(ErrorCode::EmptyPayload),
                )
            }
        };
        if let Err(err) = self.credential_provider_validate_session(provider_session, true) {
            return err;
        }

        let credential_id = match data.get("credential_id").and_then(|v| v.as_str()) {
            Some(v) => v,
            None => {
                return RpcResponse::error(
                    "credential_id is required",
                    Some(ErrorCode::EmptyPayload),
                )
            }
        };

        if let Err(err) = self.credential_provider_require_allowlisted(credential_id) {
            return err;
        }

        let context = match self.credential_provider_extract_context(data, false) {
            Ok(c) => c,
            Err(e) => return e,
        };
        let entries = match self.credential_provider_collect_entries() {
            Ok(entries) => entries,
            Err(err) => return err,
        };
        let Some(entry) = entries
            .into_iter()
            .find(|entry| entry.credential_id == credential_id)
        else {
            return RpcResponse::error("No credential match", Some(ErrorCode::NoMatch));
        };

        if self
            .credential_provider_match_entry_context(&entry, context.as_ref())
            .is_none()
        {
            return RpcResponse::error("Access denied", Some(ErrorCode::AccessDenied));
        }

        let Some(session) = self.session.as_ref() else {
            return RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultRequired));
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

        let requested_otp_id = data.get("otp_id").and_then(|v| v.as_str()).map(str::trim);
        let otp = match self.credential_provider_generate_otp(&entry, session, requested_otp_id) {
            Ok(value) => value,
            Err(err) => return err,
        };

        let now_ms = Self::credential_provider_now_ms();
        self.credential_provider_last_used_at_ms
            .insert(credential_id.to_string(), now_ms);
        self.credential_provider_allow(credential_id);

        RpcResponse::success(serde_json::json!({
            "credential_id": credential_id,
            "username": entry.username,
            "password": password,
            "otp": otp,
        }))
    }

    fn credential_provider_generate_otp(
        &self,
        entry: &super::credential_types::CredentialProviderEntry,
        session: &crate::vault::VaultSession,
        requested_otp_id: Option<&str>,
    ) -> Result<Option<String>, RpcResponse> {
        let selected = if let Some(otp_id) = requested_otp_id {
            let otp_id = otp_id.trim();
            if otp_id.is_empty() {
                None
            } else {
                match entry.otp_options.iter().find(|option| option.id == otp_id) {
                    Some(option) => Some(option),
                    None => {
                        return Err(RpcResponse::error("No OTP match", Some(ErrorCode::NoMatch)))
                    }
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
            return Err(RpcResponse::error(
                "HOTP autofill is unsupported",
                Some(ErrorCode::OtpGenerateFailed),
            ));
        }

        let result = match &option.resolution {
            CredentialProviderOtpResolution::ById(otp_id) => handle_passmanager_otp_generate_by_id(
                session,
                &serde_json::json!({
                    "entry_id": entry.entry_id,
                    "otp_id": otp_id,
                }),
                &self.storage,
            ),
            CredentialProviderOtpResolution::ByLabel(label) => catalog_otp_generate_core(
                session,
                &serde_json::json!({
                    "node_id": entry.entry_node_id,
                    "label": label,
                }),
                &self.storage,
            ),
            CredentialProviderOtpResolution::FirstAvailable => catalog_otp_generate_core(
                session,
                &serde_json::json!({
                    "node_id": entry.entry_node_id,
                }),
                &self.storage,
            ),
        };

        match result {
            RpcResponse::Success { result, .. } => Ok(result
                .get("otp")
                .and_then(|v| v.as_str())
                .map(ToString::to_string)),
            RpcResponse::Error { .. } => {
                if requested_otp_id.is_some() {
                    Err(result)
                } else {
                    Ok(None)
                }
            }
        }
    }

    pub(super) fn credential_provider_record_use(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        if let Err(err) = self.credential_provider_preflight() {
            return err;
        }

        let provider_session = match data.get("provider_session").and_then(|v| v.as_str()) {
            Some(v) => v,
            None => {
                return RpcResponse::error(
                    "provider_session is required",
                    Some(ErrorCode::EmptyPayload),
                )
            }
        };
        if let Err(err) = self.credential_provider_validate_session(provider_session, false) {
            return err;
        }

        let credential_id = match data.get("credential_id").and_then(|v| v.as_str()) {
            Some(v) => v,
            None => {
                return RpcResponse::error(
                    "credential_id is required",
                    Some(ErrorCode::EmptyPayload),
                )
            }
        };

        if let Err(err) = self.credential_provider_require_allowlisted(credential_id) {
            return err;
        }

        let context = match self.credential_provider_extract_context(data, false) {
            Ok(c) => c,
            Err(e) => return e,
        };

        let entries = match self.credential_provider_collect_entries() {
            Ok(entries) => entries,
            Err(err) => return err,
        };
        let Some(entry) = entries
            .into_iter()
            .find(|entry| entry.credential_id == credential_id)
        else {
            return RpcResponse::error("No credential match", Some(ErrorCode::NoMatch));
        };

        if self
            .credential_provider_match_entry_context(&entry, context.as_ref())
            .is_none()
        {
            return RpcResponse::error("Access denied", Some(ErrorCode::AccessDenied));
        }

        let now_ms = Self::credential_provider_now_ms();
        self.credential_provider_last_used_at_ms
            .insert(credential_id.to_string(), now_ms);

        RpcResponse::success(serde_json::json!({}))
    }

    pub(super) fn credential_provider_passkey_stub(&self, data: &serde_json::Value) -> RpcResponse {
        let platform = match data.get("platform").and_then(|v| v.as_str()) {
            Some(v) if !v.trim().is_empty() => v.trim(),
            _ => return RpcResponse::error("platform is required", Some(ErrorCode::EmptyPayload)),
        };
        let platform_version_major = data.get("platform_version_major").and_then(|v| v.as_u64());
        let reason =
            super::credential_types::passkey_unsupported_reason(platform, platform_version_major);
        RpcResponse::error(reason, Some(ErrorCode::ProviderUnavailable))
    }
}
