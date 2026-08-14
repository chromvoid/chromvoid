use super::support::*;
use super::*;

#[cfg(unix)]
#[tokio::test]
async fn fd_stream_carries_one_record_per_remote_transport_message() {
    use std::os::fd::IntoRawFd;
    use std::os::unix::net::UnixStream;

    let (left, right) = UnixStream::pair().expect("unix stream pair");
    right
        .set_nonblocking(true)
        .expect("right unix stream nonblocking");
    let right = tokio::net::UnixStream::from_std(right).expect("tokio unix stream");
    let stream =
        unsafe { AndroidAccessoryFdStream::from_raw_fd(left.into_raw_fd()) }.expect("fd stream");
    let mut transport = MobileUsbRemoteTransport::new(stream, MobileUsbBridgeKind::AndroidAoa);
    let (mut right_read, mut right_write) = right.into_split();

    right_write
        .write_all(&3_u32.to_be_bytes())
        .await
        .expect("write record len");
    right_write
        .write_all(b"abc")
        .await
        .expect("write record payload");

    assert_eq!(transport.recv().await.expect("recv record"), b"abc");

    transport.send(b"ok").await.expect("send record");
    let mut len = [0_u8; 4];
    right_read
        .read_exact(&mut len)
        .await
        .expect("read response len");
    assert_eq!(u32::from_be_bytes(len), 2);
    let mut payload = [0_u8; 2];
    right_read
        .read_exact(&mut payload)
        .await
        .expect("read response payload");
    assert_eq!(&payload, b"ok");
}

#[cfg(unix)]
#[tokio::test]
async fn fd_session_without_starter_is_queued_and_closed_by_stop() {
    use std::os::fd::IntoRawFd;
    use std::os::unix::net::UnixStream;

    let runtime = runtime_for_tests();
    let (left, _right) = UnixStream::pair().expect("unix stream pair");
    let fd = left.into_raw_fd();

    runtime
        .start_fd_session("session-no-starter", fd, IDENTITY_JSON)
        .expect("missing starter should queue pending fd");

    assert_eq!(runtime.active_session_count(), 1);
    assert!(fd_is_open(fd));
    assert!(runtime.stop_session(
        "session-no-starter",
        AndroidMobileUsbHostStopReason::ExplicitDisconnect,
    ));
    assert!(!fd_is_open(fd));
}

#[cfg(unix)]
#[tokio::test]
async fn fd_session_queued_before_starter_runs_after_starter_setup() {
    use std::os::fd::IntoRawFd;
    use std::os::unix::net::UnixStream;

    let runtime = runtime_for_tests();
    let (left, right) = UnixStream::pair().expect("unix stream pair");
    right
        .set_nonblocking(true)
        .expect("right unix stream nonblocking");
    let mut right = tokio::net::UnixStream::from_std(right).expect("tokio unix stream");
    let fd = left.into_raw_fd();
    let (payload_tx, payload_rx) = oneshot::channel();
    let payload_tx = Arc::new(Mutex::new(Some(payload_tx)));

    runtime
        .start_fd_session("session-pending", fd, IDENTITY_JSON)
        .expect("queue pending fd");

    runtime.set_host_starter(host_starter(move |start| {
        let payload_tx = payload_tx
            .lock()
            .expect("payload sender lock")
            .take()
            .expect("payload sender");
        async move {
            assert_eq!(start.session_id, "session-pending");
            assert_eq!(start.identity.serial.as_deref(), Some("device-1"));
            let mut transport = start.transport;
            let payload = transport.recv().await.map_err(|error| error.to_string())?;
            payload_tx
                .send(payload)
                .map_err(|_| "payload send failed")?;
            Ok(())
        }
    }));

    right
        .write_all(&5_u32.to_be_bytes())
        .await
        .expect("write record len");
    right
        .write_all(b"hello")
        .await
        .expect("write record payload");

    assert_eq!(
        payload_rx.await.expect("payload delivered"),
        b"hello".to_vec()
    );
}

#[cfg(unix)]
#[tokio::test]
async fn fd_session_transport_close_removes_reserved_session() {
    use std::os::fd::IntoRawFd;
    use std::os::unix::net::UnixStream;

    let runtime = runtime_for_tests();
    let (left, right) = UnixStream::pair().expect("unix stream pair");
    let fd = left.into_raw_fd();
    let (closed_tx, closed_rx) = oneshot::channel();
    let closed_tx = Arc::new(Mutex::new(Some(closed_tx)));

    runtime.set_host_starter(host_starter(move |start| {
        let closed_tx = closed_tx
            .lock()
            .expect("closed sender lock")
            .take()
            .expect("closed sender");
        async move {
            let mut transport = start.transport;
            let error = transport
                .recv()
                .await
                .expect_err("fd peer close should close transport");
            closed_tx
                .send(error.to_string())
                .map_err(|_| "closed result send failed")?;
            Err(error.to_string())
        }
    }));

    runtime
        .start_fd_session("session-fd-closed", fd, IDENTITY_JSON)
        .expect("start fd session");
    drop(right);

    let error = tokio::time::timeout(std::time::Duration::from_secs(2), closed_rx)
        .await
        .expect("closed signal timeout")
        .expect("closed signal");

    assert!(error.contains("transport closed") || error.contains("closed"));
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        while runtime.active_session_count() != 0 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("runtime should remove closed fd session");
}

#[cfg(unix)]
#[tokio::test]
async fn vault_lock_keeps_fd_open_until_host_flushes_terminal_notification() {
    use std::os::fd::IntoRawFd;
    use std::os::unix::net::UnixStream;

    let runtime = runtime_for_tests();
    let (left, right) = UnixStream::pair().expect("unix stream pair");
    right
        .set_nonblocking(true)
        .expect("right unix stream nonblocking");
    let right = tokio::net::UnixStream::from_std(right).expect("tokio unix stream");
    let fd = left.into_raw_fd();
    let (ready_tx, ready_rx) = oneshot::channel();
    let ready_tx = Arc::new(Mutex::new(Some(ready_tx)));
    let (flush_tx, flush_rx) = oneshot::channel();
    let flush_tx = Arc::new(Mutex::new(Some(flush_tx)));

    runtime.set_host_starter(host_starter(move |mut start| {
        let ready_tx = ready_tx
            .lock()
            .expect("ready sender lock")
            .take()
            .expect("ready sender");
        let flush_tx = flush_tx
            .lock()
            .expect("flush sender lock")
            .take()
            .expect("flush sender");
        async move {
            ready_tx.send(()).map_err(|_| "ready send failed")?;
            let reason = start
                .shutdown
                .await
                .map_err(|_| "shutdown receive failed")?;
            if reason != AndroidMobileUsbHostStopReason::VaultLocked {
                return Err(format!("unexpected shutdown reason: {reason:?}"));
            }
            start
                .transport
                .send(b"host-locked")
                .await
                .map_err(|error| error.to_string())?;
            flush_tx.send(()).map_err(|_| "flush send failed")?;
            Ok(())
        }
    }));

    runtime
        .start_fd_session("session-vault-lock", fd, IDENTITY_JSON)
        .expect("start fd session");
    ready_rx.await.expect("host starter ready");

    assert!(runtime.stop_session(
        "session-vault-lock",
        AndroidMobileUsbHostStopReason::VaultLocked,
    ));

    let mut peer_transport = MobileUsbRemoteTransport::new(right, MobileUsbBridgeKind::AndroidAoa);
    assert_eq!(
        tokio::time::timeout(std::time::Duration::from_secs(1), peer_transport.recv())
            .await
            .expect("terminal notification timeout")
            .expect("terminal notification"),
        b"host-locked",
    );
    flush_rx.await.expect("terminal notification flushed");
}

#[cfg(unix)]
#[tokio::test]
async fn fd_session_spawner_failure_returns_fd_to_caller_ownership() {
    use std::os::fd::IntoRawFd;
    use std::os::unix::net::UnixStream;

    let runtime = runtime_for_tests();
    runtime.set_host_starter(host_starter(|_start| async { Ok(()) }));
    runtime.set_task_spawner_for_tests(rejecting_task_spawner());
    let (left, _right) = UnixStream::pair().expect("unix stream pair");
    let fd = left.into_raw_fd();

    let error = runtime
        .start_fd_session("session-spawn-fail", fd, IDENTITY_JSON)
        .expect_err("spawner failure rejected");

    assert!(error.contains("test spawner unavailable"));
    assert_eq!(runtime.active_session_count(), 0);
    assert!(fd_is_open(fd));
    unsafe {
        libc::close(fd);
    }
}

#[cfg(unix)]
#[tokio::test]
async fn pending_fd_session_spawner_failure_closes_native_owned_fd() {
    use std::os::fd::IntoRawFd;
    use std::os::unix::net::UnixStream;
    use tokio::io::AsyncReadExt as _;

    let runtime = runtime_for_tests();
    runtime.set_task_spawner_for_tests(rejecting_task_spawner());
    let (left, right) = UnixStream::pair().expect("unix stream pair");
    right
        .set_nonblocking(true)
        .expect("right unix stream nonblocking");
    let mut right = tokio::net::UnixStream::from_std(right).expect("tokio unix stream");
    let fd = left.into_raw_fd();

    runtime
        .start_fd_session("session-pending-spawn-fail", fd, IDENTITY_JSON)
        .expect("queue pending fd");
    runtime.set_host_starter(host_starter(|_start| async { Ok(()) }));

    assert_eq!(runtime.active_session_count(), 0);
    let mut byte = [0_u8; 1];
    assert_eq!(
        tokio::time::timeout(std::time::Duration::from_secs(1), right.read(&mut byte))
            .await
            .expect("peer close timeout")
            .expect("peer close read"),
        0,
    );
}
