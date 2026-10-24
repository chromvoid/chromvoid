use super::pairing::*;
use super::record::*;
use chromvoid_protocol::{RemoteTransport, TransportError, TransportType};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[tokio::test]
async fn records_cross_a_stream_with_a_big_endian_length() {
    let (near, mut far) = tokio::io::duplex(1 << 17);
    let mut transport = UsbRecordTransport::new(near);
    transport.send(b"hello").await.expect("send");
    let mut wire = [0u8; 9];
    far.read_exact(&mut wire).await.expect("read");
    assert_eq!(&wire, b"\0\0\0\x05hello");

    far.write_all(&[0, 0, 0, 3, b'a', b'b', b'c'])
        .await
        .expect("write");
    assert_eq!(transport.recv().await.expect("recv"), b"abc");
    assert_eq!(transport.transport_type(), TransportType::UsbMobile);
}

#[tokio::test]
async fn a_record_arriving_in_pieces_survives_a_cancelled_receive() {
    let (near, mut far) = tokio::io::duplex(1 << 17);
    let mut transport = UsbRecordTransport::new(near);
    far.write_all(&[0, 0]).await.expect("half a length");
    let pending =
        tokio::time::timeout(std::time::Duration::from_millis(20), transport.recv()).await;
    assert!(pending.is_err(), "nothing whole has arrived");
    far.write_all(&[0, 4, b'w', b'x'])
        .await
        .expect("the rest of the length");
    let pending =
        tokio::time::timeout(std::time::Duration::from_millis(20), transport.recv()).await;
    assert!(pending.is_err(), "half the payload");
    far.write_all(b"yz").await.expect("the payload's end");
    assert_eq!(transport.recv().await.expect("recv"), b"wxyz");
}

#[tokio::test]
async fn an_empty_or_oversized_record_breaks_the_link() {
    let (near, mut far) = tokio::io::duplex(1 << 17);
    let mut transport = UsbRecordTransport::new(near);
    far.write_all(&[0, 0, 0, 0]).await.expect("write");
    assert!(matches!(
        transport.recv().await,
        Err(TransportError::RecordLayerInvalidLength(_))
    ));
    assert!(matches!(
        transport.recv().await,
        Err(TransportError::Closed)
    ));

    let (near, _far) = tokio::io::duplex(1 << 17);
    let mut transport = UsbRecordTransport::new(near);
    let oversized = vec![0u8; MAX_USB_RECORD_BYTES + 1];
    assert!(matches!(
        transport.send(&oversized).await,
        Err(TransportError::RecordLayerInvalidLength(_))
    ));
}

#[tokio::test]
async fn the_far_end_closing_is_a_closed_link() {
    let (near, far) = tokio::io::duplex(64);
    let mut transport = UsbRecordTransport::new(near);
    drop(far);
    assert!(matches!(
        transport.recv().await,
        Err(TransportError::Closed)
    ));
}

#[test]
fn a_pin_proof_holds_only_for_its_pin_attempt_and_keys() {
    let proof =
        pairing_approval_proof_hex("123456", "attempt", "salt", "desk", "host").expect("proof");
    assert!(
        verify_pairing_approval_proof("123456", "attempt", "salt", "desk", "host", &proof)
            .expect("verify")
    );
    assert!(
        !verify_pairing_approval_proof("654321", "attempt", "salt", "desk", "host", &proof)
            .expect("verify")
    );
    assert!(
        !verify_pairing_approval_proof("123456", "other", "salt", "desk", "host", &proof)
            .expect("verify")
    );
    assert!(
        !verify_pairing_approval_proof("123456", "attempt", "salt", "desk", "else", &proof)
            .expect("verify")
    );
    assert_eq!(pairing_fingerprint(&[1, 2, 3]).len(), 16);
}

#[test]
fn legacy_pairing_hello_defaults_capabilities_to_empty() {
    let hello: MobileUsbPairingHello = serde_json::from_value(serde_json::json!({
        "peer_id": "legacy-peer",
        "peer_label": "Legacy peer",
        "peer_pubkey_hex": "00",
        "platform": "android"
    }))
    .expect("legacy hello");

    assert!(hello.capabilities.is_empty());
}

#[test]
fn legacy_pairing_proof_defaults_to_confirm_and_confirm_stays_wire_compatible() {
    let proof: MobileUsbPairingApprovalProof = serde_json::from_value(serde_json::json!({
        "attempt_id": "attempt-1",
        "proof_hex": "abcd"
    }))
    .expect("legacy proof");
    assert_eq!(proof.action, MobileUsbPairingApprovalAction::Confirm);

    let encoded = serde_json::to_value(proof).expect("encode confirm proof");
    assert!(encoded.get("action").is_none());
}
