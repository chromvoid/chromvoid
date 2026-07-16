use std::future::Future;
use std::io;
#[cfg(test)]
use std::os::fd::RawFd;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::task::{Context, Poll};

use tokio::io::{AsyncRead, AsyncWrite, AsyncWriteExt, ReadBuf};

use super::blocking_io::{
    blocking_read_accessory_fd, blocking_write_all_accessory_fd, set_fd_nonblocking,
};
use super::guard::{AccessoryFd, AndroidAccessoryDetachedFd, AndroidAccessoryFdCloseHandle};
use super::{accessory_fd_transient_eio_max_retries, ACCESSORY_FD_READ_BUFFER_BYTES};
use crate::mobile::android::usb_accessory_runtime::{
    android_usb_log_info, android_usb_log_warn, log_session_id,
};
use crate::mobile_usb::SessionId;

#[cfg(unix)]
pub(crate) struct AndroidAccessoryFdStream {
    session_id: SessionId,
    inner: tokio::io::DuplexStream,
    fd: Arc<AccessoryFd>,
    closed: Arc<AtomicBool>,
    pending_write: Option<tokio::task::JoinHandle<io::Result<usize>>>,
}

#[cfg(unix)]
impl AndroidAccessoryFdStream {
    #[cfg(test)]
    pub(crate) unsafe fn from_raw_fd(fd: RawFd) -> io::Result<Self> {
        if fd < 0 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Android USB accessory fd is negative",
            ));
        }
        Self::from_detached_fd("test-fd".to_string(), AndroidAccessoryDetachedFd::new(fd))
            .map(|(stream, _close)| stream)
    }

    pub(crate) fn from_detached_fd(
        session_id: SessionId,
        fd: AndroidAccessoryDetachedFd,
    ) -> io::Result<(Self, AndroidAccessoryFdCloseHandle)> {
        let raw_fd = fd.into_raw_fd();
        if let Err(error) = set_fd_nonblocking(raw_fd) {
            unsafe {
                libc::close(raw_fd);
            }
            return Err(error);
        }
        let fd = Arc::new(AccessoryFd::new(raw_fd));
        let closed = Arc::new(AtomicBool::new(false));
        let buffer_size = (crate::mobile_usb::MAX_USB_REMOTE_RECORD_BYTES * 2)
            .max(ACCESSORY_FD_READ_BUFFER_BYTES);
        let (app_stream, worker_stream) = tokio::io::duplex(buffer_size);
        let (_worker_read, worker_write) = tokio::io::split(worker_stream);

        android_usb_log_info(format!(
            "event=fd_stream_create session_id={} fd={} buffer_bytes={}",
            log_session_id(&session_id),
            fd.raw_fd_for_log(),
            buffer_size
        ));
        spawn_accessory_fd_read_worker(
            session_id.clone(),
            fd.clone(),
            closed.clone(),
            worker_write,
        );
        let close_handle = AndroidAccessoryFdCloseHandle {
            session_id: session_id.clone(),
            fd: fd.clone(),
            closed: closed.clone(),
        };

        Ok((
            Self {
                session_id,
                inner: app_stream,
                fd,
                closed,
                pending_write: None,
            },
            close_handle,
        ))
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
                        android_usb_log_info(format!(
                            "event=fd_write_done session_id={} bytes={}",
                            log_session_id(&self.session_id),
                            len
                        ));
                        Poll::Ready(Ok(len))
                    }
                    Ok(Err(error)) => {
                        self.closed.store(true, Ordering::SeqCst);
                        android_usb_log_warn(format!(
                            "event=fd_write_error session_id={} kind={:?} error={}",
                            log_session_id(&self.session_id),
                            error.kind(),
                            error
                        ));
                        Poll::Ready(Err(error))
                    }
                    Err(error) => {
                        self.closed.store(true, Ordering::SeqCst);
                        android_usb_log_warn(format!(
                            "event=fd_write_join_error session_id={} error={}",
                            log_session_id(&self.session_id),
                            error
                        ));
                        Poll::Ready(Err(io::Error::other(format!(
                            "Android accessory fd write worker failed: {error}"
                        ))))
                    }
                }
            }
        }
    }
}
#[cfg(unix)]
fn spawn_accessory_fd_read_worker(
    session_id: SessionId,
    fd: Arc<AccessoryFd>,
    closed: Arc<AtomicBool>,
    mut writer: tokio::io::WriteHalf<tokio::io::DuplexStream>,
) {
    tokio::spawn(async move {
        android_usb_log_info(format!(
            "event=fd_read_worker_start session_id={} fd={}",
            log_session_id(&session_id),
            fd.raw_fd_for_log()
        ));
        let mut has_read_any_bytes = false;
        loop {
            if closed.load(Ordering::SeqCst) {
                android_usb_log_info(format!(
                    "event=fd_read_worker_closed session_id={} reason=closed_flag",
                    log_session_id(&session_id)
                ));
                let _ = writer.shutdown().await;
                break;
            }

            let fd = fd.clone();
            let read_closed = closed.clone();
            let read_session_id = session_id.clone();
            let transient_eio_retries = accessory_fd_transient_eio_max_retries(has_read_any_bytes);
            android_usb_log_info(format!(
                "event=fd_read_posted session_id={} fd={} max_bytes={} transient_eio_retries={}",
                log_session_id(&read_session_id),
                fd.raw_fd_for_log(),
                ACCESSORY_FD_READ_BUFFER_BYTES,
                transient_eio_retries
            ));
            let result = tokio::task::spawn_blocking(move || {
                let mut buf = vec![0_u8; ACCESSORY_FD_READ_BUFFER_BYTES];
                let raw_fd = fd.raw_fd()?;
                let len = blocking_read_accessory_fd(
                    raw_fd,
                    &mut buf,
                    read_closed.as_ref(),
                    transient_eio_retries,
                )?;
                buf.truncate(len);
                Ok::<_, io::Error>(buf)
            })
            .await;

            match result {
                Ok(Ok(bytes)) if bytes.is_empty() => {
                    closed.store(true, Ordering::SeqCst);
                    android_usb_log_info(format!(
                        "event=fd_read_eof session_id={}",
                        log_session_id(&session_id)
                    ));
                    let _ = writer.shutdown().await;
                    break;
                }
                Ok(Ok(bytes)) => {
                    has_read_any_bytes = true;
                    android_usb_log_info(format!(
                        "event=fd_read_done session_id={} bytes={}",
                        log_session_id(&session_id),
                        bytes.len()
                    ));
                    if writer.write_all(&bytes).await.is_err() {
                        closed.store(true, Ordering::SeqCst);
                        android_usb_log_warn(format!(
                            "event=fd_read_pipe_write_error session_id={} bytes={}",
                            log_session_id(&session_id),
                            bytes.len()
                        ));
                        break;
                    }
                    android_usb_log_info(format!(
                        "event=fd_read_pipe_write_done session_id={} bytes={}",
                        log_session_id(&session_id),
                        bytes.len()
                    ));
                    tokio::task::yield_now().await;
                }
                Ok(Err(error)) => {
                    closed.store(true, Ordering::SeqCst);
                    android_usb_log_warn(format!(
                        "event=fd_read_error session_id={} kind={:?} error={}",
                        log_session_id(&session_id),
                        error.kind(),
                        error
                    ));
                    let _ = writer.shutdown().await;
                    break;
                }
                Err(error) => {
                    closed.store(true, Ordering::SeqCst);
                    android_usb_log_warn(format!(
                        "event=fd_read_join_error session_id={} error={}",
                        log_session_id(&session_id),
                        error
                    ));
                    let _ = writer.shutdown().await;
                    break;
                }
            }
        }
        android_usb_log_info(format!(
            "event=fd_read_worker_end session_id={}",
            log_session_id(&session_id)
        ));
    });
}
#[cfg(unix)]
impl AsyncRead for AndroidAccessoryFdStream {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        Pin::new(&mut self.inner).poll_read(cx, buf)
    }
}

#[cfg(unix)]
impl AsyncWrite for AndroidAccessoryFdStream {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        data: &[u8],
    ) -> Poll<io::Result<usize>> {
        if self.closed.load(Ordering::SeqCst) {
            return Poll::Ready(Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "Android accessory fd is closed",
            )));
        }
        if self.pending_write.is_some() {
            return self.poll_pending_write(cx);
        }
        if data.is_empty() {
            return Poll::Ready(Ok(0));
        }

        let fd = self.fd.clone();
        let closed = self.closed.clone();
        let bytes = data.to_vec();
        android_usb_log_info(format!(
            "event=fd_write_posted session_id={} fd={} bytes={}",
            log_session_id(&self.session_id),
            fd.raw_fd_for_log(),
            bytes.len()
        ));
        self.pending_write = Some(tokio::task::spawn_blocking(move || {
            let len = bytes.len();
            let raw_fd = fd.raw_fd()?;
            match blocking_write_all_accessory_fd(raw_fd, &bytes, closed.as_ref()) {
                Ok(()) => Ok(len),
                Err(error) => {
                    closed.store(true, Ordering::SeqCst);
                    Err(error)
                }
            }
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
        match self.poll_pending_write(cx) {
            Poll::Pending => return Poll::Pending,
            Poll::Ready(Ok(_)) => {}
            Poll::Ready(Err(error)) => return Poll::Ready(Err(error)),
        }
        self.closed.store(true, Ordering::SeqCst);
        let closed_fd = self.fd.close();
        android_usb_log_info(format!(
            "event=fd_shutdown session_id={} fd={} closed={}",
            log_session_id(&self.session_id),
            closed_fd.unwrap_or(-1),
            closed_fd.is_some()
        ));
        Poll::Ready(Ok(()))
    }
}

#[cfg(unix)]
impl Drop for AndroidAccessoryFdStream {
    fn drop(&mut self) {
        self.closed.store(true, Ordering::SeqCst);
        let closed_fd = self.fd.close();
        android_usb_log_info(format!(
            "event=fd_stream_drop session_id={} fd={} closed={}",
            log_session_id(&self.session_id),
            closed_fd.unwrap_or(-1),
            closed_fd.is_some()
        ));
    }
}
