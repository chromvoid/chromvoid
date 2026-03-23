use std::sync::atomic::{AtomicBool, Ordering};

use tauri::Manager;
use tracing::{error, info};

use crate::app_state::AppState;

pub(crate) fn exit_request_should_intercept(exit_in_progress: &AtomicBool) -> bool {
    !exit_in_progress.swap(true, Ordering::AcqRel)
}

pub(crate) fn spawn_shutdown_signal_listener(app: tauri::AppHandle) {
    #[cfg(unix)]
    {
        tauri::async_runtime::spawn(async move {
            use tokio::signal::unix::{signal, SignalKind};

            let mut sigterm = match signal(SignalKind::terminate()) {
                Ok(stream) => stream,
                Err(e) => {
                    error!("failed to install SIGTERM handler: {e}");
                    return;
                }
            };

            let mut sigint = match signal(SignalKind::interrupt()) {
                Ok(stream) => stream,
                Err(e) => {
                    error!("failed to install SIGINT handler: {e}");
                    return;
                }
            };

            tokio::select! {
                _ = sigterm.recv() => info!("received SIGTERM, requesting app exit"),
                _ = sigint.recv() => info!("received SIGINT, requesting app exit"),
            }

            let exit_in_progress = {
                let state: tauri::State<'_, AppState> = app.state();
                state.exit_in_progress.clone()
            };
            if exit_in_progress.load(Ordering::Acquire) {
                return;
            }

            app.exit(0);
        });
    }

    #[cfg(not(unix))]
    {
        let _ = app;
    }
}
