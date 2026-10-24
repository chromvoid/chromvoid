use super::*;
use chromvoid_core::crypto::keystore::{InMemoryKeystore, Keystore, KeystoreError};
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{
    RpcInputStream, RpcReply, RpcRouter, StorageMutationError, StorageMutationGuard,
};
use chromvoid_core::storage::Storage;
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::sync::{Arc, Once};

const PASSWORD: &str = "synthetic adoption password";
const SECRET: &str = "synthetic credential secret";
const NOTE: &[u8] = b"# Synthetic note\n\nThe note survives Android replacement.\n";
const FILE: &[u8] = b"\x00\x01synthetic encrypted file contents\xff\xfe";

struct Fixture {
    _temporary: tempfile::TempDir,
    data: PathBuf,
    old: PathBuf,
    new: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let temporary = tempfile::tempdir().unwrap();
        let data = temporary.path().join("com.chromvoid.app");
        fs::create_dir_all(data.join("files")).unwrap();
        Self {
            old: data.join("storage"),
            new: data.join("files/ChromVoidAir"),
            data,
            _temporary: temporary,
        }
    }

    fn storage(&self) {
        drop(Storage::new(&self.old).unwrap());
        fs::write(self.old.join("salt"), [19; chromvoid_core::SALT_SIZE]).unwrap();
    }

    fn host_mode(&self) {
        fs::write(
            self.old.join("mobile_host_mode.json"),
            serde_json::to_vec(&json!({
                "relay_url":"wss://relay.example.test", "device_label":"Synthetic Tauri phone",
                "enabled":true,"updated_at":123456
            }))
            .unwrap(),
        )
        .unwrap();
    }

    fn disposable_and_unknown(&self) {
        for directory in [
            "logs",
            "app_webview",
            "cache",
            "code_cache",
            "license_vault",
            "unknown",
        ] {
            fs::create_dir_all(self.data.join(directory)).unwrap();
            fs::write(
                self.data.join(directory).join("retained-until-success"),
                directory,
            )
            .unwrap();
        }
        fs::write(
            self.data.join("session_settings.json"),
            b"must not import R4b settings",
        )
        .unwrap();
    }

    fn adopt(&self) -> Result<(), AdoptionError> {
        adopt(&self.data, &self.new, || Ok(()))
    }
}

#[derive(Debug, PartialEq, Eq)]
enum Entry {
    Directory,
    File(Vec<u8>),
    Symlink(PathBuf),
}

fn tree(root: &Path) -> BTreeMap<PathBuf, Entry> {
    fn visit(root: &Path, path: &Path, entries: &mut BTreeMap<PathBuf, Entry>) {
        for entry in fs::read_dir(path).unwrap() {
            let path = entry.unwrap().path();
            let relative = path.strip_prefix(root).unwrap().to_path_buf();
            let metadata = fs::symlink_metadata(&path).unwrap();
            if metadata.file_type().is_symlink() {
                entries.insert(relative, Entry::Symlink(fs::read_link(path).unwrap()));
            } else if metadata.is_dir() {
                entries.insert(relative, Entry::Directory);
                visit(root, &path, entries);
            } else {
                entries.insert(relative, Entry::File(fs::read(path).unwrap()));
            }
        }
    }
    let mut entries = BTreeMap::new();
    visit(root, root, &mut entries);
    entries
}

fn hash_files(root: &Path) -> BTreeMap<PathBuf, blake3::Hash> {
    tree(root)
        .into_iter()
        .filter_map(|(path, entry)| match entry {
            Entry::File(bytes) => Some((path, blake3::hash(&bytes))),
            _ => None,
        })
        .collect()
}

fn assert_ok(response: RpcResponse) -> Value {
    assert!(response.is_ok(), "RPC failed: {response:?}");
    response.result().unwrap().clone()
}

fn rpc(router: &mut RpcRouter, command: &str, data: Value) -> Value {
    assert_ok(router.handle(&RpcRequest::new(command, data)))
}

fn unlock(router: &mut RpcRouter) {
    static FAST_KDF: Once = Once::new();
    FAST_KDF.call_once(|| {
        // This host-only fixture opts into Core's existing debug KDF parameters
        // before its first derivation, as client-runtime's test setup does.
        unsafe { std::env::set_var("CHROMVOID_TEST_FAST_KDF", "1") };
    });
    rpc(router, "vault:unlock", json!({"password":PASSWORD}));
}

fn upload(router: &mut RpcRouter, name: &str, contents: &[u8], mime: &str) -> u64 {
    let reply = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:upload",
            json!({
                "parent_path":"/", "name":name, "size":contents.len(),
                "total_size":contents.len(), "offset":0, "mime_type":mime
            }),
        ),
        Some(RpcInputStream::from_bytes(contents.to_vec())),
    );
    let RpcReply::Json(response) = reply else {
        panic!("upload must return JSON")
    };
    assert_ok(response)["node_id"].as_u64().unwrap()
}

fn download(router: &mut RpcRouter, node_id: u64) -> Vec<u8> {
    let reply = router.handle_with_stream(
        &RpcRequest::new("catalog:download", json!({"node_id":node_id})),
        None,
    );
    let RpcReply::Stream(mut stream) = reply else {
        panic!("download must return a stream")
    };
    let mut contents = Vec::new();
    stream.reader.read_to_end(&mut contents).unwrap();
    contents
}

fn open(root: &Path, key: Arc<dyn Keystore>) -> RpcRouter {
    RpcRouter::new(Storage::new(root).unwrap()).with_keystore(key)
}

fn open_adopted(fixture: &Fixture, key: Arc<dyn Keystore>) -> RpcRouter {
    let data = fixture.data.clone();
    let root = fixture.new.clone();
    open(&fixture.new, key)
        .with_master_key(PASSWORD)
        .with_storage_mutation_guard(StorageMutationGuard::new(move || {
            check_destructive_allowed(&data, &root)
                .map_err(|_| StorageMutationError::AdoptionRequired)
        }))
}

fn adopted_vault(in_place: bool) -> (Fixture, Arc<InMemoryKeystore>) {
    let fixture = Fixture::new();
    let key = Arc::new(InMemoryKeystore::new());
    let mut original = open(&fixture.old, key.clone());
    unlock(&mut original);
    rpc(
        &mut original,
        "master:setup",
        json!({"master_password":PASSWORD}),
    );
    upload(&mut original, "Synthetic note.md", NOTE, "text/markdown");
    original.save().unwrap();
    rpc(&mut original, "vault:lock", json!({}));
    drop(original);
    if in_place {
        fs::rename(&fixture.old, &fixture.new).unwrap();
        fs::write(
            fixture.data.join("storage.json"),
            serde_json::to_vec(&json!({"storage_root":fixture.new})).unwrap(),
        )
        .unwrap();
    }
    adopt(&fixture.data, &fixture.new, || {
        key.load_storage_pepper()
            .ok()
            .flatten()
            .map(|_| ())
            .ok_or(AdoptionError::PepperUnavailable)
    })
    .unwrap();
    (fixture, key)
}

fn assert_completed_retry_is_read_only(fixture: &Fixture) {
    let before = tree(&fixture.data);
    adopt(&fixture.data, &fixture.new, || {
        panic!("completed adoption leaves pepper and recovery to Core")
    })
    .unwrap();
    assert_eq!(tree(&fixture.data), before);
}

#[test]
fn synthetic_tauri_credential_note_and_file_retain_ciphertext_and_content_hashes() {
    let fixture = Fixture::new();
    let key = Arc::new(InMemoryKeystore::new());
    let mut original = open(&fixture.old, key.clone());
    unlock(&mut original);
    rpc(
        &mut original,
        "passmanager:entry:create",
        json!({
            "entry_id":"adopted-credential", "entry_type":"login", "title":"Synthetic Tauri credential",
            "username":"synthetic@example.test", "secrets":{"password":SECRET}
        }),
    );
    let note = upload(&mut original, "Synthetic note.md", NOTE, "text/markdown");
    let file = upload(
        &mut original,
        "synthetic.bin",
        FILE,
        "application/octet-stream",
    );
    original.save().unwrap();
    rpc(&mut original, "vault:lock", json!({}));
    drop(original);
    fixture.host_mode();
    fixture.disposable_and_unknown();
    let before = hash_files(&fixture.old);
    let pepper = key.load_storage_pepper().unwrap();

    adopt(&fixture.data, &fixture.new, || {
        key.load_storage_pepper()
            .ok()
            .flatten()
            .map(|_| ())
            .ok_or(AdoptionError::PepperUnavailable)
    })
    .unwrap();
    assert!(!fixture.old.exists());
    let after = hash_files(&fixture.new);
    for (path, hash) in before {
        assert_eq!(
            after.get(&path),
            Some(&hash),
            "changed adopted file {path:?}"
        );
    }
    let converted: Value =
        serde_json::from_slice(&fs::read(fixture.new.join("ios_host_mode.json")).unwrap()).unwrap();
    assert_eq!(
        converted,
        json!({"relay_url":"wss://relay.example.test", "enabled":true,"updated_at":123456})
    );
    let journal: Journal =
        serde_json::from_slice(&fs::read(fixture.data.join(JOURNAL)).unwrap()).unwrap();
    assert_eq!(journal.step, Step::Complete);
    assert!(journal.started_at > 0 && journal.updated_at >= journal.started_at);
    assert!(journal.device_label_dropped);
    assert_eq!(
        journal
            .steps
            .iter()
            .map(|entry| entry.step)
            .collect::<Vec<_>>(),
        [
            Step::Prepared,
            Step::Renamed,
            Step::HostModeConverted,
            Step::Complete
        ]
    );
    assert!(
        journal
            .steps
            .iter()
            .all(|entry| entry.at >= journal.started_at)
    );
    for directory in DISPOSABLE_DIRECTORIES {
        assert!(!fixture.data.join(directory).exists());
    }
    for retained in [
        "code_cache/retained-until-success",
        "license_vault/retained-until-success",
        "unknown/retained-until-success",
        "session_settings.json",
    ] {
        assert!(fixture.data.join(retained).is_file());
    }
    assert_eq!(key.load_storage_pepper().unwrap(), pepper);
    assert_eq!(
        check_destructive_allowed(&fixture.data, &fixture.new),
        Ok(())
    );

    let mut adopted = open(&fixture.new, key);
    unlock(&mut adopted);
    assert_eq!(
        rpc(&mut adopted, "passmanager:entry:list", json!({}))["entries"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    let secret = rpc(
        &mut adopted,
        "passmanager:secret:read",
        json!({"entry_id":"adopted-credential", "secret_type":"password"}),
    );
    assert_eq!(
        blake3::hash(secret["value"].as_str().unwrap().as_bytes()),
        blake3::hash(SECRET.as_bytes())
    );
    assert_eq!(
        blake3::hash(&download(&mut adopted, note)),
        blake3::hash(NOTE)
    );
    assert_eq!(
        blake3::hash(&download(&mut adopted, file)),
        blake3::hash(FILE)
    );
}

#[cfg(unix)]
#[test]
fn skipped_disposable_symlinks_do_not_block_adoption_or_follow_external_targets() {
    use std::os::unix::fs::symlink;

    for skipped in ["cache", "logs"] {
        let fixture = Fixture::new();
        let key = Arc::new(InMemoryKeystore::new());
        let mut original = open(&fixture.old, key.clone());
        unlock(&mut original);
        let file = upload(
            &mut original,
            "synthetic.bin",
            FILE,
            "application/octet-stream",
        );
        original.save().unwrap();
        rpc(&mut original, "vault:lock", json!({}));
        drop(original);
        fixture.host_mode();
        fixture.disposable_and_unknown();
        let vault_before = hash_files(&fixture.old);
        let pepper_before = key.load_storage_pepper().unwrap();

        let external = tempfile::tempdir().unwrap();
        fs::write(external.path().join("retained"), b"external data").unwrap();
        let external_before = tree(external.path());
        let link = fixture.data.join(skipped);
        fs::remove_dir_all(&link).unwrap();
        symlink(external.path(), &link).unwrap();

        adopt(&fixture.data, &fixture.new, || {
            key.load_storage_pepper()
                .unwrap()
                .map(|_| ())
                .ok_or(AdoptionError::PepperUnavailable)
        })
        .unwrap();

        assert!(!fixture.old.exists());
        let journal = read_journal(&fixture.data, &fixture.new).unwrap().unwrap();
        assert_eq!(journal.step, Step::Complete);
        assert_eq!(journal.cleanup_failed, [skipped]);
        let vault_after = hash_files(&fixture.new);
        for (path, hash) in vault_before {
            assert_eq!(vault_after.get(&path), Some(&hash));
        }
        assert_eq!(fs::read_link(&link).unwrap(), external.path());
        assert_eq!(tree(external.path()), external_before);
        for cleaned in ["logs", "app_webview", "cache"] {
            if cleaned != skipped {
                assert!(!fixture.data.join(cleaned).exists());
            }
        }
        for retained in ["code_cache", "license_vault", "unknown"] {
            assert_eq!(
                fs::read(fixture.data.join(retained).join("retained-until-success")).unwrap(),
                retained.as_bytes()
            );
        }

        let mut adopted = open_adopted(&fixture, key.clone());
        unlock(&mut adopted);
        assert_eq!(download(&mut adopted, file), FILE);
        drop(adopted);
        assert_eq!(key.load_storage_pepper().unwrap(), pepper_before);

        // A completed adoption is not a recurring cleanup job, including for
        // disposable directories created later by Air itself.
        fs::create_dir(fixture.data.join("app_webview")).unwrap();
        fs::write(
            fixture.data.join("app_webview/new-air-data"),
            b"created after adoption",
        )
        .unwrap();
        assert_completed_retry_is_read_only(&fixture);
        assert_eq!(fs::read_link(&link).unwrap(), external.path());
        assert_eq!(tree(external.path()), external_before);

        fs::remove_file(&link).unwrap();
        fs::create_dir(&link).unwrap();
        fs::write(link.join("new-air-data"), b"created after adoption").unwrap();
        assert_completed_retry_is_read_only(&fixture);
        assert_eq!(tree(external.path()), external_before);
    }
}

#[test]
fn disposable_nondirectory_is_journaled_and_left_untouched_without_blocking_adoption() {
    let fixture = Fixture::new();
    fixture.storage();
    fixture.disposable_and_unknown();
    fs::remove_dir_all(fixture.data.join("logs")).unwrap();
    fs::write(fixture.data.join("logs"), b"unknown file retained").unwrap();

    fixture.adopt().unwrap();

    let journal = read_journal(&fixture.data, &fixture.new).unwrap().unwrap();
    assert_eq!(journal.step, Step::Complete);
    assert_eq!(journal.cleanup_failed, ["logs"]);
    assert_eq!(
        fs::read(fixture.data.join("logs")).unwrap(),
        b"unknown file retained"
    );
    assert!(!fixture.data.join("app_webview").exists());
    assert!(!fixture.data.join("cache").exists());
    assert!(
        fixture
            .data
            .join("code_cache/retained-until-success")
            .is_file()
    );
    assert_completed_retry_is_read_only(&fixture);
}

#[cfg(unix)]
#[test]
fn journals_without_cleanup_failures_remain_compatible_for_resume_and_completed_retry() {
    use std::os::unix::fs::symlink;

    for checkpoint in [Checkpoint::HostModeConverted, Checkpoint::Complete] {
        let fixture = Fixture::new();
        fixture.storage();
        fixture.host_mode();
        fixture.disposable_and_unknown();
        let external = tempfile::tempdir().unwrap();
        fs::write(external.path().join("retained"), b"external data").unwrap();
        let external_before = tree(external.path());
        if checkpoint == Checkpoint::HostModeConverted {
            fs::remove_dir_all(fixture.data.join("logs")).unwrap();
            symlink(external.path(), fixture.data.join("logs")).unwrap();
        }
        assert_eq!(
            adopt_with_checkpoints(
                &fixture.data,
                &fixture.new,
                || Ok(()),
                |step| {
                    if step == checkpoint {
                        Err(AdoptionError::StorageUnavailable)
                    } else {
                        Ok(())
                    }
                },
            ),
            Err(AdoptionError::StorageUnavailable)
        );
        let path = fixture.data.join(JOURNAL);
        let mut journal: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        journal.as_object_mut().unwrap().remove("cleanup_failed");
        fs::write(&path, serde_json::to_vec_pretty(&journal).unwrap()).unwrap();
        assert!(
            read_journal(&fixture.data, &fixture.new)
                .unwrap()
                .unwrap()
                .cleanup_failed
                .is_empty()
        );

        if checkpoint == Checkpoint::Complete {
            assert_completed_retry_is_read_only(&fixture);
        } else {
            fixture.adopt().unwrap();
        }
        let journal = read_journal(&fixture.data, &fixture.new).unwrap().unwrap();
        assert_eq!(journal.step, Step::Complete);
        if checkpoint == Checkpoint::HostModeConverted {
            assert_eq!(journal.cleanup_failed, ["logs"]);
            assert_eq!(
                fs::read_link(fixture.data.join("logs")).unwrap(),
                external.path()
            );
        } else {
            assert!(journal.cleanup_failed.is_empty());
            assert!(!fixture.data.join("logs").exists());
        }
        assert_eq!(tree(external.path()), external_before);
        for cleaned in ["app_webview", "cache"] {
            assert!(!fixture.data.join(cleaned).exists());
        }
        assert!(
            fixture
                .data
                .join("code_cache/retained-until-success")
                .is_file()
        );
    }
}

#[test]
fn every_crash_boundary_resumes_including_rename_before_journal_and_host_write_before_journal() {
    for interrupted_step in [
        Checkpoint::Prepared,
        Checkpoint::RenamedBeforeJournal,
        Checkpoint::Renamed,
        Checkpoint::HostModeBeforeJournal,
        Checkpoint::HostModeConverted,
        Checkpoint::CleanupBeforeJournal,
        Checkpoint::Complete,
    ] {
        let fixture = Fixture::new();
        fixture.storage();
        fixture.host_mode();
        fixture.disposable_and_unknown();
        let original = hash_files(&fixture.old);
        let error = adopt_with_checkpoints(
            &fixture.data,
            &fixture.new,
            || Ok(()),
            |step| {
                if step == interrupted_step {
                    Err(AdoptionError::StorageUnavailable)
                } else {
                    Ok(())
                }
            },
        );
        assert_eq!(
            error,
            Err(AdoptionError::StorageUnavailable),
            "checkpoint {interrupted_step:?}"
        );
        fixture.adopt().unwrap();
        assert!(!fixture.old.exists(), "checkpoint {interrupted_step:?}");
        let after = hash_files(&fixture.new);
        for (path, hash) in original {
            assert_eq!(
                after.get(&path),
                Some(&hash),
                "checkpoint {interrupted_step:?}, file {path:?}"
            );
        }
        let journal = read_journal(&fixture.data, &fixture.new).unwrap().unwrap();
        assert_eq!(journal.step, Step::Complete);
        assert!(journal.cleanup_failed.is_empty());
        for cleaned in ["logs", "app_webview", "cache"] {
            assert!(!fixture.data.join(cleaned).exists());
        }
        assert!(
            fixture
                .data
                .join("code_cache/retained-until-success")
                .is_file()
        );
        let before_retry = tree(&fixture.data);
        fixture.adopt().unwrap();
        assert_eq!(
            tree(&fixture.data),
            before_retry,
            "completed retry must not write at {interrupted_step:?}"
        );
    }
}

#[test]
fn two_vaults_block_before_any_mutation_and_guard_refuses() {
    let fixture = Fixture::new();
    fixture.storage();
    drop(Storage::new(&fixture.new).unwrap());
    fixture.disposable_and_unknown();
    let before = tree(&fixture.data);
    assert_eq!(fixture.adopt(), Err(AdoptionError::Blocked));
    assert_eq!(
        check_destructive_allowed(&fixture.data, &fixture.new),
        Err(AdoptionError::ActionForbidden)
    );
    assert_eq!(tree(&fixture.data), before);
}

#[test]
fn core_markers_and_chunks_are_storage_but_empty_directories_are_not() {
    let fixture = Fixture::new();
    assert!(!contains_storage(&fixture.old).unwrap());
    fs::create_dir_all(fixture.old.join("chunks/a/bc")).unwrap();
    assert!(!contains_storage(&fixture.old).unwrap());
    for marker in ["format.version", "salt", "master.salt", "master.verify"] {
        fs::write(
            fixture.old.join(marker),
            b"damaged marker is still protected storage",
        )
        .unwrap();
        assert!(contains_storage(&fixture.old).unwrap(), "marker {marker}");
        fs::remove_file(fixture.old.join(marker)).unwrap();
    }
    fs::write(
        fixture.old.join("chunks/a/bc/abcd"),
        b"damaged chunk is still protected storage",
    )
    .unwrap();
    assert!(contains_storage(&fixture.old).unwrap());
}

#[test]
fn absent_legacy_and_empty_legacy_are_left_untouched_without_consulting_pepper() {
    let fixture = Fixture::new();
    for create_empty in [false, true] {
        if create_empty {
            fs::create_dir_all(&fixture.old).unwrap();
        }
        let before = tree(&fixture.data);
        adopt(&fixture.data, &fixture.new, || {
            panic!("no legacy vault requires no pepper")
        })
        .unwrap();
        assert_eq!(tree(&fixture.data), before);
        assert!(!fixture.new.exists());
        assert_eq!(
            check_destructive_allowed(&fixture.data, &fixture.new),
            Ok(())
        );
    }
}

#[test]
fn storage_json_default_policy_matches_tauri_missing_unreadable_invalid_and_blank() {
    for contents in [
        None,
        Some("garbage"),
        Some("{}"),
        Some(r#"{"storage_root":"  \n  "}"#),
        Some("{\"storage_root\":42}"),
    ] {
        let fixture = Fixture::new();
        fixture.storage();
        if let Some(contents) = contents {
            fs::write(fixture.data.join("storage.json"), contents).unwrap();
        }
        assert_eq!(legacy_root(&fixture.data).unwrap(), fixture.old);
        fixture.adopt().unwrap();
        assert!(fixture.new.join("salt").is_file());
    }
    // A directory is a deterministic unreadable file on host, even as root.
    let fixture = Fixture::new();
    fixture.storage();
    fs::create_dir(fixture.data.join("storage.json")).unwrap();
    assert_eq!(legacy_root(&fixture.data).unwrap(), fixture.old);
    fixture.adopt().unwrap();
}

#[test]
fn storage_json_accepts_trimmed_inside_path_and_never_guesses_outside_or_traversal() {
    let fixture = Fixture::new();
    fixture.storage();
    let custom = fixture.data.join("custom-vault");
    fs::rename(&fixture.old, &custom).unwrap();
    fs::write(
        fixture.data.join("storage.json"),
        serde_json::to_vec(&json!({"storage_root":format!("  {}  ",custom.display())})).unwrap(),
    )
    .unwrap();
    assert_eq!(legacy_root(&fixture.data).unwrap(), custom);
    fixture.adopt().unwrap();
    assert!(!custom.exists());

    for case in ["outside", "relative", "parent", "dot"] {
        let fixture = Fixture::new();
        fixture.storage();
        let (requested, expected) = match case {
            "outside" => (
                fixture._temporary.path().join("outside"),
                AdoptionError::LegacyRootOutsideDataDir,
            ),
            "relative" => (
                PathBuf::from("storage"),
                AdoptionError::LegacyRootOutsideDataDir,
            ),
            "parent" => (
                fixture.data.join("other/../storage"),
                AdoptionError::LegacyRootUnavailable,
            ),
            "dot" => (
                fixture.data.join("other/./storage"),
                AdoptionError::LegacyRootUnavailable,
            ),
            _ => unreachable!(),
        };
        fs::write(
            fixture.data.join("storage.json"),
            serde_json::to_vec(&json!({"storage_root":requested})).unwrap(),
        )
        .unwrap();
        let before = tree(&fixture.data);
        assert_eq!(fixture.adopt(), Err(expected), "case {case}");
        assert_eq!(
            check_destructive_allowed(&fixture.data, &fixture.new),
            Err(AdoptionError::ActionForbidden)
        );
        assert_eq!(tree(&fixture.data), before);
    }
}

#[cfg(unix)]
#[test]
fn source_configuration_and_nested_symlinks_are_unavailable_without_mutations() {
    use std::os::unix::fs::symlink;
    for nested in [false, true] {
        let fixture = Fixture::new();
        let outside = tempfile::tempdir().unwrap();
        drop(Storage::new(outside.path()).unwrap());
        let requested = if nested {
            symlink(outside.path(), fixture.data.join("redirect")).unwrap();
            fixture.data.join("redirect/nested")
        } else {
            symlink(outside.path(), &fixture.old).unwrap();
            fixture.old.clone()
        };
        fs::write(
            fixture.data.join("storage.json"),
            serde_json::to_vec(&json!({"storage_root":requested})).unwrap(),
        )
        .unwrap();
        let before = tree(&fixture.data);
        let outside_before = tree(outside.path());
        assert_eq!(fixture.adopt(), Err(AdoptionError::LegacyRootUnavailable));
        assert_eq!(
            check_destructive_allowed(&fixture.data, &fixture.new),
            Err(AdoptionError::ActionForbidden)
        );
        assert_eq!(tree(&fixture.data), before);
        assert_eq!(tree(outside.path()), outside_before);
    }
    let fixture = Fixture::new();
    fixture.storage();
    fs::write(fixture.data.join("real-config.json"), b"{}").unwrap();
    symlink(
        fixture.data.join("real-config.json"),
        fixture.data.join("storage.json"),
    )
    .unwrap();
    let before = tree(&fixture.data);
    assert_eq!(fixture.adopt(), Err(AdoptionError::LegacyRootUnavailable));
    assert_eq!(tree(&fixture.data), before);
}

enum DeniedKeystore {
    Missing,
    Unreadable,
}
impl Keystore for DeniedKeystore {
    fn load_storage_pepper(&self) -> Result<Option<[u8; 32]>, KeystoreError> {
        match self {
            Self::Missing => Ok(None),
            Self::Unreadable => Err(KeystoreError::Unavailable),
        }
    }
    fn store_storage_pepper(&self, _: [u8; 32]) -> Result<(), KeystoreError> {
        panic!("unavailable pepper must never be replaced")
    }
    fn delete_storage_pepper(&self) -> Result<(), KeystoreError> {
        panic!("unavailable pepper must never be deleted")
    }
}

#[test]
fn missing_or_unreadable_pepper_after_commit_never_mutates_journal_metadata_or_cleanup() {
    for key in [DeniedKeystore::Missing, DeniedKeystore::Unreadable] {
        let fixture = Fixture::new();
        fixture.storage();
        fixture.host_mode();
        fixture.disposable_and_unknown();
        // Exactly the process-death window after rename, before recording it.
        assert_eq!(
            adopt_with_checkpoints(
                &fixture.data,
                &fixture.new,
                || Ok(()),
                |step| {
                    if step == Checkpoint::RenamedBeforeJournal {
                        Err(AdoptionError::StorageUnavailable)
                    } else {
                        Ok(())
                    }
                }
            ),
            Err(AdoptionError::StorageUnavailable)
        );
        let before = tree(&fixture.data);
        for _ in 0..2 {
            assert_eq!(
                adopt(&fixture.data, &fixture.new, || {
                    match key.load_storage_pepper() {
                        Ok(Some(_)) => Ok(()),
                        _ => Err(AdoptionError::PepperUnavailable),
                    }
                }),
                Err(AdoptionError::PepperUnavailable)
            );
            assert_eq!(tree(&fixture.data), before);
        }
        assert!(!fixture.old.exists());
        assert!(fixture.new.join("salt").is_file());
        assert!(!fixture.new.join("ios_host_mode.json").exists());
        assert!(fixture.data.join("logs").is_dir());
        fixture.adopt().unwrap();
    }
}

#[test]
fn completed_adoption_leaves_missing_or_unreadable_pepper_to_core_without_mutation() {
    for in_place in [false, true] {
        let (fixture, _key) = adopted_vault(in_place);
        for (key, expected_code) in [
            (DeniedKeystore::Missing, "STORAGE_PEPPER_REQUIRED"),
            (DeniedKeystore::Unreadable, "KEYSTORE_UNAVAILABLE"),
        ] {
            let before = tree(&fixture.data);
            assert_completed_retry_is_read_only(&fixture);
            let mut router = open_adopted(&fixture, Arc::new(key));
            let response = router.handle(&RpcRequest::new(
                "vault:unlock",
                json!({"password":PASSWORD}),
            ));
            assert_eq!(response.code(), Some(expected_code), "{response:?}");
            drop(router);
            assert_eq!(tree(&fixture.data), before);
        }
    }
}

#[test]
fn completed_adoption_allows_restart_after_erase_and_master_setup_before_first_unlock() {
    for in_place in [false, true] {
        let (fixture, key) = adopted_vault(in_place);
        let mut router = open_adopted(&fixture, key.clone());
        rpc(
            &mut router,
            "admin:erase",
            json!({"master_password":PASSWORD, "confirm":true}),
        );
        rpc(
            &mut router,
            "master:setup",
            json!({"master_password":PASSWORD}),
        );
        assert!(!fixture.new.join("format.version").exists());
        assert!(fixture.new.join("master.salt").is_file());
        assert!(fixture.new.join("master.verify").is_file());
        assert_eq!(key.load_storage_pepper().unwrap(), None);
        drop(router);

        assert_completed_retry_is_read_only(&fixture);
        assert_eq!(key.load_storage_pepper().unwrap(), None);
        let mut reopened = open_adopted(&fixture, key.clone());
        unlock(&mut reopened);
        assert!(fixture.new.join("format.version").is_file());
        assert!(key.load_storage_pepper().unwrap().is_some());
    }
}

#[test]
fn completed_adoption_allows_core_to_recover_interrupted_restore_and_retry() {
    const CHUNK: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    for in_place in [false, true] {
        let (fixture, key) = adopted_vault(in_place);
        let mut router = open_adopted(&fixture, key.clone());
        rpc(
            &mut router,
            "admin:erase",
            json!({"master_password":PASSWORD, "confirm":true}),
        );
        let start = rpc(
            &mut router,
            "restore:local:start",
            json!({"backup_path":fixture.data}),
        );
        let upload_pack = |router: &mut RpcRouter, restore_id: &Value| {
            let reply = router.handle_with_stream(
                &RpcRequest::new(
                    "restore:local:uploadPack",
                    json!({
                        "restore_id":restore_id,
                        "manifest":{
                            "v":2, "chunk_count":1, "total_size":FILE.len(),
                            "chunks":[{"name":CHUNK, "size":FILE.len()}]
                        }
                    }),
                ),
                Some(RpcInputStream::from_bytes(FILE.to_vec())),
            );
            let RpcReply::Json(response) = reply else {
                panic!("restore pack upload must return JSON")
            };
            assert_eq!(assert_ok(response)["received_chunks"], 1);
        };
        upload_pack(&mut router, &start["restore_id"]);
        let chunk_path = fixture
            .new
            .join("chunks")
            .join(&CHUNK[..1])
            .join(&CHUNK[1..3])
            .join(CHUNK);
        assert_eq!(fs::read(&chunk_path).unwrap(), FILE);
        assert!(!fixture.new.join("salt").exists());
        assert!(fixture.new.join("restore.transaction.json").is_file());
        assert_eq!(key.load_storage_pepper().unwrap(), None);
        drop(router);

        assert_completed_retry_is_read_only(&fixture);
        assert_eq!(key.load_storage_pepper().unwrap(), None);
        let mut reopened = open_adopted(&fixture, key.clone());
        let retry = rpc(
            &mut reopened,
            "restore:local:start",
            json!({"backup_path":fixture.data}),
        );
        assert!(!chunk_path.exists(), "Core must recover the staged chunk");
        assert!(!fixture.new.join("salt").exists());
        assert_eq!(key.load_storage_pepper().unwrap(), None);
        upload_pack(&mut reopened, &retry["restore_id"]);
        assert_eq!(fs::read(&chunk_path).unwrap(), FILE);
        let cancel = rpc(
            &mut reopened,
            "restore:local:cancel",
            json!({"restore_id":retry["restore_id"]}),
        );
        assert_eq!(cancel["deleted_chunks"], 1);
        assert!(!chunk_path.exists());
        assert!(!fixture.new.join("restore.transaction.json").exists());
        assert_eq!(key.load_storage_pepper().unwrap(), None);
    }
}

#[test]
fn completed_adoption_still_blocks_a_recreated_parallel_legacy_vault() {
    let (fixture, _key) = adopted_vault(false);
    fixture.storage();
    let before = tree(&fixture.data);
    assert_eq!(
        adopt(&fixture.data, &fixture.new, || {
            panic!("parallel vault conflict must precede pepper access")
        }),
        Err(AdoptionError::Blocked)
    );
    assert_eq!(
        check_destructive_allowed(&fixture.data, &fixture.new),
        Err(AdoptionError::ActionForbidden)
    );
    assert_eq!(tree(&fixture.data), before);
}

#[test]
fn first_launch_with_missing_pepper_commits_only_the_move_and_stops_all_further_writes() {
    let fixture = Fixture::new();
    fixture.storage();
    fixture.host_mode();
    fixture.disposable_and_unknown();
    let observed_at_check = std::cell::RefCell::new(None);
    assert_eq!(
        adopt(&fixture.data, &fixture.new, || {
            assert!(!fixture.old.exists());
            *observed_at_check.borrow_mut() = Some(tree(&fixture.data));
            Err(AdoptionError::PepperUnavailable)
        }),
        Err(AdoptionError::PepperUnavailable)
    );
    assert_eq!(tree(&fixture.data), observed_at_check.into_inner().unwrap());
    assert!(!fixture.new.join("ios_host_mode.json").exists());
    assert!(fixture.data.join("logs").is_dir());
    let journal: Journal =
        serde_json::from_slice(&fs::read(fixture.data.join(JOURNAL)).unwrap()).unwrap();
    assert_eq!(journal.step, Step::Prepared);
}

#[test]
fn readonly_verification_rejects_torn_master_metadata_without_repairing_it() {
    for name in ["master.salt", "master.verify"] {
        let fixture = Fixture::new();
        fixture.storage();
        fs::write(fixture.old.join(name), b"torn").unwrap();
        assert_eq!(fixture.adopt(), Err(AdoptionError::StorageUnavailable));
        let before = tree(&fixture.data);
        assert_eq!(fixture.adopt(), Err(AdoptionError::StorageUnavailable));
        assert_eq!(tree(&fixture.data), before);
        assert_eq!(fs::read(fixture.new.join(name)).unwrap(), b"torn");
    }
}

#[cfg(unix)]
#[test]
fn readonly_verification_checks_every_chunk_and_rejects_nested_symlinks() {
    let fixture = Fixture::new();
    fixture.storage();
    let shard = fixture.old.join("chunks/a/aa");
    fs::create_dir_all(&shard).unwrap();
    fs::write(shard.join("a".repeat(64)), [7; 40]).unwrap();
    let outside = tempfile::tempdir().unwrap();
    fs::write(
        outside.path().join("outside-chunk"),
        b"must not be opened or altered",
    )
    .unwrap();
    std::os::unix::fs::symlink(
        outside.path().join("outside-chunk"),
        shard.join(format!("{}b", "a".repeat(63))),
    )
    .unwrap();
    let outside_before = tree(outside.path());
    assert_eq!(fixture.adopt(), Err(AdoptionError::StorageUnavailable));
    let before_retry = tree(&fixture.data);
    assert_eq!(fixture.adopt(), Err(AdoptionError::StorageUnavailable));
    assert_eq!(tree(&fixture.data), before_retry);
    assert_eq!(tree(outside.path()), outside_before);
}

#[test]
fn existing_ios_host_preferences_are_never_overwritten() {
    let fixture = Fixture::new();
    fixture.storage();
    fixture.host_mode();
    let existing = b"{\"relay_url\":null,\"enabled\":false,\"updated_at\":99}";
    fs::write(fixture.old.join("ios_host_mode.json"), existing).unwrap();
    fixture.adopt().unwrap();
    assert_eq!(
        fs::read(fixture.new.join("ios_host_mode.json")).unwrap(),
        existing
    );
}

#[test]
fn dev_fixture_and_test_identities_never_start_adoption_or_pepper_checks() {
    let fixture = Fixture::new();
    fixture.storage();
    for identity in [
        "com.chromvoid.air.dev",
        "com.chromvoid.air.dev.fixture",
        "com.chromvoid.air.dev.test",
        "com.chromvoid.app.test",
        "",
    ] {
        let before = tree(&fixture.data);
        adopt_for_identity(identity, &fixture.data, &fixture.new, || {
            panic!("dev identity consulted pepper")
        })
        .unwrap();
        assert_eq!(tree(&fixture.data), before);
    }
    adopt_for_identity("com.chromvoid.app", &fixture.data, &fixture.new, || Ok(())).unwrap();
    assert!(!fixture.old.exists());
}

#[test]
fn guard_never_ignores_an_invalid_target_or_a_surviving_journal_source() {
    let fixture = Fixture::new();
    assert_eq!(
        check_destructive_allowed(&fixture.data, &fixture._temporary.path().join("outside")),
        Err(AdoptionError::ActionForbidden)
    );
    fixture.storage();
    assert_eq!(
        adopt_with_checkpoints(
            &fixture.data,
            &fixture.new,
            || Ok(()),
            |step| {
                if step == Checkpoint::Prepared {
                    Err(AdoptionError::StorageUnavailable)
                } else {
                    Ok(())
                }
            }
        ),
        Err(AdoptionError::StorageUnavailable)
    );
    fs::write(
        fixture.data.join("storage.json"),
        serde_json::to_vec(&json!({"storage_root":fixture.data.join("new-empty-root")})).unwrap(),
    )
    .unwrap();
    let before = tree(&fixture.data);
    assert_eq!(
        check_destructive_allowed(&fixture.data, &fixture.new),
        Err(AdoptionError::ActionForbidden)
    );
    assert_eq!(tree(&fixture.data), before);
}

#[test]
fn unknown_destination_and_corrupt_adopted_metadata_are_never_replaced_or_repaired() {
    let fixture = Fixture::new();
    fixture.storage();
    fs::create_dir_all(&fixture.new).unwrap();
    fs::write(
        fixture.new.join("unknown"),
        b"cannot replace this directory",
    )
    .unwrap();
    let before = tree(&fixture.data);
    assert_eq!(fixture.adopt(), Err(AdoptionError::StorageUnavailable));
    assert_eq!(tree(&fixture.data), before);
    fs::remove_file(fixture.new.join("unknown")).unwrap();
    fs::write(fixture.old.join("salt"), b"torn salt").unwrap();
    assert_eq!(fixture.adopt(), Err(AdoptionError::StorageUnavailable));
    let before = tree(&fixture.data);
    assert_eq!(fixture.adopt(), Err(AdoptionError::StorageUnavailable));
    assert_eq!(tree(&fixture.data), before);
    assert!(!fixture.old.exists());
    assert_eq!(fs::read(fixture.new.join("salt")).unwrap(), b"torn salt");
}

#[test]
fn configured_root_cannot_move_the_global_pepper_but_disjoint_no_backup_vault_is_allowed() {
    for contains_pepper in [true, false] {
        let fixture = Fixture::new();
        fixture.storage();
        let no_backup = fixture.data.join("no_backup");
        let root = if contains_pepper {
            fs::rename(&fixture.old, &no_backup).unwrap();
            no_backup.clone()
        } else {
            fs::create_dir(&no_backup).unwrap();
            let root = no_backup.join("legacy-vault");
            fs::rename(&fixture.old, &root).unwrap();
            root
        };
        let pepper_dir = no_backup.join("chromvoid-keystore");
        fs::create_dir_all(&pepper_dir).unwrap();
        let pepper_file = pepper_dir.join("storage_pepper.enc");
        fs::write(
            &pepper_file,
            b"synthetic wrapped pepper; must stay at this path",
        )
        .unwrap();
        fs::write(
            fixture.data.join("storage.json"),
            serde_json::to_vec(&json!({"storage_root":root})).unwrap(),
        )
        .unwrap();
        let before = tree(&fixture.data);
        if contains_pepper {
            assert_eq!(fixture.adopt(), Err(AdoptionError::LegacyRootUnavailable));
            assert_eq!(
                check_destructive_allowed(&fixture.data, &fixture.new),
                Err(AdoptionError::ActionForbidden)
            );
            assert_eq!(tree(&fixture.data), before);
        } else {
            fixture.adopt().unwrap();
            assert!(!root.exists());
            assert!(fixture.new.join("salt").is_file());
            assert_eq!(
                fs::read(&pepper_file).unwrap(),
                b"synthetic wrapped pepper; must stay at this path"
            );
        }
    }
}

#[test]
fn tauri_override_already_at_air_root_still_checks_pepper_and_converts_host_mode_once() {
    let fixture = Fixture::new();
    fixture.storage();
    fixture.host_mode();
    fixture.disposable_and_unknown();
    fs::rename(&fixture.old, &fixture.new).unwrap();
    fs::write(
        fixture.data.join("storage.json"),
        serde_json::to_vec(&json!({"storage_root":fixture.new})).unwrap(),
    )
    .unwrap();
    let salt = fs::read(fixture.new.join("salt")).unwrap();
    fs::write(fixture.new.join("salt"), b"torn salt").unwrap();
    let corrupted = tree(&fixture.data);
    assert_eq!(
        adopt(&fixture.data, &fixture.new, || panic!(
            "invalid in-place structure must stop before the pepper check"
        )),
        Err(AdoptionError::StorageUnavailable)
    );
    assert_eq!(tree(&fixture.data), corrupted);
    fs::write(fixture.new.join("salt"), salt).unwrap();
    let before = tree(&fixture.data);
    assert_eq!(
        adopt(&fixture.data, &fixture.new, || Err(
            AdoptionError::PepperUnavailable
        )),
        Err(AdoptionError::PepperUnavailable)
    );
    assert_eq!(tree(&fixture.data), before);
    assert!(!fixture.data.join(JOURNAL).exists());

    fixture.adopt().unwrap();
    assert!(fixture.new.join("salt").is_file());
    assert!(!fixture.old.exists());
    let converted: Value =
        serde_json::from_slice(&fs::read(fixture.new.join("ios_host_mode.json")).unwrap()).unwrap();
    assert_eq!(
        converted,
        json!({"relay_url":"wss://relay.example.test", "enabled":true,"updated_at":123456})
    );
    let journal: Journal =
        serde_json::from_slice(&fs::read(fixture.data.join(JOURNAL)).unwrap()).unwrap();
    assert_eq!(journal.source_root, journal.target_root);
    assert_eq!(journal.step, Step::Complete);
    assert_eq!(
        journal
            .steps
            .iter()
            .map(|entry| entry.step)
            .collect::<Vec<_>>(),
        [
            Step::Prepared,
            Step::InPlaceVerified,
            Step::HostModeConverted,
            Step::Complete
        ]
    );
    assert!(journal.device_label_dropped);
    let complete = tree(&fixture.data);
    assert_completed_retry_is_read_only(&fixture);
    assert_eq!(tree(&fixture.data), complete);

    assert_eq!(
        check_destructive_allowed(&fixture.data, &fixture.new),
        Ok(())
    );
    fs::remove_file(fixture.new.join("salt")).unwrap();
    let erased = tree(&fixture.data);
    adopt(&fixture.data, &fixture.new, || {
        panic!("explicitly erased in-place storage may create its new pepper in Core")
    })
    .unwrap();
    assert_eq!(tree(&fixture.data), erased);
}

#[test]
fn tauri_override_at_an_empty_air_root_does_not_create_an_adoption_journal() {
    let fixture = Fixture::new();
    fs::create_dir_all(&fixture.new).unwrap();
    fs::write(
        fixture.data.join("storage.json"),
        serde_json::to_vec(&json!({"storage_root":fixture.new})).unwrap(),
    )
    .unwrap();
    let before = tree(&fixture.data);
    adopt(&fixture.data, &fixture.new, || {
        panic!("empty in-place directory has no vault pepper")
    })
    .unwrap();
    assert_eq!(tree(&fixture.data), before);
}
