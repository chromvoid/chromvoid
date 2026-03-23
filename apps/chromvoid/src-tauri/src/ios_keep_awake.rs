use tauri::{AppHandle, Manager};

use crate::app_state::AppState;
use crate::core_adapter::CoreAdapter;

pub(crate) fn should_disable_idle_timer(enabled: bool, foreground: bool, unlocked: bool) -> bool {
    enabled && foreground && unlocked
}

pub(crate) fn sync_ios_idle_timer(app: &AppHandle, adapter: &dyn CoreAdapter) {
    let state = app.state::<AppState>();
    let keep_awake_enabled = state
        .session_settings
        .lock()
        .map(|settings| settings.keep_screen_awake_when_unlocked)
        .unwrap_or(false);
    let is_foreground = state
        .mobile_is_foreground
        .lock()
        .map(|foreground| *foreground)
        .unwrap_or(false);
    let disabled =
        should_disable_idle_timer(keep_awake_enabled, is_foreground, adapter.is_unlocked());

    #[cfg(target_os = "ios")]
    {
        let app = app.clone();
        let _ = app.run_on_main_thread(move || {
            crate::mobile::ios::idle_timer::set_disabled(disabled);
        });
    }

    #[cfg(not(target_os = "ios"))]
    {
        let _ = disabled;
    }
}

#[cfg(test)]
mod tests {
    use super::should_disable_idle_timer;

    #[test]
    fn idle_timer_truth_table() {
        assert!(!should_disable_idle_timer(false, false, false));
        assert!(!should_disable_idle_timer(false, true, true));
        assert!(!should_disable_idle_timer(true, false, true));
        assert!(!should_disable_idle_timer(true, true, false));
        assert!(should_disable_idle_timer(true, true, true));
    }
}
