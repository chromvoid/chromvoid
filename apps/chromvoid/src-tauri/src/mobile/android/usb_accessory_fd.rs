use std::time::Duration;

const ACCESSORY_FD_READ_BUFFER_BYTES: usize = 16 * 1024;
const ACCESSORY_FD_TRANSIENT_READ_RETRY: Duration = Duration::from_millis(5);
pub(crate) const ACCESSORY_FD_TRANSIENT_EIO_MAX_RETRIES: usize = 400;
pub(crate) const ACCESSORY_FD_STARTUP_TRANSIENT_EIO_MAX_RETRIES: usize = 4_000;
pub(crate) const ACCESSORY_FD_TRANSIENT_EIO_DIAGNOSTIC_INTERVAL: usize = 32;

mod blocking_io;
mod diagnostics;
mod guard;
mod stream;

pub(crate) fn accessory_fd_transient_eio_max_retries(has_read_any_bytes: bool) -> usize {
    if has_read_any_bytes {
        ACCESSORY_FD_TRANSIENT_EIO_MAX_RETRIES
    } else {
        ACCESSORY_FD_STARTUP_TRANSIENT_EIO_MAX_RETRIES
    }
}

#[cfg(test)]
pub(crate) use blocking_io::{
    blocking_read_accessory_fd_with, blocking_read_accessory_fd_with_eio_budget,
    blocking_write_all_accessory_fd_with,
};
#[cfg(test)]
pub(crate) use diagnostics::should_log_transient_eio_retry;
pub(crate) use guard::{AndroidAccessoryDetachedFd, AndroidAccessoryFdCloseHandle};
pub(crate) use stream::AndroidAccessoryFdStream;
