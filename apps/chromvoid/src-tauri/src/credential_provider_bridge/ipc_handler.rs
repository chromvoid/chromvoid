use chromvoid_core::rpc::types::RpcResponse;
use serde_json::{json, Value};
use tracing::{error, info, warn};

use super::ffi;
use super::notifications::{
    create_cf_string, post_darwin_notification, REQUEST_NOTIFICATION, RESPONSE_NOTIFICATION,
};
use super::user_defaults::{
    clear_app_group_key, read_app_group_json, write_app_group_json, REQUEST_KEY, RESPONSE_KEY,
};

/// Spawn background thread that listens for Darwin notifications from the Extension.
pub fn spawn_credential_provider_listener(_app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        info!("credential_provider_bridge: starting Darwin notification listener");

        unsafe {
            let center = ffi::CFNotificationCenterGetDarwinNotifyCenter();
            if center.is_null() {
                error!("credential_provider_bridge: failed to get Darwin notify center");
                return;
            }

            let cf_name = create_cf_string(REQUEST_NOTIFICATION);

            ffi::CFNotificationCenterAddObserver(
                center,
                std::ptr::null(), // observer (unused)
                Some(on_credential_request),
                cf_name,
                std::ptr::null(),
                ffi::K_CF_NOTIFICATION_DELIVER_IMMEDIATELY,
            );

            // Don't release cf_name — needs to live as long as observer

            info!("credential_provider_bridge: listener registered, entering run loop");

            // Run the CFRunLoop to receive notifications
            ffi::CFRunLoopRun();
        }
    });
}

unsafe extern "C" fn on_credential_request(
    _center: ffi::CFNotificationCenterRef,
    _observer: *mut std::ffi::c_void,
    _name: ffi::CFStringRef,
    _object: *const std::ffi::c_void,
    _user_info: ffi::CFDictionaryRef,
) {
    handle_extension_request();
}

fn handle_extension_request() {
    // Read request from UserDefaults
    let request = match read_app_group_json(REQUEST_KEY) {
        Some(req) => req,
        None => {
            warn!("credential_provider_bridge: no request found in UserDefaults");
            return;
        }
    };

    let request_id = request
        .get("request_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let command = match request.get("command").and_then(|v| v.as_str()) {
        Some(cmd) => cmd.to_string(),
        None => {
            // Not an RPC request (e.g., legacy event). Ignore.
            info!("credential_provider_bridge: ignoring non-RPC request (event/legacy)");
            return;
        }
    };

    let data = request.get("data").cloned().unwrap_or(Value::Null);

    info!(
        "credential_provider_bridge: processing command={} request_id={}",
        command, request_id
    );

    // Clear consumed request
    clear_app_group_key(REQUEST_KEY);

    // Dispatch to the shared local Core adapter.
    let response = super::dispatch_provider_rpc(&command, data);

    // Build response envelope
    let response_payload = match response {
        RpcResponse::Success { ok: _, result } => json!({
            "request_id": request_id,
            "success": true,
            "result": result,
        }),
        RpcResponse::Error { ok: _, error, code } => json!({
            "request_id": request_id,
            "success": false,
            "error": error,
            "error_code": code,
        }),
    };

    // Write response and notify Extension
    write_app_group_json(RESPONSE_KEY, &response_payload);
    post_darwin_notification(RESPONSE_NOTIFICATION);

    info!(
        "credential_provider_bridge: response sent for command={} request_id={}",
        command, request_id
    );
}
