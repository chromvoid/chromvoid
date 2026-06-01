#![cfg_attr(not(target_os = "android"), allow(dead_code))]

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use uuid::Uuid;

const PASSWORD_SAVE_REQUEST_TTL: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AndroidPasswordSavePayload {
    pub title: String,
    pub username: String,
    pub password: String,
    pub urls: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AndroidPasswordSaveOutcome {
    Saved,
    Dismissed,
}

impl AndroidPasswordSaveOutcome {
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim() {
            "saved" => Some(Self::Saved),
            "dismissed" => Some(Self::Dismissed),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
struct PendingPasswordSaveRequest {
    payload: AndroidPasswordSavePayload,
    created_at: Instant,
    state: PasswordSaveRequestState,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PasswordSaveRequestState {
    Pending,
    Launched,
    Saved,
    Dismissed,
    Expired,
}

impl PasswordSaveRequestState {
    fn is_terminal(self) -> bool {
        matches!(self, Self::Saved | Self::Dismissed | Self::Expired)
    }
}

pub(crate) struct AndroidPasswordSaveRuntimeState {
    requests: Mutex<HashMap<String, PendingPasswordSaveRequest>>,
}

impl AndroidPasswordSaveRuntimeState {
    pub(crate) fn new() -> Self {
        Self {
            requests: Mutex::new(HashMap::new()),
        }
    }
}

impl Default for AndroidPasswordSaveRuntimeState {
    fn default() -> Self {
        Self::new()
    }
}

fn prune_expired(requests: &mut HashMap<String, PendingPasswordSaveRequest>) {
    let now = Instant::now();
    for request in requests.values_mut() {
        if !request.state.is_terminal()
            && now.duration_since(request.created_at) >= PASSWORD_SAVE_REQUEST_TTL
        {
            request.state = PasswordSaveRequestState::Expired;
        }
    }
}

pub fn register_password_save_request(
    runtime: &AndroidPasswordSaveRuntimeState,
    payload: AndroidPasswordSavePayload,
) -> Result<String, String> {
    if payload.password.trim().is_empty() {
        return Err("Password save payload requires a non-empty password".to_string());
    }

    let token = Uuid::new_v4().to_string();
    let mut requests = runtime
        .requests
        .lock()
        .map_err(|_| "Password save request store is unavailable".to_string())?;
    prune_expired(&mut requests);
    requests.insert(
        token.clone(),
        PendingPasswordSaveRequest {
            payload,
            created_at: Instant::now(),
            state: PasswordSaveRequestState::Pending,
        },
    );
    Ok(token)
}

pub fn get_password_save_request(
    runtime: &AndroidPasswordSaveRuntimeState,
    token: &str,
) -> Result<Option<(AndroidPasswordSavePayload, PasswordSaveRequestState)>, String> {
    let mut requests = runtime
        .requests
        .lock()
        .map_err(|_| "Password save request store is unavailable".to_string())?;
    prune_expired(&mut requests);
    Ok(requests
        .get(token)
        .map(|request| (request.payload.clone(), request.state)))
}

pub fn mark_password_save_request_launched(
    runtime: &AndroidPasswordSaveRuntimeState,
    token: &str,
) -> Result<bool, String> {
    let mut requests = runtime
        .requests
        .lock()
        .map_err(|_| "Password save request store is unavailable".to_string())?;
    prune_expired(&mut requests);

    let Some(request) = requests.get_mut(token) else {
        return Ok(false);
    };
    if request.state != PasswordSaveRequestState::Pending {
        return Ok(false);
    }

    request.state = PasswordSaveRequestState::Launched;
    Ok(true)
}

pub fn finish_password_save_request(
    runtime: &AndroidPasswordSaveRuntimeState,
    token: &str,
    outcome: AndroidPasswordSaveOutcome,
) -> Result<bool, String> {
    let mut requests = runtime
        .requests
        .lock()
        .map_err(|_| "Password save request store is unavailable".to_string())?;
    prune_expired(&mut requests);
    let Some(request) = requests.get_mut(token) else {
        return Ok(false);
    };
    if request.state.is_terminal() {
        return Ok(false);
    }

    request.state = match outcome {
        AndroidPasswordSaveOutcome::Saved => PasswordSaveRequestState::Saved,
        AndroidPasswordSaveOutcome::Dismissed => PasswordSaveRequestState::Dismissed,
    };
    tracing::info!(
        "android password save request finished: token_present={} outcome={:?}",
        true,
        outcome
    );
    Ok(true)
}

pub fn invalidate_all_password_save_requests(
    runtime: &AndroidPasswordSaveRuntimeState,
    reason: &str,
) -> usize {
    let mut requests = match runtime.requests.lock() {
        Ok(requests) => requests,
        Err(_) => {
            tracing::warn!(
                "android password save request invalidation skipped: request store mutex poisoned"
            );
            return 0;
        }
    };
    prune_expired(&mut requests);
    let mut invalidated = 0usize;
    for request in requests.values_mut() {
        if !request.state.is_terminal() {
            request.state = PasswordSaveRequestState::Dismissed;
            invalidated = invalidated.saturating_add(1);
        }
    }
    if !requests.is_empty() {
        tracing::info!(
            "android password save requests invalidated: count={} reason={}",
            invalidated,
            reason
        );
    }
    invalidated
}

pub fn runtime_password_save_start(payload: Value) -> Value {
    let payload = match serde_json::from_value::<AndroidPasswordSavePayload>(payload) {
        Ok(payload) => payload,
        Err(error) => {
            return json!({
                "ok": false,
                "message": format!("Invalid password save payload: {error}"),
            });
        }
    };

    let Some(runtime) = crate::mobile::android::runtime::app_android_password_save_runtime() else {
        return json!({
            "ok": false,
            "message": "Password save request store is unavailable",
        });
    };

    runtime_password_save_start_with_runtime(&runtime, payload)
}

pub(crate) fn runtime_password_save_start_with_runtime(
    runtime: &AndroidPasswordSaveRuntimeState,
    payload: AndroidPasswordSavePayload,
) -> Value {
    match register_password_save_request(runtime, payload.clone()) {
        Ok(token) => json!({
            "ok": true,
            "token": token,
            "payload": payload,
        }),
        Err(message) => json!({
            "ok": false,
            "message": message,
        }),
    }
}

pub fn runtime_password_save_request(token: &str) -> Value {
    let Some(runtime) = crate::mobile::android::runtime::app_android_password_save_runtime() else {
        return json!({
            "ok": false,
            "message": "Password save request store is unavailable",
        });
    };

    runtime_password_save_request_with_runtime(&runtime, token)
}

pub(crate) fn runtime_password_save_request_with_runtime(
    runtime: &AndroidPasswordSaveRuntimeState,
    token: &str,
) -> Value {
    match get_password_save_request(runtime, token) {
        Ok(Some((payload, state))) => {
            if state.is_terminal() {
                json!({
                    "ok": false,
                    "state": state,
                    "message": "Password save request is no longer active",
                })
            } else {
                json!({
                    "ok": true,
                    "result": payload,
                    "state": state,
                })
            }
        }
        Ok(None) => json!({
            "ok": false,
            "message": "Password save request is no longer valid",
        }),
        Err(message) => json!({
            "ok": false,
            "message": message,
        }),
    }
}

pub fn runtime_password_save_mark_launched(token: &str) -> Value {
    let Some(runtime) = crate::mobile::android::runtime::app_android_password_save_runtime() else {
        return json!({
            "ok": false,
            "message": "Password save request store is unavailable",
        });
    };

    runtime_password_save_mark_launched_with_runtime(&runtime, token)
}

pub(crate) fn runtime_password_save_mark_launched_with_runtime(
    runtime: &AndroidPasswordSaveRuntimeState,
    token: &str,
) -> Value {
    match mark_password_save_request_launched(runtime, token) {
        Ok(marked) => json!({
            "ok": true,
            "marked": marked,
        }),
        Err(message) => json!({
            "ok": false,
            "message": message,
        }),
    }
}
