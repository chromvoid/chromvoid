use super::support::*;
use base64::{engine::general_purpose, Engine as _};
use serde_json::{json, Value};
use std::io::Write;

const FIXTURE: &[u8] = include_bytes!("fixtures/1password-credentials.1pux");
fn archive(files: &[(&str, Vec<u8>)]) -> Vec<u8> {
    let mut bytes = Vec::new();
    let mut zip = rawzip::ZipArchiveWriter::new(&mut bytes);
    for (name, bytes) in files {
        let (mut entry, config) = zip
            .new_file(*name)
            .compression_method(rawzip::CompressionMethod::DEFLATE)
            .start()
            .unwrap();
        let encoder = flate2::write::DeflateEncoder::new(&mut entry, flate2::Compression::fast());
        let mut writer = config.wrap(encoder);
        writer.write_all(bytes).unwrap();
        let (encoder, descriptor) = writer.finish().unwrap();
        encoder.finish().unwrap();
        entry.finish(descriptor).unwrap();
    }
    zip.finish().unwrap();
    bytes
}
fn document(data: Value) -> Vec<u8> {
    archive(&[
        ("export.attributes", br#"{"version":3}"#.to_vec()),
        ("export.data", serde_json::to_vec(&data).unwrap()),
    ])
}
fn call(router: &mut RpcRouter, command: &str, data: Value) -> Value {
    let result = router.handle(&RpcRequest::new(command, data));
    assert_rpc_ok(&result);
    result.result().unwrap().clone()
}
#[test]
fn onepassword_import_preserves_credentials_otp_fields_groups_and_icons_without_id_collisions() {
    let (mut router, root) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic 1password"));
    for _ in 0..2 {
        let before = super::import_review_flows::storage_files(root.path());
        let (mut data, info) = router
            .prepare_credential_import_document(FIXTURE, true)
            .unwrap();
        assert_eq!(info.source.as_deref(), Some("1password"));
        assert_eq!(
            serde_json::to_value(&info.warnings).unwrap(),
            json!([{"code":"attachments_omitted","count":2},{"code":"icons_omitted","count":1}])
        );
        let preview = call(&mut router, "passmanager:root:import:preview", data.clone());
        assert_eq!(preview["entry_count"], 7);
        assert_eq!(
            super::import_review_flows::storage_files(root.path()),
            before
        );
        data["expected_revision"] = preview["revision"].clone();
        call(&mut router, "passmanager:root:import", data);
        let saved = call(&mut router, "passmanager:root:export", json!({}));
        let entries = saved["root"]["entries"].as_array().unwrap();
        assert_eq!(entries.len(), 7);
        let ids: std::collections::BTreeSet<_> = entries
            .iter()
            .map(|entry| entry["id"].as_str().unwrap())
            .collect();
        assert_eq!(ids.len(), 7);
        let mail = entries
            .iter()
            .find(|entry| entry["username"] == "alice@example.test")
            .unwrap();
        assert_eq!(mail["password"], "  synthetic, \"one\"\npassword  ");
        assert!(mail["note"].as_str().unwrap().contains("PIN: 0420"));
        assert!(mail["note"].as_str().unwrap().starts_with("1Password note"));
        assert_eq!(
            mail["urls"],
            json!([{"value":"https://example.test","match":"exact"}])
        );
        assert_eq!(mail["otps"][0]["algorithm"], "SHA256");
        assert_eq!(mail["otps"][0]["digits"], 8);
        assert_eq!(mail["otps"][0]["period"], 60);
        assert!(entries
            .iter()
            .any(|entry| entry["password"] == "separate vault"));
        assert!(entries
            .iter()
            .any(|entry| entry["password"] == "separate account"));
        assert!(entries.iter().any(|entry| entry["note"]
            .as_str()
            .is_some_and(|note| note.contains("Synthetic Street"))));
        assert!(entries.iter().any(|entry| entry["note"]
            .as_str()
            .is_some_and(|note| note.contains("4111111111111111"))));
        assert_eq!(
            saved["root"]["foldersMeta"][0]["description"],
            "Imported vault description"
        );
        let icons = call(&mut router, "passmanager:icon:list", json!({}));
        let icons = icons["icons"].as_array().unwrap();
        assert_eq!(icons.len(), 3);
        assert!(icons
            .iter()
            .any(|icon| icon["width"] == 128 && icon["height"] == 64));
        assert!(icons.iter().any(|icon| icon["width"] == 96
            && icon["height"] == 48
            && icon["mime_type"] == "image/png"));
        let icon = call(
            &mut router,
            "passmanager:icon:get",
            json!({"icon_ref":mail["icon_ref"]}),
        );
        let bytes = general_purpose::STANDARD_NO_PAD
            .decode(icon["content_base64"].as_str().unwrap())
            .unwrap();
        let decoded = image::load_from_memory(&bytes).unwrap().to_rgba8();
        assert_eq!(decoded.dimensions(), (128, 64));
        assert_eq!(decoded.get_pixel(32, 32).0, [20, 170, 190, 255]);
    }
}
#[test]
fn onepassword_invalid_archives_and_unsupported_only_records_cannot_prepare_replacement() {
    let (mut router, root) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic invalid 1password"));
    let before = super::import_review_flows::storage_files(root.path());
    let single = json!({"accounts":[{"attrs":{"uuid":"a"},"vaults":[{"attrs":{"uuid":"v"},"items":[{"uuid":"item","categoryUuid":"006"}]}]}]});
    let mut duplicate = single.clone();
    let item = duplicate["accounts"][0]["vaults"][0]["items"][0].clone();
    duplicate["accounts"][0]["vaults"][0]["items"]
        .as_array_mut()
        .unwrap()
        .push(item);
    let wrong_version = archive(&[
        ("export.attributes", br#"{"version":99}"#.to_vec()),
        ("export.data", br#"{"accounts":[]}"#.to_vec()),
    ]);
    let duplicate_name = archive(&[
        ("export.attributes", br#"{"version":3}"#.to_vec()),
        ("export.data", br#"{"accounts":[]}"#.to_vec()),
        ("export.data", br#"{"accounts":[]}"#.to_vec()),
    ]);
    for bytes in [
        document(single),
        document(duplicate),
        document(json!({"accounts":[{"vaults":"bad"}]})),
        wrong_version,
        duplicate_name,
        b"PK\x03\x04broken".to_vec(),
    ] {
        assert!(router
            .prepare_credential_import_document(&bytes, false)
            .is_err());
        assert_eq!(
            super::import_review_flows::storage_files(root.path()),
            before
        );
    }
    let (empty, _) = router
        .prepare_credential_import_document(&document(json!({"accounts":[]})), false)
        .unwrap();
    assert_eq!(empty["entries"], json!([]));
}
#[test]
fn onepassword_expansion_limit_and_corrupt_compressed_data_fail_before_writes() {
    let (mut router, root) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic bounded 1password"));
    let before = super::import_review_flows::storage_files(root.path());
    let bomb = document(json!({"accounts":[],"padding":"x".repeat(16*1024*1024)}));
    assert!(bomb.len() < 1024 * 1024);
    assert!(router
        .prepare_credential_import_document(&bomb, false)
        .is_err());
    let mut corrupt = FIXTURE.to_vec();
    let zip = rawzip::ZipArchive::from_slice(corrupt.as_slice()).unwrap();
    let mut entries = zip.entries();
    let first = entries.next_entry().unwrap().unwrap();
    let (start, end) = zip
        .get_entry(first.wayfinder())
        .unwrap()
        .compressed_data_range();
    corrupt[((start + end) / 2) as usize] ^= 0xff;
    assert!(router
        .prepare_credential_import_document(&corrupt, false)
        .is_err());
    assert_eq!(
        super::import_review_flows::storage_files(root.path()),
        before
    );
}
#[test]
fn onepassword_invalid_otp_remains_in_note_with_warning() {
    let (mut router, _root) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "synthetic otp 1password"));
    let data = json!({"accounts":[{"vaults":[{"items":[{"categoryUuid":"001","overview":{"title":"OTP"},"details":{"sections":[{"fields":[{"id":"totp","value":{"totp":"otpauth://totp/?secret=invalid!"}}]}]}}]}]}]});
    let (data, info) = router
        .prepare_credential_import_document(&document(data), true)
        .unwrap();
    assert!(data["entries"][0]["note"]
        .as_str()
        .unwrap()
        .contains("otpauth://totp/?secret=invalid!"));
    assert_eq!(
        info.warnings[0].code,
        chromvoid_core::rpc::types::CredentialImportWarningCode::OtpInNote
    );
}
