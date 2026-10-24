use super::*;
#[path = "test_relay.rs"]
mod relay_fixture;
use crate::session::tests::{phase, session};
use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_network_runtime::ios_control::{fetch_host_presence, fetch_pairing_session};
use chromvoid_network_runtime::pairing_transport::{
    PairingHello, pin_to_psk, recv_pairing_hello, send_pairing_hello, xxpsk0_initiator,
};
use chromvoid_network_runtime::remote_io::{
    recv_decrypted_frame_typed, send_encrypted_frame_typed,
};
use chromvoid_network_runtime::wss_transport::WssTransport;
use chromvoid_protocol::{
    Frame, FrameType, MAX_HANDSHAKE_MSG, NOISE_PARAMS_IK, NOISE_PARAMS_XX, NoiseTransport,
    RemoteTransport,
};
use relay_fixture::Relay;
use serde_json::{Value, json};
use std::time::Duration;
use tempfile::TempDir;

async fn runtime(root: &TempDir) -> Arc<LocalSession> {
    let runtime = Arc::new(session(root, Arc::new(InMemoryKeystore::new())));
    assert!(
        runtime
            .execute(
                1,
                1,
                RpcRequest::new(
                    "vault:unlock",
                    json!({"password":"synthetic host controller"})
                )
            )
            .await
            .unwrap()
            .is_ok()
    );
    runtime
}
async fn status(host: &NativeHost, ready: impl Fn(&HostSnapshot) -> bool) -> HostSnapshot {
    tokio::time::timeout(Duration::from_secs(15), async {
        let mut snapshot = host.snapshot().unwrap();
        while !ready(&snapshot) {
            snapshot = host.events(snapshot.sequence).await.unwrap();
        }
        snapshot
    })
    .await
    .expect("host must reach the requested state")
}
fn key() -> snow::Keypair {
    snow::Builder::new(NOISE_PARAMS_XX.parse().unwrap())
        .generate_keypair()
        .unwrap()
}

async fn pair(host: &NativeHost, relay: &Relay, key: &snow::Keypair) -> PairingHello {
    host.start_pairing(1, relay.url.clone(), "Synthetic phone".into())
        .unwrap();
    let offered = status(host, |s| s.host.pairing_pin.is_some()).await;
    let offer = offered.host.pairing_offer.unwrap();
    let session = fetch_pairing_session(&offer.relay_base_url, &offer.session_id)
        .await
        .unwrap();
    let mut transport = WssTransport::connect(&session.relay_url, &session.room_id)
        .await
        .unwrap();
    let mut noise = xxpsk0_initiator(
        &mut transport,
        &key.private,
        &pin_to_psk(&offered.host.pairing_pin.unwrap()),
    )
    .await
    .unwrap();
    send_pairing_hello(
        &mut transport,
        &mut noise,
        &PairingHello {
            peer_id: "synthetic-desktop".into(),
            peer_label: "Desktop".into(),
            peer_pubkey_hex: hex::encode(&key.public),
            platform: "desktop".into(),
        },
    )
    .await
    .unwrap();
    let hello = recv_pairing_hello(&mut transport, &mut noise)
        .await
        .unwrap();
    assert_eq!(
        hex::decode(&hello.peer_pubkey_hex).unwrap(),
        noise.remote_pubkey()
    );
    status(host, |s| matches!(s.host.phase, IosHostPhase::Ready)).await;
    let _ = transport.close().await;
    hello
}

struct Desktop {
    transport: WssTransport,
    noise: NoiseTransport,
}
impl Desktop {
    async fn connect(relay: &Relay, host: &PairingHello, key: &snow::Keypair) -> Self {
        let presence = fetch_host_presence(&relay.url, &host.peer_id)
            .await
            .unwrap();
        assert_eq!(presence.status, "ready");
        let mut transport = WssTransport::connect(&relay.url, &presence.room_id)
            .await
            .unwrap();
        let host_key = hex::decode(&host.peer_pubkey_hex).unwrap();
        let mut handshake = snow::Builder::new(NOISE_PARAMS_IK.parse().unwrap())
            .local_private_key(&key.private)
            .unwrap()
            .remote_public_key(&host_key)
            .unwrap()
            .build_initiator()
            .unwrap();
        let mut bytes = vec![0; MAX_HANDSHAKE_MSG];
        let count = handshake.write_message(&[], &mut bytes).unwrap();
        transport.send(&bytes[..count]).await.unwrap();
        let second = tokio::time::timeout(Duration::from_secs(5), transport.recv())
            .await
            .unwrap()
            .unwrap();
        handshake.read_message(&second, &mut bytes).unwrap();
        Self {
            transport,
            noise: NoiseTransport::new(handshake.into_transport_mode().unwrap(), host_key),
        }
    }
    async fn rpc(&mut self, id: u64, command: &str, data: Value) -> Value {
        let request = RpcRequest::new(command, data);
        send_encrypted_frame_typed(
            &mut self.transport,
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
        tokio::time::timeout(Duration::from_secs(10), async {
            loop {
                let frame = recv_decrypted_frame_typed(&mut self.transport, &mut self.noise)
                    .await
                    .unwrap();
                if frame.frame_type == FrameType::Heartbeat {
                    continue;
                }
                assert_eq!(frame.message_id, id);
                return serde_json::from_slice(&frame.payload).unwrap();
            }
        })
        .await
        .unwrap()
    }
    async fn closed(&mut self) {
        assert!(
            tokio::time::timeout(Duration::from_secs(5), self.transport.recv())
                .await
                .unwrap()
                .is_err()
        );
    }
}

#[tokio::test]
async fn pairing_real_relay_and_trusted_ik_connection_share_native_core_and_revoke_access() {
    let root = TempDir::new().unwrap();
    let runtime = runtime(&root).await;
    let relay = Relay::new().await;
    let host = NativeHost::new(&runtime).unwrap();
    let key = key();
    let hello = pair(&host, &relay, &key).await;
    let peers = host.trusted_peers().await.unwrap();
    assert_eq!(peers.len(), 1);
    assert_eq!(peers[0].peer_id, "synthetic-desktop");
    let file =
        std::fs::read_to_string(root.path().join("storage/paired_network_peers.json")).unwrap();
    assert!(file.contains("chromvoid.paired_store"));
    assert!(!file.contains("synthetic-desktop"));
    assert!(!file.contains("client_privkey_hex"));
    let mut desktop = Desktop::connect(&relay, &hello, &key).await;
    assert_eq!(
        desktop.rpc(1, "vault:status", json!({})).await["result"]["is_unlocked"],
        true
    );
    assert_eq!(desktop.rpc(2,"passmanager:entry:create",json!({"entry_id":"from-desktop","title":"Shared Core","username":"synthetic","entry_type":"login","secrets":{"password":"synthetic"}})).await["ok"],true);
    let local = runtime
        .execute(2, 1, RpcRequest::new("passmanager:entry:list", json!({})))
        .await
        .unwrap();
    assert_eq!(
        local.result().unwrap()["entries"][0]["title"],
        "Shared Core"
    );
    host.revoke_peer("synthetic-desktop".into()).await.unwrap();
    desktop.closed().await;
    assert!(host.trusted_peers().await.unwrap().is_empty());
    assert_eq!(runtime.snapshot().unwrap().phase, SessionPhase::Unlocked);
    assert!(host.snapshot().unwrap().acceptor.connected_peers.is_empty());
    host.stop().unwrap();
}

#[tokio::test]
async fn construction_is_idle_and_corrupt_identity_is_preserved() {
    let root = TempDir::new().unwrap();
    let runtime = runtime(&root).await;
    let relay = Relay::new().await;
    let cloned = runtime.clone();
    let host = std::thread::spawn(move || NativeHost::new(&cloned).unwrap())
        .join()
        .unwrap();
    assert!(matches!(
        host.snapshot().unwrap().host.phase,
        IosHostPhase::Idle
    ));
    assert_eq!(relay.control.lock().unwrap().requests, 0);
    assert!(
        !root
            .path()
            .join("storage/network_local_identity.json")
            .exists()
    );
    for url in [
        "http://relay.test",
        "ws://relay.test",
        "wss://user:password@relay.test",
        "wss://relay.test/path",
    ] {
        assert!(host.start_pairing(1, url.into(), "Phone".into()).is_err());
    }
    let identity = root.path().join("storage/network_local_identity.json");
    std::fs::write(&identity, b"broken identity").unwrap();
    host.start_pairing(1, relay.url.clone(), "Phone".into())
        .unwrap();
    status(&host, |s| matches!(s.host.phase, IosHostPhase::Error)).await;
    assert_eq!(std::fs::read(identity).unwrap(), b"broken identity");
    assert_eq!(relay.control.lock().unwrap().requests, 0);
}

#[tokio::test]
async fn waiting_pairing_expiry_is_typed_and_restart_clears_the_failure() {
    use chromvoid_network_runtime::ios_host::IosHostErrorKind;

    let root = TempDir::new().unwrap();
    let runtime = runtime(&root).await;
    let relay = Relay::new().await;
    relay.control.lock().unwrap().pairing_lifetime_ms = Some(1_000);
    let host = NativeHost::new(&runtime).unwrap();
    host.start_pairing(1, relay.url.clone(), "Phone".into())
        .unwrap();
    let failed = status(&host, |s| matches!(s.host.phase, IosHostPhase::Error)).await;
    assert_eq!(
        failed.host.error_kind,
        Some(IosHostErrorKind::PairingExpired)
    );
    assert!(failed.host.pairing_pin.is_none());
    assert!(failed.host.pairing_offer.is_none());
    assert!(host.trusted_peers().await.unwrap().is_empty());
    relay.control.lock().unwrap().pairing_lifetime_ms = None;
    host.start_pairing(1, relay.url.clone(), "Phone".into())
        .unwrap();
    let restarted = status(&host, |s| s.host.pairing_pin.is_some()).await;
    assert_eq!(restarted.host.phase, IosHostPhase::Pairing);
    assert!(restarted.host.error_kind.is_none());
    host.stop().unwrap();
}

#[tokio::test]
async fn expired_offer_and_wrong_pin_never_persist_trust() {
    for expired in [true, false] {
        let root = TempDir::new().unwrap();
        let runtime = runtime(&root).await;
        let relay = Relay::new().await;
        relay.control.lock().unwrap().expired = expired;
        let host = NativeHost::new(&runtime).unwrap();
        host.start_pairing(1, relay.url.clone(), "Phone".into())
            .unwrap();
        if !expired {
            let offered = status(&host, |s| s.host.pairing_pin.is_some()).await;
            let offer = offered.host.pairing_offer.unwrap();
            let session = fetch_pairing_session(&relay.url, &offer.session_id)
                .await
                .unwrap();
            let mut transport = WssTransport::connect(&relay.url, &session.room_id)
                .await
                .unwrap();
            let key = key();
            assert!(
                xxpsk0_initiator(&mut transport, &key.private, &pin_to_psk("wrong-pin"))
                    .await
                    .is_err()
            );
        }
        let failed = status(&host, |s| matches!(s.host.phase, IosHostPhase::Error)).await;
        assert_eq!(
            failed.host.error_kind,
            expired.then_some(IosHostErrorKind::PairingExpired)
        );
        assert!(failed.host.pairing_pin.is_none());
        assert!(host.trusted_peers().await.unwrap().is_empty());
        assert!(
            !root
                .path()
                .join("storage/paired_network_peers.json")
                .exists()
        );
    }
}

#[tokio::test]
async fn background_and_explicit_stop_cancel_pairing_while_waiting_for_a_peer() {
    for background in [true, false] {
        let root = TempDir::new().unwrap();
        let runtime = runtime(&root).await;
        let relay = Relay::new().await;
        let host = NativeHost::new(&runtime).unwrap();
        host.start_pairing(1, relay.url.clone(), "Phone".into())
            .unwrap();
        status(&host, |s| s.host.pairing_pin.is_some()).await;
        if background {
            runtime.deactivate().unwrap();
            phase(&runtime, SessionPhase::Inactive).await;
        } else {
            host.stop().unwrap();
        }
        let stopped = status(&host, |s| matches!(s.host.phase, IosHostPhase::Idle)).await;
        assert!(stopped.host.pairing_pin.is_none());
        assert!(host.trusted_peers().await.unwrap().is_empty());
    }
}

#[tokio::test]
async fn background_and_controller_drop_close_connected_peers() {
    for background in [true, false] {
        let root = TempDir::new().unwrap();
        let runtime = runtime(&root).await;
        let relay = Relay::new().await;
        let host = NativeHost::new(&runtime).unwrap();
        let key = key();
        let hello = pair(&host, &relay, &key).await;
        let mut desktop = Desktop::connect(&relay, &hello, &key).await;
        assert_eq!(desktop.rpc(1, "vault:status", json!({})).await["ok"], true);
        if background {
            runtime.deactivate().unwrap();
            phase(&runtime, SessionPhase::Inactive).await;
        } else {
            drop(host);
        }
        desktop.closed().await;
    }
}

#[tokio::test]
async fn foreground_resume_reuses_trust_while_explicit_stop_clears_enabled_intent() {
    let root = TempDir::new().unwrap();
    let runtime = runtime(&root).await;
    let relay = Relay::new().await;
    let host = NativeHost::new(&runtime).unwrap();
    let key = key();
    let hello = pair(&host, &relay, &key).await;
    assert!(host.configuration().await.unwrap().enabled);
    runtime.deactivate().unwrap();
    phase(&runtime, SessionPhase::Inactive).await;
    status(&host, |s| matches!(s.host.phase, IosHostPhase::Idle)).await;
    assert!(host.configuration().await.unwrap().enabled);
    runtime.activate().unwrap();
    phase(&runtime, SessionPhase::Locked).await;
    let generation = runtime.snapshot().unwrap().generation;
    host.resume_if_enabled(generation, "Phone".into())
        .await
        .unwrap();
    let resumed = status(&host, |s| matches!(s.host.phase, IosHostPhase::Ready)).await;
    assert_eq!(
        resumed.host.device_id.as_deref(),
        Some(hello.peer_id.as_str())
    );
    assert!(resumed.host.pairing_pin.is_none());
    let mut desktop = Desktop::connect(&relay, &hello, &key).await;
    assert_eq!(
        desktop.rpc(1, "vault:status", json!({})).await["result"]["is_unlocked"],
        false
    );
    host.stop().unwrap();
    // A subsequent scene event must not supersede persistence of the explicit stop.
    runtime.deactivate().unwrap();
    host.suspend().unwrap();
    desktop.closed().await;
    tokio::time::timeout(Duration::from_secs(5), async {
        while host.configuration().await.unwrap().enabled {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    assert_eq!(host.trusted_peers().await.unwrap().len(), 1);
    runtime.activate().unwrap();
    phase(&runtime, SessionPhase::Locked).await;
    let stopped = host
        .resume_if_enabled(runtime.snapshot().unwrap().generation, "Phone".into())
        .await
        .unwrap();
    assert!(matches!(stopped.host.phase, IosHostPhase::Idle));
}

#[tokio::test]
async fn foreground_with_no_enabled_preference_does_not_create_an_identity_or_listener() {
    let root = TempDir::new().unwrap();
    let runtime = runtime(&root).await;
    let host = NativeHost::new(&runtime).unwrap();
    let generation = runtime.snapshot().unwrap().generation;
    let resumed = host
        .resume_if_enabled(generation, "Phone".into())
        .await
        .unwrap();
    assert!(matches!(resumed.host.phase, IosHostPhase::Idle));
    assert!(!root.path().join("network_local_identity.json").exists());
    assert!(!host.configuration().await.unwrap().enabled);
    runtime.deactivate().unwrap();
    assert!(matches!(
        host.resume_if_enabled(generation, "Phone".into()).await,
        Err(StartHostError::SessionRevoked)
    ));
}

#[tokio::test]
async fn explicit_stop_is_saved_even_if_controller_is_immediately_dropped() {
    let root = TempDir::new().unwrap();
    let runtime = runtime(&root).await;
    let relay = Relay::new().await;
    let host = NativeHost::new(&runtime).unwrap();
    pair(&host, &relay, &key()).await;
    assert!(host.configuration().await.unwrap().enabled);
    host.stop().unwrap();
    // A queued offline request or controller shutdown cannot discard the user's Stop.
    drop(host);
    let reopened = NativeHost::new(&runtime).unwrap();
    tokio::time::timeout(Duration::from_secs(5), async {
        while reopened.configuration().await.unwrap().enabled {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    assert!(matches!(
        reopened
            .resume_if_enabled(runtime.snapshot().unwrap().generation, "Phone".into())
            .await
            .unwrap()
            .host
            .phase,
        IosHostPhase::Idle
    ));
}

#[tokio::test]
async fn delayed_offline_cannot_overwrite_foreground_ready_presence() {
    let root = TempDir::new().unwrap();
    let runtime = runtime(&root).await;
    let relay = Relay::new().await;
    let host = NativeHost::new(&runtime).unwrap();
    let key = key();
    let hello = pair(&host, &relay, &key).await;
    let held = relay.hold_presence("offline");
    runtime.deactivate().unwrap();
    phase(&runtime, SessionPhase::Inactive).await;
    tokio::time::timeout(Duration::from_secs(5), held.received)
        .await
        .unwrap()
        .unwrap();
    runtime.activate().unwrap();
    phase(&runtime, SessionPhase::Locked).await;
    host.resume_if_enabled(runtime.snapshot().unwrap().generation, "Phone".into())
        .await
        .unwrap();
    // Let a competing ready publication finish if the host permits one. A serialized
    // publisher correctly keeps the new listener preparing until offline is acknowledged.
    let _ = tokio::time::timeout(
        Duration::from_millis(250),
        status(&host, |s| matches!(s.host.phase, IosHostPhase::Ready)),
    )
    .await;
    held.release.send(()).unwrap();
    held.applied.await.unwrap();
    let ready = status(&host, |s| matches!(s.host.phase, IosHostPhase::Ready)).await;
    let advertised = fetch_host_presence(&relay.url, &hello.peer_id)
        .await
        .unwrap();
    assert_eq!(advertised.status, "ready");
    assert_eq!(advertised.room_id, ready.host.presence.unwrap().room_id);
    let mut desktop = Desktop::connect(&relay, &hello, &key).await;
    assert_eq!(
        desktop.rpc(1, "vault:status", json!({})).await["result"]["is_unlocked"],
        false
    );
    host.stop().unwrap();
}

#[tokio::test]
async fn stop_retires_a_ready_publication_even_before_its_response_arrives() {
    let root = TempDir::new().unwrap();
    let runtime = runtime(&root).await;
    let relay = Relay::new().await;
    let host = NativeHost::new(&runtime).unwrap();
    pair(&host, &relay, &key()).await;
    let held = relay.hold_presence("ready");
    host.start_listening(1, relay.url.clone(), "Phone".into())
        .unwrap();
    tokio::time::timeout(Duration::from_secs(5), held.received)
        .await
        .unwrap()
        .unwrap();
    assert!(host.snapshot().unwrap().host.presence.is_none());
    let stopped = host.stop().unwrap();
    assert!(matches!(stopped.host.phase, IosHostPhase::Idle));
    held.release.send(()).unwrap();
    held.applied.await.unwrap();
    tokio::time::timeout(Duration::from_secs(3), async {
        loop {
            let offline = relay
                .control
                .lock()
                .unwrap()
                .presence
                .as_ref()
                .is_some_and(|value| value["status"] == "offline");
            if offline {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("Stop must retire an in-flight ready publication");
    assert!(matches!(
        host.snapshot().unwrap().host.phase,
        IosHostPhase::Idle
    ));
    assert_eq!(runtime.snapshot().unwrap().phase, SessionPhase::Unlocked);
}

#[tokio::test]
async fn authenticated_erase_disconnects_peers_removes_host_history_and_retires_old_controllers() {
    use crate::session::storage_erase::EraseReceipt;
    let root = TempDir::new().unwrap();
    let runtime = runtime(&root).await;
    assert!(
        runtime
            .execute(
                2,
                1,
                RpcRequest::new(
                    "master:setup",
                    json!({"master_password":"synthetic erase administrator"})
                )
            )
            .await
            .unwrap()
            .is_ok()
    );
    let relay = Relay::new().await;
    let host = NativeHost::new(&runtime).unwrap();
    let key = key();
    let hello = pair(&host, &relay, &key).await;
    let mut desktop = Desktop::connect(&relay, &hello, &key).await;
    assert_eq!(
        desktop.rpc(1, "vault:status", json!({})).await["result"]["is_unlocked"],
        true
    );
    // Saving through the real owner creates its timestamped historical backup.
    {
        let _gate = host.inner.gate.lock().unwrap();
        host.inner.storage.peers().unwrap().save().unwrap();
    }
    let storage = root.path().join("storage");
    assert!(std::fs::read_dir(&storage).unwrap().any(|entry| {
        entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("paired_network_peers.json.bak.")
    }));
    std::fs::write(
        storage.join(".chromvoid-write-interrupted.tmp"),
        b"synthetic interrupted metadata",
    )
    .unwrap();
    std::fs::write(storage.join("unrelated-marker"), b"preserved").unwrap();
    let handle = runtime.begin_storage_erase(1).unwrap();
    let review = runtime.review_storage_erase(3, &handle).unwrap();
    assert!(runtime.execute_admitted(review).await.unwrap().is_ok());
    let denied = runtime
        .commit_storage_erase(4, &handle, "wrong".into())
        .unwrap();
    assert_eq!(
        runtime.execute_admitted(denied).await.unwrap().code(),
        Some("INVALID_MASTER_PASSWORD")
    );
    assert_eq!(host.trusted_peers().await.unwrap().len(), 1);
    assert!(storage.join("network_local_identity.json").exists());
    let erase = runtime
        .commit_storage_erase(5, &handle, "synthetic erase administrator".into())
        .unwrap();
    assert_eq!(
        runtime.execute_admitted(erase).await.unwrap_err(),
        super::super::SessionError::Revoked
    );
    assert!(matches!(
        handle.receipt().unwrap(),
        Some(EraseReceipt::Completed(_))
    ));
    desktop.closed().await;
    assert!(host.trusted_peers().await.is_err());
    assert!(host.configuration().await.is_err());
    assert!(host.revoke_peer("synthetic-desktop".into()).await.is_err());
    assert!(host.stop().is_err());
    assert!(
        host.start_pairing(
            runtime.snapshot().unwrap().generation,
            relay.url.clone(),
            "Stale controller".into()
        )
        .is_err()
    );
    for entry in std::fs::read_dir(&storage).unwrap() {
        let name = entry.unwrap().file_name();
        let name = name.to_string_lossy();
        assert!(!name.starts_with("paired_network_peers.json"));
        assert!(!name.starts_with(".chromvoid-write-"));
        assert_ne!(name, "network_local_identity.json");
        assert_ne!(name, "ios_host_mode.json");
    }
    assert_eq!(
        std::fs::read(storage.join("unrelated-marker")).unwrap(),
        b"preserved"
    );
    let generation = runtime.snapshot().unwrap().generation;
    assert!(
        runtime
            .execute(
                6,
                generation,
                RpcRequest::new(
                    "master:setup",
                    json!({"master_password":"new administrator"})
                )
            )
            .await
            .unwrap()
            .is_ok()
    );
    assert!(
        runtime
            .execute(
                7,
                generation,
                RpcRequest::new("vault:unlock", json!({"password":"new vault"}))
            )
            .await
            .unwrap()
            .is_ok()
    );
    let fresh = NativeHost::new(&runtime).unwrap();
    assert!(fresh.trusted_peers().await.unwrap().is_empty());
    assert!(!fresh.configuration().await.unwrap().enabled);
    runtime.close().unwrap();
    phase(&runtime, SessionPhase::Closed).await;
}

#[tokio::test]
async fn host_cleanup_failure_is_not_a_completed_erase_and_other_cleanup_still_runs() {
    use crate::session::storage_erase::EraseReceipt;
    let root = TempDir::new().unwrap();
    let runtime = runtime(&root).await;
    assert!(
        runtime
            .execute(
                2,
                1,
                RpcRequest::new(
                    "master:setup",
                    json!({"master_password":"synthetic erase administrator"})
                )
            )
            .await
            .unwrap()
            .is_ok()
    );
    let storage = root.path().join("storage");
    std::fs::create_dir(storage.join("ios_host_mode.json")).unwrap();
    std::fs::write(
        storage.join("network_local_identity.json"),
        b"synthetic identity",
    )
    .unwrap();
    std::fs::write(
        storage.join("paired_network_peers.json.bak.123"),
        b"synthetic history",
    )
    .unwrap();
    let handle = runtime.begin_storage_erase(1).unwrap();
    let review = runtime.review_storage_erase(3, &handle).unwrap();
    assert!(runtime.execute_admitted(review).await.unwrap().is_ok());
    let erase = runtime
        .commit_storage_erase(4, &handle, "synthetic erase administrator".into())
        .unwrap();
    assert_eq!(
        runtime.execute_admitted(erase).await.unwrap_err(),
        super::super::SessionError::Revoked
    );
    assert_eq!(
        handle.receipt().unwrap(),
        Some(EraseReceipt::Incomplete {
            key_cleanup_failed: false,
            host_cleanup_failed: true
        })
    );
    assert!(!storage.join("network_local_identity.json").exists());
    assert!(!storage.join("paired_network_peers.json.bak.123").exists());
    assert!(!storage.join("master.verify").exists());
    runtime.close().unwrap();
    phase(&runtime, SessionPhase::Closed).await;
}
