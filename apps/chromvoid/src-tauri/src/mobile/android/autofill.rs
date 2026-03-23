#![cfg_attr(not(target_os = "android"), allow(dead_code))]

use crate::CoreAdapter;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::collections::HashSet;
use std::sync::LazyLock;
use std::sync::Mutex;
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
}

#[derive(Debug, Clone)]
struct AndroidAutofillRuntimeSession {
    context: AutofillContext,
    allowlisted_ids: HashSet<String>,
}

static ANDROID_AUTOFILL_RUNTIME_SESSIONS: LazyLock<
    Mutex<HashMap<String, AndroidAutofillRuntimeSession>>,
> = LazyLock::new(|| Mutex::new(HashMap::new()));

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

    pub fn list(&mut self, context: &AutofillContext) -> AutofillListResult {
        self.allowlisted_ids.clear();

        let status = self
            .dispatch("credential_provider:status", json!({}))
            .and_then(|value| self.policy_gate(&value));
        if let Err(degraded) = status {
            return AutofillListResult {
                candidates: Vec::new(),
                degraded: Some(degraded),
            };
        }

        let context_payload = json!({
            "context": {
                "kind": "web",
                "origin": context.origin,
                "domain": context.domain,
            }
        });

        let list = self.dispatch("credential_provider:list", context_payload);
        let result = match list {
            Ok(value) => value,
            Err(degraded) => {
                return AutofillListResult {
                    candidates: Vec::new(),
                    degraded: Some(degraded),
                }
            }
        };

        let candidates = result
            .get("candidates")
            .and_then(|v| v.as_array())
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| {
                        let credential_id = item.get("credential_id")?.as_str()?.to_string();
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
                                    .filter_map(|otp| {
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
                                    })
                                    .collect::<Vec<_>>()
                            })
                            .unwrap_or_default();

                        Some(AutofillCandidate {
                            credential_id,
                            label,
                            username,
                            domain,
                            app_id,
                            match_kind,
                            otp_options,
                        })
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        for candidate in &candidates {
            self.allowlisted_ids.insert(candidate.credential_id.clone());
        }

        AutofillListResult {
            candidates,
            degraded: None,
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
        let enabled = status
            .get("enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let vault_open = status
            .get("vault_open")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

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

pub fn runtime_autofill_list(context: &AutofillContext) -> Value {
    let listed = match with_shared_provider_adapter(|adapter| {
        let mut autofill = AndroidAutofillAdapter::new(adapter);
        autofill.list(context)
    }) {
        Ok(listed) => listed,
        Err(message) => return provider_runtime_unavailable(&message),
    };

    if let Some(degraded) = listed.degraded {
        return json!({
            "ok": false,
            "degraded": degraded,
        });
    }

    let session_id = Uuid::new_v4().to_string();
    let allowlisted_ids = listed
        .candidates
        .iter()
        .map(|candidate| candidate.credential_id.clone())
        .collect::<HashSet<_>>();

    if let Ok(mut sessions) = ANDROID_AUTOFILL_RUNTIME_SESSIONS.lock() {
        sessions.insert(
            session_id.clone(),
            AndroidAutofillRuntimeSession {
                context: context.clone(),
                allowlisted_ids,
            },
        );
    }

    json!({
        "ok": true,
        "session_id": session_id,
        "candidates": listed.candidates,
    })
}

pub fn runtime_autofill_get_secret(
    session_id: &str,
    credential_id: &str,
    otp_id: Option<&str>,
) -> Value {
    let session = match ANDROID_AUTOFILL_RUNTIME_SESSIONS.lock() {
        Ok(mut sessions) => sessions.remove(session_id),
        Err(_) => None,
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
