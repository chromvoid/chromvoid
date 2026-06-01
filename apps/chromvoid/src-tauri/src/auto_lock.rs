use std::sync::Arc;
use std::time::Duration;

use tauri::Manager;
use tracing::{info, warn};

use crate::app_state::AppState;
use crate::task_lifecycle::{ManagedTaskName, TaskLifecycleRuntime};
use crate::vault_background_io::VaultBackgroundIoRuntimeState;

pub(crate) fn spawn_auto_lock_task(
    app_handle: tauri::AppHandle,
    task_lifecycle: Arc<TaskLifecycleRuntime>,
) -> Result<(), String> {
    task_lifecycle.spawn_unique_async(
        ManagedTaskName::AutoLock,
        move |mut shutdown_rx| async move {
            loop {
                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_secs(10)) => {}
                    changed = shutdown_rx.changed() => {
                        if changed.is_ok() && shutdown_rx.borrow().is_some() {
                            info!("auto_lock: stopped by lifecycle shutdown");
                        }
                        break;
                    }
                }

                let vault_background_io_runtime = {
                    let state: tauri::State<'_, AppState> = app_handle.state();

                    let timeout = match state.session_settings.lock() {
                        Ok(s) => s.auto_lock_timeout_secs,
                        Err(_) => continue,
                    };

                    if timeout == 0 {
                        continue;
                    }

                    let should_lock = match state.last_activity.lock() {
                        Ok(last) => last.elapsed().as_secs() >= timeout,
                        Err(_) => false,
                    };

                    if !should_lock {
                        continue;
                    }

                    state.vault_background_io_runtime.clone()
                };

                info!("auto_lock: locking vault due to inactivity");
                if let Err(error) =
                    lock_vault_from_auto_lock(app_handle.clone(), vault_background_io_runtime).await
                {
                    warn!("auto_lock: lock failed: {}", error);
                }
            }
        },
    )
}

async fn lock_vault_from_auto_lock(
    app_handle: tauri::AppHandle,
    vault_background_io_runtime: Arc<VaultBackgroundIoRuntimeState>,
) -> Result<(), String> {
    let app_bg = app_handle.clone();
    match vault_background_io_runtime
        .spawn_blocking(move || {
            let Some(state) = app_bg.try_state::<AppState>() else {
                return Err("Auto-lock AppState unavailable".to_string());
            };
            let adapter = state.adapter.clone();
            let is_unlocked = match adapter.lock() {
                Ok(adapter) => adapter.is_unlocked(),
                Err(_) => {
                    tracing::warn!("auto_lock: adapter mutex poisoned");
                    return Ok(());
                }
            };
            if !is_unlocked {
                return Ok(());
            }
            crate::commands::vault::lock_vault_with_reason(&app_bg, &state, "auto_lock")
        })
        .await
    {
        Ok(result) => result,
        Err(error) => {
            let (error, _code) = error.into_rpc_error("Auto-lock");
            Err(error)
        }
    }
}
