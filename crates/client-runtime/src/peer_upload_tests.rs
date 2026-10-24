use super::*;
use crate::session::file_writer::{FileWriteError, FileWriteTarget};
use crate::session::peer_session::PeerSession;
use crate::session::tests::session;
use chromvoid_core::crypto::keystore::InMemoryKeystore;
use serde_json::json;
use tempfile::TempDir;

async fn setup(root: &TempDir) -> (Arc<LocalSession>, PeerSession) {
    let runtime = Arc::new(session(root, Arc::new(InMemoryKeystore::new())));
    assert!(
        runtime
            .execute(
                1,
                1,
                RpcRequest::new("vault:unlock", json!({"password":"synthetic peer upload"}))
            )
            .await
            .unwrap()
            .is_ok()
    );
    let peer = runtime.open_peer_session(1).unwrap();
    (runtime, peer)
}
fn target() -> FileWriteTarget {
    FileWriteTarget {
        parent_path: "/".into(),
        name: "native.bin".into(),
        mime_type: None,
        byte_count: 2,
    }
}
async fn fence(runtime: &LocalSession) {
    runtime
        .dispatcher
        .run_adapter_phase(
            CoreRpcPriority::UserBlocking,
            "test:upload-fence",
            "test",
            runtime.dispatcher.low_priority_cancellation_generation(),
            || (),
        )
        .await
        .unwrap();
}
async fn read(runtime: &LocalSession, node: u64) -> Vec<u8> {
    let RpcReply::Stream(mut stream) = runtime.inner.adapter.lock().unwrap().handle_with_stream(
        &RpcRequest::new("catalog:download", json!({"node_id":node})),
        None,
    ) else {
        panic!("committed file expected")
    };
    let mut result = Vec::new();
    stream.reader.read_to_end(&mut result).unwrap();
    result
}
async fn request(
    runtime: &LocalSession,
    peer: &PeerSession,
    id: u64,
    command: &str,
    data: serde_json::Value,
    bytes: &[u8],
) -> serde_json::Value {
    let mut admitted = peer
        .admit_upload(id, RpcRequest::new(command, data))
        .unwrap();
    if !bytes.is_empty() {
        let split = bytes.len().div_ceil(2);
        for part in [&bytes[..split], &bytes[split..]] {
            if !part.is_empty() {
                assert!(
                    runtime
                        .execute_upload_frame(&mut admitted, part.to_vec(), false)
                        .await
                        .unwrap()
                        .is_none()
                );
            }
        }
    }
    let response = runtime
        .execute_upload_frame(&mut admitted, Vec::new(), true)
        .await
        .unwrap()
        .unwrap();
    assert!(response.is_ok(), "{response:?}");
    response.result().unwrap().clone()
}

#[tokio::test]
async fn one_admission_per_wire_request_preserves_multiframe_and_multirequest_core_transactions() {
    let root = TempDir::new().unwrap();
    let (runtime, peer) = setup(&root).await;
    let first = request(
        &runtime,
        &peer,
        1,
        "catalog:upload",
        json!({"name":"peer.bin","parent_path":"/","size":3,"total_size":8,"finish":false}),
        b"abc",
    )
    .await;
    assert_eq!(first["completed"], false);
    assert!(matches!(
        runtime.begin_file_writer(1, target()),
        Err(FileWriteError::Session(SessionError::Busy))
    ));
    let node = first["node_id"].as_u64().unwrap();
    let second = request(
        &runtime,
        &peer,
        2,
        "catalog:upload",
        json!({"node_id":node,"offset":3,"size":5,"total_size":8,"finish":true}),
        b"defgh",
    )
    .await;
    assert_eq!(second["completed"], true);
    assert_eq!(second["uploaded_bytes"], 8);
    assert_eq!(read(&runtime, node).await, b"abcdefgh");
    let overwrite = request(
        &runtime,
        &peer,
        3,
        "catalog:upload",
        json!({"node_id":node,"offset":0,"size":2,"finish":true}),
        b"xy",
    )
    .await;
    assert_eq!(overwrite["created"], false);
    assert_eq!(read(&runtime, node).await, b"xy");
    // Secret write defaults must refer to the complete RPC, not the first frame.
    request(
        &runtime,
        &peer,
        4,
        "catalog:secret:write",
        json!({"node_id":node,"offset":0,"size":6}),
        b"secret",
    )
    .await;
    assert_eq!(read(&runtime, node).await, b"secret");
    let empty = request(
        &runtime,
        &peer,
        5,
        "catalog:upload",
        json!({"name":"empty","parent_path":"/","size":0,"finish":true}),
        b"",
    )
    .await;
    assert!(
        read(&runtime, empty["node_id"].as_u64().unwrap())
            .await
            .is_empty()
    );
    let native = runtime.begin_file_writer(1, target()).unwrap();
    native.cancel_and_wait().await.unwrap();
}

#[tokio::test]
async fn disconnect_cancels_only_the_peers_incomplete_writer_and_releases_native_admission() {
    let root = TempDir::new().unwrap();
    let (runtime, peer) = setup(&root).await;
    let native = runtime.begin_file_writer(1, target()).unwrap();
    let attempted = peer.admit_upload(
        1,
        RpcRequest::new("catalog:upload", json!({"name":"peer","size":2})),
    );
    assert!(matches!(
        attempted,
        Err(PeerUploadError::Session(SessionError::Busy))
    ));
    peer.close().unwrap();
    fence(&runtime).await;
    assert!(
        runtime
            .execute_admitted(
                runtime
                    .prepare_file_append(2, &native, b"ok".to_vec())
                    .unwrap()
            )
            .await
            .unwrap()
            .is_ok()
    );
    assert!(
        runtime
            .execute_admitted(runtime.prepare_file_finish(3, &native).unwrap())
            .await
            .unwrap()
            .is_ok()
    );
    drop(native);
    let peer = runtime.open_peer_session(1).unwrap();
    request(
        &runtime,
        &peer,
        1,
        "catalog:upload",
        json!({"name":"abandoned","parent_path":"/","size":2,"total_size":5}),
        b"ab",
    )
    .await;
    peer.close().unwrap();
    fence(&runtime).await;
    let native = runtime.begin_file_writer(1, target()).unwrap();
    native.cancel_and_wait().await.unwrap();
}

#[tokio::test]
async fn cancel_and_truncated_eof_abort_without_replacing_committed_bytes() {
    let root = TempDir::new().unwrap();
    let (runtime, peer) = setup(&root).await;
    let original = request(
        &runtime,
        &peer,
        1,
        "catalog:upload",
        json!({"name":"keep","parent_path":"/","size":4,"finish":true}),
        b"keep",
    )
    .await;
    let node = original["node_id"].as_u64().unwrap();
    for (id, cancel) in [(2, false), (3, true)] {
        let mut upload = peer
            .admit_upload(
                id,
                RpcRequest::new(
                    "catalog:upload",
                    json!({"node_id":node,"size":4,"finish":true}),
                ),
            )
            .unwrap();
        assert!(
            runtime
                .execute_upload_frame(&mut upload, b"ab".to_vec(), false)
                .await
                .unwrap()
                .is_none()
        );
        if cancel {
            peer.cancel(id).unwrap();
        }
        assert!(
            runtime
                .execute_upload_frame(&mut upload, Vec::new(), true)
                .await
                .is_err()
        );
        drop(upload);
        fence(&runtime).await;
        assert_eq!(read(&runtime, node).await, b"keep");
    }
    let native = runtime.begin_file_writer(1, target()).unwrap();
    native.cancel_and_wait().await.unwrap();
}

#[tokio::test]
async fn buffered_replace_runs_once_and_lock_purges_an_unfinished_buffer() {
    let root = TempDir::new().unwrap();
    let (runtime, peer) = setup(&root).await;
    let initial = request(
        &runtime,
        &peer,
        1,
        "catalog:upload",
        json!({"name":"replace","parent_path":"/","size":4,"finish":true}),
        b"old!",
    )
    .await;
    let node = initial["node_id"].as_u64().unwrap();
    let metadata = peer
        .execute(
            2,
            RpcRequest::new("catalog:source:metadata", json!({"node_id":node})),
        )
        .await
        .unwrap();
    request(&runtime,&peer,3,"catalog:file:replace",json!({"node_id":node,"size":6,"expected_source_revision":metadata.result().unwrap()["source_revision"]}),b"new!!!").await;
    assert_eq!(read(&runtime, node).await, b"new!!!");
    let mut upload = peer
        .admit_upload(
            4,
            RpcRequest::new("catalog:file:replace", json!({"node_id":node,"size":4})),
        )
        .unwrap();
    assert!(
        runtime
            .execute_upload_frame(&mut upload, b"hold".to_vec(), false)
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(upload.state.lock().unwrap().bytes.len(), 4);
    runtime.lock().unwrap();
    assert!(upload.state.lock().unwrap().bytes.is_empty());
    assert!(
        runtime
            .execute_upload_frame(&mut upload, Vec::new(), true)
            .await
            .is_err()
    );
}

#[tokio::test]
async fn ordinary_abort_rpc_is_scoped_to_its_peer_including_stream_capable_dispatch() {
    let root = TempDir::new().unwrap();
    let (runtime, peer) = setup(&root).await;
    let native = runtime.begin_file_writer(1, target()).unwrap();
    assert!(
        runtime
            .execute_admitted(
                runtime
                    .prepare_file_append(2, &native, b"ok".to_vec())
                    .unwrap()
            )
            .await
            .unwrap()
            .is_ok()
    );
    let noop = peer
        .execute(1, RpcRequest::new("catalog:upload:abort", json!({})))
        .await
        .unwrap();
    assert_eq!(noop.result().unwrap()["aborted"], false);
    let download = peer
        .admit_download(2, RpcRequest::new("catalog:upload:abort", json!({})))
        .unwrap();
    let crate::session::peer_stream::PeerStreamReply::Json(noop) =
        runtime.execute_admitted_download(download).await.unwrap()
    else {
        panic!("JSON expected")
    };
    assert_eq!(noop.result().unwrap()["aborted"], false);
    assert!(
        runtime
            .execute_admitted(runtime.prepare_file_finish(3, &native).unwrap())
            .await
            .unwrap()
            .is_ok()
    );
    drop(native);
    request(
        &runtime,
        &peer,
        3,
        "catalog:upload",
        json!({"name":"partial","parent_path":"/","size":1,"total_size":3}),
        b"a",
    )
    .await;
    let aborted = peer
        .execute(4, RpcRequest::new("catalog:upload:abort", json!({})))
        .await
        .unwrap();
    assert_eq!(aborted.result().unwrap()["aborted"], true);
    let native = runtime.begin_file_writer(1, target()).unwrap();
    native.cancel_and_wait().await.unwrap();
}

#[tokio::test]
async fn abandoned_frame_future_and_revoked_old_handles_cannot_retain_new_writer_authority() {
    let root = TempDir::new().unwrap();
    let (runtime, peer) = setup(&root).await;
    let mut upload = peer
        .admit_upload(
            1,
            RpcRequest::new(
                "catalog:upload",
                json!({"name":"queued","size":2,"finish":true}),
            ),
        )
        .unwrap();
    drop(runtime.execute_upload_frame(&mut upload, b"ab".to_vec(), true));
    assert!(
        runtime
            .execute_upload_frame(&mut upload, vec![9], false)
            .await
            .is_err()
    );
    drop(upload);
    fence(&runtime).await;
    for (id, final_frame) in [(2, true), (3, false)] {
        let mut buffered = peer
            .admit_upload(
                id,
                RpcRequest::new("catalog:file:replace", json!({"node_id":0,"size":1})),
            )
            .unwrap();
        drop(runtime.execute_upload_frame(&mut buffered, vec![7], final_frame));
        assert!(buffered.state.lock().unwrap().bytes.is_empty());
        assert!(
            runtime
                .execute_upload_frame(&mut buffered, vec![8], false)
                .await
                .is_err()
        );
        drop(buffered);
        fence(&runtime).await;
    }
    let native = runtime.begin_file_writer(1, target()).unwrap();
    native.cancel_and_wait().await.unwrap();
    drop(native);
    let mut upload = peer
        .admit_upload(
            4,
            RpcRequest::new("catalog:file:replace", json!({"node_id":0,"size":4})),
        )
        .unwrap();
    runtime
        .execute_upload_frame(&mut upload, b"hold".to_vec(), false)
        .await
        .unwrap();
    let generation = runtime.lock().unwrap().generation;
    fence(&runtime).await;
    assert!(
        runtime
            .execute(
                2,
                generation,
                RpcRequest::new("vault:unlock", json!({"password":"synthetic peer upload"}))
            )
            .await
            .unwrap()
            .is_ok()
    );
    let native = runtime.begin_file_writer(generation, target()).unwrap();
    native.cancel_and_wait().await.unwrap();
    assert!(
        runtime
            .execute_upload_frame(&mut upload, Vec::new(), true)
            .await
            .is_err()
    );
}

#[tokio::test]
async fn derivatives_preserve_core_contract_and_oversize_buffers_release_the_upload_slot() {
    let root = TempDir::new().unwrap();
    let (runtime, peer) = setup(&root).await;
    let initial = request(
        &runtime,
        &peer,
        1,
        "catalog:upload",
        json!({"name":"image","parent_path":"/","size":4,"finish":true}),
        b"file",
    )
    .await;
    let node = initial["node_id"].as_u64().unwrap();
    let data = json!({"node_id":node,"source_version":0,"version":1,"tier":"thumbnail","size":3,"name":"thumb","mime_type":"image/png","file_extension":"png"});
    request(
        &runtime,
        &peer,
        2,
        "catalog:derivative:write",
        data.clone(),
        b"png",
    )
    .await;
    let admitted = peer
        .admit_download(3, RpcRequest::new("catalog:derivative:read", data))
        .unwrap();
    let crate::session::peer_stream::PeerStreamReply::Stream(mut stream) =
        runtime.execute_admitted_download(admitted).await.unwrap()
    else {
        panic!("derivative stream expected")
    };
    let mut bytes = Vec::new();
    stream.reader.read_to_end(&mut bytes).unwrap();
    assert_eq!(bytes, b"png");
    drop(stream);
    let mut upload = peer
        .admit_upload(4, RpcRequest::new("catalog:derivative:write", json!({})))
        .unwrap();
    runtime
        .execute_upload_frame(&mut upload, vec![7; MAX_FULL_UPLOAD_STREAM_BYTES], false)
        .await
        .unwrap();
    let error = runtime
        .execute_upload_frame(&mut upload, vec![1], false)
        .await
        .unwrap_err();
    let PeerUploadError::Rejected(response) = error else {
        panic!("payload limit expected")
    };
    assert_eq!(response.code(), Some("PAYLOAD_TOO_LARGE"));
    assert!(upload.state.lock().unwrap().bytes.is_empty());
    drop(upload);
    fence(&runtime).await;
    let native = runtime.begin_file_writer(1, target()).unwrap();
    native.cancel_and_wait().await.unwrap();
}
