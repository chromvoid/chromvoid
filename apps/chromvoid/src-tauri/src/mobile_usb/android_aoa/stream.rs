use super::super::record_transport::MAX_USB_REMOTE_RECORD_BYTES;
use super::backend::{AndroidAoaBackendError, AndroidAoaEndpointHandle};
use std::future::Future;
use std::io;
use std::pin::Pin;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc,
};
use std::task::{Context, Poll};
use std::time::{Duration, Instant};
use tokio::io::{AsyncRead, AsyncWrite, AsyncWriteExt, DuplexStream, ReadBuf};
use tokio::sync::mpsc;

pub(super) const BULK_READ_TIMEOUT: Duration = Duration::from_millis(50);
pub(super) const BULK_WRITE_TIMEOUT: Duration = Duration::from_secs(2);
const AOA_WORKER_BUFFER_BYTES: usize = 16 * 1024;
const AOA_READ_QUEUE_CAPACITY: usize = 8;
const AOA_READ_QUEUE_FULL_TIMEOUT: Duration = Duration::from_millis(250);
static NEXT_AOA_STREAM_ID: AtomicU64 = AtomicU64::new(1);

pub(super) struct AndroidAoaByteStream {
    stream_id: u64,
    inner: DuplexStream,
    endpoint: Arc<dyn AndroidAoaEndpointHandle>,
    closed: Arc<AtomicBool>,
    pending_write: Option<tokio::task::JoinHandle<io::Result<usize>>>,
    pending_shutdown: Option<tokio::task::JoinHandle<io::Result<()>>>,
    shutdown_complete: bool,
}

impl AndroidAoaByteStream {
    pub(super) fn new(endpoint: Box<dyn AndroidAoaEndpointHandle>) -> Self {
        let stream_id = NEXT_AOA_STREAM_ID.fetch_add(1, Ordering::Relaxed);
        let buffer_size = (MAX_USB_REMOTE_RECORD_BYTES * 2).max(AOA_WORKER_BUFFER_BYTES);
        let (app_stream, worker_stream) = tokio::io::duplex(buffer_size);
        let (_worker_read, worker_write) = tokio::io::split(worker_stream);
        let endpoint: Arc<dyn AndroidAoaEndpointHandle> = Arc::from(endpoint);
        let closed = Arc::new(AtomicBool::new(false));

        tracing::info!(
            stream_id,
            buffer_size,
            "mobile_usb android_aoa stream created"
        );
        spawn_read_worker(stream_id, endpoint.clone(), closed.clone(), worker_write);

        Self {
            stream_id,
            inner: app_stream,
            endpoint,
            closed,
            pending_write: None,
            pending_shutdown: None,
            shutdown_complete: false,
        }
    }

    fn poll_pending_write(&mut self, cx: &mut Context<'_>) -> Poll<io::Result<usize>> {
        let Some(handle) = self.pending_write.as_mut() else {
            return Poll::Ready(Ok(0));
        };

        match Pin::new(handle).poll(cx) {
            Poll::Pending => Poll::Pending,
            Poll::Ready(result) => {
                self.pending_write = None;
                match result {
                    Ok(Ok(len)) => {
                        tracing::debug!(
                            stream_id = self.stream_id,
                            len,
                            "mobile_usb android_aoa write worker done"
                        );
                        Poll::Ready(Ok(len))
                    }
                    Ok(Err(error)) => {
                        self.closed.store(true, Ordering::SeqCst);
                        tracing::warn!(
                            stream_id = self.stream_id,
                            error = %error,
                            "mobile_usb android_aoa write worker error"
                        );
                        Poll::Ready(Err(error))
                    }
                    Err(error) => {
                        self.closed.store(true, Ordering::SeqCst);
                        tracing::warn!(
                            stream_id = self.stream_id,
                            error = %error,
                            "mobile_usb android_aoa write worker join error"
                        );
                        Poll::Ready(Err(io::Error::other(format!(
                            "Android AOA write worker failed: {error}"
                        ))))
                    }
                }
            }
        }
    }

    fn poll_pending_shutdown(&mut self, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        let Some(handle) = self.pending_shutdown.as_mut() else {
            return Poll::Ready(Ok(()));
        };

        match Pin::new(handle).poll(cx) {
            Poll::Pending => Poll::Pending,
            Poll::Ready(result) => {
                self.pending_shutdown = None;
                match result {
                    Ok(result) => Poll::Ready(result),
                    Err(error) => Poll::Ready(Err(io::Error::other(format!(
                        "Android AOA shutdown worker failed: {error}"
                    )))),
                }
            }
        }
    }
}

impl AsyncRead for AndroidAoaByteStream {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        std::pin::Pin::new(&mut self.inner).poll_read(cx, buf)
    }
}

impl AsyncWrite for AndroidAoaByteStream {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        data: &[u8],
    ) -> Poll<io::Result<usize>> {
        if self.closed.load(Ordering::SeqCst) {
            return Poll::Ready(Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "Android AOA endpoint is closed",
            )));
        }
        if self.pending_write.is_some() {
            return self.poll_pending_write(cx);
        }
        if data.is_empty() {
            return Poll::Ready(Ok(0));
        }

        let endpoint = self.endpoint.clone();
        let bytes = data.to_vec();
        let stream_id = self.stream_id;
        tracing::debug!(
            stream_id,
            len = bytes.len(),
            "mobile_usb android_aoa write worker posted"
        );
        self.pending_write = Some(tokio::task::spawn_blocking(move || {
            let len = bytes.len();
            write_all_endpoint(stream_id, endpoint, &bytes)
                .map(|()| len)
                .map_err(endpoint_error_to_io)
        }));
        self.poll_pending_write(cx)
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        match self.poll_pending_write(cx) {
            Poll::Pending => Poll::Pending,
            Poll::Ready(Ok(_)) => Poll::Ready(Ok(())),
            Poll::Ready(Err(error)) => Poll::Ready(Err(error)),
        }
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        if self.shutdown_complete {
            return Poll::Ready(Ok(()));
        }

        match self.poll_pending_write(cx) {
            Poll::Pending => return Poll::Pending,
            Poll::Ready(Ok(_)) => {}
            Poll::Ready(Err(error)) => return Poll::Ready(Err(error)),
        }

        self.closed.store(true, Ordering::SeqCst);
        if self.pending_shutdown.is_none() {
            let endpoint = self.endpoint.clone();
            self.pending_shutdown = Some(tokio::task::spawn_blocking(move || {
                close_endpoint(endpoint).map_err(endpoint_error_to_io)
            }));
        }
        match self.poll_pending_shutdown(cx) {
            Poll::Pending => Poll::Pending,
            Poll::Ready(Ok(())) => {
                self.shutdown_complete = true;
                Poll::Ready(Ok(()))
            }
            Poll::Ready(Err(error)) => Poll::Ready(Err(error)),
        }
    }
}

impl Drop for AndroidAoaByteStream {
    fn drop(&mut self) {
        tracing::info!(
            stream_id = self.stream_id,
            shutdown_complete = self.shutdown_complete,
            "mobile_usb android_aoa stream drop"
        );
        self.closed.store(true, Ordering::SeqCst);
        if self.shutdown_complete {
            return;
        }
        close_endpoint_after_drop(self.stream_id, self.endpoint.clone());
    }
}

fn spawn_read_worker(
    stream_id: u64,
    endpoint: Arc<dyn AndroidAoaEndpointHandle>,
    closed: Arc<AtomicBool>,
    writer: tokio::io::WriteHalf<DuplexStream>,
) {
    let (chunk_tx, chunk_rx) = mpsc::channel::<Vec<u8>>(AOA_READ_QUEUE_CAPACITY);
    spawn_read_forwarder(stream_id, closed.clone(), writer, chunk_rx);

    // One persistent blocking thread per stream: a fresh spawn_blocking hop
    // per 16 KiB bulk read adds thread-pool tail latency under contention,
    // and the read must stay posted continuously anyway (AOA requirement).
    let closed_for_spawn_failure = closed.clone();
    let spawn_result = std::thread::Builder::new()
        .name(format!("aoa-read-{stream_id}"))
        .spawn(move || {
            tracing::info!(stream_id, "mobile_usb android_aoa read worker started");
            let mut buf = vec![0_u8; AOA_WORKER_BUFFER_BYTES];
            loop {
                if closed.load(Ordering::SeqCst) {
                    tracing::info!(
                        stream_id,
                        reason = "closed_flag",
                        "mobile_usb android_aoa read worker stopping"
                    );
                    break;
                }

                match endpoint.bulk_read(&mut buf, BULK_READ_TIMEOUT) {
                    Ok(0) => {}
                    Ok(len) => {
                        tracing::debug!(
                            stream_id,
                            len,
                            "mobile_usb android_aoa read worker received bytes"
                        );
                        if closed.load(Ordering::SeqCst) {
                            tracing::info!(
                                stream_id,
                                len,
                                reason = "closed_after_read",
                                "mobile_usb android_aoa read worker discarding bytes"
                            );
                            break;
                        }
                        if !forward_read_chunk(stream_id, &closed, &chunk_tx, buf[..len].to_vec()) {
                            break;
                        }
                    }
                    Err(AndroidAoaBackendError::Timeout) => {
                        // Test/fake endpoints can report Timeout instantly;
                        // avoid a hot spin while keeping real backends (which
                        // block for BULK_READ_TIMEOUT) unaffected.
                        std::thread::sleep(Duration::from_millis(1));
                    }
                    Err(AndroidAoaBackendError::NoDevice) => {
                        closed.store(true, Ordering::SeqCst);
                        tracing::info!(
                            stream_id,
                            "mobile_usb android_aoa read worker device disconnected"
                        );
                        break;
                    }
                    Err(error) => {
                        closed.store(true, Ordering::SeqCst);
                        tracing::warn!(
                            stream_id,
                            error = ?error,
                            "mobile_usb android_aoa read worker endpoint error"
                        );
                        break;
                    }
                }
            }
            tracing::info!(stream_id, "mobile_usb android_aoa read worker ended");
        });
    if let Err(error) = spawn_result {
        closed_for_spawn_failure.store(true, Ordering::SeqCst);
        tracing::warn!(
            stream_id,
            error = %error,
            "mobile_usb android_aoa read worker thread spawn failed"
        );
    }
}

/// Blocking-thread equivalent of the previous async bounded send with the
/// 250 ms backpressure backstop: retry `try_send` until the deadline, then
/// close the stream.
fn forward_read_chunk(
    stream_id: u64,
    closed: &Arc<AtomicBool>,
    chunk_tx: &mpsc::Sender<Vec<u8>>,
    bytes: Vec<u8>,
) -> bool {
    let deadline = Instant::now() + AOA_READ_QUEUE_FULL_TIMEOUT;
    let mut item = bytes;
    loop {
        match chunk_tx.try_send(item) {
            Ok(()) => return true,
            Err(mpsc::error::TrySendError::Closed(_)) => {
                closed.store(true, Ordering::SeqCst);
                tracing::warn!(
                    stream_id,
                    "mobile_usb android_aoa read queue forwarder closed"
                );
                return false;
            }
            Err(mpsc::error::TrySendError::Full(returned)) => {
                if Instant::now() >= deadline {
                    closed.store(true, Ordering::SeqCst);
                    tracing::warn!(
                        stream_id,
                        capacity = AOA_READ_QUEUE_CAPACITY,
                        timeout_ms = AOA_READ_QUEUE_FULL_TIMEOUT.as_millis() as u64,
                        "mobile_usb android_aoa read queue backpressure closed stream"
                    );
                    return false;
                }
                item = returned;
                std::thread::sleep(Duration::from_millis(2));
            }
        }
    }
}

fn spawn_read_forwarder(
    stream_id: u64,
    closed: Arc<AtomicBool>,
    mut writer: tokio::io::WriteHalf<DuplexStream>,
    mut chunk_rx: mpsc::Receiver<Vec<u8>>,
) {
    tokio::spawn(async move {
        tracing::info!(stream_id, "mobile_usb android_aoa read forwarder started");
        while let Some(bytes) = chunk_rx.recv().await {
            if closed.load(Ordering::SeqCst) {
                break;
            }
            if writer.write_all(&bytes).await.is_err() {
                closed.store(true, Ordering::SeqCst);
                tracing::warn!(
                    stream_id,
                    "mobile_usb android_aoa read forwarder failed to write bytes"
                );
                break;
            }
        }
        let _ = writer.shutdown().await;
        tracing::info!(stream_id, "mobile_usb android_aoa read forwarder ended");
    });
}

fn close_endpoint_after_drop(stream_id: u64, endpoint: Arc<dyn AndroidAoaEndpointHandle>) {
    let Ok(handle) = tokio::runtime::Handle::try_current() else {
        let _ = endpoint.close();
        return;
    };

    handle.spawn_blocking(move || {
        if let Err(error) = close_endpoint(endpoint) {
            tracing::warn!(
                stream_id,
                error = ?error,
                "mobile_usb android_aoa stream drop close failed"
            );
        } else {
            tracing::info!(
                stream_id,
                "mobile_usb android_aoa stream drop closed busy endpoint"
            );
        }
    });
}

fn write_all_endpoint(
    stream_id: u64,
    endpoint: Arc<dyn AndroidAoaEndpointHandle>,
    mut data: &[u8],
) -> Result<(), AndroidAoaBackendError> {
    let total_len = data.len();
    let mut offset = 0usize;
    let mut chunk_index = 0usize;
    while !data.is_empty() {
        chunk_index += 1;
        let started_at = Instant::now();
        tracing::debug!(
            stream_id,
            chunk_index,
            offset,
            remaining_len = data.len(),
            total_len,
            timeout_ms = BULK_WRITE_TIMEOUT.as_millis() as u64,
            "mobile_usb android_aoa bulk_write start"
        );
        let written = match endpoint.bulk_write(data, BULK_WRITE_TIMEOUT) {
            Ok(written) => {
                tracing::debug!(
                    stream_id,
                    chunk_index,
                    offset,
                    written,
                    duration_ms = started_at.elapsed().as_millis() as u64,
                    "mobile_usb android_aoa bulk_write done"
                );
                written
            }
            Err(error) => {
                tracing::warn!(
                    stream_id,
                    chunk_index,
                    offset,
                    remaining_len = data.len(),
                    duration_ms = started_at.elapsed().as_millis() as u64,
                    error = ?error,
                    "mobile_usb android_aoa bulk_write failed"
                );
                return Err(error);
            }
        };
        if written == 0 {
            return Err(AndroidAoaBackendError::Io(
                "Android AOA endpoint wrote zero bytes".to_string(),
            ));
        }
        offset += written;
        data = &data[written..];
    }
    Ok(())
}

fn close_endpoint(
    endpoint: Arc<dyn AndroidAoaEndpointHandle>,
) -> Result<(), AndroidAoaBackendError> {
    endpoint.close()
}

fn endpoint_error_to_io(error: AndroidAoaBackendError) -> io::Error {
    let kind = match error {
        AndroidAoaBackendError::PermissionDenied => io::ErrorKind::PermissionDenied,
        AndroidAoaBackendError::NoDevice => io::ErrorKind::BrokenPipe,
        AndroidAoaBackendError::UnsupportedProtocol => io::ErrorKind::Unsupported,
        AndroidAoaBackendError::Timeout => io::ErrorKind::TimedOut,
        AndroidAoaBackendError::Io(_) => io::ErrorKind::Other,
    };
    io::Error::new(kind, format!("Android AOA endpoint failed: {error:?}"))
}
