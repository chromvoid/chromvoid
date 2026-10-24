use super::support::*;
use serde_json::{json, Value};

const PASSWORD: &str = "synthetic-keepass-password";
const FILES: [&[u8]; 2] = [
    include_bytes!("fixtures/keepass-3.kdbx"),
    include_bytes!("fixtures/keepass-4.kdbx"),
];

fn call(router: &mut RpcRouter, command: &str, data: Value) -> Value {
    let reply = router.handle(&RpcRequest::new(command, data));
    assert_rpc_ok(&reply);
    reply.result().unwrap().clone()
}

#[test]
fn keepass_versions_preserve_secrets_groups_otp_icons_and_identity_on_reimport() {
    for bytes in FILES {
        let (mut router, root) = create_test_router();
        assert_rpc_ok(&unlock_vault(&mut router, "synthetic keepass vault"));
        // The reference writer's two XML/inner-header attachment IDs must remain distinct.
        let db =
            keepass::Database::parse(bytes, keepass::DatabaseKey::new().with_password(PASSWORD))
                .unwrap();
        let mail = db
            .iter_all_entries()
            .find(|entry| entry.get_title() == Some("KeePass Mail"))
            .unwrap();
        let attachments: std::collections::BTreeMap<_, _> = mail
            .attachments_named()
            .map(|(name, attachment)| (name.to_owned(), attachment.data.get().clone()))
            .collect();
        assert_eq!(attachments["one.txt"], b"synthetic attachment one");
        assert_eq!(attachments["two.txt"], b"synthetic attachment two");
        for _ in 0..2 {
            let before = super::import_review_flows::storage_files(root.path());
            let (mut document, info) = router
                .prepare_credential_import_document_with_password(bytes, true, Some(PASSWORD))
                .unwrap();
            assert_eq!(info.source.as_deref(), Some("keepass"));
            assert_eq!(
                serde_json::to_value(info.warnings).unwrap(),
                json!([{"code":"attachments_omitted","count":2},{"code":"records_omitted","count":1}])
            );
            let preview = call(
                &mut router,
                "passmanager:root:import:preview",
                document.clone(),
            );
            assert_eq!(preview["entry_count"], 2);
            assert_eq!(
                super::import_review_flows::storage_files(root.path()),
                before
            );
            document["expected_revision"] = preview["revision"].clone();
            call(&mut router, "passmanager:root:import", document);
            let saved = call(&mut router, "passmanager:root:export", json!({}));
            let entries = saved["root"]["entries"].as_array().unwrap();
            assert_eq!(entries.len(), 2);
            let mail = entries
                .iter()
                .find(|entry| entry["title"] == "KeePass Mail")
                .unwrap();
            assert_eq!(mail["password"], "  synthetic, \"keepass\"\npassword  ");
            assert!(mail["note"].as_str().unwrap().contains("PIN: 0420"));
            assert_eq!(mail["otps"][0]["algorithm"], "SHA256");
            assert_eq!(mail["otps"][0]["digits"], 8);
            assert_eq!(mail["otps"][0]["period"], 60);
            assert_eq!(mail["folderPath"], "/Work/Team");
            assert!(mail["icon_ref"].as_str().unwrap().starts_with("sha256:"));
            let icons = call(&mut router, "passmanager:icon:list", json!({}));
            assert_eq!(icons["icons"].as_array().unwrap().len(), 1);
        }
    }
}

#[test]
fn keepass_password_errors_and_corruption_do_not_mutate_vault() {
    let (mut router, root) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic keepass errors"));
    let before = super::import_review_flows::storage_files(root.path());
    for bytes in FILES {
        let missing = router
            .prepare_credential_import_document(bytes, false)
            .err()
            .expect("expected rejected import");
        assert_eq!(missing.code(), Some("CREDENTIAL_IMPORT_PASSWORD_REQUIRED"));
        let wrong = router
            .prepare_credential_import_document_with_password(bytes, false, Some("wrong"))
            .err()
            .expect("expected rejected import");
        assert_eq!(wrong.code(), Some("CREDENTIAL_IMPORT_PASSWORD_INVALID"));
        let mut corrupt = bytes.to_vec();
        *corrupt.last_mut().unwrap() ^= 0xff;
        assert!(router
            .prepare_credential_import_document_with_password(&corrupt, false, Some(PASSWORD))
            .is_err());
    }
    assert_eq!(
        super::import_review_flows::storage_files(root.path()),
        before
    );
}

#[test]
fn keepass_excessive_aes_rounds_are_rejected_before_key_derivation() {
    let mut bytes = FILES[0].to_vec();
    let mut position = 12;
    loop {
        let kind = bytes[position];
        let length =
            u16::from_le_bytes(bytes[position + 1..position + 3].try_into().unwrap()) as usize;
        if kind == 6 {
            bytes[position + 3..position + 11].copy_from_slice(&u64::MAX.to_le_bytes());
            break;
        }
        assert_ne!(kind, 0);
        position += 3 + length;
    }
    let error =
        keepass::Database::parse(&bytes, keepass::DatabaseKey::new().with_password(PASSWORD))
            .err()
            .expect("expected rejected import");
    assert!(matches!(
        error,
        keepass::error::DatabaseOpenError::Cryptography(
            keepass::error::CryptographyError::ImportLimit
        )
    ));
}

#[test]
fn keepass_rejects_excessive_argon2_expansion_and_xml_depth() {
    let key = || keepass::DatabaseKey::new().with_password(PASSWORD);
    let kdf =
        keepass::Database::parse(include_bytes!("fixtures/keepass-excessive-kdf.kdbx"), key())
            .unwrap_err();
    assert!(matches!(
        kdf,
        keepass::error::DatabaseOpenError::Cryptography(
            keepass::error::CryptographyError::ImportLimit
        )
    ));
    for bytes in [
        include_bytes!("fixtures/keepass-expanded-limit.kdbx").as_slice(),
        include_bytes!("fixtures/keepass-depth-limit.kdbx").as_slice(),
    ] {
        assert!(bytes.len() < 128 * 1024);
        let error = keepass::Database::parse(bytes, key()).unwrap_err();
        assert!(
            error.to_string().contains("KDBX exceeds import limits"),
            "{error}"
        );
    }
}

#[test]
fn keepass_distinguishes_a_supplied_empty_password_from_a_missing_password() {
    let (mut router, _root) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic empty-password vault"));
    let bytes = include_bytes!("fixtures/keepass-empty-password.kdbx");
    let (_, info) = router
        .prepare_credential_import_document_with_password(bytes, true, Some(""))
        .unwrap();
    assert_eq!(info.source.as_deref(), Some("keepass"));
    assert_eq!(
        router
            .prepare_credential_import_document(bytes, true)
            .err()
            .expect("missing password must fail")
            .code(),
        Some("CREDENTIAL_IMPORT_PASSWORD_REQUIRED")
    );
}

#[test]
fn keepass_opens_an_independently_derived_argon2id_database() {
    let (mut router, _root) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic argon2id vault"));
    let (document, info) = router
        .prepare_credential_import_document_with_password(
            include_bytes!("fixtures/keepass-argon2id.kdbx"),
            true,
            Some(PASSWORD),
        )
        .unwrap();
    assert_eq!(info.source.as_deref(), Some("keepass"));
    assert_eq!(document["entries"].as_array().unwrap().len(), 1);
    assert_eq!(
        document["entries"][0]["password"],
        "synthetic Argon2id secret"
    );
}
