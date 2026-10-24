use std::future::Future;
use std::sync::{atomic::AtomicBool, Arc, Mutex};
use std::time::{Duration, Instant};

use crate::app_state::AppState;
use crate::catalog_blocking_io::CatalogBlockingIoRuntimeState;
use crate::commands::catalog::PreparedPreviewRuntimeState;
use crate::core_adapter::CoreAdapter;
use crate::core_rpc_dispatcher::{CoreRpcDispatcher, CoreRpcDispatcherShutdown};
use crate::media_stream::MediaProtocolRuntimeState;
use crate::network::ios_pairing::IosHostRuntimeState;
use crate::network::mobile_acceptor::MobileAcceptorRuntimeState;
use crate::network::mobile_host::AndroidHostRuntimeState;
use crate::remote_io_runtime::{RemoteIoRuntimeState, RemoteIoStopReason};
use crate::ssh_agent::{SshAgentState, StopReason};
use crate::task_lifecycle::{TaskLifecycleRuntime, TaskShutdownReason};
use crate::vault_background_io::VaultBackgroundIoRuntimeState;
use crate::volume_manager::VolumeManager;

use super::signal::exit_request_should_intercept;

// Overall native-termination cap, including collection and synchronous IO in the worker.
const DESKTOP_EXIT_CLEANUP_TIMEOUT: Duration = Duration::from_secs(30);
pub(crate) const VOLUME_UNMOUNT_EXIT_BUDGET: Duration = Duration::from_secs(5);
pub(crate) const CATALOG_BLOCKING_IO_EXIT_GRACE: Duration = Duration::from_secs(1);
pub(crate) const VAULT_BACKGROUND_IO_EXIT_GRACE: Duration = Duration::from_secs(1);
pub(crate) const MEDIA_PROTOCOL_EXIT_GRACE: Duration = Duration::from_secs(1);
pub(crate) const PREPARED_PREVIEW_PROTOCOL_EXIT_GRACE: Duration = Duration::from_secs(1);
pub(crate) const BACKEND_JOIN_EXIT_GRACE: Duration = Duration::from_secs(1);
pub(crate) const REMOTE_IO_EXIT_GRACE: Duration = Duration::from_secs(1);
pub(crate) const CORE_RPC_DISPATCHER_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(2);
pub(crate) const TASK_LIFECYCLE_EXIT_GRACE: Duration = Duration::from_secs(1);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum DesktopExitCleanupMode {
    Async,
    Blocking,
}

pub(crate) type DesktopExitCleanupTask = (Instant, tauri::async_runtime::JoinHandle<()>);

impl DesktopExitCleanupMode {
    pub(crate) fn dispatch(
        self,
        exit_in_progress: &AtomicBool,
        cleanup: &mut Option<DesktopExitCleanupTask>,
        start_cleanup: impl FnOnce() -> tauri::async_runtime::JoinHandle<()>,
    ) -> Option<DesktopExitCleanupTask> {
        if exit_request_should_intercept(exit_in_progress) {
            let started = Instant::now();
            *cleanup = Some((started, start_cleanup()));
        }
        if self == Self::Blocking {
            cleanup.take()
        } else {
            None
        }
    }
}

pub(crate) fn wait_desktop_exit_cleanup((started, mut cleanup): DesktopExitCleanupTask) {
    let deadline = tokio::time::Instant::from_std(started + DESKTOP_EXIT_CLEANUP_TIMEOUT);
    tauri::async_runtime::block_on(async {
        match tokio::time::timeout_at(deadline, &mut cleanup).await {
            Ok(Ok(())) => {}
            Ok(Err(error)) => tracing::warn!("app_exit: desktop exit cleanup failed: {error}"),
            Err(_) => {
                cleanup.abort();
                tracing::warn!(
                    timeout_ms = DESKTOP_EXIT_CLEANUP_TIMEOUT.as_millis() as u64,
                    "app_exit: desktop exit cleanup timed out"
                );
            }
        }
    });
}

pub(crate) struct DesktopExitCleanup {
    app: tauri::AppHandle,
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    volume_manager: Arc<Mutex<VolumeManager>>,
    catalog_blocking_io_runtime: Arc<CatalogBlockingIoRuntimeState>,
    vault_background_io_runtime: Arc<VaultBackgroundIoRuntimeState>,
    media_protocol_runtime: Arc<MediaProtocolRuntimeState>,
    prepared_preview_runtime: Arc<PreparedPreviewRuntimeState>,
    mobile_acceptor_runtime: Arc<MobileAcceptorRuntimeState>,
    ios_host_runtime: Arc<IosHostRuntimeState>,
    android_host_runtime: Arc<AndroidHostRuntimeState>,
    ssh_agent: Arc<Mutex<SshAgentState>>,
    env_runtime: Arc<crate::env_runtime::EnvRuntimeState>,
    remote_io_runtime: Arc<RemoteIoRuntimeState>,
    task_lifecycle: Arc<TaskLifecycleRuntime>,
    core_rpc_dispatcher: CoreRpcDispatcher,
}

pub(crate) fn collect_desktop_exit_cleanup(
    app: tauri::AppHandle,
    state: &tauri::State<'_, AppState>,
) -> DesktopExitCleanup {
    DesktopExitCleanup {
        app,
        adapter: state.adapter.clone(),
        volume_manager: state.volume_manager.clone(),
        catalog_blocking_io_runtime: state.catalog_blocking_io_runtime.clone(),
        vault_background_io_runtime: state.vault_background_io_runtime.clone(),
        media_protocol_runtime: state.media_protocol_runtime.clone(),
        prepared_preview_runtime: state.prepared_preview_runtime.clone(),
        mobile_acceptor_runtime: state.mobile_acceptor_runtime.clone(),
        ios_host_runtime: state.ios_host_runtime.clone(),
        android_host_runtime: state.android_host_runtime.clone(),
        ssh_agent: state.ssh_agent.clone(),
        env_runtime: state.env_runtime.clone(),
        remote_io_runtime: state.remote_io_runtime.clone(),
        task_lifecycle: state.task_lifecycle.clone(),
        core_rpc_dispatcher: state.core_rpc_dispatcher.clone(),
    }
}

pub(super) async fn drain_volume_and_disconnect_mobile_usb(
    volume_cleanup: impl Future<Output = ()> + Send + 'static,
    remote_io_runtime: &RemoteIoRuntimeState,
) {
    let budget = VOLUME_UNMOUNT_EXIT_BUDGET + BACKEND_JOIN_EXIT_GRACE;
    // Mutex waits and filesystem IO must not block the worker driving this deadline.
    let mut volume_cleanup = tauri::async_runtime::spawn_blocking(move || {
        tauri::async_runtime::block_on(volume_cleanup)
    });
    match tokio::time::timeout(budget, &mut volume_cleanup).await {
        Ok(Ok(())) => {}
        Ok(Err(error)) => tracing::warn!("app_exit: pre-goodbye volume cleanup failed: {error}"),
        Err(_) => {
            // This cancels queued work; an already running blocking task may finish later.
            volume_cleanup.abort();
            tracing::warn!(
                timeout_ms = budget.as_millis() as u64,
                "app_exit: pre-goodbye volume cleanup timed out; attempting USB goodbye"
            );
        }
    }
    if let Err(error) = remote_io_runtime
        .shutdown_mobile_usb_for_app_exit(REMOTE_IO_EXIT_GRACE)
        .await
    {
        tracing::warn!("remote_io: runtime shutdown failed: {error}");
    }
}

pub(crate) async fn run_desktop_exit_cleanup(cleanup: DesktopExitCleanup) {
    let DesktopExitCleanup {
        app,
        adapter,
        volume_manager,
        catalog_blocking_io_runtime,
        vault_background_io_runtime,
        media_protocol_runtime,
        prepared_preview_runtime,
        mobile_acceptor_runtime,
        ios_host_runtime,
        android_host_runtime,
        ssh_agent,
        env_runtime,
        remote_io_runtime,
        task_lifecycle,
        core_rpc_dispatcher,
    } = cleanup;

    // Drain mounted writes before the USB goodbye can cancel pending file patches.
    let volume_app = app.clone();
    drain_volume_and_disconnect_mobile_usb(
        async move {
            let backend_join_runtime = match volume_manager.lock() {
                Ok(vm) => Some(vm.backend_join_runtime()),
                Err(_) => {
                    tracing::warn!("volume: backend join runtime unavailable during app exit");
                    None
                }
            };

            let _ = crate::commands::volume_ops::volume_unmount_inner_with_budget(
                volume_app,
                adapter,
                volume_manager,
                Some(VOLUME_UNMOUNT_EXIT_BUDGET),
            )
            .await;
            if let Some(runtime) = backend_join_runtime {
                if let Err(error) = runtime.shutdown_with_grace(BACKEND_JOIN_EXIT_GRACE).await {
                    tracing::warn!("volume: backend join runtime shutdown failed: {error}");
                }
            }
        },
        &remote_io_runtime,
    )
    .await;

    env_runtime.stop_all_and_wait().await;
    let _ = crate::commands::catalog::purge_catalog_preview_cache_for_app(&app, "session-end");
    if let Err(error) = catalog_blocking_io_runtime
        .shutdown_with_grace(CATALOG_BLOCKING_IO_EXIT_GRACE)
        .await
    {
        tracing::warn!("catalog_blocking_io: runtime shutdown failed: {error}");
    }
    if let Err(error) = vault_background_io_runtime
        .shutdown_with_grace(VAULT_BACKGROUND_IO_EXIT_GRACE)
        .await
    {
        tracing::warn!("vault_background_io: runtime shutdown failed: {error}");
    }
    if let Err(error) = media_protocol_runtime
        .shutdown_with_grace(MEDIA_PROTOCOL_EXIT_GRACE)
        .await
    {
        tracing::warn!("media_stream: protocol runtime shutdown failed: {error}");
    }
    if let Err(error) = prepared_preview_runtime
        .shutdown_protocol_with_grace(PREPARED_PREVIEW_PROTOCOL_EXIT_GRACE)
        .await
    {
        tracing::warn!("prepared_preview: protocol runtime shutdown failed: {error}");
    }
    if let Err(error) = crate::network::mobile_host::shutdown_android_host_mode_for_app_exit(
        android_host_runtime,
        mobile_acceptor_runtime.clone(),
    )
    .await
    {
        tracing::warn!("mobile_host: android app-exit shutdown failed: {error}");
    }
    if let Err(error) = crate::network::ios_pairing::shutdown_host_mode_for_app_exit(
        ios_host_runtime,
        mobile_acceptor_runtime,
    )
    .await
    {
        tracing::warn!("ios_pairing: app-exit shutdown failed: {error}");
    }
    crate::ssh_agent::stop_shared_state(&ssh_agent, StopReason::AppShutdown).await;
    if let Err(error) = remote_io_runtime
        .shutdown_with_grace(RemoteIoStopReason::AppShutdown, REMOTE_IO_EXIT_GRACE)
        .await
    {
        tracing::warn!("remote_io: runtime shutdown failed: {error}");
    }

    let dispatcher_shutdown = core_rpc_dispatcher
        .shutdown_with_timeout_async(CORE_RPC_DISPATCHER_SHUTDOWN_TIMEOUT)
        .await;
    match dispatcher_shutdown {
        Ok(CoreRpcDispatcherShutdown::Joined) => {
            tracing::info!("core_rpc_dispatcher: shutdown joined")
        }
        Ok(CoreRpcDispatcherShutdown::AlreadyStopped) => {
            tracing::debug!("core_rpc_dispatcher: shutdown already stopped")
        }
        Ok(CoreRpcDispatcherShutdown::TimedOut) => {
            tracing::warn!("core_rpc_dispatcher: shutdown timed out")
        }
        Err(error) => {
            tracing::warn!("core_rpc_dispatcher: shutdown failed: {error}")
        }
    }
    let _ = task_lifecycle
        .shutdown_with_grace(TaskShutdownReason::AppExit, TASK_LIFECYCLE_EXIT_GRACE)
        .await;
}
