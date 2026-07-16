use super::*;

pub(super) const IDENTITY_JSON: &str = r#"{
    "manufacturer":"ChromVoid",
    "model":"ChromVoid Mobile Host",
    "description":"ChromVoid USB Remote",
    "version":"1",
    "uri":"https://chromvoid.com",
    "serial":"device-1"
}"#;

pub(super) fn host_starter<F, Fut>(f: F) -> AndroidMobileUsbHostStarter
where
    F: Fn(AndroidMobileUsbHostStart) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = Result<(), String>> + Send + 'static,
{
    Arc::new(move |start| {
        let fut = f(start);
        Box::pin(async move {
            fut.await
                .map(|()| AndroidMobileUsbHostStopReason::Shutdown)
                .map_err(AndroidMobileUsbHostFailure::Error)
        })
    })
}

pub(super) fn host_starter_with_reason<F, Fut>(f: F) -> AndroidMobileUsbHostStarter
where
    F: Fn(AndroidMobileUsbHostStart) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = Result<AndroidMobileUsbHostStopReason, AndroidMobileUsbHostFailure>>
        + Send
        + 'static,
{
    Arc::new(move |start| {
        let fut = f(start);
        Box::pin(fut)
    })
}

pub(super) fn tokio_task_spawner() -> AndroidMobileUsbTaskSpawner {
    Arc::new(|task_factory| {
        tokio::spawn(task_factory());
        Ok(())
    })
}

pub(super) fn rejecting_task_spawner() -> AndroidMobileUsbTaskSpawner {
    Arc::new(|_task_factory| Err("test spawner unavailable".to_string()))
}

pub(super) fn runtime_for_tests() -> Arc<AndroidMobileUsbAccessoryRuntimeState> {
    let runtime = Arc::new(AndroidMobileUsbAccessoryRuntimeState::new());
    runtime.set_task_spawner_for_tests(tokio_task_spawner());
    runtime
}

#[cfg(unix)]
pub(super) fn fd_is_open(fd: std::os::fd::RawFd) -> bool {
    unsafe { libc::fcntl(fd, libc::F_GETFD) >= 0 }
}
