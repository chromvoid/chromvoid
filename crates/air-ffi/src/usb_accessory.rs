//! The Android accessory's file descriptor as the byte stream a USB session's records travel on.
//!
//! The accessory gadget has a single receive request, and takes the desktop's data only while a
//! read is posted on it: a phone that stops reading makes the desktop's writes time out. A read
//! cannot be taken back once posted - the gadget ignores a non-blocking descriptor - so a
//! reader left behind by an ended session would hold that request and take the next session's
//! bytes. So the read belongs to the attachment, not to a session: one reader thread keeps one
//! read posted for as long as the accessory stays attached, and each session the desktop opens
//! in turn reads from it. Writes go straight to the descriptor.
//!
//! Closing any descriptor of the accessory makes the gadget refuse reads and writes on all of
//! them until the next open. So the descriptor the platform opens for a later session stays
//! open for that session and closes with it - before the session's end reaches the platform,
//! which opens the next one. In between, the reader waits the refusal out.
use std::io;
use std::os::fd::{FromRawFd, IntoRawFd, OwnedFd, RawFd};
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::task::{Context, Poll};
use std::time::Duration;

use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

const READ_BUFFER_BYTES: usize = 16 * 1024;
/// Chunks read ahead of a session - the gap between one session and the next.
const READ_AHEAD_CHUNKS: usize = 16;
const RETRY: Duration = Duration::from_millis(5);
/// The gadget answers EIO while the link settles, and ENODEV between one session's descriptor
/// closing and the next one opening. Before the first bytes the desktop may still be starting
/// (20 s of retries); after them, a short run is a hiccup and a long one a link that is gone
/// (2 s).
const SETTLING_RETRIES_BEFORE_DATA: usize = 4_000;
const SETTLING_RETRIES: usize = 400;

/// Owns the descriptor; the first close wins and later reads and writes find it closed.
struct Descriptor(AtomicI32);

impl Descriptor {
    fn raw(&self) -> io::Result<RawFd> {
        match self.0.load(Ordering::SeqCst) {
            fd if fd < 0 => Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "accessory closed",
            )),
            fd => Ok(fd),
        }
    }

    fn close(&self) {
        let fd = self.0.swap(-1, Ordering::SeqCst);
        if fd >= 0 {
            // SAFETY: the swap made this the only holder of `fd`, which this type owned.
            drop(unsafe { OwnedFd::from_raw_fd(fd) });
        }
    }
}

impl Drop for Descriptor {
    fn drop(&mut self) {
        self.close();
    }
}

/// What a session reads: the reader's chunks, and what is left of the one being read.
struct Incoming {
    chunks: mpsc::Receiver<Vec<u8>>,
    chunk: Vec<u8>,
    offset: usize,
}

/// One attachment of the accessory: its descriptor, its reader, and the incoming bytes, lent to
/// one session at a time.
struct Link {
    fd: Descriptor,
    ended: AtomicBool,
    incoming: Mutex<Option<Incoming>>,
}

/// The attachment sessions share; a new descriptor starts a new one only when the last ended.
pub(crate) struct Links(Mutex<Option<Arc<Link>>>);

impl Links {
    pub(crate) const fn new() -> Self {
        Self(Mutex::new(None))
    }
}

static LINKS: Links = Links::new();

pub(crate) struct AccessoryStream {
    link: Arc<Link>,
    /// The descriptor the platform opened for this session while the attachment's reader
    /// lived: open until the session ends, since closing it would refuse the reader and writes.
    _opened: Option<OwnedFd>,
    incoming: Option<Incoming>,
    writing: Option<JoinHandle<io::Result<usize>>>,
    shut: bool,
}

impl AccessoryStream {
    /// A session's stream on the attached accessory. The platform opens the accessory for every
    /// session; while the attachment's reader lives, the session reads from that reader and
    /// keeps the new descriptor only to hold it open.
    pub(crate) fn attach(fd: OwnedFd) -> io::Result<Self> {
        Self::attach_to(&LINKS, fd)
    }

    pub(crate) fn attach_to(links: &Links, fd: OwnedFd) -> io::Result<Self> {
        let mut current = links.0.lock().unwrap_or_else(PoisonError::into_inner);
        let live = current
            .as_ref()
            .filter(|link| !link.ended.load(Ordering::SeqCst))
            .cloned();
        let (link, opened) = match live {
            Some(link) => {
                tracing::info!("usb accessory: the attachment's reader carries the new session");
                (link, Some(fd))
            }
            None => {
                let link = Link::start(fd)?;
                *current = Some(link.clone());
                (link, None)
            }
        };
        drop(current);
        let incoming = link
            .incoming
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .take()
            .ok_or_else(|| io::Error::other("another session reads the accessory"))?;
        Ok(Self {
            link,
            _opened: opened,
            incoming: Some(incoming),
            writing: None,
            shut: false,
        })
    }

    fn poll_writing(&mut self, cx: &mut Context<'_>) -> Poll<io::Result<usize>> {
        let Some(writing) = self.writing.as_mut() else {
            return Poll::Ready(Ok(0));
        };
        let result = std::task::ready!(Pin::new(writing).poll(cx));
        self.writing = None;
        Poll::Ready(result.unwrap_or_else(|_| Err(io::Error::other("accessory writer failed"))))
    }
}

impl Link {
    fn start(fd: OwnedFd) -> io::Result<Arc<Self>> {
        let (sender, chunks) = mpsc::channel(READ_AHEAD_CHUNKS);
        let link = Arc::new(Self {
            fd: Descriptor(AtomicI32::new(fd.into_raw_fd())),
            ended: AtomicBool::new(false),
            incoming: Mutex::new(Some(Incoming {
                chunks,
                chunk: Vec::new(),
                offset: 0,
            })),
        });
        let reader = link.clone();
        std::thread::Builder::new()
            .name("usb-accessory-read".into())
            .spawn(move || reader.keep_reading(sender))?;
        Ok(link)
    }

    /// The posted read: one blocking read at a time, for the life of the attachment. It ends
    /// when the accessory goes - the gadget answers the read then - and the link with it.
    fn keep_reading(&self, chunks: mpsc::Sender<Vec<u8>>) {
        tracing::info!("usb accessory: reading");
        let mut read_any = false;
        loop {
            let budget = if read_any {
                SETTLING_RETRIES
            } else {
                SETTLING_RETRIES_BEFORE_DATA
            };
            let mut buffer = vec![0u8; READ_BUFFER_BYTES];
            let read = read_with_retries(&mut buffer, &self.ended, budget, RETRY, |buffer| {
                // SAFETY: the buffer is valid for its length and the descriptor is open.
                let count =
                    unsafe { libc::read(self.fd.raw()?, buffer.as_mut_ptr().cast(), buffer.len()) };
                if count < 0 {
                    Err(io::Error::last_os_error())
                } else {
                    Ok(count as usize)
                }
            });
            match read {
                Ok(0) => {
                    tracing::info!(read_any, "usb accessory: end of stream");
                    break;
                }
                Ok(count) => {
                    if !read_any {
                        tracing::info!(bytes = count, "usb accessory: first bytes");
                    }
                    read_any = true;
                    buffer.truncate(count);
                    if chunks.blocking_send(buffer).is_err() {
                        break;
                    }
                }
                Err(error) => {
                    tracing::info!(read_any, kind = ?error.kind(), %error, "usb accessory: the attachment ended");
                    break;
                }
            }
        }
        self.ended.store(true, Ordering::SeqCst);
        self.fd.close();
    }
}

/// One read, retried through what the gadget reports while the link settles: an interruption,
/// nothing to read yet, or EIO and ENODEV within `settling_budget`. Returns 0 once `closed` is
/// set.
pub(crate) fn read_with_retries(
    buffer: &mut [u8],
    closed: &AtomicBool,
    settling_budget: usize,
    retry: Duration,
    mut read: impl FnMut(&mut [u8]) -> io::Result<usize>,
) -> io::Result<usize> {
    let mut settling = 0usize;
    let mut waited = false;
    loop {
        if closed.load(Ordering::SeqCst) {
            return Ok(0);
        }
        match read(buffer) {
            Ok(count) => return Ok(count),
            Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                if !waited {
                    waited = true;
                    tracing::info!("usb accessory: nothing to read yet, waiting");
                }
                std::thread::sleep(retry);
            }
            Err(error) if matches!(error.raw_os_error(), Some(libc::EIO | libc::ENODEV)) => {
                settling += 1;
                if settling == 1 {
                    tracing::info!(%error, "usb accessory: the link settles, retrying");
                }
                if settling >= settling_budget {
                    return Err(io::Error::new(
                        io::ErrorKind::ConnectionReset,
                        format!("accessory kept failing: {error}"),
                    ));
                }
                std::thread::sleep(retry);
            }
            Err(error) => return Err(error),
        }
    }
}

/// Writes all of `data`, waiting out a full buffer; stops once the stream is closed.
pub(crate) fn write_all(
    mut data: &[u8],
    closed: &AtomicBool,
    retry: Duration,
    mut write: impl FnMut(&[u8]) -> io::Result<usize>,
) -> io::Result<()> {
    while !data.is_empty() {
        if closed.load(Ordering::SeqCst) {
            return Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "accessory closed",
            ));
        }
        match write(data) {
            Ok(0) => {
                return Err(io::Error::new(
                    io::ErrorKind::WriteZero,
                    "accessory took nothing",
                ));
            }
            Ok(count) => data = &data[count..],
            Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => std::thread::sleep(retry),
            Err(error) => return Err(error),
        }
    }
    Ok(())
}

impl AsyncRead for AccessoryStream {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        let Some(incoming) = self.incoming.as_mut() else {
            return Poll::Ready(Ok(()));
        };
        if incoming.offset == incoming.chunk.len() {
            match incoming.chunks.poll_recv(cx) {
                Poll::Pending => return Poll::Pending,
                // The attachment ended: end of stream.
                Poll::Ready(None) => return Poll::Ready(Ok(())),
                Poll::Ready(Some(chunk)) => {
                    incoming.chunk = chunk;
                    incoming.offset = 0;
                }
            }
        }
        let count = buf.remaining().min(incoming.chunk.len() - incoming.offset);
        buf.put_slice(&incoming.chunk[incoming.offset..incoming.offset + count]);
        incoming.offset += count;
        Poll::Ready(Ok(()))
    }
}

impl AsyncWrite for AccessoryStream {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        data: &[u8],
    ) -> Poll<io::Result<usize>> {
        if self.writing.is_some() {
            return self.poll_writing(cx);
        }
        if self.shut || self.link.ended.load(Ordering::SeqCst) {
            return Poll::Ready(Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "accessory closed",
            )));
        }
        if data.is_empty() {
            return Poll::Ready(Ok(0));
        }
        let (link, bytes) = (self.link.clone(), data.to_vec());
        self.writing = Some(tokio::task::spawn_blocking(move || {
            write_all(&bytes, &link.ended, RETRY, |data| {
                // SAFETY: the data is valid for its length and the descriptor is open.
                let count =
                    unsafe { libc::write(link.fd.raw()?, data.as_ptr().cast(), data.len()) };
                if count < 0 {
                    Err(io::Error::last_os_error())
                } else {
                    Ok(count as usize)
                }
            })
            .map(|()| bytes.len())
        }));
        self.poll_writing(cx)
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        self.poll_writing(cx).map_ok(|_| ())
    }

    /// Ends this session's use of the stream; the attachment and its reader stay.
    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        std::task::ready!(self.poll_writing(cx))?;
        self.shut = true;
        Poll::Ready(Ok(()))
    }
}

impl Drop for AccessoryStream {
    /// The incoming bytes go back to the attachment for the desktop's next session.
    fn drop(&mut self) {
        if let Some(incoming) = self.incoming.take() {
            *self
                .link
                .incoming
                .lock()
                .unwrap_or_else(PoisonError::into_inner) = Some(incoming);
        }
    }
}

#[cfg(test)]
#[path = "usb_accessory_tests.rs"]
mod tests;
