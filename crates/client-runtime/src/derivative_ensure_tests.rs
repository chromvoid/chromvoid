use super::*;
use crate::session::peer_session::PeerSession;
use crate::session::peer_stream::PeerStreamReply;
use crate::session::tests::{phase as wait_phase, session};
use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::rpc::RpcInputStream;
use serde_json::json;
use std::time::Duration;
use tempfile::TempDir;

fn png() -> Vec<u8> {
    let image = image::DynamicImage::ImageRgba8(image::ImageBuffer::from_pixel(
        320,
        160,
        image::Rgba([32, 96, 180, 127]),
    ));
    let mut bytes = std::io::Cursor::new(Vec::new());
    image.write_to(&mut bytes, image::ImageFormat::Png).unwrap();
    bytes.into_inner()
}
fn mp3() -> Vec<u8> {
    use lofty::picture::{MimeType, Picture, PictureType};
    use lofty::tag::{Tag, TagExt, TagType};
    let mut tag = Tag::new(TagType::Id3v2);
    tag.push_picture(
        Picture::unchecked(png())
            .pic_type(PictureType::CoverFront)
            .mime_type(MimeType::Png)
            .build(),
    );
    let mut bytes = Vec::new();
    tag.dump_to(&mut bytes, lofty::config::WriteOptions::default())
        .unwrap();
    for _ in 0..2 {
        bytes.extend([0xff, 0xfb, 0x90, 0x64]);
        bytes.resize(bytes.len() + 413, 0);
    }
    bytes
}
async fn source(
    root: &TempDir,
    name: &str,
    bytes: &[u8],
) -> (Arc<LocalSession>, PeerSession, HostDerivativeEnsureRequest) {
    let runtime = Arc::new(session(root, Arc::new(InMemoryKeystore::new())));
    assert!(
        runtime
            .execute(
                1,
                1,
                RpcRequest::new("vault:unlock", json!({"password":"synthetic derivative"}))
            )
            .await
            .unwrap()
            .is_ok()
    );
    let node = {
        let mut adapter = runtime.inner.adapter.lock().unwrap();
        let RpcReply::Json(response)=adapter.handle_with_stream(&RpcRequest::new("catalog:upload",json!({"name":name,"parent_path":"/","size":bytes.len(),"finish":true,"chunk_size":128})),Some(RpcInputStream::from_bytes(bytes.to_vec()))) else {panic!("upload JSON")};
        assert!(response.is_ok(), "{response:?}");
        response.result().unwrap()["node_id"].as_u64().unwrap()
    };
    let metadata = runtime
        .execute(
            2,
            1,
            RpcRequest::new("catalog:source:metadata", json!({"node_id":node})),
        )
        .await
        .unwrap();
    let request = HostDerivativeEnsureRequest {
        node_id: node,
        source_version: metadata.result().unwrap()["source_revision"]
            .as_u64()
            .unwrap(),
        tier: ImageDerivativeTier::Thumbnail,
        version: DERIVATIVE_STORAGE_VERSION,
        refresh_cache: false,
    };
    let peer = runtime.open_peer_session(1).unwrap();
    (runtime, peer, request)
}
fn rpc(request: HostDerivativeEnsureRequest) -> RpcRequest {
    RpcRequest::new(
        "catalog:derivative:ensure",
        json!({"node_id":request.node_id,"source_version":request.source_version,"tier":request.tier.label(),"version":request.version,"refresh_cache":request.refresh_cache}),
    )
}
async fn ensure(
    runtime: &LocalSession,
    peer: &PeerSession,
    id: u64,
    request: HostDerivativeEnsureRequest,
) -> RpcOutputStream {
    let reply = runtime
        .execute_admitted_download(peer.admit_download(id, rpc(request)).unwrap())
        .await
        .unwrap();
    match reply {
        PeerStreamReply::Stream(stream) => stream,
        PeerStreamReply::Json(response) => panic!("expected derivative, got {response:?}"),
        _ => panic!("range"),
    }
}
fn bytes(mut stream: RpcOutputStream) -> Vec<u8> {
    let mut bytes = Vec::new();
    stream.reader.read_to_end(&mut bytes).unwrap();
    assert_eq!(bytes.len() as u64, stream.meta.size);
    bytes
}
fn cached(runtime: &LocalSession, request: HostDerivativeEnsureRequest) -> Option<Vec<u8>> {
    read_cached(&mut runtime.inner.adapter.lock().unwrap(), request)
        .unwrap()
        .map(bytes)
}

#[tokio::test]
async fn native_image_and_audio_ensure_persist_real_decodable_thumbnails_and_reuse_cache() {
    for (name, input) in [("photo.png", png()), ("song.mp3", mp3())] {
        let root = TempDir::new().unwrap();
        let (runtime, peer, request) = source(&root, name, &input).await;
        assert!(cached(&runtime, request).is_none());
        let stream = ensure(&runtime, &peer, 1, request).await;
        assert_eq!(stream.meta.name.split('.').next(), name.split('.').next());
        let result = bytes(stream);
        let image = image::load_from_memory(&result).unwrap();
        assert_eq!((image.width(), image.height()), (256, 128));
        assert_eq!(cached(&runtime, request).unwrap(), result);
        assert_eq!(bytes(ensure(&runtime, &peer, 2, request).await), result);
        let metadata =
            source_metadata(&mut runtime.inner.adapter.lock().unwrap(), request).unwrap();
        assert_eq!(
            metadata.media_inspected_revision, 0,
            "derivatives must not mark media inspected"
        );
        assert_eq!(runtime.inner.authority.lock().unwrap().pending.len(), 0);
    }
}

#[tokio::test]
async fn refresh_replaces_cached_output_and_stale_or_invalid_requests_do_not_write() {
    let root = TempDir::new().unwrap();
    let (runtime, peer, mut request) = source(&root, "photo.png", &png()).await;
    let original = bytes(ensure(&runtime, &peer, 1, request).await);
    let fake = png();
    let snapshot = runtime
        .inner
        .adapter
        .lock()
        .unwrap()
        .snapshot_catalog_derivative_write(CatalogDerivativeWriteRequest {
            node_id: request.node_id,
            source_version: request.source_version,
            tier: request.tier.label().into(),
            version: request.version,
            size: fake.len() as u64,
            name: "cached.png".into(),
            mime_type: "image/png".into(),
            file_extension: "png".into(),
            chunk_size: 128,
        })
        .unwrap()
        .unwrap();
    let snapshot = WriteSnapshot(snapshot);
    let write = write_catalog_derivative_snapshot(&snapshot.0, &fake, || false).unwrap();
    assert!(
        runtime
            .inner
            .adapter
            .lock()
            .unwrap()
            .commit_catalog_derivative_write(&snapshot.0, &write)
            .unwrap()
            .is_ok()
    );
    assert_eq!(bytes(ensure(&runtime, &peer, 2, request).await), fake);
    request.refresh_cache = true;
    assert_eq!(bytes(ensure(&runtime, &peer, 3, request).await), original);
    for (id, data, expected) in [
        (4, json!({}), "EMPTY_PAYLOAD"),
        (
            5,
            json!({"node_id":request.node_id,"source_version":request.source_version+1,"tier":"thumbnail","version":request.version}),
            "ERR_MEDIA_STREAM_STALE",
        ),
        (
            6,
            json!({"node_id":request.node_id,"source_version":request.source_version,"tier":"thumbnail","version":999}),
            "UNSUPPORTED",
        ),
    ] {
        let reply = runtime
            .execute_admitted_download(
                peer.admit_download(id, RpcRequest::new("catalog:derivative:ensure", data))
                    .unwrap(),
            )
            .await
            .unwrap();
        let PeerStreamReply::Json(response) = reply else {
            panic!("error expected")
        };
        assert_eq!(response.code(), Some(expected));
    }
    assert_eq!(cached(&runtime, request).unwrap(), original);
}

#[tokio::test]
async fn encrypted_source_seeks_across_chunks_and_audio_budget_counts_repeated_reads() {
    let root = TempDir::new().unwrap();
    let input: Vec<u8> = (0..1000).map(|n| (n % 251) as u8).collect();
    let (runtime, _peer, request) = source(&root, "data.bin", &input).await;
    let mut reader = runtime
        .inner
        .adapter
        .lock()
        .unwrap()
        .open_catalog_source_reader(request.node_id, request.source_version)
        .unwrap();
    reader.seek(SeekFrom::Start(127)).unwrap();
    let mut result = [0; 260];
    reader.read_exact(&mut result).unwrap();
    assert_eq!(result, input[127..387]);
    reader.seek(SeekFrom::Current(-259)).unwrap();
    assert_eq!(reader.stream_position().unwrap(), 128);
    reader.seek(SeekFrom::End(-3)).unwrap();
    let mut tail = Vec::new();
    reader.read_to_end(&mut tail).unwrap();
    assert_eq!(tail, &input[997..]);
    assert!(reader.seek(SeekFrom::Start(u64::MAX)).is_ok());
    assert_eq!(reader.read(&mut result).unwrap(), 0);
    assert!(reader.seek(SeekFrom::Current(1)).is_err());
    reader.seek(SeekFrom::Start(0)).unwrap();
    let exceeded = Arc::new(AtomicBool::new(false));
    let cancellation = Cancellation {
        request: Arc::new(AtomicBool::new(false)),
        dispatcher: runtime.dispatcher.clone(),
        epoch: runtime.dispatcher.low_priority_cancellation_generation(),
    };
    let mut reader = DecoderReader {
        source: reader,
        cancellation,
        fetched: 0,
        budget: 256,
        exceeded: exceeded.clone(),
    };
    reader.read_exact(&mut result[..128]).unwrap();
    reader.seek(SeekFrom::Start(0)).unwrap();
    reader.read_exact(&mut result[..128]).unwrap();
    assert!(reader.read(&mut result).is_err());
    assert!(exceeded.load(Ordering::Relaxed));
}

#[tokio::test]
async fn a_published_derivative_reader_is_revoked_when_peer_closes_or_app_backgrounds() {
    for background in [false, true] {
        let root = TempDir::new().unwrap();
        let (runtime, peer, request) = source(&root, "photo.png", &png()).await;
        let mut stream = ensure(&runtime, &peer, 1, request).await;
        if background {
            runtime.deactivate().unwrap();
        } else {
            peer.close().unwrap();
        }
        let mut output = [0xaa; 32];
        assert!(stream.reader.read(&mut output).is_err());
        assert_eq!(output, [0xaa; 32]);
        if background {
            wait_phase(&runtime, SessionPhase::Inactive).await;
        }
    }
}

#[tokio::test]
async fn requests_waiting_for_the_same_derivative_cancel_without_holding_core() {
    let root = TempDir::new().unwrap();
    let (runtime, peer, request) = source(&root, "photo.png", &png()).await;
    let lock = Arc::new(tokio::sync::Mutex::new(()));
    let held = lock.clone().lock_owned().await;
    runtime.inner.derivatives.keys.lock().unwrap().insert(
        derivative_storage_key(request.node_id, request.source_version, request.tier),
        Arc::downgrade(&lock),
    );
    let work = peer.admit_download(1, rpc(request)).unwrap();
    let operation = tokio::spawn(runtime.execute_admitted_download(work));
    tokio::time::timeout(Duration::from_secs(2), async {
        while runtime.inner.derivatives.slots.available_permits() == 8 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    assert!(
        runtime
            .execute(3, 1, RpcRequest::new("vault:status", json!({})))
            .await
            .unwrap()
            .is_ok()
    );
    peer.close().unwrap();
    assert!(matches!(
        tokio::time::timeout(Duration::from_secs(2), operation)
            .await
            .unwrap()
            .unwrap(),
        Err(SessionError::Canceled)
    ));
    drop(held);
    assert!(cached(&runtime, request).is_none());
    assert_eq!(runtime.inner.derivatives.slots.available_permits(), 8);
}

#[tokio::test]
async fn canceled_or_stale_writes_cannot_commit_and_abandoned_refresh_restores_cache() {
    for changed_source in [false, true] {
        let root = TempDir::new().unwrap();
        let (runtime, peer, request) = source(&root, "photo.png", &png()).await;
        let original = bytes(ensure(&runtime, &peer, 1, request).await);
        let admitted = runtime.admit(3, 1, rpc(request)).unwrap();
        let cancellation = Cancellation {
            request: admitted.cancel.clone(),
            dispatcher: runtime.dispatcher.clone(),
            epoch: runtime.dispatcher.low_priority_cancellation_generation(),
        };
        let replacement = png();
        let snapshot = WriteSnapshot(
            runtime
                .inner
                .adapter
                .lock()
                .unwrap()
                .snapshot_catalog_derivative_write(CatalogDerivativeWriteRequest {
                    node_id: request.node_id,
                    source_version: request.source_version,
                    tier: request.tier.label().into(),
                    version: request.version,
                    size: replacement.len() as u64,
                    name: "new.png".into(),
                    mime_type: "image/png".into(),
                    file_extension: "png".into(),
                    chunk_size: 128,
                })
                .unwrap()
                .unwrap(),
        );
        let result =
            write_catalog_derivative_snapshot(&snapshot.0, &replacement, || false).unwrap();
        let job = Arc::new(JobLease {
            _slot: runtime
                .inner
                .derivatives
                .slots
                .clone()
                .try_acquire_owned()
                .unwrap(),
            _key: Arc::new(tokio::sync::Mutex::new(())).lock_owned().await,
        });
        let state = Arc::new(Mutex::new(DerivativeState::default()));
        let work = DerivativeWork {
            state,
            request,
            cancellation,
            phase: Phase::Finish(Some(Written {
                snapshot,
                result: Some(result),
                _job: job,
            })),
            prepared: None,
            stream: Arc::new(Mutex::new(PeerStreamState::default())),
            output: None,
        };
        // A key transition invalidates the original epoch without changing the source;
        // entering a fresh dispatcher phase must not revive this completed write.
        let mut current = request;
        if changed_source {
            let mut adapter = runtime.inner.adapter.lock().unwrap();
            let RpcReply::Json(response)=adapter.handle_with_stream(&RpcRequest::new("catalog:file:replace",json!({"node_id":request.node_id,"size":3,"expected_source_revision":request.source_version})),Some(RpcInputStream::from_bytes(b"new".to_vec()))) else { panic!("replace JSON"); };
            assert!(response.is_ok());
            let metadata = adapter.handle(&RpcRequest::new(
                "catalog:source:metadata",
                json!({"node_id":request.node_id}),
            ));
            current.source_version = metadata.result().unwrap()["source_revision"]
                .as_u64()
                .unwrap();
        } else {
            runtime
                .dispatcher
                .begin_command(command_policy("vault:rekey"));
        }
        let response = LocalSession::execute_admitted_phase(
            runtime.inner.clone(),
            runtime.dispatcher.clone(),
            AdmittedRequest {
                generation: admitted.generation,
                request: OwnedRequest(admitted.request.0.clone()),
                cancel: admitted.cancel.clone(),
                pending: admitted.pending.clone(),
                resource_work: Some(ResourceWork::Derivative(work)),
                import_lease: None,
            },
        )
        .await;
        if changed_source {
            assert_eq!(response.unwrap().code(), Some("ERR_MEDIA_STREAM_STALE"));
            assert!(cached(&runtime, current).is_none());
        } else {
            assert!(
                matches!(response, Err(SessionError::Canceled))
                    || response.is_ok_and(|response| response.code() == Some("CANCELLED"))
            );
            assert_eq!(cached(&runtime, request).unwrap(), original);
        }
    }
}

#[test]
fn dropping_queued_decode_keeps_its_job_reserved_until_worker_exits_and_cannot_write() {
    let executor = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .max_blocking_threads(1)
        .build()
        .unwrap();
    executor.block_on(async {
        let root = TempDir::new().unwrap();
        let (runtime, peer, request) = source(&root, "photo.png", &png()).await;
        let (entered_tx, entered_rx) = tokio::sync::oneshot::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let occupied = tokio::task::spawn_blocking(move || {
            entered_tx.send(()).unwrap();
            release_rx.recv_timeout(Duration::from_secs(10)).unwrap();
        });
        entered_rx.await.unwrap();
        let operation = tokio::spawn(
            runtime.execute_admitted_download(peer.admit_download(1, rpc(request)).unwrap()),
        );
        // Wait for admission registration, then place a barrier behind its Core prepare.
        // The blocking pool is occupied, so after this barrier the source can only be
        // owned by the queued decoder; observing the initially empty state is insufficient.
        tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                if runtime
                    .inner
                    .authority
                    .lock()
                    .unwrap()
                    .pending
                    .values()
                    .any(|control| control.derivative.is_some())
                {
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        runtime
            .dispatcher
            .run_adapter_phase(
                CoreRpcPriority::LowPriority,
                "derivative-test-barrier",
                "test",
                runtime.dispatcher.low_priority_cancellation_generation(),
                || (),
            )
            .await
            .unwrap();
        let ready = tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                let source_taken = {
                    let authority = runtime.inner.authority.lock().unwrap();
                    authority
                        .pending
                        .values()
                        .filter_map(|control| control.derivative.as_ref())
                        .any(|state| {
                            let state = state.lock().unwrap();
                            state.source.is_none()
                                && runtime.inner.derivatives.slots.available_permits() == 7
                        })
                };
                if source_taken {
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await;
        operation.abort();
        let stopped = operation.await;
        let reserved = runtime.inner.derivatives.slots.available_permits();
        release_tx.send(()).unwrap();
        occupied.await.unwrap();
        assert!(ready.is_ok());
        assert!(matches!(stopped, Err(error) if error.is_cancelled()));
        assert_eq!(reserved, 7);
        tokio::time::timeout(Duration::from_secs(2), async {
            while runtime.inner.derivatives.slots.available_permits() != 8 {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        assert!(cached(&runtime, request).is_none());
    });
}

#[test]
fn cached_derivative_reader_rejects_short_and_oversized_payloads() {
    for (input, expected, kind) in [
        (vec![1], 2, io::ErrorKind::UnexpectedEof),
        (vec![1, 2, 3], 2, io::ErrorKind::InvalidData),
    ] {
        let mut reader = DerivativeReader {
            reader: Box::new(std::io::Cursor::new(input)),
            remaining: expected,
        };
        let mut output = Vec::new();
        assert_eq!(reader.read_to_end(&mut output).unwrap_err().kind(), kind);
    }
}
