use std::io;
use std::os::fd::RawFd;
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::Arc;

use crate::mobile::android::usb_accessory_runtime::{android_usb_log_info, log_session_id};
use crate::mobile_usb::SessionId;

/// Owns the accessory raw fd and closes it once every reader/writer holder is
/// dropped, so an in-flight blocking read or write never races a `close()`.
#[cfg(unix)]
pub(super) struct AccessoryFd {
    fd: AtomicI32,
}

#[cfg(unix)]
impl AccessoryFd {
    pub(super) fn new(fd: RawFd) -> Self {
        Self {
            fd: AtomicI32::new(fd),
        }
    }

    pub(super) fn raw_fd(&self) -> io::Result<RawFd> {
        let fd = self.fd.load(Ordering::SeqCst);
        if fd < 0 {
            Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "Android accessory fd is closed",
            ))
        } else {
            Ok(fd)
        }
    }

    pub(super) fn raw_fd_for_log(&self) -> RawFd {
        self.fd.load(Ordering::SeqCst)
    }

    pub(super) fn close(&self) -> Option<RawFd> {
        let fd = self.fd.swap(-1, Ordering::SeqCst);
        if fd < 0 {
            return None;
        }
        unsafe {
            libc::close(fd);
        }
        Some(fd)
    }
}

#[cfg(unix)]
impl Drop for AccessoryFd {
    fn drop(&mut self) {
        let _ = self.close();
    }
}

#[cfg(unix)]
#[derive(Clone)]
pub(crate) struct AndroidAccessoryFdCloseHandle {
    pub(super) session_id: SessionId,
    pub(super) fd: Arc<AccessoryFd>,
    pub(super) closed: Arc<AtomicBool>,
}

#[cfg(unix)]
impl AndroidAccessoryFdCloseHandle {
    pub(crate) fn close(&self, reason: &str) {
        self.closed.store(true, Ordering::SeqCst);
        let closed_fd = self.fd.close();
        android_usb_log_info(format!(
            "event=fd_close session_id={} reason={} fd={} closed={}",
            log_session_id(&self.session_id),
            reason,
            closed_fd.unwrap_or(-1),
            closed_fd.is_some()
        ));
    }
}

#[cfg(unix)]
pub(crate) struct AndroidAccessoryDetachedFd {
    fd: Option<RawFd>,
}

#[cfg(unix)]
impl AndroidAccessoryDetachedFd {
    pub(crate) fn new(fd: RawFd) -> Self {
        Self { fd: Some(fd) }
    }

    pub(crate) fn into_raw_fd(mut self) -> RawFd {
        self.fd
            .take()
            .expect("Android accessory fd already consumed")
    }
}

#[cfg(unix)]
impl Drop for AndroidAccessoryDetachedFd {
    fn drop(&mut self) {
        if let Some(fd) = self.fd.take() {
            unsafe {
                libc::close(fd);
            }
        }
    }
}
