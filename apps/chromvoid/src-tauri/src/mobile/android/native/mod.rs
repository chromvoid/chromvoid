mod audio_playback;
mod biometric;
mod gallery_save;
mod image_metadata;
mod jni;
mod media_session;
mod native_upload;
mod open_external;
mod otp_qr_scan;
mod password_save;
mod preview_image;
mod provider;
mod quick_lock;
mod saf_backup;
mod service;
mod share_external;
mod video_playback;

use crate::mobile::BiometricAuthError;

pub async fn authenticate_with_biometric(
    runtime: &super::AndroidBiometricRuntimeState,
    reason: &str,
) -> Result<(), BiometricAuthError> {
    biometric::authenticate_with_biometric(runtime, reason).await
}

pub fn biometric_bridge_available() -> bool {
    biometric::biometric_bridge_available()
}

pub fn current_device_api_level() -> Option<u64> {
    jni::current_device_api_level()
}

pub fn start_connection_service(device_name: &str) -> bool {
    service::start_connection_service(device_name)
}

pub fn stop_connection_service() -> bool {
    service::stop_connection_service()
}

pub fn update_media_session(snapshot_json: &str) -> bool {
    media_session::update_media_session(snapshot_json)
}

pub fn stop_media_session() -> bool {
    media_session::stop_media_session()
}

pub fn sync_vault_quick_lock(
    unlocked: bool,
    notification_enabled: bool,
    quick_tile_enabled: bool,
) -> bool {
    quick_lock::sync_vault_quick_lock(unlocked, notification_enabled, quick_tile_enabled)
}

pub fn request_quick_lock_tile() -> i32 {
    quick_lock::request_quick_lock_tile()
}

pub fn start_video_playback(source_json: &str) -> bool {
    video_playback::start_video_playback(source_json)
}

pub fn stop_video_playback(token: &str) -> bool {
    video_playback::stop_video_playback(token)
}

pub fn send_audio_playback_command(command_json: &str) -> bool {
    audio_playback::send_audio_playback_command(command_json)
}

pub fn warmup_audio_playback_service() -> bool {
    audio_playback::warmup_audio_playback_service()
}

pub async fn upload_native_files(
    runtime: std::sync::Arc<super::AndroidNativeUploadRuntimeState>,
    app: tauri::AppHandle,
    adapter: std::sync::Arc<std::sync::Mutex<Box<dyn crate::CoreAdapter>>>,
    parent_path: String,
    upload_id: String,
    read_chunk_size: Option<u64>,
) -> Result<(), String> {
    native_upload::upload_native_files(
        runtime,
        app,
        adapter,
        parent_path,
        upload_id,
        read_chunk_size,
    )
    .await
}

pub async fn upload_android_shared_files(
    runtime: std::sync::Arc<super::AndroidNativeUploadRuntimeState>,
    app: tauri::AppHandle,
    adapter: std::sync::Arc<std::sync::Mutex<Box<dyn crate::CoreAdapter>>>,
    parent_path: String,
    upload_id: String,
    share_session_id: String,
    read_chunk_size: Option<u64>,
) -> Result<(), (String, String)> {
    native_upload::upload_android_shared_files(
        runtime,
        app,
        adapter,
        parent_path,
        upload_id,
        share_session_id,
        read_chunk_size,
    )
    .await
    .map_err(|error| error.into_rpc())
}

pub fn cancel_native_upload(
    runtime: &super::AndroidNativeUploadRuntimeState,
    upload_id: &str,
) -> bool {
    native_upload::cancel_native_upload(runtime, upload_id)
}

pub fn cancel_android_shared_files(share_session_id: &str) -> Result<(), (String, String)> {
    native_upload::cancel_android_shared_files(share_session_id).map_err(|error| error.into_rpc())
}

pub fn start_otp_qr_scan(app: tauri::AppHandle, scan_id: &str) -> Result<(), String> {
    otp_qr_scan::start_otp_qr_scan(app, scan_id)
}

pub fn cancel_otp_qr_scan(scan_id: &str) -> bool {
    otp_qr_scan::cancel_otp_qr_scan(scan_id)
}

pub fn autofill_provider_selected() -> Result<bool, String> {
    provider::autofill_provider_selected()
}

pub fn open_autofill_provider_settings() -> Result<bool, String> {
    provider::open_autofill_provider_settings()
}

pub fn notify_password_save_review_result(token: Option<&str>, outcome: &str, finished: bool) {
    password_save::notify_password_save_review_result(token, outcome, finished)
}

pub fn convert_image_preview(
    bytes: &[u8],
    tier: crate::image_preview::ImageDerivativeTier,
) -> Result<crate::image_preview::PreviewImageOutput, String> {
    preview_image::convert_image_preview(bytes, tier)
}

pub fn extract_image_metadata_json(bytes: &[u8]) -> Result<Option<String>, String> {
    image_metadata::extract_image_metadata_json(bytes)
}

pub fn save_image_to_gallery(
    bytes: &[u8],
    file_name: &str,
    mime_type: Option<&str>,
) -> Result<String, String> {
    gallery_save::save_image_to_gallery(bytes, file_name, mime_type)
}

pub fn open_file_with_system(
    path: &std::path::Path,
    mime_type: Option<&str>,
) -> Result<(), String> {
    open_external::open_file_with_system(path, mime_type)
}

pub fn open_url_with_system(url: &str) -> Result<(), String> {
    open_external::open_url_with_system(url)
}

pub fn share_files_with_system(items: &[(&std::path::Path, Option<&str>)]) -> Result<(), String> {
    share_external::share_files_with_system(items)
}

pub fn pick_saf_backup_tree(
    runtime: &super::AndroidSafPickerRuntimeState,
    operation_id: &str,
) -> Result<super::AndroidSafTree, String> {
    saf_backup::pick_backup_tree(runtime, operation_id)
}

pub fn pick_saf_restore_tree(
    runtime: &super::AndroidSafPickerRuntimeState,
    operation_id: &str,
) -> Result<super::AndroidSafTree, String> {
    saf_backup::pick_restore_tree(runtime, operation_id)
}

pub async fn pick_saf_restore_tree_async(
    runtime: &super::AndroidSafPickerRuntimeState,
    operation_id: &str,
) -> Result<super::AndroidSafTree, String> {
    saf_backup::pick_restore_tree_async(runtime, operation_id).await
}

pub fn saf_create_directory(parent_uri: &str, name: &str) -> Result<String, String> {
    saf_backup::create_directory(parent_uri, name)
}

pub fn saf_write_file(parent_uri: &str, name: &str, bytes: &[u8]) -> Result<String, String> {
    saf_backup::write_file(parent_uri, name, bytes)
}

pub fn saf_write_stream_file(
    parent_uri: &str,
    name: &str,
    reader: &mut dyn std::io::Read,
    cancel_requested: &std::sync::atomic::AtomicBool,
    on_progress: &mut dyn FnMut(u64),
) -> Result<u64, String> {
    saf_backup::write_stream_file(parent_uri, name, reader, cancel_requested, on_progress)
}

pub fn saf_delete_document(uri: &str) -> Result<(), String> {
    saf_backup::delete_document(uri)
}

pub fn saf_read_named_file(parent_uri: &str, name: &str) -> Result<Option<Vec<u8>>, String> {
    saf_backup::read_named_file(parent_uri, name)
}

pub fn saf_open_read_named_file_stream(
    parent_uri: &str,
    name: &str,
) -> Result<Box<dyn std::io::Read + Send>, String> {
    saf_backup::open_read_named_file_stream(parent_uri, name)
}
