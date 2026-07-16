use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use chromvoid_core::catalog::CatalogMediaInfo;
use chromvoid_core::media_inspector::MediaInspectionError;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::CatalogMediaInspectSnapshot;
use tokio::task::JoinSet;
use tracing::{info, warn};

use super::adapter::{run_shared_host_adapter_task, SharedHostRpcAdapter};

const HOST_MEDIA_INSPECTION_SHUTDOWN_GRACE: std::time::Duration = std::time::Duration::from_secs(1);
pub(super) async fn shutdown_host_media_jobs(peer_id: &str, media_jobs: &mut JoinSet<()>) {
    let pending_jobs = media_jobs.len();
    if pending_jobs == 0 {
        return;
    }

    match tokio::time::timeout(HOST_MEDIA_INSPECTION_SHUTDOWN_GRACE, media_jobs.shutdown()).await {
        Ok(()) => {
            info!(
                "mobile_acceptor: host media inspection jobs drained peer_id={} jobs={}",
                peer_id, pending_jobs
            );
        }
        Err(_) => {
            warn!(
                "mobile_acceptor: host media inspection shutdown timed out peer_id={} jobs={}",
                peer_id, pending_jobs
            );
        }
    }
}

pub(super) struct HostMediaInspectionResult {
    pub(super) message_id: u64,
    pub(super) epoch: u64,
    pub(super) snapshot: CatalogMediaInspectSnapshot,
    pub(super) read_ms: u128,
    pub(super) result: Result<Option<CatalogMediaInfo>, MediaInspectionError>,
}

/// A media inspection commit handed to the background commit worker.
///
/// Commits run `commit_catalog_media_inspect` (adapter mutex + `save()`),
/// which can take long enough to stall outgoing stream chunks and RPC
/// handling if awaited inline in the host RPC loop.
pub(super) struct HostMediaCommitJob {
    pub(super) adapter: SharedHostRpcAdapter,
    pub(super) message_id: u64,
    pub(super) epoch: u64,
    pub(super) read_ms: u128,
    pub(super) snapshot: CatalogMediaInspectSnapshot,
    pub(super) media_info: Option<CatalogMediaInfo>,
    pub(super) media_inspected_revision: u64,
}

pub(super) struct HostMediaCommitOutcome {
    pub(super) message_id: u64,
    pub(super) response: Result<RpcResponse, String>,
}

/// Spawn the single background worker that applies media inspection commits
/// off the host RPC loop.
///
/// A single worker (one commit in flight at a time, FIFO) preserves the
/// ordering the previous inline implementation had: commits are applied and
/// their response frames handed back in arrival order. The loop only awaits
/// cheap channel operations; the adapter mutex and `save()` are never awaited
/// inline for media jobs.
pub(super) fn spawn_host_media_commit_worker(
    peer_id: String,
    epoch: Arc<AtomicU64>,
) -> (
    tokio::sync::mpsc::UnboundedSender<HostMediaCommitJob>,
    tokio::sync::mpsc::UnboundedReceiver<HostMediaCommitOutcome>,
    tokio::task::JoinHandle<()>,
) {
    let (job_tx, mut job_rx) = tokio::sync::mpsc::unbounded_channel::<HostMediaCommitJob>();
    let (outcome_tx, outcome_rx) = tokio::sync::mpsc::unbounded_channel::<HostMediaCommitOutcome>();
    let handle = tokio::spawn(async move {
        while let Some(job) = job_rx.recv().await {
            let message_id = job.message_id;
            let response = run_host_media_commit(&peer_id, &epoch, job).await;
            if outcome_tx
                .send(HostMediaCommitOutcome {
                    message_id,
                    response,
                })
                .is_err()
            {
                // Loop is gone; stop draining queued commits.
                break;
            }
        }
    });
    (job_tx, outcome_rx, handle)
}

async fn run_host_media_commit(
    peer_id: &str,
    epoch: &AtomicU64,
    job: HostMediaCommitJob,
) -> Result<RpcResponse, String> {
    // Re-check the epoch right before committing: a cancel (or shutdown epoch
    // bump) that happened while this job sat in the queue must not trigger
    // adapter work.
    let current_epoch = epoch.load(Ordering::SeqCst);
    if job.epoch != current_epoch {
        info!(
            "perf:media_inspection event=stale_discard stage=commit host=true node_id={} job_epoch={} current_epoch={} read_ms={} peer_id={}",
            job.snapshot.node_id, job.epoch, current_epoch, job.read_ms, peer_id
        );
        return Ok(media_inspection_success(
            &job.snapshot,
            job.snapshot.media_info.clone(),
            job.snapshot.media_inspected_revision,
            true,
        ));
    }

    let adapter = job.adapter;
    let node_id = job.snapshot.node_id;
    let read_ms = job.read_ms;
    let job_epoch = job.epoch;
    let commit_snapshot = job.snapshot;
    let commit_media_info = job.media_info;
    let media_inspected_revision = job.media_inspected_revision;
    let committed = run_shared_host_adapter_task(
        adapter.clone(),
        "mobile acceptor media inspect commit",
        move |adapter| {
            adapter.commit_catalog_media_inspect(
                &commit_snapshot,
                commit_media_info,
                media_inspected_revision,
            )
        },
    )
    .await?;
    match committed {
        Some(response) => {
            info!(
                "perf:media_inspection event=commit host=true node_id={} read_ms={} epoch={}",
                node_id, read_ms, job_epoch
            );
            Ok(response)
        }
        None => {
            let fallback_req = RpcRequest::new(
                "catalog:media:inspect",
                serde_json::json!({"node_id": node_id}),
            );
            run_shared_host_adapter_task(
                adapter,
                "mobile acceptor media inspect fallback",
                move |adapter| adapter.handle(&fallback_req),
            )
            .await
        }
    }
}

/// Stop the media commit worker on clean loop exit.
///
/// Dropping the job sender lets the worker finish its in-flight commit and
/// exit; queued jobs are discarded as stale because callers bump the media
/// inspection epoch before invoking this. If the in-flight commit does not
/// finish within the grace period the task is aborted (the underlying
/// `spawn_blocking` commit cannot be interrupted and will detach, same as
/// `JoinSet::shutdown` for blocking media read jobs).
pub(super) async fn shutdown_host_media_commit_worker(
    peer_id: &str,
    job_tx: tokio::sync::mpsc::UnboundedSender<HostMediaCommitJob>,
    handle: tokio::task::JoinHandle<()>,
) {
    drop(job_tx);
    let mut handle = handle;
    match tokio::time::timeout(HOST_MEDIA_INSPECTION_SHUTDOWN_GRACE, &mut handle).await {
        Ok(_) => {
            info!(
                "mobile_acceptor: host media commit worker drained peer_id={}",
                peer_id
            );
        }
        Err(_) => {
            warn!(
                "mobile_acceptor: host media commit worker shutdown timed out peer_id={}; aborting",
                peer_id
            );
            handle.abort();
        }
    }
}

pub(super) fn media_inspection_success(
    snapshot: &CatalogMediaInspectSnapshot,
    media_info: Option<CatalogMediaInfo>,
    media_inspected_revision: u64,
    stale: bool,
) -> RpcResponse {
    let mut result = serde_json::json!({
        "node_id": snapshot.node_id,
        "media_info": media_info,
        "source_revision": snapshot.source_revision,
        "media_inspected_revision": media_inspected_revision,
    });
    if stale {
        if let Some(object) = result.as_object_mut() {
            object.insert("stale".to_string(), serde_json::json!(true));
        }
    }
    RpcResponse::success(result)
}
