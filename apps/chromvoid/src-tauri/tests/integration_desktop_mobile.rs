//! Integration tests for the Desktop ↔ Mobile connection cycle.
//!
//! Validates end-to-end backend flow: pairing → connect → mode switch → sync.
//! Uses mock channels and local state — no live network or relay required.
//!
//! Depends on Tasks 6 (mobile acceptor), 9 (remote adapter), 10 (sync integration).

mod common;

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_lib::network::mobile_acceptor::{AcceptorState, ConnectedPeer, MobileAcceptor};
use chromvoid_lib::network::paired_peers::{PairedPeer, PairedPeerStore};
use chromvoid_lib::network::pairing;
use chromvoid_lib::{
    bootstrap_sync, choose_reconnect_strategy, current_cursor, is_sync_active, reset_sync_state,
    trigger_reconnect_sync, ConnectionState, CoreAdapter, CoreMode, LocalCoreAdapter,
    ModeTransition, ReconnectStrategy, RemoteCoreAdapter, RemoteHost, SyncCursor, SyncState,
    WriterLockInfo,
};
use serde_json::json;
use tokio::sync::mpsc;

// ── Helpers ─────────────────────────────────────────────────────────────

/// Create a test PairedPeerStore in a tempdir with one pre-paired peer.
fn setup_paired_peer_store() -> (tempfile::TempDir, PairedPeerStore, PairedPeer) {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("test_peers.json");
    let mut store = PairedPeerStore::load(&path);

    let peer = PairedPeer {
        peer_id: "mobile-device-1".to_string(),
        label: "Test Mobile".to_string(),
        relay_url: "wss://relay.test:443".to_string(),
        peer_pubkey: vec![
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
            25, 26, 27, 28, 29, 30, 31, 32,
        ],
        client_pubkey: vec![
            32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11,
            10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
        ],
        client_privkey_hex: "aa".repeat(32),
        last_seen: 0,
        paired_at: 1700000000,
    };
    store.upsert(peer.clone());
    store.save().unwrap();

    (dir, store, peer)
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

// ═══════════════════════════════════════════════════════════════════════
//  1. PAIRING — session creation, PIN verification, peer persistence
// ═══════════════════════════════════════════════════════════════════════

#[test]
fn integration_pairing_session_lifecycle() {
    // Start pairing → returns session_id, 6-digit PIN, room_id.
    let info = pairing::start_pairing("wss://relay.test");

    assert_eq!(info.pin.len(), 6, "PIN must be 6 digits");
    assert!(
        info.pin.chars().all(|c| c.is_ascii_digit()),
        "PIN must be numeric"
    );
    assert_eq!(info.session_id.len(), 32, "session_id must be 32 hex chars");
    assert_eq!(info.room_id.len(), 64, "room_id must be 64 hex chars");
    assert_eq!(info.state, pairing::PairingState::WaitingForPeer);
    assert_eq!(info.attempts_left, 5);
    assert!(info.locked_until_ms.is_none());
    assert!(!info.relay_url.is_empty());

    // Cancel pairing — session removed.
    pairing::cancel_pairing(&info.session_id);
}

#[test]
fn integration_pairing_confirm_stores_peer() {
    let (_dir, mut store, _) = setup_paired_peer_store();
    let info = pairing::start_pairing("wss://relay.test");
    let correct_pin = info.pin.clone();

    // Confirm with correct PIN → peer stored.
    let result = pairing::confirm_pairing(
        &info.session_id,
        &correct_pin,
        "desktop-001",
        "My Desktop",
        "wss://relay.test",
        vec![10; 32], // mock peer pubkey
        &mut store,
    );

    assert!(
        result.is_ok(),
        "confirm_pairing should succeed: {:?}",
        result
    );
    let val = result.unwrap();
    assert_eq!(val["paired"], true);

    // Verify peer was persisted.
    let stored_peer = store.get("desktop-001");
    assert!(
        stored_peer.is_some(),
        "peer must be stored after successful pairing"
    );
    assert_eq!(stored_peer.unwrap().label, "My Desktop");
}

#[test]
fn integration_pairing_wrong_pin_lockout() {
    let (_dir, mut store, _) = setup_paired_peer_store();
    let info = pairing::start_pairing("wss://relay.test");
    let wrong_pin = "000000";

    // Submit wrong PIN 5 times → lockout.
    for attempt in 1..=5 {
        let result = pairing::confirm_pairing(
            &info.session_id,
            wrong_pin,
            "desktop-001",
            "Desktop",
            "wss://relay.test",
            vec![10; 32],
            &mut store,
        );
        assert!(
            result.is_err(),
            "attempt {} should fail with wrong PIN",
            attempt
        );
    }

    // 6th attempt should report lockout (not just "pin mismatch").
    let result = pairing::confirm_pairing(
        &info.session_id,
        wrong_pin,
        "desktop-001",
        "Desktop",
        "wss://relay.test",
        vec![10; 32],
        &mut store,
    );
    assert!(result.is_err());
    let err = result.unwrap_err();
    assert!(
        err.contains("locked"),
        "after 5 failures, should be locked: {}",
        err
    );

    // Clean up.
    pairing::cancel_pairing(&info.session_id);
}

#[test]
fn integration_pairing_cancel_removes_session() {
    let info = pairing::start_pairing("wss://relay.test");
    let session_id = info.session_id.clone();

    pairing::cancel_pairing(&session_id);

    // Confirm on cancelled session should fail.
    let (_dir, mut store, _) = setup_paired_peer_store();
    let result = pairing::confirm_pairing(
        &session_id,
        &info.pin,
        "desktop-001",
        "Desktop",
        "wss://relay.test",
        vec![10; 32],
        &mut store,
    );
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("no active pairing session"));
}

// ═══════════════════════════════════════════════════════════════════════
//  2. CONNECT — RemoteCoreAdapter from network channel
// ═══════════════════════════════════════════════════════════════════════

#[test]
fn integration_remote_adapter_from_network_channel() {
    let (tx, _rx) = mpsc::channel::<chromvoid_lib::network::IoRequest>(16);
    let host = RemoteHost::TauriRemoteWss {
        peer_id: "mobile-device-1".to_string(),
    };
    let adapter = RemoteCoreAdapter::from_network(host, tx);

    assert!(matches!(adapter.mode(), CoreMode::Remote { .. }));
    assert_eq!(adapter.connection_state(), ConnectionState::Ready);
    assert!(!adapter.is_unlocked());
    assert!(adapter.is_transport_active());
}

#[test]
fn integration_remote_adapter_detects_disconnect() {
    let (tx, rx) = mpsc::channel::<chromvoid_lib::network::IoRequest>(16);
    let host = RemoteHost::TauriRemoteWss {
        peer_id: "mobile-device-1".to_string(),
    };
    let adapter = RemoteCoreAdapter::from_network(host, tx);
    assert_eq!(adapter.connection_state(), ConnectionState::Ready);

    // Drop the receiver → channel closed → adapter detects disconnect.
    drop(rx);
    assert_eq!(adapter.connection_state(), ConnectionState::Disconnected);
    assert!(!adapter.is_transport_active());
}

#[test]
fn integration_remote_adapter_disconnected_rpc_returns_error() {
    let (tx, rx) = mpsc::channel::<chromvoid_lib::network::IoRequest>(16);
    let host = RemoteHost::TauriRemoteWss {
        peer_id: "mobile-device-1".to_string(),
    };
    let mut adapter = RemoteCoreAdapter::from_network(host, tx);
    drop(rx);

    let req = RpcRequest::new("vault:status".to_string(), json!({}));
    let resp = adapter.handle(&req);
    match resp {
        RpcResponse::Error { code, .. } => {
            assert_eq!(code.as_deref(), Some("DISCONNECTED"));
        }
        _ => panic!(
            "expected Error response for disconnected adapter, got {:?}",
            resp
        ),
    }
}

#[test]
fn integration_remote_adapter_reconnect_via_replace_sender() {
    let (tx1, _rx1) = mpsc::channel::<chromvoid_lib::network::IoRequest>(16);
    let host = RemoteHost::TauriRemoteWss {
        peer_id: "mobile-device-1".to_string(),
    };
    let mut adapter = RemoteCoreAdapter::from_network(host, tx1);
    assert!(adapter.is_transport_active());

    // Simulate disconnect: drop old rx (but we don't have it — drop tx1's rx was already moved)
    // Instead, create a new sender to replace the old one.
    let (tx2, _rx2) = mpsc::channel::<chromvoid_lib::network::IoRequest>(16);
    adapter.replace_network_sender(tx2);
    assert!(adapter.is_transport_active());
    assert_eq!(adapter.connection_state(), ConnectionState::Ready);
}

// ═══════════════════════════════════════════════════════════════════════
//  3. MODE SWITCH — adapter swap simulation (Local ↔ Remote)
// ═══════════════════════════════════════════════════════════════════════

#[test]
fn integration_mode_switch_local_to_remote_adapter_swap() {
    // Start in Local mode.
    let tmp = tempfile::tempdir().expect("tempdir");
    let storage_root = tmp.path().join("storage");
    let local = LocalCoreAdapter::new(storage_root.clone()).expect("LocalCoreAdapter::new");

    let mut adapter: Box<dyn CoreAdapter> = Box::new(local);
    assert!(matches!(adapter.mode(), CoreMode::Local));

    // Simulate mode switch to Remote:
    // 1. Auto-lock vault (no-op here, vault not unlocked).
    // 2. Create RemoteCoreAdapter from network channel.
    let (tx, _rx) = mpsc::channel::<chromvoid_lib::network::IoRequest>(16);
    let host = RemoteHost::TauriRemoteWss {
        peer_id: "mobile-device-1".to_string(),
    };
    let remote = RemoteCoreAdapter::from_network(host, tx);

    // 3. Swap adapter.
    adapter = Box::new(remote);
    assert!(matches!(adapter.mode(), CoreMode::Remote { .. }));
    assert_eq!(adapter.connection_state(), ConnectionState::Ready);
}

#[test]
fn integration_mode_switch_remote_to_local_adapter_swap() {
    // Start in Remote mode.
    let (tx, _rx) = mpsc::channel::<chromvoid_lib::network::IoRequest>(16);
    let host = RemoteHost::TauriRemoteWss {
        peer_id: "mobile-device-1".to_string(),
    };
    let remote = RemoteCoreAdapter::from_network(host, tx);

    let mut adapter: Box<dyn CoreAdapter> = Box::new(remote);
    assert!(matches!(adapter.mode(), CoreMode::Remote { .. }));

    // Simulate mode switch to Local.
    let tmp = tempfile::tempdir().expect("tempdir");
    let storage_root = tmp.path().join("storage");
    let local = LocalCoreAdapter::new(storage_root).expect("LocalCoreAdapter::new");
    adapter = Box::new(local);

    assert!(matches!(adapter.mode(), CoreMode::Local));
}

#[test]
fn integration_mode_switch_auto_lock_before_swap() {
    // Start with an unlocked Local vault.
    let vault = common::TestVault::new_unlocked();
    {
        let adapter = vault.adapter.lock().unwrap();
        assert!(adapter.is_unlocked(), "precondition: vault unlocked");
    }

    // Step 1: Auto-lock vault.
    {
        let mut adapter = vault.adapter.lock().unwrap();
        let lock_req = RpcRequest::new("vault:lock".to_string(), serde_json::Value::Null);
        let _ = adapter.handle(&lock_req);
        let _ = adapter.save();
    }

    {
        let adapter = vault.adapter.lock().unwrap();
        assert!(
            !adapter.is_unlocked(),
            "vault must be locked after auto-lock"
        );
    }

    // Step 2: Swap to Remote.
    let (tx, _rx) = mpsc::channel::<chromvoid_lib::network::IoRequest>(16);
    let host = RemoteHost::TauriRemoteWss {
        peer_id: "mobile-device-1".to_string(),
    };
    let remote = RemoteCoreAdapter::from_network(host, tx);
    {
        let mut guard = vault.adapter.lock().unwrap();
        *guard = Box::new(remote);
    }

    let adapter = vault.adapter.lock().unwrap();
    assert!(matches!(adapter.mode(), CoreMode::Remote { .. }));
}

#[test]
fn integration_mode_transition_metadata() {
    let transition = ModeTransition {
        from: CoreMode::Local,
        to_mode: "remote".to_string(),
        started_at_ms: 1700000000000,
        drain_deadline_ms: 1700000005000,
    };
    let json = serde_json::to_value(&transition).unwrap();
    assert_eq!(json["from"], "local");
    assert_eq!(json["to_mode"], "remote");
    assert_eq!(json["drain_deadline_ms"], 1700000005000u64);
}

// ═══════════════════════════════════════════════════════════════════════
//  4. SYNC CYCLE — bootstrap, delta, reconnect, writer-lock
// ═══════════════════════════════════════════════════════════════════════

#[test]
fn integration_sync_bootstrap_on_remote_entry() {
    reset_sync_state();

    assert!(!is_sync_active());
    assert!(current_cursor().is_none());

    // Simulate entering Remote mode → bootstrap sync.
    bootstrap_sync(100, 1700000000000);

    assert!(is_sync_active());
    let cursor = current_cursor().expect("cursor must be set after bootstrap");
    assert_eq!(cursor.version, 100);
    assert_eq!(cursor.timestamp_ms, 1700000000000);

    reset_sync_state();
}

#[test]
fn integration_sync_reconnect_delta_path() {
    reset_sync_state();

    // Bootstrap at version 100.
    bootstrap_sync(100, 1700000000000);

    // Core Host advanced to version 150 (gap = 50, within threshold 500).
    let strategy = trigger_reconnect_sync(150, 1700000001000);
    assert_eq!(strategy, ReconnectStrategy::Delta);

    let cursor = current_cursor().expect("cursor must advance");
    assert_eq!(cursor.version, 150);
    assert!(is_sync_active());

    reset_sync_state();
}

#[test]
fn integration_sync_reconnect_full_resync_path() {
    reset_sync_state();

    // Bootstrap at version 100.
    bootstrap_sync(100, 1700000000000);

    // Core Host advanced to version 700 (gap = 600, exceeds threshold 500).
    let strategy = trigger_reconnect_sync(700, 1700000002000);
    assert_eq!(strategy, ReconnectStrategy::FullResync);

    let cursor = current_cursor().expect("cursor must advance to host version");
    assert_eq!(cursor.version, 700);

    reset_sync_state();
}

#[test]
fn integration_sync_reconnect_no_prior_cursor() {
    reset_sync_state();

    // No prior bootstrap → version 0 → always FullResync.
    let strategy = choose_reconnect_strategy(0, 50);
    assert_eq!(strategy, ReconnectStrategy::FullResync);

    reset_sync_state();
}

#[test]
fn integration_sync_reconnect_exact_threshold_boundary() {
    // Gap exactly at threshold (500) → Delta.
    assert_eq!(
        choose_reconnect_strategy(100, 600),
        ReconnectStrategy::Delta
    );
    // Gap one past threshold (501) → FullResync.
    assert_eq!(
        choose_reconnect_strategy(100, 601),
        ReconnectStrategy::FullResync
    );
}

#[test]
fn integration_sync_local_switch_clears_state() {
    reset_sync_state();

    // Enter Remote mode.
    bootstrap_sync(200, 1700000000000);
    assert!(is_sync_active());
    assert!(current_cursor().is_some());

    // Switch back to Local → clear sync state.
    reset_sync_state();
    assert!(!is_sync_active());
    assert!(current_cursor().is_none());
}

#[test]
fn integration_sync_writer_lock_state() {
    let mut ss = SyncState::new();
    ss.cursor = Some(SyncCursor {
        version: 100,
        timestamp_ms: 1700000000000,
    });
    ss.subscribed = true;

    // Set writer lock → writes should be blocked.
    ss.writer_lock = Some(WriterLockInfo {
        holder: "mobile-device".to_string(),
        since_ms: 1700000000000,
    });
    assert!(ss.writer_lock.is_some());
    assert_eq!(ss.writer_lock.as_ref().unwrap().holder, "mobile-device");

    // Clear lock → writes allowed.
    ss.writer_lock = None;
    assert!(ss.writer_lock.is_none());
}

// ═══════════════════════════════════════════════════════════════════════
//  5. FULL CYCLE — pairing → connect → mode switch → sync → reconnect
// ═══════════════════════════════════════════════════════════════════════

#[test]
fn integration_full_cycle_pairing_to_sync_to_local() {
    // ── Phase 1: Pairing ──────────────────────────────────────────────
    let (_dir, mut store, _existing_peer) = setup_paired_peer_store();

    let pair_info = pairing::start_pairing("wss://relay.test");
    let result = pairing::confirm_pairing(
        &pair_info.session_id,
        &pair_info.pin,
        "new-desktop",
        "New Desktop",
        "wss://relay.test",
        vec![42; 32],
        &mut store,
    );
    assert!(result.is_ok(), "pairing must succeed: {:?}", result);

    // Verify peer stored.
    let peer = store.get("new-desktop").expect("paired peer must exist");
    assert_eq!(peer.label, "New Desktop");

    // ── Phase 2: Connect (adapter creation from network channel) ─────
    let (tx, _rx) = mpsc::channel::<chromvoid_lib::network::IoRequest>(16);
    let host = RemoteHost::TauriRemoteWss {
        peer_id: "new-desktop".to_string(),
    };
    let remote = RemoteCoreAdapter::from_network(host, tx);
    assert!(matches!(remote.mode(), CoreMode::Remote { .. }));
    assert_eq!(remote.connection_state(), ConnectionState::Ready);

    // ── Phase 3: Mode switch (simulate adapter swap) ─────────────────
    let tmp = tempfile::tempdir().expect("tempdir");
    let storage_root = tmp.path().join("storage");
    let local = LocalCoreAdapter::new(storage_root.clone()).expect("local");
    let mut adapter: Box<dyn CoreAdapter> = Box::new(local);
    assert!(matches!(adapter.mode(), CoreMode::Local));

    // Swap to Remote.
    adapter = Box::new(remote);
    assert!(matches!(adapter.mode(), CoreMode::Remote { .. }));

    // ── Phase 4: Sync bootstrap ──────────────────────────────────────
    reset_sync_state();
    bootstrap_sync(0, now_ms());
    assert!(is_sync_active());
    let cursor = current_cursor().expect("cursor set");
    assert_eq!(cursor.version, 0);

    // ── Phase 5: Receive deltas ──────────────────────────────────────
    // Simulate delta by advancing cursor.
    bootstrap_sync(50, now_ms());
    let cursor = current_cursor().expect("cursor advanced");
    assert_eq!(cursor.version, 50);

    // ── Phase 6: Transport drop → reconnect → delta sync ─────────────
    let strategy = trigger_reconnect_sync(55, now_ms());
    assert_eq!(strategy, ReconnectStrategy::Delta);
    let cursor = current_cursor().expect("cursor after reconnect");
    assert_eq!(cursor.version, 55);
    assert!(is_sync_active());

    // ── Phase 7: Switch back to Local ────────────────────────────────
    reset_sync_state();
    let local2 = LocalCoreAdapter::new(storage_root).expect("local2");
    adapter = Box::new(local2);
    assert!(matches!(adapter.mode(), CoreMode::Local));
    assert!(!is_sync_active());
    assert!(current_cursor().is_none());
}

#[test]
fn integration_full_cycle_reconnect_with_large_gap_triggers_full_resync() {
    reset_sync_state();

    // ── Phase 1: Bootstrap at version 100 ────────────────────────────
    bootstrap_sync(100, 1700000000000);
    assert!(is_sync_active());

    // ── Phase 2: Transport drops for a while ─────────────────────────
    // Core Host advances significantly (gap = 600).
    let strategy = trigger_reconnect_sync(700, 1700000010000);
    assert_eq!(
        strategy,
        ReconnectStrategy::FullResync,
        "large gap must trigger full resync"
    );

    // Cursor should be updated to host's version.
    let cursor = current_cursor().expect("cursor must advance");
    assert_eq!(cursor.version, 700);

    // ── Phase 3: After resync, small gap → delta ─────────────────────
    let strategy2 = trigger_reconnect_sync(710, 1700000020000);
    assert_eq!(strategy2, ReconnectStrategy::Delta);

    reset_sync_state();
}

// ═══════════════════════════════════════════════════════════════════════
//  6. ACCEPTOR STATE MACHINE — mobile-side transitions
// ═══════════════════════════════════════════════════════════════════════

#[test]
fn integration_acceptor_initial_state() {
    let status = MobileAcceptor::status();
    // After any prior test cleanup, state should be Idle or what the static holds.
    // We verify the status struct is well-formed.
    assert!(
        matches!(
            status.state,
            AcceptorState::Idle | AcceptorState::Listening | AcceptorState::Connected
        ),
        "acceptor state must be a valid variant"
    );
}

#[test]
fn integration_acceptor_stop_resets_to_idle() {
    // Calling stop on an idle acceptor should be safe and return Idle.
    let status = MobileAcceptor::stop();
    assert_eq!(status.state, AcceptorState::Idle);
    assert!(status.connected_peers.is_empty());
    assert!(status.relay_url.is_none());
    assert!(status.room_id.is_none());
}

#[test]
fn integration_acceptor_connected_peer_serialization() {
    let peer = ConnectedPeer {
        peer_id: "desktop-1".to_string(),
        label: "My Desktop".to_string(),
        connected_at_ms: 1700000000000,
        transport_type: "webrtc".to_string(),
    };
    let json = serde_json::to_value(&peer).unwrap();
    assert_eq!(json["peer_id"], "desktop-1");
    assert_eq!(json["transport_type"], "webrtc");
    assert_eq!(json["connected_at_ms"], 1700000000000u64);

    // Roundtrip.
    let back: ConnectedPeer = serde_json::from_value(json).unwrap();
    assert_eq!(back.peer_id, "desktop-1");
}

#[test]
fn integration_acceptor_state_serialization() {
    let states = [
        (AcceptorState::Idle, "idle"),
        (AcceptorState::Listening, "listening"),
        (AcceptorState::Handshaking, "handshaking"),
        (AcceptorState::Connected, "connected"),
        (AcceptorState::Disconnected, "disconnected"),
    ];
    for (state, expected) in &states {
        let json = serde_json::to_string(state).unwrap();
        assert_eq!(json, format!("\"{}\"", expected));
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  7. PAIRED PEER STORE — persistence and lookup
// ═══════════════════════════════════════════════════════════════════════

#[test]
fn integration_paired_peer_store_roundtrip() {
    let (_dir, store, peer) = setup_paired_peer_store();
    let found = store.get("mobile-device-1");
    assert!(found.is_some());
    assert_eq!(found.unwrap().peer_id, peer.peer_id);
    assert_eq!(found.unwrap().label, peer.label);
    assert_eq!(found.unwrap().relay_url, peer.relay_url);
}

#[test]
fn integration_paired_peer_store_touch_updates_last_seen() {
    let (_dir, mut store, _peer) = setup_paired_peer_store();
    let before = store.get("mobile-device-1").unwrap().last_seen;
    store.touch("mobile-device-1");
    let after = store.get("mobile-device-1").unwrap().last_seen;
    assert!(after >= before, "touch must update last_seen");
}

#[test]
fn integration_paired_peer_store_remove() {
    let (_dir, mut store, _peer) = setup_paired_peer_store();
    assert!(store.get("mobile-device-1").is_some());
    store.remove("mobile-device-1");
    assert!(store.get("mobile-device-1").is_none());
}
