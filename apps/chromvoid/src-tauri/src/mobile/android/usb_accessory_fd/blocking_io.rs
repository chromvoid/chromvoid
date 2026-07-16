use std::io;
use std::os::fd::RawFd;
use std::sync::atomic::{AtomicBool, Ordering};

use super::diagnostics::{
    is_transient_accessory_read_error, log_accessory_fd_transient_eio_diagnostic,
    should_log_transient_eio_retry,
};
#[cfg(test)]
use super::ACCESSORY_FD_TRANSIENT_EIO_MAX_RETRIES;
use super::ACCESSORY_FD_TRANSIENT_READ_RETRY;
use crate::mobile::android::usb_accessory_runtime::android_usb_log_info;

#[cfg(unix)]
pub(super) fn blocking_read_accessory_fd(
    fd: RawFd,
    buf: &mut [u8],
    closed: &AtomicBool,
    max_transient_eio_retries: usize,
) -> io::Result<usize> {
    blocking_read_accessory_fd_with_eio_budget(
        buf,
        closed,
        max_transient_eio_retries,
        |buf| {
            let read = unsafe { libc::read(fd, buf.as_mut_ptr() as *mut libc::c_void, buf.len()) };
            if read < 0 {
                Err(io::Error::last_os_error())
            } else {
                Ok(read as usize)
            }
        },
        || std::thread::sleep(ACCESSORY_FD_TRANSIENT_READ_RETRY),
    )
}

#[cfg(all(unix, test))]
pub(crate) fn blocking_read_accessory_fd_with<R, S>(
    buf: &mut [u8],
    closed: &AtomicBool,
    read_once: R,
    sleep_before_retry: S,
) -> io::Result<usize>
where
    R: FnMut(&mut [u8]) -> io::Result<usize>,
    S: FnMut(),
{
    blocking_read_accessory_fd_with_eio_budget(
        buf,
        closed,
        ACCESSORY_FD_TRANSIENT_EIO_MAX_RETRIES,
        read_once,
        sleep_before_retry,
    )
}

#[cfg(unix)]
pub(crate) fn blocking_read_accessory_fd_with_eio_budget<R, S>(
    buf: &mut [u8],
    closed: &AtomicBool,
    max_transient_eio_retries: usize,
    mut read_once: R,
    mut sleep_before_retry: S,
) -> io::Result<usize>
where
    R: FnMut(&mut [u8]) -> io::Result<usize>,
    S: FnMut(),
{
    let mut transient_eio_retries = 0usize;
    loop {
        if closed.load(Ordering::SeqCst) {
            if transient_eio_retries > 0 {
                log_accessory_fd_transient_eio_diagnostic(
                    "fd_read_transient_eio_closed",
                    transient_eio_retries,
                );
            }
            return Ok(0);
        }
        match read_once(buf) {
            Ok(read) => {
                if transient_eio_retries > 0 {
                    android_usb_log_info(format!(
                        "event=fd_read_transient_eio_recovered retry_count={} bytes={}",
                        transient_eio_retries, read
                    ));
                }
                return Ok(read);
            }
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                sleep_before_retry();
            }
            Err(error) if is_transient_accessory_read_error(&error) => {
                transient_eio_retries = transient_eio_retries.saturating_add(1);
                if transient_eio_retries >= max_transient_eio_retries {
                    log_accessory_fd_transient_eio_diagnostic(
                        "fd_read_transient_eio_exhausted",
                        transient_eio_retries,
                    );
                    return Err(accessory_fd_transient_eio_exhausted_error());
                }
                if should_log_transient_eio_retry(transient_eio_retries) {
                    log_accessory_fd_transient_eio_diagnostic(
                        "fd_read_transient_eio_retry",
                        transient_eio_retries,
                    );
                }
                sleep_before_retry();
            }
            Err(error) => return Err(error),
        }
    }
}

#[cfg(unix)]
fn accessory_fd_transient_eio_exhausted_error() -> io::Error {
    io::Error::new(
        io::ErrorKind::ConnectionReset,
        "Android accessory fd transient EIO retry budget exhausted",
    )
}

#[cfg(unix)]
pub(super) fn set_fd_nonblocking(fd: RawFd) -> io::Result<()> {
    let flags = unsafe { libc::fcntl(fd, libc::F_GETFL) };
    if flags < 0 {
        return Err(io::Error::last_os_error());
    }
    let result = unsafe { libc::fcntl(fd, libc::F_SETFL, flags | libc::O_NONBLOCK) };
    if result < 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(unix)]
pub(super) fn blocking_write_all_accessory_fd(
    fd: RawFd,
    data: &[u8],
    closed: &AtomicBool,
) -> io::Result<()> {
    blocking_write_all_accessory_fd_with(
        data,
        closed,
        |data| {
            let written =
                unsafe { libc::write(fd, data.as_ptr() as *const libc::c_void, data.len()) };
            if written < 0 {
                Err(io::Error::last_os_error())
            } else {
                Ok(written as usize)
            }
        },
        || std::thread::sleep(ACCESSORY_FD_TRANSIENT_READ_RETRY),
    )
}

#[cfg(unix)]
pub(crate) fn blocking_write_all_accessory_fd_with<W, S>(
    mut data: &[u8],
    closed: &AtomicBool,
    mut write_once: W,
    mut sleep_before_retry: S,
) -> io::Result<()>
where
    W: FnMut(&[u8]) -> io::Result<usize>,
    S: FnMut(),
{
    while !data.is_empty() {
        if closed.load(Ordering::SeqCst) {
            return Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "Android accessory fd is closed",
            ));
        }
        match write_once(data) {
            Ok(0) => {
                return Err(io::Error::new(
                    io::ErrorKind::WriteZero,
                    "Android accessory fd wrote zero bytes",
                ));
            }
            Ok(written) => {
                data = &data[written..];
            }
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                sleep_before_retry();
            }
            Err(error) => return Err(error),
        }
    }
    Ok(())
}
