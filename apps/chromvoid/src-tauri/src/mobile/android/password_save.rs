#![cfg_attr(not(target_os = "android"), allow(dead_code))]

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
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

static PENDING_PASSWORD_SAVE_REQUESTS: LazyLock<
    Mutex<HashMap<String, PendingPasswordSaveRequest>>,
> = LazyLock::new(|| Mutex::new(HashMap::new()));

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
    payload: AndroidPasswordSavePayload,
) -> Result<String, String> {
    if payload.password.trim().is_empty() {
        return Err("Password save payload requires a non-empty password".to_string());
    }

    let token = Uuid::new_v4().to_string();
    let mut requests = PENDING_PASSWORD_SAVE_REQUESTS
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
    token: &str,
) -> Result<Option<(AndroidPasswordSavePayload, PasswordSaveRequestState)>, String> {
    let mut requests = PENDING_PASSWORD_SAVE_REQUESTS
        .lock()
        .map_err(|_| "Password save request store is unavailable".to_string())?;
    prune_expired(&mut requests);
    Ok(requests
        .get(token)
        .map(|request| (request.payload.clone(), request.state)))
}

pub fn mark_password_save_request_launched(token: &str) -> Result<bool, String> {
    let mut requests = PENDING_PASSWORD_SAVE_REQUESTS
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
    token: &str,
    outcome: AndroidPasswordSaveOutcome,
) -> Result<bool, String> {
    let mut requests = PENDING_PASSWORD_SAVE_REQUESTS
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

pub fn invalidate_all_password_save_requests(reason: &str) -> usize {
    if let Ok(mut requests) = PENDING_PASSWORD_SAVE_REQUESTS.lock() {
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
        return invalidated;
    }
    0
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

    match register_password_save_request(payload.clone()) {
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
    match get_password_save_request(token) {
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
    match mark_password_save_request_launched(token) {
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
