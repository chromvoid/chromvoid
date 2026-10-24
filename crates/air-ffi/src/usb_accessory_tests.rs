use super::*;
use chromvoid_network_runtime::usb_mobile::record::UsbRecordTransport;
use chromvoid_protocol::RemoteTransport;
use std::os::unix::net::UnixStream;

fn eio() -> io::Error {
    io::Error::from_raw_os_error(libc::EIO)
}

fn enodev() -> io::Error {
    io::Error::from_raw_os_error(libc::ENODEV)
}

/// Whether the far end of a descriptor handed to the phone still sees it open.
fn still_open(other: &UnixStream) -> bool {
    other.set_nonblocking(true).unwrap();
    let mut byte = [0u8; 1];
    matches!(
        std::io::Read::read(&mut &*other, &mut byte),
        Err(error) if error.kind() == io::ErrorKind::WouldBlock
    )
}

fn desktop_end(desktop: UnixStream) -> UsbRecordTransport<tokio::net::UnixStream> {
    desktop.set_nonblocking(true).unwrap();
    UsbRecordTransport::new(tokio::net::UnixStream::from_std(desktop).unwrap())
}

#[tokio::test(flavor = "multi_thread")]
async fn records_cross_the_descriptor_both_ways() {
    let links = Links::new();
    let (phone, desktop) = UnixStream::pair().unwrap();
    let mut phone =
        UsbRecordTransport::new(AccessoryStream::attach_to(&links, OwnedFd::from(phone)).unwrap());
    let mut desktop = desktop_end(desktop);

    let large: Vec<u8> = (0..60_000).map(|n| (n % 251) as u8).collect();
    desktop.send(&large).await.unwrap();
    desktop.send(b"second").await.unwrap();
    assert_eq!(phone.recv().await.unwrap(), large);
    assert_eq!(phone.recv().await.unwrap(), b"second");

    // The desktop keeps a read posted too, as its AOA worker does.
    let (sent, received) = tokio::join!(
        async {
            phone.send(&large).await.unwrap();
            phone.send(b"reply").await.unwrap();
        },
        async { (desktop.recv().await.unwrap(), desktop.recv().await.unwrap()) },
    );
    let () = sent;
    assert_eq!(received, (large, b"reply".to_vec()));
}

/// The ended session's reader would have taken the next session's first record; with one
/// reader for the attachment, the next session gets it. The platform's new descriptor for the
/// same accessory stays open while that session lives: closing it would make the gadget refuse
/// the reader and the writes.
#[tokio::test(flavor = "multi_thread")]
async fn the_next_session_reads_what_the_desktop_sends_after_the_last_one_ended() {
    let links = Links::new();
    let (phone, desktop) = UnixStream::pair().unwrap();
    let mut desktop = desktop_end(desktop);
    let mut first =
        UsbRecordTransport::new(AccessoryStream::attach_to(&links, OwnedFd::from(phone)).unwrap());
    desktop.send(b"pairing").await.unwrap();
    assert_eq!(first.recv().await.unwrap(), b"pairing");
    first.close().await.unwrap();
    drop(first);

    // The desktop reconnects before the phone opens its next session.
    desktop.send(b"reconnect").await.unwrap();
    let (opened, other) = UnixStream::pair().unwrap();
    let mut next =
        UsbRecordTransport::new(AccessoryStream::attach_to(&links, OwnedFd::from(opened)).unwrap());
    let received = tokio::time::timeout(Duration::from_secs(5), next.recv())
        .await
        .expect("read");
    assert_eq!(received.unwrap(), b"reconnect");
    let (sent, echoed) = tokio::join!(next.send(b"answer"), desktop.recv());
    sent.unwrap();
    assert_eq!(echoed.unwrap(), b"answer");
    next.close().await.unwrap();
    assert!(still_open(&other), "the session holds its descriptor");
    drop(next);
    assert!(!still_open(&other), "and closes it when it ends");
}

#[tokio::test(flavor = "multi_thread")]
async fn one_session_reads_the_attachment_at_a_time() {
    let links = Links::new();
    let (phone, _desktop) = UnixStream::pair().unwrap();
    let _first = AccessoryStream::attach_to(&links, OwnedFd::from(phone)).unwrap();
    let (spare, _other) = UnixStream::pair().unwrap();
    assert!(AccessoryStream::attach_to(&links, OwnedFd::from(spare)).is_err());
}

#[tokio::test(flavor = "multi_thread")]
async fn the_far_end_closing_ends_the_attachment_and_a_new_descriptor_starts_the_next() {
    let links = Links::new();
    let (phone, desktop) = UnixStream::pair().unwrap();
    let mut phone =
        UsbRecordTransport::new(AccessoryStream::attach_to(&links, OwnedFd::from(phone)).unwrap());
    drop(desktop);
    let closed = tokio::time::timeout(Duration::from_secs(5), phone.recv())
        .await
        .expect("the phone hears the close");
    assert!(closed.is_err());
    drop(phone);

    // Unplugged and plugged in again: the new descriptor is the new attachment.
    let (phone, desktop) = UnixStream::pair().unwrap();
    let mut phone =
        UsbRecordTransport::new(AccessoryStream::attach_to(&links, OwnedFd::from(phone)).unwrap());
    let mut desktop = desktop_end(desktop);
    desktop.send(b"again").await.unwrap();
    let received = tokio::time::timeout(Duration::from_secs(5), phone.recv())
        .await
        .expect("read");
    assert_eq!(received.unwrap(), b"again");
}

#[test]
fn a_read_waits_out_interruptions_nothing_yet_and_a_short_run_of_eio_or_enodev() {
    let closed = AtomicBool::new(false);
    let mut replies = vec![
        Err(io::Error::from(io::ErrorKind::Interrupted)),
        Err(io::Error::from(io::ErrorKind::WouldBlock)),
        Err(eio()),
        Err(enodev()),
        Ok(3),
    ]
    .into_iter();
    let mut buffer = [0u8; 8];
    let count = read_with_retries(&mut buffer, &closed, 3, Duration::ZERO, |_| {
        replies.next().unwrap()
    })
    .unwrap();
    assert_eq!(count, 3);
}

#[test]
fn a_long_run_of_eio_or_enodev_is_a_lost_link() {
    let closed = AtomicBool::new(false);
    let mut reads = 0;
    let error = read_with_retries(&mut [0u8; 8], &closed, 3, Duration::ZERO, |_| {
        reads += 1;
        Err(if reads % 2 == 0 { eio() } else { enodev() })
    })
    .unwrap_err();
    assert_eq!((error.kind(), reads), (io::ErrorKind::ConnectionReset, 3));
}

#[test]
fn a_closed_stream_stops_reading_and_other_errors_end_it() {
    let closed = AtomicBool::new(true);
    assert_eq!(
        read_with_retries(
            &mut [0u8; 8],
            &closed,
            3,
            Duration::ZERO,
            |_| unreachable!()
        )
        .unwrap(),
        0
    );
    let open = AtomicBool::new(false);
    let error = read_with_retries(&mut [0u8; 8], &open, 3, Duration::ZERO, |_| {
        Err(io::Error::from(io::ErrorKind::PermissionDenied))
    })
    .unwrap_err();
    assert_eq!(error.kind(), io::ErrorKind::PermissionDenied);
}

#[test]
fn a_write_finishes_through_a_full_buffer_and_refuses_a_closed_stream() {
    let open = AtomicBool::new(false);
    let mut written = Vec::new();
    let mut replies = vec![
        Err(io::Error::from(io::ErrorKind::WouldBlock)),
        Ok(2),
        Err(io::Error::from(io::ErrorKind::Interrupted)),
        Ok(3),
    ]
    .into_iter();
    write_all(b"hello", &open, Duration::ZERO, |data| {
        let reply = replies.next().unwrap();
        if let Ok(count) = reply {
            written.extend_from_slice(&data[..count]);
        }
        reply
    })
    .unwrap();
    assert_eq!(written, b"hello");

    let error = write_all(b"x", &open, Duration::ZERO, |_| Ok(0)).unwrap_err();
    assert_eq!(error.kind(), io::ErrorKind::WriteZero);
    let closed = AtomicBool::new(true);
    let error = write_all(b"x", &closed, Duration::ZERO, |_| unreachable!()).unwrap_err();
    assert_eq!(error.kind(), io::ErrorKind::BrokenPipe);
}
