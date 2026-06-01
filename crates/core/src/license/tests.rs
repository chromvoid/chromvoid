use std::collections::BTreeMap;
use std::path::PathBuf;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::Utc;
use ed25519_dalek::{Signer, SigningKey, VerifyingKey};

use super::store::CORE_INSTANCE_ID_FILE;
use super::*;
use crate::durable_file::fault::{DurableFileOperation, FaultRule};

fn cert_for(store: &LicenseStore, signing_key: &SigningKey, featureset: &str) -> SignedCert {
    cert_for_with_id(store, signing_key, featureset, "license-test")
}

fn cert_for_with_id(
    store: &LicenseStore,
    signing_key: &SigningKey,
    featureset: &str,
    license_id: &str,
) -> SignedCert {
    let payload = LicenseCert {
        v: 1,
        kid: LICENSE_KEY_ID_2026_01.to_string(),
        license_id: license_id.to_string(),
        featureset: featureset.to_string(),
        seat_limit: 3,
        device_fingerprint: store.device_fingerprint().expect("fingerprint"),
        issued_at: "2026-05-11T00:00:00Z".to_string(),
        exp: None,
        source: None,
    };
    let payload_bytes = serde_json::to_vec(&payload).expect("payload");
    let signature = signing_key.sign(&payload_bytes);
    SignedCert {
        payload,
        signature: URL_SAFE_NO_PAD.encode(signature.to_bytes()),
    }
}

fn trusted_keys(signing_key: &SigningKey) -> BTreeMap<String, VerifyingKey> {
    let mut keys = BTreeMap::new();
    keys.insert(
        LICENSE_KEY_ID_2026_01.to_string(),
        signing_key.verifying_key(),
    );
    keys
}

fn store_with_key(root: PathBuf, signing_key: &SigningKey) -> LicenseStore {
    LicenseStore::with_trusted_keys(root, BuildPolicy::Enforce, trusted_keys(signing_key))
}

fn fault_store_with_key(
    root: PathBuf,
    signing_key: &SigningKey,
    operation: DurableFileOperation,
) -> (LicenseStore, crate::durable_file::fault::FaultHandle) {
    let (files, handle) = crate::durable_file::DurableFileStore::fault_injecting_for_tests(
        root,
        Some(FaultRule {
            operation,
            fail_on: 1,
        }),
    );
    (
        LicenseStore::with_file_store_for_tests(
            files,
            BuildPolicy::Enforce,
            trusted_keys(signing_key),
        ),
        handle,
    )
}

#[test]
fn status_is_free_without_cert() {
    let temp = tempfile::tempdir().expect("tempdir");
    let signing_key = SigningKey::from_bytes(&[7u8; 32]);
    let store = store_with_key(temp.path().to_path_buf(), &signing_key);

    let status = store.status();
    assert!(!status.licensed);
    assert_eq!(status.plan, LicensePlan::Free);
    assert!(status.feature_keys.is_empty());
}

#[test]
fn install_accepts_valid_pro_cert() {
    let temp = tempfile::tempdir().expect("tempdir");
    let signing_key = SigningKey::from_bytes(&[7u8; 32]);
    let store = store_with_key(temp.path().to_path_buf(), &signing_key);
    let cert = cert_for(&store, &signing_key, "pro");

    let status = store.install_cert(cert).expect("install");
    assert!(status.licensed);
    assert_eq!(status.plan, LicensePlan::Pro);
    assert!(status
        .feature_keys
        .contains(&PRO_FEATURE_REMOTE.to_string()));
    assert!(store.status().licensed);
}

#[test]
fn current_cert_returns_installed_cert() {
    let temp = tempfile::tempdir().expect("tempdir");
    let signing_key = SigningKey::from_bytes(&[7u8; 32]);
    let store = store_with_key(temp.path().to_path_buf(), &signing_key);
    let cert = cert_for(&store, &signing_key, "pro");

    store.install_cert(cert.clone()).expect("install");

    let current = store.current_cert().expect("current cert");
    assert_eq!(current.payload.license_id, cert.payload.license_id);
    assert_eq!(
        current.payload.device_fingerprint,
        cert.payload.device_fingerprint
    );
}

#[test]
fn uninstall_cert_removes_local_entitlement() {
    let temp = tempfile::tempdir().expect("tempdir");
    let signing_key = SigningKey::from_bytes(&[7u8; 32]);
    let store = store_with_key(temp.path().to_path_buf(), &signing_key);
    let cert = cert_for(&store, &signing_key, "pro");

    store.install_cert(cert).expect("install");
    assert!(store.status().licensed);

    let status = store.uninstall_cert().expect("uninstall");
    assert!(!status.licensed);
    assert!(!store.status().licensed);

    let repeated = store.uninstall_cert().expect("repeat uninstall");
    assert!(!repeated.licensed);
}

#[test]
fn first_install_write_fault_leaves_status_free() {
    let temp = tempfile::tempdir().expect("tempdir");
    let signing_key = SigningKey::from_bytes(&[7u8; 32]);
    let setup_store = store_with_key(temp.path().to_path_buf(), &signing_key);
    let cert = cert_for(&setup_store, &signing_key, "pro");
    let (fault_store, _handle) = fault_store_with_key(
        temp.path().to_path_buf(),
        &signing_key,
        DurableFileOperation::WriteTemp,
    );

    assert!(fault_store.install_cert(cert).is_err());
    assert!(!fault_store.status().licensed);
}

#[test]
fn replacement_install_rename_fault_preserves_existing_cert() {
    let temp = tempfile::tempdir().expect("tempdir");
    let signing_key = SigningKey::from_bytes(&[7u8; 32]);
    let store = store_with_key(temp.path().to_path_buf(), &signing_key);
    let old_cert = cert_for_with_id(&store, &signing_key, "pro", "license-old");
    store.install_cert(old_cert.clone()).expect("install old");
    let new_cert = cert_for_with_id(&store, &signing_key, "pro", "license-new");
    let (fault_store, _handle) = fault_store_with_key(
        temp.path().to_path_buf(),
        &signing_key,
        DurableFileOperation::RenameTemp,
    );

    assert!(fault_store.install_cert(new_cert).is_err());
    let current = fault_store.current_cert().expect("current cert");
    assert_eq!(current.payload.license_id, old_cert.payload.license_id);
    assert!(fault_store.status().licensed);
}

#[test]
fn core_instance_id_write_fault_retries_cleanly() {
    let temp = tempfile::tempdir().expect("tempdir");
    let signing_key = SigningKey::from_bytes(&[7u8; 32]);
    let (fault_store, _handle) = fault_store_with_key(
        temp.path().to_path_buf(),
        &signing_key,
        DurableFileOperation::WriteTemp,
    );

    assert!(fault_store.device_fingerprint().is_err());
    assert!(!temp.path().join(CORE_INSTANCE_ID_FILE).exists());

    let retry_store = store_with_key(temp.path().to_path_buf(), &signing_key);
    let first = retry_store.device_fingerprint().expect("fingerprint");
    let second = retry_store.device_fingerprint().expect("fingerprint again");
    assert_eq!(first, second);
}

#[test]
fn uninstall_remove_fault_is_retryable() {
    let temp = tempfile::tempdir().expect("tempdir");
    let signing_key = SigningKey::from_bytes(&[7u8; 32]);
    let store = store_with_key(temp.path().to_path_buf(), &signing_key);
    let cert = cert_for(&store, &signing_key, "pro");
    store.install_cert(cert).expect("install");
    let (fault_store, _handle) = fault_store_with_key(
        temp.path().to_path_buf(),
        &signing_key,
        DurableFileOperation::Remove,
    );

    assert!(fault_store.uninstall_cert().is_err());
    assert!(store.status().licensed);

    let status = store.uninstall_cert().expect("retry uninstall");
    assert!(!status.licensed);
}

#[test]
fn uninstall_parent_sync_fault_returns_error_and_retry_succeeds() {
    let temp = tempfile::tempdir().expect("tempdir");
    let signing_key = SigningKey::from_bytes(&[7u8; 32]);
    let store = store_with_key(temp.path().to_path_buf(), &signing_key);
    let cert = cert_for(&store, &signing_key, "pro");
    store.install_cert(cert).expect("install");
    let (fault_store, _handle) = fault_store_with_key(
        temp.path().to_path_buf(),
        &signing_key,
        DurableFileOperation::SyncParent,
    );

    assert!(fault_store.uninstall_cert().is_err());
    let retry = store.uninstall_cert().expect("retry uninstall");
    assert!(!retry.licensed);
}

#[test]
fn install_accepts_expiring_account_cert() {
    let temp = tempfile::tempdir().expect("tempdir");
    let signing_key = SigningKey::from_bytes(&[7u8; 32]);
    let store = store_with_key(temp.path().to_path_buf(), &signing_key);
    let mut cert = cert_for(&store, &signing_key, "pro");
    cert.payload.exp = Some((Utc::now() + chrono::Duration::days(1)).to_rfc3339());
    cert.payload.source = Some("account".to_string());
    let payload_bytes = serde_json::to_vec(&cert.payload).expect("payload");
    cert.signature = URL_SAFE_NO_PAD.encode(signing_key.sign(&payload_bytes).to_bytes());

    let status = store.install_cert(cert).expect("install");

    assert!(status.licensed);
    assert_eq!(status.plan, LicensePlan::Pro);
}

#[test]
fn install_rejects_expired_account_cert() {
    let temp = tempfile::tempdir().expect("tempdir");
    let signing_key = SigningKey::from_bytes(&[7u8; 32]);
    let store = store_with_key(temp.path().to_path_buf(), &signing_key);
    let mut cert = cert_for(&store, &signing_key, "pro");
    cert.payload.exp = Some((Utc::now() - chrono::Duration::days(1)).to_rfc3339());
    cert.payload.source = Some("account".to_string());
    let payload_bytes = serde_json::to_vec(&cert.payload).expect("payload");
    cert.signature = URL_SAFE_NO_PAD.encode(signing_key.sign(&payload_bytes).to_bytes());

    let error = store
        .install_cert(cert)
        .expect_err("expired cert must fail");

    assert_eq!(error, "License cert expired");
}

#[test]
fn install_rejects_missing_trusted_public_key() {
    let temp = tempfile::tempdir().expect("tempdir");
    let signing_key = SigningKey::from_bytes(&[7u8; 32]);
    let store = store_with_key(temp.path().to_path_buf(), &signing_key);
    let cert = cert_for(&store, &signing_key, "pro");
    let empty_store = LicenseStore::with_trusted_keys(
        temp.path().to_path_buf(),
        BuildPolicy::Enforce,
        BTreeMap::new(),
    );

    let error = empty_store
        .install_cert(cert)
        .expect_err("missing public key must fail");

    assert_eq!(error, "No trusted license public key configured");
}

#[test]
fn install_rejects_bad_signature() {
    let temp = tempfile::tempdir().expect("tempdir");
    let signing_key = SigningKey::from_bytes(&[7u8; 32]);
    let store = store_with_key(temp.path().to_path_buf(), &signing_key);
    let other_key = SigningKey::from_bytes(&[8u8; 32]);
    let cert = cert_for(&store, &other_key, "pro");

    assert!(store.install_cert(cert).is_err());
    assert!(!store.status().licensed);
}

#[test]
fn install_rejects_fingerprint_mismatch() {
    let temp = tempfile::tempdir().expect("tempdir");
    let signing_key = SigningKey::from_bytes(&[7u8; 32]);
    let store = store_with_key(temp.path().to_path_buf(), &signing_key);
    let mut cert = cert_for(&store, &signing_key, "pro");
    cert.payload.device_fingerprint = "different".to_string();
    let payload_bytes = serde_json::to_vec(&cert.payload).expect("payload");
    cert.signature = URL_SAFE_NO_PAD.encode(signing_key.sign(&payload_bytes).to_bytes());

    assert!(store.install_cert(cert).is_err());
    assert!(!store.status().licensed);
}

#[test]
fn bypass_policy_does_not_grant_pro_access() {
    let temp = tempfile::tempdir().expect("tempdir");
    let store = LicenseStore::new(temp.path().to_path_buf(), BuildPolicy::Bypass);

    let status = store.status();
    assert!(!status.licensed);
    assert_eq!(status.plan, LicensePlan::Free);
    assert!(!store.is_pro_enabled_for_guards());
}

#[test]
fn default_build_policy_is_enforce() {
    assert_eq!(BuildPolicy::default_for_build(), BuildPolicy::Enforce);
}
