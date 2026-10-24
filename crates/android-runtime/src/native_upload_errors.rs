#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeShareUploadError {
    message: String,
    code: &'static str,
}

impl NativeShareUploadError {
    pub fn new(message: impl Into<String>, code: &'static str) -> Self {
        Self {
            message: message.into(),
            code,
        }
    }

    pub fn session_not_found() -> Self {
        Self::new(
            "Android share session not found",
            "ANDROID_SHARE_SESSION_NOT_FOUND",
        )
    }

    pub fn no_files() -> Self {
        Self::new("Android share contains no files", "ANDROID_SHARE_NO_FILES")
    }

    pub fn busy() -> Self {
        Self::new("Android share import is busy", "ANDROID_SHARE_IMPORT_BUSY")
    }

    pub fn native_upload(message: impl Into<String>) -> Self {
        Self::new(message, "NATIVE_UPLOAD")
    }

    pub fn unavailable(message: impl Into<String>) -> Self {
        Self::new(message, "NATIVE_UPLOAD_UNAVAILABLE")
    }

    pub fn from_upload_failure(message: String) -> Self {
        match native_upload_failure_code(&message) {
            Some(code) => Self::new(message, code),
            None => Self::native_upload(message),
        }
    }

    pub fn message(&self) -> &str {
        &self.message
    }

    pub fn into_rpc(self) -> (String, String) {
        (self.message, self.code.to_string())
    }
}

pub fn map_shared_start_code(code: i32) -> NativeShareUploadError {
    match code {
        1 => NativeShareUploadError::session_not_found(),
        2 => NativeShareUploadError::busy(),
        3 => NativeShareUploadError::no_files(),
        _ => NativeShareUploadError::native_upload(format!(
            "Android shared files upload failed to start ({code})"
        )),
    }
}

pub fn native_upload_failure_code(message: &str) -> Option<&'static str> {
    match message.trim() {
        "ANDROID_SHARE_PERMISSION_DENIED" => Some("ANDROID_SHARE_PERMISSION_DENIED"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_upload_android_shared_files_maps_missing_session_code() {
        let error = map_shared_start_code(1);
        assert_eq!(
            error.into_rpc(),
            (
                "Android share session not found".to_string(),
                "ANDROID_SHARE_SESSION_NOT_FOUND".to_string(),
            ),
        );
    }

    #[test]
    fn catalog_upload_android_shared_files_maps_no_files_code() {
        let error = map_shared_start_code(3);
        assert_eq!(
            error.into_rpc(),
            (
                "Android share contains no files".to_string(),
                "ANDROID_SHARE_NO_FILES".to_string(),
            ),
        );
    }

    #[test]
    fn catalog_upload_android_shared_files_maps_busy_code() {
        let error = map_shared_start_code(2);
        assert_eq!(
            error.into_rpc(),
            (
                "Android share import is busy".to_string(),
                "ANDROID_SHARE_IMPORT_BUSY".to_string(),
            ),
        );
    }

    #[test]
    fn catalog_upload_android_shared_files_maps_permission_denied_failure_code() {
        let error =
            NativeShareUploadError::from_upload_failure("ANDROID_SHARE_PERMISSION_DENIED".into());
        assert_eq!(
            error.into_rpc(),
            (
                "ANDROID_SHARE_PERMISSION_DENIED".to_string(),
                "ANDROID_SHARE_PERMISSION_DENIED".to_string(),
            ),
        );
    }

    #[test]
    fn catalog_cancel_android_shared_files_maps_missing_session_code() {
        let error = NativeShareUploadError::session_not_found();
        assert_eq!(
            error.into_rpc(),
            (
                "Android share session not found".to_string(),
                "ANDROID_SHARE_SESSION_NOT_FOUND".to_string(),
            ),
        );
    }
}
