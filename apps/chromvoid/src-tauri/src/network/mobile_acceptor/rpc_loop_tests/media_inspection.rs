use super::support::*;
use super::*;
use crate::core_adapter::LocalCoreAdapter;
use chromvoid_core::rpc::CatalogMediaInspectSnapshot;
use std::sync::atomic::AtomicUsize;

const SEQ: std::sync::atomic::Ordering = std::sync::atomic::Ordering::SeqCst;

/// Builds a genuine `CatalogMediaInspectSnapshot` (its chunk-cache field type
/// is private to chromvoid_core, so tests cannot construct one directly) by
/// driving a real `LocalCoreAdapter` with an uploaded text file. A `.txt`
/// name keeps the media read phase instant (not an ISO-BMFF candidate) while
/// still leaving `inspection_complete == false`, so the host loop schedules
/// the read job and commit.
fn build_inspection_snapshot(storage_root: std::path::PathBuf) -> CatalogMediaInspectSnapshot {
    let mut local = LocalCoreAdapter::new(storage_root).expect("local adapter");
    local.set_master_key(Some("test-master-key".to_string()));
    let unlock = local.handle(&RpcRequest::new(
        "vault:unlock",
        serde_json::json!({"password": "test"}),
    ));
    assert!(unlock.is_ok(), "vault unlock failed: {unlock:?}");
    let upload = local.handle_with_stream(
        &RpcRequest::new(
            "catalog:upload",
            serde_json::json!({
                "parent_path": "/",
                "name": "note.txt",
                "total_size": 4,
                "size": 4,
                "offset": 0,
                "mime_type": "text/plain",
            }),
        ),
        Some(RpcInputStream::from_bytes(b"data".to_vec())),
    );
    let RpcReply::Json(upload) = upload else {
        panic!("catalog:upload must return JSON response");
    };
    let node_id = upload
        .result()
        .unwrap_or_else(|| panic!("upload failed: {upload:?}"))
        .get("node_id")
        .and_then(|value| value.as_u64())
        .expect("upload node id");
    let snapshot = local
        .snapshot_catalog_media_inspect(node_id)
        .expect("media inspect split hook available")
        .expect("media inspect snapshot");
    assert!(
        !snapshot.inspection_complete,
        "test file must require inspection"
    );
    snapshot
}

/// Serves fixed-size chunks with a small delay per read and counts reads, so
/// tests can prove chunks were still being read while a commit was blocked.
struct PacedCountingReader {
    remaining: usize,
    delay: std::time::Duration,
    reads: Arc<AtomicUsize>,
}

impl std::io::Read for PacedCountingReader {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if self.remaining == 0 {
            return Ok(0);
        }
        std::thread::sleep(self.delay);
        self.remaining -= 1;
        self.reads.fetch_add(1, SEQ);
        let bytes = b"data";
        buf[..bytes.len()].copy_from_slice(bytes);
        Ok(bytes.len())
    }
}

struct SlowCommitMediaAdapter {
    snapshot: CatalogMediaInspectSnapshot,
    /// Fired when `commit_catalog_media_inspect` starts, carrying the number
    /// of stream reads performed so far.
    commit_started: Option<tokio::sync::oneshot::Sender<usize>>,
    /// The commit blocks until the test sends a token here.
    commit_release: Mutex<mpsc::Receiver<()>>,
    commits: Arc<Mutex<Vec<(u64, u64)>>>,
    stream_reads: Arc<AtomicUsize>,
    stream_chunks: usize,
    stream_read_delay: std::time::Duration,
}

impl CoreAdapter for SlowCommitMediaAdapter {
    fn mode(&self) -> crate::core_adapter::CoreMode {
        crate::core_adapter::CoreMode::Local
    }

    fn is_unlocked(&self) -> bool {
        true
    }

    fn handle(&mut self, _req: &RpcRequest) -> RpcResponse {
        RpcResponse::success(serde_json::Value::Null)
    }

    fn snapshot_catalog_media_inspect(
        &mut self,
        _node_id: u64,
    ) -> Option<Result<CatalogMediaInspectSnapshot, RpcResponse>> {
        Some(Ok(self.snapshot.clone()))
    }

    fn commit_catalog_media_inspect(
        &mut self,
        snapshot: &CatalogMediaInspectSnapshot,
        _media_info: Option<chromvoid_core::catalog::CatalogMediaInfo>,
        media_inspected_revision: u64,
    ) -> Option<RpcResponse> {
        self.commits
            .lock()
            .unwrap()
            .push((snapshot.node_id, media_inspected_revision));
        if let Some(started) = self.commit_started.take() {
            let _ = started.send(self.stream_reads.load(SEQ));
        }
        let _ = self
            .commit_release
            .lock()
            .unwrap()
            .recv_timeout(std::time::Duration::from_secs(10));
        Some(RpcResponse::success(serde_json::json!({
            "node_id": snapshot.node_id,
            "committed": true,
            "media_inspected_revision": media_inspected_revision,
        })))
    }

    fn handle_with_stream(
        &mut self,
        req: &RpcRequest,
        _stream: Option<RpcInputStream>,
    ) -> RpcReply {
        assert_eq!(req.command, "catalog:download");
        RpcReply::Stream(chromvoid_core::rpc::RpcOutputStream {
            meta: RpcStreamMeta {
                name: "note.bin".to_string(),
                mime_type: "application/octet-stream".to_string(),
                size: (self.stream_chunks * 4) as u64,
                chunk_size: 4,
            },
            reader: Box::new(PacedCountingReader {
                remaining: self.stream_chunks,
                delay: self.stream_read_delay,
                reads: self.stream_reads.clone(),
            }),
        })
    }

    fn save(&mut self) -> Result<(), String> {
        Ok(())
    }

    fn take_events(&mut self) -> Vec<serde_json::Value> {
        Vec::new()
    }

    fn set_master_key(&mut self, _key: Option<String>) {}
}

fn frame_for_request(message_id: u64, req: &RpcRequest) -> Frame {
    Frame {
        frame_type: FrameType::RpcRequest,
        message_id,
        flags: 0,
        payload: serde_json::to_vec(req).expect("request json"),
    }
}

#[tokio::test]
async fn slow_media_commit_does_not_block_outgoing_stream_chunks() {
    const STREAM_CHUNKS: usize = 40;
    let temp = tempfile::tempdir().expect("tempdir");
    let snapshot = build_inspection_snapshot(temp.path().join("vault"));
    let node_id = snapshot.node_id;

    let (commit_started_tx, commit_started_rx) = tokio::sync::oneshot::channel();
    let (commit_release_tx, commit_release_rx) = mpsc::channel();
    let commits = Arc::new(Mutex::new(Vec::new()));
    let stream_reads = Arc::new(AtomicUsize::new(0));
    let adapter: Arc<Mutex<Box<dyn CoreAdapter>>> =
        Arc::new(Mutex::new(Box::new(SlowCommitMediaAdapter {
            snapshot,
            commit_started: Some(commit_started_tx),
            commit_release: Mutex::new(commit_release_rx),
            commits: commits.clone(),
            stream_reads: stream_reads.clone(),
            stream_chunks: STREAM_CHUNKS,
            stream_read_delay: std::time::Duration::from_millis(10),
        })));

    let (mut client_noise, host_noise) = noise_pair();
    let (mut client_transport, host_transport) = ChannelTransport::pair(TransportType::WssRelay);
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let host_task = tokio::spawn(run_host_rpc_loop_with_heartbeat_interval(
        Some(adapter),
        Box::new(host_transport),
        host_noise,
        TransportType::WssRelay,
        temp.path().join("loop-storage"),
        "peer-media-commit-stream-test".to_string(),
        shutdown_rx,
        std::time::Duration::from_secs(30),
        None,
    ));

    // Start the download before the inspect so the stream is active by the
    // time the commit begins (the blocked commit holds the adapter mutex, so
    // no new adapter work can start while it is in flight).
    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        frame_for_request(
            41,
            &RpcRequest::new("catalog:download", serde_json::json!({"node_id": node_id})),
        ),
    )
    .await
    .expect("send download request");

    let meta_frame = recv_test_frame(&mut client_transport, &mut client_noise).await;
    assert_eq!(meta_frame.message_id, 41);
    assert_eq!(meta_frame.frame_type, FrameType::RpcResponse);
    assert_ne!(meta_frame.flags & FLAG_HAS_CONTINUATION, 0);

    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        frame_for_request(
            45,
            &RpcRequest::new(
                "catalog:media:inspect",
                serde_json::json!({"node_id": node_id}),
            ),
        ),
    )
    .await
    .expect("send media inspect request");

    // Wait until the commit is actually running (and blocked) off the loop.
    let reads_at_commit_start =
        tokio::time::timeout(std::time::Duration::from_secs(5), commit_started_rx)
            .await
            .expect("commit start timeout")
            .expect("commit started signal");

    // With the commit still blocked, the loop must keep pumping the stream to
    // completion. No inspect response may arrive before the commit finishes.
    let mut chunk_frames = 0usize;
    loop {
        let frame = recv_test_frame(&mut client_transport, &mut client_noise).await;
        assert_eq!(
            frame.message_id, 41,
            "only stream frames may arrive while the commit is blocked"
        );
        assert_eq!(frame.frame_type, FrameType::RpcResponse);
        if frame.flags & FLAG_HAS_CONTINUATION == 0 {
            assert!(frame.payload.is_empty(), "final stream frame is empty");
            break;
        }
        assert_eq!(frame.payload, b"data");
        chunk_frames += 1;
    }
    assert_eq!(chunk_frames, STREAM_CHUNKS);
    assert!(
        reads_at_commit_start < STREAM_CHUNKS,
        "commit must have started while stream reads were still pending \
         (reads at commit start: {reads_at_commit_start})"
    );

    // Releasing the commit delivers the inspect response afterwards.
    commit_release_tx.send(()).expect("release commit");
    let inspect_frame = recv_test_frame(&mut client_transport, &mut client_noise).await;
    assert_eq!(inspect_frame.message_id, 45);
    assert_eq!(inspect_frame.frame_type, FrameType::RpcResponse);
    let inspect: RpcResponse =
        serde_json::from_slice(&inspect_frame.payload).expect("inspect response json");
    let result = inspect.result().expect("inspect response success").clone();
    assert_eq!(result.get("committed"), Some(&serde_json::json!(true)));
    assert_eq!(commits.lock().unwrap().as_slice(), [(node_id, 0)]);

    let _ = shutdown_tx.send(());
    tokio::time::timeout(std::time::Duration::from_secs(2), host_task)
        .await
        .expect("host loop shutdown timeout")
        .expect("host loop join")
        .expect("host loop result");
}

#[tokio::test]
async fn media_commit_result_is_sent_and_loop_stays_responsive_afterwards() {
    let temp = tempfile::tempdir().expect("tempdir");
    let snapshot = build_inspection_snapshot(temp.path().join("vault"));
    let node_id = snapshot.node_id;

    let (commit_release_tx, commit_release_rx) = mpsc::channel();
    // Pre-release so the commit completes without test intervention.
    commit_release_tx.send(()).expect("preload commit release");
    let commits = Arc::new(Mutex::new(Vec::new()));
    let adapter: Arc<Mutex<Box<dyn CoreAdapter>>> =
        Arc::new(Mutex::new(Box::new(SlowCommitMediaAdapter {
            snapshot,
            commit_started: None,
            commit_release: Mutex::new(commit_release_rx),
            commits: commits.clone(),
            stream_reads: Arc::new(AtomicUsize::new(0)),
            stream_chunks: 0,
            stream_read_delay: std::time::Duration::ZERO,
        })));

    let (mut client_noise, host_noise) = noise_pair();
    let (mut client_transport, host_transport) = ChannelTransport::pair(TransportType::WssRelay);
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let host_task = tokio::spawn(run_host_rpc_loop_with_heartbeat_interval(
        Some(adapter),
        Box::new(host_transport),
        host_noise,
        TransportType::WssRelay,
        temp.path().join("loop-storage"),
        "peer-media-commit-result-test".to_string(),
        shutdown_rx,
        std::time::Duration::from_secs(30),
        None,
    ));

    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        frame_for_request(
            41,
            &RpcRequest::new(
                "catalog:media:inspect",
                serde_json::json!({"node_id": node_id}),
            ),
        ),
    )
    .await
    .expect("send media inspect request");

    let inspect_frame = recv_test_frame(&mut client_transport, &mut client_noise).await;
    assert_eq!(inspect_frame.message_id, 41);
    let inspect: RpcResponse =
        serde_json::from_slice(&inspect_frame.payload).expect("inspect response json");
    let result = inspect.result().expect("inspect response success").clone();
    assert_eq!(result.get("committed"), Some(&serde_json::json!(true)));
    assert_eq!(result.get("node_id"), Some(&serde_json::json!(node_id)));
    assert_eq!(commits.lock().unwrap().as_slice(), [(node_id, 0)]);

    // The loop must still service regular RPCs after the commit round trip.
    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        frame_for_request(
            47,
            &RpcRequest::new("core:capabilities", serde_json::json!({})),
        ),
    )
    .await
    .expect("send generic request");
    let generic_frame = recv_test_frame(&mut client_transport, &mut client_noise).await;
    assert_eq!(generic_frame.message_id, 47);
    let generic: RpcResponse =
        serde_json::from_slice(&generic_frame.payload).expect("generic response json");
    assert!(generic.is_ok());

    let _ = shutdown_tx.send(());
    tokio::time::timeout(std::time::Duration::from_secs(2), host_task)
        .await
        .expect("host loop shutdown timeout")
        .expect("host loop join")
        .expect("host loop result");
}

#[tokio::test]
async fn shutdown_completes_while_media_commit_is_in_flight() {
    let temp = tempfile::tempdir().expect("tempdir");
    let snapshot = build_inspection_snapshot(temp.path().join("vault"));
    let node_id = snapshot.node_id;

    let (commit_started_tx, commit_started_rx) = tokio::sync::oneshot::channel();
    let (commit_release_tx, commit_release_rx) = mpsc::channel();
    let commits = Arc::new(Mutex::new(Vec::new()));
    let adapter: Arc<Mutex<Box<dyn CoreAdapter>>> =
        Arc::new(Mutex::new(Box::new(SlowCommitMediaAdapter {
            snapshot,
            commit_started: Some(commit_started_tx),
            commit_release: Mutex::new(commit_release_rx),
            commits: commits.clone(),
            stream_reads: Arc::new(AtomicUsize::new(0)),
            stream_chunks: 0,
            stream_read_delay: std::time::Duration::ZERO,
        })));

    let (mut client_noise, host_noise) = noise_pair();
    let (mut client_transport, host_transport) = ChannelTransport::pair(TransportType::WssRelay);
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let host_task = tokio::spawn(run_host_rpc_loop_with_heartbeat_interval(
        Some(adapter),
        Box::new(host_transport),
        host_noise,
        TransportType::WssRelay,
        temp.path().join("loop-storage"),
        "peer-media-commit-shutdown-test".to_string(),
        shutdown_rx,
        std::time::Duration::from_secs(30),
        None,
    ));

    send_encrypted_frame(
        &mut client_transport,
        &mut client_noise,
        frame_for_request(
            41,
            &RpcRequest::new(
                "catalog:media:inspect",
                serde_json::json!({"node_id": node_id}),
            ),
        ),
    )
    .await
    .expect("send media inspect request");

    tokio::time::timeout(std::time::Duration::from_secs(5), commit_started_rx)
        .await
        .expect("commit start timeout")
        .expect("commit started signal");

    // Shutdown must not wait for the blocked commit beyond the worker's grace
    // period (1s); the loop aborts the worker and returns cleanly.
    let _ = shutdown_tx.send(());
    tokio::time::timeout(std::time::Duration::from_secs(3), host_task)
        .await
        .expect("host loop must shut down while a commit is in flight")
        .expect("host loop join")
        .expect("host loop result");

    assert_eq!(commits.lock().unwrap().as_slice(), [(node_id, 0)]);

    // Unblock the detached spawn_blocking commit so the runtime can shut down
    // promptly at the end of the test.
    let _ = commit_release_tx.send(());
}
