//! Windows Virtual Volume Backend
//!
//! On Windows, we use WebDAV which integrates natively with Windows Explorer.
//! The WebDAV server runs locally and Windows mounts it as a network drive.
//! This provides a native filesystem experience without requiring WinFsp.
//!
//! Windows has excellent built-in WebDAV client support, making it the ideal
//! choice for virtual volume access on Windows without additional drivers.

use crate::core_adapter::CoreAdapter;
use crate::volume_webdav::WebDavServerHandle;
use std::sync::Arc;
use std::sync::Mutex;

/// Start the Windows volume (WebDAV-based).
///
/// Windows has excellent WebDAV client support built into Explorer.
/// Users can access the vault via the WebDAV URL directly, or we can
/// provide a helper to map it as a network drive.
#[cfg(target_os = "windows")]
pub async fn start_windows_volume(
    app: tauri::AppHandle,
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
) -> Result<WebDavServerHandle, String> {
    // Delegate to WebDAV implementation
    crate::volume_webdav::start_webdav_server(app, adapter).await
}

/// Check if Windows WebDAV client is available.
///
/// WebDAV client is built into Windows, so this always returns true.
#[cfg(target_os = "windows")]
pub fn is_webdav_client_available() -> bool {
    // WebDAV client is built into Windows
    true
}

#[cfg(not(target_os = "windows"))]
compile_error!("This module is Windows-only");
