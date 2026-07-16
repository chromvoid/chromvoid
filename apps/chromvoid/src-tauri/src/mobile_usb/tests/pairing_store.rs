use super::support::*;
use super::*;

#[test]
fn mobile_usb_observability_redacts_identifiers() {
    let raw = "mobile-usb-session-secretish-123";
    let redacted = redacted_identifier(Some(raw));

    assert!(redacted.starts_with("redacted:"));
    assert!(!redacted.contains(raw));
    assert_eq!(redacted_identifier(None), "none");
    assert_eq!(redacted_identifier(Some("   ")), "none");
}

#[cfg(desktop)]
#[test]
fn mobile_usb_runtime_event_sink_uses_current_session_id() {
    let target = Arc::new(RecordingMobileUsbSessionEventTarget::default());
    let sink = TauriMobileUsbSessionEventSink::new(target.clone(), "session-current".to_string());

    crate::remote_io_runtime::RemoteIoRuntimeEventSink::on_remote_io_event(
        &sink,
        crate::remote_io_runtime::RemoteIoRuntimeEvent::Disconnected {
            reason: "transport closed".to_string(),
            failure: crate::remote_data_plane::RemoteIoFailure::TransportClosed,
        },
    );
    crate::remote_io_runtime::RemoteIoRuntimeEventSink::on_remote_io_event(
        &sink,
        crate::remote_io_runtime::RemoteIoRuntimeEvent::Disconnected {
            reason: "host stopped".to_string(),
            failure: crate::remote_data_plane::RemoteIoFailure::DataPlaneError {
                message: "host stopped".to_string(),
            },
        },
    );
    crate::remote_io_runtime::RemoteIoRuntimeEventSink::on_remote_io_event(
        &sink,
        crate::remote_io_runtime::RemoteIoRuntimeEvent::Disconnected {
            reason: "transport closed".to_string(),
            failure: crate::remote_data_plane::RemoteIoFailure::DataPlaneError {
                message: "disconnect text should not drive classification".to_string(),
            },
        },
    );

    let events = target.events.lock().expect("events").clone();
    assert_eq!(
        events,
        vec![
            MobileUsbSessionEvent::CableDisconnected {
                session_id: "session-current".to_string(),
            },
            MobileUsbSessionEvent::RemoteIoStopped {
                session_id: "session-current".to_string(),
                reason: RemoteIoStopReason::Error("host stopped".to_string()),
            },
            MobileUsbSessionEvent::RemoteIoStopped {
                session_id: "session-current".to_string(),
                reason: RemoteIoStopReason::Error("transport closed".to_string()),
            },
        ]
    );
}

#[test]
fn mobile_usb_classification_handles_unpaired_broken_and_ambiguous() {
    let secrets = InMemoryMobileUsbSecretStore::default();
    let scan = scan_result();

    assert_eq!(
        classify_scan_result(&scan, &[], &secrets),
        MobileUsbScanClassification::Unpaired
    );

    let broken = record("broken", "secret:missing", vec![1]);
    assert_eq!(
        classify_scan_result(&scan, &[broken.clone()], &secrets),
        MobileUsbScanClassification::BrokenLocalState {
            host_id: "broken".to_string()
        }
    );

    let malformed = record("malformed", "", vec![]);
    assert_eq!(
        classify_scan_result(&scan, &[malformed], &secrets),
        MobileUsbScanClassification::BrokenLocalState {
            host_id: "malformed".to_string()
        }
    );

    secrets.insert("secret:one".to_string(), vec![7]);
    secrets.insert("secret:two".to_string(), vec![8]);
    let first = record("host-1", "secret:one", vec![1]);
    let second = record("host-2", "secret:two", vec![2]);
    assert_eq!(
        classify_scan_result(&scan, &[first, second], &secrets),
        MobileUsbScanClassification::Ambiguous
    );

    secrets.set_fail_load(true);
    let failed_load = record("failed-load", "secret:one", vec![3]);
    assert_eq!(
        classify_scan_result(&scan, &[failed_load], &secrets),
        MobileUsbScanClassification::BrokenLocalState {
            host_id: "failed-load".to_string()
        }
    );
}

#[test]
fn mobile_usb_pairing_store_rejects_duplicate_peer_pubkey_and_removes_idempotently() {
    let store =
        InMemoryMobileUsbPairingStore::with_records(vec![record("host-1", "secret:one", vec![9])]);

    let error = store
        .commit_pairing(record("host-2", "secret:two", vec![9]))
        .expect_err("duplicate peer key should fail closed");

    assert_eq!(error.code, MobileUsbErrorCode::PairingDuplicate);
    store
        .remove(&"missing-host".to_string())
        .expect("missing remove is idempotent");
}

#[test]
fn mobile_usb_json_pairing_commit_writes_record_after_secret_save() {
    let temp = tempfile::tempdir().expect("temp dir");
    let store = JsonMobileUsbPairingStore::new(temp.path());
    let secrets = InMemoryMobileUsbSecretStore::default();

    let saved =
        commit_pairing_with_secret(&store, &secrets, record("host-1", "", vec![3]), &[1, 2, 3])
            .expect("commit pairing");

    let records = store.list().expect("list records");
    assert_eq!(records, vec![saved]);
    assert!(temp.path().join("paired_mobile_usb_hosts.json").exists());
}

#[test]
fn mobile_usb_json_pairing_store_touches_last_seen_atomically() {
    let temp = tempfile::tempdir().expect("temp dir");
    let store = JsonMobileUsbPairingStore::new(temp.path());
    store
        .commit_pairing(record("host-1", "secret:one", vec![3]))
        .expect("commit pairing");

    let updated = store
        .touch_last_seen(&"host-1".to_string(), 42)
        .expect("touch last seen");

    assert_eq!(updated.last_seen, Some(42));
    assert_eq!(
        store
            .get(&"host-1".to_string())
            .expect("record lookup")
            .expect("record")
            .last_seen,
        Some(42)
    );
}

#[test]
fn mobile_usb_json_pairing_store_corrupt_json_fails_closed_without_overwrite() {
    let temp = tempfile::tempdir().expect("temp dir");
    let path = temp.path().join("paired_mobile_usb_hosts.json");
    std::fs::write(&path, b"{not valid json").expect("write corrupt store");
    let store = JsonMobileUsbPairingStore::new(temp.path());

    let list_error = store.list().expect_err("corrupt list should fail");
    assert_eq!(list_error.code, MobileUsbErrorCode::PairingStoreCorrupt);

    let commit_error = store
        .commit_pairing(record("host-1", "secret:one", vec![3]))
        .expect_err("corrupt store must not be overwritten");
    assert_eq!(commit_error.code, MobileUsbErrorCode::PairingStoreCorrupt);
    assert_eq!(
        std::fs::read(&path).expect("corrupt file still exists"),
        b"{not valid json"
    );
}

#[test]
fn mobile_usb_old_pairing_json_without_confirmation_is_quarantined() {
    let temp = tempfile::tempdir().expect("temp dir");
    let path = temp.path().join("paired_mobile_usb_hosts.json");
    std::fs::write(
        &path,
        r#"[
  {
    "host_id": "old-host",
    "label": "Old Host",
    "platform": "android",
    "bridge_kind": "android_aoa",
    "peer_pubkey": [1, 2, 3],
    "client_pubkey": [4, 5, 6],
    "client_key_ref": "secret:old",
    "usb_hint": {
      "manufacturer": "Google",
      "model": "Pixel",
      "serial_number": "123",
      "protocol_id": "chromvoid.usb_remote.v1"
    },
    "paired_at": 1,
    "last_seen": null
  }
]"#,
    )
    .expect("write old store");
    let store = Arc::new(JsonMobileUsbPairingStore::new(temp.path()));
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    secrets.insert("secret:old".to_string(), vec![9]);

    let records = store.list().expect("list old records");
    assert_eq!(records.len(), 1);
    assert!(records[0].is_valid_for_auto_match());
    assert!(!records[0].is_connectable_pairing());
    assert_eq!(records[0].pairing_confirmed_at, None);
    assert_eq!(
        classify_scan_result(&scan_result(), &records, secrets.as_ref()),
        MobileUsbScanClassification::BrokenLocalState {
            host_id: "old-host".to_string()
        }
    );

    let controller = MobileUsbController::new(
        Arc::new(FakeMobileUsbBridge::new(vec![scan_result()])),
        store.clone(),
        secrets,
        Arc::new(FakeSessionStarter::default()),
    );
    let paired = controller.list_paired().expect("list paired");
    assert_eq!(paired.len(), 1);
    assert_eq!(
        paired[0].pairing_state,
        MobileUsbPairingState::BrokenLocalState
    );

    let remaining = controller
        .remove_paired("old-host".to_string())
        .expect("remove quarantined record");
    assert!(remaining.is_empty());
}

#[test]
fn mobile_usb_pairing_commit_secret_failure_writes_no_record() {
    let temp = tempfile::tempdir().expect("temp dir");
    let store = JsonMobileUsbPairingStore::new(temp.path());
    let secrets = InMemoryMobileUsbSecretStore::default();
    secrets.set_fail_save(true);

    let error =
        commit_pairing_with_secret(&store, &secrets, record("host-1", "", vec![3]), &[1, 2, 3])
            .expect_err("secret save failure should abort pairing");

    assert_eq!(error.code, MobileUsbErrorCode::SecretStoreUnavailable);
    assert!(store.list().expect("list records").is_empty());
    assert!(!temp.path().join("paired_mobile_usb_hosts.json").exists());
}

#[test]
fn mobile_usb_secret_commit_failure_cleanup_can_delete_saved_secret() {
    let secrets = InMemoryMobileUsbSecretStore::default();
    let store = InMemoryMobileUsbPairingStore::default();
    store.set_fail_commit(true);

    let error =
        commit_pairing_with_secret(&store, &secrets, record("host-1", "", vec![3]), &[1, 2, 3])
            .expect_err("commit failure should fail pairing");

    assert_eq!(error.code, MobileUsbErrorCode::PairCommitFailed);
    assert_eq!(secrets.delete_attempts(), vec!["fake:host-1".to_string()]);
}

#[tokio::test]
async fn mobile_usb_recovery_list_keeps_broken_records_visible_for_remove() {
    let bridge = Arc::new(FakeMobileUsbBridge::new(vec![scan_result()]));
    let malformed = record("broken", "", vec![]);
    let store = Arc::new(InMemoryMobileUsbPairingStore::with_records(vec![malformed]));
    let secrets = Arc::new(InMemoryMobileUsbSecretStore::default());
    let starter = Arc::new(FakeSessionStarter::default());
    let controller =
        MobileUsbController::new(bridge.clone(), store.clone(), secrets.clone(), starter);

    let paired = controller.list_paired().expect("list paired");

    assert_eq!(paired.len(), 1);
    assert_eq!(paired[0].host_id, "broken");
    assert_eq!(
        paired[0].pairing_state,
        MobileUsbPairingState::BrokenLocalState
    );
    assert_eq!(
        classify_scan_result(
            &scan_result(),
            &store.list().expect("records"),
            secrets.as_ref()
        ),
        MobileUsbScanClassification::BrokenLocalState {
            host_id: "broken".to_string()
        }
    );

    let remaining = controller
        .remove_paired("broken".to_string())
        .expect("remove broken record");

    assert!(remaining.is_empty());
    assert_eq!(bridge.scan_count(), 0);
    assert_eq!(bridge.pair_open_count(), 0);
    assert_eq!(bridge.connect_open_count(), 0);
}
