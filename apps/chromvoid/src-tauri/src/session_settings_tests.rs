use super::*;

#[test]
fn default_auto_mount_is_false() {
    let s = SessionSettings::default();
    assert!(s.require_biometric_app_gate);
    assert!(!s.auto_mount_after_unlock);
    assert!(!s.lock_on_mobile_background);
    assert!(!s.keep_screen_awake_when_unlocked);
}

#[test]
fn round_trip_persistence() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("session_settings.json");

    let mut settings = SessionSettings::default();
    settings.require_biometric_app_gate = false;
    settings.auto_mount_after_unlock = true;
    settings.auto_lock_timeout_secs = 120;
    settings.lock_on_sleep = false;
    settings.lock_on_mobile_background = true;
    settings.keep_screen_awake_when_unlocked = true;
    settings.save(&path);

    let loaded = SessionSettings::load(&path);
    assert!(!loaded.require_biometric_app_gate);
    assert!(loaded.auto_mount_after_unlock);
    assert_eq!(loaded.auto_lock_timeout_secs, 120);
    assert!(!loaded.lock_on_sleep);
    assert!(loaded.lock_on_mobile_background);
    assert!(loaded.keep_screen_awake_when_unlocked);
}

#[test]
fn backward_compat_missing_field() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("session_settings.json");

    let legacy_json = r#"{"auto_lock_timeout_secs":300,"lock_on_sleep":true}"#;
    std::fs::write(&path, legacy_json).unwrap();

    let loaded = SessionSettings::load(&path);
    assert_eq!(loaded.auto_lock_timeout_secs, 300);
    assert!(loaded.lock_on_sleep);
    assert!(!loaded.lock_on_mobile_background);
    assert!(loaded.require_biometric_app_gate);
    assert!(!loaded.auto_mount_after_unlock);
    assert!(!loaded.keep_screen_awake_when_unlocked);
}

#[test]
fn load_nonexistent_returns_default() {
    let loaded = SessionSettings::load(std::path::Path::new("/tmp/__nonexistent__.json"));
    assert_eq!(loaded.auto_lock_timeout_secs, 5 * 60);
    assert!(loaded.lock_on_sleep);
    assert!(!loaded.lock_on_mobile_background);
    assert!(loaded.require_biometric_app_gate);
    assert!(!loaded.auto_mount_after_unlock);
    assert!(!loaded.keep_screen_awake_when_unlocked);
}
