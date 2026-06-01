use std::ffi::CStr;
use std::os::raw::c_char;

use serde::Deserialize;
use tracing::{info, warn};

use crate::mobile::ios::runtime;
use crate::task_lifecycle::EventTaskName;

#[derive(Debug, Deserialize)]
struct NativePushEnvelope {
    chromvoid: Option<NativePushPayload>,
}

#[derive(Debug, Deserialize)]
struct NativePushPayload {
    wake: Option<bool>,
    relay_url: Option<String>,
}

fn c_string(ptr: *const c_char) -> Result<String, String> {
    if ptr.is_null() {
        return Err("received null string pointer".to_string());
    }

    // SAFETY: ptr was null-checked above on line 23; caller (Swift bridge) guarantees a NUL-terminated UTF-8
    // buffer for the duration of this call.
    unsafe { CStr::from_ptr(ptr) }
        .to_str()
        .map(|value| value.to_string())
        .map_err(|e| format!("invalid utf-8: {e}"))
}

#[no_mangle]
pub extern "C" fn chromvoid_ios_push_set_registration(
    device_token: *const c_char,
    environment: *const c_char,
    bundle_id: *const c_char,
) -> i32 {
    let storage_root = match runtime::storage_root() {
        Some(root) => root,
        None => {
            warn!("ios_push_bridge: storage root not initialized");
            return 0;
        }
    };

    let device_token = match c_string(device_token) {
        Ok(value) => value,
        Err(error) => {
            warn!("ios_push_bridge: invalid device token: {error}");
            return 0;
        }
    };
    let environment = match c_string(environment) {
        Ok(value) => value,
        Err(error) => {
            warn!("ios_push_bridge: invalid environment: {error}");
            return 0;
        }
    };
    let bundle_id = match c_string(bundle_id) {
        Ok(value) => value,
        Err(error) => {
            warn!("ios_push_bridge: invalid bundle id: {error}");
            return 0;
        }
    };

    if let Err(error) = crate::network::ios_push::save_local_push_registration(
        &storage_root,
        &device_token,
        &environment,
        &bundle_id,
    ) {
        warn!("ios_push_bridge: save registration failed: {error}");
        return 0;
    }

    let task_lifecycle = runtime::with_app_state(|state| state.task_lifecycle.clone());
    match task_lifecycle {
        Some(task_lifecycle) => {
            if let Err(error) = task_lifecycle.spawn_event_async(
                EventTaskName::IosPushRegistrationSync,
                move |mut shutdown_rx| async move {
                    tokio::select! {
                        changed = shutdown_rx.changed() => {
                            if changed.is_ok() && shutdown_rx.borrow().is_some() {
                                info!("ios_push_bridge: relay sync stopped by lifecycle shutdown");
                            }
                        }
                        result = crate::network::ios_push::sync_push_registration_for_host_mode(
                            &storage_root,
                        ) => {
                            if let Err(error) = result {
                                warn!("ios_push_bridge: relay sync failed: {error}");
                            }
                        }
                    }
                },
            ) {
                warn!("ios_push_bridge: relay sync was not scheduled: {error}");
            }
        }
        None => {
            warn!("ios_push_bridge: task lifecycle unavailable; relay sync skipped");
        }
    }

    info!("ios_push_bridge: device token captured and sync scheduled");
    1
}

#[no_mangle]
pub extern "C" fn chromvoid_ios_push_handle_notification(payload_json: *const c_char) -> i32 {
    let storage_root = match runtime::storage_root() {
        Some(root) => root,
        None => {
            warn!("ios_push_bridge: storage root not initialized for notification");
            return 0;
        }
    };

    let payload_json = match c_string(payload_json) {
        Ok(value) => value,
        Err(error) => {
            warn!("ios_push_bridge: invalid notification payload: {error}");
            return 0;
        }
    };

    let payload = match serde_json::from_str::<NativePushEnvelope>(&payload_json) {
        Ok(value) => value,
        Err(error) => {
            warn!("ios_push_bridge: decode notification payload failed: {error}");
            return 0;
        }
    };

    let Some(chromvoid) = payload.chromvoid else {
        return 0;
    };
    if chromvoid.wake != Some(true) {
        return 0;
    }
    let Some(relay_url) = chromvoid.relay_url.filter(|value| !value.trim().is_empty()) else {
        warn!("ios_push_bridge: wake payload missing relay_url");
        return 0;
    };
    if runtime::app_handle().is_none() {
        warn!("ios_push_bridge: app handle not initialized for notification");
        return 0;
    }

    let Some((task_lifecycle, ios_host_runtime, mobile_acceptor_runtime, adapter)) =
        runtime::with_app_state(|state| {
            (
                state.task_lifecycle.clone(),
                state.ios_host_runtime.clone(),
                state.mobile_acceptor_runtime.clone(),
                state.adapter.clone(),
            )
        })
    else {
        warn!("ios_push_bridge: AppState unavailable for notification");
        return 1;
    };

    if let Err(error) = task_lifecycle.spawn_event_async(
        EventTaskName::IosPushWakeHandling,
        move |mut shutdown_rx| async move {
            tokio::select! {
                changed = shutdown_rx.changed() => {
                    if changed.is_ok() && shutdown_rx.borrow().is_some() {
                        info!("ios_push_bridge: wake handling stopped by lifecycle shutdown");
                    }
                }
                result = async move {
                    if !crate::network::ios_pairing::is_host_mode_enabled(&storage_root) {
                        info!("ios_push_bridge: wake ignored because host mode is disabled");
                        return Ok(());
                    }

                    crate::network::ios_pairing::handle_wake(
                        ios_host_runtime,
                        mobile_acceptor_runtime,
                        Some(adapter),
                        &relay_url,
                        &storage_root,
                    )
                    .await
                    .map(|_| ())
                } => {
                    if let Err(error) = result {
                        warn!("ios_push_bridge: wake handling failed: {error}");
                    }
                }
            }
        },
    ) {
        warn!("ios_push_bridge: wake handling was not scheduled: {error}");
    }

    1
}
