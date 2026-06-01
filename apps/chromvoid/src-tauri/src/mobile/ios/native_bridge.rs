use std::{
    collections::HashMap,
    ffi::{CStr, CString},
    os::raw::c_char,
    path::Path,
    ptr,
    sync::Mutex,
    time::Duration,
};

use serde::Serialize;
use serde_json::Value;
use tauri::Emitter;
use tokio::sync::oneshot;

use crate::media_source::{read_local_media_range, LocalMediaRangeError};
use crate::mobile::ios::runtime;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeShareFile {
    path: String,
    mime_type: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IosPickedRestoreSource {
    pub backup_path: String,
    pub display_name: String,
}

type RestorePickerResult = Result<IosPickedRestoreSource, String>;
type RestorePickerSender = oneshot::Sender<RestorePickerResult>;
type UploadPickerResult = Result<String, String>;
type UploadPickerSender = oneshot::Sender<UploadPickerResult>;

pub(crate) struct IosNativeBridgeRuntimeState {
    restore_pickers: Mutex<HashMap<String, RestorePickerSender>>,
    upload_pickers: Mutex<HashMap<String, UploadPickerSender>>,
}

impl IosNativeBridgeRuntimeState {
    pub(crate) fn new() -> Self {
        Self {
            restore_pickers: Mutex::new(HashMap::new()),
            upload_pickers: Mutex::new(HashMap::new()),
        }
    }

    fn register_upload_picker(
        &self,
        upload_id: &str,
        sender: UploadPickerSender,
    ) -> Result<(), String> {
        let mut pickers = self
            .upload_pickers
            .lock()
            .map_err(|_| "Upload picker registry is unavailable".to_string())?;
        if pickers.insert(upload_id.to_string(), sender).is_some() {
            return Err("Upload picker operation already exists".to_string());
        }
        Ok(())
    }

    fn remove_upload_picker(&self, upload_id: &str) -> Option<UploadPickerSender> {
        self.upload_pickers
            .lock()
            .ok()
            .and_then(|mut pickers| pickers.remove(upload_id))
    }

    fn register_restore_picker(
        &self,
        operation_id: &str,
        sender: RestorePickerSender,
    ) -> Result<(), String> {
        let mut pickers = self
            .restore_pickers
            .lock()
            .map_err(|_| "Restore picker registry is unavailable".to_string())?;
        if pickers.insert(operation_id.to_string(), sender).is_some() {
            return Err("Restore picker operation already exists".to_string());
        }
        Ok(())
    }

    fn remove_restore_picker(&self, operation_id: &str) -> Option<RestorePickerSender> {
        self.restore_pickers
            .lock()
            .ok()
            .and_then(|mut pickers| pickers.remove(operation_id))
    }
}

impl Default for IosNativeBridgeRuntimeState {
    fn default() -> Self {
        Self::new()
    }
}

const RESTORE_PICKER_TIMEOUT: Duration = Duration::from_secs(300);
const UPLOAD_PICKER_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OtpQrScanResultPayload {
    scan_id: String,
    status: String,
    value: Option<String>,
    message: Option<String>,
}

#[cfg(target_os = "ios")]
extern "C" {
    fn chromvoid_ios_native_open_file(path: *const c_char, mime_type: *const c_char) -> i32;
    fn chromvoid_ios_native_share_files(payload_json: *const c_char) -> i32;
    fn chromvoid_ios_native_open_app_settings() -> i32;
    fn chromvoid_ios_native_export_backup_path(path: *const c_char) -> i32;
    fn chromvoid_ios_native_pick_upload_files(upload_id: *const c_char) -> i32;
    fn chromvoid_ios_native_pick_restore_source(operation_id: *const c_char) -> i32;
    fn chromvoid_ios_native_otp_qr_scan_start(scan_id: *const c_char) -> i32;
    fn chromvoid_ios_native_otp_qr_scan_cancel(scan_id: *const c_char) -> i32;
    fn chromvoid_ios_native_audio_command(command_json: *const c_char) -> i32;
    fn chromvoid_ios_native_video_start(source_json: *const c_char) -> i32;
    fn chromvoid_ios_native_video_stop(token: *const c_char) -> i32;
    fn chromvoid_ios_native_passkeys_lite_available() -> i32;
    fn chromvoid_ios_native_release_lifecycle_sessions(reason: *const c_char) -> i32;
    fn chromvoid_ios_native_save_image_to_photos(
        bytes: *const u8,
        byte_count: isize,
        file_name: *const c_char,
        mime_type: *const c_char,
    ) -> i32;
}

pub fn native_bridge_available() -> bool {
    cfg!(target_os = "ios")
}

pub fn passkeys_lite_supported() -> bool {
    #[cfg(target_os = "ios")]
    {
        unsafe { chromvoid_ios_native_passkeys_lite_available() != 0 }
    }

    #[cfg(not(target_os = "ios"))]
    {
        false
    }
}

pub fn gallery_save_supported() -> bool {
    native_bridge_available()
}

pub fn save_image_to_gallery(
    bytes: &[u8],
    file_name: &str,
    mime_type: Option<&str>,
) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("Image payload is empty".to_string());
    }

    let file_name = c_string_arg(file_name, "file name")?;
    let mime_type = optional_c_string_arg(mime_type, "MIME type")?;

    #[cfg(target_os = "ios")]
    {
        let ok = unsafe {
            chromvoid_ios_native_save_image_to_photos(
                bytes.as_ptr(),
                bytes.len() as isize,
                file_name.as_ptr(),
                c_ptr(mime_type.as_ref()),
            )
        };

        if ok == 0 {
            return Err("iOS photo library save failed".to_string());
        }

        return Ok("photos://library".to_string());
    }

    #[cfg(not(target_os = "ios"))]
    {
        let _ = (file_name, mime_type);
        Err("Saving images to gallery requires iOS".to_string())
    }
}

pub fn open_file_with_system(path: &Path, mime_type: Option<&str>) -> Result<(), String> {
    let path = path_arg(path)?;
    let mime_type = optional_c_string_arg(mime_type, "MIME type")?;

    #[cfg(target_os = "ios")]
    {
        let ok =
            unsafe { chromvoid_ios_native_open_file(path.as_ptr(), c_ptr(mime_type.as_ref())) };
        if ok == 0 {
            return Err("iOS open-in handoff failed".to_string());
        }
        return Ok(());
    }

    #[cfg(not(target_os = "ios"))]
    {
        let _ = (path, mime_type);
        Err("Opening files externally requires iOS".to_string())
    }
}

pub fn share_files_with_system(items: &[(&Path, Option<&str>)]) -> Result<(), String> {
    if items.is_empty() {
        return Err("No files provided for sharing".to_string());
    }

    let mut share_files = Vec::with_capacity(items.len());
    for (path, mime_type) in items {
        let path_string = path_to_string(path)?;
        reject_nul(&path_string, "path")?;
        reject_optional_nul(*mime_type, "MIME type")?;
        share_files.push(NativeShareFile {
            path: path_string,
            mime_type: mime_type
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string),
        });
    }

    let payload_json = serde_json::to_string(&share_files)
        .map_err(|_| "Failed to encode native share payload".to_string())?;
    let payload_json = c_string_arg(&payload_json, "share payload")?;

    #[cfg(target_os = "ios")]
    {
        let ok = unsafe { chromvoid_ios_native_share_files(payload_json.as_ptr()) };
        if ok == 0 {
            return Err("iOS share sheet handoff failed".to_string());
        }
        return Ok(());
    }

    #[cfg(not(target_os = "ios"))]
    {
        let _ = payload_json;
        Err("Sharing files externally requires iOS".to_string())
    }
}

pub fn open_app_settings() -> Result<(), String> {
    #[cfg(target_os = "ios")]
    {
        let ok = unsafe { chromvoid_ios_native_open_app_settings() };
        if ok == 0 {
            return Err("iOS app settings handoff failed".to_string());
        }
        return Ok(());
    }

    #[cfg(not(target_os = "ios"))]
    {
        Err("Opening app settings requires iOS".to_string())
    }
}

pub fn export_backup_with_files_picker(path: &Path) -> Result<(), String> {
    let path = path_arg(path)?;

    #[cfg(target_os = "ios")]
    {
        let ok = unsafe { chromvoid_ios_native_export_backup_path(path.as_ptr()) };
        if ok == 0 {
            return Err("iOS backup export handoff failed".to_string());
        }
        return Ok(());
    }

    #[cfg(not(target_os = "ios"))]
    {
        let _ = path;
        Err("Backup export requires iOS".to_string())
    }
}

pub async fn pick_upload_files(
    runtime: &IosNativeBridgeRuntimeState,
    upload_id: &str,
) -> Result<String, String> {
    let upload_id_c = c_string_arg(upload_id, "upload id")?;

    let (tx, rx) = oneshot::channel();
    runtime.register_upload_picker(upload_id, tx)?;

    #[cfg(target_os = "ios")]
    {
        let ok = unsafe { chromvoid_ios_native_pick_upload_files(upload_id_c.as_ptr()) };
        if ok == 0 {
            runtime.remove_upload_picker(upload_id);
            return Err("iOS upload picker handoff failed".to_string());
        }
    }

    #[cfg(not(target_os = "ios"))]
    {
        runtime.remove_upload_picker(upload_id);
        let _ = (upload_id_c, rx);
        Err("Upload file picker requires iOS".to_string())
    }

    #[cfg(target_os = "ios")]
    {
        match tokio::time::timeout(UPLOAD_PICKER_TIMEOUT, rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("iOS upload picker completed without a result".to_string()),
            Err(_) => {
                runtime.remove_upload_picker(upload_id);
                Err("iOS upload picker timed out".to_string())
            }
        }
    }
}

pub async fn pick_restore_source(
    runtime: &IosNativeBridgeRuntimeState,
    operation_id: &str,
) -> Result<IosPickedRestoreSource, String> {
    let operation_id_c = c_string_arg(operation_id, "operation id")?;

    let (tx, rx) = oneshot::channel();
    runtime.register_restore_picker(operation_id, tx)?;

    #[cfg(target_os = "ios")]
    {
        let ok = unsafe { chromvoid_ios_native_pick_restore_source(operation_id_c.as_ptr()) };
        if ok == 0 {
            runtime.remove_restore_picker(operation_id);
            return Err("iOS restore source picker handoff failed".to_string());
        }
    }

    #[cfg(not(target_os = "ios"))]
    {
        runtime.remove_restore_picker(operation_id);
        let _ = (operation_id_c, rx);
        Err("Restore source picker requires iOS".to_string())
    }

    #[cfg(target_os = "ios")]
    {
        match tokio::time::timeout(RESTORE_PICKER_TIMEOUT, rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("iOS restore source picker completed without a result".to_string()),
            Err(_) => {
                runtime.remove_restore_picker(operation_id);
                Err("iOS restore source picker timed out".to_string())
            }
        }
    }
}

pub fn start_otp_qr_scan(_app: tauri::AppHandle, scan_id: &str) -> Result<(), String> {
    if scan_id.trim().is_empty() {
        return Err("OTP QR scan id is invalid".to_string());
    }
    let scan_id = c_string_arg(scan_id, "scan id")?;

    #[cfg(target_os = "ios")]
    {
        match unsafe { chromvoid_ios_native_otp_qr_scan_start(scan_id.as_ptr()) } {
            0 => Ok(()),
            1 => Err("OTP QR scan id is invalid".to_string()),
            2 => Err("OTP QR scanner is already running".to_string()),
            3 => Err("OTP QR scanner failed to launch".to_string()),
            code => Err(format!("OTP QR scanner failed to launch ({code})")),
        }
    }

    #[cfg(not(target_os = "ios"))]
    {
        let _ = scan_id;
        Err("OTP QR scanner requires iOS".to_string())
    }
}

pub fn cancel_otp_qr_scan(scan_id: &str) -> bool {
    let Ok(scan_id) = c_string_arg(scan_id, "scan id") else {
        return false;
    };

    #[cfg(target_os = "ios")]
    {
        unsafe { chromvoid_ios_native_otp_qr_scan_cancel(scan_id.as_ptr()) != 0 }
    }

    #[cfg(not(target_os = "ios"))]
    {
        let _ = scan_id;
        false
    }
}

pub fn send_audio_playback_command(_app: tauri::AppHandle, command_json: &str) -> bool {
    let Ok(command_json) = c_string_arg(command_json, "native audio command") else {
        return false;
    };

    #[cfg(target_os = "ios")]
    {
        unsafe { chromvoid_ios_native_audio_command(command_json.as_ptr()) != 0 }
    }

    #[cfg(not(target_os = "ios"))]
    {
        let _ = command_json;
        false
    }
}

pub fn start_video_playback(source_json: &str) -> bool {
    let Ok(source_json) = c_string_arg(source_json, "native video source") else {
        return false;
    };

    #[cfg(target_os = "ios")]
    {
        unsafe { chromvoid_ios_native_video_start(source_json.as_ptr()) != 0 }
    }

    #[cfg(not(target_os = "ios"))]
    {
        let _ = source_json;
        false
    }
}

pub fn stop_video_playback(token: &str) -> bool {
    let Ok(token) = c_string_arg(token, "native video token") else {
        return false;
    };

    #[cfg(target_os = "ios")]
    {
        unsafe { chromvoid_ios_native_video_stop(token.as_ptr()) != 0 }
    }

    #[cfg(not(target_os = "ios"))]
    {
        let _ = token;
        false
    }
}

pub fn release_lifecycle_sessions(_app: tauri::AppHandle, reason: &str) -> bool {
    let Ok(reason) = c_string_arg(reason, "lifecycle release reason") else {
        return false;
    };

    #[cfg(target_os = "ios")]
    {
        unsafe { chromvoid_ios_native_release_lifecycle_sessions(reason.as_ptr()) != 0 }
    }

    #[cfg(not(target_os = "ios"))]
    {
        let _ = reason;
        false
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn chromvoid_ios_native_upload_picker_result(
    upload_id: *const c_char,
    session_id: *const c_char,
    status: i32,
    error_message: *const c_char,
) {
    let Some(upload_id) = read_c_string(upload_id) else {
        return;
    };

    let result = match status {
        0 => read_c_string(session_id)
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| "iOS upload picker returned invalid session".to_string()),
        1 => Err("Native upload cancelled".to_string()),
        _ => Err(read_c_string(error_message)
            .filter(|message| !message.trim().is_empty())
            .unwrap_or_else(|| "iOS upload picker failed".to_string())),
    };

    let Some(bridge_runtime) = runtime::app_ios_native_bridge_runtime() else {
        tracing::warn!("ios native upload picker result ignored: runtime unavailable");
        return;
    };
    if let Some(sender) = bridge_runtime.remove_upload_picker(&upload_id) {
        let _ = sender.send(result);
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn chromvoid_ios_native_otp_qr_scan_result(
    scan_id: *const c_char,
    status: *const c_char,
    value: *const c_char,
    message: *const c_char,
) -> i32 {
    let Some(scan_id) = read_c_string(scan_id) else {
        return 0;
    };
    if scan_id.trim().is_empty() {
        return 0;
    }

    let status = read_c_string(status)
        .filter(|status| !status.trim().is_empty())
        .unwrap_or_else(|| "invalid".to_string());
    let payload = OtpQrScanResultPayload {
        scan_id,
        status,
        value: read_optional_json_string(value),
        message: read_optional_json_string(message),
    };

    emit_otp_qr_result(payload) as i32
}

#[unsafe(no_mangle)]
pub extern "C" fn chromvoid_ios_native_restore_source_result(
    operation_id: *const c_char,
    backup_path: *const c_char,
    display_name: *const c_char,
    status: i32,
    error_message: *const c_char,
) {
    let Some(operation_id) = read_c_string(operation_id) else {
        return;
    };

    let result = match status {
        0 => match (read_c_string(backup_path), read_c_string(display_name)) {
            (Some(backup_path), Some(display_name)) => Ok(IosPickedRestoreSource {
                backup_path,
                display_name,
            }),
            _ => Err("iOS restore source picker returned invalid source".to_string()),
        },
        1 => Err("Restore source selection cancelled".to_string()),
        _ => Err(read_c_string(error_message)
            .filter(|message| !message.trim().is_empty())
            .unwrap_or_else(|| "iOS restore source picker failed".to_string())),
    };

    let Some(bridge_runtime) = runtime::app_ios_native_bridge_runtime() else {
        tracing::warn!("ios restore source picker result ignored: runtime unavailable");
        return;
    };
    if let Some(sender) = bridge_runtime.remove_restore_picker(&operation_id) {
        let _ = sender.send(result);
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn chromvoid_ios_native_audio_read_source(
    token: *const c_char,
    offset: u64,
    length: u64,
    out_len: *mut usize,
    out_error_code: *mut *mut c_char,
) -> *mut u8 {
    set_out_len(out_len, 0);
    set_out_error_code(out_error_code, ptr::null_mut());

    let Some(token) = read_c_string(token) else {
        set_audio_error(out_error_code, "ERR_NATIVE_AUDIO_RANGE_INVALID");
        return ptr::null_mut();
    };
    if token.trim().is_empty() || length == 0 {
        set_audio_error(out_error_code, "ERR_NATIVE_AUDIO_RANGE_INVALID");
        return ptr::null_mut();
    }

    match read_native_audio_source(&token, offset, length) {
        Ok(bytes) if !bytes.is_empty() => {
            let mut bytes = bytes.into_boxed_slice();
            let len = bytes.len();
            let ptr = bytes.as_mut_ptr();
            std::mem::forget(bytes);
            set_out_len(out_len, len);
            ptr
        }
        Ok(_) => {
            set_out_len(out_len, 0);
            ptr::null_mut()
        }
        Err(code) => {
            set_audio_error(out_error_code, code);
            ptr::null_mut()
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn chromvoid_ios_native_audio_free_bytes(bytes: *mut u8, len: usize) {
    if bytes.is_null() || len == 0 {
        return;
    }
    // SAFETY: Pointers returned by chromvoid_ios_native_audio_read_source are allocated from a
    // boxed slice with exactly this length and are freed once by the Swift bridge.
    unsafe {
        let _ = Vec::from_raw_parts(bytes, len, len);
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn chromvoid_ios_native_audio_free_string(value: *mut c_char) {
    if value.is_null() {
        return;
    }
    // SAFETY: Error strings are created with CString::into_raw in set_audio_error.
    unsafe {
        let _ = CString::from_raw(value);
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn chromvoid_ios_native_audio_player_event(event_json: *const c_char) -> i32 {
    let Some(event_json) = read_c_string(event_json) else {
        return 0;
    };

    let Ok(mut payload) = serde_json::from_str::<Value>(&event_json) else {
        return 0;
    };
    redact_source_tokens(&mut payload);

    emit_native_audio_event(payload) as i32
}

fn emit_otp_qr_result(payload: OtpQrScanResultPayload) -> bool {
    let Some(app) = runtime::app_handle() else {
        return false;
    };
    app.emit("otp:qr-scan-result", payload).is_ok()
}

fn emit_native_audio_event(payload: Value) -> bool {
    let Some(app) = runtime::app_handle() else {
        return false;
    };
    app.emit("native-audio-player:event", payload).is_ok()
}

fn read_native_audio_source(
    token: &str,
    offset: u64,
    length: u64,
) -> Result<Vec<u8>, &'static str> {
    runtime::with_app_state(|state| {
        let session = state
            .media_streams
            .get(token)
            .ok_or("ERR_NATIVE_AUDIO_SOURCE_STALE")?;
        let Some(_lease) = state
            .media_streams
            .begin_request(&session.token, session.generation)
        else {
            return Err("ERR_NATIVE_AUDIO_SOURCE_STALE");
        };
        let Ok(_read_lock) = session.read_lock.lock() else {
            return Err("ERR_NATIVE_AUDIO_SOURCE_READ");
        };
        if !state
            .media_streams
            .is_current(&session.token, session.generation)
        {
            return Err("ERR_NATIVE_AUDIO_SOURCE_STALE");
        }

        let bytes = read_local_media_range(&state.adapter, &session, offset, length)
            .map_err(map_audio_range_error)?;
        if !state
            .media_streams
            .is_current(&session.token, session.generation)
        {
            return Err("ERR_NATIVE_AUDIO_SOURCE_STALE");
        }
        state
            .media_streams
            .refresh(&session.token, session.generation);

        Ok(bytes)
    })
    .ok_or("ERR_NATIVE_AUDIO_SOURCE_READ")?
}

fn map_audio_range_error(error: LocalMediaRangeError) -> &'static str {
    match error {
        LocalMediaRangeError::RangeInvalid => "ERR_NATIVE_AUDIO_RANGE_INVALID",
        LocalMediaRangeError::StreamLocked => "ERR_NATIVE_AUDIO_VAULT_LOCKED",
        LocalMediaRangeError::StreamStale | LocalMediaRangeError::StreamNotFound => {
            "ERR_NATIVE_AUDIO_SOURCE_STALE"
        }
        LocalMediaRangeError::SourceLoadFailed | LocalMediaRangeError::RangeReadFailed => {
            "ERR_NATIVE_AUDIO_SOURCE_READ"
        }
    }
}

fn set_out_len(out_len: *mut usize, len: usize) {
    if out_len.is_null() {
        return;
    }
    // SAFETY: Swift passes a valid pointer for the synchronous call or null when it does not need it.
    unsafe {
        *out_len = len;
    }
}

fn set_out_error_code(out_error_code: *mut *mut c_char, error_code: *mut c_char) {
    if out_error_code.is_null() {
        return;
    }
    // SAFETY: Swift passes a valid pointer for the synchronous call or null when it does not need it.
    unsafe {
        *out_error_code = error_code;
    }
}

fn set_audio_error(out_error_code: *mut *mut c_char, code: &'static str) {
    let error = CString::new(code)
        .map(CString::into_raw)
        .unwrap_or(ptr::null_mut());
    set_out_error_code(out_error_code, error);
}

fn redact_source_tokens(value: &mut Value) {
    match value {
        Value::Object(map) => {
            map.remove("sourceToken");
            map.remove("token");
            for child in map.values_mut() {
                redact_source_tokens(child);
            }
        }
        Value::Array(values) => {
            for child in values {
                redact_source_tokens(child);
            }
        }
        _ => {}
    }
}

fn path_arg(path: &Path) -> Result<CString, String> {
    c_string_arg(&path_to_string(path)?, "path")
}

fn path_to_string(path: &Path) -> Result<String, String> {
    path.to_str()
        .map(str::to_string)
        .ok_or_else(|| "Path is not valid UTF-8".to_string())
}

fn optional_c_string_arg(value: Option<&str>, name: &str) -> Result<Option<CString>, String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| c_string_arg(value, name))
        .transpose()
}

fn c_string_arg(value: &str, name: &str) -> Result<CString, String> {
    reject_nul(value, name)?;
    CString::new(value).map_err(|_| format!("Invalid {name}"))
}

fn reject_optional_nul(value: Option<&str>, name: &str) -> Result<(), String> {
    if let Some(value) = value {
        reject_nul(value, name)?;
    }
    Ok(())
}

fn reject_nul(value: &str, name: &str) -> Result<(), String> {
    if value.as_bytes().contains(&0) {
        return Err(format!("Invalid {name}"));
    }
    Ok(())
}

fn c_ptr(value: Option<&CString>) -> *const c_char {
    value.map(|value| value.as_ptr()).unwrap_or(ptr::null())
}

fn read_c_string(ptr: *const c_char) -> Option<String> {
    if ptr.is_null() {
        return None;
    }
    // SAFETY: Swift bridge passes null-terminated strings that remain valid for this synchronous callback.
    let value = unsafe { CStr::from_ptr(ptr) };
    value.to_str().ok().map(str::to_string)
}

fn read_optional_json_string(ptr: *const c_char) -> Option<String> {
    read_c_string(ptr).filter(|value| !value.trim().is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_nul_in_file_name() {
        let error = save_image_to_gallery(&[1], "bad\0name.png", Some("image/png"))
            .expect_err("nul byte should be rejected before native handoff");

        assert_eq!(error, "Invalid file name");
    }

    #[test]
    fn encodes_share_payload_without_mime_when_empty() {
        let path = std::path::Path::new("/tmp/share.txt");
        let mut share_files = Vec::new();

        let path_string = path_to_string(path).expect("path string");
        share_files.push(NativeShareFile {
            path: path_string,
            mime_type: Some("  ")
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string),
        });

        let payload = serde_json::to_string(&share_files).expect("payload");
        assert_eq!(payload, r#"[{"path":"/tmp/share.txt","mimeType":null}]"#);
    }

    #[test]
    fn restore_picker_runtime_resolves_registered_operation() {
        let runtime = IosNativeBridgeRuntimeState::new();
        let (tx, rx) = oneshot::channel();
        runtime
            .register_restore_picker("restore-test", tx)
            .expect("registered");

        let sender = runtime
            .remove_restore_picker("restore-test")
            .expect("pending sender");
        sender
            .send(Ok(IosPickedRestoreSource {
                backup_path: "/tmp/chromvoid-staged-backup".to_string(),
                display_name: "ChromVoid Backup".to_string(),
            }))
            .expect("send result");

        let selected = rx.blocking_recv().expect("result").expect("selected");
        assert_eq!(selected.backup_path, "/tmp/chromvoid-staged-backup");
        assert_eq!(selected.display_name, "ChromVoid Backup");
    }

    #[test]
    fn native_bridge_runtime_instances_do_not_share_pickers() {
        let first = IosNativeBridgeRuntimeState::new();
        let second = IosNativeBridgeRuntimeState::new();
        let (tx, _rx) = oneshot::channel();

        first
            .register_upload_picker("upload-1", tx)
            .expect("registered");

        assert!(second.remove_upload_picker("upload-1").is_none());
        assert!(first.remove_upload_picker("upload-1").is_some());
    }

    #[test]
    fn duplicate_native_bridge_picker_ids_are_rejected() {
        let runtime = IosNativeBridgeRuntimeState::new();
        let (first_tx, _first_rx) = oneshot::channel();
        let (second_tx, _second_rx) = oneshot::channel();

        runtime
            .register_restore_picker("restore-1", first_tx)
            .expect("first register");
        let error = runtime
            .register_restore_picker("restore-1", second_tx)
            .expect_err("duplicate should fail");

        assert_eq!(error, "Restore picker operation already exists");
    }

    #[test]
    fn otp_qr_result_uses_camel_case_scan_id() {
        let payload = OtpQrScanResultPayload {
            scan_id: "scan-1".to_string(),
            status: "success".to_string(),
            value: Some("otpauth://totp/Test?secret=ABC".to_string()),
            message: None,
        };

        let json = serde_json::to_value(payload).expect("json");
        assert_eq!(json["scanId"], "scan-1");
        assert!(json.get("scan_id").is_none());
    }

    #[test]
    fn native_audio_event_redacts_source_tokens() {
        let mut payload = serde_json::json!({
            "event": "state",
            "nativeSessionId": "native-1",
            "tracks": [{
                "trackId": 41,
                "sourceToken": "secret-token"
            }],
            "token": "another-secret"
        });

        redact_source_tokens(&mut payload);

        assert!(payload.get("token").is_none());
        assert!(payload["tracks"][0].get("sourceToken").is_none());
        assert_eq!(payload["tracks"][0]["trackId"], 41);
    }
}
