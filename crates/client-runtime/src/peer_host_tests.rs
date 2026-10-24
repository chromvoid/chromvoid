use super::*;
use crate::session::peer_wire_fixture::{Channel, connection};
use crate::session::tests::{phase, session};
use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_protocol::{
    FLAG_HAS_CONTINUATION, error_codes, frame_continuation, frame_from_error,
};
use serde_json::{Value, json};
use tempfile::TempDir;

// This is a deadlock guard, not an image-encoding performance budget. The real
// debug codec alone takes several seconds; lifecycle deadlines below stay strict.
const RESPONSE_TIMEOUT: Duration = Duration::from_secs(30);

struct Client {
    transport: Channel,
    noise: NoiseTransport,
    task: tokio::task::JoinHandle<RemoteIoResult<()>>,
    shutdown: oneshot::Sender<()>,
}
impl Client {
    async fn request(&mut self, id: u64, command: &str, data: Value, stream: bool) {
        let request = RpcRequest::new(command, data);
        send_encrypted_frame_typed(
            &mut self.transport,
            &mut self.noise,
            Frame {
                frame_type: FrameType::RpcRequest,
                message_id: id,
                flags: if stream { FLAG_HAS_CONTINUATION } else { 0 },
                payload: serde_json::to_vec(&request).unwrap(),
            },
        )
        .await
        .unwrap();
    }
    async fn frame(&mut self) -> Frame {
        tokio::time::timeout(
            RESPONSE_TIMEOUT,
            recv_decrypted_frame_typed(&mut self.transport, &mut self.noise),
        )
        .await
        .unwrap()
        .unwrap()
    }
    async fn reply(&mut self) -> Frame {
        loop {
            let frame = self.frame().await;
            if frame.frame_type != FrameType::Heartbeat {
                return frame;
            }
        }
    }
    async fn json(&mut self, id: u64) -> Value {
        let frame = self.reply().await;
        assert_eq!(frame.message_id, id);
        assert_eq!(frame.frame_type, FrameType::RpcResponse);
        assert!(!frame.has_continuation());
        serde_json::from_slice(&frame.payload).unwrap()
    }
    async fn json_with_catalog(&mut self, id: u64) -> (Value, Vec<Value>) {
        let mut events = Vec::new();
        loop {
            let frame = self.reply().await;
            if frame.frame_type == FrameType::RpcRequest {
                events.extend(catalog_push_events(&frame));
                continue;
            }
            assert_eq!(frame.message_id, id);
            assert_eq!(frame.frame_type, FrameType::RpcResponse);
            assert!(!frame.has_continuation());
            return (serde_json::from_slice(&frame.payload).unwrap(), events);
        }
    }
    async fn catalog_event(&mut self) -> Vec<Value> {
        loop {
            let frame = self.reply().await;
            let events = catalog_push_events(&frame);
            if !events.is_empty() {
                return events;
            }
        }
    }
    async fn assert_no_push(&mut self) {
        assert!(
            tokio::time::timeout(Duration::from_millis(100), self.reply())
                .await
                .is_err(),
            "an unsubscribed peer must not receive catalog pushes"
        );
    }
    async fn upload(&mut self, id: u64, name: &str, bytes: &[u8]) -> u64 {
        self.request(id,"catalog:upload",json!({"name":name,"parent_path":"/","size":bytes.len(),"total_size":bytes.len(),"offset":0,"finish":true,"chunk_size":4096}),true).await;
        let chunks = bytes.chunks(33_000);
        let length = chunks.len();
        for (index, chunk) in chunks.enumerate() {
            send_encrypted_frame_typed(
                &mut self.transport,
                &mut self.noise,
                frame_continuation(
                    FrameType::RpcRequest,
                    id,
                    chunk.to_vec(),
                    index + 1 < length,
                ),
            )
            .await
            .unwrap();
        }
        let response = self.json(id).await;
        assert_eq!(response["ok"], true, "{response}");
        response["result"]["node_id"].as_u64().unwrap()
    }
    async fn revision(&mut self, id: u64, node: u64) -> u64 {
        self.request(
            id,
            "catalog:source:metadata",
            json!({"node_id":node}),
            false,
        )
        .await;
        self.json(id).await["result"]["source_revision"]
            .as_u64()
            .unwrap()
    }
    async fn stream(&mut self, id: u64) -> (Value, Vec<u8>) {
        let metadata = self.reply().await;
        assert_eq!(metadata.message_id, id);
        assert!(
            metadata.has_continuation(),
            "{:?}",
            String::from_utf8_lossy(&metadata.payload)
        );
        let metadata: Value = serde_json::from_slice(&metadata.payload).unwrap();
        let mut bytes = Vec::new();
        loop {
            let frame = self.reply().await;
            assert_eq!(frame.message_id, id);
            assert_eq!(frame.frame_type, FrameType::RpcResponse);
            if !frame.has_continuation() {
                assert!(frame.payload.is_empty());
                break;
            }
            bytes.extend(frame.payload);
        }
        (metadata, bytes)
    }
    async fn stop(self) {
        let _ = self.shutdown.send(());
        tokio::time::timeout(Duration::from_secs(3), self.task)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
    }
}
fn catalog_push_events(frame: &Frame) -> Vec<Value> {
    assert_eq!(frame.frame_type, FrameType::RpcRequest);
    assert!(!frame.has_continuation());
    let request: Value = serde_json::from_slice(&frame.payload).unwrap();
    match request["command"].as_str().unwrap() {
        "catalog:event" => vec![request["data"].clone()],
        "catalog:event:batch" => request["data"]["events"].as_array().unwrap().clone(),
        "update:state" => Vec::new(),
        command => panic!("unexpected host push: {command}"),
    }
}
fn assert_catalog_create(events: &[Value], node: u64, name: &str) {
    assert!(
        events.iter().any(|event| {
            event["type"] == "create"
                && event["node_id"] == node
                && event["delta"]["op"]["node"]["n"] == name
        }),
        "missing create event for {name}: {events:?}"
    );
}
async fn client(runtime: &Arc<LocalSession>, heartbeat: Duration) -> Client {
    let (host, host_noise, transport, noise) = connection().await;
    let peer = runtime
        .open_peer_session(runtime.snapshot().unwrap().generation)
        .unwrap();
    let (shutdown, stop) = oneshot::channel();
    let task = tokio::spawn(serve_with_heartbeat(
        peer,
        Box::new(host),
        host_noise,
        "synthetic-peer".into(),
        stop,
        heartbeat,
    ));
    Client {
        transport,
        noise,
        task,
        shutdown,
    }
}
async fn runtime(root: &TempDir) -> Arc<LocalSession> {
    let runtime = Arc::new(session(root, Arc::new(InMemoryKeystore::new())));
    assert!(
        runtime
            .execute(
                1,
                1,
                RpcRequest::new("vault:unlock", json!({"password":"synthetic host"}))
            )
            .await
            .unwrap()
            .is_ok()
    );
    runtime
}

#[tokio::test]
async fn catalog_pushes_follow_each_peers_subscription_for_local_and_remote_mutations() {
    let root = TempDir::new().unwrap();
    let runtime = runtime(&root).await;
    let mut first = client(&runtime, HEARTBEAT_INTERVAL).await;
    let mut second = client(&runtime, HEARTBEAT_INTERVAL).await;
    first
        .request(1, "catalog:sync:manifest", json!({}), false)
        .await;
    let (manifest, events) = first.json_with_catalog(1).await;
    assert!(events.is_empty());
    assert!(
        !manifest["result"]["root_summaries"]
            .as_array()
            .unwrap()
            .iter()
            .any(|entry| entry["n"] == "during-connect")
    );

    let local = runtime
        .execute(
            2,
            1,
            RpcRequest::new(
                "catalog:createDir",
                json!({"parent_path":"/","name":"during-connect"}),
            ),
        )
        .await
        .unwrap();
    assert!(local.is_ok(), "{local:?}");
    first.assert_no_push().await;
    second.assert_no_push().await;
    first
        .request(2, "catalog:subscribe", json!({}), false)
        .await;
    let (subscribed, mut events) = first.json_with_catalog(2).await;
    assert_eq!(subscribed, json!({"ok":true,"result":null}));
    if events.is_empty() {
        events = first.catalog_event().await;
    }
    assert_eq!(events, vec![json!({"type":"invalidate"})]);
    first
        .request(3, "catalog:sync:manifest", json!({}), false)
        .await;
    let (manifest, events) = first.json_with_catalog(3).await;
    assert!(events.is_empty());
    assert!(
        manifest["result"]["root_summaries"]
            .as_array()
            .unwrap()
            .iter()
            .any(|entry| {
                entry["n"] == "during-connect" && entry["i"] == local.result().unwrap()["node_id"]
            })
    );

    let local = runtime
        .execute(
            3,
            1,
            RpcRequest::new(
                "catalog:createDir",
                json!({"parent_path":"/","name":"shared"}),
            ),
        )
        .await
        .unwrap();
    assert!(local.is_ok(), "{local:?}");
    assert_eq!(
        first.catalog_event().await,
        vec![json!({"type":"invalidate"})]
    );
    second.assert_no_push().await;
    // The existing desktop fallback fetches this manifest after invalidation.
    first
        .request(4, "catalog:sync:manifest", json!({}), false)
        .await;
    let (manifest, events) = first.json_with_catalog(4).await;
    assert!(events.is_empty());
    assert!(
        manifest["result"]["root_summaries"]
            .as_array()
            .unwrap()
            .iter()
            .any(|entry| {
                entry["n"] == "shared" && entry["i"] == local.result().unwrap()["node_id"]
            })
    );

    let local = runtime
        .execute(
            4,
            1,
            RpcRequest::new(
                "catalog:createDir",
                json!({"parent_path":"/shared","name":"from-phone"}),
            ),
        )
        .await
        .unwrap();
    assert!(local.is_ok(), "{local:?}");
    let node = local.result().unwrap()["node_id"].as_u64().unwrap();
    assert_catalog_create(&first.catalog_event().await, node, "from-phone");
    second.assert_no_push().await;

    first
        .request(
            5,
            "catalog:createDir",
            json!({"parent_path":"/shared","name":"from-subscriber"}),
            false,
        )
        .await;
    let (created, mut events) = first.json_with_catalog(5).await;
    assert_eq!(created["ok"], true, "{created}");
    if events.is_empty() {
        events = first.catalog_event().await;
    }
    assert_catalog_create(
        &events,
        created["result"]["node_id"].as_u64().unwrap(),
        "from-subscriber",
    );
    second.assert_no_push().await;

    second
        .request(
            1,
            "catalog:createDir",
            json!({"parent_path":"/shared","name":"from-other-peer"}),
            false,
        )
        .await;
    let created = second.json(1).await;
    assert_eq!(created["ok"], true, "{created}");
    assert_catalog_create(
        &first.catalog_event().await,
        created["result"]["node_id"].as_u64().unwrap(),
        "from-other-peer",
    );
    second.assert_no_push().await;

    second
        .request(2, "catalog:subscribe", json!({}), false)
        .await;
    let (subscribed, mut events) = second.json_with_catalog(2).await;
    assert_eq!(subscribed, json!({"ok":true,"result":null}));
    if events.is_empty() {
        events = second.catalog_event().await;
    }
    assert_eq!(events, vec![json!({"type":"invalidate"})]);
    first
        .request(6, "catalog:unsubscribe", json!({}), false)
        .await;
    let (unsubscribed, events) = first.json_with_catalog(6).await;
    assert_eq!(unsubscribed, json!({"ok":true,"result":null}));
    assert!(events.is_empty());

    let before = runtime.snapshot().unwrap().sequence;
    let local = runtime
        .execute(
            5,
            1,
            RpcRequest::new(
                "catalog:createDir",
                json!({"parent_path":"/shared","name":"after-unsubscribe"}),
            ),
        )
        .await
        .unwrap();
    assert!(local.is_ok(), "{local:?}");
    let batch = tokio::time::timeout(Duration::from_secs(2), runtime.events(before))
        .await
        .unwrap()
        .unwrap();
    assert!(
        batch
            .events
            .iter()
            .any(|event| { event.kind == crate::session::SessionEventKind::DomainInvalidated })
    );
    assert_catalog_create(
        &second.catalog_event().await,
        local.result().unwrap()["node_id"].as_u64().unwrap(),
        "after-unsubscribe",
    );
    first.assert_no_push().await;
    first.stop().await;

    second.request(3, "vault:status", json!({}), false).await;
    let (status, events) = second.json_with_catalog(3).await;
    assert_eq!(status["result"]["is_unlocked"], true);
    assert!(events.is_empty());
    // Only close the receive direction: the next host write must end the session.
    second.transport.rx.close();
    assert!(
        runtime
            .execute(
                6,
                1,
                RpcRequest::new(
                    "catalog:createDir",
                    json!({"parent_path":"/shared","name":"failed-push"}),
                ),
            )
            .await
            .unwrap()
            .is_ok()
    );
    let error = tokio::time::timeout(Duration::from_secs(3), second.task)
        .await
        .unwrap()
        .unwrap()
        .unwrap_err();
    assert_eq!(error, RemoteIoFailure::TransportClosed);
    assert!(
        runtime
            .inner
            .authority
            .lock()
            .unwrap()
            .peer_sessions
            .is_empty()
    );
    assert!(
        runtime
            .execute(7, 1, RpcRequest::new("vault:status", json!({})))
            .await
            .unwrap()
            .is_ok()
    );
}

#[tokio::test]
async fn oversized_catalog_subtree_push_refreshes_without_breaking_response_frames() {
    use chromvoid_core::catalog::{CatalogNode, DeltaEntry, MAX_DELTA_SIZE};

    // Cross-shard moves encode the entire destination subtree in a create.
    let mut folder = CatalogNode::new_dir(1, "group".into());
    for index in 0..700 {
        assert!(folder.add_child(CatalogNode::new_file(
            index + 2,
            format!("file-{index}"),
            1,
            None,
        )));
    }
    let delta = DeltaEntry::create(1, "/", folder);
    let delta_size = serde_json::to_vec(&delta).unwrap().len();
    assert!(
        delta_size < MAX_DELTA_SIZE,
        "Core must accept the delta: {delta_size}"
    );
    let event = json!({
        "type": "create", "shard_id": "destination", "node_id": 1,
        "version": 1, "delta": delta,
    });
    let (mut host, mut host_noise, mut desktop, mut desktop_noise) = connection().await;
    let mut server_id = 1;
    for (command, data) in [
        ("catalog:event", event.clone()),
        ("catalog:event:batch", json!({"events": [event]})),
    ] {
        let original_size = serde_json::to_vec(&RpcRequest::new(command, data.clone()))
            .unwrap()
            .len();
        assert!(
            original_size > MAX_FRAME_PAYLOAD_SIZE,
            "push must exceed frame limit: {original_size}"
        );
        push(&mut host, &mut host_noise, &mut server_id, command, data)
            .await
            .unwrap();
        let frame = recv_decrypted_frame_typed(&mut desktop, &mut desktop_noise)
            .await
            .unwrap();
        assert_eq!(frame.message_id, server_id - 1);
        assert_eq!(
            catalog_push_events(&frame),
            vec![json!({"type":"invalidate"})]
        );

        send_response(
            &mut host,
            &mut host_noise,
            42,
            &RpcResponse::success(json!({"is_unlocked": true})),
        )
        .await
        .unwrap();
        let frame = recv_decrypted_frame_typed(&mut desktop, &mut desktop_noise)
            .await
            .unwrap();
        assert_eq!(frame.frame_type, FrameType::RpcResponse);
        assert_eq!(frame.message_id, 42);
        let response: Value = serde_json::from_slice(&frame.payload).unwrap();
        assert_eq!(response["result"]["is_unlocked"], true);
    }
}

#[tokio::test]
async fn noise_host_uploads_and_multiplexes_full_and_range_streams_from_the_same_core() {
    let root = TempDir::new().unwrap();
    let runtime = runtime(&root).await;
    let mut client = client(&runtime, HEARTBEAT_INTERVAL).await;
    let bytes: Vec<u8> = (0..150_013).map(|n| (n % 251) as u8).collect();
    let node = client.upload(1, "wire.bin", &bytes).await;
    let revision = client.revision(2, node).await;
    client
        .request(3, "catalog:download", json!({"node_id":node}), false)
        .await;
    client.request(4,"catalog:downloadRange",json!({"node_id":node,"offset":4093,"length":81_997,"expected_source_revision":revision}),false).await;
    let mut metadata = HashMap::new();
    let mut output = HashMap::<u64, Vec<u8>>::new();
    let mut ended = Vec::new();
    while ended.len() < 2 {
        let frame = client.reply().await;
        assert!([3, 4].contains(&frame.message_id));
        assert_eq!(frame.frame_type, FrameType::RpcResponse);
        if let std::collections::hash_map::Entry::Vacant(entry) = metadata.entry(frame.message_id) {
            assert!(frame.has_continuation());
            entry.insert(serde_json::from_slice::<Value>(&frame.payload).unwrap());
            continue;
        }
        if frame.has_continuation() {
            output
                .entry(frame.message_id)
                .or_default()
                .extend(frame.payload);
        } else {
            assert!(frame.payload.is_empty());
            ended.push(frame.message_id);
        }
    }
    assert_eq!(output[&3], bytes);
    assert_eq!(output[&4], bytes[4093..86_090]);
    assert_eq!(metadata[&3]["size"], 150_013);
    assert_eq!(metadata[&4]["range_offset"], 4093);
    let local = runtime
        .execute(
            2,
            1,
            RpcRequest::new("catalog:source:metadata", json!({"node_id":node})),
        )
        .await
        .unwrap();
    assert_eq!(local.result().unwrap()["source_revision"], revision);
    client.stop().await;
    assert_eq!(runtime.inner.authority.lock().unwrap().pending.len(), 0);
}

#[tokio::test]
async fn noise_host_generates_a_real_derivative_and_returns_cache_on_repeat() {
    let root = TempDir::new().unwrap();
    let runtime = runtime(&root).await;
    let mut client = client(&runtime, HEARTBEAT_INTERVAL).await;
    let source = image::DynamicImage::ImageRgba8(image::ImageBuffer::from_pixel(
        320,
        160,
        image::Rgba([32, 96, 180, 127]),
    ));
    let mut png = std::io::Cursor::new(Vec::new());
    source.write_to(&mut png, image::ImageFormat::Png).unwrap();
    let node = client.upload(1, "photo.png", &png.into_inner()).await;
    let revision = client.revision(2, node).await;
    let request = json!({"node_id":node,"source_version":revision,"tier":"thumbnail","version":chromvoid_media_runtime::image_preview::DERIVATIVE_STORAGE_VERSION});
    client
        .request(3, "catalog:derivative:ensure", request.clone(), false)
        .await;
    let (meta, bytes) = client.stream(3).await;
    assert_eq!(meta["size"], bytes.len());
    let image = image::load_from_memory(&bytes).unwrap();
    assert_eq!((image.width(), image.height()), (256, 128));
    client
        .request(4, "catalog:derivative:ensure", request, false)
        .await;
    assert_eq!(client.stream(4).await.1, bytes);
    client.stop().await;
}

#[tokio::test]
async fn remote_lock_disconnects_only_its_peer_and_keeps_the_host_and_other_peer_unlocked() {
    let root = TempDir::new().unwrap();
    let runtime = runtime(&root).await;
    let mut first = client(&runtime, HEARTBEAT_INTERVAL).await;
    let mut second = client(&runtime, HEARTBEAT_INTERVAL).await;
    first.request(1, "vault:lock", json!({}), false).await;
    assert_eq!(first.json(1).await["ok"], true);
    tokio::time::timeout(Duration::from_secs(3), first.task)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert_eq!(runtime.snapshot().unwrap().phase, SessionPhase::Unlocked);
    second.request(1, "vault:status", json!({}), false).await;
    assert_eq!(second.json(1).await["result"]["is_unlocked"], true);
    second.stop().await;
}

#[tokio::test]
async fn idle_connections_end_on_background_app_owner_drop_and_explicit_shutdown() {
    for stop in ["background", "drop", "shutdown"] {
        let root = TempDir::new().unwrap();
        let runtime = runtime(&root).await;
        let mut client = client(&runtime, HEARTBEAT_INTERVAL).await;
        client.request(1, "vault:status", json!({}), false).await;
        assert_eq!(client.json(1).await["ok"], true);
        match stop {
            "background" => {
                runtime.deactivate().unwrap();
                phase(&runtime, SessionPhase::Inactive).await;
            }
            "drop" => drop(runtime),
            _ => {
                client.shutdown.send(()).unwrap();
            }
        }
        tokio::time::timeout(Duration::from_secs(3), client.task)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert!(
            recv_decrypted_frame_typed(&mut client.transport, &mut client.noise)
                .await
                .is_err()
        );
    }
}

#[tokio::test]
async fn blocked_core_work_does_not_block_heartbeat_or_background_shutdown() {
    let root = TempDir::new().unwrap();
    let runtime = runtime(&root).await;
    let mut client = client(&runtime, Duration::from_millis(20)).await;
    let guard = runtime.inner.adapter.lock().unwrap();
    client.request(1, "vault:status", json!({}), false).await;
    assert_eq!(client.frame().await.frame_type, FrameType::Heartbeat);
    runtime.deactivate().unwrap();
    let stopped = tokio::time::timeout(Duration::from_secs(3), client.task).await;
    drop(guard);
    stopped.unwrap().unwrap().unwrap();
    phase(&runtime, SessionPhase::Inactive).await;
}

#[tokio::test]
async fn media_epoch_cancellation_settles_pending_calls_before_core_is_available() {
    let root = TempDir::new().unwrap();
    let runtime = runtime(&root).await;
    let mut client = client(&runtime, HEARTBEAT_INTERVAL).await;
    let guard = runtime.inner.adapter.lock().unwrap();
    client
        .request(1, "catalog:media:inspect", json!({"node_id":123}), false)
        .await;
    client
        .request(2, "catalog:media:inspect:cancel", json!({"epoch":7}), false)
        .await;
    let first = client.json(1).await;
    let second = client.json(2).await;
    drop(guard);
    assert_eq!(first["code"], "CANCELLED");
    assert_eq!(second["result"]["epoch"], 7);
    client.request(3, "vault:status", json!({}), false).await;
    assert_eq!(client.json(3).await["ok"], true);
    client.stop().await;
}

#[tokio::test]
async fn full_admission_queue_rejects_work_but_still_allows_media_cancellation() {
    let root = TempDir::new().unwrap();
    let runtime = runtime(&root).await;
    let mut client = client(&runtime, HEARTBEAT_INTERVAL).await;
    let guard = runtime.inner.adapter.lock().unwrap();
    client
        .request(1, "catalog:media:inspect", json!({"node_id":123}), false)
        .await;
    tokio::time::timeout(Duration::from_secs(3), async {
        while runtime.inner.authority.lock().unwrap().pending.is_empty() {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    // Another authorized peer occupies the remaining shared admission budget.
    let other = runtime.open_peer_session(1).unwrap();
    let reserved: Vec<_> = (1..MAX_PENDING as u64)
        .map(|id| {
            other
                .admit(id, RpcRequest::new("vault:status", json!({})))
                .unwrap()
        })
        .collect();
    client.request(2, "vault:status", json!({}), false).await;
    assert_eq!(client.json(2).await["code"], "BUSY");
    client
        .request(3, "catalog:media:inspect:cancel", json!({"epoch":1}), false)
        .await;
    let canceled = client.json(1).await;
    let acknowledged = client.json(3).await;
    drop(guard);
    drop(reserved);
    assert_eq!(canceled["code"], "CANCELLED");
    assert_eq!(acknowledged["result"]["epoch"], 1);
    client.request(4, "vault:status", json!({}), false).await;
    assert_eq!(client.json(4).await["result"]["is_unlocked"], true);
    client.stop().await;
}

#[tokio::test]
async fn canceled_upload_does_not_publish_a_file_and_connection_remains_usable() {
    let root = TempDir::new().unwrap();
    let runtime = runtime(&root).await;
    let mut client = client(&runtime, HEARTBEAT_INTERVAL).await;
    client
        .request(
            1,
            "catalog:upload",
            json!({"name":"cancel.bin","parent_path":"/","size":8,"total_size":8,"finish":true}),
            true,
        )
        .await;
    send_encrypted_frame_typed(
        &mut client.transport,
        &mut client.noise,
        frame_continuation(FrameType::RpcRequest, 1, b"part".to_vec(), true),
    )
    .await
    .unwrap();
    send_encrypted_frame_typed(
        &mut client.transport,
        &mut client.noise,
        frame_from_error(1, error_codes::STREAM_CANCELLED, "cancel", PROTOCOL_VERSION),
    )
    .await
    .unwrap();
    client
        .request(2, "catalog:list", json!({"path":"/"}), false)
        .await;
    let result = client.json(2).await;
    assert_eq!(result["ok"], true);
    assert!(!result.to_string().contains("cancel.bin"));
    client.stop().await;
}

#[tokio::test]
async fn replay_closes_the_connection_and_env_runtime_never_reaches_core() {
    let root = TempDir::new().unwrap();
    let runtime = runtime(&root).await;
    let mut client = client(&runtime, HEARTBEAT_INTERVAL).await;
    client
        .request(1, "env_runtime:status", json!({}), false)
        .await;
    assert_eq!(client.json(1).await["code"], "REMOTE_CORE_UNSUPPORTED");
    client.request(1, "vault:status", json!({}), false).await;
    let error = tokio::time::timeout(Duration::from_secs(3), client.task)
        .await
        .unwrap()
        .unwrap()
        .unwrap_err();
    assert!(matches!(error, RemoteIoFailure::ProtocolError { .. }));
    assert_eq!(runtime.snapshot().unwrap().phase, SessionPhase::Unlocked);
}

#[tokio::test]
async fn silent_peer_is_released_without_locking_the_local_vault() {
    let root = TempDir::new().unwrap();
    let runtime = runtime(&root).await;
    let silent = client(&runtime, Duration::from_millis(30)).await;
    // Keep the peer's socket open: successful heartbeat writes alone must not keep it alive.
    let result = tokio::time::timeout(Duration::from_secs(1), silent.task)
        .await
        .expect("silent peer must expire")
        .unwrap();
    assert!(matches!(result, Err(RemoteIoFailure::TransportTimeout)));
    assert_eq!(runtime.snapshot().unwrap().phase, SessionPhase::Unlocked);
    let mut next = client(&runtime, HEARTBEAT_INTERVAL).await;
    next.request(1, "vault:status", json!({}), false).await;
    assert_eq!(next.json(1).await["result"]["is_unlocked"], true);
    next.stop().await;
}

#[tokio::test]
async fn valid_rpc_traffic_keeps_the_peer_alive_without_heartbeat_replies() {
    let root = TempDir::new().unwrap();
    let runtime = runtime(&root).await;
    let mut active = client(&runtime, Duration::from_millis(150)).await;
    for id in 1..=4 {
        tokio::time::sleep(Duration::from_millis(100)).await;
        active.request(id, "vault:status", json!({}), false).await;
        assert_eq!(active.json(id).await["result"]["is_unlocked"], true);
        assert!(!active.task.is_finished());
    }
    active.stop().await;
}
