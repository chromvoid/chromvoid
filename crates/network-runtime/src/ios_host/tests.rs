use super::{IosHostErrorKind, IosHostPhase, IosHostRuntimeState, IosHostStatus};
use std::time::Duration;
use tokio::task::JoinHandle;

async fn assert_cancelled(task: JoinHandle<()>) {
    assert!(tokio::time::timeout(Duration::from_secs(2), task)
        .await
        .expect("responder must stop")
        .expect_err("responder must be cancelled")
        .is_cancelled());
}

#[tokio::test]
async fn replacement_invalidates_and_aborts_previous_responder() {
    let runtime = IosHostRuntimeState::new();
    let generation = runtime.begin_responder_task().unwrap();
    let task = tokio::spawn(std::future::pending::<()>());
    runtime
        .store_responder_task(generation, task.abort_handle())
        .unwrap();

    let replacement = runtime.begin_responder_task().unwrap();
    assert!(!runtime.is_responder_generation_current(generation));
    assert!(runtime.is_responder_generation_current(replacement));
    assert_cancelled(task).await;
}

#[tokio::test]
async fn cancellation_invalidates_generation_and_stops_responder() {
    let runtime = IosHostRuntimeState::new();
    let generation = runtime.begin_responder_task().unwrap();
    let task = tokio::spawn(std::future::pending::<()>());
    runtime
        .store_responder_task(generation, task.abort_handle())
        .unwrap();

    runtime.cancel_responder_task().unwrap();
    assert!(!runtime.is_responder_generation_current(generation));
    assert_cancelled(task).await;
}

#[tokio::test]
async fn stale_completion_preserves_current_responder_cancellation() {
    let runtime = IosHostRuntimeState::new();
    let generation = runtime.begin_responder_task().unwrap();
    let task = tokio::spawn(std::future::pending::<()>());
    runtime
        .store_responder_task(generation, task.abort_handle())
        .unwrap();

    runtime
        .clear_responder_task_if_current(generation - 1)
        .unwrap();
    runtime.cancel_responder_task().unwrap();
    assert_cancelled(task).await;
}

#[test]
fn status_updates_return_owned_snapshots_without_claiming_a_connection() {
    let runtime = IosHostRuntimeState::new();
    let initial = runtime.host_status().unwrap();
    assert_eq!(initial.phase, IosHostPhase::Idle);
    assert!(initial.pairing_offer.is_none());
    assert!(initial.presence.is_none());

    let pairing = runtime
        .set_status(|status| {
            status.phase = IosHostPhase::Pairing;
            status.relay_url = Some("wss://relay.test".into());
            status.pairing_pin = Some("123456".into());
        })
        .unwrap();
    runtime
        .set_status(|status| {
            status.phase = IosHostPhase::Error;
            status.pairing_pin = None;
            status.error = Some("pairing expired".into());
        })
        .unwrap();

    assert_eq!(initial.phase, IosHostPhase::Idle);
    assert_eq!(pairing.phase, IosHostPhase::Pairing);
    assert_eq!(pairing.pairing_pin.as_deref(), Some("123456"));
    let current = runtime.host_status().unwrap();
    assert_eq!(current.phase, IosHostPhase::Error);
    assert_eq!(current.relay_url.as_deref(), Some("wss://relay.test"));
    assert!(current.pairing_pin.is_none());
    assert_eq!(current.error.as_deref(), Some("pairing expired"));
    assert!(current.presence.is_none());
}

#[test]
fn poisoned_status_returns_existing_error_without_mutation() {
    let runtime = IosHostRuntimeState::new();
    let _ = std::panic::catch_unwind(|| {
        let _guard = runtime.status.lock().unwrap();
        panic!("poison status");
    });
    assert_eq!(
        runtime.host_status().unwrap_err(),
        "iOS host status mutex poisoned"
    );
    let mut called = false;
    let error = runtime.set_status(|_| called = true).unwrap_err();
    assert!(!called);
    assert_eq!(error, "iOS host status mutex poisoned");
}
#[test]
fn optional_error_kind_preserves_legacy_status_and_roundtrips_expiry() {
    let legacy = serde_json::to_value(IosHostStatus::default()).unwrap();
    assert!(legacy.get("error_kind").is_none());
    let mut status: IosHostStatus = serde_json::from_value(legacy).unwrap();
    assert!(status.error_kind.is_none());
    status.phase = IosHostPhase::Error;
    status.error_kind = Some(IosHostErrorKind::PairingExpired);
    let decoded: IosHostStatus =
        serde_json::from_value(serde_json::to_value(status).unwrap()).unwrap();
    assert_eq!(decoded.error_kind, Some(IosHostErrorKind::PairingExpired));
}
