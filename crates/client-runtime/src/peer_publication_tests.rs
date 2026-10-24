use super::*;
use async_trait::async_trait;
use chromvoid_network_runtime::remote_io::send_encrypted_frame_typed;
use chromvoid_protocol::{Frame, RemoteTransport, TransportError};
use std::sync::atomic::{AtomicUsize, Ordering};
use tokio::sync::Notify;

fn status() -> RpcRequest {
    RpcRequest::new("vault:status", json!({}))
}

#[tokio::test]
async fn completed_response_remains_cancelable_without_affecting_another_peer() {
    let root = TempDir::new().unwrap();
    let runtime = Arc::new(session(&root, Arc::new(InMemoryKeystore::new())));
    let first = runtime.open_peer_session(1).unwrap();
    let second = runtime.open_peer_session(1).unwrap();
    for (peer, canceled) in [(&first, true), (&second, false)] {
        let admitted = peer.admit(1, status()).unwrap();
        let publication = admitted.peer_publication().unwrap();
        let response = runtime.execute_admitted(admitted).await.unwrap();
        assert!(response.is_ok());
        if canceled {
            peer.cancel(1).unwrap();
        }
        let (mut host, mut host_noise, mut client, mut client_noise) = connection().await;
        let payload = serde_json::to_vec(response.result().unwrap()).unwrap();
        let mut guarded = publication.transport(&mut host);
        let result = send_encrypted_frame_typed(
            &mut guarded,
            &mut host_noise,
            Frame {
                frame_type: FrameType::RpcResponse,
                message_id: 1,
                flags: 0,
                payload: payload.clone(),
            },
        )
        .await;
        if canceled {
            assert_eq!(result, Err(RemoteIoFailure::TransportClosed));
            assert!(
                client.rx.try_recv().is_err(),
                "completed canceled response must not be published"
            );
        } else {
            result.unwrap();
            let frame = recv_decrypted_frame_typed(&mut client, &mut client_noise)
                .await
                .unwrap();
            assert_eq!(frame.message_id, 1);
            assert_eq!(frame.payload, payload);
        }
        // Even after revocation cleanup must be able to close the underlying transport.
        guarded.close().await.unwrap();
    }
}

struct StalledTransport {
    entered: Arc<Notify>,
    polls: Arc<AtomicUsize>,
    closed: Arc<AtomicUsize>,
}

impl StalledTransport {
    async fn wait<T>(&self) -> Result<T, TransportError> {
        std::future::poll_fn(|_| {
            self.polls.fetch_add(1, Ordering::SeqCst);
            self.entered.notify_one();
            std::task::Poll::Pending
        })
        .await
    }
}

#[async_trait]
impl RemoteTransport for StalledTransport {
    async fn send(&mut self, _: &[u8]) -> Result<(), TransportError> {
        self.wait().await
    }
    async fn recv(&mut self) -> Result<Vec<u8>, TransportError> {
        self.wait().await
    }
    async fn close(&mut self) -> Result<(), TransportError> {
        self.closed.fetch_add(1, Ordering::SeqCst);
        Ok(())
    }
    fn transport_type(&self) -> TransportType {
        TransportType::WssRelay
    }
}

#[derive(Clone, Copy, Debug)]
enum Revoke {
    Request,
    Peer,
    Lock,
    Background,
    OwnerDrop,
    UploadDrop,
}

#[tokio::test]
async fn revocation_wakes_stalled_io_and_owner_drop_is_not_retained_by_publication() {
    for action in [
        Revoke::Request,
        Revoke::Peer,
        Revoke::Lock,
        Revoke::Background,
        Revoke::OwnerDrop,
        Revoke::UploadDrop,
    ] {
        // Send and receive use the same authority boundary; neither may keep a socket wait alive.
        for receive in [false, true] {
            let root = TempDir::new().unwrap();
            let runtime = Arc::new(session(&root, Arc::new(InMemoryKeystore::new())));
            let peer = runtime.open_peer_session(1).unwrap();
            let upload = if matches!(action, Revoke::UploadDrop) {
                assert!(
                    runtime
                        .execute(
                            1,
                            1,
                            RpcRequest::new("vault:unlock", json!({"password":"synthetic upload"}))
                        )
                        .await
                        .unwrap()
                        .is_ok()
                );
                Some(peer.admit_upload(1, RpcRequest::new("catalog:upload", json!({"parent_path":"/", "name":"pending.bin", "size":3, "total_size":3, "finish":true}))).unwrap())
            } else {
                None
            };
            let publication = if let Some(upload) = &upload {
                upload.publication().unwrap()
            } else {
                let admitted = peer.admit(1, status()).unwrap();
                let publication = admitted.peer_publication().unwrap();
                assert!(runtime.execute_admitted(admitted).await.unwrap().is_ok());
                publication
            };
            let entered = Arc::new(Notify::new());
            let polls = Arc::new(AtomicUsize::new(0));
            let closed = Arc::new(AtomicUsize::new(0));
            let mut transport = StalledTransport {
                entered: entered.clone(),
                polls: polls.clone(),
                closed: closed.clone(),
            };
            let task = tokio::spawn(async move {
                let mut guarded = publication.transport(&mut transport);
                let result = if receive {
                    guarded.recv().await.map(|_| ())
                } else {
                    guarded.send(b"pending").await
                };
                guarded.close().await.unwrap();
                result
            });
            tokio::time::timeout(Duration::from_secs(1), entered.notified())
                .await
                .unwrap();
            match action {
                Revoke::Request => peer.cancel(1).unwrap(),
                Revoke::Peer => peer.close().unwrap(),
                Revoke::Lock => {
                    runtime.lock().unwrap();
                }
                Revoke::Background => {
                    runtime.deactivate().unwrap();
                }
                Revoke::OwnerDrop => {}
                Revoke::UploadDrop => {
                    drop(upload);
                }
            }
            if matches!(action, Revoke::Request | Revoke::Peer) {
                assert!(runtime.execute(1, 1, status()).await.unwrap().is_ok());
            }
            if matches!(action, Revoke::OwnerDrop) {
                drop(runtime);
            }
            let result = tokio::time::timeout(Duration::from_secs(1), task)
                .await
                .expect("revocation must wake I/O without socket readiness")
                .unwrap();
            assert!(matches!(result, Err(TransportError::Closed)), "{action:?}");
            assert_eq!(
                polls.load(Ordering::SeqCst),
                1,
                "must not repoll revoked I/O"
            );
            assert_eq!(closed.load(Ordering::SeqCst), 1);
        }
    }
}

#[tokio::test]
async fn publication_retains_original_pending_budget_until_dropped() {
    let root = TempDir::new().unwrap();
    let runtime = Arc::new(session(&root, Arc::new(InMemoryKeystore::new())));
    let peer = runtime.open_peer_session(1).unwrap();
    let admitted = peer.admit(1, status()).unwrap();
    let publication = admitted.peer_publication().unwrap();
    assert!(runtime.execute_admitted(admitted).await.unwrap().is_ok());
    let mut pending = Vec::new();
    for id in 2..=MAX_PENDING as u64 {
        pending.push(peer.admit(id, status()).unwrap());
    }
    assert!(matches!(
        peer.admit(MAX_PENDING as u64 + 1, status()),
        Err(SessionError::Busy)
    ));
    drop(publication);
    pending.push(peer.admit(MAX_PENDING as u64 + 1, status()).unwrap());
    let native = runtime.admit(1, 1, status());
    assert!(matches!(native, Err(SessionError::Busy)));
    drop(pending);
    let native = runtime.admit(1, 1, status()).unwrap();
    assert!(matches!(
        native.peer_publication(),
        Err(SessionError::RequestId)
    ));
}
