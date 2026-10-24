use super::*;
use crate::session::tests::{phase, session};
use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_network_runtime::remote_io::{
    recv_decrypted_frame_typed, send_encrypted_frame_typed,
};
use chromvoid_network_runtime::usb_mobile::pairing::{
    MobileUsbPairingApprovalProof, pairing_approval_proof_hex, recv_pairing_approval_ack,
    recv_pairing_approval_challenge, send_pairing_approval_proof,
};
use chromvoid_network_runtime::usb_mobile::record::UsbRecordTransport;
use chromvoid_protocol::{Frame, FrameType, MAX_HANDSHAKE_MSG, NOISE_PARAMS_IK, NOISE_PARAMS_XX};
use serde_json::{Value, json};
use tempfile::TempDir;
use tokio::io::DuplexStream;

type Cable = UsbRecordTransport<DuplexStream>;
const WAIT: Duration = Duration::from_secs(15);

async fn runtime(root: &TempDir) -> Arc<LocalSession> {
    let runtime = Arc::new(session(root, Arc::new(InMemoryKeystore::new())));
    unlock(&runtime).await;
    runtime
}

async fn unlock(runtime: &LocalSession) {
    // The application's request ids only rise.
    static REQUESTS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
    let id = REQUESTS.fetch_add(1, Ordering::Relaxed);
    let generation = runtime.snapshot().unwrap().generation;
    let response = runtime
        .execute(
            id,
            generation,
            RpcRequest::new("vault:unlock", json!({"password":"synthetic usb host"})),
        )
        .await
        .unwrap();
    assert!(response.is_ok());
}

async fn status(host: &NativeHost, ready: impl Fn(&HostSnapshot) -> bool) -> HostSnapshot {
    tokio::time::timeout(WAIT, async {
        let mut snapshot = host.snapshot().unwrap();
        while !ready(&snapshot) {
            snapshot = host.events(snapshot.sequence).await.unwrap();
        }
        snapshot
    })
    .await
    .expect("the host must reach the requested state")
}

/// Plugs a cable into the phone's session `id` and returns the desktop's end.
fn plug(host: &NativeHost, id: &str) -> Cable {
    let (phone, desktop) = tokio::io::duplex(1 << 17);
    host.start_usb_session(
        id.into(),
        "Synthetic phone".into(),
        Box::new(move || Ok(Box::new(UsbRecordTransport::new(phone)) as Box<dyn RemoteTransport>)),
    )
    .unwrap();
    UsbRecordTransport::new(desktop)
}

async fn ended(host: &NativeHost, id: &str) -> UsbSessionEnd {
    tokio::time::timeout(WAIT, host.usb_session_end(id))
        .await
        .expect("the session must end")
        .unwrap()
}

fn key() -> snow::Keypair {
    snow::Builder::new(NOISE_PARAMS_XX.parse().unwrap())
        .generate_keypair()
        .unwrap()
}

/// The desktop's side, as the desktop's own USB controller speaks it.
struct Desktop {
    cable: Cable,
    noise: NoiseTransport,
    pushes: Vec<String>,
}

impl Desktop {
    /// A desktop the phone does not know: XX, then the hellos. Returns the challenge too.
    async fn introduce(
        mut cable: Cable,
        key: &snow::Keypair,
    ) -> (
        Self,
        MobileUsbPairingHello,
        MobileUsbPairingApprovalChallenge,
    ) {
        let mut handshake = snow::Builder::new(NOISE_PARAMS_XX.parse().unwrap())
            .local_private_key(&key.private)
            .unwrap()
            .build_initiator()
            .unwrap();
        let mut bytes = vec![0; MAX_HANDSHAKE_MSG];
        let count = handshake.write_message(&[], &mut bytes).unwrap();
        cable.send(&bytes[..count]).await.unwrap();
        let second = cable.recv().await.unwrap();
        handshake.read_message(&second, &mut bytes).unwrap();
        let count = handshake.write_message(&[], &mut bytes).unwrap();
        cable.send(&bytes[..count]).await.unwrap();
        let remote = handshake.get_remote_static().unwrap().to_vec();
        let mut noise = NoiseTransport::new(handshake.into_transport_mode().unwrap(), remote);
        send_pairing_hello(
            &mut cable,
            &mut noise,
            &MobileUsbPairingHello {
                peer_id: "synthetic-host:desktop".into(),
                peer_label: "Synthetic desktop".into(),
                peer_pubkey_hex: hex::encode(&key.public),
                platform: "desktop".into(),
                capabilities: vec![USB_PAIRING_CANCEL_V1.into()],
            },
        )
        .await
        .unwrap();
        let phone = recv_pairing_hello(&mut cable, &mut noise).await.unwrap();
        let challenge = recv_pairing_approval_challenge(&mut cable, &mut noise)
            .await
            .unwrap();
        let desktop = Self {
            cable,
            noise,
            pushes: Vec::new(),
        };
        (desktop, phone, challenge)
    }

    async fn prove(
        &mut self,
        key: &snow::Keypair,
        challenge: &MobileUsbPairingApprovalChallenge,
        pin: &str,
    ) -> MobileUsbPairingApprovalAck {
        let proof_hex = pairing_approval_proof_hex(
            pin,
            &challenge.attempt_id,
            &challenge.salt_hex,
            &hex::encode(&key.public),
            &challenge.host_pubkey_hex,
        )
        .unwrap();
        send_pairing_approval_proof(
            &mut self.cable,
            &mut self.noise,
            &MobileUsbPairingApprovalProof {
                attempt_id: challenge.attempt_id.clone(),
                proof_hex,
                action: MobileUsbPairingApprovalAction::Confirm,
            },
        )
        .await
        .unwrap();
        recv_pairing_approval_ack(&mut self.cable, &mut self.noise)
            .await
            .unwrap()
    }

    /// A desktop the phone trusts: IK against the phone's key.
    async fn connect(mut cable: Cable, key: &snow::Keypair, phone_key: &[u8]) -> Self {
        let (handshake, first) = Self::knock(key, phone_key);
        cable.send(&first).await.unwrap();
        Self::answered(cable, handshake, phone_key).await
    }

    /// The first IK message of a trusted desktop.
    fn knock(key: &snow::Keypair, phone_key: &[u8]) -> (snow::HandshakeState, Vec<u8>) {
        let mut handshake = snow::Builder::new(NOISE_PARAMS_IK.parse().unwrap())
            .local_private_key(&key.private)
            .unwrap()
            .remote_public_key(phone_key)
            .unwrap()
            .build_initiator()
            .unwrap();
        let mut bytes = vec![0; MAX_HANDSHAKE_MSG];
        let count = handshake.write_message(&[], &mut bytes).unwrap();
        bytes.truncate(count);
        (handshake, bytes)
    }

    /// The phone's answer to the knock completes IK.
    async fn answered(
        mut cable: Cable,
        mut handshake: snow::HandshakeState,
        phone_key: &[u8],
    ) -> Self {
        let mut bytes = vec![0; MAX_HANDSHAKE_MSG];
        let second = tokio::time::timeout(WAIT, cable.recv())
            .await
            .unwrap()
            .unwrap();
        handshake.read_message(&second, &mut bytes).unwrap();
        Self {
            cable,
            noise: NoiseTransport::new(
                handshake.into_transport_mode().unwrap(),
                phone_key.to_vec(),
            ),
            pushes: Vec::new(),
        }
    }

    async fn rpc(&mut self, id: u64, command: &str, data: Value) -> Value {
        let request = RpcRequest::new(command, data);
        send_encrypted_frame_typed(
            &mut self.cable,
            &mut self.noise,
            Frame {
                frame_type: FrameType::RpcRequest,
                message_id: id,
                flags: 0,
                payload: serde_json::to_vec(&request).unwrap(),
            },
        )
        .await
        .unwrap();
        loop {
            let frame = self.frame().await;
            if frame.frame_type == FrameType::RpcRequest {
                self.remember(&frame);
                continue;
            }
            assert_eq!(frame.message_id, id);
            return serde_json::from_slice(&frame.payload).unwrap();
        }
    }

    /// The next notice the phone pushes.
    async fn push(&mut self) -> String {
        if !self.pushes.is_empty() {
            return self.pushes.remove(0);
        }
        let frame = self.frame().await;
        assert_eq!(
            frame.frame_type,
            FrameType::RpcRequest,
            "a push is a request"
        );
        self.remember(&frame);
        self.pushes.remove(0)
    }

    fn remember(&mut self, frame: &Frame) {
        let request: RpcRequest = serde_json::from_slice(&frame.payload).unwrap();
        self.pushes.push(request.command);
    }

    async fn frame(&mut self) -> Frame {
        tokio::time::timeout(
            WAIT,
            recv_decrypted_frame_typed(&mut self.cable, &mut self.noise),
        )
        .await
        .expect("the phone must answer")
        .unwrap()
    }

    async fn closed(&mut self) {
        let result = tokio::time::timeout(WAIT, self.cable.recv()).await.unwrap();
        assert!(result.is_err(), "the phone closes the link");
    }
}

/// Pairs a new desktop through session `id` and leaves it waiting for the session's approval.
async fn paired(host: &NativeHost, id: &str, key: &snow::Keypair) -> (Desktop, Vec<u8>) {
    let (mut desktop, phone, challenge) = Desktop::introduce(plug(host, id), key).await;
    let asked = status(host, |s| s.usb.pairing.is_some()).await;
    let request = asked.usb.pairing.unwrap();
    assert_eq!(asked.usb.state, UsbLinkState::Pairing);
    assert_eq!(request.desktop, "Synthetic desktop");
    assert_eq!(request.attempt_id, challenge.attempt_id);
    assert!(
        host.resolve_usb_approval(UsbApprovalKind::Pairing, &request.attempt_id, true)
            .unwrap()
    );
    let ack = desktop.prove(key, &challenge, &request.pin).await;
    assert!(ack.accepted, "{ack:?}");
    (desktop, hex::decode(phone.peer_pubkey_hex).unwrap())
}

async fn allow_session(host: &NativeHost) {
    let asked = status(host, |s| s.usb.session.is_some()).await;
    assert_eq!(asked.usb.state, UsbLinkState::AwaitingApproval);
    let request = asked.usb.session.unwrap();
    assert_eq!(request.desktop, "Synthetic desktop");
    assert!(
        host.resolve_usb_approval(UsbApprovalKind::Session, &request.attempt_id, true)
            .unwrap()
    );
}

#[tokio::test]
async fn a_new_desktop_pairs_with_the_pin_and_consent_then_waits_for_the_session_to_be_allowed() {
    let root = TempDir::new().unwrap();
    let runtime = runtime(&root).await;
    let host = NativeHost::new(&runtime).unwrap();
    assert!(host.usb_session_admissible());
    let key = key();
    let (mut desktop, phone, challenge) = Desktop::introduce(plug(&host, "one"), &key).await;
    assert_eq!(phone.platform, "android");
    let request = status(&host, |s| s.usb.pairing.is_some())
        .await
        .usb
        .pairing
        .unwrap();

    // A wrong PIN costs an attempt; nothing is trusted yet.
    let wrong = if request.pin == "000000" {
        "111111"
    } else {
        "000000"
    };
    let ack = desktop.prove(&key, &challenge, wrong).await;
    assert!(!ack.accepted);
    assert_eq!(ack.attempts_left, 4);
    status(&host, |s| {
        s.usb.pairing.as_ref().is_some_and(|p| p.attempts_left == 4)
    })
    .await;

    // The right PIN waits for the person, who may allow it after it was typed.
    let proving = tokio::spawn(async move {
        let ack = desktop.prove(&key, &challenge, &request.pin).await;
        (desktop, ack)
    });
    tokio::time::sleep(Duration::from_millis(200)).await;
    assert!(!proving.is_finished(), "the person has not allowed it yet");
    let attempt = host.snapshot().unwrap().usb.pairing.unwrap().attempt_id;
    assert!(
        host.resolve_usb_approval(UsbApprovalKind::Pairing, &attempt, true)
            .unwrap()
    );
    let (mut desktop, ack) = proving.await.unwrap();
    assert!(ack.accepted, "{ack:?}");
    let trusted = host.trusted_peers().await.unwrap();
    assert_eq!(trusted.len(), 1);
    assert_eq!(
        (trusted[0].label.as_str(), trusted[0].platform.as_str()),
        ("Synthetic desktop", "desktop")
    );

    // Before the session is allowed, the desktop may only ask what the phone is.
    status(&host, |s| s.usb.session.is_some()).await;
    assert_eq!(desktop.rpc(1, "vault:status", json!({})).await["ok"], true);
    let refused = desktop.rpc(2, "catalog:list", json!({"path":"/"})).await;
    assert_eq!(refused["code"], "ERR_USB_MOBILE_SESSION_APPROVAL_REQUIRED");

    allow_session(&host).await;
    assert_eq!(desktop.push().await, "mobile_usb:host_unlock_confirmed");
    assert_eq!(
        status(&host, |s| s.usb.state == UsbLinkState::Connected)
            .await
            .usb
            .desktop
            .as_deref(),
        Some("Synthetic desktop")
    );
    assert_eq!(
        desktop
            .rpc(3, "passmanager:entry:create", json!({"entry_id":"over-usb","title":"Over USB","entry_type":"login","secrets":{"password":"synthetic"}}))
            .await["ok"],
        true
    );

    assert_eq!(
        desktop
            .rpc(4, "mobile_usb:session_disconnect", json!({}))
            .await["ok"],
        true
    );
    desktop.closed().await;
    assert_eq!(ended(&host, "one").await, UsbSessionEnd::ClientDisconnected);
    assert_eq!(host.snapshot().unwrap().usb.state, UsbLinkState::Idle);
}

#[tokio::test]
async fn a_trusted_desktop_reconnects_is_told_the_phone_locked_and_waits_for_the_vault_after() {
    let root = TempDir::new().unwrap();
    let runtime = runtime(&root).await;
    let host = NativeHost::new(&runtime).unwrap();
    let key = key();
    let (mut desktop, phone_key) = paired(&host, "pairing", &key).await;
    assert_eq!(
        desktop
            .rpc(1, "mobile_usb:session_disconnect", json!({}))
            .await["ok"],
        true
    );
    assert_eq!(
        ended(&host, "pairing").await,
        UsbSessionEnd::ClientDisconnected
    );

    // Trusted now: straight to the session question, over IK.
    let mut desktop = Desktop::connect(plug(&host, "open"), &key, &phone_key).await;
    allow_session(&host).await;
    assert_eq!(desktop.push().await, "mobile_usb:host_unlock_confirmed");
    runtime.lock().unwrap();
    assert_eq!(desktop.push().await, "mobile_usb:host_locked");
    desktop.closed().await;
    assert_eq!(ended(&host, "open").await, UsbSessionEnd::VaultLocked);
    phase(&runtime, SessionPhase::Locked).await;

    // Allowed while the vault is locked, the desktop hears once the person opens it.
    let mut desktop = Desktop::connect(plug(&host, "locked"), &key, &phone_key).await;
    allow_session(&host).await;
    status(&host, |s| s.usb.state == UsbLinkState::Connected).await;
    assert_eq!(
        desktop.rpc(1, "vault:status", json!({})).await["result"]["is_unlocked"],
        false
    );
    assert!(desktop.pushes.is_empty(), "nothing to confirm while locked");
    unlock(&runtime).await;
    assert_eq!(desktop.push().await, "mobile_usb:host_unlock_confirmed");

    // The platform ends it when the cable goes.
    host.stop_usb_session("locked", UsbStopReason::AccessoryDetached);
    desktop.closed().await;
    assert_eq!(
        ended(&host, "locked").await,
        UsbSessionEnd::Stopped(UsbStopReason::AccessoryDetached)
    );
}

#[tokio::test]
async fn a_pairing_or_a_session_the_person_refuses_grants_nothing() {
    let root = TempDir::new().unwrap();
    let runtime = runtime(&root).await;
    let host = NativeHost::new(&runtime).unwrap();
    let key = key();

    let (mut desktop, _, challenge) = Desktop::introduce(plug(&host, "refused"), &key).await;
    let request = status(&host, |s| s.usb.pairing.is_some())
        .await
        .usb
        .pairing
        .unwrap();
    assert!(
        !host
            .resolve_usb_approval(UsbApprovalKind::Session, &request.attempt_id, true)
            .unwrap(),
        "a pairing is not a session"
    );
    assert!(
        host.resolve_usb_approval(UsbApprovalKind::Pairing, &request.attempt_id, false)
            .unwrap()
    );
    // Refused before the desktop proved the PIN: the phone answers at once and hangs up.
    let ack = recv_pairing_approval_ack(&mut desktop.cable, &mut desktop.noise)
        .await
        .unwrap();
    assert_eq!(
        (ack.accepted, ack.attempt_id),
        (false, challenge.attempt_id)
    );
    desktop.closed().await;
    assert_eq!(ended(&host, "refused").await, UsbSessionEnd::DataPlaneError);
    assert!(host.trusted_peers().await.unwrap().is_empty());

    let (mut desktop, _) = paired(&host, "denied", &key).await;
    let request = status(&host, |s| s.usb.session.is_some())
        .await
        .usb
        .session
        .unwrap();
    assert!(
        host.resolve_usb_approval(UsbApprovalKind::Session, &request.attempt_id, false)
            .unwrap()
    );
    desktop.closed().await;
    assert_eq!(ended(&host, "denied").await, UsbSessionEnd::DataPlaneError);
}

#[tokio::test]
async fn revoking_the_desktop_ends_its_session_and_a_new_link_replaces_the_old() {
    let root = TempDir::new().unwrap();
    let runtime = runtime(&root).await;
    let host = NativeHost::new(&runtime).unwrap();
    let key = key();
    let (mut desktop, _) = paired(&host, "trusted", &key).await;
    allow_session(&host).await;
    assert_eq!(desktop.push().await, "mobile_usb:host_unlock_confirmed");
    host.revoke_peer("synthetic-host:desktop".into())
        .await
        .unwrap();
    desktop.closed().await;
    assert_eq!(ended(&host, "trusted").await, UsbSessionEnd::PeerClosed);
    assert!(host.trusted_peers().await.unwrap().is_empty());

    let _waiting = plug(&host, "first");
    let _second = plug(&host, "second");
    assert_eq!(
        ended(&host, "first").await,
        UsbSessionEnd::Stopped(UsbStopReason::SessionReplaced)
    );
    host.stop_usb_session("second", UsbStopReason::ExplicitDisconnect);
    assert_eq!(
        ended(&host, "second").await,
        UsbSessionEnd::Stopped(UsbStopReason::ExplicitDisconnect)
    );
}

#[tokio::test]
async fn a_desktop_that_left_without_a_word_reconnects_on_its_first_attempt() {
    let root = TempDir::new().unwrap();
    let runtime = runtime(&root).await;
    let host = NativeHost::new(&runtime).unwrap();
    let key = key();
    // Paired, then the desktop's program ends without a goodbye: a cable cannot tell, and the
    // phone's session keeps reading it.
    let (desktop, phone_key) = paired(&host, "pairing", &key).await;
    let mut cable = desktop.cable;

    // The desktop starts over; its first message reaches the old session, which cannot read it.
    let (handshake, first) = Desktop::knock(&key, &phone_key);
    cable.send(&first).await.unwrap();
    assert_eq!(ended(&host, "pairing").await, UsbSessionEnd::DataPlaneError);

    // The platform starts the next session, which answers that message: no attempt is lost.
    let mut desktop = Desktop::answered(plug(&host, "next"), handshake, &phone_key).await;
    allow_session(&host).await;
    assert_eq!(desktop.push().await, "mobile_usb:host_unlock_confirmed");
}
