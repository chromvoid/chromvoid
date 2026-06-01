use super::*;

#[test]
fn default_auto_mount_is_false() {
    let s = SessionSettings::default();
    assert!(s.require_biometric_app_gate);
    assert!(!s.auto_mount_after_unlock);
    assert!(!s.auto_start_ssh_agent_after_unlock);
    assert!(!s.lock_on_mobile_background);
    assert!(!s.keep_screen_awake_when_unlocked);
    assert!(s.android_vault_status_notification_enabled);
    assert!(s.android_quick_lock_tile_enabled);
    assert!(s.confirm_file_deletion);
    assert!(!s.show_hidden_files);
    assert_eq!(s.markdown_attachment_folder_path, "/attachments");
}

#[test]
fn round_trip_persistence() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("session_settings.json");

    let mut settings = SessionSettings::default();
    settings.require_biometric_app_gate = false;
    settings.auto_mount_after_unlock = true;
    settings.auto_start_ssh_agent_after_unlock = true;
    settings.auto_lock_timeout_secs = 120;
    settings.lock_on_sleep = false;
    settings.lock_on_mobile_background = true;
    settings.keep_screen_awake_when_unlocked = true;
    settings.android_vault_status_notification_enabled = false;
    settings.android_quick_lock_tile_enabled = false;
    settings.confirm_file_deletion = false;
    settings.show_hidden_files = true;
    settings.markdown_attachment_folder_path = "/notes/assets".to_string();
    settings.save(&path);

    let loaded = SessionSettings::load(&path);
    assert!(!loaded.require_biometric_app_gate);
    assert!(loaded.auto_mount_after_unlock);
    assert!(loaded.auto_start_ssh_agent_after_unlock);
    assert_eq!(loaded.auto_lock_timeout_secs, 120);
    assert!(!loaded.lock_on_sleep);
    assert!(loaded.lock_on_mobile_background);
    assert!(loaded.keep_screen_awake_when_unlocked);
    assert!(!loaded.android_vault_status_notification_enabled);
    assert!(!loaded.android_quick_lock_tile_enabled);
    assert!(!loaded.confirm_file_deletion);
    assert!(loaded.show_hidden_files);
    assert_eq!(loaded.markdown_attachment_folder_path, "/notes/assets");
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
    assert!(!loaded.auto_start_ssh_agent_after_unlock);
    assert!(!loaded.keep_screen_awake_when_unlocked);
    assert!(loaded.android_vault_status_notification_enabled);
    assert!(loaded.android_quick_lock_tile_enabled);
    assert!(loaded.confirm_file_deletion);
    assert!(!loaded.show_hidden_files);
    assert_eq!(loaded.markdown_attachment_folder_path, "/attachments");
}

#[test]
fn load_nonexistent_returns_default() {
    let loaded = SessionSettings::load(std::path::Path::new("/tmp/__nonexistent__.json"));
    assert_eq!(loaded.auto_lock_timeout_secs, 5 * 60);
    assert!(loaded.lock_on_sleep);
    assert!(!loaded.lock_on_mobile_background);
    assert!(loaded.require_biometric_app_gate);
    assert!(!loaded.auto_mount_after_unlock);
    assert!(!loaded.auto_start_ssh_agent_after_unlock);
    assert!(!loaded.keep_screen_awake_when_unlocked);
    assert!(loaded.android_vault_status_notification_enabled);
    assert!(loaded.android_quick_lock_tile_enabled);
    assert!(loaded.confirm_file_deletion);
    assert!(!loaded.show_hidden_files);
    assert_eq!(loaded.markdown_attachment_folder_path, "/attachments");
}

#[test]
fn load_invalid_json_returns_default() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("session_settings.json");
    std::fs::write(&path, b"{").unwrap();

    let loaded = SessionSettings::load(&path);

    assert_eq!(loaded.auto_lock_timeout_secs, 5 * 60);
    assert!(loaded.lock_on_sleep);
    assert!(!loaded.lock_on_mobile_background);
    assert!(loaded.require_biometric_app_gate);
}
