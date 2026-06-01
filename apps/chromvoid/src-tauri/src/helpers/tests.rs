use super::redact::redact_rpc_data;
use super::rpc::validate_upload_chunk_bounds;
use serde_json::json;

#[test]
fn upload_chunk_bounds_return_end_offset() {
    assert_eq!(
        validate_upload_chunk_bounds("catalog upload", 8, 4, Some(12)).expect("valid chunk bounds"),
        12
    );
}

#[test]
fn upload_chunk_bounds_reject_offset_overflow() {
    assert_eq!(
        validate_upload_chunk_bounds("native upload", u64::MAX, 1, None)
            .expect_err("offset overflow should fail"),
        "native upload chunk offset overflow"
    );
}

#[test]
fn upload_chunk_bounds_reject_chunk_beyond_declared_size() {
    assert_eq!(
        validate_upload_chunk_bounds("passmanager upload", 8, 5, Some(12))
            .expect_err("chunk beyond declared size should fail"),
        "passmanager upload chunk exceeds declared size"
    );
}

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

#[test]
fn redact_wallet_recovery_and_signing_material() {
    let redacted = redact_rpc_data(
        "wallet:hd:create",
        &json!({
            "label": "Main",
            "mnemonic": ["able", "acid"],
            "bip39_passphrase": "extra-secret",
            "supported_networks": ["bitcoin"]
        }),
    );

    assert_eq!(
        redacted,
        json!({
            "label": "Main",
            "mnemonic": "<redacted>",
            "bip39_passphrase": "<redacted>",
            "supported_networks": ["bitcoin"]
        })
    );

    let redacted = redact_rpc_data(
        "wallet:transaction:confirm",
        &json!({
            "preparation_id": "prep-1",
            "canonical_payload": "payload-bytes",
            "signed_payload": "signed-bytes"
        }),
    );

    assert_eq!(
        redacted,
        json!({
            "preparation_id": "prep-1",
            "canonical_payload": "<redacted>",
            "signed_payload": "<redacted>"
        })
    );
}
