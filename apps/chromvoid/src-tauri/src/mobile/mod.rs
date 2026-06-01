pub mod android;

#[cfg_attr(target_os = "android", allow(dead_code))]
pub mod ios;

use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BiometricAuthErrorKind {
    Unavailable,
    Denied,
    Cancelled,
    Internal,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BiometricAuthError {
    kind: BiometricAuthErrorKind,
    message: String,
}

impl BiometricAuthError {
    pub fn unavailable(message: impl Into<String>) -> Self {
        Self {
            kind: BiometricAuthErrorKind::Unavailable,
            message: message.into(),
        }
    }

    pub fn denied(message: impl Into<String>) -> Self {
        Self {
            kind: BiometricAuthErrorKind::Denied,
            message: message.into(),
        }
    }

    pub fn cancelled(message: impl Into<String>) -> Self {
        Self {
            kind: BiometricAuthErrorKind::Cancelled,
            message: message.into(),
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self {
            kind: BiometricAuthErrorKind::Internal,
            message: message.into(),
        }
    }

    pub fn code(&self) -> &'static str {
        match self.kind {
            BiometricAuthErrorKind::Unavailable => "BIOMETRIC_UNAVAILABLE",
            BiometricAuthErrorKind::Denied => "BIOMETRIC_DENIED",
            BiometricAuthErrorKind::Cancelled => "BIOMETRIC_CANCELLED",
            BiometricAuthErrorKind::Internal => "BIOMETRIC_INTERNAL",
        }
    }

    pub fn into_message(self) -> String {
        self.message
    }
}

impl fmt::Display for BiometricAuthError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for BiometricAuthError {}

#[cfg(any(test, debug_assertions))]
#[derive(Debug, Clone)]
pub struct TestBiometricOverride {
    pub available: Option<bool>,
    pub auth_result: Option<Result<(), BiometricAuthError>>,
}

#[cfg(any(test, debug_assertions))]
static TEST_BIOMETRIC_OVERRIDE: std::sync::Mutex<Option<TestBiometricOverride>> =
    std::sync::Mutex::new(None);

#[cfg(any(test, debug_assertions))]
pub fn set_test_biometric_override(override_data: Option<TestBiometricOverride>) {
    if let Ok(mut slot) = TEST_BIOMETRIC_OVERRIDE.lock() {
        *slot = override_data;
    }
}

#[cfg(any(test, debug_assertions))]
fn get_test_biometric_override() -> Option<TestBiometricOverride> {
    TEST_BIOMETRIC_OVERRIDE
        .lock()
        .ok()
        .and_then(|guard| guard.clone())
}

#[cfg(any(test, debug_assertions))]
pub fn authenticate_with_biometric_for_tests(reason: &str) -> Result<(), BiometricAuthError> {
    if let Some(override_data) = get_test_biometric_override() {
        if let Some(result) = override_data.auth_result {
            return result;
        }
    }

    let _ = reason;
    Err(BiometricAuthError::unavailable(
        "Biometric auth test override is not configured",
    ))
}

#[cfg(not(target_os = "android"))]
pub async fn authenticate_with_biometric(reason: &str) -> Result<(), BiometricAuthError> {
    #[cfg(any(test, debug_assertions))]
    if let Some(override_data) = get_test_biometric_override() {
        if let Some(result) = override_data.auth_result {
            return result;
        }
    }

    #[cfg(any(target_os = "ios", target_os = "macos"))]
    {
        return ios::authenticate_with_biometric(reason);
    }

    #[cfg(not(any(target_os = "ios", target_os = "macos", target_os = "android")))]
    {
        let _ = reason;
        Err(BiometricAuthError::unavailable(
            "Biometric auth requires iOS, macOS, or Android",
        ))
    }
}

pub fn biometric_bridge_available() -> bool {
    #[cfg(any(test, debug_assertions))]
    if let Some(override_data) = get_test_biometric_override() {
        if let Some(available) = override_data.available {
            return available;
        }
    }

    #[cfg(any(target_os = "ios", target_os = "macos"))]
    {
        return ios::biometric_bridge_available();
    }

    #[cfg(target_os = "android")]
    {
        return android::biometric_bridge_available();
    }

    #[cfg(not(any(target_os = "ios", target_os = "macos", target_os = "android")))]
    {
        false
    }
}

pub fn autofill_bridge_available() -> bool {
    #[cfg(target_os = "android")]
    {
        return android::autofill_bridge_available();
    }

    #[cfg(not(target_os = "android"))]
    {
        false
    }
}

pub fn autofill_extension_ready() -> bool {
    #[cfg(any(target_os = "ios", target_os = "macos"))]
    {
        return ios::autofill_extension_ready();
    }

    #[cfg(not(any(target_os = "ios", target_os = "macos")))]
    {
        false
    }
}

pub fn credential_provider_passkeys_lite_supported() -> bool {
    #[cfg(target_os = "android")]
    {
        return true;
    }

    #[cfg(target_os = "ios")]
    {
        return ios::native_bridge::passkeys_lite_supported();
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        false
    }
}

pub fn gallery_save_supported() -> bool {
    #[cfg(target_os = "android")]
    {
        return android::gallery_save_supported();
    }

    #[cfg(target_os = "ios")]
    {
        return ios::native_bridge::gallery_save_supported();
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        false
    }
}

pub fn save_image_to_gallery(
    bytes: &[u8],
    file_name: &str,
    mime_type: Option<&str>,
) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        return android::save_image_to_gallery(bytes, file_name, mime_type);
    }

    #[cfg(target_os = "ios")]
    {
        return ios::native_bridge::save_image_to_gallery(bytes, file_name, mime_type);
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let _ = (bytes, file_name, mime_type);
        Err("Saving images to gallery is not supported on this platform".to_string())
    }
}

pub fn open_file_with_system(
    path: &std::path::Path,
    mime_type: Option<&str>,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return android::open_file_with_system(path, mime_type);
    }

    #[cfg(target_os = "ios")]
    {
        return ios::native_bridge::open_file_with_system(path, mime_type);
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let _ = (path, mime_type);
        Err("Opening files externally is not supported on this platform".to_string())
    }
}

pub fn open_url_with_system(url: &str) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return android::open_url_with_system(url);
    }

    #[cfg(not(target_os = "android"))]
    {
        let _ = url;
        Err("Opening URLs externally is not supported on this platform".to_string())
    }
}

pub fn share_files_with_system(items: &[(&std::path::Path, Option<&str>)]) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return android::share_files_with_system(items);
    }

    #[cfg(target_os = "ios")]
    {
        return ios::native_bridge::share_files_with_system(items);
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let _ = items;
        Err("Sharing files externally is not supported on this platform".to_string())
    }
}
