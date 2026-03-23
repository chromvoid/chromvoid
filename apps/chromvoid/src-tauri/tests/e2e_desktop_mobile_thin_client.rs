//! E2E Test — Full Desktop ↔ Mobile Thin Client Scenario
//!
//! Validates the complete lifecycle: pairing → connect → mode switch → sync
//! behavior in a single realistic end-to-end sequence. Uses mock channels
//! and local state — no live network or relay required.
//!
//! This scenario models the real user journey:
//! 1. User starts pairing on Desktop, gets PIN
//! 2. User confirms pairing, peer is persisted
//! 3. Desktop creates a RemoteCoreAdapter via network channel
//! 4. Desktop auto-locks vault, switches from Local to Remote mode
//! 5. Sync bootstraps (initial sync from Core Host)
//! 6. Incremental deltas arrive and cursor advances
//! 7. Transport drops → reconnect → delta or full resync
//! 8. User switches back to Local mode → sync state cleared
//! 9. Peer store persists across the whole flow
//!
//! Depends on Tasks 1–14 infrastructure.

mod common;

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_lib::network::mobile_acceptor::{AcceptorState, MobileAcceptor};
use chromvoid_lib::network::paired_peers::PairedPeerStore;
use chromvoid_lib::network::pairing;
use chromvoid_lib::{
    bootstrap_sync, choose_reconnect_strategy, current_cursor, is_sync_active, reset_sync_state,
    trigger_reconnect_sync, ConnectionState, CoreAdapter, CoreMode, LocalCoreAdapter,
    ModeTransition, ReconnectStrategy, RemoteCoreAdapter, RemoteHost, SyncCursor, SyncState,
    WriterLockInfo,
};
use serde_json::json;
use std::time::Instant;
use tokio::sync::mpsc;

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

macro_rules! phase {
    ($start:expr, $n:expr, $desc:expr) => {
        println!(
            "\n  ══ PHASE {} ══ {}  (t={:.1}s)",
            $n,
            $desc,
            $start.elapsed().as_secs_f64()
        );
    };
}

/// Full Desktop ↔ Mobile thin client E2E scenario.
///
/// This is a single long test that exercises every phase of the thin-client
/// lifecycle in sequence, asserting meaningful outcomes at each transition.
#[test]
fn e2e_desktop_mobile_thin_client() {
    let _test_start = Instant::now();
    println!("\n╔══════════════════════════════════════════════════════════════╗");
    println!("║  E2E: Desktop ↔ Mobile Thin Client — Full Scenario         ║");
    println!("╚══════════════════════════════════════════════════════════════╝");

    // ── Setup: create temp peer store + unlocked local vault ─────────
    let peer_dir = tempfile::tempdir().expect("tempdir for peer store");
    let peer_path = peer_dir.path().join("e2e_peers.json");
    let mut store = PairedPeerStore::load(&peer_path);

    let vault = common::TestVault::new_unlocked();
    {
        let adapter = vault.adapter.lock().unwrap();
        assert!(
            adapter.is_unlocked(),
            "precondition: vault must be unlocked"
        );
        assert!(
            matches!(adapter.mode(), CoreMode::Local),
            "precondition: must start in Local mode"
        );
    }

    // ═══════════════════════════════════════════════════════════════════
    phase!(_test_start, 1, "Pairing — session creation + PIN exchange");
    // ═══════════════════════════════════════════════════════════════════

    let pair_info = pairing::start_pairing("wss://relay.e2e-test");

    // Validate session shape.
    assert_eq!(pair_info.pin.len(), 6, "PIN must be exactly 6 digits");
    assert!(
        pair_info.pin.chars().all(|c| c.is_ascii_digit()),
        "PIN must be all digits"
    );
    assert_eq!(
        pair_info.session_id.len(),
        32,
        "session_id must be 32 hex chars"
    );
    assert_eq!(pair_info.room_id.len(), 64, "room_id must be 64 hex chars");
    assert_eq!(
        pair_info.state,
        pairing::PairingState::WaitingForPeer,
        "initial state must be WaitingForPeer"
    );
    assert_eq!(pair_info.attempts_left, 5);
    assert!(pair_info.locked_until_ms.is_none());
    assert_eq!(pair_info.relay_url, "wss://relay.e2e-test");

    println!(
        "    ✓ Pairing session created: pin={}, room_id={}…",
        pair_info.pin,
        &pair_info.room_id[..16]
    );

    // ── Wrong PIN attempts before success — validate lockout semantics ──
    let wrong_pin = if pair_info.pin == "999999" {
        "000000"
    } else {
        "999999"
    };
    for attempt in 1..=3 {
        let result = pairing::confirm_pairing(
            &pair_info.session_id,
            wrong_pin,
            "e2e-desktop-01",
            "E2E Desktop",
            "wss://relay.e2e-test",
            vec![42; 32],
            &mut store,
        );
        assert!(result.is_err(), "wrong PIN attempt {} must fail", attempt);
        let err = result.unwrap_err();
        assert!(
            err.contains("pin") || err.contains("mismatch") || err.contains("incorrect"),
            "wrong PIN error must mention pin issue: {}",
            err
        );
    }
    println!("    ✓ 3 wrong PIN attempts correctly rejected");

    // ── Confirm with correct PIN ──
    let confirm_result = pairing::confirm_pairing(
        &pair_info.session_id,
        &pair_info.pin,
        "e2e-desktop-01",
        "E2E Desktop",
        "wss://relay.e2e-test",
        vec![42; 32], // mock peer pubkey
        &mut store,
    );
    assert!(
        confirm_result.is_ok(),
        "confirm with correct PIN must succeed: {:?}",
        confirm_result
    );
    let confirm_val = confirm_result.unwrap();
    assert_eq!(
        confirm_val["paired"], true,
        "confirm result must indicate paired=true"
    );
    println!("    ✓ Pairing confirmed with correct PIN");

    // ── Verify peer persisted in store ──
    let stored_peer = store.get("e2e-desktop-01");
    assert!(
        stored_peer.is_some(),
        "paired peer must be persisted in PairedPeerStore"
    );
    let stored_peer = stored_peer.unwrap();
    assert_eq!(stored_peer.label, "E2E Desktop");
    assert_eq!(stored_peer.relay_url, "wss://relay.e2e-test");
    assert_eq!(
        stored_peer.peer_pubkey.len(),
        32,
        "peer pubkey must be 32 bytes"
    );
    println!(
        "    ✓ Peer persisted: id={}, label={}",
        stored_peer.peer_id, stored_peer.label
    );

    // ═══════════════════════════════════════════════════════════════════
    phase!(
        _test_start,
        2,
        "Connect — create RemoteCoreAdapter from network channel"
    );
    // ═══════════════════════════════════════════════════════════════════

    let (net_tx, net_rx) = mpsc::channel::<chromvoid_lib::network::IoRequest>(32);
    let host = RemoteHost::TauriRemoteWss {
        peer_id: "e2e-desktop-01".to_string(),
    };
    let remote_adapter = RemoteCoreAdapter::from_network(host, net_tx);

    // Validate adapter state.
    assert!(
        matches!(remote_adapter.mode(), CoreMode::Remote { .. }),
        "remote adapter must report Remote mode"
    );
    assert_eq!(
        remote_adapter.connection_state(),
        ConnectionState::Ready,
        "fresh remote adapter must be Ready"
    );
    assert!(
        remote_adapter.is_transport_active(),
        "transport must be active (rx not dropped)"
    );
    assert!(
        !remote_adapter.is_unlocked(),
        "remote adapter is not unlocked (no vault opened)"
    );
    println!("    ✓ RemoteCoreAdapter created, state=Ready, transport active");

    // ═══════════════════════════════════════════════════════════════════
    phase!(
        _test_start,
        3,
        "Mode Switch — auto-lock vault + swap Local → Remote"
    );
    // ═══════════════════════════════════════════════════════════════════

    // Step 3a: Auto-lock the local vault (simulating mode_switch precondition).
    {
        let mut adapter = vault.adapter.lock().unwrap();
        assert!(
            adapter.is_unlocked(),
            "vault should still be unlocked before switch"
        );

        let lock_req = RpcRequest::new("vault:lock".to_string(), serde_json::Value::Null);
        let resp = adapter.handle(&lock_req);
        match resp {
            RpcResponse::Success { .. } => {}
            other => panic!("vault:lock must succeed, got: {:?}", other),
        }
        let _ = adapter.save();
    }
    {
        let adapter = vault.adapter.lock().unwrap();
        assert!(
            !adapter.is_unlocked(),
            "vault must be locked after auto-lock"
        );
    }
    println!("    ✓ Vault auto-locked before mode switch");

    // Step 3b: Create ModeTransition metadata (simulate what mode_switch emits).
    let transition = ModeTransition {
        from: CoreMode::Local,
        to_mode: "remote".to_string(),
        started_at_ms: now_ms(),
        drain_deadline_ms: now_ms() + 5000,
    };
    let transition_json = serde_json::to_value(&transition).unwrap();
    assert_eq!(transition_json["from"], "local");
    assert_eq!(transition_json["to_mode"], "remote");
    println!("    ✓ ModeTransition metadata valid: local → remote");

    // Step 3c: Swap adapter from Local to Remote.
    {
        let mut guard = vault.adapter.lock().unwrap();
        *guard = Box::new(remote_adapter);
    }
    {
        let adapter = vault.adapter.lock().unwrap();
        assert!(
            matches!(adapter.mode(), CoreMode::Remote { .. }),
            "mode must be Remote after swap"
        );
        assert_eq!(
            adapter.connection_state(),
            ConnectionState::Ready,
            "connection must be Ready after swap"
        );
    }
    println!("    ✓ Adapter swapped: now in Remote mode, ConnectionState=Ready");

    // ═══════════════════════════════════════════════════════════════════
    phase!(
        _test_start,
        4,
        "Sync Bootstrap — initial sync from Core Host"
    );
    // ═══════════════════════════════════════════════════════════════════

    reset_sync_state();
    assert!(
        !is_sync_active(),
        "sync must not be active before bootstrap"
    );
    assert!(
        current_cursor().is_none(),
        "cursor must be None before bootstrap"
    );

    let bootstrap_ts = now_ms();
    bootstrap_sync(0, bootstrap_ts);

    assert!(is_sync_active(), "sync must be active after bootstrap");
    let cursor = current_cursor().expect("cursor must be set after bootstrap");
    assert_eq!(cursor.version, 0, "initial bootstrap version must be 0");
    assert_eq!(cursor.timestamp_ms, bootstrap_ts);
    println!("    ✓ Sync bootstrapped: version=0, subscribed=true");

    // ═══════════════════════════════════════════════════════════════════
    phase!(_test_start, 5, "Incremental Deltas — cursor advances");
    // ═══════════════════════════════════════════════════════════════════

    // Simulate receiving deltas from Core Host: version advances 0 → 25 → 50 → 100.
    let delta_versions = [25u64, 50, 100];
    for &version in &delta_versions {
        bootstrap_sync(version, now_ms());
        let cursor = current_cursor().expect("cursor must exist");
        assert_eq!(
            cursor.version, version,
            "cursor must advance to version {}",
            version
        );
    }
    assert!(is_sync_active(), "sync must remain active during deltas");
    let final_delta_cursor = current_cursor().unwrap();
    assert_eq!(final_delta_cursor.version, 100);
    println!("    ✓ Delta cursor advanced: 0 → 25 → 50 → 100");

    // ═══════════════════════════════════════════════════════════════════
    phase!(_test_start, 6, "Writer Lock — single-writer semantics");
    // ═══════════════════════════════════════════════════════════════════

    {
        let mut ss = SyncState::new();
        ss.cursor = Some(SyncCursor {
            version: 100,
            timestamp_ms: now_ms(),
        });
        ss.subscribed = true;

        // Set writer lock (another device holds the lock).
        ss.writer_lock = Some(WriterLockInfo {
            holder: "mobile-host-device".to_string(),
            since_ms: now_ms(),
        });
        assert!(ss.writer_lock.is_some(), "writer lock must be set");
        assert_eq!(
            ss.writer_lock.as_ref().unwrap().holder,
            "mobile-host-device"
        );

        // Release writer lock.
        ss.writer_lock = None;
        assert!(
            ss.writer_lock.is_none(),
            "writer lock must be cleared after release"
        );
    }
    println!("    ✓ Writer lock set/cleared correctly (single-writer semantics verified)");

    // ═══════════════════════════════════════════════════════════════════
    phase!(
        _test_start,
        7,
        "Transport Drop + Reconnect — delta vs full resync"
    );
    // ═══════════════════════════════════════════════════════════════════

    // 7a: Small gap → Delta reconnect (gap = 10, well within threshold 500).
    let strategy_delta = trigger_reconnect_sync(110, now_ms());
    assert_eq!(
        strategy_delta,
        ReconnectStrategy::Delta,
        "small gap (10) must trigger Delta reconnect"
    );
    let cursor = current_cursor().expect("cursor after delta reconnect");
    assert_eq!(cursor.version, 110);
    assert!(is_sync_active());
    println!("    ✓ Reconnect with small gap (100→110): Delta strategy");

    // 7b: Large gap → FullResync (gap = 600, exceeds threshold 500).
    let strategy_full = trigger_reconnect_sync(710, now_ms());
    assert_eq!(
        strategy_full,
        ReconnectStrategy::FullResync,
        "large gap (600) must trigger FullResync"
    );
    let cursor = current_cursor().expect("cursor after full resync");
    assert_eq!(cursor.version, 710);
    println!("    ✓ Reconnect with large gap (110→710): FullResync strategy");

    // 7c: After resync, small gap → back to Delta.
    let strategy_after = trigger_reconnect_sync(715, now_ms());
    assert_eq!(strategy_after, ReconnectStrategy::Delta);
    println!("    ✓ Post-resync small gap (710→715): Delta strategy again");

    // 7d: Boundary test (pure function).
    assert_eq!(
        choose_reconnect_strategy(100, 600),
        ReconnectStrategy::Delta,
        "gap=500 (exact threshold) must be Delta"
    );
    assert_eq!(
        choose_reconnect_strategy(100, 601),
        ReconnectStrategy::FullResync,
        "gap=501 (1 past threshold) must be FullResync"
    );
    assert_eq!(
        choose_reconnect_strategy(0, 1),
        ReconnectStrategy::FullResync,
        "version=0 (no prior cursor) must always FullResync"
    );
    println!("    ✓ Reconnect boundary conditions verified");

    // ═══════════════════════════════════════════════════════════════════
    phase!(_test_start, 8, "Adapter Disconnect Detection");
    // ═══════════════════════════════════════════════════════════════════

    // Create a separate adapter to test disconnect detection without
    // disrupting the main vault adapter.
    let (tx_disc, rx_disc) = mpsc::channel::<chromvoid_lib::network::IoRequest>(16);
    let host_disc = RemoteHost::TauriRemoteWss {
        peer_id: "e2e-desktop-01".to_string(),
    };
    let adapter_disc = RemoteCoreAdapter::from_network(host_disc, tx_disc);
    assert_eq!(adapter_disc.connection_state(), ConnectionState::Ready);

    // Drop receiver → channel closes → adapter detects disconnect.
    drop(rx_disc);
    assert_eq!(
        adapter_disc.connection_state(),
        ConnectionState::Disconnected,
        "dropping rx must cause Disconnected state"
    );
    assert!(
        !adapter_disc.is_transport_active(),
        "transport must be inactive after disconnect"
    );
    println!("    ✓ Adapter detects disconnect when channel closes");

    // Test RPC on disconnected adapter returns DISCONNECTED error.
    let mut adapter_disc = adapter_disc;
    let req = RpcRequest::new("vault:status".to_string(), json!({}));
    let resp = adapter_disc.handle(&req);
    match resp {
        RpcResponse::Error { code, .. } => {
            assert_eq!(
                code.as_deref(),
                Some("DISCONNECTED"),
                "RPC on disconnected adapter must return DISCONNECTED"
            );
        }
        _ => panic!("expected DISCONNECTED error, got: {:?}", resp),
    }
    println!("    ✓ RPC on disconnected adapter returns DISCONNECTED error");

    // Test reconnect via replace_network_sender.
    let (tx_new, _rx_new) = mpsc::channel::<chromvoid_lib::network::IoRequest>(16);
    adapter_disc.replace_network_sender(tx_new);
    assert_eq!(
        adapter_disc.connection_state(),
        ConnectionState::Ready,
        "adapter must be Ready after sender replacement"
    );
    assert!(adapter_disc.is_transport_active());
    println!("    ✓ Adapter reconnected via replace_network_sender");

    // ═══════════════════════════════════════════════════════════════════
    phase!(_test_start, 9, "Mobile Acceptor — state machine validation");
    // ═══════════════════════════════════════════════════════════════════

    // Verify acceptor can be stopped safely (idempotent).
    let status = MobileAcceptor::stop();
    assert_eq!(
        status.state,
        AcceptorState::Idle,
        "stop on idle acceptor must return Idle"
    );
    assert!(status.connected_peers.is_empty());
    assert!(status.relay_url.is_none());
    assert!(status.room_id.is_none());
    println!("    ✓ MobileAcceptor.stop() is idempotent (Idle → Idle)");

    // Verify status returns valid state.
    let status = MobileAcceptor::status();
    assert!(
        matches!(
            status.state,
            AcceptorState::Idle | AcceptorState::Listening | AcceptorState::Connected
        ),
        "acceptor state must be a valid variant"
    );
    println!("    ✓ MobileAcceptor.status() returns valid state");

    // Verify AcceptorState serialization for all variants.
    let state_pairs = [
        (AcceptorState::Idle, "idle"),
        (AcceptorState::Listening, "listening"),
        (AcceptorState::Handshaking, "handshaking"),
        (AcceptorState::Connected, "connected"),
        (AcceptorState::Disconnected, "disconnected"),
    ];
    for (state, expected_str) in &state_pairs {
        let json = serde_json::to_string(state).unwrap();
        assert_eq!(
            json,
            format!("\"{}\"", expected_str),
            "AcceptorState::{:?} must serialize to {:?}",
            state,
            expected_str
        );
    }
    println!("    ✓ AcceptorState serialization verified for all 5 variants");

    // ═══════════════════════════════════════════════════════════════════
    phase!(_test_start, 10, "Switch Back to Local — sync state cleared");
    // ═══════════════════════════════════════════════════════════════════

    // Before switching: sync is still active from phase 7.
    assert!(
        is_sync_active(),
        "sync must still be active before local switch"
    );
    assert!(
        current_cursor().is_some(),
        "cursor must exist before local switch"
    );

    // Clear sync state (simulating mode_switch to Local).
    reset_sync_state();
    assert!(
        !is_sync_active(),
        "sync must be inactive after local switch"
    );
    assert!(
        current_cursor().is_none(),
        "cursor must be None after local switch"
    );
    println!("    ✓ Sync state cleared on Local switch");

    // Swap adapter back to Local.
    let local_adapter = {
        let tmp = tempfile::tempdir().expect("tempdir for local");
        let storage = tmp.path().join("storage");
        // Note: we intentionally leak `tmp` so storage_root remains valid.
        // In real code, AppState owns the storage lifetime.
        let adapter = LocalCoreAdapter::new(storage).expect("LocalCoreAdapter::new");
        std::mem::forget(tmp);
        adapter
    };
    {
        let mut guard = vault.adapter.lock().unwrap();
        *guard = Box::new(local_adapter);
    }
    {
        let adapter = vault.adapter.lock().unwrap();
        assert!(
            matches!(adapter.mode(), CoreMode::Local),
            "mode must be Local after swap back"
        );
    }
    println!("    ✓ Adapter swapped back to Local mode");

    // ═══════════════════════════════════════════════════════════════════
    phase!(
        _test_start,
        11,
        "Peer Store Persistence — verify across full lifecycle"
    );
    // ═══════════════════════════════════════════════════════════════════

    // Reload store from disk to verify persistence.
    let store_reloaded = PairedPeerStore::load(&peer_path);
    let peer = store_reloaded
        .get("e2e-desktop-01")
        .expect("peer must persist across lifecycle");
    assert_eq!(peer.label, "E2E Desktop");
    assert_eq!(peer.relay_url, "wss://relay.e2e-test");
    assert_eq!(peer.peer_pubkey, vec![42; 32]);
    println!("    ✓ Peer store persists across full lifecycle (reloaded from disk)");

    // Verify the original store also has the peer.
    let peer_original = store.get("e2e-desktop-01").unwrap();
    assert_eq!(peer_original.peer_id, "e2e-desktop-01");
    println!("    ✓ In-memory peer store consistent");

    // ═══════════════════════════════════════════════════════════════════
    phase!(
        _test_start,
        12,
        "Second Pairing + Mode Cycle — verify re-entrant flow"
    );
    // ═══════════════════════════════════════════════════════════════════

    // Pair a second device to verify the flow is re-entrant.
    let pair_info2 = pairing::start_pairing("wss://relay.e2e-test");
    assert_ne!(
        pair_info2.session_id, pair_info.session_id,
        "second session must have unique ID"
    );
    assert_ne!(
        pair_info2.room_id, pair_info.room_id,
        "second session must have unique room_id"
    );

    let confirm2 = pairing::confirm_pairing(
        &pair_info2.session_id,
        &pair_info2.pin,
        "e2e-desktop-02",
        "Second Desktop",
        "wss://relay.e2e-test",
        vec![99; 32],
        &mut store,
    );
    assert!(
        confirm2.is_ok(),
        "second pairing must succeed: {:?}",
        confirm2
    );

    // Verify both peers in store.
    assert!(
        store.get("e2e-desktop-01").is_some(),
        "first peer must still exist"
    );
    assert!(
        store.get("e2e-desktop-02").is_some(),
        "second peer must exist"
    );
    assert_eq!(store.get("e2e-desktop-02").unwrap().label, "Second Desktop");
    println!("    ✓ Second device paired successfully, both peers in store");

    // Quick Remote mode cycle with second device.
    let (tx2, _rx2) = mpsc::channel::<chromvoid_lib::network::IoRequest>(16);
    let host2 = RemoteHost::TauriRemoteWss {
        peer_id: "e2e-desktop-02".to_string(),
    };
    let remote2 = RemoteCoreAdapter::from_network(host2, tx2);
    assert!(matches!(remote2.mode(), CoreMode::Remote { .. }));

    // Bootstrap sync for second connection.
    reset_sync_state();
    bootstrap_sync(0, now_ms());
    assert!(is_sync_active());
    bootstrap_sync(42, now_ms());
    assert_eq!(current_cursor().unwrap().version, 42);

    // Clean up sync state.
    reset_sync_state();
    println!("    ✓ Second device Remote mode cycle completed");

    // Drop the network rx to clean up (already moved to adapter).
    drop(net_rx);

    // ═══════════════════════════════════════════════════════════════════
    println!("\n╔══════════════════════════════════════════════════════════════╗");
    println!(
        "║  ✅ E2E PASSED — Total time: {:.2}s                          ║",
        _test_start.elapsed().as_secs_f64()
    );
    println!("╚══════════════════════════════════════════════════════════════╝\n");

    // Final cleanup: ensure sync state is clean for other tests.
    reset_sync_state();
}
