use tauri::{AppHandle, Manager};

use crate::app_state::AppState;
use crate::core_adapter::CoreAdapter;

pub(crate) fn should_disable_idle_timer(enabled: bool, foreground: bool, unlocked: bool) -> bool {
    enabled && foreground && unlocked
}

pub(crate) fn sync_ios_idle_timer(app: &AppHandle, adapter: &dyn CoreAdapter) {
    let state = app.state::<AppState>();
    let keep_awake_enabled = match state.session_settings.lock() {
        Ok(settings) => settings.keep_screen_awake_when_unlocked,
        Err(_) => {
            tracing::warn!("ios_keep_awake: session settings mutex poisoned");
            false
        }
    };
    let is_foreground = match state.mobile_is_foreground.lock() {
        Ok(foreground) => *foreground,
        Err(_) => {
            tracing::warn!("ios_keep_awake: foreground mutex poisoned");
            false
        }
    };
    let disabled =
        should_disable_idle_timer(keep_awake_enabled, is_foreground, adapter.is_unlocked());

    #[cfg(target_os = "ios")]
    {
        let app = app.clone();
        if let Err(error) = app.run_on_main_thread(move || {
            crate::mobile::ios::idle_timer::set_disabled(disabled);
        }) {
            tracing::warn!("ios_keep_awake: failed to schedule idle timer sync: {error}");
        }
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
