use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tracing::{info, warn};

use super::super::ios_control::{
    create_pairing_session, fetch_wake_request, publish_host_presence, CreatePairingSessionRequest,
    PublishHostPresenceRequest,
};
use super::super::mobile_acceptor::{self, MobileAcceptorRuntimeState};
use super::pairing_session::run_pairing_responder;
use super::state::{
    load_persisted_host_mode_blocking, should_republish_presence_for_active_acceptor,
    update_persisted_host_mode_blocking, IosHostRuntimeState,
};
use super::{
    generate_room_id_for, load_or_create_identity_blocking, IosHostPhase, IosHostStatus,
    HOST_PRESENCE_TTL_MS,
};
use crate::core_adapter::CoreAdapter;

const APP_EXIT_OFFLINE_PRESENCE_TIMEOUT: Duration = Duration::from_secs(1);

async fn pending_wake_requested(relay_url: &str, peer_id: &str) -> Result<bool, String> {
    let wake = fetch_wake_request(relay_url, peer_id).await?;
    Ok(wake.is_some_and(|request| request.status == "waking"))
}

pub async fn handle_pending_wake_if_enabled(
    runtime: Arc<IosHostRuntimeState>,
    acceptor_runtime: Arc<MobileAcceptorRuntimeState>,
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    storage_root: &Path,
) -> Result<Option<IosHostStatus>, String> {
    let config = load_persisted_host_mode_blocking(
        storage_root.to_path_buf(),
        "iOS pending wake host mode load",
    )
    .await?;
    if !config.enabled {
        info!("ios_pairing: pending wake check skipped because host mode is disabled");
        return Ok(None);
    }

    let relay_url = config
        .relay_url
        .as_deref()
        .map(str::trim)
        .filter(|url| !url.is_empty())
        .ok_or("ios host mode is enabled but relay_url is missing".to_string())?;

    let identity = load_or_create_identity_blocking(
        storage_root.to_path_buf(),
        "ChromVoid iPhone".to_string(),
        "iOS pending wake identity",
    )
    .await?;
    let pending_wake = pending_wake_requested(relay_url, &identity.device_id).await?;
    info!(
        "ios_pairing: pending wake check peer_id={} relay_url={} pending_wake={}",
        identity.device_id, relay_url, pending_wake
    );
    if !pending_wake {
        return Ok(None);
    }

    info!(
        "ios_pairing: pending wake detected for peer_id={}, refreshing presence",
        identity.device_id
    );
    let status = handle_wake(runtime, acceptor_runtime, adapter, relay_url, storage_root).await?;
    Ok(Some(status))
}

pub async fn resume_host_mode_if_enabled(
    runtime: Arc<IosHostRuntimeState>,
    acceptor_runtime: Arc<MobileAcceptorRuntimeState>,
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    storage_root: &Path,
) -> Result<Option<IosHostStatus>, String> {
    let config =
        load_persisted_host_mode_blocking(storage_root.to_path_buf(), "iOS resume host mode load")
            .await?;
    if !config.enabled {
        info!("ios_pairing: resume host mode skipped because host mode is disabled");
        return Ok(None);
    }

    let relay_url = config
        .relay_url
        .as_deref()
        .map(str::trim)
        .filter(|url| !url.is_empty())
        .ok_or("ios host mode is enabled but relay_url is missing".to_string())?;

    let acceptor = mobile_acceptor::get_status(&acceptor_runtime)?;
    let status = runtime.host_status()?;
    info!(
        "ios_pairing: resume host mode check relay_url={} acceptor_state={:?} acceptor_room_id={:?}",
        relay_url, acceptor.state, acceptor.room_id
    );
    if should_republish_presence_for_active_acceptor(relay_url, &acceptor, &status) {
        info!(
            "ios_pairing: resume host mode republishing stale or missing presence relay_url={} room_id={:?}",
            relay_url, acceptor.room_id
        );
        return match publish_presence(
            runtime.clone(),
            acceptor_runtime.clone(),
            relay_url,
            storage_root,
        )
        .await
        {
            Ok(status) => Ok(Some(status)),
            Err(error) => {
                warn!(
                    "ios_pairing: resume host mode failed to republish presence, falling back to wake flow: {error}"
                );
                let status =
                    handle_wake(runtime, acceptor_runtime, adapter, relay_url, storage_root)
                        .await?;
                Ok(Some(status))
            }
        };
    }

    if matches!(
        acceptor.state,
        mobile_acceptor::AcceptorState::Listening | mobile_acceptor::AcceptorState::Connected
    ) && acceptor.relay_url.as_deref() == Some(relay_url)
    {
        info!(
            "ios_pairing: resume host mode reusing active acceptor relay_url={} room_id={:?}",
            relay_url, acceptor.room_id
        );
        return Ok(Some(status));
    }

    info!(
        "ios_pairing: resume host mode starting fresh wake flow relay_url={}",
        relay_url
    );
    let status = handle_wake(runtime, acceptor_runtime, adapter, relay_url, storage_root).await?;
    Ok(Some(status))
}

pub async fn handle_pending_wake_or_resume_host_mode(
    runtime: Arc<IosHostRuntimeState>,
    acceptor_runtime: Arc<MobileAcceptorRuntimeState>,
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    storage_root: &Path,
) -> Result<Option<IosHostStatus>, String> {
    if let Some(status) = handle_pending_wake_if_enabled(
        runtime.clone(),
        acceptor_runtime.clone(),
        adapter.clone(),
        storage_root,
    )
    .await?
    {
        return Ok(Some(status));
    }

    resume_host_mode_if_enabled(runtime, acceptor_runtime, adapter, storage_root).await
}

pub async fn start_host_mode(
    runtime: Arc<IosHostRuntimeState>,
    acceptor_runtime: Arc<MobileAcceptorRuntimeState>,
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    relay_url: &str,
    storage_root: &Path,
    fallback_label: &str,
) -> Result<IosHostStatus, String> {
    if relay_url.trim().is_empty() {
        return Err("relay_url is required".to_string());
    }

    if let Err(error) = update_persisted_host_mode_blocking(
        storage_root.to_path_buf(),
        Some(relay_url.to_string()),
        false,
        "iOS host mode pairing persistence",
    )
    .await
    {
        warn!("ios_pairing: failed to persist pairing relay_url: {error}");
    }

    let identity = load_or_create_identity_blocking(
        storage_root.to_path_buf(),
        fallback_label.to_string(),
        "iOS host mode identity",
    )
    .await?;
    info!(
        "ios_pairing: start_host_mode:created_pairing_session peer_id={} relay_url={}",
        identity.device_id, relay_url
    );
    let session = create_pairing_session(
        relay_url,
        &CreatePairingSessionRequest {
            peer_id: identity.device_id.clone(),
            device_label: identity.device_label.clone(),
            peer_pubkey_hex: identity.static_pubkey_hex.clone(),
            relay_url: relay_url.to_string(),
        },
    )
    .await?;
    info!(
        "ios_pairing: start_host_mode:session_ready session_id={} room_id={} expires_at_ms={}",
        session.session_id, session.room_id, session.expires_at_ms
    );

    let responder_generation = runtime.begin_responder_task()?;
    let status = match runtime.set_status(|state| {
        state.phase = IosHostPhase::Pairing;
        state.relay_url = Some(relay_url.to_string());
        state.device_id = Some(identity.device_id.clone());
        state.device_label = Some(identity.device_label.clone());
        state.pairing_pin = Some(session.pin.clone());
        state.pairing_offer = Some(session.offer.clone());
        state.expires_at_ms = Some(session.expires_at_ms);
        state.presence = None;
        state.paired_peer_id = None;
        state.error = None;
    }) {
        Ok(status) => status,
        Err(error) => {
            let _ = runtime.cancel_responder_task();
            return Err(error);
        }
    };

    let storage_root = storage_root.to_path_buf();
    let identity_clone = identity.clone();
    let runtime_clone = runtime.clone();
    let acceptor_runtime_clone = acceptor_runtime.clone();
    let adapter_clone = adapter.clone();
    let responder_handle = tauri::async_runtime::spawn(async move {
        if let Err(error) = run_pairing_responder(
            runtime_clone.clone(),
            acceptor_runtime_clone,
            adapter_clone,
            session,
            storage_root,
            identity_clone,
            responder_generation,
        )
        .await
        {
            warn!("ios_pairing: host mode failed: {error}");
            if runtime_clone.is_responder_generation_current(responder_generation) {
                let _ = runtime_clone.set_status(|state| {
                    state.phase = IosHostPhase::Error;
                    state.error = Some(error);
                });
            }
        }
        let _ = runtime_clone.clear_responder_task_if_current(responder_generation);
    });
    if let Err(error) = runtime.store_responder_task(responder_generation, responder_handle) {
        let _ = runtime.set_status(|state| {
            state.phase = IosHostPhase::Error;
            state.error = Some(error.clone());
        });
        return Err(error);
    }

    Ok(status)
}

pub async fn stop_host_mode(
    runtime: Arc<IosHostRuntimeState>,
    acceptor_runtime: Arc<MobileAcceptorRuntimeState>,
    storage_root: &Path,
) -> Result<IosHostStatus, String> {
    runtime.cancel_responder_task()?;
    let current = runtime.host_status()?;
    let _ = mobile_acceptor::stop_listening(&acceptor_runtime);

    if let (Some(relay_url), Some(device_id), Some(presence)) = (
        current.relay_url.clone(),
        current.device_id.clone(),
        current.presence.clone(),
    ) {
        let relay_url_for_body = relay_url.clone();
        let _ = publish_host_presence(
            &relay_url,
            &device_id,
            &PublishHostPresenceRequest {
                relay_url: relay_url_for_body,
                room_id: presence.room_id,
                status: "offline".to_string(),
                ttl_ms: Some(1_000),
            },
        )
        .await;
    }

    if let Err(error) = update_persisted_host_mode_blocking(
        storage_root.to_path_buf(),
        current.relay_url.clone(),
        false,
        "iOS host mode disable persistence",
    )
    .await
    {
        warn!("ios_pairing: failed to disable persisted host mode: {error}");
    }

    if let Err(error) = crate::mobile::ios::background_refresh::cancel() {
        warn!("ios_pairing: failed to cancel background refresh: {error}");
    }

    runtime.set_status(|state| *state = IosHostStatus::default())
}

pub async fn shutdown_host_mode_for_app_exit(
    runtime: Arc<IosHostRuntimeState>,
    acceptor_runtime: Arc<MobileAcceptorRuntimeState>,
) -> Result<IosHostStatus, String> {
    let cancel_result = runtime.cancel_responder_task();
    let current = match runtime.host_status() {
        Ok(status) => Some(status),
        Err(error) => {
            warn!("ios_pairing: failed to read host status during app exit: {error}");
            None
        }
    };

    if let Err(error) = mobile_acceptor::stop_listening(&acceptor_runtime) {
        warn!("ios_pairing: failed to stop mobile acceptor during app exit: {error}");
    }

    if let Some(current) = current.as_ref() {
        publish_offline_presence_for_app_exit(current).await;
    }

    let status_result = runtime.set_status(|state| *state = IosHostStatus::default());

    if let Err(error) = cancel_result {
        return Err(error);
    }
    status_result
}

async fn publish_offline_presence_for_app_exit(current: &IosHostStatus) {
    let (Some(relay_url), Some(device_id), Some(presence)) = (
        current.relay_url.as_ref(),
        current.device_id.as_ref(),
        current.presence.as_ref(),
    ) else {
        return;
    };

    let request = PublishHostPresenceRequest {
        relay_url: relay_url.clone(),
        room_id: presence.room_id.clone(),
        status: "offline".to_string(),
        ttl_ms: Some(1_000),
    };
    match tokio::time::timeout(
        APP_EXIT_OFFLINE_PRESENCE_TIMEOUT,
        publish_host_presence(relay_url, device_id, &request),
    )
    .await
    {
        Ok(Ok(_)) => {}
        Ok(Err(error)) => {
            warn!("ios_pairing: failed to publish offline presence during app exit: {error}");
        }
        Err(_) => {
            warn!(
                "ios_pairing: offline presence publish timed out after {:?} during app exit",
                APP_EXIT_OFFLINE_PRESENCE_TIMEOUT
            );
        }
    }
}

pub async fn publish_presence(
    runtime: Arc<IosHostRuntimeState>,
    acceptor_runtime: Arc<MobileAcceptorRuntimeState>,
    relay_url: &str,
    storage_root: &Path,
) -> Result<IosHostStatus, String> {
    let identity = load_or_create_identity_blocking(
        storage_root.to_path_buf(),
        "ChromVoid iPhone".to_string(),
        "iOS presence identity",
    )
    .await?;
    let acceptor = mobile_acceptor::get_status(&acceptor_runtime)?;
    let room_id = acceptor
        .room_id
        .clone()
        .ok_or("acceptor has no active room_id".to_string())?;
    info!(
        "ios_pairing: publish_presence peer_id={} relay_url={} room_id={} acceptor_state={:?}",
        identity.device_id, relay_url, room_id, acceptor.state
    );

    let presence = publish_host_presence(
        relay_url,
        &identity.device_id,
        &PublishHostPresenceRequest {
            relay_url: relay_url.to_string(),
            room_id,
            status: "ready".to_string(),
            ttl_ms: Some(HOST_PRESENCE_TTL_MS),
        },
    )
    .await?;

    if let Err(error) = update_persisted_host_mode_blocking(
        storage_root.to_path_buf(),
        Some(relay_url.to_string()),
        true,
        "iOS host mode ready persistence",
    )
    .await
    {
        warn!("ios_pairing: failed to persist ready host mode: {error}");
    }

    if let Err(error) =
        crate::network::ios_push::sync_push_registration_for_relay(relay_url, storage_root).await
    {
        warn!("ios_pairing: failed to sync push registration: {error}");
    }

    if let Err(error) = crate::mobile::ios::background_refresh::schedule() {
        warn!("ios_pairing: failed to schedule background refresh: {error}");
    }

    info!(
        "ios_pairing: publish_presence:ready peer_id={} room_id={} expires_at_ms={}",
        identity.device_id, presence.room_id, presence.expires_at_ms
    );
    runtime.set_status(|state| {
        state.phase = IosHostPhase::Ready;
        state.relay_url = Some(relay_url.to_string());
        state.device_id = Some(identity.device_id.clone());
        state.device_label = Some(identity.device_label.clone());
        state.presence = Some(presence);
        state.error = None;
    })
}

pub async fn handle_wake(
    runtime: Arc<IosHostRuntimeState>,
    acceptor_runtime: Arc<MobileAcceptorRuntimeState>,
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    relay_url: &str,
    storage_root: &Path,
) -> Result<IosHostStatus, String> {
    let identity = load_or_create_identity_blocking(
        storage_root.to_path_buf(),
        "ChromVoid iPhone".to_string(),
        "iOS wake identity",
    )
    .await?;
    let acceptor = mobile_acceptor::get_status(&acceptor_runtime)?;
    info!(
        "ios_pairing: handle_wake:start peer_id={} relay_url={} previous_state={:?} previous_room_id={:?} reuse_existing_acceptor=false",
        identity.device_id, relay_url, acceptor.state, acceptor.room_id
    );
    let room_id = generate_room_id_for("handle_wake");
    info!(
        "ios_pairing: handle_wake:restarting_acceptor peer_id={} room_id={}",
        identity.device_id, room_id
    );
    let _ = mobile_acceptor::stop_listening(&acceptor_runtime);
    mobile_acceptor::start_listening(
        acceptor_runtime.clone(),
        adapter,
        relay_url,
        &room_id,
        storage_root,
    )
    .await?;

    let presence = publish_host_presence(
        relay_url,
        &identity.device_id,
        &PublishHostPresenceRequest {
            relay_url: relay_url.to_string(),
            room_id,
            status: "ready".to_string(),
            ttl_ms: Some(HOST_PRESENCE_TTL_MS),
        },
    )
    .await?;

    if let Err(error) = update_persisted_host_mode_blocking(
        storage_root.to_path_buf(),
        Some(relay_url.to_string()),
        true,
        "iOS host mode wake persistence",
    )
    .await
    {
        warn!("ios_pairing: failed to persist wake host mode: {error}");
    }

    if let Err(error) =
        crate::network::ios_push::sync_push_registration_for_relay(relay_url, storage_root).await
    {
        warn!("ios_pairing: failed to sync push registration after wake: {error}");
    }

    if let Err(error) = crate::mobile::ios::background_refresh::schedule() {
        warn!("ios_pairing: failed to schedule background refresh after wake: {error}");
    }

    info!(
        "ios_pairing: handle_wake:ready peer_id={} room_id={} expires_at_ms={}",
        identity.device_id, presence.room_id, presence.expires_at_ms
    );
    runtime.set_status(|state| {
        state.phase = IosHostPhase::Ready;
        state.relay_url = Some(relay_url.to_string());
        state.device_id = Some(identity.device_id.clone());
        state.device_label = Some(identity.device_label.clone());
        state.presence = Some(presence);
        state.error = None;
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn app_exit_shutdown_cancels_responder_and_resets_status() {
        let runtime = Arc::new(IosHostRuntimeState::new());
        let acceptor_runtime = Arc::new(MobileAcceptorRuntimeState::new());
        let generation = runtime.begin_responder_task().expect("begin responder");
        let handle = tauri::async_runtime::spawn(std::future::pending::<()>());
        runtime
            .store_responder_task(generation, handle)
            .expect("store responder");

        let status = shutdown_host_mode_for_app_exit(runtime.clone(), acceptor_runtime)
            .await
            .expect("app exit shutdown");

        assert_eq!(status.phase, IosHostPhase::Idle);
        assert!(!runtime.is_responder_generation_current(generation));
    }
}
