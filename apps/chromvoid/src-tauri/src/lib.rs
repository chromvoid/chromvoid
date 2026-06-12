#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(desktop)]
use tauri::{Manager, RunEvent};

// ── Internal modules ────────────────────────────────────────────────────

mod core_adapter;
#[cfg(desktop)]
pub mod gateway;
mod ios_keep_awake;
mod mobile;
pub mod network;
pub mod remote_data_plane;
mod session_settings;
#[cfg(desktop)]
mod sleep_watcher;
#[cfg(all(desktop, any(target_os = "linux", target_os = "macos")))]
mod volume_fuse;
#[cfg(desktop)]
mod volume_manager;
#[cfg(desktop)]
mod volume_webdav;
#[cfg(all(desktop, target_os = "windows"))]
mod volume_windows;

mod app_state;
mod audio_artwork;
mod auto_lock;
mod catalog_blocking_io;
mod commands;
mod core_rpc_dispatcher;
mod credential_provider_bridge;
mod credential_provider_contract;
mod credential_provider_passkey;
mod helpers;
#[cfg(desktop)]
mod host_path_capability;
mod image_preview;
#[cfg(all(desktop, target_os = "macos"))]
mod macos_external;
mod media_source;
pub mod media_stream;
#[cfg(desktop)]
mod mode_transition_coordinator;
mod paired_store_crypto;
mod pro;
#[cfg(desktop)]
mod remote_io_runtime;
mod rpc_transport_protocol;
mod setup;
#[cfg(desktop)]
mod shutdown;
#[cfg(desktop)]
mod ssh_agent;
#[cfg(desktop)]
mod ssh_keygen;
mod state_ext;
mod task_lifecycle;
#[cfg(desktop)]
mod tray;
mod types;
mod vault_background_io;

// ── Re-exports ──────────────────────────────────────────────────────────

#[cfg(all(desktop, any(test, debug_assertions)))]
pub use commands::sync_cmds::{
    choose_reconnect_strategy, ReconnectStrategy, SyncCursor, SyncRuntimeState, SyncState,
    WriterLockInfo,
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

#[cfg(mobile)]
use commands::catalog::{
    catalog_cancel_android_shared_files, catalog_cancel_native_upload, catalog_cancel_shared_files,
    catalog_list_shared_files, catalog_upload_android_shared_files, catalog_upload_native_files,
    catalog_upload_shared_files,
};
use commands::catalog::{
    catalog_download, catalog_file_replace, catalog_image_metadata, catalog_open_external,
    catalog_preview_image, catalog_save_image_to_gallery, catalog_secret_read,
    catalog_secret_write_chunk, catalog_share_files, catalog_thumbnail_image, catalog_upload_chunk,
    prepare_catalog_preview_file, purge_catalog_preview_cache, release_catalog_preview_file,
    write_text_file,
};
#[cfg(desktop)]
use commands::catalog::{catalog_download_path, catalog_upload_path, file_stat};
use commands::external_url::open_url_external;
#[cfg(desktop)]
use commands::gateway_cmds::{
    gateway_cancel_pairing, gateway_get_capability_policy, gateway_get_config,
    gateway_issue_action_grant, gateway_issue_site_grant, gateway_list_active_grants,
    gateway_list_paired, gateway_revoke_all_grants, gateway_revoke_extension,
    gateway_set_access_duration, gateway_set_capability_policy, gateway_set_enabled,
    gateway_set_session_duration, gateway_start_pairing,
};
#[cfg(desktop)]
use commands::host_path::{
    host_path_pick_download_target, host_path_pick_text_file_target, host_path_pick_upload_files,
};
#[cfg(desktop)]
use commands::mode_cmds::{mode_get, mode_status, mode_switch};
#[cfg(desktop)]
use commands::network_cmds::{
    desktop_connect_ios, desktop_pair_ios, desktop_pair_mobile_host, network_connection_state,
    network_export_server_profile, network_generate_room_id, network_import_server_profile,
    network_list_paired_peers, network_pair_cancel, network_pair_confirm, network_pair_start,
    network_record_profile_endpoint_failure, network_remove_paired_peer,
    network_rollback_profile_endpoint, network_transport_metrics,
};
use commands::network_cmds::{
    get_local_device_identity, handle_ios_wake, ios_host_status, mobile_host_publish_presence,
    mobile_host_start, mobile_host_status, mobile_host_stop, network_get_bootstrap_profile,
    network_list_server_profiles, publish_ios_presence, start_ios_host_mode, stop_ios_host_mode,
};
use commands::network_cmds::{mobile_acceptor_start, mobile_acceptor_status, mobile_acceptor_stop};
#[cfg(mobile)]
use commands::passmanager::{
    android_otp_qr_scan_cancel, android_otp_qr_scan_start, native_otp_qr_scan_cancel,
    native_otp_qr_scan_start,
};
use commands::passmanager::{
    passmanager_download, passmanager_secret_read, passmanager_secret_write_chunk,
    passmanager_upload_chunk,
};
#[cfg(desktop)]
use commands::ssh_agent_cmds::{
    ssh_agent_sign_approval_resolve, ssh_agent_start, ssh_agent_status, ssh_agent_stop,
};
use commands::startup::frontend_splash_ready;
#[cfg(desktop)]
use commands::sync_cmds::{sync_delta_apply, sync_initial, sync_reconnect, sync_write};
use commands::vault::{
    android_audio_session_command, android_audio_warmup, android_autofill_provider_status,
    android_media_session_stop, android_media_session_update,
    android_open_autofill_provider_settings, android_passkey_delete, android_passkeys_list,
    android_quick_lock_tile_status, android_request_quick_lock_tile, android_video_start,
    android_video_stop, backup_local_cancel, backup_local_create,
    credential_provider_passkey_delete, credential_provider_passkeys_list,
    credential_provider_status, erase_device, get_current_mode, get_session_settings,
    init_local_storage, master_rekey, master_setup, mobile_biometric_auth,
    mobile_notify_background, mobile_notify_foreground, native_audio_session_command,
    open_credential_provider_settings, password_strength_estimate, restore_local_cancel,
    restore_local_from_folder, restore_local_select_source, rpc_dispatch, runtime_capabilities,
    set_session_settings, storage_set_root, touch_activity, unlock_debug_log, vault_rekey,
    vault_rekey_cancel,
};
#[cfg(mobile)]
use commands::vault::{android_password_save_finish, setup_native_gestures};
#[cfg(desktop)]
use commands::volume_ops::{volume_get_backends, volume_get_status, volume_mount, volume_unmount};
use media_stream::{prepare_media_stream, release_media_stream};
use pro::{
    license_account_cabinet_handoff, license_activation_code_activate,
    license_current_seat_deactivate, license_seat_status, license_status, module_access_resolve,
    module_access_snapshot,
};

#[cfg(desktop)]
use shutdown::{
    collect_desktop_exit_cleanup, exit_request_should_intercept, run_desktop_exit_cleanup,
};

#[cfg(desktop)]
use app_state::AppState;

// ── macOS: disable WebKit text services ──────────────────────────────────

#[cfg(target_os = "macos")]
fn disable_webkit_text_services() {
    use objc2_foundation::{NSString, NSUserDefaults};

    let defaults = NSUserDefaults::standardUserDefaults();
    for key in [
        "WebContinuousSpellCheckingEnabled",
        "WebAutomaticSpellingCorrectionEnabled",
        "WebAutomaticTextReplacementEnabled",
        "WebAutomaticQuoteSubstitutionEnabled",
        "WebAutomaticDashSubstitutionEnabled",
    ] {
        let ns_key = NSString::from_str(key);
        defaults.setBool_forKey(false, &ns_key);
    }
}

// ── Application entry point ─────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "macos")]
    disable_webkit_text_services();

    let builder = tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol(
            commands::catalog::PREPARED_PREVIEW_SCHEME,
            |ctx, request, responder| {
                commands::catalog::handle_prepared_preview_protocol_request(
                    ctx.app_handle().clone(),
                    request,
                    responder,
                )
            },
        )
        .register_asynchronous_uri_scheme_protocol(
            media_stream::SCHEME,
            |ctx, request, responder| {
                media_stream::handle_protocol_request(ctx.app_handle().clone(), request, responder)
            },
        )
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
    let builder = builder
        .plugin(tauri_plugin_ios_push_bridge::init())
        .plugin(tauri_plugin_ios_native_bridge::init());

    #[cfg(desktop)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        rpc_dispatch,
        license_activation_code_activate,
        license_account_cabinet_handoff,
        license_status,
        license_seat_status,
        license_current_seat_deactivate,
        module_access_snapshot,
        module_access_resolve,
        catalog_upload_chunk,
        catalog_file_replace,
        host_path_pick_upload_files,
        host_path_pick_download_target,
        host_path_pick_text_file_target,
        passmanager_upload_chunk,
        catalog_upload_path,
        file_stat,
        write_text_file,
        catalog_download,
        prepare_catalog_preview_file,
        release_catalog_preview_file,
        purge_catalog_preview_cache,
        prepare_media_stream,
        release_media_stream,
        catalog_preview_image,
        catalog_thumbnail_image,
        catalog_image_metadata,
        catalog_save_image_to_gallery,
        catalog_share_files,
        catalog_open_external,
        open_url_external,
        passmanager_download,
        catalog_download_path,
        catalog_secret_read,
        catalog_secret_write_chunk,
        passmanager_secret_read,
        passmanager_secret_write_chunk,
        get_current_mode,
        frontend_splash_ready,
        init_local_storage,
        master_setup,
        master_rekey,
        password_strength_estimate,
        storage_set_root,
        backup_local_create,
        backup_local_cancel,
        vault_rekey,
        vault_rekey_cancel,
        restore_local_from_folder,
        restore_local_select_source,
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
        unlock_debug_log,
        runtime_capabilities,
        get_local_device_identity,
        network_list_server_profiles,
        network_get_bootstrap_profile,
        mobile_notify_background,
        mobile_notify_foreground,
        android_media_session_update,
        android_media_session_stop,
        android_audio_session_command,
        native_audio_session_command,
        android_audio_warmup,
        android_video_start,
        android_video_stop,
        mobile_biometric_auth,
        android_autofill_provider_status,
        android_open_autofill_provider_settings,
        credential_provider_status,
        open_credential_provider_settings,
        credential_provider_passkeys_list,
        credential_provider_passkey_delete,
        android_passkeys_list,
        android_passkey_delete,
        android_quick_lock_tile_status,
        android_request_quick_lock_tile,
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
        mobile_host_start,
        mobile_host_stop,
        mobile_host_status,
        mobile_host_publish_presence,
        desktop_pair_ios,
        desktop_pair_mobile_host,
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
        license_activation_code_activate,
        license_account_cabinet_handoff,
        license_status,
        license_seat_status,
        license_current_seat_deactivate,
        module_access_snapshot,
        module_access_resolve,
        catalog_upload_chunk,
        catalog_file_replace,
        catalog_upload_native_files,
        catalog_cancel_native_upload,
        catalog_upload_shared_files,
        catalog_cancel_shared_files,
        catalog_list_shared_files,
        catalog_upload_android_shared_files,
        catalog_cancel_android_shared_files,
        native_otp_qr_scan_start,
        native_otp_qr_scan_cancel,
        android_otp_qr_scan_start,
        android_otp_qr_scan_cancel,
        passmanager_upload_chunk,
        write_text_file,
        catalog_download,
        prepare_catalog_preview_file,
        release_catalog_preview_file,
        purge_catalog_preview_cache,
        prepare_media_stream,
        release_media_stream,
        catalog_preview_image,
        catalog_thumbnail_image,
        catalog_image_metadata,
        catalog_save_image_to_gallery,
        catalog_share_files,
        catalog_open_external,
        open_url_external,
        passmanager_download,
        catalog_secret_read,
        catalog_secret_write_chunk,
        passmanager_secret_read,
        passmanager_secret_write_chunk,
        get_current_mode,
        frontend_splash_ready,
        init_local_storage,
        master_setup,
        master_rekey,
        password_strength_estimate,
        storage_set_root,
        backup_local_create,
        backup_local_cancel,
        vault_rekey,
        vault_rekey_cancel,
        restore_local_from_folder,
        restore_local_select_source,
        restore_local_cancel,
        erase_device,
        get_session_settings,
        set_session_settings,
        touch_activity,
        unlock_debug_log,
        runtime_capabilities,
        get_local_device_identity,
        network_list_server_profiles,
        network_get_bootstrap_profile,
        mobile_notify_background,
        mobile_notify_foreground,
        android_media_session_update,
        android_media_session_stop,
        android_audio_session_command,
        native_audio_session_command,
        android_audio_warmup,
        android_video_start,
        android_video_stop,
        mobile_biometric_auth,
        android_autofill_provider_status,
        android_open_autofill_provider_settings,
        credential_provider_status,
        open_credential_provider_settings,
        credential_provider_passkeys_list,
        credential_provider_passkey_delete,
        android_passkeys_list,
        android_passkey_delete,
        android_quick_lock_tile_status,
        android_request_quick_lock_tile,
        android_password_save_finish,
        setup_native_gestures,
        mobile_acceptor_start,
        mobile_acceptor_stop,
        mobile_acceptor_status,
        start_ios_host_mode,
        stop_ios_host_mode,
        ios_host_status,
        publish_ios_presence,
        handle_ios_wake,
        mobile_host_start,
        mobile_host_stop,
        mobile_host_status,
        mobile_host_publish_presence
    ]);

    let app = match builder.build(tauri::generate_context!()) {
        Ok(app) => app,
        Err(error) => {
            eprintln!("error while building tauri application: {error}");
            std::process::exit(1);
        }
    };

    app.run(|app_handle, event| {
        #[cfg(desktop)]
        if let RunEvent::ExitRequested { api, .. } = event {
            let state: tauri::State<'_, AppState> = app_handle.state();
            if !exit_request_should_intercept(&state.exit_in_progress) {
                return;
            }
            crate::commands::vault::release_mobile_native_sessions(app_handle, &state, "app_exit");

            api.prevent_exit();

            let cleanup = collect_desktop_exit_cleanup(app_handle.clone(), &state);
            let app = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                run_desktop_exit_cleanup(cleanup).await;
                app.exit(0);
            });
        }
        #[cfg(not(desktop))]
        let _ = (app_handle, event);
    });
}
