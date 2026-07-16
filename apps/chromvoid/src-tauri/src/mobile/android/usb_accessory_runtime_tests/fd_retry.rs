use super::*;

#[cfg(unix)]
#[test]
fn accessory_fd_read_retries_transient_eio_until_data_arrives() {
    let closed = AtomicBool::new(false);
    let mut attempts = 0usize;
    let mut sleeps = 0usize;
    let mut buf = [0_u8; 8];

    let len = blocking_read_accessory_fd_with(
        &mut buf,
        &closed,
        |buf| {
            attempts += 1;
            if attempts == 1 {
                return Err(io::Error::from_raw_os_error(libc::EIO));
            }
            buf[..2].copy_from_slice(b"ok");
            Ok(2)
        },
        || {
            sleeps += 1;
        },
    )
    .expect("transient EIO should retry");

    assert_eq!(len, 2);
    assert_eq!(&buf[..2], b"ok");
    assert_eq!(attempts, 2);
    assert_eq!(sleeps, 1);
}

#[cfg(unix)]
#[test]
fn accessory_fd_read_recovers_before_transient_eio_budget() {
    let closed = AtomicBool::new(false);
    let mut attempts = 0usize;
    let mut sleeps = 0usize;
    let mut buf = [0_u8; 8];

    let len = blocking_read_accessory_fd_with_eio_budget(
        &mut buf,
        &closed,
        3,
        |buf| {
            attempts += 1;
            if attempts < 3 {
                return Err(io::Error::from_raw_os_error(libc::EIO));
            }
            buf[..2].copy_from_slice(b"ok");
            Ok(2)
        },
        || {
            sleeps += 1;
        },
    )
    .expect("transient EIO should recover before budget");

    assert_eq!(len, 2);
    assert_eq!(&buf[..2], b"ok");
    assert_eq!(attempts, 3);
    assert_eq!(sleeps, 2);
}

#[cfg(unix)]
#[test]
fn accessory_fd_read_exhausts_transient_eio_retry_budget() {
    let closed = AtomicBool::new(false);
    let mut attempts = 0usize;
    let mut sleeps = 0usize;
    let mut buf = [0_u8; 8];

    let error = blocking_read_accessory_fd_with_eio_budget(
        &mut buf,
        &closed,
        3,
        |_buf| {
            attempts += 1;
            Err(io::Error::from_raw_os_error(libc::EIO))
        },
        || {
            sleeps += 1;
        },
    )
    .expect_err("persistent transient EIO should exhaust retry budget");

    assert_eq!(error.kind(), io::ErrorKind::ConnectionReset);
    assert_eq!(
        error.to_string(),
        "Android accessory fd transient EIO retry budget exhausted"
    );
    assert_eq!(attempts, 3);
    assert_eq!(sleeps, 2);
}

#[cfg(unix)]
#[test]
fn accessory_fd_read_stops_transient_eio_retry_after_close() {
    let closed = AtomicBool::new(false);
    let mut attempts = 0usize;
    let mut buf = [0_u8; 8];

    let len = blocking_read_accessory_fd_with(
        &mut buf,
        &closed,
        |_buf| {
            attempts += 1;
            Err(io::Error::from_raw_os_error(libc::EIO))
        },
        || {
            closed.store(true, Ordering::SeqCst);
        },
    )
    .expect("closed retry should finish as EOF");

    assert_eq!(len, 0);
    assert_eq!(attempts, 1);
}

#[cfg(unix)]
#[test]
fn accessory_fd_read_stops_would_block_retry_after_close() {
    let closed = AtomicBool::new(false);
    let mut attempts = 0usize;
    let mut buf = [0_u8; 8];

    let len = blocking_read_accessory_fd_with(
        &mut buf,
        &closed,
        |_buf| {
            attempts += 1;
            Err(io::Error::from(io::ErrorKind::WouldBlock))
        },
        || {
            closed.store(true, Ordering::SeqCst);
        },
    )
    .expect("closed nonblocking retry should finish as EOF");

    assert_eq!(len, 0);
    assert_eq!(attempts, 1);
}

#[cfg(unix)]
#[test]
fn accessory_fd_read_retries_transient_eio_between_records() {
    let closed = AtomicBool::new(false);
    let mut attempts = 0usize;
    let mut sleeps = 0usize;
    let mut buf = [0_u8; 8];

    let len = blocking_read_accessory_fd_with(
        &mut buf,
        &closed,
        |buf| {
            attempts += 1;
            if attempts == 1 {
                return Err(io::Error::from_raw_os_error(libc::EIO));
            }
            buf[..3].copy_from_slice(b"rpc");
            Ok(3)
        },
        || {
            sleeps += 1;
        },
    )
    .expect("between-record EIO should retry");

    assert_eq!(len, 3);
    assert_eq!(&buf[..3], b"rpc");
    assert_eq!(attempts, 2);
    assert_eq!(sleeps, 1);
}

#[cfg(unix)]
#[test]
fn accessory_fd_transient_eio_diagnostic_is_rate_limited() {
    assert!(should_log_transient_eio_retry(1));
    assert!(!should_log_transient_eio_retry(2));
    assert!(!should_log_transient_eio_retry(
        ACCESSORY_FD_TRANSIENT_EIO_DIAGNOSTIC_INTERVAL - 1
    ));
    assert!(should_log_transient_eio_retry(
        ACCESSORY_FD_TRANSIENT_EIO_DIAGNOSTIC_INTERVAL
    ));
    assert!(!should_log_transient_eio_retry(
        ACCESSORY_FD_TRANSIENT_EIO_DIAGNOSTIC_INTERVAL + 1
    ));
}

#[cfg(unix)]
#[test]
fn accessory_fd_uses_startup_transient_eio_budget_until_first_bytes() {
    assert_eq!(
        accessory_fd_transient_eio_max_retries(false),
        ACCESSORY_FD_STARTUP_TRANSIENT_EIO_MAX_RETRIES
    );
    assert_eq!(
        accessory_fd_transient_eio_max_retries(true),
        ACCESSORY_FD_TRANSIENT_EIO_MAX_RETRIES
    );
    assert!(
        ACCESSORY_FD_STARTUP_TRANSIENT_EIO_MAX_RETRIES > ACCESSORY_FD_TRANSIENT_EIO_MAX_RETRIES
    );
}

#[cfg(unix)]
#[test]
fn accessory_fd_write_retries_would_block_until_data_is_written() {
    let closed = AtomicBool::new(false);
    let mut attempts = 0usize;
    let mut sleeps = 0usize;
    let mut written = Vec::new();

    blocking_write_all_accessory_fd_with(
        b"abcdef",
        &closed,
        |data| {
            attempts += 1;
            if attempts == 1 {
                return Err(io::Error::from(io::ErrorKind::WouldBlock));
            }
            let n = data.len().min(2);
            written.extend_from_slice(&data[..n]);
            Ok(n)
        },
        || {
            sleeps += 1;
        },
    )
    .expect("nonblocking write should retry");

    assert_eq!(written, b"abcdef");
    assert_eq!(attempts, 4);
    assert_eq!(sleeps, 1);
}

#[cfg(unix)]
#[test]
fn accessory_fd_write_stops_would_block_retry_after_close() {
    let closed = AtomicBool::new(false);
    let mut attempts = 0usize;

    let error = blocking_write_all_accessory_fd_with(
        b"abc",
        &closed,
        |_data| {
            attempts += 1;
            Err(io::Error::from(io::ErrorKind::WouldBlock))
        },
        || {
            closed.store(true, Ordering::SeqCst);
        },
    )
    .expect_err("closed nonblocking write should fail");

    assert_eq!(error.kind(), io::ErrorKind::BrokenPipe);
    assert_eq!(attempts, 1);
}
