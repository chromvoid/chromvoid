use chromvoid_network_runtime::acceptor::{
    AcceptorRuntimeState, AcceptorState, ConnectedPeer, PeerConnection, PeerRegistrationResult,
    PeerRevocationResult,
};
use chromvoid_network_runtime::connection::NetworkConnectionManager;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::oneshot;

fn begin(runtime: &AcceptorRuntimeState) -> (u64, oneshot::Receiver<()>) {
    let (tx, rx) = oneshot::channel();
    let (generation, status) = runtime
        .begin_listener_session("wss://relay.test".into(), "room-1".into(), tx)
        .unwrap();
    assert_eq!(status.state, AcceptorState::Listening);
    (generation, rx)
}

fn register(
    runtime: &AcceptorRuntimeState,
    generation: u64,
    id: &str,
) -> (PeerRegistrationResult, oneshot::Receiver<()>) {
    let (tx, rx) = oneshot::channel();
    let result = runtime
        .add_peer_if_current(
            generation,
            ConnectedPeer {
                peer_id: id.into(),
                label: "Test desktop".into(),
                connected_at_ms: 1,
                transport_type: "wss".into(),
            },
            PeerConnection {
                conn_mgr: NetworkConnectionManager::new(),
                generation,
                shutdown_tx: Some(tx),
                task_handle: None,
            },
        )
        .unwrap();
    (result, rx)
}

struct TaskFinished(Option<oneshot::Sender<()>>);

impl Drop for TaskFinished {
    fn drop(&mut self) {
        let _ = self.0.take().unwrap().send(());
    }
}

fn pending_task() -> (tokio::task::JoinHandle<()>, oneshot::Receiver<()>) {
    let (tx, rx) = oneshot::channel();
    let finished = TaskFinished(Some(tx));
    let handle = tokio::spawn(async move {
        let _finished = finished;
        std::future::pending::<()>().await;
    });
    (handle, rx)
}

async fn assert_finished(finished: oneshot::Receiver<()>) {
    tokio::time::timeout(Duration::from_secs(1), finished)
        .await
        .expect("task must stop")
        .expect("task destructor must run");
}

#[tokio::test]
async fn stop_signals_and_aborts_owned_tasks_and_rejects_late_handles() {
    let runtime = AcceptorRuntimeState::new();
    let (generation, mut listener_shutdown) = begin(&runtime);
    let (listener, listener_finished) = pending_task();
    runtime.store_listener_task(generation, listener).unwrap();
    let (registered, mut peer_shutdown) = register(&runtime, generation, "peer-1");
    assert_eq!(registered, PeerRegistrationResult::Added);
    let (peer, peer_finished) = pending_task();
    assert!(runtime
        .store_peer_task_if_current(generation, "peer-1", peer)
        .unwrap());

    let stopped = runtime.cancel_all_tasks().unwrap();
    assert_eq!(stopped.state, AcceptorState::Idle);
    assert!(stopped.connected_peers.is_empty());
    assert!(stopped.relay_url.is_none());
    assert!(stopped.room_id.is_none());
    assert_eq!(listener_shutdown.try_recv(), Ok(()));
    assert_eq!(peer_shutdown.try_recv(), Ok(()));
    assert_finished(listener_finished).await;
    assert_finished(peer_finished).await;

    let (late_listener, late_listener_finished) = pending_task();
    runtime
        .store_listener_task(generation, late_listener)
        .unwrap();
    let (late_peer, late_peer_finished) = pending_task();
    assert!(!runtime
        .store_peer_task_if_current(generation, "peer-1", late_peer)
        .unwrap());
    assert_finished(late_listener_finished).await;
    assert_finished(late_peer_finished).await;
    assert_eq!(
        register(&runtime, generation, "late-peer").0,
        PeerRegistrationResult::StaleGeneration
    );
}

#[tokio::test]
async fn failed_platform_cleanup_still_aborts_peer_without_shutdown_receiver() {
    let runtime = AcceptorRuntimeState::new();
    let (generation, _listener_shutdown) = begin(&runtime);
    let (registered, shutdown) = register(&runtime, generation, "peer-1");
    assert_eq!(registered, PeerRegistrationResult::Added);
    drop(shutdown);
    let (peer, finished) = pending_task();
    assert!(runtime
        .store_peer_task_if_current(generation, "peer-1", peer)
        .unwrap());

    let result = runtime.revoke_peer_access("peer-1", || {
        // The platform callback can read status without deadlocking and already sees
        // the revocation guard. It cannot race a late handshake into admission.
        let status = runtime.with_acceptor(|a| a.status()).unwrap();
        assert_eq!(status.state, AcceptorState::Listening);
        assert!(status.connected_peers.is_empty());
        assert_eq!(
            register(&runtime, generation, "peer-1").0,
            PeerRegistrationResult::Revoked
        );
        Err("platform cleanup failed".into())
    });
    assert_eq!(result.unwrap_err(), "platform cleanup failed");
    assert_finished(finished).await;

    let (late, late_finished) = pending_task();
    assert!(!runtime
        .store_peer_task_if_current(generation, "peer-1", late)
        .unwrap());
    assert_finished(late_finished).await;
}

#[test]
fn revocation_clears_approvals_before_signalling_and_preserves_other_peers() {
    let runtime = AcceptorRuntimeState::new();
    let (generation, _listener_shutdown) = begin(&runtime);
    let (first, mut first_shutdown) = register(&runtime, generation, "peer-1");
    let (second, mut second_shutdown) = register(&runtime, generation, "peer-2");
    assert_eq!(first, PeerRegistrationResult::Added);
    assert_eq!(second, PeerRegistrationResult::Added);
    let mut cleaned = false;
    assert_eq!(
        runtime
            .revoke_peer_access("peer-1", || {
                assert_eq!(
                    first_shutdown.try_recv(),
                    Err(oneshot::error::TryRecvError::Empty)
                );
                cleaned = true;
                Ok(())
            })
            .unwrap(),
        PeerRevocationResult::DisconnectSignalled
    );
    assert!(cleaned);
    assert_eq!(first_shutdown.try_recv(), Ok(()));
    assert_eq!(
        second_shutdown.try_recv(),
        Err(oneshot::error::TryRecvError::Empty)
    );
    let status = runtime.with_acceptor(|a| a.status()).unwrap();
    assert_eq!(status.state, AcceptorState::Connected);
    assert_eq!(status.connected_peers.len(), 1);
    assert_eq!(status.connected_peers[0].peer_id, "peer-2");
    assert_eq!(
        register(&runtime, generation, "peer-1").0,
        PeerRegistrationResult::Revoked
    );
    runtime.clear_peer_revocation("peer-1").unwrap();
    assert_eq!(
        register(&runtime, generation, "peer-1").0,
        PeerRegistrationResult::Added
    );
    runtime.cancel_all_tasks().unwrap();
}

#[test]
fn direct_scopes_block_listener_restart_until_every_scope_is_released() {
    let runtime = Arc::new(AcceptorRuntimeState::new());
    let first = runtime.direct_transport_session_scope();
    let second = runtime.direct_transport_session_scope();
    runtime
        .begin_direct_transport_session("usb-session".into())
        .unwrap();
    runtime.cancel_all_tasks().unwrap();
    drop(first);
    assert!(runtime.has_active_direct_transport_session());
    let (tx, _rx) = oneshot::channel();
    assert_eq!(
        runtime
            .begin_listener_session("wss://relay.test".into(), "room-1".into(), tx)
            .unwrap_err(),
        "direct transport session active"
    );
    drop(second);
    assert!(!runtime.has_active_direct_transport_session());
    let _session = begin(&runtime);
    runtime.cancel_all_tasks().unwrap();
}

#[test]
fn stale_completion_cannot_remove_a_reconnected_peer() {
    let runtime = AcceptorRuntimeState::new();
    let (previous, _previous_shutdown) = begin(&runtime);
    assert_eq!(
        register(&runtime, previous, "peer-1").0,
        PeerRegistrationResult::Added
    );
    runtime.cancel_all_tasks().unwrap();
    let (current, _current_shutdown) = begin(&runtime);
    let (registered, mut peer_shutdown) = register(&runtime, current, "peer-1");
    assert_eq!(registered, PeerRegistrationResult::Added);
    assert!(!runtime.remove_peer_if_current(previous, "peer-1").unwrap());
    assert_eq!(
        runtime
            .with_acceptor(|a| a.status())
            .unwrap()
            .connected_peers
            .len(),
        1
    );
    assert_eq!(
        peer_shutdown.try_recv(),
        Err(oneshot::error::TryRecvError::Empty)
    );
    runtime.cancel_all_tasks().unwrap();
}

#[tokio::test]
async fn unlock_notifications_are_shared_with_the_same_runtime_only() {
    let runtime = AcceptorRuntimeState::new();
    let other = AcceptorRuntimeState::new();
    let mut subscriber = runtime.subscribe_vault_unlocks();
    let other_subscriber = other.subscribe_vault_unlocks();
    runtime.notify_vault_unlocked();
    subscriber.changed().await.unwrap();
    assert_eq!(*subscriber.borrow_and_update(), 1);
    assert!(!other_subscriber.has_changed().unwrap());
}
