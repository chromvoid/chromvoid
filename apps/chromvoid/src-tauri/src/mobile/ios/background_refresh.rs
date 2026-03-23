#[cfg(target_os = "ios")]
mod native {
    use std::path::{Path, PathBuf};
    use std::ptr::NonNull;
    use std::sync::{Mutex, OnceLock};

    use block2::global_block;
    use objc2::AnyThread;
    use objc2_background_tasks::{BGAppRefreshTaskRequest, BGTask, BGTaskScheduler};
    use objc2_foundation::{NSDate, NSString};
    use tracing::{info, warn};

    const IOS_BG_REFRESH_TASK_ID: &str = "com.chromvoid.app.connection-refresh";
    const IOS_BG_REFRESH_DELAY_SECS: f64 = 60.0;

    static STORAGE_ROOT: OnceLock<PathBuf> = OnceLock::new();
    static REGISTRATION_ATTEMPTED: Mutex<bool> = Mutex::new(false);

    global_block! {
        static IOS_BG_REFRESH_EXPIRATION_HANDLER = || {
            warn!("ios_background_refresh: task expiration callback fired");
        };
    }

    global_block! {
        static IOS_BG_REFRESH_LAUNCH_HANDLER = |task: NonNull<BGTask>| {
            handle_background_launch(task);
        };
    }

    fn task_identifier() -> objc2::rc::Retained<NSString> {
        NSString::from_str(IOS_BG_REFRESH_TASK_ID)
    }

    fn complete_task(task: NonNull<BGTask>, success: bool) {
        unsafe { task.as_ref().setTaskCompletedWithSuccess(success) };
    }

    fn handle_background_launch(task: NonNull<BGTask>) {
        info!("ios_background_refresh: launch handler started");

        unsafe {
            task.as_ref()
                .setExpirationHandler(Some(&IOS_BG_REFRESH_EXPIRATION_HANDLER));
        }

        let Some(storage_root) = STORAGE_ROOT.get().cloned() else {
            warn!("ios_background_refresh: storage_root is not initialized");
            complete_task(task, false);
            return;
        };

        let _ = schedule();
        let task_ptr = task.as_ptr() as usize;

        tauri::async_runtime::spawn(async move {
            info!("ios_background_refresh: evaluating host mode state");
            let success =
                if !crate::network::ios_pairing::is_host_mode_enabled(&storage_root) {
                    info!("ios_background_refresh: host mode disabled, canceling pending refresh");
                    let _ = cancel();
                    true
                } else {
                    info!("ios_background_refresh: checking pending wake request");
                    match crate::network::ios_pairing::handle_pending_wake_if_enabled(&storage_root)
                        .await
                    {
                        Ok(Some(status)) => {
                            info!(
                            "ios_background_refresh: pending wake handled phase={:?} room_id={:?}",
                            status.phase,
                            status.presence.as_ref().map(|presence| presence.room_id.as_str())
                        );
                            true
                        }
                        Ok(None) => {
                            info!("ios_background_refresh: no pending wake request");
                            true
                        }
                        Err(error) => {
                            warn!("ios_background_refresh: pending wake handling failed: {error}");
                            false
                        }
                    }
                };

            let task_ptr = task_ptr as *mut BGTask;
            if let Some(task) = NonNull::new(task_ptr) {
                complete_task(task, success);
            }
        });
    }

    pub fn setup(storage_root: PathBuf) {
        let _ = STORAGE_ROOT.set(storage_root);

        let mut attempted = REGISTRATION_ATTEMPTED.lock().unwrap();
        if *attempted {
            return;
        }
        *attempted = true;

        let scheduler = unsafe { BGTaskScheduler::sharedScheduler() };
        let identifier = task_identifier();
        let registered = unsafe {
            scheduler.registerForTaskWithIdentifier_usingQueue_launchHandler(
                &identifier,
                None,
                &IOS_BG_REFRESH_LAUNCH_HANDLER,
            )
        };

        if registered {
            info!(
                "ios_background_refresh: registered BGAppRefreshTask handler ({IOS_BG_REFRESH_TASK_ID})"
            );
        } else {
            warn!(
                "ios_background_refresh: failed to register BGAppRefreshTask handler ({IOS_BG_REFRESH_TASK_ID})"
            );
        }
    }

    pub fn schedule() -> Result<(), String> {
        let scheduler = unsafe { BGTaskScheduler::sharedScheduler() };
        let identifier = task_identifier();
        unsafe { scheduler.cancelTaskRequestWithIdentifier(&identifier) };

        let request = unsafe {
            BGAppRefreshTaskRequest::initWithIdentifier(
                BGAppRefreshTaskRequest::alloc(),
                &identifier,
            )
        };
        let earliest = NSDate::dateWithTimeIntervalSinceNow(IOS_BG_REFRESH_DELAY_SECS);
        unsafe { request.setEarliestBeginDate(Some(&earliest)) };

        unsafe { scheduler.submitTaskRequest_error(&request) }.map_err(|error| {
            format!(
                "submit background refresh request failed: {}",
                error.localizedDescription()
            )
        })?;

        info!(
            "ios_background_refresh: scheduled next refresh in ~{}s",
            IOS_BG_REFRESH_DELAY_SECS as u64
        );
        Ok(())
    }

    pub fn cancel() -> Result<(), String> {
        let scheduler = unsafe { BGTaskScheduler::sharedScheduler() };
        let identifier = task_identifier();
        unsafe { scheduler.cancelTaskRequestWithIdentifier(&identifier) };
        info!("ios_background_refresh: canceled pending refresh task");
        Ok(())
    }

    #[allow(dead_code)]
    pub fn has_storage_root(root: &Path) -> bool {
        STORAGE_ROOT.get().is_some_and(|value| value == root)
    }
}

#[cfg(target_os = "ios")]
pub fn setup(storage_root: std::path::PathBuf) {
    native::setup(storage_root);
}

#[cfg(not(target_os = "ios"))]
pub fn setup(_storage_root: std::path::PathBuf) {}

#[cfg(target_os = "ios")]
pub fn schedule() -> Result<(), String> {
    native::schedule()
}

#[cfg(not(target_os = "ios"))]
pub fn schedule() -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "ios")]
pub fn cancel() -> Result<(), String> {
    native::cancel()
}

#[cfg(not(target_os = "ios"))]
pub fn cancel() -> Result<(), String> {
    Ok(())
}
