use super::*;
use tempfile::NamedTempFile;

// ---------------------------------------------------------------------------
// GatewayConfig defaults
// ---------------------------------------------------------------------------

#[test]
fn default_config_is_disabled() {
    let cfg = GatewayConfig::default();
    assert!(!cfg.enabled);
    assert!(cfg.paired_extensions.is_empty());
    assert!(cfg.capability_policies.is_empty());
    assert!(cfg.gateway_privkey_hex.is_none());
    assert_eq!(cfg.session_max_duration_mins, 60);
}

#[test]
fn default_access_duration_is_until_vault_locked() {
    let cfg = GatewayConfig::default();
    assert!(
        matches!(cfg.access_duration, AccessDuration::UntilVaultLocked),
        "default access_duration should be UntilVaultLocked"
    );
}

// ---------------------------------------------------------------------------
// GatewayState::load_or_default
// ---------------------------------------------------------------------------

#[test]
fn load_or_default_creates_default_from_missing_file() {
    let path = std::path::PathBuf::from("/tmp/chromvoid_test_nonexistent_cfg.json");
    // Ensure the file doesn't exist.
    let _ = std::fs::remove_file(&path);

    let st = GatewayState::load_or_default(path);
    assert!(!st.config.enabled);
    assert!(st.pairing.is_none());
    assert!(st.grant_stores.is_empty());
}

#[test]
fn load_or_default_creates_default_from_invalid_json() {
    let tmp = NamedTempFile::new().expect("tempfile");
    std::fs::write(tmp.path(), b"not valid json!!!").unwrap();

    let st = GatewayState::load_or_default(tmp.path().to_path_buf());
    assert!(!st.config.enabled);
}

#[test]
fn load_or_default_reads_valid_config() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let json = serde_json::json!({
        "enabled": true,
        "access_duration": "hour1",
        "paired_extensions": [{
            "id": "ext-abc",
            "created_at_ms": 1000,
            "last_active_ms": 2000,
            "revoked": false,
            "label": null
        }],
        "session_max_duration_mins": 120,
        "capability_policies": [],
        "gateway_privkey_hex": "aa".repeat(32)
    });
    std::fs::write(tmp.path(), serde_json::to_vec(&json).unwrap()).unwrap();

    let st = GatewayState::load_or_default(tmp.path().to_path_buf());
    assert!(st.config.enabled);
    assert!(matches!(st.config.access_duration, AccessDuration::Hour1));
    assert_eq!(st.config.paired_extensions.len(), 1);
    assert_eq!(st.config.paired_extensions[0].id, "ext-abc");
    assert_eq!(st.config.session_max_duration_mins, 120);
    assert!(st.config.gateway_privkey_hex.is_some());
}

// ---------------------------------------------------------------------------
// save_config / load roundtrip
// ---------------------------------------------------------------------------

#[test]
fn save_and_reload_config_roundtrip() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let path = tmp.path().to_path_buf();

    let mut st = GatewayState::load_or_default(path.clone());
    st.config.enabled = true;
    st.config.session_max_duration_mins = 90;
    st.upsert_paired_extension("ext-roundtrip".to_string());
    st.save_config();

    let st2 = GatewayState::load_or_default(path);
    assert!(st2.config.enabled);
    assert_eq!(st2.config.session_max_duration_mins, 90);
    assert_eq!(st2.config.paired_extensions.len(), 1);
    assert_eq!(st2.config.paired_extensions[0].id, "ext-roundtrip");
}

// ---------------------------------------------------------------------------
// Pairing session lifecycle
// ---------------------------------------------------------------------------

#[test]
fn start_pairing_creates_session() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(tmp.path().to_path_buf());

    assert!(st.pairing.is_none());

    let session = st.start_pairing("tok-123".to_string(), "654321".to_string());
    assert_eq!(session.pairing_token, "tok-123");
    assert_eq!(session.pin, "654321");
    assert_eq!(session.attempts_left, 5);
    assert!(session.locked_until_ms.is_none());
    assert!(session.token_expires_at_ms > now_ms().saturating_sub(1000));
    assert!(session.pin_expires_at_ms > now_ms().saturating_sub(1000));

    assert!(st.pairing.is_some());
}

#[test]
fn start_pairing_replaces_previous_session() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(tmp.path().to_path_buf());

    st.start_pairing("tok-1".to_string(), "111111".to_string());
    st.start_pairing("tok-2".to_string(), "222222".to_string());

    let s = st.pairing.as_ref().unwrap();
    assert_eq!(s.pairing_token, "tok-2");
    assert_eq!(s.pin, "222222");
}

#[test]
fn cancel_pairing_clears_session() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(tmp.path().to_path_buf());

    st.start_pairing("tok".to_string(), "000000".to_string());
    assert!(st.pairing.is_some());

    st.cancel_pairing();
    assert!(st.pairing.is_none());
}

#[test]
fn cancel_pairing_noop_when_no_session() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(tmp.path().to_path_buf());
    st.cancel_pairing(); // should not panic
    assert!(st.pairing.is_none());
}

#[test]
fn pairing_token_and_pin_have_different_ttls() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(tmp.path().to_path_buf());

    let session = st.start_pairing("tok".to_string(), "123456".to_string());
    // Token TTL = 5 min, PIN TTL = 2 min -> token_expires > pin_expires.
    assert!(session.token_expires_at_ms > session.pin_expires_at_ms);
}

// ---------------------------------------------------------------------------
// Extension management
// ---------------------------------------------------------------------------

#[test]
fn upsert_paired_extension_adds_new() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(tmp.path().to_path_buf());

    st.upsert_paired_extension("ext-new".to_string());
    assert_eq!(st.config.paired_extensions.len(), 1);
    let ext = &st.config.paired_extensions[0];
    assert_eq!(ext.id, "ext-new");
    assert!(!ext.revoked);
    assert!(ext.last_active_ms.is_some());
    assert!(ext.created_at_ms > 0);
}

#[test]
fn upsert_paired_extension_reactivates_revoked() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(tmp.path().to_path_buf());

    st.upsert_paired_extension("ext-1".to_string());
    st.revoke_extension("ext-1");
    assert!(st.config.paired_extensions[0].revoked);

    st.upsert_paired_extension("ext-1".to_string());
    assert!(
        !st.config.paired_extensions[0].revoked,
        "upsert should un-revoke"
    );
    assert_eq!(st.config.paired_extensions.len(), 1, "should not duplicate");
}

#[test]
fn upsert_paired_extension_does_not_duplicate() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(tmp.path().to_path_buf());

    st.upsert_paired_extension("ext-dup".to_string());
    st.upsert_paired_extension("ext-dup".to_string());
    st.upsert_paired_extension("ext-dup".to_string());
    assert_eq!(st.config.paired_extensions.len(), 1);
}

#[test]
fn mark_extension_active_updates_timestamp() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(tmp.path().to_path_buf());

    st.upsert_paired_extension("ext-act".to_string());
    let ts_before = st.config.paired_extensions[0].last_active_ms.unwrap();

    // Small delay so timestamp might differ.
    std::thread::sleep(std::time::Duration::from_millis(2));
    st.mark_extension_active("ext-act");
    let ts_after = st.config.paired_extensions[0].last_active_ms.unwrap();
    assert!(ts_after >= ts_before);
}

#[test]
fn mark_extension_active_noop_for_unknown() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(tmp.path().to_path_buf());
    st.mark_extension_active("nonexistent"); // should not panic
}

#[test]
fn revoke_extension_sets_revoked_flag() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(tmp.path().to_path_buf());

    st.upsert_paired_extension("ext-rev".to_string());
    assert!(!st.config.paired_extensions[0].revoked);

    st.revoke_extension("ext-rev");
    assert!(st.config.paired_extensions[0].revoked);
}

#[test]
fn revoke_extension_noop_for_unknown() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(tmp.path().to_path_buf());
    st.revoke_extension("nonexistent"); // should not panic
}

#[test]
fn is_paired_and_active_returns_true_for_active_extension() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(tmp.path().to_path_buf());

    st.upsert_paired_extension("ext-ok".to_string());
    assert!(st.is_paired_and_active("ext-ok"));
}

#[test]
fn is_paired_and_active_returns_false_for_revoked() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(tmp.path().to_path_buf());

    st.upsert_paired_extension("ext-rev".to_string());
    st.revoke_extension("ext-rev");
    assert!(!st.is_paired_and_active("ext-rev"));
}

#[test]
fn is_paired_and_active_returns_false_for_unknown() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let st = GatewayState::load_or_default(tmp.path().to_path_buf());
    assert!(!st.is_paired_and_active("unknown"));
}

// ---------------------------------------------------------------------------
// Session duration
// ---------------------------------------------------------------------------

#[test]
fn set_session_max_duration_clamps_low() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(tmp.path().to_path_buf());

    let result = st.set_session_max_duration(5);
    assert_eq!(result, 15, "should clamp to minimum 15");
    assert_eq!(st.config.session_max_duration_mins, 15);
}

#[test]
fn set_session_max_duration_clamps_high() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(tmp.path().to_path_buf());

    let result = st.set_session_max_duration(999);
    assert_eq!(result, 240, "should clamp to maximum 240");
    assert_eq!(st.config.session_max_duration_mins, 240);
}

#[test]
fn set_session_max_duration_accepts_valid_value() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(tmp.path().to_path_buf());

    let result = st.set_session_max_duration(120);
    assert_eq!(result, 120);
    assert_eq!(st.config.session_max_duration_mins, 120);
}

#[test]
fn set_session_max_duration_persists() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let path = tmp.path().to_path_buf();

    let mut st = GatewayState::load_or_default(path.clone());
    st.set_session_max_duration(45);

    let st2 = GatewayState::load_or_default(path);
    assert_eq!(st2.config.session_max_duration_mins, 45);
}

// ---------------------------------------------------------------------------
// Capability policy management
// ---------------------------------------------------------------------------

#[test]
fn get_or_create_policy_creates_default() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(tmp.path().to_path_buf());

    let policy = st.get_or_create_policy("ext-new");
    assert_eq!(policy.extension_id, "ext-new");
    assert!(policy.require_action_grant);
    assert!(policy.require_site_grant);
    assert!(matches!(
        policy.allowed_commands,
        super::super::types::AllowedCommands::All
    ));
    assert!(policy.site_allowlist.is_empty());
    assert_eq!(st.config.capability_policies.len(), 1);
}

#[test]
fn get_or_create_policy_returns_existing() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(tmp.path().to_path_buf());

    let p1 = st.get_or_create_policy("ext-x");
    let p2 = st.get_or_create_policy("ext-x");
    assert_eq!(p1.extension_id, p2.extension_id);
    assert_eq!(
        st.config.capability_policies.len(),
        1,
        "should not duplicate"
    );
}

#[test]
fn set_policy_upserts() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(tmp.path().to_path_buf());

    let mut policy = st.get_or_create_policy("ext-p");
    assert!(policy.require_action_grant);

    policy.require_action_grant = false;
    st.set_policy(policy.clone());

    let fetched = st.get_or_create_policy("ext-p");
    assert!(
        !fetched.require_action_grant,
        "set_policy should update existing"
    );
    assert_eq!(st.config.capability_policies.len(), 1);
}

#[test]
fn set_policy_inserts_new() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(tmp.path().to_path_buf());

    let policy = super::super::types::CapabilityPolicy::default_for("ext-brand-new".to_string());
    st.set_policy(policy);
    assert_eq!(st.config.capability_policies.len(), 1);
    assert_eq!(
        st.config.capability_policies[0].extension_id,
        "ext-brand-new"
    );
}

// ---------------------------------------------------------------------------
// Grant store management
// ---------------------------------------------------------------------------

#[test]
fn grant_store_mut_creates_empty_store() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(tmp.path().to_path_buf());

    let store = st.grant_store_mut("ext-gs");
    assert!(store.action_grants.is_empty());
    assert!(store.site_grants.is_empty());
}

#[test]
fn grant_store_mut_returns_same_store() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(tmp.path().to_path_buf());

    st.grant_store_mut("ext-gs").action_grants.insert(
        "g1".to_string(),
        super::super::types::ActionGrant {
            grant_id: "g1".to_string(),
            extension_id: "ext-gs".to_string(),
            command: "catalog:list".to_string(),
            node_id: None,
            created_at_ms: now_ms(),
            expires_at_ms: now_ms() + 30_000,
            consumed: false,
        },
    );

    assert_eq!(st.grant_store_mut("ext-gs").action_grants.len(), 1);
}

#[test]
fn revoke_all_grants_clears_all_extensions() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(tmp.path().to_path_buf());

    let now = now_ms();
    st.grant_store_mut("ext-a").action_grants.insert(
        "g1".to_string(),
        super::super::types::ActionGrant {
            grant_id: "g1".to_string(),
            extension_id: "ext-a".to_string(),
            command: "catalog:list".to_string(),
            node_id: None,
            created_at_ms: now,
            expires_at_ms: now + 30_000,
            consumed: false,
        },
    );
    st.grant_store_mut("ext-b").site_grants.insert(
        "https://example.com".to_string(),
        super::super::types::SiteGrant {
            grant_id: "sg1".to_string(),
            extension_id: "ext-b".to_string(),
            origin: "https://example.com".to_string(),
            created_at_ms: now,
            expires_at_ms: now + 60_000,
        },
    );

    st.revoke_all_grants();

    assert!(st.grant_store_mut("ext-a").action_grants.is_empty());
    assert!(st.grant_store_mut("ext-b").site_grants.is_empty());
}

// ---------------------------------------------------------------------------
// Gateway keypair persistence
// ---------------------------------------------------------------------------

#[test]
fn ensure_gateway_keypair_stores_on_first_call() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(tmp.path().to_path_buf());
    assert!(st.config.gateway_privkey_hex.is_none());

    let params: snow::params::NoiseParams = chromvoid_protocol::NOISE_PARAMS_XX.parse().unwrap();
    let kp = snow::Builder::new(params).generate_keypair().unwrap();

    st.ensure_gateway_keypair(&kp);
    assert!(st.config.gateway_privkey_hex.is_some());
    let hex = st.config.gateway_privkey_hex.as_ref().unwrap();
    assert_eq!(hex.len(), 64, "32 bytes = 64 hex chars");
}

#[test]
fn ensure_gateway_keypair_idempotent() {
    let tmp = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(tmp.path().to_path_buf());

    let params: snow::params::NoiseParams = chromvoid_protocol::NOISE_PARAMS_XX.parse().unwrap();
    let kp1 = snow::Builder::new(params.clone())
        .generate_keypair()
        .unwrap();
    let kp2 = snow::Builder::new(params).generate_keypair().unwrap();

    st.ensure_gateway_keypair(&kp1);
    let first = st.config.gateway_privkey_hex.clone().unwrap();

    st.ensure_gateway_keypair(&kp2);
    assert_eq!(
        st.config.gateway_privkey_hex.as_ref().unwrap(),
        &first,
        "second call must not overwrite"
    );
}

// ---------------------------------------------------------------------------
// hex_encode
// ---------------------------------------------------------------------------

#[test]
fn hex_encode_empty() {
    assert_eq!(hex_encode(&[]), "");
}

#[test]
fn hex_encode_known_values() {
    assert_eq!(hex_encode(&[0x00]), "00");
    assert_eq!(hex_encode(&[0xff]), "ff");
    assert_eq!(hex_encode(&[0xde, 0xad, 0xbe, 0xef]), "deadbeef");
}

// ---------------------------------------------------------------------------
// now_ms sanity
// ---------------------------------------------------------------------------

#[test]
fn now_ms_returns_plausible_value() {
    let ms = now_ms();
    // Should be after 2024-01-01 (1_704_067_200_000 ms).
    assert!(ms > 1_704_067_200_000, "now_ms looks too old: {ms}");
}

// ---------------------------------------------------------------------------
// GatewayConfig serde
// ---------------------------------------------------------------------------

#[test]
fn gateway_config_serde_roundtrip() {
    let cfg = GatewayConfig {
        enabled: true,
        access_duration: AccessDuration::Hour24,
        paired_extensions: vec![super::super::types::PairedExtension {
            id: "ext-serde".to_string(),
            created_at_ms: 1000,
            last_active_ms: Some(2000),
            revoked: false,
            label: Some("My Extension".to_string()),
        }],
        session_max_duration_mins: 30,
        capability_policies: vec![],
        gateway_privkey_hex: Some("ab".repeat(32)),
    };

    let json = serde_json::to_vec(&cfg).unwrap();
    let deserialized: GatewayConfig = serde_json::from_slice(&json).unwrap();

    assert!(deserialized.enabled);
    assert!(matches!(
        deserialized.access_duration,
        AccessDuration::Hour24
    ));
    assert_eq!(deserialized.paired_extensions.len(), 1);
    assert_eq!(
        deserialized.paired_extensions[0].label.as_deref(),
        Some("My Extension")
    );
    assert_eq!(deserialized.session_max_duration_mins, 30);
    assert_eq!(deserialized.gateway_privkey_hex.unwrap().len(), 64);
}

#[test]
fn gateway_config_missing_optional_fields_use_defaults() {
    let json =
        r#"{"enabled": true, "access_duration": "until_vault_locked", "paired_extensions": []}"#;
    let cfg: GatewayConfig = serde_json::from_str(json).unwrap();
    assert_eq!(
        cfg.session_max_duration_mins, 60,
        "default session duration"
    );
    assert!(cfg.capability_policies.is_empty());
    assert!(cfg.gateway_privkey_hex.is_none());
}
