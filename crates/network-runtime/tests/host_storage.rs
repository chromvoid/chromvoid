use chromvoid_network_runtime::{
    ios_host::configuration::IosHostConfiguration, local_identity::LocalDeviceIdentityStore,
};
use serde_json::json;
use std::time::{SystemTime, UNIX_EPOCH};

#[test]
fn existing_identity_is_reused_without_relabeling_or_rewriting_its_file() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("network_local_identity.json");
    let legacy = json!({
        "device_id": "legacy-device", "device_label": "Existing phone",
        "static_pubkey_hex": "ab".repeat(32), "static_privkey_hex": "cd".repeat(32),
        "created_at": 1234
    });
    let bytes = serde_json::to_vec(&legacy).unwrap();
    std::fs::write(&path, &bytes).unwrap();
    let mut store = LocalDeviceIdentityStore::load(&path);
    let identity = store.get_or_create("New label").unwrap();
    assert_eq!(serde_json::to_value(identity).unwrap(), legacy);
    assert_eq!(std::fs::read(path).unwrap(), bytes);
}

#[test]
fn generated_and_reloaded_identity_completes_noise_handshake_with_its_saved_public_key() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("network_local_identity.json");
    let mut store = LocalDeviceIdentityStore::load(&path);
    let created = store.get_or_create("  Test phone  ").unwrap();
    assert_eq!(created.device_label, "Test phone");
    let mut reloaded = LocalDeviceIdentityStore::load(&path);
    let identity = reloaded.get_or_create("Unused label").unwrap();
    assert_eq!(
        serde_json::to_value(&created).unwrap(),
        serde_json::to_value(&identity).unwrap()
    );
    let params: snow::params::NoiseParams = chromvoid_protocol::NOISE_PARAMS_XX.parse().unwrap();
    let peer_keys = snow::Builder::new(params.clone())
        .generate_keypair()
        .unwrap();
    let host_private = hex::decode(&identity.static_privkey_hex).unwrap();
    let mut host = snow::Builder::new(params.clone())
        .local_private_key(&host_private)
        .unwrap()
        .build_responder()
        .unwrap();
    let mut peer = snow::Builder::new(params)
        .local_private_key(&peer_keys.private)
        .unwrap()
        .build_initiator()
        .unwrap();
    let mut message = [0; 1024];
    let mut payload = [0; 1024];
    let size = peer.write_message(&[], &mut message).unwrap();
    host.read_message(&message[..size], &mut payload).unwrap();
    let size = host.write_message(&[], &mut message).unwrap();
    peer.read_message(&message[..size], &mut payload).unwrap();
    let size = peer.write_message(&[], &mut message).unwrap();
    host.read_message(&message[..size], &mut payload).unwrap();
    assert!(peer.is_handshake_finished());
    assert!(host.is_handshake_finished());
    assert_eq!(
        peer.get_remote_static().unwrap(),
        hex::decode(&identity.static_pubkey_hex).unwrap()
    );
}

#[test]
fn host_preferences_preserve_legacy_schema_and_relay_when_stopping_or_omitting_input() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("ios_host_mode.json");
    std::fs::write(
        &path,
        br#"{"relay_url":"wss://old.test","enabled":true,"updated_at":1234}"#,
    )
    .unwrap();
    let before = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    IosHostConfiguration::update(&path, Some("   "), false).unwrap();
    let stopped = IosHostConfiguration::load(&path);
    assert!(!stopped.enabled);
    assert_eq!(stopped.relay_url.as_deref(), Some("wss://old.test"));
    assert!(stopped.updated_at >= before);
    let wire: serde_json::Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    assert_eq!(
        wire,
        json!({"relay_url":"wss://old.test","enabled":false,"updated_at":stopped.updated_at})
    );
    IosHostConfiguration::update(&path, Some(" wss://new.test "), true).unwrap();
    IosHostConfiguration::update(&path, None, false).unwrap();
    assert_eq!(
        IosHostConfiguration::load(&path).relay_url.as_deref(),
        Some("wss://new.test")
    );
    assert!(!IosHostConfiguration::load(&root.path().join("other-host.json")).enabled);
}

#[test]
fn preference_reads_default_without_writing_and_failed_writes_do_not_create_parent_roots() {
    let root = tempfile::tempdir().unwrap();
    let missing = root.path().join("missing/ios_host_mode.json");
    assert!(!IosHostConfiguration::load(&missing).enabled);
    assert!(!missing.parent().unwrap().exists());
    let error = IosHostConfiguration::update(&missing, Some("wss://relay.test"), true).unwrap_err();
    assert!(error.starts_with("write ios host mode: "));
    assert!(!missing.parent().unwrap().exists());

    let invalid = root.path().join("ios_host_mode.json");
    std::fs::write(&invalid, b"invalid JSON").unwrap();
    assert!(!IosHostConfiguration::load(&invalid).enabled);
    assert_eq!(std::fs::read(invalid).unwrap(), b"invalid JSON");
    let store = LocalDeviceIdentityStore::load(&root.path().join("identity.json"));
    assert_eq!(
        store.save().unwrap_err(),
        "no local device identity to save"
    );
    assert!(!root.path().join("identity.json").exists());
}
