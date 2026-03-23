//! PIN-based network pairing protocol.
//!
//! Manages pairing sessions with 6-digit PIN verification,
//! escalating lockout policy (30s → 60s → 120s), and paired peer persistence.
//! Uses Noise XXpsk0 semantics: the PIN is derived into a PSK via SHA-256.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use sha2::{Digest, Sha256};

use super::paired_peers::{PairedPeer, PairedPeerStore};
use super::signaling::SignalingClient;

const MAX_ATTEMPTS: u8 = 5;
const SESSION_TTL_MS: u64 = 5 * 60 * 1000;
const LOCKOUT_DURATIONS_MS: [u64; 3] = [30_000, 60_000, 120_000];

static SESSIONS: Mutex<Option<HashMap<String, NetworkPairingSession>>> = Mutex::new(None);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn sessions_map(
    guard: &mut Option<HashMap<String, NetworkPairingSession>>,
) -> &mut HashMap<String, NetworkPairingSession> {
    guard.get_or_insert_with(HashMap::new)
}

fn generate_session_id() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

fn generate_room_id() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

/// Derive a 32-byte pre-shared key from a PIN string (SHA-256).
/// Mirrors `gateway::handshake::pin_to_psk`.
pub fn pin_to_psk(pin: &str) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(pin.as_bytes());
    let out = h.finalize();
    let mut psk = [0u8; 32];
    psk.copy_from_slice(&out);
    psk
}

pub fn generate_pin() -> String {
    let n = rand::random::<u32>() % 1_000_000;
    format!("{n:06}")
}

// ── State ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub enum PairingState {
    WaitingForPeer,
    PinExchanged,
    NoiseHandshaking,
    Completed,
    Failed,
    LockedOut,
}

// ── Session ──────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
#[allow(dead_code)] // Fields used by future signaling/session-management code
struct NetworkPairingSession {
    session_id: String,
    pin: String,
    state: PairingState,
    psk: [u8; 32],
    peer_pubkey: Option<Vec<u8>>,
    room_id: String,
    relay_url: String,
    created_at_ms: u64,
    session_expires_at_ms: u64,
    attempts_left: u8,
    locked_until_ms: Option<u64>,
    lockout_level: u8,
}

impl NetworkPairingSession {
    fn new(session_id: String, pin: String, room_id: String, relay_url: String) -> Self {
        let now = now_ms();
        let psk = pin_to_psk(&pin);
        Self {
            session_id,
            pin,
            state: PairingState::WaitingForPeer,
            psk,
            peer_pubkey: None,
            room_id,
            relay_url,
            created_at_ms: now,
            session_expires_at_ms: now.saturating_add(SESSION_TTL_MS),
            attempts_left: MAX_ATTEMPTS,
            locked_until_ms: None,
            lockout_level: 0,
        }
    }

    fn is_expired(&self) -> bool {
        now_ms() > self.session_expires_at_ms
    }

    fn is_locked(&self) -> bool {
        self.locked_until_ms
            .map(|until| now_ms() < until)
            .unwrap_or(false)
    }

    /// Record a failed PIN attempt. On exhaustion, applies escalating lockout
    /// and resets attempt counter for the next round.
    fn record_failure(&mut self) {
        if self.attempts_left > 0 {
            self.attempts_left -= 1;
        }
        if self.attempts_left == 0 {
            let idx = (self.lockout_level as usize).min(LOCKOUT_DURATIONS_MS.len() - 1);
            self.locked_until_ms = Some(now_ms().saturating_add(LOCKOUT_DURATIONS_MS[idx]));
            if (self.lockout_level as usize) < LOCKOUT_DURATIONS_MS.len() - 1 {
                self.lockout_level += 1;
            }
            self.state = PairingState::LockedOut;
            // Reset attempts for next round after lockout expires.
            self.attempts_left = MAX_ATTEMPTS;
        }
    }
}

// ── Public API ───────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub struct NetworkPairingInfo {
    pub session_id: String,
    pub pin: String,
    pub room_id: String,
    pub relay_url: String,
    pub state: PairingState,
    pub session_expires_at_ms: u64,
    pub attempts_left: u8,
    pub locked_until_ms: Option<u64>,
}

/// Create a pairing session (sync, no signaling validation).
/// Used by tests and as the core session-creation logic.
pub fn start_pairing(relay_url: &str) -> NetworkPairingInfo {
    let session_id = generate_session_id();
    let pin = generate_pin();
    let room_id = generate_room_id();
    let session =
        NetworkPairingSession::new(session_id.clone(), pin, room_id, relay_url.to_string());
    let info = NetworkPairingInfo {
        session_id: session_id.clone(),
        pin: session.pin.clone(),
        room_id: session.room_id.clone(),
        relay_url: session.relay_url.clone(),
        state: session.state,
        session_expires_at_ms: session.session_expires_at_ms,
        attempts_left: session.attempts_left,
        locked_until_ms: session.locked_until_ms,
    };
    if let Ok(mut guard) = SESSIONS.lock() {
        sessions_map(&mut guard).insert(session_id, session);
    }
    info
}

/// Create a pairing session with signaling room validation.
///
/// Connects to the relay signaling endpoint to verify the room is reachable.
/// On success, drops the signaling client (actual transport happens later).
/// On failure, returns an error and no session is created.
pub async fn start_pairing_with_signaling(relay_url: &str) -> Result<NetworkPairingInfo, String> {
    if relay_url.is_empty() {
        return Err("relay_url is required".to_string());
    }

    let session_id = generate_session_id();
    let pin = generate_pin();
    let room_id = generate_room_id();

    // Validate room connectivity by connecting to signaling.
    // The client is dropped after validation — actual transport is established later.
    let _signaling = SignalingClient::connect(relay_url, &room_id)
        .await
        .map_err(|e| format!("signaling room setup failed: {e}"))?;
    drop(_signaling);

    let session =
        NetworkPairingSession::new(session_id.clone(), pin, room_id, relay_url.to_string());
    let info = NetworkPairingInfo {
        session_id: session_id.clone(),
        pin: session.pin.clone(),
        room_id: session.room_id.clone(),
        relay_url: session.relay_url.clone(),
        state: session.state,
        session_expires_at_ms: session.session_expires_at_ms,
        attempts_left: session.attempts_left,
        locked_until_ms: session.locked_until_ms,
    };
    if let Ok(mut guard) = SESSIONS.lock() {
        sessions_map(&mut guard).insert(session_id, session);
    }
    Ok(info)
}

/// Confirm pairing by verifying PIN and persisting the paired peer.
///
/// On success, derives PSK from PIN via `pin_to_psk`, generates a Noise XXpsk0
/// keypair, and stores a `PairedPeer` record. Transitions through states:
/// `WaitingForPeer → PinExchanged → NoiseHandshaking → Completed`.
pub fn confirm_pairing(
    session_id: &str,
    candidate_pin: &str,
    peer_id: &str,
    label: &str,
    relay_url: &str,
    peer_pubkey: Vec<u8>,
    store: &mut PairedPeerStore,
) -> Result<serde_json::Value, String> {
    let mut guard = SESSIONS
        .lock()
        .map_err(|_| "sessions mutex poisoned".to_string())?;
    let map = sessions_map(&mut guard);
    let session = map
        .get_mut(session_id)
        .ok_or("no active pairing session for this session_id")?;

    if session.is_expired() {
        map.remove(session_id);
        return Err("pairing session expired".to_string());
    }

    // If locked but lockout expired, transition back to WaitingForPeer.
    if session.state == PairingState::LockedOut && !session.is_locked() {
        session.state = PairingState::WaitingForPeer;
    }

    if session.is_locked() {
        return Err(format!(
            "pairing locked until {}",
            session.locked_until_ms.unwrap_or(0)
        ));
    }

    if candidate_pin != session.pin {
        session.record_failure();
        return Err(format!(
            "pin mismatch ({} attempts left)",
            session.attempts_left
        ));
    }

    // PIN correct → PinExchanged
    session.state = PairingState::PinExchanged;

    // Derive PSK and build Noise keypair → NoiseHandshaking
    session.state = PairingState::NoiseHandshaking;
    let psk = &session.psk;

    let params: snow::params::NoiseParams = chromvoid_protocol::NOISE_PARAMS_XXPSK0
        .parse()
        .map_err(|_| "invalid noise params".to_string())?;
    let keypair = snow::Builder::new(params)
        .psk(0, psk)
        .map_err(|e| format!("psk setup: {e}"))?
        .generate_keypair()
        .map_err(|e| format!("keypair gen: {e}"))?;

    session.peer_pubkey = Some(peer_pubkey.clone());

    // Persist paired peer → Completed
    session.state = PairingState::Completed;

    let now_secs = now_ms() / 1000;
    let peer = PairedPeer {
        peer_id: peer_id.to_string(),
        label: label.to_string(),
        relay_url: relay_url.to_string(),
        peer_pubkey,
        client_pubkey: keypair.public.clone(),
        client_privkey_hex: hex::encode(&keypair.private),
        last_seen: now_secs,
        paired_at: now_secs,
    };

    store.upsert(peer);
    store.save().map_err(|e| format!("save: {e}"))?;

    map.remove(session_id);

    Ok(serde_json::json!({
        "paired": true,
        "peer_id": peer_id,
    }))
}

pub fn cancel_pairing(session_id: &str) {
    if let Ok(mut guard) = SESSIONS.lock() {
        if let Some(session) = sessions_map(&mut guard).get_mut(session_id) {
            session.state = PairingState::Failed;
        }
        sessions_map(&mut guard).remove(session_id);
    }
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_RELAY: &str = "wss://relay.test";
    #[test]
    fn start_session_returns_valid_pin_and_session_id() {
        let info = start_pairing(TEST_RELAY);
        assert!(!info.session_id.is_empty(), "session_id must be non-empty");
        assert_eq!(
            info.session_id.len(),
            32,
            "session_id should be 32 hex chars"
        );
        assert_eq!(info.pin.len(), 6, "PIN must be 6 digits");
        assert!(
            info.pin.chars().all(|c| c.is_ascii_digit()),
            "PIN must be all digits: {}",
            info.pin
        );
        assert_eq!(info.state, PairingState::WaitingForPeer);
        assert!(!info.room_id.is_empty(), "room_id must be non-empty");
        assert_eq!(info.room_id.len(), 64, "room_id should be 64 hex chars");
        assert_eq!(info.relay_url, TEST_RELAY);
        assert_eq!(info.attempts_left, MAX_ATTEMPTS);
        assert!(info.locked_until_ms.is_none());
        assert!(info.session_expires_at_ms > now_ms());

        cancel_pairing(&info.session_id);
    }

    #[test]
    fn lockout_after_failed_attempts_with_escalation() {
        let mut session = NetworkPairingSession::new(
            "test-lockout".to_string(),
            "123456".to_string(),
            "room-lockout".to_string(),
            TEST_RELAY.to_string(),
        );
        assert_eq!(session.attempts_left, 5);
        assert_eq!(session.state, PairingState::WaitingForPeer);

        // Round 1: exhaust 5 attempts → 30s lockout
        for _ in 0..4 {
            session.record_failure();
        }
        assert_eq!(session.attempts_left, 1);
        assert!(session.locked_until_ms.is_none());

        let before = now_ms();
        session.record_failure(); // 5th fail
        assert_eq!(
            session.attempts_left, MAX_ATTEMPTS,
            "should reset after lockout"
        );
        let delta1 = session.locked_until_ms.unwrap().saturating_sub(before);
        assert!(
            (29_000..=31_000).contains(&delta1),
            "round 1: expected ~30s lockout, got {delta1}ms"
        );
        assert_eq!(session.lockout_level, 1);
        assert!(session.is_locked());
        assert_eq!(session.state, PairingState::LockedOut);
        // Round 2: 5 more failures → 60s lockout
        for _ in 0..5 {
            session.record_failure();
        }
        let before2 = now_ms();
        let delta2 = session.locked_until_ms.unwrap().saturating_sub(before2);
        assert!(
            (58_000..=62_000).contains(&delta2),
            "round 2: expected ~60s lockout, got {delta2}ms"
        );
        assert_eq!(session.lockout_level, 2);

        // Round 3: 5 more → 120s lockout (cap)
        for _ in 0..5 {
            session.record_failure();
        }
        let before3 = now_ms();
        let delta3 = session.locked_until_ms.unwrap().saturating_sub(before3);
        assert!(
            (118_000..=122_000).contains(&delta3),
            "round 3: expected ~120s lockout, got {delta3}ms"
        );
        assert_eq!(session.lockout_level, 2);

        // Round 4: still at 120s (no further escalation)
        for _ in 0..5 {
            session.record_failure();
        }
        let before4 = now_ms();
        let delta4 = session.locked_until_ms.unwrap().saturating_sub(before4);
        assert!(
            (118_000..=122_000).contains(&delta4),
            "round 4: expected ~120s lockout (cap), got {delta4}ms"
        );
    }

    #[test]
    fn confirm_requires_matching_session_id() {
        let info = start_pairing(TEST_RELAY);
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("paired_network_peers.json");
        let mut store = PairedPeerStore::load(&path);

        let result = confirm_pairing(
            "nonexistent_session_id",
            &info.pin,
            "peer-1",
            "Phone",
            "wss://relay.test",
            vec![1, 2, 3],
            &mut store,
        );
        assert!(result.is_err());
        assert!(
            result.unwrap_err().contains("no active pairing session"),
            "wrong session_id should be rejected"
        );

        cancel_pairing(&info.session_id);
    }

    #[test]
    fn cancel_removes_specific_session() {
        let info1 = start_pairing(TEST_RELAY);
        let info2 = start_pairing(TEST_RELAY);

        cancel_pairing(&info1.session_id);

        {
            let guard = SESSIONS.lock().unwrap();
            let map = guard.as_ref().unwrap();
            assert!(
                !map.contains_key(&info1.session_id),
                "session1 should be gone"
            );
            assert!(
                map.contains_key(&info2.session_id),
                "session2 should remain"
            );
        }

        cancel_pairing(&info2.session_id);
    }

    #[test]
    fn success_stores_paired_peer() {
        let info = start_pairing(TEST_RELAY);
        let pin = info.pin.clone();
        let sid = info.session_id.clone();

        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("paired_network_peers.json");
        let mut store = PairedPeerStore::load(&path);

        let peer_pubkey = vec![10, 20, 30, 40];
        let result = confirm_pairing(
            &sid,
            &pin,
            "net-peer-1",
            "My Phone",
            "wss://relay.example.com",
            peer_pubkey.clone(),
            &mut store,
        );
        assert!(result.is_ok(), "confirm failed: {:?}", result.err());

        // Reload from disk and verify persistence.
        let store = PairedPeerStore::load(&path);
        assert!(store.is_paired("net-peer-1"));
        let peer = store.get("net-peer-1").unwrap();
        assert_eq!(peer.label, "My Phone");
        assert_eq!(peer.relay_url, "wss://relay.example.com");
        assert_eq!(peer.peer_pubkey, peer_pubkey);
        assert!(
            !peer.client_pubkey.is_empty(),
            "client_pubkey should be set"
        );
        assert!(
            !peer.client_privkey_hex.is_empty(),
            "client_privkey_hex should be set"
        );

        // Session should be removed after success
        {
            let guard = SESSIONS.lock().unwrap();
            let map = guard.as_ref().unwrap();
            assert!(
                !map.contains_key(&sid),
                "session should be removed after confirm"
            );
        }
    }

    #[test]
    fn state_transitions_on_confirm() {
        let info = start_pairing(TEST_RELAY);
        let pin = info.pin.clone();
        let sid = info.session_id.clone();

        // Verify initial state is WaitingForPeer
        {
            let guard = SESSIONS.lock().unwrap();
            let map = guard.as_ref().unwrap();
            let session = map.get(&sid).unwrap();
            assert_eq!(session.state, PairingState::WaitingForPeer);
            // PSK should be derived from pin
            assert_eq!(session.psk, pin_to_psk(&pin));
            assert!(session.peer_pubkey.is_none());
            assert!(!session.room_id.is_empty());
            assert!(session.created_at_ms > 0);
        }

        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("paired_network_peers.json");
        let mut store = PairedPeerStore::load(&path);

        // Wrong PIN should not change state (unless lockout)
        let _ = confirm_pairing(&sid, "000000", "p1", "L", "wss://r", vec![1], &mut store);
        {
            let guard = SESSIONS.lock().unwrap();
            let map = guard.as_ref().unwrap();
            let session = map.get(&sid).unwrap();
            // Still WaitingForPeer (not locked out yet, only 1 failure)
            assert_eq!(session.state, PairingState::WaitingForPeer);
            assert_eq!(session.attempts_left, MAX_ATTEMPTS - 1);
        }

        // Correct PIN → session removed (Completed then removed)
        let result = confirm_pairing(
            &sid,
            &pin,
            "p1",
            "Label",
            "wss://relay",
            vec![10, 20],
            &mut store,
        );
        assert!(result.is_ok());

        // Session should be gone after successful confirm
        {
            let guard = SESSIONS.lock().unwrap();
            let map = guard.as_ref().unwrap();
            assert!(!map.contains_key(&sid));
        }
    }

    #[test]
    fn lockout_state_transitions() {
        let mut session = NetworkPairingSession::new(
            "test-lockout-state".to_string(),
            "999999".to_string(),
            "room-lockout-state".to_string(),
            TEST_RELAY.to_string(),
        );
        assert_eq!(session.state, PairingState::WaitingForPeer);

        // Exhaust attempts → LockedOut
        for _ in 0..5 {
            session.record_failure();
        }
        assert_eq!(session.state, PairingState::LockedOut);
        assert!(session.is_locked());

        // Simulate lockout expiry by clearing locked_until_ms
        session.locked_until_ms = Some(0);
        assert!(!session.is_locked(), "lockout should have expired");
        // State is still LockedOut until confirm_pairing transitions it back
        assert_eq!(session.state, PairingState::LockedOut);
    }

    #[test]
    fn start_pairing_stores_relay_url_in_session() {
        let info = start_pairing("wss://custom-relay.example.com");
        assert_eq!(info.relay_url, "wss://custom-relay.example.com");

        // Verify relay_url is stored in the session itself
        {
            let guard = SESSIONS.lock().unwrap();
            let map = guard.as_ref().unwrap();
            let session = map.get(&info.session_id).unwrap();
            assert_eq!(session.relay_url, "wss://custom-relay.example.com");
        }

        cancel_pairing(&info.session_id);
    }
}
