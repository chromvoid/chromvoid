mod chunk_reader;
mod io_loop;
pub mod models;

pub use models::{IoEvent, IoRequest, IoTaskConfig};

use tokio::sync::mpsc;
use tokio::task::JoinHandle;

pub struct UsbIoTaskHandle {
    pub req_tx: mpsc::Sender<IoRequest>,
    pub evt_rx: mpsc::Receiver<IoEvent>,
    pub task_handle: JoinHandle<()>,
}

/// Spawn the USB I/O background task.
/// Returns channel handles for sending requests and receiving events.
pub fn spawn_io_task(config: IoTaskConfig) -> UsbIoTaskHandle {
    let (req_tx, mut req_rx) = mpsc::channel::<IoRequest>(32);
    let (evt_tx, evt_rx) = mpsc::channel::<IoEvent>(64);

    let task_handle = tokio::spawn(async move {
        let result = io_loop::io_loop(config, &mut req_rx, &evt_tx).await;
        if let Err(e) = result {
            let _ = evt_tx
                .send(IoEvent::Disconnected {
                    reason: format!("{}", e),
                })
                .await;
        }
    });

    UsbIoTaskHandle {
        req_tx,
        evt_rx,
        task_handle,
    }
}
