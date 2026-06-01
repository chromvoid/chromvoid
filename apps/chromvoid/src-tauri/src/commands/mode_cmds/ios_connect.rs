use tauri::Emitter;
use tracing::{info, warn};

use crate::catalog_blocking_io::{CatalogBlockingIoError, CatalogBlockingIoRuntimeState};
use std::sync::Arc;

use super::helpers::now_ms;
use super::models::IosPresenceResolution;
use super::noise_handshake::handshake_ik_over_transport;

pub(super) async fn connect_paired_ios_peer(
    app: &tauri::AppHandle,
    catalog_blocking_io_runtime: Arc<CatalogBlockingIoRuntimeState>,
    storage_root: &std::path::Path,
    peer: &crate::network::PairedIosPeer,
) -> Result<
    (
        Box<dyn chromvoid_protocol::RemoteTransport>,
        chromvoid_protocol::NoiseTransport,
    ),
    String,
> {
    let started_at = std::time::Instant::now();
    info!(
        "mode_switch: iOS remote connect start peer_id={} relay_url={}",
        peer.peer_id, peer.relay_url
    );
    let resolution = resolve_ios_presence(app, &peer.relay_url, &peer.peer_id).await?;
    let presence = resolution.presence;
    info!(
        "mode_switch: iOS presence resolved peer_id={} source={} wake_attempted={} room_id={} status={} expires_at_ms={}",
        peer.peer_id,
        resolution.source,
        resolution.wake_attempted,
        presence.room_id,
        presence.status,
        presence.expires_at_ms
    );
    let _ = app.emit(
        "connection:status",
        serde_json::json!({
            "phase": "connecting_transport",
            "peer_id": &peer.peer_id,
            "relay_url": &presence.relay_url,
            "room_id": &presence.room_id,
            "presence_source": resolution.source,
            "wake_attempted": resolution.wake_attempted,
        }),
    );
    let transport = Box::new(
        crate::network::wss_transport::WssTransport::connect_with_context(
            &presence.relay_url,
            &presence.room_id,
            "desktop_remote_connect",
        )
        .await?,
    ) as Box<dyn chromvoid_protocol::RemoteTransport>;

    let identity_path = storage_root.join("network_local_identity.json");
    let identity =
        get_or_create_ios_connect_identity(catalog_blocking_io_runtime, identity_path).await?;
    let client_privkey = hex::decode(&identity.static_privkey_hex)
        .map_err(|e| format!("Bad local identity privkey: {e}"))?;
    let peer_pubkey =
        hex::decode(&peer.peer_pubkey_hex).map_err(|e| format!("Bad iOS peer pubkey: {e}"))?;

    info!(
        "mode_switch: iOS noise IK start peer_id={} room_id={}",
        peer.peer_id, presence.room_id
    );
    let result = handshake_ik_over_transport(transport, &client_privkey, &peer_pubkey).await?;
    let elapsed_ms = started_at.elapsed().as_millis();
    info!(
        "mode_switch: iOS remote connect completed for peer={} source={} room_id={} in {}ms",
        peer.peer_id, resolution.source, presence.room_id, elapsed_ms
    );
    Ok(result)
}

async fn resolve_ios_presence(
    app: &tauri::AppHandle,
    relay_url: &str,
    peer_id: &str,
) -> Result<IosPresenceResolution, String> {
    let mut last_error: Option<String> = None;

    info!(
        "mode_switch: iOS presence resolve start peer_id={} relay_url={}",
        peer_id, relay_url
    );
    if let Ok(presence) = crate::network::fetch_host_presence(relay_url, peer_id).await {
        info!(
            "mode_switch: iOS initial presence peer_id={} room_id={} status={} expires_at_ms={}",
            peer_id, presence.room_id, presence.status, presence.expires_at_ms
        );
        if presence.expires_at_ms > now_ms() && presence.status == "ready" {
            return Ok(IosPresenceResolution {
                presence,
                source: "existing_presence",
                wake_attempted: false,
            });
        }
        last_error = Some(format!(
            "stale initial presence status={} expires_at_ms={}",
            presence.status, presence.expires_at_ms
        ));
    } else {
        info!(
            "mode_switch: iOS initial presence missing or fetch failed peer_id={}",
            peer_id
        );
    }

    let _ = app.emit(
        "connection:status",
        serde_json::json!({ "phase": "waking_ios_host", "peer_id": peer_id }),
    );
    match crate::network::send_wake(relay_url, peer_id).await {
        Ok(response) => {
            info!(
                "mode_switch: iOS wake sent peer_id={} accepted={} status={}",
                peer_id, response.accepted, response.status
            );
        }
        Err(error) => {
            warn!(
                "mode_switch: iOS wake failed peer_id={} error={}",
                peer_id, error
            );
            last_error = Some(error);
        }
    }

    for attempt in 1..=15 {
        match crate::network::fetch_host_presence(relay_url, peer_id).await {
            Ok(presence) if presence.expires_at_ms > now_ms() && presence.status == "ready" => {
                info!(
                    "mode_switch: iOS wake presence ready peer_id={} attempt={} room_id={} expires_at_ms={}",
                    peer_id, attempt, presence.room_id, presence.expires_at_ms
                );
                return Ok(IosPresenceResolution {
                    presence,
                    source: "wake_presence",
                    wake_attempted: true,
                });
            }
            Ok(presence) => {
                info!(
                    "mode_switch: iOS wake presence not ready peer_id={} attempt={} room_id={} status={} expires_at_ms={}",
                    peer_id, attempt, presence.room_id, presence.status, presence.expires_at_ms
                );
                last_error = Some(format!(
                    "iOS host is not ready yet (status={}, expires_at_ms={})",
                    presence.status, presence.expires_at_ms
                ));
            }
            Err(error) => {
                warn!(
                    "mode_switch: iOS wake presence fetch failed peer_id={} attempt={} error={}",
                    peer_id, attempt, error
                );
                last_error = Some(error);
            }
        }
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    }

    Err(last_error.unwrap_or_else(|| "Timed out waiting for iOS host wake".to_string()))
}

async fn get_or_create_ios_connect_identity(
    catalog_blocking_io_runtime: Arc<CatalogBlockingIoRuntimeState>,
    path: std::path::PathBuf,
) -> Result<crate::network::LocalDeviceIdentity, String> {
    match catalog_blocking_io_runtime
        .spawn_blocking(move || {
            let mut store = crate::network::LocalDeviceIdentityStore::load(&path);
            store.get_or_create("ChromVoid Desktop")
        })
        .await
    {
        Ok(result) => result,
        Err(error) => Err(ios_connect_identity_blocking_err(
            error,
            "iOS connect local identity",
        )),
    }
}

fn ios_connect_identity_blocking_err(
    error: CatalogBlockingIoError,
    task_label: &'static str,
) -> String {
    let (error, _code) = error.into_rpc_error(task_label);
    error
}
