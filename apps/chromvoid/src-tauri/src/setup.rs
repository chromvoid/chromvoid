use std::sync::Arc;
use std::sync::Mutex;

#[cfg(desktop)]
use std::sync::atomic::{AtomicU64, Ordering};

#[cfg(desktop)]
use tauri::Listener;
use tauri::Manager;
use tracing::{error, info};
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use crate::app_state::AppState;
use crate::auto_lock;
use crate::core_adapter::LocalCoreAdapter;
use crate::helpers::{boxed_error, emit_basic_state, load_storage_root};
use crate::types::*;

#[cfg(target_os = "macos")]
use crate::task_lifecycle::ManagedTaskName;

#[cfg(desktop)]
use crate::task_lifecycle::EventTaskName;

#[cfg(desktop)]
const SSH_AGENT_REFRESH_DEBOUNCE_MS: u64 = 250;

#[cfg(desktop)]
use crate::shutdown::{spawn_shutdown_signal_listener, VaultSleepHandler};
#[cfg(desktop)]
use crate::sleep_watcher::PlatformSleepWatcher;

#[cfg(target_os = "macos")]
use crate::commands::volume_ops::{
    macos_diskutil_unmount_force, macos_mountpoint_is_unhealthy, macos_path_looks_mounted,
};

#[cfg(debug_assertions)]
fn mirrored_logs_dir() -> Option<std::path::PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(
        std::path::PathBuf::from(home)
            .join("kaifaty")
            .join("chromvoid_logs"),
    )
}

#[cfg(not(debug_assertions))]
fn mirrored_logs_dir() -> Option<std::path::PathBuf> {
    None
}

#[cfg(desktop)]
fn should_refresh_ssh_agent_from_catalog_event(payload: &serde_json::Value) -> bool {
    if payload.get("shard_id").and_then(|value| value.as_str()) == Some(".passmanager") {
        return true;
    }

    payload
        .get("events")
        .and_then(|events| events.as_array())
        .is_some_and(|events| {
            events.iter().any(|event| {
                event.get("shard_id").and_then(|value| value.as_str()) == Some(".passmanager")
            })
        })
}

#[cfg(desktop)]
fn spawn_ssh_agent_catalog_refresh_task(
    task_lifecycle: Arc<crate::task_lifecycle::TaskLifecycleRuntime>,
    app_handle: tauri::AppHandle,
    refresh_generation: Arc<AtomicU64>,
    generation: u64,
) {
    if let Err(error) = task_lifecycle.spawn_event_async(
        EventTaskName::SshAgentCatalogRefresh,
        move |mut shutdown_rx| async move {
            tokio::select! {
                _ = tokio::time::sleep(std::time::Duration::from_millis(
                    SSH_AGENT_REFRESH_DEBOUNCE_MS,
                )) => {}
                changed = shutdown_rx.changed() => {
                    if changed.is_ok() && shutdown_rx.borrow().is_some() {
                        tracing::info!("SSH agent catalog refresh stopped by lifecycle shutdown");
                    }
                    return;
                }
            }

            if refresh_generation.load(Ordering::Relaxed) != generation {
                return;
            }

            let _ =
                crate::commands::ssh_agent_cmds::reconcile_ssh_agent_with_vault(&app_handle, false)
                    .await;
        },
    ) {
        tracing::warn!(
            "SSH agent catalog refresh task was not scheduled: {}",
            error
        );
    }
}

pub(crate) fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| boxed_error(format!("app_data_dir: {e}")))?;

    // ── Logging ───────────────────────────────────────────────────────
    let logs_dir = data_dir.join("logs");
    std::fs::create_dir_all(&logs_dir).map_err(|e| boxed_error(format!("create logs dir: {e}")))?;

    let file_appender = tracing_appender::rolling::daily(&logs_dir, "chromvoid.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);
    let mut guards = vec![guard];

    let mut mirrored_dir: Option<std::path::PathBuf> = None;
    let mirrored_file_layer = mirrored_logs_dir().and_then(|dir| {
        if let Err(e) = std::fs::create_dir_all(&dir) {
            eprintln!(
                "[logging] failed to create mirrored logs dir '{}': {e}",
                dir.display()
            );
            return None;
        }

        let mirrored_file_appender = tracing_appender::rolling::daily(&dir, "chromvoid.log");
        let (mirrored_non_blocking, mirrored_guard) =
            tracing_appender::non_blocking(mirrored_file_appender);
        guards.push(mirrored_guard);
        mirrored_dir = Some(dir);

        Some(
            fmt::layer()
                .with_ansi(false)
                .with_writer(mirrored_non_blocking),
        )
    });

    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let _ = tracing_subscriber::registry()
        .with(filter)
        .with(fmt::layer().with_ansi(false).with_writer(std::io::stdout))
        .with(fmt::layer().with_ansi(false).with_writer(non_blocking))
        .with(mirrored_file_layer)
        .try_init();

    app.manage(LogGuards { _guards: guards });

    info!("ChromVoid application starting");
    info!("main: app_data_dir = {}", data_dir.display());
    if let Some(dir) = mirrored_dir {
        info!("main: mirrored logs dir = {}", dir.display());
    }
    if let Err(error) =
        crate::commands::catalog::purge_catalog_preview_cache_for_app(app.handle(), "startup")
    {
        tracing::warn!("main: startup preview cache purge failed: {}", error);
    }

    // ── Tray & menu (desktop) ─────────────────────────────────────────
    #[cfg(not(mobile))]
    {
        crate::tray::build_tray_and_menu(app)?;
    }

    // ── Storage root & adapter ────────────────────────────────────────
    let storage_root = load_storage_root(&data_dir);
    info!("main: loaded storage_root = {}", storage_root.display());

    if let Err(e) = std::fs::create_dir_all(&storage_root) {
        error!(
            "main: failed to create storage directory '{}': {:?}",
            storage_root.display(),
            e
        );
        return Err(boxed_error(format!(
            "Failed to create storage directory: {e}"
        )));
    }
    info!("main: storage directory created successfully");

    let license_root = crate::pro::license_vault_dir(&data_dir);
    let adapter = LocalCoreAdapter::new_with_license_store(
        storage_root.clone(),
        license_root.clone(),
        crate::pro::current_build_policy(),
    )
    .map_err(|e| {
        error!(
            "main: LocalCoreAdapter::new failed for path '{}': {:?}",
            storage_root.display(),
            e
        );
        boxed_error(e)
    })?;
    info!("main: LocalCoreAdapter initialized successfully");

    let adapter_arc = Arc::new(Mutex::new(
        Box::new(adapter) as Box<dyn crate::core_adapter::CoreAdapter>
    ));

    // ── Session settings ──────────────────────────────────────────────
    let session_settings =
        crate::session_settings::SessionSettings::load(&data_dir.join("session_settings.json"));
    info!(
        "main: loaded session_settings: auto_lock_timeout_secs={}, lock_on_sleep={}, lock_on_mobile_background={}, require_biometric_app_gate={}, auto_start_ssh_agent_after_unlock={}, keep_screen_awake_when_unlocked={}",
        session_settings.auto_lock_timeout_secs,
        session_settings.lock_on_sleep,
        session_settings.lock_on_mobile_background,
        session_settings.require_biometric_app_gate,
        session_settings.auto_start_ssh_agent_after_unlock,
        session_settings.keep_screen_awake_when_unlocked
    );

    #[cfg(desktop)]
    let app_handle = app.handle().clone();
    let storage_root_clone = storage_root.clone();
    let last_activity = Arc::new(Mutex::new(std::time::Instant::now()));

    // ── Sleep watcher (desktop) ───────────────────────────────────────
    #[cfg(desktop)]
    let sleep_watcher = {
        let handler = VaultSleepHandler {
            app_handle: app_handle.clone(),
            last_activity: last_activity.clone(),
        };
        match PlatformSleepWatcher::new(Box::new(handler)) {
            Ok(watcher) => Some(watcher),
            Err(e) => {
                error!("main: Failed to create sleep watcher: {}", e);
                None
            }
        }
    };

    let core_rpc_dispatcher = crate::core_rpc_dispatcher::CoreRpcDispatcher::try_new()
        .map_err(|e| boxed_error(format!("core_rpc_dispatcher: {e}")))?;

    // ── AppState ──────────────────────────────────────────────────────
    app.manage(AppState {
        adapter: adapter_arc,
        core_rpc_dispatcher,
        #[cfg(desktop)]
        sync_runtime: Arc::new(crate::commands::sync_cmds::SyncRuntimeState::new()),
        storage_root: Arc::new(Mutex::new(storage_root_clone)),
        license_root,
        #[cfg(desktop)]
        gateway: Arc::new(Mutex::new(crate::gateway::GatewayState::load_or_default(
            data_dir.join("gateway.json"),
        ))),
        session_settings: Arc::new(Mutex::new(session_settings)),
        mobile_is_foreground: Arc::new(Mutex::new(cfg!(mobile))),
        last_activity,
        vault_background_io_runtime: Arc::new(
            crate::vault_background_io::VaultBackgroundIoRuntimeState::new(),
        ),
        catalog_blocking_io_runtime: Arc::new(
            crate::catalog_blocking_io::CatalogBlockingIoRuntimeState::new(),
        ),
        #[cfg(desktop)]
        host_path_capabilities: Arc::new(
            crate::host_path_capability::HostPathCapabilityRegistry::new(),
        ),
        task_lifecycle: Arc::new(crate::task_lifecycle::TaskLifecycleRuntime::new()),
        image_preview_runtime: Arc::new(crate::image_preview::ImagePreviewRuntimeState::new()),
        prepared_preview_runtime: Arc::new(
            crate::commands::catalog::PreparedPreviewRuntimeState::new(),
        ),
        media_streams: Arc::new(crate::media_source::LocalMediaSourceManager::new()),
        media_protocol_runtime: Arc::new(crate::media_stream::MediaProtocolRuntimeState::new()),
        #[cfg(desktop)]
        network_pairing_runtime: Arc::new(crate::network::pairing::NetworkPairingRuntimeState::new()),
        #[cfg(desktop)]
        remote_io_runtime: Arc::new(crate::remote_io_runtime::RemoteIoRuntimeState::new()),
        #[cfg(desktop)]
        mode_transition_coordinator: Arc::new(
            crate::mode_transition_coordinator::ModeTransitionCoordinator::new(),
        ),
        mobile_acceptor_runtime: Arc::new(
            crate::network::mobile_acceptor::MobileAcceptorRuntimeState::new(),
        ),
        ios_lifecycle_runtime: Arc::new(crate::network::ios_lifecycle::IosLifecycleRuntimeState::new()),
        ios_host_runtime: Arc::new(crate::network::ios_pairing::IosHostRuntimeState::new()),
        android_host_runtime: Arc::new(crate::network::mobile_host::AndroidHostRuntimeState::new()),
        android_provider_runtime: crate::mobile::android::shared_provider_runtime(),
        android_audio_sessions: Arc::new(crate::mobile::android::AndroidAudioSessionRegistry::new()),
        android_native_upload_runtime: Arc::new(
            crate::mobile::android::AndroidNativeUploadRuntimeState::new(),
        ),
        android_saf_picker_runtime: Arc::new(
            crate::mobile::android::AndroidSafPickerRuntimeState::new(),
        ),
        android_biometric_runtime: Arc::new(
            crate::mobile::android::AndroidBiometricRuntimeState::new(),
        ),
        android_password_save_runtime: Arc::new(
            crate::mobile::android::AndroidPasswordSaveRuntimeState::new(),
        ),
        android_autofill_runtime: Arc::new(
            crate::mobile::android::AndroidAutofillRuntimeState::new(),
        ),
        ios_native_bridge_runtime: Arc::new(
            crate::mobile::ios::native_bridge::IosNativeBridgeRuntimeState::new(),
        ),
        #[cfg(desktop)]
        volume_manager: Arc::new(Mutex::new(crate::volume_manager::VolumeManager::new())),
        #[cfg(desktop)]
        exit_in_progress: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        #[cfg(desktop)]
        _sleep_watcher: sleep_watcher,
        #[cfg(desktop)]
        ssh_agent: Arc::new(Mutex::new(crate::ssh_agent::SshAgentState::new())),
    });
    let task_lifecycle = app.state::<AppState>().task_lifecycle.clone();

    #[cfg(target_os = "android")]
    crate::mobile::android::register_app_handle(app.handle().clone());

    #[cfg(target_os = "ios")]
    {
        crate::mobile::ios::runtime::register_app_handle(app.handle().clone());
        crate::mobile::ios::runtime::register_storage_root(storage_root.clone());
    }

    #[cfg(target_os = "ios")]
    crate::mobile::ios::background_refresh::setup();

    #[cfg(target_os = "ios")]
    crate::mobile::ios::app_lifecycle::setup(app.handle().clone(), storage_root.clone());

    #[cfg(target_os = "ios")]
    crate::mobile::ios::keyboard::setup(app.handle().clone());

    #[cfg(target_os = "android")]
    {
        let storage_root = storage_root.clone();
        let state = app.state::<AppState>();
        let android_host_runtime = state.android_host_runtime.clone();
        let mobile_acceptor_runtime = state.mobile_acceptor_runtime.clone();
        let adapter = state.adapter.clone();
        crate::network::mobile_host::schedule_android_host_mode_resume(
            task_lifecycle.clone(),
            android_host_runtime,
            mobile_acceptor_runtime,
            Some(adapter),
            storage_root,
            "setup",
        )
        .map_err(|e| boxed_error(e))?;
    }

    // ── Shutdown signal listener (desktop) ────────────────────────────
    #[cfg(desktop)]
    spawn_shutdown_signal_listener(app.handle().clone(), task_lifecycle.clone())
        .map_err(|e| boxed_error(e))?;

    #[cfg(desktop)]
    {
        let app_handle = app.handle().clone();
        let refresh_generation = Arc::new(AtomicU64::new(0));
        let refresh_generation_for_listener = refresh_generation.clone();
        let refresh_generation_for_task = refresh_generation.clone();
        let task_lifecycle_for_listener = task_lifecycle.clone();

        app.listen("catalog:event", move |event| {
            let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) else {
                return;
            };

            if !should_refresh_ssh_agent_from_catalog_event(&payload) {
                return;
            }

            let generation = refresh_generation_for_listener.fetch_add(1, Ordering::Relaxed) + 1;
            let refresh_generation = refresh_generation_for_task.clone();
            let app_handle = app_handle.clone();
            let task_lifecycle = task_lifecycle_for_listener.clone();

            spawn_ssh_agent_catalog_refresh_task(
                task_lifecycle,
                app_handle,
                refresh_generation,
                generation,
            );
        });

        let app_handle = app.handle().clone();
        let refresh_generation_for_listener = refresh_generation.clone();
        let refresh_generation_for_task = refresh_generation.clone();
        let task_lifecycle_for_listener = task_lifecycle.clone();
        app.listen("catalog:event:batch", move |event| {
            let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) else {
                return;
            };

            if !should_refresh_ssh_agent_from_catalog_event(&payload) {
                return;
            }

            let generation = refresh_generation_for_listener.fetch_add(1, Ordering::Relaxed) + 1;
            let refresh_generation = refresh_generation_for_task.clone();
            let app_handle = app_handle.clone();
            let task_lifecycle = task_lifecycle_for_listener.clone();

            spawn_ssh_agent_catalog_refresh_task(
                task_lifecycle,
                app_handle,
                refresh_generation,
                generation,
            );
        });
    }

    // ── Stale mount cleanup (macOS) ───────────────────────────────────
    #[cfg(target_os = "macos")]
    {
        let data_dir = data_dir.clone();
        task_lifecycle
            .spawn_unique_async(
                ManagedTaskName::MacosStaleMountCleanup,
                move |shutdown_rx| async move {
                    let candidates = [
                        std::path::PathBuf::from("/Volumes/ChromVoid"),
                        data_dir.join("volume"),
                    ];

                    for mp in candidates {
                        if shutdown_rx.borrow().is_some() {
                            tracing::info!(
                                "FUSE: stale mount cleanup stopped by lifecycle shutdown"
                            );
                            return;
                        }

                        let looks_mounted = macos_path_looks_mounted(&mp).unwrap_or(false);
                        if !looks_mounted {
                            continue;
                        }

                        if !macos_mountpoint_is_unhealthy(&mp) {
                            continue;
                        }

                        tracing::warn!("FUSE: cleaning up stale mountpoint: {:?}", mp);
                        let _ = macos_diskutil_unmount_force(&mp).await;
                    }
                },
            )
            .map_err(|e| boxed_error(e))?;
    }

    // ── Auto-lock task ────────────────────────────────────────────────
    auto_lock::spawn_auto_lock_task(app.handle().clone(), task_lifecycle.clone())
        .map_err(|e| boxed_error(e))?;

    // ── Gateway server (desktop) ──────────────────────────────────────
    #[cfg(desktop)]
    crate::gateway::spawn_gateway_server(app.handle().clone(), task_lifecycle.clone())
        .map_err(|e| boxed_error(e))?;

    // ── macOS Credential Provider IPC bridge ──────────────────────────
    crate::credential_provider_bridge::spawn_credential_provider_bridge(
        app.handle().clone(),
        task_lifecycle.clone(),
    );

    // ── Emit initial state ────────────────────────────────────────────
    {
        let state = app.state::<AppState>();
        let adapter = state
            .adapter
            .lock()
            .map_err(|_| boxed_error("Adapter mutex poisoned"))?;
        let unlocked = adapter.is_unlocked();
        crate::ios_keep_awake::sync_ios_idle_timer(app.handle(), adapter.as_ref());
        emit_basic_state(app.handle(), &storage_root, adapter.as_ref());
        drop(adapter);
        crate::commands::vault::sync_android_vault_quick_lock_with_unlocked(
            app.handle(),
            &state,
            unlocked,
        );
    }

    Ok(())
}

#[cfg(all(test, desktop))]
mod tests {
    use super::should_refresh_ssh_agent_from_catalog_event;

    #[test]
    fn ssh_agent_hot_reload_filters_non_passmanager_shards() {
        assert!(should_refresh_ssh_agent_from_catalog_event(
            &serde_json::json!({
                "shard_id": ".passmanager"
            })
        ));
        assert!(!should_refresh_ssh_agent_from_catalog_event(
            &serde_json::json!({
                "shard_id": ".wallet"
            })
        ));
        assert!(!should_refresh_ssh_agent_from_catalog_event(
            &serde_json::json!({
                "type": "update"
            })
        ));
        assert!(should_refresh_ssh_agent_from_catalog_event(
            &serde_json::json!({
                "events": [
                    {"shard_id": "docs"},
                    {"shard_id": ".passmanager"}
                ]
            })
        ));
        assert!(!should_refresh_ssh_agent_from_catalog_event(
            &serde_json::json!({
                "events": [
                    {"shard_id": "docs"},
                    {"shard_id": ".wallet"}
                ]
            })
        ));
    }
}
