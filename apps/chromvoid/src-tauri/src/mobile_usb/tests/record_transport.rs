use super::*;

#[tokio::test]
async fn mobile_usb_record_transport_writes_one_length_prefixed_record() {
    let (client, mut host) = duplex(64);
    let mut transport = MobileUsbRemoteTransport::new(client, MobileUsbBridgeKind::AndroidAoa);

    transport.send(b"abc").await.expect("send record");

    let mut wire = [0_u8; 7];
    host.read_exact(&mut wire).await.expect("read wire record");
    assert_eq!(&wire[0..4], &(3_u32.to_be_bytes()));
    assert_eq!(&wire[4..7], b"abc");
    assert_eq!(transport.transport_type(), TransportType::UsbMobile);
}

#[tokio::test]
async fn mobile_usb_record_transport_reassembles_partial_reads() {
    let (client, mut host) = duplex(64);
    let mut transport = MobileUsbRemoteTransport::new(client, MobileUsbBridgeKind::AndroidAoa);

    let writer = tokio::spawn(async move {
        host.write_all(&5_u32.to_be_bytes()).await.expect("len");
        host.write_all(b"he").await.expect("part 1");
        tokio::task::yield_now().await;
        host.write_all(b"llo").await.expect("part 2");
    });

    let payload = transport.recv().await.expect("recv full record");
    writer.await.expect("writer");

    assert_eq!(payload, b"hello");
}

#[tokio::test]
async fn mobile_usb_record_transport_rejects_zero_and_oversized_lengths() {
    let (client, mut host) = duplex(64);
    let mut transport = MobileUsbRemoteTransport::new(client, MobileUsbBridgeKind::AndroidAoa);

    host.write_all(&3_u32.to_be_bytes())
        .await
        .expect("valid len");
    host.write_all(b"abc").await.expect("valid payload");
    assert_eq!(
        transport
            .recv()
            .await
            .expect("valid record before invalid length"),
        b"abc"
    );

    host.write_all(&0_u32.to_be_bytes())
        .await
        .expect("zero len");
    let error = transport.recv().await.expect_err("zero len fails");
    let TransportError::RecordLayerInvalidLength(message) = error else {
        panic!("expected invalid record length transport error");
    };
    assert!(message.contains("payload length 0"));
    assert!(message.contains("bridge_kind=android_aoa"));
    assert!(message.contains("max_record_bytes="));
    assert!(message.contains("length_prefix_hex=00000000"));
    assert!(message.contains("last_valid_direction=recv"));
    assert!(message.contains("last_valid_size=3"));
    assert!(matches!(
        transport
            .recv()
            .await
            .expect_err("invalid length closes transport"),
        TransportError::Closed
    ));

    let (client, mut host) = duplex(64);
    let mut transport = MobileUsbRemoteTransport::new(client, MobileUsbBridgeKind::AndroidAoa);
    host.write_all(&((MAX_USB_REMOTE_RECORD_BYTES as u32) + 1).to_be_bytes())
        .await
        .expect("oversized len");
    let error = transport.recv().await.expect_err("oversized len fails");
    let TransportError::RecordLayerInvalidLength(message) = error else {
        panic!("expected oversized record length transport error");
    };
    assert!(message.contains("bridge_kind=android_aoa"));
    assert!(message.contains("last_valid_direction=none"));
}

#[tokio::test]
async fn mobile_usb_record_transport_reproduces_unframed_media_payload_desync_diagnostic() {
    let (client, mut host) = duplex(512);
    let mut transport = MobileUsbRemoteTransport::new(client, MobileUsbBridgeKind::AndroidAoa);
    let valid_payload = vec![0x42; 194];

    host.write_all(&194_u32.to_be_bytes())
        .await
        .expect("valid len");
    host.write_all(&valid_payload).await.expect("valid payload");
    let payload = transport.recv().await.expect("valid record");
    assert_eq!(payload.len(), 194);

    host.write_all(&[0x2b, 0x50, 0xab, 0x5b])
        .await
        .expect("raw unframed payload prefix");
    let error = transport.recv().await.expect_err("desync prefix fails");
    let TransportError::RecordLayerInvalidLength(message) = error else {
        panic!("expected invalid record length transport error");
    };

    assert!(message.contains("payload length 726707035"));
    assert!(message.contains("direction=recv"));
    assert!(message.contains("bridge_kind=android_aoa"));
    assert!(message.contains("max_record_bytes=65535"));
    assert!(message.contains("length_prefix_hex=2b50ab5b"));
    assert!(message.contains("last_valid_direction=recv"));
    assert!(message.contains("last_valid_size=194"));
}

#[tokio::test]
async fn mobile_usb_record_transport_invalid_length_includes_redacted_session_context() {
    let (client, mut host) = duplex(64);
    let context = crate::mobile_usb::observability::TransportSessionContext::new()
        .with_trace_id("trace-secret")
        .with_usb_session_id("usb-session-secret")
        .with_host_id("host-secret")
        .with_peer_id("peer-secret")
        .with_bridge_kind(MobileUsbBridgeKind::AndroidAoa)
        .with_transport_type(TransportType::UsbMobile);
    context.set_generation(77);
    let mut transport =
        MobileUsbRemoteTransport::with_context(client, MobileUsbBridgeKind::AndroidAoa, context);

    host.write_all(&0_u32.to_be_bytes())
        .await
        .expect("zero len");
    let error = transport.recv().await.expect_err("zero len fails");
    let TransportError::RecordLayerInvalidLength(message) = error else {
        panic!("expected invalid record length transport error");
    };

    assert!(message.contains("session_generation=77"));
    assert!(message.contains("bridge_kind=android_aoa"));
    assert!(message.contains("transport_type=UsbMobile"));
    assert!(message.contains("trace_id=redacted:"));
    assert!(message.contains("usb_session_id=redacted:"));
    assert!(message.contains("host_id=redacted:"));
    assert!(message.contains("peer_id=redacted:"));
    assert!(!message.contains("trace-secret"));
    assert!(!message.contains("usb-session-secret"));
    assert!(!message.contains("host-secret"));
    assert!(!message.contains("peer-secret"));
}

#[tokio::test]
async fn mobile_usb_record_transport_recv_is_cancel_safe_mid_payload() {
    let (client, mut host) = duplex(64);
    let mut transport = MobileUsbRemoteTransport::new(client, MobileUsbBridgeKind::AndroidAoa);

    host.write_all(&5_u32.to_be_bytes()).await.expect("len");
    host.write_all(b"he").await.expect("partial payload");

    {
        // Poll once so the future consumes the length prefix and the partial
        // payload, then drop it: this is what losing a tokio::select! race
        // against another ready branch does to the recv future.
        let mut recv_future = transport.recv();
        let poll = std::future::poll_fn(|cx| Poll::Ready(recv_future.as_mut().poll(cx))).await;
        assert!(
            matches!(poll, Poll::Pending),
            "recv must be waiting mid-record"
        );
    }

    host.write_all(b"llo").await.expect("rest of payload");
    let payload = transport.recv().await.expect("resumed recv");
    assert_eq!(payload, b"hello");

    // The record layer must still be in sync for the next record.
    host.write_all(&3_u32.to_be_bytes()).await.expect("len 2");
    host.write_all(b"abc").await.expect("payload 2");
    assert_eq!(transport.recv().await.expect("next record"), b"abc");
}

#[tokio::test]
async fn mobile_usb_record_transport_recv_is_cancel_safe_mid_length_prefix() {
    let (client, mut host) = duplex(64);
    let mut transport = MobileUsbRemoteTransport::new(client, MobileUsbBridgeKind::AndroidAoa);

    host.write_all(&5_u32.to_be_bytes()[..2])
        .await
        .expect("partial len");

    {
        let mut recv_future = transport.recv();
        let poll = std::future::poll_fn(|cx| Poll::Ready(recv_future.as_mut().poll(cx))).await;
        assert!(
            matches!(poll, Poll::Pending),
            "recv must be waiting mid-length-prefix"
        );
    }

    host.write_all(&5_u32.to_be_bytes()[2..])
        .await
        .expect("rest of len");
    host.write_all(b"hello").await.expect("payload");
    assert_eq!(transport.recv().await.expect("resumed recv"), b"hello");
}

#[tokio::test]
async fn mobile_usb_record_transport_maps_mid_record_eof_to_closed() {
    let (client, mut host) = duplex(64);
    let mut transport = MobileUsbRemoteTransport::new(client, MobileUsbBridgeKind::AndroidAoa);

    host.write_all(&4_u32.to_be_bytes()).await.expect("len");
    host.write_all(b"ab").await.expect("partial payload");
    drop(host);

    let error = transport.recv().await.expect_err("mid-record EOF fails");

    assert!(matches!(error, TransportError::Closed));
}
