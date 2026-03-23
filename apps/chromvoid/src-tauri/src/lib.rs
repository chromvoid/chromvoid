#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(desktop)]
use std::time::Duration;

#[cfg(desktop)]
use tauri::{Manager, RunEvent};

// ── Internal modules ────────────────────────────────────────────────────

mod core_adapter;
#[cfg(desktop)]
pub mod gateway;
mod ios_keep_awake;
mod mobile;
pub mod network;
mod session_settings;
#[cfg(desktop)]
mod sleep_watcher;
#[cfg(desktop)]
pub mod usb;
#[cfg(all(desktop, any(target_os = "linux", target_os = "macos")))]
mod volume_fuse;
#[cfg(desktop)]
mod volume_manager;
#[cfg(desktop)]
mod volume_webdav;
#[cfg(all(desktop, target_os = "windows"))]
mod volume_windows;

mod app_state;
mod auto_lock;
mod commands;
mod credential_provider_bridge;
mod credential_provider_contract;
mod credential_provider_passkey;
mod helpers;
mod setup;
#[cfg(desktop)]
mod shutdown;
#[cfg(desktop)]
mod ssh_agent;
#[cfg(desktop)]
mod ssh_keygen;
mod state_ext;
#[cfg(desktop)]
mod tray;
mod types;

// ── Re-exports ──────────────────────────────────────────────────────────

#[cfg(all(desktop, any(test, debug_assertions)))]
pub use commands::sync_cmds::{
    bootstrap_sync, choose_reconnect_strategy, current_cursor, is_sync_active, reset_sync_state,
    trigger_reconnect_sync, ReconnectStrategy, SyncCursor, SyncState, WriterLockInfo,
};
#[cfg(desktop)]
pub use core_adapter::{ConnectionState, ModeTransition, RemoteCoreAdapter, RemoteHost};
pub use core_adapter::{CoreAdapter, CoreMode, LocalCoreAdapter};
#[cfg(any(test, debug_assertions))]
pub use mobile::android::{AndroidAutofillAdapter, AutofillContext};
#[cfg(any(test, debug_assertions))]
pub use mobile::{BiometricAuthError, TestBiometricOverride};
#[cfg(all(desktop, any(target_os = "linux", target_os = "macos")))]
pub use volume_fuse::start_fuse_server;
#[cfg(desktop)]
pub use volume_manager::{detect_fuse_driver, FuseDriverStatus};
#[cfg(desktop)]
pub use volume_webdav::{start_webdav_server, WebDavServerHandle};

#[cfg(any(test, debug_assertions))]
pub use commands::vault::{mobile_biometric_auth_for_tests, mobile_set_test_biometric_override};

// ── Public mobile lifecycle helpers ─────────────────────────────────────

/// Best-effort mobile lifecycle lock used by `mobile_notify_background` when enabled.
///
/// Exported to enable direct integration testing of the command-layer contract.
pub fn mobile_background_lock_adapter(
    adapter: &mut dyn CoreAdapter,
    lock_on_mobile_background: bool,
) -> bool {
    if !lock_on_mobile_background {
        return false;
    }
    if !adapter.is_unlocked() {
        return false;
    }

    let req = chromvoid_core::rpc::types::RpcRequest::new(
        "vault:lock".to_string(),
        serde_json::Value::Null,
    );
    let _ = adapter.handle(&req);
    let _ = adapter.save();
    true
}

/// Returns whether the vault is currently unlocked on foreground resume.
///
/// Exported to keep lifecycle tests close to command behavior.
pub fn mobile_foreground_is_unlocked(adapter: &dyn CoreAdapter) -> bool {
    adapter.is_unlocked()
}

// ── Command imports for generate_handler! ───────────────────────────────

use commands::catalog::{
    catalog_download, catalog_secret_read, catalog_secret_write_chunk, catalog_upload_chunk,
    write_text_file,
};
#[cfg(desktop)]
use commands::catalog::{
    catalog_download_path, catalog_open_external, catalog_upload_path, file_stat,
};
#[cfg(desktop)]
use commands::gateway_cmds::{
    gateway_cancel_pairing, gateway_get_capability_policy, gateway_get_config,
    gateway_issue_action_grant, gateway_issue_site_grant, gateway_list_active_grants,
    gateway_list_paired, gateway_revoke_all_grants, gateway_revoke_extension,
    gateway_set_access_duration, gateway_set_capability_policy, gateway_set_enabled,
    gateway_set_session_duration, gateway_start_pairing,
};
#[cfg(desktop)]
use commands::mode_cmds::{mode_get, mode_status, mode_switch};
#[cfg(desktop)]
use commands::network_cmds::{
    desktop_connect_ios, desktop_pair_ios, network_connection_state, network_export_server_profile,
    network_generate_room_id, network_import_server_profile, network_list_paired_peers,
    network_pair_cancel, network_pair_confirm, network_pair_start,
    network_record_profile_endpoint_failure, network_remove_paired_peer,
    network_rollback_profile_endpoint, network_transport_metrics,
};
use commands::network_cmds::{
    get_local_device_identity, handle_ios_wake, ios_host_status, network_get_bootstrap_profile,
    network_list_server_profiles, publish_ios_presence, start_ios_host_mode, stop_ios_host_mode,
};
use commands::network_cmds::{mobile_acceptor_start, mobile_acceptor_status, mobile_acceptor_stop};
use commands::passmanager::{
    passmanager_download, passmanager_secret_read, passmanager_secret_write_chunk,
    passmanager_upload_chunk,
};
#[cfg(desktop)]
use commands::ssh_agent_cmds::{
    ssh_agent_sign_approval_resolve, ssh_agent_start, ssh_agent_status, ssh_agent_stop,
};
#[cfg(desktop)]
use commands::sync_cmds::{sync_delta_apply, sync_initial, sync_reconnect, sync_write};
#[cfg(desktop)]
use commands::usb_cmds::{
    usb_connect, usb_connection_state, usb_disconnect, usb_list_paired, usb_pair_device,
    usb_scan_devices,
};
#[cfg(mobile)]
use commands::vault::setup_native_gestures;
use commands::vault::{
    android_autofill_provider_status, android_open_autofill_provider_settings,
    android_password_save_finish, backup_local_cancel, backup_local_create, erase_device,
    get_current_mode, get_session_settings, init_local_storage, master_setup,
    mobile_biometric_auth, mobile_notify_background, mobile_notify_foreground,
    restore_local_cancel, restore_local_from_folder, rpc_dispatch, runtime_capabilities,
    set_session_settings, storage_set_root, touch_activity,
};
#[cfg(desktop)]
use commands::volume_ops::{volume_get_backends, volume_get_status, volume_mount, volume_unmount};

#[cfg(desktop)]
use commands::volume_ops::volume_unmount_inner_with_budget;
#[cfg(desktop)]
use shutdown::exit_request_should_intercept;

#[cfg(desktop)]
use app_state::AppState;

// ── macOS: disable WebKit text services ──────────────────────────────────

#[cfg(target_os = "macos")]
fn disable_webkit_text_services() {
    use objc2_foundation::{NSString, NSUserDefaults};

    let defaults = unsafe { NSUserDefaults::standardUserDefaults() };
    for key in [
        "WebContinuousSpellCheckingEnabled",
        "WebAutomaticSpellingCorrectionEnabled",
        "WebAutomaticTextReplacementEnabled",
        "WebAutomaticQuoteSubstitutionEnabled",
        "WebAutomaticDashSubstitutionEnabled",
    ] {
        let ns_key = NSString::from_str(key);
        unsafe { defaults.setBool_forKey(false, &ns_key) };
    }
}

// ── Application entry point ─────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "macos")]
    disable_webkit_text_services();

    let builder = tauri::Builder::default()
        .setup(setup::setup_app)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .on_window_event(|_window, event| {
            #[cfg(desktop)]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = _window.hide();
            }
            #[cfg(not(desktop))]
            let _ = event;
        });

    #[cfg(target_os = "ios")]
    let builder = builder.plugin(tauri_plugin_ios_push_bridge::init());

    #[cfg(desktop)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        rpc_dispatch,
        catalog_upload_chunk,
        passmanager_upload_chunk,
        catalog_upload_path,
        file_stat,
        write_text_file,
        catalog_download,
        passmanager_download,
        catalog_download_path,
        catalog_open_external,
        catalog_secret_read,
        catalog_secret_write_chunk,
        passmanager_secret_read,
        passmanager_secret_write_chunk,
        get_current_mode,
        init_local_storage,
        master_setup,
        storage_set_root,
        backup_local_create,
        backup_local_cancel,
        restore_local_from_folder,
        restore_local_cancel,
        erase_device,
        gateway_get_config,
        gateway_set_enabled,
        gateway_set_access_duration,
        gateway_list_paired,
        gateway_revoke_extension,
        gateway_start_pairing,
        gateway_cancel_pairing,
        gateway_set_session_duration,
        gateway_get_capability_policy,
        gateway_set_capability_policy,
        gateway_issue_action_grant,
        gateway_issue_site_grant,
        gateway_list_active_grants,
        gateway_revoke_all_grants,
        get_session_settings,
        set_session_settings,
        volume_get_status,
        volume_mount,
        volume_unmount,
        volume_get_backends,
        touch_activity,
        runtime_capabilities,
        get_local_device_identity,
        network_list_server_profiles,
        network_get_bootstrap_profile,
        mobile_notify_background,
        mobile_notify_foreground,
        mobile_biometric_auth,
        android_autofill_provider_status,
        android_open_autofill_provider_settings,
        usb_scan_devices,
        usb_connection_state,
        usb_list_paired,
        usb_pair_device,
        usb_connect,
        usb_disconnect,
        network_connection_state,
        network_list_paired_peers,
        network_remove_paired_peer,
        network_transport_metrics,
        network_generate_room_id,
        network_import_server_profile,
        network_export_server_profile,
        network_list_server_profiles,
        network_get_bootstrap_profile,
        network_record_profile_endpoint_failure,
        network_rollback_profile_endpoint,
        network_pair_start,
        network_pair_confirm,
        network_pair_cancel,
        start_ios_host_mode,
        stop_ios_host_mode,
        ios_host_status,
        publish_ios_presence,
        handle_ios_wake,
        desktop_pair_ios,
        desktop_connect_ios,
        sync_initial,
        sync_delta_apply,
        sync_reconnect,
        sync_write,
        mode_get,
        mode_switch,
        mode_status,
        mobile_acceptor_start,
        mobile_acceptor_stop,
        mobile_acceptor_status,
        ssh_keygen::ssh_keygen,
        ssh_agent_start,
        ssh_agent_stop,
        ssh_agent_status,
        ssh_agent_sign_approval_resolve
    ]);

    #[cfg(mobile)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        rpc_dispatch,
        catalog_upload_chunk,
        passmanager_upload_chunk,
        write_text_file,
        catalog_download,
        passmanager_download,
        catalog_secret_read,
        catalog_secret_write_chunk,
        passmanager_secret_read,
        passmanager_secret_write_chunk,
        get_current_mode,
        init_local_storage,
        master_setup,
        storage_set_root,
        backup_local_create,
        backup_local_cancel,
        restore_local_from_folder,
        restore_local_cancel,
        erase_device,
        get_session_settings,
        set_session_settings,
        touch_activity,
        runtime_capabilities,
        get_local_device_identity,
        network_list_server_profiles,
        network_get_bootstrap_profile,
        mobile_notify_background,
        mobile_notify_foreground,
        mobile_biometric_auth,
        android_autofill_provider_status,
        android_open_autofill_provider_settings,
        android_password_save_finish,
        setup_native_gestures,
        mobile_acceptor_start,
        mobile_acceptor_stop,
        mobile_acceptor_status,
        start_ios_host_mode,
        stop_ios_host_mode,
        ios_host_status,
        publish_ios_presence,
        handle_ios_wake
    ]);

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        #[cfg(desktop)]
        if let RunEvent::ExitRequested { api, .. } = event {
            let state: tauri::State<'_, AppState> = app_handle.state();
            if !exit_request_should_intercept(&state.exit_in_progress) {
                return;
            }

            api.prevent_exit();

            let app = app_handle.clone();
            let adapter = state.adapter.clone();
            let vm = state.volume_manager.clone();
            tauri::async_runtime::spawn(async move {
                let _ = volume_unmount_inner_with_budget(
                    app.clone(),
                    adapter,
                    vm,
                    Some(Duration::from_secs(5)),
                )
                .await;
                app.exit(0);
            });
        }
        #[cfg(not(desktop))]
        let _ = (app_handle, event);
    });
}
