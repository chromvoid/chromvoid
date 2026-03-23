use serde_json::Value;

pub(super) fn optional_secret_type_for_log(command: &str, data: &Value) -> Option<String> {
    if command != "passmanager:secret:read" {
        return None;
    }

    data.get("secret_type")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string())
}

pub(super) fn should_downgrade_secret_read_error(
    command: &str,
    secret_type: Option<&str>,
    code: Option<&str>,
) -> bool {
    command == "passmanager:secret:read"
        && code == Some("NODE_NOT_FOUND")
        && matches!(secret_type, Some("password" | "note"))
}
