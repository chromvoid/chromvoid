//! Remote data-plane background task.
//!
//! Spawns an async loop that handles RPC request/response pairs
//! and periodic heartbeats over a `RemoteTransport`.

mod frames;
mod io_loop;
mod models;

pub use frames::{recv_decrypted_frame, send_encrypted_frame};
pub use models::{RemoteIoEvent, RemoteIoRequest, RemoteIoTaskConfig};

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
    let (req_tx, mut req_rx) = mpsc::channel::<RemoteIoRequest>(32);
    let (evt_tx, evt_rx) = mpsc::channel::<RemoteIoEvent>(64);

    let task_handle = tokio::spawn(async move {
        let result = io_loop::io_loop(config, &mut req_rx, &evt_tx).await;
        if let Err(e) = result {
            let _ = evt_tx
                .send(RemoteIoEvent::Disconnected {
                    reason: format!("{}", e),
                })
                .await;
        }
    });

    RemoteIoTaskHandle {
        req_tx,
        evt_rx,
        task_handle,
    }
}
