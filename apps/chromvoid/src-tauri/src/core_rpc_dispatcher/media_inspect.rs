use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use chromvoid_core::catalog::CatalogMediaInfo;
use chromvoid_core::media_inspector::MediaInspectionError;
use chromvoid_core::rpc::inspect_catalog_media_snapshot;
#[cfg(desktop)]
use chromvoid_core::rpc::types::CORE_FEATURE_REMOTE_MEDIA_INSPECTION_SPLIT_V1;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use tracing::info;

use crate::core_adapter::CoreAdapter;
#[cfg(desktop)]
use crate::core_adapter::RemoteJsonClientHandle;
#[cfg(desktop)]
use crate::core_adapter::{RemoteCancelGroup, RemoteRpcPriority};
use crate::helpers::flush_core_events;
use crate::types::{rpc_err, RpcResult};

use super::{CoreRpcDispatchError, CoreRpcDispatcher, CoreRpcPriority};

enum MediaInspectStart {
    Local(Result<chromvoid_core::rpc::CatalogMediaInspectSnapshot, RpcResponse>),
    #[cfg(desktop)]
    Remote(RemoteJsonClientHandle),
    Fallback,
}

pub(crate) async fn dispatch_media_inspect(
    dispatcher: CoreRpcDispatcher,
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    app: tauri::AppHandle,
    epoch: Arc<AtomicU64>,
    cancellation_generation: u64,
    node_id: u64,
) -> Result<Option<RpcResponse>, RpcResult<serde_json::Value>> {
    let snapshot_epoch = epoch.load(Ordering::SeqCst);
    let snapshot_start = std::time::Instant::now();
    let adapter_for_snapshot = adapter.clone();
    let app_for_snapshot = app.clone();
    let snapshot_phase = dispatcher
        .run_adapter_phase(
            CoreRpcPriority::LowPriority,
            "catalog:media:inspect",
            "snapshot",
            cancellation_generation,
            move || {
                let lock_wait_start = std::time::Instant::now();
                let mut adapter = adapter_for_snapshot.lock().map_err(|_| {
                    rpc_err("Adapter mutex poisoned", Some("INTERNAL".to_string()))
                })?;
                let lock_wait_ms = lock_wait_start.elapsed().as_millis();
                if lock_wait_ms > 5 {
                    info!(
                        "perf:media_inspection event=mutex_wait phase=snapshot command=catalog:media:inspect lock_wait_ms={}",
                        lock_wait_ms
                    );
                }
                let snapshot = match adapter.snapshot_catalog_media_inspect(node_id) {
                    Some(snapshot) => MediaInspectStart::Local(snapshot),
                    None => {
                        #[cfg(desktop)]
                        if let Some(remote_client) = adapter.remote_json_client() {
                            return Ok(MediaInspectStart::Remote(remote_client));
                        }
                        MediaInspectStart::Fallback
                    }
                };
                let _ = adapter.save();
                flush_core_events(&app_for_snapshot, adapter.as_mut());
                Ok(snapshot)
            },
        )
        .await;
    let snapshot_phase = match snapshot_phase {
        Ok(phase) => phase,
        Err(CoreRpcDispatchError::Cancelled) => {
            return Err(rpc_err(
                "rpc_dispatch media inspect snapshot cancelled",
                Some("CANCELLED".to_string()),
            ))
        }
        Err(error) => {
            return Err(rpc_err(
                format!("rpc_dispatch media inspect snapshot dispatcher error: {error}"),
                Some("INTERNAL".to_string()),
            ))
        }
    };
    let snapshot_ms = snapshot_start.elapsed().as_millis();

    #[cfg(desktop)]
    let remote_client = match snapshot_phase.value {
        Ok(MediaInspectStart::Remote(remote_client)) => Some(remote_client),
        Ok(MediaInspectStart::Local(Ok(snapshot))) => {
            let snapshot = Some(snapshot);
            return continue_local_media_inspect(
                dispatcher,
                adapter,
                app,
                epoch,
                cancellation_generation,
                snapshot_epoch,
                snapshot_start,
                snapshot_ms,
                snapshot,
            )
            .await;
        }
        Ok(MediaInspectStart::Local(Err(resp))) => return Ok(Some(resp)),
        Ok(MediaInspectStart::Fallback) => {
            info!(
                "perf:media_inspection event=fallback phase=snapshot command=catalog:media:inspect fallback=true node_id={}",
                node_id
            );
            None
        }
        Err(result) => return Err(result),
    };

    #[cfg(not(desktop))]
    let remote_client: Option<()> = match snapshot_phase.value {
        Ok(MediaInspectStart::Local(Ok(snapshot))) => {
            let snapshot = Some(snapshot);
            return continue_local_media_inspect(
                dispatcher,
                adapter,
                app,
                epoch,
                cancellation_generation,
                snapshot_epoch,
                snapshot_start,
                snapshot_ms,
                snapshot,
            )
            .await;
        }
        Ok(MediaInspectStart::Local(Err(resp))) => return Ok(Some(resp)),
        Ok(MediaInspectStart::Fallback) => {
            info!(
                "perf:media_inspection event=fallback phase=snapshot command=catalog:media:inspect fallback=true node_id={}",
                node_id
            );
            None
        }
        Err(result) => return Err(result),
    };

    #[cfg(desktop)]
    if let Some(remote_client) = remote_client {
        if !remote_client.has_feature(CORE_FEATURE_REMOTE_MEDIA_INSPECTION_SPLIT_V1) {
            info!(
                "perf:media_inspection event=fallback phase=remote command=catalog:media:inspect fallback=true reason=remote_split_unsupported node_id={}",
                node_id
            );
            return Ok(None);
        }

        let req = RpcRequest::new(
            "catalog:media:inspect",
            serde_json::json!({ "node_id": node_id }),
        );
        let remote_start = std::time::Instant::now();
        let remote_phase = dispatcher
            .run_blocking_phase(
                CoreRpcPriority::LowPriority,
                "catalog:media:inspect",
                "remote",
                cancellation_generation,
                move || {
                    remote_client.send_json_blocking(
                        req,
                        RemoteRpcPriority::Low,
                        Some(RemoteCancelGroup::MediaInspection {
                            epoch: snapshot_epoch,
                        }),
                    )
                },
            )
            .await;
        let response = match remote_phase {
            Ok(phase) => phase.value,
            Err(CoreRpcDispatchError::Cancelled) => {
                return Err(rpc_err(
                    "rpc_dispatch remote media inspect cancelled",
                    Some("CANCELLED".to_string()),
                ))
            }
            Err(error) => {
                return Err(rpc_err(
                    format!("rpc_dispatch remote media inspect dispatcher error: {error}"),
                    Some("INTERNAL".to_string()),
                ))
            }
        };
        info!(
            "perf:media_inspection event=remote_split command=catalog:media:inspect node_id={} remote_wait_ms={} epoch={}",
            node_id,
            remote_start.elapsed().as_millis(),
            snapshot_epoch
        );
        return Ok(Some(response));
    }

    #[cfg(not(desktop))]
    let _ = remote_client;

    Ok(None)
}

async fn continue_local_media_inspect(
    dispatcher: CoreRpcDispatcher,
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    app: tauri::AppHandle,
    epoch: Arc<AtomicU64>,
    cancellation_generation: u64,
    snapshot_epoch: u64,
    snapshot_start: std::time::Instant,
    snapshot_ms: u128,
    snapshot: Option<chromvoid_core::rpc::CatalogMediaInspectSnapshot>,
) -> Result<Option<RpcResponse>, RpcResult<serde_json::Value>> {
    let Some(snapshot) = snapshot else {
        return Ok(None);
    };

    if snapshot.inspection_complete {
        info!(
            "perf:media_inspection event=cached_skip command=catalog:media:inspect cached_skip=true node_id={} source_revision={} media_inspected_revision={} snapshot_ms={}",
            snapshot.node_id,
            snapshot.source_revision,
            snapshot.media_inspected_revision,
            snapshot_ms
        );
        return Ok(Some(RpcResponse::success(serde_json::json!({
            "node_id": snapshot.node_id,
            "media_info": snapshot.media_info,
            "source_revision": snapshot.source_revision,
            "media_inspected_revision": snapshot.media_inspected_revision,
        }))));
    }

    let read_epoch = epoch.clone();
    let snapshot_for_read = snapshot.clone();
    let read_start = std::time::Instant::now();
    let read_phase = dispatcher
        .run_blocking_phase(
            CoreRpcPriority::LowPriority,
            "catalog:media:inspect",
            "read",
            cancellation_generation,
            move || {
                inspect_catalog_media_snapshot(&snapshot_for_read, || {
                    read_epoch.load(Ordering::SeqCst) != snapshot_epoch
                })
            },
        )
        .await;
    let read_result = match read_phase {
        Ok(phase) => phase.value,
        Err(CoreRpcDispatchError::Cancelled) => Err(MediaInspectionError::Cancelled),
        Err(error) => {
            return Err(rpc_err(
                format!("rpc_dispatch media inspect read dispatcher error: {error}"),
                Some("INTERNAL".to_string()),
            ))
        }
    };
    let read_ms = read_start.elapsed().as_millis();

    let (media_info, media_inspected_revision, should_commit): (
        Option<CatalogMediaInfo>,
        u64,
        bool,
    ) = match read_result {
        Ok(media_info) => {
            let media_inspected_revision = if media_info.is_some() || snapshot.inspection_candidate
            {
                snapshot.source_revision
            } else {
                0
            };
            (media_info, media_inspected_revision, true)
        }
        Err(MediaInspectionError::Cancelled) => {
            info!(
                "perf:media_inspection event=cancelled phase=read command=catalog:media:inspect cancelled=true node_id={} read_ms={}",
                snapshot.node_id, read_ms
            );
            (None, 0, false)
        }
        Err(error) => {
            tracing::warn!(
                "perf:media_inspection event=read_error phase=read command=catalog:media:inspect node_id={} read_ms={} error={:?}",
                snapshot.node_id,
                read_ms,
                error
            );
            (None, 0, false)
        }
    };

    let resp = if should_commit && epoch.load(Ordering::SeqCst) == snapshot_epoch {
        let adapter_for_commit = adapter.clone();
        let app_for_commit = app.clone();
        let snapshot_for_commit = snapshot.clone();
        let media_info_for_commit = media_info.clone();
        let commit_start = std::time::Instant::now();
        let commit_phase = dispatcher
            .run_adapter_phase(
                CoreRpcPriority::LowPriority,
                "catalog:media:inspect",
                "commit",
                cancellation_generation,
                move || {
                    let lock_wait_start = std::time::Instant::now();
                    let mut adapter = adapter_for_commit.lock().map_err(|_| {
                        rpc_err("Adapter mutex poisoned", Some("INTERNAL".to_string()))
                    })?;
                    let lock_wait_ms = lock_wait_start.elapsed().as_millis();
                    if lock_wait_ms > 5 {
                        info!(
                            "perf:media_inspection event=mutex_wait phase=commit command=catalog:media:inspect lock_wait_ms={}",
                            lock_wait_ms
                        );
                    }
                    let response = adapter
                        .commit_catalog_media_inspect(
                            &snapshot_for_commit,
                            media_info_for_commit,
                            media_inspected_revision,
                        )
                        .unwrap_or_else(|| {
                            adapter.handle(&RpcRequest::new(
                                "catalog:media:inspect".to_string(),
                                serde_json::json!({"node_id": snapshot_for_commit.node_id}),
                            ))
                        });
                    let _ = adapter.save();
                    flush_core_events(&app_for_commit, adapter.as_mut());
                    Ok::<RpcResponse, RpcResult<serde_json::Value>>(response)
                },
            )
            .await;

        match commit_phase {
            Ok(phase) => match phase.value {
                Ok(resp) => {
                    info!(
                        "perf:media_inspection event=timing command=catalog:media:inspect node_id={} snapshot_ms={} read_ms={} commit_ms={} dispatcher_wait_ms={} adapter_phase_ms={}",
                        snapshot.node_id,
                        snapshot_ms,
                        read_ms,
                        commit_start.elapsed().as_millis(),
                        phase.timing.dispatcher_wait_ms,
                        phase.timing.adapter_phase_ms
                    );
                    resp
                }
                Err(result) => return Err(result),
            },
            Err(CoreRpcDispatchError::Cancelled) => RpcResponse::success(serde_json::json!({
                "node_id": snapshot.node_id,
                "media_info": media_info,
                "source_revision": snapshot.source_revision,
                "media_inspected_revision": media_inspected_revision,
            })),
            Err(error) => {
                return Err(rpc_err(
                    format!("rpc_dispatch media inspect commit dispatcher error: {error}"),
                    Some("INTERNAL".to_string()),
                ))
            }
        }
    } else {
        RpcResponse::success(serde_json::json!({
            "node_id": snapshot.node_id,
            "media_info": media_info,
            "source_revision": snapshot.source_revision,
            "media_inspected_revision": media_inspected_revision,
        }))
    };

    info!(
        "perf:media_inspection event=done command=catalog:media:inspect dt_ms={}",
        snapshot_start.elapsed().as_millis()
    );
    Ok(Some(resp))
}
