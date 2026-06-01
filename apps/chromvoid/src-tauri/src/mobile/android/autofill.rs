#![cfg_attr(not(target_os = "android"), allow(dead_code))]

use crate::credential_provider_contract::credential_provider_status_bool;
use crate::CoreAdapter;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::collections::HashSet;
use std::sync::{Arc, Mutex, MutexGuard};
use uuid::Uuid;

use super::provider_status::provider_runtime_unavailable;
use super::runtime::with_shared_provider_adapter;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AutofillContext {
    pub origin: String,
    pub domain: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AutofillCandidate {
    pub credential_id: String,
    pub label: String,
    pub username: String,
    pub domain: Option<String>,
    pub app_id: Option<String>,
    pub match_kind: String,
    pub otp_options: Vec<AutofillOtpOption>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AutofillOtpOption {
    pub id: String,
    pub label: Option<String>,
    pub otp_type: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AutofillSecret {
    pub credential_id: String,
    pub username: String,
    pub password: Option<String>,
    pub otp: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AutofillDegradedState {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AutofillListResult {
    pub candidates: Vec<AutofillCandidate>,
    pub degraded: Option<AutofillDegradedState>,
    pub debug: Option<Value>,
}

#[derive(Debug, Clone)]
struct AndroidAutofillRuntimeSession {
    context: AutofillContext,
    allowlisted_ids: HashSet<String>,
    expires_at_ms: u64,
}

const ANDROID_AUTOFILL_RUNTIME_SESSION_TTL_MS: u64 = 120_000;
const AUTOFILL_RUNTIME_SESSION_STORE_UNAVAILABLE: &str =
    "Autofill runtime session store unavailable";

pub(crate) struct AndroidAutofillRuntimeState {
    sessions: Mutex<HashMap<String, AndroidAutofillRuntimeSession>>,
}

impl AndroidAutofillRuntimeState {
    pub(crate) fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    fn sessions(
        &self,
    ) -> Result<MutexGuard<'_, HashMap<String, AndroidAutofillRuntimeSession>>, String> {
        self.sessions
            .lock()
            .map_err(|_| AUTOFILL_RUNTIME_SESSION_STORE_UNAVAILABLE.to_string())
    }

    fn create_session(
        &self,
        context: &AutofillContext,
        candidates: &[AutofillCandidate],
    ) -> Result<Option<String>, String> {
        if candidates.is_empty() {
            return Ok(None);
        }

        let session_id = Uuid::new_v4().to_string();
        let allowlisted_ids = candidates
            .iter()
            .map(|candidate| candidate.credential_id.clone())
            .collect::<HashSet<_>>();
        let expires_at_ms =
            runtime_autofill_now_ms().saturating_add(ANDROID_AUTOFILL_RUNTIME_SESSION_TTL_MS);

        let mut sessions = self.sessions()?;
        runtime_autofill_prune_sessions(&mut sessions);
        sessions.insert(
            session_id.clone(),
            AndroidAutofillRuntimeSession {
                context: context.clone(),
                allowlisted_ids,
                expires_at_ms,
            },
        );
        Ok(Some(session_id))
    }

    fn take_session(
        &self,
        session_id: &str,
    ) -> Result<Option<AndroidAutofillRuntimeSession>, String> {
        let mut sessions = self.sessions()?;
        runtime_autofill_prune_sessions(&mut sessions);
        Ok(sessions.remove(session_id))
    }

    fn close_session(&self, session_id: &str) -> Result<bool, String> {
        let mut sessions = self.sessions()?;
        runtime_autofill_prune_sessions(&mut sessions);
        Ok(sessions.remove(session_id).is_some())
    }

    #[cfg(test)]
    pub(crate) fn expire_session_for_tests(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions()?;
        if let Some(session) = sessions.get_mut(session_id) {
            session.expires_at_ms = runtime_autofill_now_ms().saturating_sub(1);
        }
        Ok(())
    }

    #[cfg(test)]
    pub(crate) fn session_count_for_tests(&self) -> Result<usize, String> {
        let mut sessions = self.sessions()?;
        runtime_autofill_prune_sessions(&mut sessions);
        Ok(sessions.len())
    }

    #[cfg(test)]
    pub(crate) fn poison_sessions_for_tests(&self) {
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _guard = self.sessions.lock().expect("autofill runtime test lock");
            panic!("poison autofill runtime sessions");
        }));
    }
}

impl Default for AndroidAutofillRuntimeState {
    fn default() -> Self {
        Self::new()
    }
}

pub struct AndroidAutofillAdapter<'a> {
    adapter: &'a mut dyn CoreAdapter,
    allowlisted_ids: HashSet<String>,
}

impl<'a> AndroidAutofillAdapter<'a> {
    pub fn new(adapter: &'a mut dyn CoreAdapter) -> Self {
        Self {
            adapter,
            allowlisted_ids: HashSet::new(),
        }
    }

    pub fn list(&mut self, context: &AutofillContext, include_debug: bool) -> AutofillListResult {
        self.allowlisted_ids.clear();

        let status = self
            .dispatch("credential_provider:status", json!({}))
            .and_then(|value| self.policy_gate(&value));
        if let Err(degraded) = status {
            return AutofillListResult {
                candidates: Vec::new(),
                degraded: Some(degraded),
                debug: None,
            };
        }

        let context_payload = json!({
            "context": {
                "kind": "web",
                "origin": context.origin,
                "domain": context.domain,
            },
            "include_debug": include_debug,
        });

        let list = self.dispatch("credential_provider:list", context_payload);
        let result = match list {
            Ok(value) => value,
            Err(degraded) => {
                return AutofillListResult {
                    candidates: Vec::new(),
                    degraded: Some(degraded),
                    debug: None,
                }
            }
        };
        let debug = result.get("debug").cloned();

        let candidates = result
            .get("candidates")
            .and_then(|v| v.as_array())
            .map(|items| {
                items
                    .iter()
                    .filter_map(parse_autofill_candidate)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        if let Some(debug) = debug.as_ref() {
            let diagnostics_json = debug.to_string();
            tracing::info!(
                target: "chromvoid_lib::mobile::android::autofill",
                origin = %context.origin,
                domain = %context.domain,
                diagnostics = %diagnostics_json,
                "android autofill list diagnostics"
            );
        }

        for candidate in &candidates {
            self.allowlisted_ids.insert(candidate.credential_id.clone());
        }

        AutofillListResult {
            candidates,
            degraded: None,
            debug,
        }
    }

    pub fn get_secret(
        &mut self,
        context: &AutofillContext,
        credential_id: &str,
        otp_id: Option<&str>,
    ) -> Result<AutofillSecret, AutofillDegradedState> {
        if !self.allowlisted_ids.contains(credential_id) {
            return Err(Self::degraded(
                "ACCESS_DENIED",
                "Autofill unavailable: credential is not allowlisted for this request",
            ));
        }

        let status = self
            .dispatch("credential_provider:status", json!({}))
            .and_then(|value| self.policy_gate(&value));
        if let Err(degraded) = status {
            return Err(degraded);
        }

        let session_value = self.dispatch("credential_provider:session:open", json!({}))?;
        let provider_session = session_value
            .get("provider_session")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                Self::degraded(
                    "PROVIDER_UNAVAILABLE",
                    "Autofill unavailable: provider session could not be established",
                )
            })?
            .to_string();

        let secret_payload = json!({
            "provider_session": provider_session,
            "credential_id": credential_id,
            "otp_id": otp_id,
            "context": {
                "kind": "web",
                "origin": context.origin,
                "domain": context.domain,
            }
        });

        let secret_result = self.dispatch("credential_provider:getSecret", secret_payload);

        let _ = self.dispatch(
            "credential_provider:session:close",
            json!({ "provider_session": provider_session }),
        );

        let secret = secret_result?;

        Ok(AutofillSecret {
            credential_id: secret
                .get("credential_id")
                .and_then(|v| v.as_str())
                .unwrap_or(credential_id)
                .to_string(),
            username: secret
                .get("username")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string(),
            password: secret
                .get("password")
                .and_then(|v| v.as_str())
                .map(ToString::to_string),
            otp: secret
                .get("otp")
                .and_then(|v| v.as_str())
                .map(ToString::to_string),
        })
    }

    pub fn restore_allowlist(&mut self, allowlisted_ids: impl IntoIterator<Item = String>) {
        self.allowlisted_ids = allowlisted_ids.into_iter().collect();
    }

    fn dispatch(&mut self, command: &str, data: Value) -> Result<Value, AutofillDegradedState> {
        let response = self
            .adapter
            .handle(&RpcRequest::new(command.to_string(), data));

        match response {
            RpcResponse::Success { result, .. } => Ok(result),
            RpcResponse::Error { error, code, .. } => {
                let code = code.unwrap_or_else(|| "PROVIDER_UNAVAILABLE".to_string());
                Err(Self::degraded(
                    &code,
                    &Self::degraded_message_for_code(&code, &error),
                ))
            }
        }
    }

    fn policy_gate(&self, status: &Value) -> Result<(), AutofillDegradedState> {
        let enabled = credential_provider_status_bool(status, "enabled", "android_autofill");
        let vault_open = credential_provider_status_bool(status, "vault_open", "android_autofill");

        if !enabled {
            return Err(Self::degraded(
                "PROVIDER_DISABLED",
                "Autofill unavailable: provider is disabled in settings",
            ));
        }
        if !vault_open {
            return Err(Self::degraded(
                "VAULT_REQUIRED",
                "Autofill unavailable: unlock vault to use credentials",
            ));
        }

        Ok(())
    }

    fn degraded(code: &str, message: &str) -> AutofillDegradedState {
        AutofillDegradedState {
            code: code.to_string(),
            message: message.to_string(),
        }
    }

    fn degraded_message_for_code(code: &str, fallback: &str) -> String {
        match code {
            "VAULT_REQUIRED" => "Autofill unavailable: unlock vault to use credentials".to_string(),
            "PROVIDER_DISABLED" => {
                "Autofill unavailable: provider is disabled in settings".to_string()
            }
            "ACCESS_DENIED" => {
                "Autofill unavailable: request denied by allowlist policy".to_string()
            }
            "PROVIDER_SESSION_EXPIRED" => {
                "Autofill unavailable: provider session expired, retry request".to_string()
            }
            "PROVIDER_UNAVAILABLE" => {
                "Autofill unavailable: provider bridge is not active".to_string()
            }
            _ => format!("Autofill unavailable: {fallback}"),
        }
    }
}

fn parse_autofill_candidate(item: &Value) -> Option<AutofillCandidate> {
    let credential_id = item.get("credential_id")?.as_str()?;
    if credential_id.trim().is_empty() {
        return None;
    }

    let label = item
        .get("label")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let username = item
        .get("username")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let domain = item
        .get("domain")
        .and_then(|v| v.as_str())
        .map(ToString::to_string);
    let app_id = item
        .get("app_id")
        .and_then(|v| v.as_str())
        .map(ToString::to_string);
    let match_kind = item
        .get("match")
        .and_then(|v| v.as_str())
        .unwrap_or("exact")
        .to_string();
    let otp_options = item
        .get("otp_options")
        .and_then(|v| v.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(parse_autofill_otp_option)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Some(AutofillCandidate {
        credential_id: credential_id.to_string(),
        label,
        username,
        domain,
        app_id,
        match_kind,
        otp_options,
    })
}

fn parse_autofill_otp_option(otp: &Value) -> Option<AutofillOtpOption> {
    let id = otp.get("id")?.as_str()?.trim().to_string();
    if id.is_empty() {
        return None;
    }
    let label = otp
        .get("label")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string);
    let otp_type = otp
        .get("type")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string);
    Some(AutofillOtpOption {
        id,
        label,
        otp_type,
    })
}

fn runtime_autofill_now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn runtime_autofill_prune_sessions(sessions: &mut HashMap<String, AndroidAutofillRuntimeSession>) {
    let now = runtime_autofill_now_ms();
    sessions.retain(|_, session| session.expires_at_ms > now);
}

fn app_android_autofill_runtime() -> Option<Arc<AndroidAutofillRuntimeState>> {
    crate::mobile::android::runtime::app_android_autofill_runtime()
}

pub(crate) fn runtime_autofill_list_with_runtime(
    runtime: &AndroidAutofillRuntimeState,
    context: &AutofillContext,
    include_debug: bool,
) -> Value {
    let listed = match with_shared_provider_adapter(|adapter| {
        let mut autofill = AndroidAutofillAdapter::new(adapter);
        autofill.list(context, include_debug)
    }) {
        Ok(listed) => listed,
        Err(message) => return provider_runtime_unavailable(&message),
    };

    let AutofillListResult {
        candidates,
        degraded,
        debug,
    } = listed;

    if let Some(degraded) = degraded {
        return json!({
            "ok": false,
            "degraded": degraded,
        });
    }

    let mut response = json!({
        "ok": true,
        "candidates": candidates,
    });
    match runtime.create_session(context, &candidates) {
        Ok(Some(session_id)) => {
            response["session_id"] = json!(session_id);
        }
        Ok(None) => {}
        Err(message) => return provider_runtime_unavailable(&message),
    }
    if let Some(debug) = debug {
        response["debug"] = debug;
    }
    response
}

pub fn runtime_autofill_list(context: &AutofillContext) -> Value {
    let Some(runtime) = app_android_autofill_runtime() else {
        return provider_runtime_unavailable(AUTOFILL_RUNTIME_SESSION_STORE_UNAVAILABLE);
    };
    runtime_autofill_list_with_runtime(&runtime, context, false)
}

pub fn runtime_autofill_list_with_diagnostics(context: &AutofillContext) -> Value {
    let Some(runtime) = app_android_autofill_runtime() else {
        return provider_runtime_unavailable(AUTOFILL_RUNTIME_SESSION_STORE_UNAVAILABLE);
    };
    runtime_autofill_list_with_runtime(&runtime, context, true)
}

pub(crate) fn runtime_autofill_get_secret_with_runtime(
    runtime: &AndroidAutofillRuntimeState,
    session_id: &str,
    credential_id: &str,
    otp_id: Option<&str>,
) -> Value {
    let session = match runtime.take_session(session_id) {
        Ok(session) => session,
        Err(message) => return provider_runtime_unavailable(&message),
    };

    let Some(session) = session else {
        return json!({
            "ok": false,
            "degraded": {
                "code": "ACCESS_DENIED",
                "message": "Autofill unavailable: request session is no longer valid",
            }
        });
    };

    let secret = match with_shared_provider_adapter(|adapter| {
        let mut autofill = AndroidAutofillAdapter::new(adapter);
        autofill.restore_allowlist(session.allowlisted_ids);
        autofill.get_secret(&session.context, credential_id, otp_id)
    }) {
        Ok(secret) => secret,
        Err(message) => return provider_runtime_unavailable(&message),
    };

    match secret {
        Ok(secret) => json!({
            "ok": true,
            "result": secret,
        }),
        Err(degraded) => json!({
            "ok": false,
            "degraded": degraded,
        }),
    }
}

pub fn runtime_autofill_get_secret(
    session_id: &str,
    credential_id: &str,
    otp_id: Option<&str>,
) -> Value {
    let Some(runtime) = app_android_autofill_runtime() else {
        return provider_runtime_unavailable(AUTOFILL_RUNTIME_SESSION_STORE_UNAVAILABLE);
    };
    runtime_autofill_get_secret_with_runtime(&runtime, session_id, credential_id, otp_id)
}

pub(crate) fn runtime_autofill_close_session_with_runtime(
    runtime: &AndroidAutofillRuntimeState,
    session_id: &str,
) -> Value {
    if session_id.trim().is_empty() {
        return json!({
            "ok": true,
            "closed": false,
        });
    }

    let closed = match runtime.close_session(session_id) {
        Ok(closed) => closed,
        Err(message) => return provider_runtime_unavailable(&message),
    };

    json!({
        "ok": true,
        "closed": closed,
    })
}

pub fn runtime_autofill_close_session(session_id: &str) -> Value {
    let Some(runtime) = app_android_autofill_runtime() else {
        return provider_runtime_unavailable(AUTOFILL_RUNTIME_SESSION_STORE_UNAVAILABLE);
    };
    runtime_autofill_close_session_with_runtime(&runtime, session_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_autofill_candidate_rejects_blank_credential_id() {
        assert!(parse_autofill_candidate(&json!({ "credential_id": "" })).is_none());
        assert!(parse_autofill_candidate(&json!({ "credential_id": "   " })).is_none());
        assert!(parse_autofill_candidate(&json!({ "label": "Example" })).is_none());
    }

    #[test]
    fn parse_autofill_candidate_preserves_valid_payload_and_filters_blank_otp() {
        let candidate = parse_autofill_candidate(&json!({
            "credential_id": " cred-example ",
            "label": "Example",
            "username": "alice@example.com",
            "domain": "example.com",
            "app_id": "com.example.app",
            "match": "associated",
            "otp_options": [
                { "id": " otp-1 ", "label": " TOTP ", "type": " totp " },
                { "id": "   ", "label": "invalid" }
            ]
        }))
        .expect("candidate");

        assert_eq!(candidate.credential_id, " cred-example ");
        assert_eq!(candidate.label, "Example");
        assert_eq!(candidate.username, "alice@example.com");
        assert_eq!(candidate.domain.as_deref(), Some("example.com"));
        assert_eq!(candidate.app_id.as_deref(), Some("com.example.app"));
        assert_eq!(candidate.match_kind, "associated");
        assert_eq!(
            candidate.otp_options,
            vec![AutofillOtpOption {
                id: "otp-1".to_string(),
                label: Some("TOTP".to_string()),
                otp_type: Some("totp".to_string()),
            }]
        );
    }
}
