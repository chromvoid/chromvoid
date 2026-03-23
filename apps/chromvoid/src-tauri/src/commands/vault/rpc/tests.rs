use super::helpers::should_downgrade_secret_read_error;

#[test]
fn downgrades_password_node_not_found() {
    assert!(should_downgrade_secret_read_error(
        "passmanager:secret:read",
        Some("password"),
        Some("NODE_NOT_FOUND"),
    ));
}

#[test]
fn downgrades_note_node_not_found() {
    assert!(should_downgrade_secret_read_error(
        "passmanager:secret:read",
        Some("note"),
        Some("NODE_NOT_FOUND"),
    ));
}

#[test]
fn keeps_ssh_secret_read_as_error() {
    assert!(!should_downgrade_secret_read_error(
        "passmanager:secret:read",
        Some("ssh_private_key:default"),
        Some("NODE_NOT_FOUND"),
    ));
}

#[test]
fn keeps_other_commands_as_error() {
    assert!(!should_downgrade_secret_read_error(
        "passmanager:secret:save",
        Some("password"),
        Some("NODE_NOT_FOUND"),
    ));
}

#[test]
fn keeps_other_codes_as_error() {
    assert!(!should_downgrade_secret_read_error(
        "passmanager:secret:read",
        Some("password"),
        Some("ACCESS_DENIED"),
    ));
}
