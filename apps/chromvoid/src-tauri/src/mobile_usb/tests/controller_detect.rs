use super::support::*;
use super::*;

fn detect_controller(
    records: Vec<MobileUsbPairedHostRecord>,
    secrets_entries: &[(&str, Vec<u8>)],
    candidates: Vec<MobileUsbDetectCandidate>,
) -> MobileUsbController {
    detect_controller_with_secrets(records, secrets_entries, candidates).0
}

fn detect_controller_with_secrets(
    records: Vec<MobileUsbPairedHostRecord>,
    secrets_entries: &[(&str, Vec<u8>)],
    candidates: Vec<MobileUsbDetectCandidate>,
) -> (MobileUsbController, Arc<InMemoryMobileUsbSecretStore>) {
    let bridge = Arc::new(FakeMobileUsbBridge::new(Vec::new()));
    bridge.set_detected(candidates);
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    for record in records {
        store.commit_pairing(record).expect("commit record");
    }
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    for (key_ref, key) in secrets_entries {
        secrets.insert(key_ref.to_string(), key.clone());
    }
    let starter = Arc::new(FakeSessionStarter::default());
    (
        MobileUsbController::new(bridge, store, secrets.clone(), starter),
        secrets,
    )
}

fn accessory_candidate() -> MobileUsbDetectCandidate {
    MobileUsbDetectCandidate {
        scan: scan_result(),
        accessory_mode: true,
    }
}

fn normal_mode_candidate(serial: &str) -> MobileUsbDetectCandidate {
    MobileUsbDetectCandidate {
        scan: MobileUsbScanResult {
            platform: MobileUsbPlatform::Android,
            bridge_kind: MobileUsbBridgeKind::AndroidAoa,
            usb_hint: UsbHint {
                // Normal-mode strings differ from accessory-mode strings; only
                // the serial is expected to be stable across the mode switch.
                manufacturer: Some("Google Inc.".to_string()),
                model: Some("Pixel 7".to_string()),
                serial_number: Some(serial.to_string()),
                protocol_id: None,
            },
            label: Some("Pixel 7".to_string()),
        },
        accessory_mode: false,
    }
}

#[tokio::test]
async fn mobile_usb_detect_matches_paired_accessory_device() {
    let controller = detect_controller(
        vec![record("host-1", "secret:one", vec![1])],
        &[("secret:one", vec![7])],
        vec![accessory_candidate()],
    );

    let detected = controller.detect().await.expect("detect");

    assert_eq!(detected.len(), 1);
    assert!(detected[0].accessory_mode);
    let paired = detected[0].paired_match.as_ref().expect("paired match");
    assert_eq!(paired.host_id, "host-1");
    assert_eq!(paired.label, "Host host-1");
    assert_eq!(
        paired.pairing_state,
        MobileUsbDetectedPairingState::Confirmed
    );
}

#[tokio::test]
async fn mobile_usb_detect_matches_paired_host_by_serial_in_normal_mode() {
    let controller = detect_controller(
        vec![record("host-1", "secret:one", vec![1])],
        &[("secret:one", vec![7])],
        vec![normal_mode_candidate("123")],
    );

    let detected = controller.detect().await.expect("detect");

    assert_eq!(detected.len(), 1);
    assert!(!detected[0].accessory_mode);
    let paired = detected[0].paired_match.as_ref().expect("paired match");
    assert_eq!(paired.host_id, "host-1");
    assert_eq!(
        paired.pairing_state,
        MobileUsbDetectedPairingState::Confirmed
    );
}

#[tokio::test]
async fn mobile_usb_detect_drops_unmatched_normal_mode_devices() {
    let controller = detect_controller(
        vec![record("host-1", "secret:one", vec![1])],
        &[("secret:one", vec![7])],
        vec![normal_mode_candidate("other-serial")],
    );

    let detected = controller.detect().await.expect("detect");

    assert!(detected.is_empty());
}

#[tokio::test]
async fn mobile_usb_detect_keeps_unpaired_accessory_devices() {
    let controller = detect_controller(Vec::new(), &[], vec![accessory_candidate()]);

    let detected = controller.detect().await.expect("detect");

    assert_eq!(detected.len(), 1);
    assert!(detected[0].accessory_mode);
    assert!(detected[0].paired_match.is_none());
}

#[tokio::test]
async fn mobile_usb_detect_does_not_load_confirmed_pairing_secret() {
    let (controller, secrets) = detect_controller_with_secrets(
        vec![record("host-1", "secret:one", vec![1])],
        &[],
        vec![accessory_candidate()],
    );
    secrets.set_fail_load(true);

    let detected = controller.detect().await.expect("detect");

    assert_eq!(detected.len(), 1);
    let paired = detected[0].paired_match.as_ref().expect("paired match");
    assert_eq!(paired.host_id, "host-1");
    assert_eq!(
        paired.pairing_state,
        MobileUsbDetectedPairingState::Confirmed
    );
    assert!(secrets.load_attempts().is_empty());
}

#[tokio::test]
async fn mobile_usb_detect_marks_incomplete_pairing_metadata_for_review() {
    let mut incomplete = record("host-1", "secret:one", vec![1]);
    incomplete.pairing_confirmed_at = None;
    let (controller, secrets) = detect_controller_with_secrets(
        vec![incomplete],
        &[("secret:one", vec![7])],
        vec![accessory_candidate()],
    );

    let detected = controller.detect().await.expect("detect");

    let paired = detected[0].paired_match.as_ref().expect("paired match");
    assert_eq!(
        paired.pairing_state,
        MobileUsbDetectedPairingState::Incomplete
    );
    assert!(secrets.load_attempts().is_empty());
}

#[tokio::test]
async fn mobile_usb_detect_makes_no_claim_on_ambiguous_serial_match() {
    let controller = detect_controller(
        vec![
            record("host-1", "secret:one", vec![1]),
            record("host-2", "secret:two", vec![2]),
        ],
        &[("secret:one", vec![7]), ("secret:two", vec![8])],
        vec![normal_mode_candidate("123")],
    );

    let detected = controller.detect().await.expect("detect");

    // Both paired records share the fixture serial, so no single-host claim can
    // be made and the non-accessory candidate is dropped as noise.
    assert!(detected.is_empty());
}

#[tokio::test]
async fn mobile_usb_detect_takes_no_in_flight_operation_slot() {
    let controller = detect_controller(Vec::new(), &[], vec![accessory_candidate()]);
    let before = controller.status().expect("status before");

    let _ = controller.detect().await.expect("detect");
    let after = controller.status().expect("status after");

    assert_eq!(after.in_flight, None);
    assert_eq!(after.session_state, before.session_state);
}
