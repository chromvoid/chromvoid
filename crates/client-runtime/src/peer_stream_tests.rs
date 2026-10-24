use super::*;
use crate::session::peer_session::PeerSession;
use crate::session::tests::{phase, session};
use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::rpc::RpcInputStream;
use serde_json::json;
use std::sync::mpsc;
use std::time::Duration;
use tempfile::TempDir;

async fn source(root: &TempDir, bytes: &[u8]) -> (Arc<LocalSession>, PeerSession, u64) {
    let runtime = Arc::new(session(root, Arc::new(InMemoryKeystore::new())));
    assert!(
        runtime
            .execute(
                1,
                1,
                RpcRequest::new("vault:unlock", json!({"password":"synthetic stream"}))
            )
            .await
            .unwrap()
            .is_ok()
    );
    let reply = runtime.inner.adapter.lock().unwrap().handle_with_stream(
        &RpcRequest::new(
            "catalog:upload",
            json!({
                "parent_path":"/", "name":"stream.dat", "size":bytes.len(),
                "total_size":bytes.len(), "offset":0, "finish":true, "chunk_size":4096
            }),
        ),
        Some(RpcInputStream::from_bytes(bytes.to_vec())),
    );
    let RpcReply::Json(response) = reply else {
        panic!("upload must return JSON")
    };
    assert!(response.is_ok(), "{response:?}");
    let node = response.result().unwrap()["node_id"].as_u64().unwrap();
    let peer = runtime.open_peer_session(1).unwrap();
    (runtime, peer, node)
}

fn download(node: u64) -> RpcRequest {
    RpcRequest::new("catalog:download", json!({"node_id":node}))
}

async fn full(runtime: &LocalSession, peer: &PeerSession, id: u64, node: u64) -> RpcOutputStream {
    let admitted = peer.admit_download(id, download(node)).unwrap();
    let PeerStreamReply::Stream(stream) =
        runtime.execute_admitted_download(admitted).await.unwrap()
    else {
        panic!("expected a full stream")
    };
    stream
}

#[tokio::test]
async fn full_and_range_reads_preserve_core_metadata_bytes_and_errors() {
    let root = TempDir::new().unwrap();
    let expected: Vec<u8> = (0..150_013).map(|value| (value % 251) as u8).collect();
    let (runtime, peer, node) = source(&root, &expected).await;
    let mut stream = full(&runtime, &peer, 1, node).await;
    assert_eq!(stream.meta.name, "stream.dat");
    assert_eq!(stream.meta.size, expected.len() as u64);
    let mut first = vec![0; 100_000];
    let count = stream.reader.read(&mut first).unwrap();
    assert!(count > 0 && count <= file_reader::MAX_FILE_READ_BYTES);
    first.truncate(count);
    stream.reader.read_to_end(&mut first).unwrap();
    assert_eq!(first, expected);
    assert_eq!(stream.reader.read(&mut [0; 1]).unwrap(), 0);

    let metadata = runtime
        .execute(
            2,
            1,
            RpcRequest::new("catalog:source:metadata", json!({"node_id":node})),
        )
        .await
        .unwrap();
    let revision = metadata.result().unwrap()["source_revision"]
        .as_u64()
        .unwrap();
    let request = RpcRequest::new(
        "catalog:downloadRange",
        json!({
            "node_id":node,"offset":4093,"length":8197,"expected_source_revision":revision
        }),
    );
    let work = peer.admit_download(2, request).unwrap();
    let PeerStreamReply::RangeStream(mut range) =
        runtime.execute_admitted_download(work).await.unwrap()
    else {
        panic!("expected a range stream")
    };
    assert_eq!(range.meta.file_size, expected.len() as u64);
    assert_eq!(range.meta.range_offset, 4093);
    assert_eq!(range.meta.range_length, 8197);
    let mut bytes = Vec::new();
    range.reader.read_to_end(&mut bytes).unwrap();
    assert_eq!(bytes, expected[4093..12_290]);

    let stale = RpcRequest::new(
        "catalog:downloadRange",
        json!({
            "node_id":node,"offset":0,"length":1,"expected_source_revision":revision + 1
        }),
    );
    let work = peer.admit_download(3, stale).unwrap();
    let PeerStreamReply::Json(response) = runtime.execute_admitted_download(work).await.unwrap()
    else {
        panic!("stale ranges must fail")
    };
    assert_eq!(
        serde_json::to_value(&response).unwrap()["code"],
        "ERR_MEDIA_STREAM_STALE"
    );

    let request = download(u64::MAX);
    let expected_error = runtime
        .inner
        .adapter
        .lock()
        .unwrap()
        .handle_with_stream(&request, None);
    let RpcReply::Json(expected_error) = expected_error else {
        panic!("missing node must fail")
    };
    let work = peer.admit_download(4, request).unwrap();
    let PeerStreamReply::Json(actual) = runtime.execute_admitted_download(work).await.unwrap()
    else {
        panic!("must preserve the Core error")
    };
    assert!(!actual.is_ok());
    assert_eq!(
        serde_json::to_value(&actual).unwrap(),
        serde_json::to_value(expected_error).unwrap()
    );
}

#[tokio::test]
async fn request_cancel_and_peer_close_do_not_stop_other_callers() {
    let root = TempDir::new().unwrap();
    let (runtime, peer, node) = source(&root, b"hello from Core").await;
    let other = runtime.open_peer_session(1).unwrap();
    let mut first = full(&runtime, &peer, 2, node).await;
    let mut second = full(&runtime, &other, 2, node).await;
    let native = runtime
        .admit(2, 1, RpcRequest::new("vault:status", json!({})))
        .unwrap();
    peer.cancel(2).unwrap();
    assert_eq!(
        first.reader.read(&mut [0; 4]).unwrap_err().kind(),
        io::ErrorKind::PermissionDenied
    );
    assert!(runtime.execute_admitted(native).await.unwrap().is_ok());
    let mut bytes = [0; 5];
    second.reader.read_exact(&mut bytes).unwrap();
    assert_eq!(&bytes, b"hello");
    let mut first = full(&runtime, &peer, 3, node).await;
    peer.close().unwrap();
    assert_eq!(
        first.reader.read(&mut [0; 4]).unwrap_err().kind(),
        io::ErrorKind::PermissionDenied
    );
    second.reader.read_exact(&mut bytes).unwrap();
    assert_eq!(&bytes, b" from");
}

#[tokio::test]
async fn output_reader_retains_one_global_pending_slot_until_dropped() {
    let root = TempDir::new().unwrap();
    let (runtime, peer, node) = source(&root, b"budget").await;
    let stream = full(&runtime, &peer, 1, node).await;
    let pending: Vec<_> = (2..=128)
        .map(|id| {
            runtime
                .admit(id, 1, RpcRequest::new("vault:status", json!({})))
                .unwrap()
        })
        .collect();
    assert!(matches!(
        runtime.admit(129, 1, RpcRequest::new("vault:status", json!({}))),
        Err(SessionError::Busy)
    ));
    drop(stream);
    assert!(
        runtime
            .admit(129, 1, RpcRequest::new("vault:status", json!({})))
            .is_ok()
    );
    drop(pending);
}

struct ObservedRead {
    reader: Box<dyn Read + Send>,
    entered: Option<mpsc::Sender<()>>,
    resume: Option<mpsc::Receiver<()>>,
    dropped: mpsc::Sender<()>,
}
impl Read for ObservedRead {
    fn read(&mut self, bytes: &mut [u8]) -> io::Result<usize> {
        if let Some(entered) = self.entered.take() {
            entered.send(()).unwrap();
            self.resume.take().unwrap().recv().unwrap();
        }
        self.reader.read(bytes)
    }
}
impl Drop for ObservedRead {
    fn drop(&mut self) {
        let _ = self.dropped.send(());
    }
}

#[tokio::test]
async fn lock_background_and_owner_drop_destroy_idle_readers_without_host_cleanup() {
    for action in ["lock", "background", "drop"] {
        let root = TempDir::new().unwrap();
        let (runtime, peer, node) = source(&root, b"private stream").await;
        let weak = Arc::downgrade(&runtime);
        let work = peer.admit_download(1, download(node)).unwrap();
        let state = work.state.clone();
        let PeerStreamReply::Stream(mut stream) =
            runtime.execute_admitted_download(work).await.unwrap()
        else {
            panic!("expected stream")
        };
        let (dropped, observe_drop) = mpsc::channel();
        {
            let mut state = state.lock().unwrap();
            let reader = state.reader.take().unwrap();
            state.reader = Some(Box::new(ObservedRead {
                reader,
                entered: None,
                resume: None,
                dropped,
            }));
        }
        match action {
            "lock" => {
                runtime.lock().unwrap();
                phase(&runtime, SessionPhase::Locked).await;
            }
            "background" => {
                runtime.deactivate().unwrap();
                phase(&runtime, SessionPhase::Inactive).await;
            }
            "drop" => {
                drop(runtime);
                assert!(weak.upgrade().is_none());
            }
            _ => unreachable!(),
        }
        observe_drop
            .try_recv()
            .expect("raw reader must be purged without a host read/drop");
        let mut output = [0xA5; 8];
        assert_eq!(
            stream.reader.read(&mut output).unwrap_err().kind(),
            io::ErrorKind::PermissionDenied
        );
        assert_eq!(output, [0xA5; 8]);
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn revocation_does_not_wait_for_io_and_discards_late_bytes_and_reader() {
    let root = TempDir::new().unwrap();
    let (runtime, peer, node) = source(&root, b"private stream").await;
    let work = peer.admit_download(1, download(node)).unwrap();
    let state = work.state.clone();
    let PeerStreamReply::Stream(mut stream) =
        runtime.execute_admitted_download(work).await.unwrap()
    else {
        panic!("expected stream")
    };
    let (entered, observe_entered) = mpsc::channel();
    let (resume, wait_resume) = mpsc::channel();
    let (dropped, observe_drop) = mpsc::channel();
    {
        let mut state = state.lock().unwrap();
        let reader = state.reader.take().unwrap();
        state.reader = Some(Box::new(ObservedRead {
            reader,
            entered: Some(entered),
            resume: Some(wait_resume),
            dropped,
        }));
    }
    let read = tokio::task::spawn_blocking(move || {
        let mut output = [0xA5; 8];
        let result = stream.reader.read(&mut output);
        (result, output)
    });
    let entered =
        tokio::task::spawn_blocking(move || observe_entered.recv_timeout(Duration::from_secs(5)))
            .await
            .unwrap();
    if entered.is_err() {
        let _ = resume.send(());
    }
    entered.expect("read must start");
    let owner = runtime.clone();
    let mut locked = tokio::task::spawn_blocking(move || owner.lock());
    let lock_result = tokio::time::timeout(Duration::from_secs(2), &mut locked).await;
    // Always release the controlled I/O even when the lock contract regresses.
    resume.send(()).unwrap();
    lock_result
        .expect("lifecycle must not wait for reader I/O")
        .unwrap()
        .unwrap();
    let (result, output) = read.await.unwrap();
    assert_eq!(result.unwrap_err().kind(), io::ErrorKind::PermissionDenied);
    assert_eq!(output, [0xA5; 8]);
    observe_drop
        .try_recv()
        .expect("late reader must not return to resource state");
    phase(&runtime, SessionPhase::Locked).await;
}

#[path = "peer_stream_wire_tests.rs"]
mod wire;
