use super::*;

pub(in crate::mobile_usb::tests) fn scan_result() -> MobileUsbScanResult {
    MobileUsbScanResult {
        platform: MobileUsbPlatform::Android,
        bridge_kind: MobileUsbBridgeKind::AndroidAoa,
        usb_hint: usb_hint(),
        label: Some("Pixel".to_string()),
    }
}

pub(in crate::mobile_usb::tests) fn pair_request() -> MobileUsbPairRequest {
    MobileUsbPairRequest {
        platform: MobileUsbPlatform::Android,
        bridge_kind: MobileUsbBridgeKind::AndroidAoa,
        usb_hint: usb_hint(),
        label: Some("Pixel".to_string()),
    }
}

pub(in crate::mobile_usb::tests) fn record(
    host_id: &str,
    client_key_ref: &str,
    peer_pubkey: Vec<u8>,
) -> MobileUsbPairedHostRecord {
    MobileUsbPairedHostRecord {
        host_id: host_id.to_string(),
        label: format!("Host {host_id}"),
        platform: MobileUsbPlatform::Android,
        bridge_kind: MobileUsbBridgeKind::AndroidAoa,
        peer_pubkey,
        client_pubkey: vec![4],
        client_key_ref: client_key_ref.to_string(),
        usb_hint: usb_hint(),
        paired_at: 1,
        last_seen: None,
        pairing_confirmed_at: Some(1),
    }
}

pub(in crate::mobile_usb::tests) fn host_view(
    host_id: &str,
    pairing_state: MobileUsbPairingState,
) -> MobileUsbHostView {
    MobileUsbHostView::from_record(&record(host_id, "secret:one", vec![1]), pairing_state)
}

pub(in crate::mobile_usb::tests) fn usb_hint() -> UsbHint {
    UsbHint {
        manufacturer: Some("Google".to_string()),
        model: Some("Pixel".to_string()),
        serial_number: Some("123".to_string()),
        protocol_id: Some("chromvoid.usb_remote.v1".to_string()),
    }
}
