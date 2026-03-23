use super::redact::redact_rpc_data;
use serde_json::json;

#[test]
fn redact_passmanager_secret_save_value() {
    let redacted = redact_rpc_data(
        "passmanager:secret:save",
        &json!({
            "entry_id": "entry-1",
            "secret_type": "password",
            "value": "super-secret-password"
        }),
    );

    assert_eq!(
        redacted,
        json!({
            "entry_id": "entry-1",
            "secret_type": "password",
            "value": "<redacted>"
        })
    );
}

#[test]
fn redact_nested_secret_fields() {
    let redacted = redact_rpc_data(
        "passmanager:root:import",
        &json!({
            "entries": [
                {
                    "id": "entry-1",
                    "secret": "otp-secret",
                    "private_key": "private-key-value"
                }
            ]
        }),
    );

    assert_eq!(
        redacted,
        json!({
            "entries": [
                {
                    "id": "entry-1",
                    "secret": "<redacted>",
                    "private_key": "<redacted>"
                }
            ]
        })
    );
}
