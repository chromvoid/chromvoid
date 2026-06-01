use std::sync::{Arc, Mutex};
use std::time::Duration;

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
use crate::volume_manager::{VolumeBackendJoinRuntimeState, VolumeManager};

pub(crate) const VOLUME_UNMOUNT_EXIT_BUDGET: Duration = Duration::from_secs(5);
pub(crate) const CATALOG_BLOCKING_IO_EXIT_GRACE: Duration = Duration::from_secs(1);
pub(crate) const VAULT_BACKGROUND_IO_EXIT_GRACE: Duration = Duration::from_secs(1);
pub(crate) const MEDIA_PROTOCOL_EXIT_GRACE: Duration = Duration::from_secs(1);
pub(crate) const PREPARED_PREVIEW_PROTOCOL_EXIT_GRACE: Duration = Duration::from_secs(1);
pub(crate) const BACKEND_JOIN_EXIT_GRACE: Duration = Duration::from_secs(1);
pub(crate) const REMOTE_IO_EXIT_GRACE: Duration = Duration::from_secs(1);
pub(crate) const CORE_RPC_DISPATCHER_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(2);
pub(crate) const TASK_LIFECYCLE_EXIT_GRACE: Duration = Duration::from_secs(1);

pub(crate) struct DesktopExitCleanup {
    app: tauri::AppHandle,
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    volume_manager: Arc<Mutex<VolumeManager>>,
    backend_join_runtime: Option<Arc<VolumeBackendJoinRuntimeState>>,
    catalog_blocking_io_runtime: Arc<CatalogBlockingIoRuntimeState>,
    vault_background_io_runtime: Arc<VaultBackgroundIoRuntimeState>,
    media_protocol_runtime: Arc<MediaProtocolRuntimeState>,
    prepared_preview_runtime: Arc<PreparedPreviewRuntimeState>,
    mobile_acceptor_runtime: Arc<MobileAcceptorRuntimeState>,
    ios_host_runtime: Arc<IosHostRuntimeState>,
    android_host_runtime: Arc<AndroidHostRuntimeState>,
    ssh_agent: Arc<Mutex<SshAgentState>>,
    remote_io_runtime: Arc<RemoteIoRuntimeState>,
    task_lifecycle: Arc<TaskLifecycleRuntime>,
    core_rpc_dispatcher: CoreRpcDispatcher,
}

pub(crate) fn collect_desktop_exit_cleanup(
    app: tauri::AppHandle,
    state: &tauri::State<'_, AppState>,
) -> DesktopExitCleanup {
    let backend_join_runtime = match state.volume_manager.lock() {
        Ok(vm) => Some(vm.backend_join_runtime()),
        Err(_) => {
            tracing::warn!("volume: backend join runtime unavailable during app exit");
            None
        }
    };

    DesktopExitCleanup {
        app,
        adapter: state.adapter.clone(),
        volume_manager: state.volume_manager.clone(),
        backend_join_runtime,
        catalog_blocking_io_runtime: state.catalog_blocking_io_runtime.clone(),
        vault_background_io_runtime: state.vault_background_io_runtime.clone(),
        media_protocol_runtime: state.media_protocol_runtime.clone(),
        prepared_preview_runtime: state.prepared_preview_runtime.clone(),
        mobile_acceptor_runtime: state.mobile_acceptor_runtime.clone(),
        ios_host_runtime: state.ios_host_runtime.clone(),
        android_host_runtime: state.android_host_runtime.clone(),
        ssh_agent: state.ssh_agent.clone(),
        remote_io_runtime: state.remote_io_runtime.clone(),
        task_lifecycle: state.task_lifecycle.clone(),
        core_rpc_dispatcher: state.core_rpc_dispatcher.clone(),
    }
}

pub(crate) async fn run_desktop_exit_cleanup(cleanup: DesktopExitCleanup) {
    let DesktopExitCleanup {
        app,
        adapter,
        volume_manager,
        backend_join_runtime,
        catalog_blocking_io_runtime,
        vault_background_io_runtime,
        media_protocol_runtime,
        prepared_preview_runtime,
        mobile_acceptor_runtime,
        ios_host_runtime,
        android_host_runtime,
        ssh_agent,
        remote_io_runtime,
        task_lifecycle,
        core_rpc_dispatcher,
    } = cleanup;

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
    let _ = crate::commands::volume_ops::volume_unmount_inner_with_budget(
        app.clone(),
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
