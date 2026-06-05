use std::os::raw::c_void;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use chromvoid_core::rpc::types::RpcResponse;
use serde_json::{json, Value};
use tracing::{error, info, warn};

use crate::core_adapter::CoreAdapter;
use crate::task_lifecycle::{ExternalTaskReadiness, ExternalThreadTask};

use super::ffi;
use super::notifications::{
    create_cf_string, post_darwin_notification, REQUEST_NOTIFICATION, RESPONSE_NOTIFICATION,
};
use super::user_defaults::{
    clear_app_group_key, read_app_group_json, write_app_group_json, REQUEST_KEY, RESPONSE_KEY,
};

struct BridgeListenerContext {
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
}

struct RunLoopHandle(ffi::CFRunLoopRef);

// SAFETY: CFRunLoopStop is documented as thread-safe; the pointer is only used by the stop
// callback to request exit from the listener thread's run loop.
unsafe impl Send for RunLoopHandle {}

impl RunLoopHandle {
    fn stop(self) {
        unsafe {
            ffi::CFRunLoopStop(self.0);
        }
    }
}

/// Spawn background thread that listens for Darwin notifications from the Extension.
pub fn spawn_credential_provider_listener(
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    readiness: ExternalTaskReadiness,
) -> Result<ExternalThreadTask, String> {
    let run_loop_active = Arc::new(AtomicBool::new(false));
    let listener_run_loop_active = run_loop_active.clone();
    let listener_readiness = readiness.clone();
    let (run_loop_tx, run_loop_rx) = std::sync::mpsc::channel();
    let join_handle = std::thread::Builder::new()
        .name("credential-provider-bridge".to_string())
        .spawn(move || {
            info!("credential_provider_bridge: starting Darwin notification listener");

            // SAFETY: runs on a dedicated background thread; on_credential_request is a static extern "C" fn;
            // observer owns a boxed BridgeListenerContext for the run-loop lifetime.
            unsafe {
                let context = Box::into_raw(Box::new(BridgeListenerContext { adapter }));
                let center = ffi::CFNotificationCenterGetDarwinNotifyCenter();
                if center.is_null() {
                    listener_readiness.mark_not_ready();
                    let _ = Box::from_raw(context);
                    let _ = run_loop_tx.send(Err(
                        "credential_provider_bridge: failed to get Darwin notify center"
                            .to_string(),
                    ));
                    error!("credential_provider_bridge: failed to get Darwin notify center");
                    return;
                }

                let cf_name = create_cf_string(REQUEST_NOTIFICATION);
                if cf_name.is_null() {
                    listener_readiness.mark_not_ready();
                    let _ = Box::from_raw(context);
                    let _ = run_loop_tx.send(Err(
                        "credential_provider_bridge: failed to create request notification name"
                            .to_string(),
                    ));
                    error!(
                        "credential_provider_bridge: failed to create request notification name"
                    );
                    return;
                }
                let run_loop = ffi::CFRunLoopGetCurrent();

                ffi::CFNotificationCenterAddObserver(
                    center,
                    context as *const c_void,
                    Some(on_credential_request),
                    cf_name,
                    std::ptr::null(),
                    ffi::K_CF_NOTIFICATION_DELIVER_IMMEDIATELY,
                );

                info!("credential_provider_bridge: listener registered, entering run loop");
                listener_readiness.mark_ready();
                listener_run_loop_active.store(true, Ordering::Release);
                let _ = run_loop_tx.send(Ok(RunLoopHandle(run_loop)));

                ffi::CFRunLoopRun();

                listener_run_loop_active.store(false, Ordering::Release);
                listener_readiness.mark_not_ready();
                ffi::CFNotificationCenterRemoveObserver(
                    center,
                    context as *const c_void,
                    cf_name,
                    std::ptr::null(),
                );
                ffi::CFRelease(cf_name);
                let _ = Box::from_raw(context);
                info!("credential_provider_bridge: Darwin notification listener stopped");
            }
        })
        .map_err(|error| format!("Failed to spawn credential provider listener: {error}"))?;

    let run_loop = match run_loop_rx.recv() {
        Ok(Ok(run_loop)) => run_loop,
        Ok(Err(error)) => {
            let _ = join_handle.join();
            return Err(error);
        }
        Err(_) => {
            let _ = join_handle.join();
            return Err(
                "credential_provider_bridge: listener exited before run loop registration"
                    .to_string(),
            );
        }
    };

    Ok(ExternalThreadTask::with_readiness(
        move || {
            if run_loop_active.swap(false, Ordering::AcqRel) {
                run_loop.stop();
            }
        },
        join_handle,
        readiness,
    ))
}

// SAFETY: invoked by CoreFoundation on the spawned listener thread. The observer pointer is the
// BridgeListenerContext allocated for this listener and reclaimed after CFRunLoopRun returns.
unsafe extern "C" fn on_credential_request(
    _center: ffi::CFNotificationCenterRef,
    observer: *mut std::ffi::c_void,
    _name: ffi::CFStringRef,
    _object: *const std::ffi::c_void,
    _user_info: ffi::CFDictionaryRef,
) {
    if observer.is_null() {
        handle_extension_request(None);
        return;
    }
    let context = unsafe { &*(observer as *const BridgeListenerContext) };
    handle_extension_request(Some(&context.adapter));
}

fn handle_extension_request(adapter: Option<&Arc<Mutex<Box<dyn CoreAdapter>>>>) {
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
    let response = match adapter {
        Some(adapter) => super::dispatch_provider_rpc(adapter, &command, data),
        None => super::provider_bridge_unavailable_response(),
    };

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
