#[cfg(target_os = "ios")]
mod native {
    use std::ptr::NonNull;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::sync::Mutex;

    use block2::{global_block, RcBlock};
    use objc2::rc::Retained;
    use objc2::{AnyThread, Message};
    use objc2_background_tasks::{BGAppRefreshTaskRequest, BGTask, BGTaskScheduler};
    use objc2_foundation::{NSDate, NSString};
    use tracing::{info, warn};

    use crate::mobile::ios::runtime;
    use crate::task_lifecycle::EventTaskName;

    const IOS_BG_REFRESH_TASK_ID: &str = "com.chromvoid.app.connection-refresh";
    const IOS_BG_REFRESH_DELAY_SECS: f64 = 60.0;

    static REGISTRATION_ATTEMPTED: Mutex<bool> = Mutex::new(false);

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

    fn retain_task(task: NonNull<BGTask>) -> usize {
        // SAFETY: task is a non-null BGTask pointer from the launch handler. Retaining it keeps the
        // object alive across the async lifecycle work until complete_retained_task drops it.
        let retained = unsafe { task.as_ref().retain() };
        Retained::into_raw(retained) as usize
    }

    fn complete_retained_task(task_ptr: usize, success: bool, completed: &AtomicBool) {
        if completed.swap(true, Ordering::AcqRel) {
            return;
        }

        let Some(task) = NonNull::new(task_ptr as *mut BGTask) else {
            return;
        };
        // SAFETY: task_ptr comes from retain_task and is dropped exactly once below.
        unsafe {
            task.as_ref().setTaskCompletedWithSuccess(success);
            let _ = Retained::from_raw(task.as_ptr());
        }
    }

    fn handle_background_launch(task: NonNull<BGTask>) {
        info!("ios_background_refresh: launch handler started");

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
        let task_ptr = retain_task(task);
        let completed = Arc::new(AtomicBool::new(false));
        let expiration_completed = completed.clone();
        let event_completed = completed.clone();
        let expiration_task_lifecycle = task_lifecycle.clone();
        let expiration_handler = RcBlock::new(move || {
            warn!("ios_background_refresh: task expiration callback fired");
            match expiration_task_lifecycle.cancel_event_tasks(EventTaskName::IosBackgroundRefresh)
            {
                Ok(canceled) => {
                    info!("ios_background_refresh: canceled {canceled} lifecycle task(s) after expiration");
                }
                Err(error) => {
                    warn!("ios_background_refresh: failed to cancel lifecycle task after expiration: {error}");
                }
            }
            complete_retained_task(task_ptr, false, &expiration_completed);
        });

        // SAFETY: task is non-null and live in the launch handler; the ObjC property retains/copies
        // the block for use until expiration or setTaskCompletedWithSuccess.
        unsafe {
            task.as_ref()
                .setExpirationHandler(Some(&expiration_handler));
        }

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

                complete_retained_task(task_ptr, success, &event_completed);
            },
        ) {
            warn!("ios_background_refresh: launch work was not scheduled: {error}");
            complete_retained_task(task_ptr, false, &completed);
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
