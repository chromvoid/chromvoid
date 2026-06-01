#[cfg(target_os = "ios")]
mod native {
    use std::ptr::NonNull;
    use std::sync::Mutex;

    use block2::global_block;
    use objc2::AnyThread;
    use objc2_background_tasks::{BGAppRefreshTaskRequest, BGTask, BGTaskScheduler};
    use objc2_foundation::{NSDate, NSString};
    use tracing::{info, warn};

    use crate::mobile::ios::runtime;
    use crate::task_lifecycle::EventTaskName;

    const IOS_BG_REFRESH_TASK_ID: &str = "com.chromvoid.app.connection-refresh";
    const IOS_BG_REFRESH_DELAY_SECS: f64 = 60.0;

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
        // SAFETY: task is a non-null BGTask pointer received from BGTaskScheduler launch handler;
        // valid until setTaskCompleted* returns.
        unsafe { task.as_ref().setTaskCompletedWithSuccess(success) };
    }

    fn handle_background_launch(task: NonNull<BGTask>) {
        info!("ios_background_refresh: launch handler started");

        // SAFETY: task is non-null and live; IOS_BG_REFRESH_EXPIRATION_HANDLER is a 'static global_block.
        unsafe {
            task.as_ref()
                .setExpirationHandler(Some(&IOS_BG_REFRESH_EXPIRATION_HANDLER));
        }

        let Some(storage_root) = runtime::storage_root() else {
            warn!("ios_background_refresh: storage_root is not initialized");
            complete_task(task, false);
            return;
        };
        if runtime::app_handle().is_none() {
            warn!("ios_background_refresh: app handle is not initialized");
            complete_task(task, false);
            return;
        }
        let Some((task_lifecycle, ios_host_runtime, mobile_acceptor_runtime, adapter)) =
            runtime::with_app_state(|state| {
                (
                    state.task_lifecycle.clone(),
                    state.ios_host_runtime.clone(),
                    state.mobile_acceptor_runtime.clone(),
                    state.adapter.clone(),
                )
            })
        else {
            warn!("ios_background_refresh: AppState unavailable");
            complete_task(task, false);
            return;
        };

        let _ = schedule();
        let task_ptr = task.as_ptr() as usize;

        if let Err(error) = task_lifecycle.spawn_event_async(
            EventTaskName::IosBackgroundRefresh,
            move |mut shutdown_rx| async move {
                let success = tokio::select! {
                    changed = shutdown_rx.changed() => {
                        if changed.is_ok() && shutdown_rx.borrow().is_some() {
                            info!("ios_background_refresh: launch work stopped by lifecycle shutdown");
                        }
                        false
                    }
                    success = async move {
                        info!("ios_background_refresh: evaluating host mode state");
                        if !crate::network::ios_pairing::is_host_mode_enabled(&storage_root) {
                            info!("ios_background_refresh: host mode disabled, canceling pending refresh");
                            let _ = cancel();
                            true
                        } else {
                            info!("ios_background_refresh: checking pending wake request");
                            let result = crate::network::ios_pairing::handle_pending_wake_if_enabled(
                                ios_host_runtime,
                                mobile_acceptor_runtime,
                                Some(adapter),
                                &storage_root,
                            )
                            .await;
                            match result {
                                Ok(Some(status)) => {
                                    info!(
                                        "ios_background_refresh: pending wake handled phase={:?} room_id={:?}",
                                        status.phase,
                                        status
                                            .presence
                                            .as_ref()
                                            .map(|presence| presence.room_id.as_str())
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
                        }
                    } => success
                };

                let task_ptr = task_ptr as *mut BGTask;
                if let Some(task) = NonNull::new(task_ptr) {
                    complete_task(task, success);
                }
            },
        ) {
            warn!("ios_background_refresh: launch work was not scheduled: {error}");
            complete_task(task, false);
        }
    }

    pub fn setup() {
        let mut attempted = match REGISTRATION_ATTEMPTED.lock() {
            Ok(attempted) => attempted,
            Err(_) => {
                warn!("ios_background_refresh: registration state is unavailable");
                return;
            }
        };
        if *attempted {
            return;
        }
        *attempted = true;

        // SAFETY: objc2 ObjC API; sharedScheduler returns a +0 singleton owned by the runtime.
        let scheduler = unsafe { BGTaskScheduler::sharedScheduler() };
        let identifier = task_identifier();
        // SAFETY: identifier is a fresh NSString; queue=None means main queue;
        // IOS_BG_REFRESH_LAUNCH_HANDLER is a 'static global_block launch handler.
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
        // SAFETY: objc2 ObjC API; sharedScheduler returns a +0 singleton owned by the runtime.
        let scheduler = unsafe { BGTaskScheduler::sharedScheduler() };
        let identifier = task_identifier();
        // SAFETY: scheduler is the +0 singleton above; identifier is a fresh NSString.
        unsafe { scheduler.cancelTaskRequestWithIdentifier(&identifier) };

        // SAFETY: alloc returns a +1 BGAppRefreshTaskRequest; identifier is a fresh NSString that
        // outlives the init call.
        let request = unsafe {
            BGAppRefreshTaskRequest::initWithIdentifier(
                BGAppRefreshTaskRequest::alloc(),
                &identifier,
            )
        };
        let earliest = NSDate::dateWithTimeIntervalSinceNow(IOS_BG_REFRESH_DELAY_SECS);
        // SAFETY: request is a +1 BGAppRefreshTaskRequest; earliest is an autoreleased NSDate that
        // outlives the call.
        unsafe { request.setEarliestBeginDate(Some(&earliest)) };

        // SAFETY: scheduler is the +0 singleton; request is a fully-initialised BGAppRefreshTaskRequest.
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
        // SAFETY: objc2 ObjC API; sharedScheduler returns a +0 singleton owned by the runtime.
        let scheduler = unsafe { BGTaskScheduler::sharedScheduler() };
        let identifier = task_identifier();
        // SAFETY: scheduler is the +0 singleton; identifier is a fresh NSString.
        unsafe { scheduler.cancelTaskRequestWithIdentifier(&identifier) };
        info!("ios_background_refresh: canceled pending refresh task");
        Ok(())
    }
}

#[cfg(target_os = "ios")]
pub fn setup() {
    native::setup();
}

#[cfg(not(target_os = "ios"))]
pub fn setup() {}

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
