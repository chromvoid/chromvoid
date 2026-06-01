use tauri::Manager;

use crate::app_state::AppState;
use crate::sleep_watcher::SleepWatcher;
use crate::task_lifecycle::EventTaskName;

pub(crate) struct VaultSleepHandler {
    pub(crate) app_handle: tauri::AppHandle,
    pub(crate) lock_on_sleep: bool,
    pub(crate) last_activity: std::sync::Arc<std::sync::Mutex<std::time::Instant>>,
}

impl SleepWatcher for VaultSleepHandler {
    fn on_sleep(&self) {
        if !self.lock_on_sleep {
            return;
        }

        let Some(state) = self.app_handle.try_state::<AppState>() else {
            tracing::warn!("sleep_handler: ignored sleep event before AppState registration");
            return;
        };
        let task_lifecycle = state.task_lifecycle.clone();
        let vault_background_io_runtime = state.vault_background_io_runtime.clone();
        let app_handle = self.app_handle.clone();

        if let Err(error) = task_lifecycle.spawn_event_async(
            EventTaskName::VaultSystemSleepLock,
            move |mut shutdown_rx| async move {
                tokio::select! {
                    changed = shutdown_rx.changed() => {
                        if changed.is_ok() && shutdown_rx.borrow().is_some() {
                            tracing::info!("sleep_handler: system sleep lock stopped by lifecycle shutdown");
                        }
                    }
                    _ = tokio::task::yield_now() => {
                        lock_vault_from_system_sleep(app_handle, vault_background_io_runtime).await;
                    }
                }
            },
        ) {
            tracing::warn!("sleep_handler: failed to schedule system sleep lock: {error}");
        }
    }

    fn on_wake(&self) {
        crate::helpers::touch_last_activity(&self.last_activity, "sleep_handler wake");
    }
}

async fn lock_vault_from_system_sleep(
    app_handle: tauri::AppHandle,
    vault_background_io_runtime: std::sync::Arc<
        crate::vault_background_io::VaultBackgroundIoRuntimeState,
    >,
) {
    let app_bg = app_handle.clone();
    match vault_background_io_runtime
        .spawn_blocking(move || {
            let Some(state) = app_bg.try_state::<AppState>() else {
                return Err("System sleep AppState unavailable".to_string());
            };
            let adapter = state.adapter.clone();
            let is_unlocked = match adapter.lock() {
                Ok(adapter) => adapter.is_unlocked(),
                Err(_) => {
                    tracing::warn!("sleep_handler: adapter mutex poisoned");
                    return Ok(());
                }
            };
            if !is_unlocked {
                return Ok(());
            }
            crate::commands::vault::lock_vault_with_reason(&app_bg, &state, "system_sleep")
        })
        .await
    {
        Ok(Ok(())) => {}
        Ok(Err(error)) => {
            tracing::warn!("sleep_handler: lock failed: {}", error);
        }
        Err(error) => {
            let (error, _code) = error.into_rpc_error("System sleep lock");
            tracing::warn!("sleep_handler: lock task failed: {error}");
        }
    }
}
