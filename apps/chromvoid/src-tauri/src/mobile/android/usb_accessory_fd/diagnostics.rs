use std::io;

use super::ACCESSORY_FD_TRANSIENT_EIO_DIAGNOSTIC_INTERVAL;
use crate::mobile::android::usb_accessory_runtime::android_usb_log_warn;

#[cfg(unix)]
pub(crate) fn should_log_transient_eio_retry(retry_count: usize) -> bool {
    retry_count == 1 || retry_count % ACCESSORY_FD_TRANSIENT_EIO_DIAGNOSTIC_INTERVAL == 0
}

#[cfg(unix)]
pub(super) fn log_accessory_fd_transient_eio_diagnostic(event: &'static str, retry_count: usize) {
    tracing::warn!(event, retry_count, "android accessory fd transient EIO");
    android_usb_log_warn(format!("event={event} retry_count={retry_count}"));
}

#[cfg(unix)]
pub(super) fn is_transient_accessory_read_error(error: &io::Error) -> bool {
    error.raw_os_error() == Some(libc::EIO)
}
