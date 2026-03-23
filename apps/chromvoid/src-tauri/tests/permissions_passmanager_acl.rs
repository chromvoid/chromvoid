const APP_PERMISSIONS: &str = include_str!("../permissions/app.toml");

fn set_block(identifier: &str) -> String {
    APP_PERMISSIONS
        .split("[[set]]")
        .find(|block| block.contains(&format!("identifier = \"{identifier}\"")))
        .map(str::to_string)
        .unwrap_or_default()
}

#[test]
fn desktop_permission_set_allows_passmanager_stream_commands() {
    let desktop = set_block("desktop");
    assert!(
        !desktop.is_empty(),
        "desktop permission set not found in permissions/app.toml"
    );

    for permission in [
        "allow-passmanager-upload-chunk",
        "allow-passmanager-download",
        "allow-passmanager-secret-read",
        "allow-passmanager-secret-write-chunk",
    ] {
        assert!(
            desktop.contains(permission),
            "desktop set must include {permission}"
        );
    }
}

#[test]
fn mobile_permission_set_allows_passmanager_stream_commands() {
    let mobile = set_block("mobile");
    assert!(
        !mobile.is_empty(),
        "mobile permission set not found in permissions/app.toml"
    );

    for permission in [
        "allow-passmanager-upload-chunk",
        "allow-passmanager-download",
        "allow-passmanager-secret-read",
        "allow-passmanager-secret-write-chunk",
    ] {
        assert!(
            mobile.contains(permission),
            "mobile set must include {permission}"
        );
    }
}
