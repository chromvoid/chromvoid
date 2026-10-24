//! Opens an http(s) URL in the system browser. UIKit requires the main thread, and
//! `openURL:options:completionHandler:` is the only form iOS 18 still honours.

#[cfg(target_os = "ios")]
mod native {
    use objc2_foundation::{MainThreadMarker, NSDictionary, NSString, NSURL};
    use objc2_ui_kit::UIApplication;
    use tracing::warn;

    pub fn open(app: &tauri::AppHandle, url: String) -> Result<(), String> {
        app.run_on_main_thread(move || {
            let Some(mtm) = MainThreadMarker::new() else {
                warn!("ios_external_url: scheduled block ran off the main thread");
                return;
            };
            let Some(url) = NSURL::URLWithString(&NSString::from_str(&url)) else {
                warn!("ios_external_url: URL rejected by NSURL");
                return;
            };
            let options = NSDictionary::new();
            // SAFETY: an empty dictionary is a valid
            // NSDictionary<UIApplicationOpenExternalURLOptionsKey, id>.
            unsafe {
                UIApplication::sharedApplication(mtm)
                    .openURL_options_completionHandler(&url, &options, None);
            }
        })
        .map_err(|error| format!("Failed to open the URL: {error}"))
    }
}

#[cfg(target_os = "ios")]
pub(crate) fn open(app: &tauri::AppHandle, url: String) -> Result<(), String> {
    native::open(app, url)
}
