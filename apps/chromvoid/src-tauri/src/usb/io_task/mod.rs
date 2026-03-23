mod chunk_reader;
mod io_loop;
pub mod models;

pub use models::{IoEvent, IoRequest, IoTaskConfig};

use tokio::sync::mpsc;

/// Spawn the USB I/O background task.
/// Returns channel handles for sending requests and receiving events.
pub fn spawn_io_task(config: IoTaskConfig) -> (mpsc::Sender<IoRequest>, mpsc::Receiver<IoEvent>) {
    let (req_tx, mut req_rx) = mpsc::channel::<IoRequest>(32);
    let (evt_tx, evt_rx) = mpsc::channel::<IoEvent>(64);

    tokio::spawn(async move {
        let result = io_loop::io_loop(config, &mut req_rx, &evt_tx).await;
        if let Err(e) = result {
            let _ = evt_tx
                .send(IoEvent::Disconnected {
                    reason: format!("{}", e),
                })
                .await;
        }
    });

    (req_tx, evt_rx)
}
