#[cfg(target_os = "ios")]
mod native {
    use objc2_foundation::MainThreadMarker;
    use objc2_ui_kit::UIApplication;
    use tracing::warn;

    pub fn set_disabled(disabled: bool) {
        let Some(mtm) = MainThreadMarker::new() else {
            warn!("ios_idle_timer: set_disabled called off main thread");
            return;
        };

        let application = UIApplication::sharedApplication(mtm);
        application.setIdleTimerDisabled(disabled);
    }
}

#[cfg(target_os = "ios")]
pub fn set_disabled(disabled: bool) {
    native::set_disabled(disabled);
}

#[allow(dead_code)]
#[cfg(not(target_os = "ios"))]
pub fn set_disabled(_disabled: bool) {}
