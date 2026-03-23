use super::*;

fn byo_profile_json() -> &'static str {
    r#"{
  "version": 1,
  "profile_id": "byo-home",
  "label": "Home Edge",
  "mode": "byo",
  "endpoints": [
    {
      "id": "primary",
      "relay_url": "wss://edge.example.com",
      "readiness_path": "/ready"
    },
    {
      "id": "backup",
      "relay_url": "wss://backup.example.com",
      "readiness_path": "/ready"
    }
  ]
}"#
}

fn managed_profile_json() -> &'static str {
    r#"{
  "version": 1,
  "profile_id": "managed-prod",
  "label": "Managed Prod",
  "mode": "managed",
  "strict_mode": {
    "enabled": true,
    "transport": "tcp443_stealth",
    "fail_closed": true,
    "allow_udp_fallback": false
  },
  "endpoints": [
    {
      "id": "region-a",
      "relay_url": "wss://relay.chromvoid.net",
      "readiness_path": "/ready"
    }
  ],
  "managed": {
    "provider": "chromvoid"
  }
}"#
}

#[test]
fn import_byo_profile_sets_strict_defaults() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("server_profiles.json");
    let mut store = ServerProfileStore::load(&path);
    let imported = store
        .import_profile_json(byo_profile_json(), false)
        .expect("import");

    assert_eq!(imported.profile_id, "byo-home");
    assert_eq!(imported.version, 1);
    assert_eq!(imported.endpoint_count, 2);
    assert_eq!(imported.active_endpoint_id, "primary");
    assert!(imported.strict_mode_enabled);

    let bootstrap = store.bootstrap_profile("byo-home").expect("bootstrap");
    assert_eq!(bootstrap.relay_url, "wss://edge.example.com");
    assert!(bootstrap.strict_mode.enabled);
    assert!(bootstrap.strict_mode.fail_closed);
    assert!(!bootstrap.strict_mode.allow_udp_fallback);
}

#[test]
fn import_invalid_profile_rejected_without_partial_write() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("server_profiles.json");
    let mut store = ServerProfileStore::load(&path);
    let invalid = r#"{
  "version": 1,
  "profile_id": "bad",
  "label": "Broken",
  "mode": "byo",
  "endpoints": []
}"#;

    let err = store
        .import_profile_json(invalid, false)
        .expect_err("must fail");
    assert_eq!(err, "profile must include at least one endpoint");
    assert!(store.list().is_empty());
}

#[test]
fn managed_profile_requires_metadata() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("server_profiles.json");
    let mut store = ServerProfileStore::load(&path);
    let invalid_managed = r#"{
  "version": 1,
  "profile_id": "managed-missing",
  "label": "Managed Missing",
  "mode": "managed",
  "endpoints": [{"id": "a", "relay_url": "wss://relay.example.com", "readiness_path": "/ready"}]
}"#;

    let err = store
        .import_profile_json(invalid_managed, false)
        .expect_err("must fail");
    assert_eq!(err, "managed profile metadata required");
}

#[test]
fn endpoint_rotation_and_rollback_work() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("server_profiles.json");
    let mut store = ServerProfileStore::load(&path);
    store
        .import_profile_json(byo_profile_json(), false)
        .expect("import");

    let first = store
        .record_endpoint_failure("byo-home")
        .expect("record failure 1");
    assert!(matches!(first.action, RotationAction::None));
    assert_eq!(first.active_endpoint_id, "primary");

    let second = store
        .record_endpoint_failure("byo-home")
        .expect("record failure 2");
    assert!(matches!(second.action, RotationAction::Rotated));
    assert_eq!(second.active_endpoint_id, "backup");

    let rollback = store.rollback_endpoint("byo-home").expect("rollback");
    assert!(matches!(rollback.action, RotationAction::Rotated));
    assert_eq!(rollback.active_endpoint_id, "primary");
}

#[test]
fn profile_update_preserves_active_endpoint_when_present() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("server_profiles.json");
    let mut store = ServerProfileStore::load(&path);
    store
        .import_profile_json(byo_profile_json(), false)
        .expect("import");
    let _ = store.record_endpoint_failure("byo-home");
    let _ = store.record_endpoint_failure("byo-home");

    let updated = r#"{
  "version": 1,
  "profile_id": "byo-home",
  "label": "Home Edge Updated",
  "mode": "byo",
  "endpoints": [
    {
      "id": "backup",
      "relay_url": "wss://backup.example.com",
      "readiness_path": "/ready"
    },
    {
      "id": "primary",
      "relay_url": "wss://edge.example.com",
      "readiness_path": "/ready"
    }
  ]
}"#;

    let imported = store
        .import_profile_json(updated, true)
        .expect("update import");
    assert_eq!(imported.active_endpoint_id, "backup");
}

#[test]
fn import_export_roundtrip() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("server_profiles.json");
    let mut store = ServerProfileStore::load(&path);
    store
        .import_profile_json(managed_profile_json(), false)
        .expect("import");
    store.save().expect("save");

    let reloaded = ServerProfileStore::load(&path);
    let exported = reloaded
        .export_profile_json("managed-prod")
        .expect("export");
    let parsed: ServerProfile = serde_json::from_str(&exported).expect("parse exported");

    assert_eq!(parsed.profile_id, "managed-prod");
    assert_eq!(parsed.version, 1);
    assert!(matches!(parsed.mode, ProfileMode::Managed));
}
