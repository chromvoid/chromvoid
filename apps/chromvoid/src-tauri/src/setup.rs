use std::sync::Arc;
use std::sync::Mutex;

use tauri::Manager;
use tracing::{error, info};
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use crate::app_state::AppState;
use crate::auto_lock;
use crate::core_adapter::LocalCoreAdapter;
use crate::helpers::{boxed_error, emit_basic_state, load_storage_root};
use crate::types::*;

#[cfg(desktop)]
use crate::shutdown::{spawn_shutdown_signal_listener, VaultSleepHandler};
#[cfg(desktop)]
use crate::sleep_watcher::PlatformSleepWatcher;

#[cfg(target_os = "macos")]
use crate::commands::volume_ops::{
    macos_diskutil_unmount_force, macos_mountpoint_is_unhealthy, macos_path_looks_mounted,
};

fn mirrored_logs_dir() -> Option<std::path::PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(
        std::path::PathBuf::from(home)
            .join("kaifaty")
            .join("chromvoid_logs"),
    )
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

    // ── FUSE event bridge ─────────────────────────────────────────────
    #[cfg(not(mobile))]
    let handle = app.handle();

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        crate::volume_fuse::set_fuse_event_app_handle(handle.clone());
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

    let adapter = LocalCoreAdapter::new(storage_root.clone()).map_err(|e| {
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
        "main: loaded session_settings: auto_lock_timeout_secs={}, lock_on_sleep={}, lock_on_mobile_background={}, require_biometric_app_gate={}, keep_screen_awake_when_unlocked={}",
        session_settings.auto_lock_timeout_secs,
        session_settings.lock_on_sleep,
        session_settings.lock_on_mobile_background,
        session_settings.require_biometric_app_gate,
        session_settings.keep_screen_awake_when_unlocked
    );

    #[cfg(desktop)]
    let app_handle = app.handle().clone();
    let storage_root_clone = storage_root.clone();
    let last_activity = Arc::new(Mutex::new(std::time::Instant::now()));
    #[cfg(desktop)]
    let lock_on_sleep = session_settings.lock_on_sleep;

    // ── Sleep watcher (desktop) ───────────────────────────────────────
    #[cfg(desktop)]
    let sleep_watcher = if lock_on_sleep {
        let handler = VaultSleepHandler {
            app_handle: app_handle.clone(),
            storage_root: Arc::new(Mutex::new(storage_root_clone.clone())),
            adapter: adapter_arc.clone(),
            lock_on_sleep,
            last_activity: last_activity.clone(),
        };
        match PlatformSleepWatcher::new(Box::new(handler)) {
            Ok(watcher) => Some(watcher),
            Err(e) => {
                error!("main: Failed to create sleep watcher: {}", e);
                None
            }
        }
    } else {
        None
    };

    crate::network::mobile_acceptor::register_shared_app_adapter(adapter_arc.clone());

    #[cfg(target_os = "android")]
    crate::mobile::android::register_shared_app_adapter(adapter_arc.clone());

    #[cfg(any(target_os = "ios", target_os = "macos"))]
    crate::credential_provider_bridge::register_shared_app_adapter(adapter_arc.clone());

    // ── AppState ──────────────────────────────────────────────────────
    app.manage(AppState {
        adapter: adapter_arc,
        storage_root: Arc::new(Mutex::new(storage_root_clone)),
        #[cfg(desktop)]
        gateway: Arc::new(Mutex::new(crate::gateway::GatewayState::load_or_default(
            data_dir.join("gateway.json"),
        ))),
        session_settings: Arc::new(Mutex::new(session_settings)),
        mobile_is_foreground: Arc::new(Mutex::new(cfg!(mobile))),
        last_activity,
        backup_cancel_requested: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        restore_cancel_requested: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        #[cfg(desktop)]
        volume_manager: Arc::new(Mutex::new(crate::volume_manager::VolumeManager::new())),
        #[cfg(desktop)]
        exit_in_progress: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        #[cfg(desktop)]
        _sleep_watcher: sleep_watcher,
        #[cfg(desktop)]
        ssh_agent: Arc::new(Mutex::new(crate::ssh_agent::SshAgentState::new())),
    });

    #[cfg(target_os = "ios")]
    crate::mobile::ios::background_refresh::setup(storage_root.clone());

    #[cfg(target_os = "ios")]
    crate::mobile::ios::app_lifecycle::setup(app.handle().clone(), storage_root.clone());

    #[cfg(target_os = "ios")]
    crate::mobile::ios::push_bridge::setup(storage_root.clone());

    // ── Shutdown signal listener (desktop) ────────────────────────────
    #[cfg(desktop)]
    spawn_shutdown_signal_listener(app.handle().clone());

    // ── Stale mount cleanup (macOS) ───────────────────────────────────
    #[cfg(target_os = "macos")]
    {
        let data_dir = data_dir.clone();
        tauri::async_runtime::spawn(async move {
            let candidates = [
                std::path::PathBuf::from("/Volumes/ChromVoid"),
                data_dir.join("volume"),
            ];

            for mp in candidates {
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
        });
    }

    // ── Auto-lock thread ──────────────────────────────────────────────
    auto_lock::spawn_auto_lock_thread(app.handle().clone());

    // ── Gateway server (desktop) ──────────────────────────────────────
    #[cfg(desktop)]
    crate::gateway::spawn_gateway_server(app.handle().clone());

    // ── macOS Credential Provider IPC bridge ──────────────────────────
    crate::credential_provider_bridge::spawn_credential_provider_bridge(app.handle().clone());

    // ── Emit initial state ────────────────────────────────────────────
    {
        let state = app.state::<AppState>();
        let adapter = state
            .adapter
            .lock()
            .map_err(|_| boxed_error("Adapter mutex poisoned"))?;
        crate::ios_keep_awake::sync_ios_idle_timer(app.handle(), adapter.as_ref());
        emit_basic_state(app.handle(), &storage_root, adapter.as_ref());
    }

    Ok(())
}
