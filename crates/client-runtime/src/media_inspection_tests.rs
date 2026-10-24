use super::*;
use crate::session::tests::{phase as wait_phase, session};
use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use serde_json::json;
use std::sync::mpsc;
use std::time::Duration;
use tempfile::TempDir;

async fn source(root: &TempDir) -> (Arc<LocalSession>, u64) {
    let runtime = Arc::new(session(root, Arc::new(InMemoryKeystore::new())));
    assert!(
        runtime
            .execute(
                1,
                1,
                RpcRequest::new("vault:unlock", json!({"password":"synthetic inspection"}))
            )
            .await
            .unwrap()
            .is_ok()
    );
    // Same minimal ISO-BMFF track structure used by Core's media inspection fixtures.
    fn atom(kind: &[u8; 4], payload: &[u8]) -> Vec<u8> {
        [
            ((payload.len() + 8) as u32).to_be_bytes().as_slice(),
            kind,
            payload,
        ]
        .concat()
    }
    let handler = [&[0; 8][..], b"vide", &[0; 12][..]].concat();
    let bytes = [
        atom(b"ftyp", b"isom\0\0\0\0isommp42"),
        atom(
            b"moov",
            &atom(b"trak", &atom(b"mdia", &atom(b"hdlr", &handler))),
        ),
    ]
    .concat();
    let RpcReply::Json(response) = runtime.inner.adapter.lock().unwrap().handle_with_stream(
        &RpcRequest::new(
            "catalog:upload",
            json!({"name":"movie.mp4","parent_path":"/","size":bytes.len(),"finish":true}),
        ),
        Some(RpcInputStream::from_bytes(bytes.to_vec())),
    ) else {
        panic!("upload expected")
    };
    assert!(response.is_ok(), "{response:?}");
    let node = response.result().unwrap()["node_id"].as_u64().unwrap();
    (runtime, node)
}
fn request(node: u64) -> RpcRequest {
    RpcRequest::new("catalog:media:inspect", json!({"node_id":node}))
}

#[tokio::test]
async fn ordinary_and_stream_capable_requests_inspect_real_media_and_keep_core_errors_and_cache() {
    let root = TempDir::new().unwrap();
    let (runtime, node) = source(&root).await;
    let peer = runtime.open_peer_session(1).unwrap();
    let result = peer.execute(1, request(node)).await.unwrap();
    assert!(result.is_ok(), "{result:?}");
    assert_eq!(result.result().unwrap()["media_info"]["k"], "video");
    let cache = peer.admit_download(2, request(node)).unwrap();
    let peer_stream::PeerStreamReply::Json(cached) =
        runtime.execute_admitted_download(cache).await.unwrap()
    else {
        panic!("JSON expected")
    };
    assert_eq!(cached.result(), result.result());
    for (id, data, code) in [
        (3, json!({}), "EMPTY_PAYLOAD"),
        (4, json!({"node_id":u64::MAX}), "NODE_NOT_FOUND"),
    ] {
        assert_eq!(
            peer.execute(id, RpcRequest::new("catalog:media:inspect", data))
                .await
                .unwrap()
                .code(),
            Some(code)
        );
    }
    let response = runtime.execute(2, 1, request(node)).await.unwrap();
    assert_eq!(response.result(), result.result());
}

async fn prepared(
    runtime: &LocalSession,
    node: u64,
) -> (AdmittedRequest, Arc<Mutex<MediaInspectionState>>) {
    let admitted = runtime.admit(2, 1, request(node)).unwrap();
    let state = Arc::new(Mutex::new(MediaInspectionState::default()));
    runtime
        .inner
        .authority
        .lock()
        .unwrap()
        .pending
        .get_mut(&admitted.pending.id)
        .unwrap()
        .media = Some(state.clone());
    let response = LocalSession::execute_admitted_phase(
        runtime.inner.clone(),
        runtime.dispatcher.clone(),
        phase(
            &admitted,
            MediaInspectionWork::Prepare {
                state: state.clone(),
                prepared: None,
            },
        ),
    )
    .await
    .unwrap();
    assert!(response.is_ok());
    (admitted, state)
}

#[tokio::test]
async fn a_changed_source_cannot_receive_old_inspection_metadata() {
    let root = TempDir::new().unwrap();
    let (runtime, node) = source(&root).await;
    let (admitted, state) = prepared(&runtime, node).await;
    inspect(
        &state,
        &admitted.pending,
        1,
        &admitted.cancel,
        |snapshot, cancel| snapshot.inspect_metadata(|| cancel.load(Ordering::Acquire)),
    )
    .unwrap();
    let old_revision = state
        .lock()
        .unwrap()
        .snapshot
        .as_ref()
        .unwrap()
        .0
        .source_revision;
    let RpcReply::Json(response) = runtime.inner.adapter.lock().unwrap().handle_with_stream(
        &RpcRequest::new(
            "catalog:file:replace",
            json!({"node_id":node,"size":3,"expected_source_revision":old_revision}),
        ),
        Some(RpcInputStream::from_bytes(b"new".to_vec())),
    ) else {
        panic!("replace expected")
    };
    assert!(response.is_ok());
    let response = LocalSession::execute_admitted_phase(
        runtime.inner.clone(),
        runtime.dispatcher.clone(),
        phase(
            &admitted,
            MediaInspectionWork::Commit {
                state,
                cancellation: InspectionCancellation {
                    request: admitted.cancel.clone(),
                    dispatcher: runtime.dispatcher.clone(),
                    epoch: runtime.dispatcher.low_priority_cancellation_generation(),
                },
            },
        ),
    )
    .await
    .unwrap();
    assert_eq!(response.result().unwrap()["stale"], true);
    assert!(response.result().unwrap()["media_info"].is_null());
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn active_inspection_does_not_hold_core_or_restore_a_revoked_snapshot() {
    let root = TempDir::new().unwrap();
    let (runtime, node) = source(&root).await;
    let (admitted, state) = prepared(&runtime, node).await;
    let (entered_tx, entered_rx) = tokio::sync::oneshot::channel();
    let (release_tx, release_rx) = mpsc::channel();
    let worker_state = state.clone();
    let pending = admitted.pending.clone();
    let cancel = admitted.cancel.clone();
    let worker = tokio::task::spawn_blocking(move || {
        inspect(&worker_state, &pending, 1, &cancel, |snapshot, cancel| {
            entered_tx.send(()).unwrap();
            release_rx.recv_timeout(Duration::from_secs(5)).unwrap();
            snapshot.inspect_metadata(|| cancel.load(Ordering::Acquire))
        })
    });
    entered_rx.await.unwrap();
    let status = tokio::time::timeout(
        Duration::from_secs(2),
        runtime.execute(3, 1, RpcRequest::new("vault:status", json!({}))),
    )
    .await;
    let lock = runtime.lock();
    release_tx.send(()).unwrap(); // Always release controlled work before any assertions.
    assert!(status.unwrap().unwrap().is_ok());
    lock.unwrap();
    assert_eq!(worker.await.unwrap(), Err(SessionError::Revoked));
    assert!(state.lock().unwrap().snapshot.is_none());
    wait_phase(&runtime, SessionPhase::Locked).await;
}

#[tokio::test]
async fn idle_snapshots_are_purged_on_cancel_background_and_app_owner_release() {
    for stop in [0, 1, 2] {
        let root = TempDir::new().unwrap();
        let (runtime, node) = source(&root).await;
        let (admitted, state) = prepared(&runtime, node).await;
        assert!(state.lock().unwrap().snapshot.is_some());
        match stop {
            0 => runtime.cancel(2).unwrap(),
            1 => {
                runtime.deactivate().unwrap();
            }
            _ => drop(runtime),
        }
        assert!(state.lock().unwrap().snapshot.is_none());
        assert!(
            inspect(
                &state,
                &admitted.pending,
                1,
                &admitted.cancel,
                |snapshot, cancel| snapshot.inspect_metadata(|| cancel.load(Ordering::Acquire))
            )
            .is_err()
        );
    }
}

#[test]
fn ordinary_rpc_decoding_uses_the_blocking_pool_and_peer_close_revokes_queued_work() {
    let executor = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .max_blocking_threads(1)
        .build()
        .unwrap();
    executor.block_on(async {
        let root = TempDir::new().unwrap();
        let (runtime, node) = source(&root).await;
        let (entered_tx, entered_rx) = tokio::sync::oneshot::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let occupied = tokio::task::spawn_blocking(move || {
            entered_tx.send(()).unwrap();
            release_rx.recv_timeout(Duration::from_secs(10)).unwrap();
        });
        entered_rx.await.unwrap();
        let peer = runtime.open_peer_session(1).unwrap();
        let admitted = peer.admit(1, request(node)).unwrap();
        let key = admitted.pending.id;
        let operation = tokio::spawn(runtime.execute_admitted(admitted));
        let ready = tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                let state = runtime
                    .inner
                    .authority
                    .lock()
                    .unwrap()
                    .pending
                    .get(&key)
                    .and_then(|control| control.media.clone());
                if state
                    .as_ref()
                    .is_some_and(|state| state.lock().unwrap().snapshot.is_some())
                {
                    break state.unwrap();
                }
                tokio::task::yield_now().await;
            }
        })
        .await;
        let status = tokio::time::timeout(
            Duration::from_secs(2),
            runtime.execute(2, 1, RpcRequest::new("vault:status", json!({}))),
        )
        .await;
        let closed = peer.close();
        let purged = ready
            .as_ref()
            .is_ok_and(|state| state.lock().unwrap().snapshot.is_none());
        release_tx.send(()).unwrap();
        occupied.await.unwrap();
        assert!(
            ready.is_ok(),
            "ordinary RPC did not publish its revocable snapshot"
        );
        assert!(status.unwrap().unwrap().is_ok());
        closed.unwrap();
        assert!(purged);
        assert!(matches!(
            operation.await.unwrap(),
            Err(SessionError::Canceled)
        ));
    });
}

#[tokio::test]
async fn priority_cancellation_between_decode_and_commit_cannot_publish_old_work() {
    let root = TempDir::new().unwrap();
    let (runtime, node) = source(&root).await;
    let (admitted, state) = prepared(&runtime, node).await;
    let cancellation = InspectionCancellation {
        request: admitted.cancel.clone(),
        dispatcher: runtime.dispatcher.clone(),
        epoch: runtime.dispatcher.low_priority_cancellation_generation(),
    };
    inspect(
        &state,
        &admitted.pending,
        1,
        &admitted.cancel,
        |snapshot, cancel| snapshot.inspect_metadata(|| cancel.load(Ordering::Acquire)),
    )
    .unwrap();
    runtime
        .dispatcher
        .begin_command(command_policy("vault:rekey"));
    let result = LocalSession::execute_admitted_phase(
        runtime.inner.clone(),
        runtime.dispatcher.clone(),
        phase(
            &admitted,
            MediaInspectionWork::Commit {
                state: state.clone(),
                cancellation,
            },
        ),
    )
    .await;
    assert!(matches!(result, Err(SessionError::Canceled)));
    let metadata = runtime
        .execute(
            3,
            1,
            RpcRequest::new("catalog:source:metadata", json!({"node_id":node})),
        )
        .await
        .unwrap();
    assert!(metadata.result().unwrap()["media_info"].is_null());
}
