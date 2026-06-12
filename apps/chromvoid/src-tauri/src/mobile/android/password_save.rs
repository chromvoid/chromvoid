#![cfg_attr(not(target_os = "android"), allow(dead_code))]

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use uuid::Uuid;
use zeroize::Zeroize;

const PASSWORD_SAVE_REQUEST_TTL: Duration = Duration::from_secs(300);

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AndroidPasswordSavePayload {
    pub title: String,
    pub username: String,
    pub password: String,
    pub urls: String,
}

impl std::fmt::Debug for AndroidPasswordSavePayload {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AndroidPasswordSavePayload")
            .field("title", &self.title)
            .field("username", &self.username)
            .field("password", &"<redacted>")
            .field("urls", &self.urls)
            .finish()
    }
}

impl Drop for AndroidPasswordSavePayload {
    fn drop(&mut self) {
        self.title.zeroize();
        self.username.zeroize();
        self.password.zeroize();
        self.urls.zeroize();
    }
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

fn prune_expired(requests: &mut HashMap<String, PendingPasswordSaveRequest>) -> usize {
    let now = Instant::now();
    let before = requests.len();
    requests.retain(|_, request| {
        let age = now
            .checked_duration_since(request.created_at)
            .unwrap_or_default();
        !request.state.is_terminal() && age < PASSWORD_SAVE_REQUEST_TTL
    });
    before.saturating_sub(requests.len())
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
    let _ = prune_expired(&mut requests);
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
    let _ = prune_expired(&mut requests);
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
    let _ = prune_expired(&mut requests);

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
    let _ = prune_expired(&mut requests);
    let Some(mut request) = requests.remove(token) else {
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
    let expired = prune_expired(&mut requests);
    let invalidated = requests
        .values()
        .filter(|request| !request.state.is_terminal())
        .count();
    requests.clear();
    if invalidated > 0 || expired > 0 {
        tracing::info!(
            "android password save requests invalidated: count={} expired={} reason={}",
            invalidated,
            expired,
            reason
        );
    }
    invalidated
}

#[cfg(test)]
pub(crate) fn pending_password_save_request_count(
    runtime: &AndroidPasswordSaveRuntimeState,
) -> Result<usize, String> {
    let mut requests = runtime
        .requests
        .lock()
        .map_err(|_| "Password save request store is unavailable".to_string())?;
    let _ = prune_expired(&mut requests);
    Ok(requests.len())
}

#[cfg(test)]
pub(crate) fn force_password_save_request_age(
    runtime: &AndroidPasswordSaveRuntimeState,
    token: &str,
    age: Duration,
) -> Result<bool, String> {
    let mut requests = runtime
        .requests
        .lock()
        .map_err(|_| "Password save request store is unavailable".to_string())?;
    let Some(request) = requests.get_mut(token) else {
        return Ok(false);
    };
    request.created_at = Instant::now().checked_sub(age).unwrap_or_else(Instant::now);
    Ok(true)
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
