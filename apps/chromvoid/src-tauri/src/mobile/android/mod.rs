#![cfg_attr(not(target_os = "android"), allow(dead_code))]

mod audio_session_registry;
mod autofill;
mod biometric;
mod bridge_contract;
#[cfg(target_os = "android")]
mod native;
mod native_upload_errors;
mod native_upload_runtime;
mod passkey;
mod password_save;
mod provider_status;
mod runtime;
mod saf_picker;
#[cfg(any(target_os = "android", test))]
mod usb_accessory_fd;
#[cfg(any(target_os = "android", test))]
mod usb_accessory_host_failure;
#[cfg(any(target_os = "android", test))]
mod usb_accessory_runtime;
#[cfg(any(target_os = "android", test))]
mod usb_accessory_sessions;

#[cfg(test)]
mod tests;

#[cfg(any(target_os = "android", test))]
use std::path::PathBuf;
#[cfg(any(target_os = "android", test))]
use std::sync::{Arc, Mutex};

#[cfg(any(target_os = "android", test))]
use chromvoid_protocol::TransportType;

#[cfg(any(target_os = "android", test))]
use crate::core_adapter::CoreAdapter;
use crate::mobile::BiometricAuthError;

pub(crate) use audio_session_registry::{AndroidAudioSessionRegistry, AndroidAudioSessionTrack};
pub(crate) use autofill::AndroidAutofillRuntimeState;
#[cfg(any(test, debug_assertions))]
pub use autofill::{AndroidAutofillAdapter, AutofillContext};
pub(crate) use biometric::AndroidBiometricRuntimeState;
pub(crate) use native_upload_runtime::AndroidNativeUploadRuntimeState;
use native_upload_runtime::NativeUploadCloseMode;
#[cfg(mobile)]
pub(crate) use password_save::finish_password_save_request;
#[cfg(mobile)]
pub use password_save::AndroidPasswordSaveOutcome;
pub(crate) use password_save::{
    invalidate_all_password_save_requests, AndroidPasswordSaveRuntimeState,
};
pub(crate) use runtime::{shared_provider_runtime, AndroidProviderRuntimeState};
pub(crate) use saf_picker::AndroidSafPickerRuntimeState;
#[cfg(target_os = "android")]
pub(crate) use saf_picker::AndroidSafTree;
#[cfg(any(target_os = "android", test))]
pub(crate) use usb_accessory_host_failure::{
    AndroidMobileUsbHostFailure, AndroidMobileUsbHostStopReason,
};
#[cfg(target_os = "android")]
pub(crate) use usb_accessory_runtime::shared_android_usb_accessory_runtime;
#[cfg(any(target_os = "android", test))]
pub(crate) use usb_accessory_runtime::{
    AndroidMobileUsbAccessoryIdentity, AndroidMobileUsbAccessoryRuntimeState,
};
#[cfg(not(target_os = "android"))]
mod native_stub {
    use crate::mobile::BiometricAuthError;

    pub async fn authenticate_with_biometric(
        _runtime: &super::AndroidBiometricRuntimeState,
        _reason: &str,
    ) -> Result<(), BiometricAuthError> {
        Err(BiometricAuthError::unavailable(
            "Native Android biometric bridge is not available on this target",
        ))
    }

    pub fn biometric_bridge_available() -> bool {
        false
    }

    pub fn current_device_api_level() -> Option<u64> {
        None
    }

    pub fn start_connection_service(_device_name: &str) -> bool {
        false
    }

    pub fn stop_connection_service() -> bool {
        false
    }

    pub fn update_media_session(_snapshot_json: &str) -> bool {
        false
    }

    pub fn stop_media_session() -> bool {
        false
    }

    pub fn sync_vault_quick_lock(
        _unlocked: bool,
        _notification_enabled: bool,
        _quick_tile_enabled: bool,
    ) -> bool {
        false
    }

    pub fn request_quick_lock_tile() -> i32 {
        1
    }

    pub fn start_video_playback(_source_json: &str) -> bool {
        false
    }

    pub fn stop_video_playback(_token: &str) -> bool {
        false
    }

    pub fn send_audio_playback_command(_command_json: &str) -> bool {
        false
    }

    pub fn warmup_audio_playback_service() -> bool {
        false
    }

    pub async fn upload_native_files(
        _runtime: std::sync::Arc<super::AndroidNativeUploadRuntimeState>,
        _app: tauri::AppHandle,
        _adapter: std::sync::Arc<std::sync::Mutex<Box<dyn crate::CoreAdapter>>>,
        _parent_path: String,
        _upload_id: String,
        _read_chunk_size: Option<u64>,
    ) -> Result<(), String> {
        Err("Android native upload is not available on this target".to_string())
    }

    pub async fn upload_android_shared_files(
        _runtime: std::sync::Arc<super::AndroidNativeUploadRuntimeState>,
        _app: tauri::AppHandle,
        _adapter: std::sync::Arc<std::sync::Mutex<Box<dyn crate::CoreAdapter>>>,
        _parent_path: String,
        _upload_id: String,
        _share_session_id: String,
        _read_chunk_size: Option<u64>,
    ) -> Result<(), (String, String)> {
        Err((
            "Android shared file upload is not available on this target".to_string(),
            "NATIVE_UPLOAD_UNAVAILABLE".to_string(),
        ))
    }

    pub fn cancel_native_upload(
        _runtime: &super::AndroidNativeUploadRuntimeState,
        _upload_id: &str,
    ) -> bool {
        false
    }

    pub fn cancel_android_shared_files(_share_session_id: &str) -> Result<(), (String, String)> {
        Err((
            "Android shared file upload is not available on this target".to_string(),
            "NATIVE_UPLOAD_UNAVAILABLE".to_string(),
        ))
    }

    pub fn start_otp_qr_scan(_app: tauri::AppHandle, _scan_id: &str) -> Result<(), String> {
        Err("Android native OTP QR scanner is not available on this target".to_string())
    }

    pub fn cancel_otp_qr_scan(_scan_id: &str) -> bool {
        false
    }

    pub fn autofill_provider_selected() -> Result<bool, String> {
        Err("Android autofill provider selection is not available on this target".to_string())
    }

    pub fn open_autofill_provider_settings() -> Result<bool, String> {
        Err("Android autofill provider settings are not available on this target".to_string())
    }

    pub fn notify_password_save_review_result(
        _token: Option<&str>,
        _outcome: &str,
        _finished: bool,
    ) {
    }

    pub fn convert_image_preview(
        _bytes: &[u8],
        _tier: crate::image_preview::ImageDerivativeTier,
    ) -> Result<crate::image_preview::PreviewImageOutput, String> {
        Err("Android image preview conversion is not available on this target".to_string())
    }

    pub fn extract_image_metadata_json(_bytes: &[u8]) -> Result<Option<String>, String> {
        Err("Android image metadata extraction is not available on this target".to_string())
    }

    pub fn gallery_save_supported() -> bool {
        false
    }

    pub fn save_image_to_gallery(
        _bytes: &[u8],
        _file_name: &str,
        _mime_type: Option<&str>,
    ) -> Result<String, String> {
        Err("Android gallery save is not available on this target".to_string())
    }

    pub fn open_file_with_system(
        _path: &std::path::Path,
        _mime_type: Option<&str>,
    ) -> Result<(), String> {
        Err("Android external file open is not available on this target".to_string())
    }

    pub fn open_url_with_system(_url: &str) -> Result<(), String> {
        Err("Android external URL open is not available on this target".to_string())
    }

    pub fn share_files_with_system(
        _items: &[(&std::path::Path, Option<&str>)],
    ) -> Result<(), String> {
        Err("Android external file share is not available on this target".to_string())
    }
}

pub async fn authenticate_with_biometric(
    runtime: &AndroidBiometricRuntimeState,
    reason: &str,
) -> Result<(), BiometricAuthError> {
    #[cfg(target_os = "android")]
    {
        return native::authenticate_with_biometric(runtime, reason).await;
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::authenticate_with_biometric(runtime, reason).await;
    }
}

pub(crate) fn register_app_handle(app: tauri::AppHandle) {
    runtime::register_app_handle(app)
}

pub(crate) fn app_handle() -> Option<tauri::AppHandle> {
    runtime::app_handle()
}

#[cfg(target_os = "android")]
pub(crate) fn notify_mobile_usb_approval_required(kind: &str, attempt_id: &str) {
    native::notify_mobile_usb_approval_required(kind, attempt_id);
}

#[cfg(target_os = "android")]
pub(crate) fn notify_mobile_usb_approval_resolved() {
    native::notify_mobile_usb_approval_resolved();
}

#[cfg(target_os = "android")]
pub(crate) fn configure_usb_accessory_host_starter(
    mobile_acceptor_runtime: Arc<crate::network::mobile_acceptor::MobileAcceptorRuntimeState>,
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    storage_root: PathBuf,
) {
    configure_usb_accessory_host_starter_for_runtime(
        shared_android_usb_accessory_runtime(),
        mobile_acceptor_runtime,
        adapter,
        storage_root,
    );
}

#[cfg(any(target_os = "android", test))]
pub(crate) fn configure_usb_accessory_host_starter_for_runtime(
    accessory_runtime: Arc<AndroidMobileUsbAccessoryRuntimeState>,
    mobile_acceptor_runtime: Arc<crate::network::mobile_acceptor::MobileAcceptorRuntimeState>,
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    storage_root: PathBuf,
) {
    accessory_runtime.set_host_starter(Arc::new(move |start| {
        let mobile_acceptor_runtime = mobile_acceptor_runtime.clone();
        let adapter = adapter.clone();
        let storage_root = storage_root.clone();
        Box::pin(async move {
            let label = android_usb_accessory_host_label(&start.identity);
            let session_id = start.session_id.clone();
            tracing::debug!(
                "mobile_usb_android: accepting accessory host session_id={} label={}",
                session_id,
                label
            );
            let shutdown: crate::network::mobile_acceptor::DirectTransportShutdownSignal =
                Box::pin(async move {
                    start
                        .shutdown
                        .await
                        .unwrap_or(AndroidMobileUsbHostStopReason::Shutdown)
                        .as_local_direct_transport_stop_reason()
                });
            crate::network::mobile_acceptor::accept_direct_transport_until_closed(
                mobile_acceptor_runtime,
                adapter,
                &storage_root,
                start.transport,
                TransportType::UsbMobile,
                label,
                shutdown,
                crate::network::mobile_acceptor::DirectTransportTimelineContext::android_usb(
                    session_id.clone(),
                ),
            )
            .await
            .map(|outcome| {
                let stop_reason = match outcome.stop_reason {
                    crate::network::mobile_acceptor::DirectTransportStopReason::Shutdown => {
                        AndroidMobileUsbHostStopReason::Shutdown
                    }
                    crate::network::mobile_acceptor::DirectTransportStopReason::VaultLocked => {
                        AndroidMobileUsbHostStopReason::VaultLocked
                    }
                    crate::network::mobile_acceptor::DirectTransportStopReason::PeerClosed => {
                        AndroidMobileUsbHostStopReason::PeerClosed
                    }
                    crate::network::mobile_acceptor::DirectTransportStopReason::AccessoryDetached => {
                        AndroidMobileUsbHostStopReason::AccessoryDetached
                    }
                    crate::network::mobile_acceptor::DirectTransportStopReason::ExplicitDisconnect => {
                        AndroidMobileUsbHostStopReason::ExplicitDisconnect
                    }
                    crate::network::mobile_acceptor::DirectTransportStopReason::SessionReplaced => {
                        AndroidMobileUsbHostStopReason::SessionReplaced
                    }
                    crate::network::mobile_acceptor::DirectTransportStopReason::LocalError => {
                        AndroidMobileUsbHostStopReason::LocalError
                    }
                    crate::network::mobile_acceptor::DirectTransportStopReason::TransportClosed => {
                        AndroidMobileUsbHostStopReason::TransportClosed
                    }
                    crate::network::mobile_acceptor::DirectTransportStopReason::StreamTimeout => {
                        AndroidMobileUsbHostStopReason::StreamTimeout
                    }
                    crate::network::mobile_acceptor::DirectTransportStopReason::DataPlaneError => {
                        AndroidMobileUsbHostStopReason::DataPlaneError
                    }
                    crate::network::mobile_acceptor::DirectTransportStopReason::Error => {
                        AndroidMobileUsbHostStopReason::Error
                    }
                };
                tracing::info!(
                    session_id = %session_id,
                    peer_id = %crate::mobile_usb::observability::redacted_identifier(Some(outcome.peer_id.as_str())),
                    transport_type = ?outcome.transport_type,
                    stop_reason = stop_reason.as_str(),
                    duration_ms = outcome.duration_ms,
                    "mobile_usb_android: direct transport session ended"
                );
                stop_reason
            })
            .map_err(AndroidMobileUsbHostFailure::from_direct_accept_failure)
        })
    }));
}

#[cfg(any(target_os = "android", test))]
fn android_usb_accessory_host_label(identity: &AndroidMobileUsbAccessoryIdentity) -> String {
    identity
        .serial
        .as_deref()
        .filter(|serial| !serial.trim().is_empty())
        .map(|serial| format!("android-usb:{serial}"))
        .or_else(|| {
            identity
                .model
                .as_deref()
                .filter(|model| !model.trim().is_empty())
                .map(|model| format!("android-usb:{model}"))
        })
        .unwrap_or_else(|| "android-usb:unknown".to_string())
}

#[cfg(test)]
pub(crate) fn register_test_provider_adapter(
    adapter: std::sync::Arc<std::sync::Mutex<Box<dyn crate::CoreAdapter>>>,
) {
    runtime::register_test_provider_adapter(adapter)
}

#[cfg(test)]
pub(crate) fn runtime_ready() -> bool {
    runtime::runtime_ready()
}

pub fn biometric_bridge_available() -> bool {
    #[cfg(target_os = "android")]
    {
        return native::biometric_bridge_available();
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::biometric_bridge_available();
    }
}

pub fn start_connection_service(device_name: &str) -> bool {
    #[cfg(target_os = "android")]
    {
        return native::start_connection_service(device_name);
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::start_connection_service(device_name);
    }
}

pub fn stop_connection_service() -> bool {
    #[cfg(target_os = "android")]
    {
        return native::stop_connection_service();
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::stop_connection_service();
    }
}

pub fn update_media_session(snapshot_json: &str) -> bool {
    #[cfg(target_os = "android")]
    {
        return native::update_media_session(snapshot_json);
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::update_media_session(snapshot_json);
    }
}

pub fn stop_media_session() -> bool {
    #[cfg(target_os = "android")]
    {
        return native::stop_media_session();
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::stop_media_session();
    }
}

pub fn sync_vault_quick_lock(
    unlocked: bool,
    notification_enabled: bool,
    quick_tile_enabled: bool,
) -> bool {
    #[cfg(target_os = "android")]
    {
        return native::sync_vault_quick_lock(unlocked, notification_enabled, quick_tile_enabled);
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::sync_vault_quick_lock(
            unlocked,
            notification_enabled,
            quick_tile_enabled,
        );
    }
}

pub fn request_quick_lock_tile() -> i32 {
    #[cfg(target_os = "android")]
    {
        return native::request_quick_lock_tile();
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::request_quick_lock_tile();
    }
}

pub fn start_video_playback(source_json: &str) -> bool {
    #[cfg(target_os = "android")]
    {
        return native::start_video_playback(source_json);
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::start_video_playback(source_json);
    }
}

pub fn stop_video_playback(token: &str) -> bool {
    #[cfg(target_os = "android")]
    {
        return native::stop_video_playback(token);
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::stop_video_playback(token);
    }
}

pub fn send_audio_playback_command(command_json: &str) -> bool {
    #[cfg(target_os = "android")]
    {
        return native::send_audio_playback_command(command_json);
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::send_audio_playback_command(command_json);
    }
}

pub fn warmup_audio_playback_service() -> bool {
    #[cfg(target_os = "android")]
    {
        return native::warmup_audio_playback_service();
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::warmup_audio_playback_service();
    }
}

pub async fn upload_native_files(
    runtime: std::sync::Arc<AndroidNativeUploadRuntimeState>,
    app: tauri::AppHandle,
    adapter: std::sync::Arc<std::sync::Mutex<Box<dyn crate::CoreAdapter>>>,
    parent_path: String,
    upload_id: String,
    read_chunk_size: Option<u64>,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return native::upload_native_files(
            runtime,
            app,
            adapter,
            parent_path,
            upload_id,
            read_chunk_size,
        )
        .await;
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::upload_native_files(
            runtime,
            app,
            adapter,
            parent_path,
            upload_id,
            read_chunk_size,
        )
        .await;
    }
}

pub fn cancel_native_upload(runtime: &AndroidNativeUploadRuntimeState, upload_id: &str) -> bool {
    #[cfg(target_os = "android")]
    {
        return native::cancel_native_upload(runtime, upload_id);
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::cancel_native_upload(runtime, upload_id);
    }
}

pub(crate) fn cancel_all_native_uploads(
    runtime: &AndroidNativeUploadRuntimeState,
    shutdown: bool,
) -> usize {
    let mode = if shutdown {
        NativeUploadCloseMode::Shutdown
    } else {
        NativeUploadCloseMode::Cancel
    };
    match runtime.fail_all_pending("Native upload cancelled", None, mode) {
        Ok(count) => count,
        Err(error) => {
            tracing::warn!("native_upload: failed to cancel pending uploads: {error}");
            0
        }
    }
}

pub async fn upload_android_shared_files(
    runtime: std::sync::Arc<AndroidNativeUploadRuntimeState>,
    app: tauri::AppHandle,
    adapter: std::sync::Arc<std::sync::Mutex<Box<dyn crate::CoreAdapter>>>,
    parent_path: String,
    upload_id: String,
    share_session_id: String,
    read_chunk_size: Option<u64>,
) -> Result<(), (String, String)> {
    #[cfg(target_os = "android")]
    {
        return native::upload_android_shared_files(
            runtime,
            app,
            adapter,
            parent_path,
            upload_id,
            share_session_id,
            read_chunk_size,
        )
        .await;
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::upload_android_shared_files(
            runtime,
            app,
            adapter,
            parent_path,
            upload_id,
            share_session_id,
            read_chunk_size,
        )
        .await;
    }
}

pub fn cancel_android_shared_files(share_session_id: &str) -> Result<(), (String, String)> {
    #[cfg(target_os = "android")]
    {
        return native::cancel_android_shared_files(share_session_id);
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::cancel_android_shared_files(share_session_id);
    }
}

pub fn start_otp_qr_scan(app: tauri::AppHandle, scan_id: &str) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return native::start_otp_qr_scan(app, scan_id);
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::start_otp_qr_scan(app, scan_id);
    }
}

pub fn cancel_otp_qr_scan(scan_id: &str) -> bool {
    #[cfg(target_os = "android")]
    {
        return native::cancel_otp_qr_scan(scan_id);
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::cancel_otp_qr_scan(scan_id);
    }
}

pub fn autofill_bridge_available() -> bool {
    #[cfg(target_os = "android")]
    {
        return current_device_api_level().is_some_and(|api_level| {
            api_level >= provider_status::ANDROID_CREDENTIAL_PROVIDER_MIN_API
        }) && runtime::runtime_ready();
    }

    #[cfg(test)]
    {
        return true;
    }

    #[cfg(not(any(target_os = "android", test)))]
    {
        false
    }
}

pub fn current_device_api_level() -> Option<u64> {
    #[cfg(target_os = "android")]
    {
        return native::current_device_api_level();
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::current_device_api_level();
    }
}

pub fn gallery_save_supported() -> bool {
    current_device_api_level().is_some_and(|api_level| api_level >= 29)
}

pub fn notify_password_save_review_result(token: Option<&str>, outcome: &str, finished: bool) {
    #[cfg(target_os = "android")]
    {
        native::notify_password_save_review_result(token, outcome, finished);
        return;
    }

    #[cfg(not(target_os = "android"))]
    {
        native_stub::notify_password_save_review_result(token, outcome, finished);
    }
}

pub fn autofill_provider_selected() -> Result<bool, String> {
    #[cfg(target_os = "android")]
    {
        return native::autofill_provider_selected();
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::autofill_provider_selected();
    }
}

pub fn open_autofill_provider_settings() -> Result<bool, String> {
    #[cfg(target_os = "android")]
    {
        return native::open_autofill_provider_settings();
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::open_autofill_provider_settings();
    }
}

pub fn convert_image_preview(
    bytes: &[u8],
    tier: crate::image_preview::ImageDerivativeTier,
) -> Result<crate::image_preview::PreviewImageOutput, String> {
    #[cfg(target_os = "android")]
    {
        return native::convert_image_preview(bytes, tier);
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::convert_image_preview(bytes, tier);
    }
}

pub fn extract_image_metadata_json(bytes: &[u8]) -> Result<Option<String>, String> {
    #[cfg(target_os = "android")]
    {
        return native::extract_image_metadata_json(bytes);
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::extract_image_metadata_json(bytes);
    }
}

pub fn save_image_to_gallery(
    bytes: &[u8],
    file_name: &str,
    mime_type: Option<&str>,
) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        return native::save_image_to_gallery(bytes, file_name, mime_type);
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::save_image_to_gallery(bytes, file_name, mime_type);
    }
}

pub fn open_file_with_system(
    path: &std::path::Path,
    mime_type: Option<&str>,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return native::open_file_with_system(path, mime_type);
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::open_file_with_system(path, mime_type);
    }
}

pub fn open_url_with_system(url: &str) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return native::open_url_with_system(url);
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::open_url_with_system(url);
    }
}

pub fn share_files_with_system(items: &[(&std::path::Path, Option<&str>)]) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return native::share_files_with_system(items);
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::share_files_with_system(items);
    }
}

#[cfg(target_os = "android")]
pub(crate) fn pick_saf_backup_tree(
    runtime: &AndroidSafPickerRuntimeState,
    operation_id: &str,
) -> Result<AndroidSafTree, String> {
    native::pick_saf_backup_tree(runtime, operation_id)
}

#[cfg(target_os = "android")]
pub(crate) fn pick_saf_restore_tree(
    runtime: &AndroidSafPickerRuntimeState,
    operation_id: &str,
) -> Result<AndroidSafTree, String> {
    native::pick_saf_restore_tree(runtime, operation_id)
}

#[cfg(target_os = "android")]
pub(crate) async fn pick_saf_restore_tree_async(
    runtime: &AndroidSafPickerRuntimeState,
    operation_id: &str,
) -> Result<AndroidSafTree, String> {
    native::pick_saf_restore_tree_async(runtime, operation_id).await
}

#[cfg(target_os = "android")]
pub(crate) fn saf_create_directory(parent_uri: &str, name: &str) -> Result<String, String> {
    native::saf_create_directory(parent_uri, name)
}

#[cfg(target_os = "android")]
pub(crate) fn saf_write_file(parent_uri: &str, name: &str, bytes: &[u8]) -> Result<String, String> {
    native::saf_write_file(parent_uri, name, bytes)
}

#[cfg(target_os = "android")]
pub(crate) fn saf_write_stream_file(
    parent_uri: &str,
    name: &str,
    reader: &mut dyn std::io::Read,
    cancel_requested: &std::sync::atomic::AtomicBool,
    on_progress: &mut dyn FnMut(u64),
) -> Result<u64, String> {
    native::saf_write_stream_file(parent_uri, name, reader, cancel_requested, on_progress)
}

#[cfg(target_os = "android")]
pub(crate) fn saf_delete_document(uri: &str) -> Result<(), String> {
    native::saf_delete_document(uri)
}

#[cfg(target_os = "android")]
pub(crate) fn saf_read_named_file(parent_uri: &str, name: &str) -> Result<Option<Vec<u8>>, String> {
    native::saf_read_named_file(parent_uri, name)
}

#[cfg(target_os = "android")]
pub(crate) fn saf_open_read_named_file_stream(
    parent_uri: &str,
    name: &str,
) -> Result<Box<dyn std::io::Read + Send>, String> {
    native::saf_open_read_named_file_stream(parent_uri, name)
}
