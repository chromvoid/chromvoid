//! Remote data-plane background task.
//!
//! Spawns an async loop that handles RPC request/response pairs
//! and periodic heartbeats over a `RemoteTransport`.

mod frames;
mod handshake;
mod io_loop;

pub use chromvoid_client_runtime::remote_io_models::{
    RemoteIoEvent, RemoteIoFailure, RemoteIoRequest, RemoteIoResult, RemoteIoTaskConfig,
    RemoteIoTaskTiming, RemotePeerFeatures,
};
pub(crate) use frames::send_encrypted_frame_typed;
pub use frames::{recv_decrypted_frame, send_encrypted_frame};
pub use handshake::{
    handshake_ik_over_transport, handshake_ik_over_transport_typed, handshake_xx_over_transport,
    handshake_xx_over_transport_typed, RemoteHandshakeError, RemoteHandshakeFailureKind,
};

use tokio::sync::mpsc;
use tokio::task::JoinHandle;

pub struct RemoteIoTaskHandle {
    pub req_tx: mpsc::Sender<RemoteIoRequest>,
    pub evt_rx: mpsc::Receiver<RemoteIoEvent>,
    pub task_handle: JoinHandle<()>,
}

/// Spawn the remote data-plane background task.
/// Returns channel handles for sending requests and receiving events.
pub fn spawn_remote_io_task(config: RemoteIoTaskConfig) -> RemoteIoTaskHandle {
    spawn_remote_io_task_with_timing(config, RemoteIoTaskTiming::default())
}

/// Spawn the remote data-plane background task with explicit loop timing.
/// Production code should normally use `spawn_remote_io_task`; deterministic
/// tests use this to avoid real 15 second timeout waits.
pub fn spawn_remote_io_task_with_timing(
    config: RemoteIoTaskConfig,
    timing: RemoteIoTaskTiming,
) -> RemoteIoTaskHandle {
    let (req_tx, mut req_rx) = mpsc::channel::<RemoteIoRequest>(32);
    let (evt_tx, evt_rx) = mpsc::channel::<RemoteIoEvent>(64);

    let task_handle = tokio::spawn(async move {
        let result = io_loop::io_loop_with_timing(config, &mut req_rx, &evt_tx, timing).await;
        if let Err(failure) = result {
            let reason = failure.to_string();
            let _ = evt_tx
                .send(RemoteIoEvent::Disconnected { reason, failure })
                .await;
        }
    });

    RemoteIoTaskHandle {
        req_tx,
        evt_rx,
        task_handle,
    }
}

#[cfg(test)]
mod typed_failure_boundary_tests {
    #[test]
    fn task_shutdown_uses_typed_failure_event() {
        let source = include_str!("mod.rs");
        let removed_string_parser = concat!("legacy_from", "_reason");

        assert!(
            !source.contains(removed_string_parser),
            "remote data-plane task shutdown must propagate RemoteIoFailure directly"
        );
    }
}
