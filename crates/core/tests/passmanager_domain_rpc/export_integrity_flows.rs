use super::support::*;
use serde_json::json;

fn seed(router: &mut RpcRouter) {
    assert_rpc_ok(&router.handle(&RpcRequest::new("passmanager:root:import", json!({
        "folders": [], "entries": [
            {"id":"login", "title":"Login", "password":"synthetic-password", "note":"synthetic-note",
             "otps":[{"label":"otp", "secret":"JBSWY3DPEHPK3PXP"}]},
            {"id":"card", "title":"Card", "entry_type":"payment_card",
             "payment_card":{"cardholder_name":"Synthetic", "exp_month":12,"exp_year":2030},
             "card_pan":"4111111111111111", "card_cvv":"123"},
            {"id":"empty", "title":"Empty"}
        ]
    }))));
}

fn export(router: &mut RpcRouter) -> RpcResponse {
    router.handle(&RpcRequest::new("passmanager:root:export", json!({})))
}

fn blob_name(router: &RpcRouter, path: &str) -> String {
    let session = router.session().unwrap();
    let node = session.catalog().find_by_path(path).expect("fixture node");
    chromvoid_core::crypto::blob_chunk_name(session.vault_key(), node.node_id as u32, 0)
}

#[test]
fn root_export_rejects_unreadable_metadata_and_present_secret_without_partial_data() {
    for (entry, filename, secret_type) in [
        ("Login", "meta.json", None),
        ("Login", ".password", Some("password")),
        ("Login", ".note", Some("note")),
        ("Card", ".card_pan", Some("card_pan")),
        ("Card", ".card_cvv", Some("card_cvv")),
    ] {
        let (mut router, tmp) = create_test_router();
        let storage = chromvoid_core::storage::Storage::new(tmp.path()).unwrap();
        assert_rpc_ok(&unlock_vault(&mut router, "pw"));
        seed(&mut router);
        assert_rpc_ok(&export(&mut router));
        let name = blob_name(&router, &format!("/.passmanager/{entry}/{filename}"));
        let original = storage.read_chunk(&name).unwrap();
        for missing in [false, true] {
            if missing {
                storage.delete_chunk(&name).unwrap();
            } else {
                storage
                    .write_chunk_atomic(&name, b"corrupt ciphertext")
                    .unwrap();
            }
            let response = export(&mut router);
            assert!(
                !response.is_ok(),
                "{entry}/{filename} missing={missing} must fail"
            );
            assert!(response.result().is_none(), "never return a partial root");
            if let Some(secret_type) = secret_type {
                let response = router.handle(&RpcRequest::new(
                    "passmanager:secret:read",
                    json!({
                        "entry_id":entry.to_lowercase(), "secret_type":secret_type
                    }),
                ));
                assert!(!response.is_ok());
                assert_ne!(
                    response.code(),
                    Some("NODE_NOT_FOUND"),
                    "unreadable is not an absent optional field"
                );
            }
            storage.write_chunk_atomic(&name, &original).unwrap();
            assert_rpc_ok(&export(&mut router));
        }
    }
}

#[test]
fn root_export_rejects_missing_or_corrupt_expected_otp_settings() {
    let (mut router, tmp) = create_test_router();
    let storage = chromvoid_core::storage::Storage::new(tmp.path()).unwrap();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    seed(&mut router);
    let session = router.session().unwrap();
    let node = session
        .catalog()
        .find_by_path("/.passmanager/Login")
        .unwrap()
        .node_id;
    let name = chromvoid_core::crypto::otp_chunk_name(session.vault_key(), node);
    let original = storage.read_chunk(&name).unwrap();
    for missing in [false, true] {
        if missing {
            storage.delete_chunk(&name).unwrap();
        } else {
            storage.write_chunk_atomic(&name, b"corrupt otp").unwrap();
        }
        let response = export(&mut router);
        assert!(
            !response.is_ok(),
            "expected OTP missing={missing} must fail"
        );
        assert!(response.result().is_none());
        storage.write_chunk_atomic(&name, &original).unwrap();
        assert_rpc_ok(&export(&mut router));
    }
}

#[test]
fn root_export_preserves_authoritative_otp_settings_and_optional_absence_on_roundtrip() {
    let (mut router, tmp) = create_test_router();
    let storage = chromvoid_core::storage::Storage::new(tmp.path()).unwrap();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    seed(&mut router);
    // Existing low-level OTP settings can differ from entry presentation metadata.
    let session = router.session().unwrap();
    let node = session
        .catalog()
        .find_by_path("/.passmanager/Login")
        .unwrap()
        .node_id;
    let name = chromvoid_core::crypto::otp_chunk_name(session.vault_key(), node);
    let settings = json!({"secrets":[{"label":"otp", "secret":"31323334353637383930", "encoding":"base16",
        "type":"HOTP", "counter":17, "algorithm":"SHA256", "digits":8, "period":60}]});
    let encrypted = chromvoid_core::crypto::encrypt(
        &serde_json::to_vec(&settings).unwrap(),
        session.vault_key(),
        name.as_bytes(),
    )
    .unwrap();
    storage.write_chunk_atomic(&name, &encrypted).unwrap();
    let response = export(&mut router);
    assert_rpc_ok(&response);
    let root = response.result().unwrap()["root"].clone();
    let otp = &get_root_entry_by_id(&response, "login").unwrap()["otps"][0];
    assert_eq!(otp, &settings["secrets"][0]);
    assert_eq!(
        get_root_entry_by_id(&response, "login").unwrap()["password"],
        "synthetic-password"
    );
    assert_eq!(
        get_root_entry_by_id(&response, "card").unwrap()["card_pan"],
        "4111111111111111"
    );
    assert!(get_root_entry_by_id(&response, "empty")
        .unwrap()
        .get("password")
        .is_none());
    let (mut destination, _destination_tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut destination, "different-pw"));
    assert_rpc_ok(&destination.handle(&RpcRequest::new("passmanager:root:import", root)));
    let roundtrip = export(&mut destination);
    assert_rpc_ok(&roundtrip);
    for id in ["login", "card", "empty"] {
        let source = get_root_entry_by_id(&response, id).unwrap();
        let restored = get_root_entry_by_id(&roundtrip, id).unwrap();
        for field in ["password", "note", "card_pan", "card_cvv", "otps"] {
            assert_eq!(source.get(field), restored.get(field), "{id}/{field}");
        }
    }
}

#[test]
fn root_export_preserves_legacy_single_otp_label_and_unprojected_sidecar_records() {
    for (metadata, labels) in [
        (
            json!([{"label":"legacy-label", "issuer":"Preserve issuer"}]),
            vec!["canonical-label"],
        ),
        (json!([]), vec!["first", "second"]),
    ] {
        let (mut router, tmp) = create_test_router();
        let storage = chromvoid_core::storage::Storage::new(tmp.path()).unwrap();
        assert_rpc_ok(&unlock_vault(&mut router, "pw"));
        assert_rpc_ok(&router.handle(&RpcRequest::new(
            "passmanager:root:import",
            json!({
                "folders":[], "entries":[{"id":"login", "title":"Login", "otps":metadata}]
            }),
        )));
        let session = router.session().unwrap();
        let node = session
            .catalog()
            .find_by_path("/.passmanager/Login")
            .unwrap()
            .node_id;
        let name = chromvoid_core::crypto::otp_chunk_name(session.vault_key(), node);
        let secrets: Vec<_> = labels
            .iter()
            .map(|label| json!({"label":label, "secret":"JBSWY3DPEHPK3PXP"}))
            .collect();
        let encrypted = chromvoid_core::crypto::encrypt(
            &serde_json::to_vec(&json!({"secrets":secrets})).unwrap(),
            session.vault_key(),
            name.as_bytes(),
        )
        .unwrap();
        storage.write_chunk_atomic(&name, &encrypted).unwrap();
        let response = export(&mut router);
        assert_rpc_ok(&response);
        let otps = get_root_entry_by_id(&response, "login").unwrap()["otps"]
            .as_array()
            .unwrap();
        assert_eq!(otps.len(), labels.len());
        for otp in otps {
            assert_eq!(otp["secret"], "JBSWY3DPEHPK3PXP");
        }
        if labels.len() == 1 {
            assert_eq!(otps[0]["label"], "legacy-label");
            assert_eq!(otps[0]["issuer"], "Preserve issuer");
        } else {
            assert_eq!(
                otps.iter()
                    .map(|o| o["label"].as_str().unwrap())
                    .collect::<Vec<_>>(),
                labels
            );
        }
    }
}

#[test]
fn root_export_rejects_valid_ciphertext_with_invalid_metadata_or_secret_text() {
    for (filename, plain) in [
        ("meta.json", b"[]".as_slice()),
        (".password", b"\xff".as_slice()),
    ] {
        let (mut router, tmp) = create_test_router();
        let storage = chromvoid_core::storage::Storage::new(tmp.path()).unwrap();
        assert_rpc_ok(&unlock_vault(&mut router, "pw"));
        seed(&mut router);
        let name = blob_name(&router, &format!("/.passmanager/Login/{filename}"));
        let original = storage.read_chunk(&name).unwrap();
        // Match the catalog length so domain size checking does not mask the decoding failure.
        let original_plain = chromvoid_core::crypto::decrypt(
            &original,
            router.session().unwrap().vault_key(),
            name.as_bytes(),
        )
        .unwrap();
        let mut replacement = plain.to_vec();
        replacement.resize(original_plain.len(), b' ');
        let encrypted = chromvoid_core::crypto::encrypt(
            &replacement,
            router.session().unwrap().vault_key(),
            name.as_bytes(),
        )
        .unwrap();
        storage.write_chunk_atomic(&name, &encrypted).unwrap();
        let response = export(&mut router);
        assert!(!response.is_ok(), "invalid {filename} must fail");
        assert!(response.result().is_none());
    }
}
