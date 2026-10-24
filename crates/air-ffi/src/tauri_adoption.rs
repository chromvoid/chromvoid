//! One-time, pre-Core adoption of Android Tauri storage. No Android APIs and no
//! `Storage::new`: opening Core here could create salt/format files or sweep data.

use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use chromvoid_core::storage::{FormatVersionFile, atomic_file::write_json_pretty_atomic};
use serde::{Deserialize, Serialize};

const JOURNAL: &str = "air-adoption.json";
const DISPOSABLE_DIRECTORIES: &[&str] = &["logs", "app_webview", "cache"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub(crate) enum AdoptionError {
    #[error("both the Tauri and Air roots contain storage")]
    Blocked,
    #[error("the Tauri storage root is outside the application data directory")]
    LegacyRootOutsideDataDir,
    #[error("the Tauri storage root could not be safely resolved")]
    LegacyRootUnavailable,
    #[error("the existing storage pepper is missing or unavailable")]
    PepperUnavailable,
    #[error("adopted storage is unavailable")]
    StorageUnavailable,
    #[error("the action is forbidden until Tauri storage has been adopted")]
    ActionForbidden,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum Step {
    Prepared,
    Renamed,
    InPlaceVerified,
    HostModeConverted,
    Complete,
}

#[derive(Debug, Serialize, Deserialize)]
struct Journal {
    version: u32,
    source_root: PathBuf,
    target_root: PathBuf,
    step: Step,
    started_at: u64,
    updated_at: u64,
    steps: Vec<JournalStep>,
    device_label_dropped: bool,
    #[serde(default)]
    cleanup_failed: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct JournalStep {
    step: Step,
    at: u64,
}

#[derive(Deserialize)]
struct TauriStorageConfiguration {
    storage_root: String,
}

#[derive(Deserialize)]
struct TauriHostConfiguration {
    relay_url: Option<String>,
    #[serde(rename = "device_label")]
    _device_label: Option<String>,
    enabled: bool,
    updated_at: u64,
}

/// Only the shipped Android package adopts. Callers invoke this after platform
/// root validation and before constructing any Core adapter.
pub(crate) fn adopt_for_identity(
    identity: &str,
    data_dir: &Path,
    new_root: &Path,
    pepper_check: impl Fn() -> Result<(), AdoptionError>,
) -> Result<(), AdoptionError> {
    if identity != "com.chromvoid.app" {
        return Ok(());
    }
    adopt(data_dir, new_root, pepper_check)
}

pub(crate) fn adopt(
    data_dir: &Path,
    new_root: &Path,
    pepper_check: impl Fn() -> Result<(), AdoptionError>,
) -> Result<(), AdoptionError> {
    adopt_with_checkpoints(data_dir, new_root, pepper_check, |_| Ok(()))
}

/// The Air-owned guard deliberately fails closed on unreadable configuration or
/// paths as well as a surviving legacy vault. It performs no writes.
pub(crate) fn check_destructive_allowed(
    data_dir: &Path,
    new_root: &Path,
) -> Result<(), AdoptionError> {
    let check = || {
        validate_data_dir(data_dir)?;
        checked_child(data_dir, new_root)?;
        let source = legacy_root(data_dir)?;
        if source != new_root && contains_storage(&source)? {
            return Err(AdoptionError::ActionForbidden);
        }
        if let Some(journal) = read_journal(data_dir, new_root)? {
            let source = checked_source(data_dir, &data_dir.join(journal.source_root))?;
            if source != new_root && contains_storage(&source)? {
                return Err(AdoptionError::ActionForbidden);
            }
        }
        Ok(())
    };
    check().map_err(|_| AdoptionError::ActionForbidden)
}

/// Checkpoints are also the crash-injection boundaries used by the host suite.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Checkpoint {
    Prepared,
    RenamedBeforeJournal,
    Renamed,
    HostModeBeforeJournal,
    HostModeConverted,
    CleanupBeforeJournal,
    Complete,
}

fn adopt_with_checkpoints(
    data_dir: &Path,
    new_root: &Path,
    pepper_check: impl Fn() -> Result<(), AdoptionError>,
    checkpoint: impl Fn(Checkpoint) -> Result<(), AdoptionError>,
) -> Result<(), AdoptionError> {
    validate_data_dir(data_dir)?;
    checked_child(data_dir, new_root)?;
    let configured_source = legacy_root(data_dir)?;
    let journal = read_journal(data_dir, new_root)?;
    let source = match &journal {
        Some(journal) => checked_source(data_dir, &data_dir.join(&journal.source_root))?,
        None => configured_source.clone(),
    };
    // A newly changed override must not hide another unconsumed vault while a
    // previous adoption journal is being resumed.
    if configured_source != source
        && configured_source != new_root
        && contains_storage(&configured_source)?
    {
        return Err(AdoptionError::Blocked);
    }
    let already_in_place = source == new_root;
    if !already_in_place && (new_root.starts_with(&source) || source.starts_with(new_root)) {
        return Err(AdoptionError::LegacyRootUnavailable);
    }

    let source_has_storage = contains_storage(&source)?;
    let target_has_storage = contains_storage(new_root)?;
    if !already_in_place && source_has_storage && target_has_storage {
        return Err(AdoptionError::Blocked);
    }
    if !source_has_storage && journal.is_none() {
        // In particular, an empty legacy directory stays byte-for-byte intact.
        return Ok(());
    }
    if journal
        .as_ref()
        .is_some_and(|journal| journal.step == Step::Complete)
        && (!source_has_storage || already_in_place)
    {
        // This journal records the completed, one-time handoff to Core. Later
        // erase/setup and interrupted restore can legitimately leave metadata
        // incomplete or pepper absent. Core owns their validation and recovery.
        return Ok(());
    }
    if !already_in_place && source_has_storage && !directory_empty_or_missing(new_root)? {
        // Never replace an unknown, non-empty destination either.
        return Err(AdoptionError::StorageUnavailable);
    }
    if !source_has_storage && !target_has_storage {
        return Err(AdoptionError::StorageUnavailable);
    }
    if already_in_place {
        // A valid Tauri override may already name Air's fixed root. Nothing
        // needs moving; verify before even creating the adoption journal so a
        // pepper failure leaves this already-placed storage wholly untouched.
        verify_storage_read_only(new_root)?;
        pepper_check().map_err(|_| AdoptionError::PepperUnavailable)?;
    }

    let mut journal = match journal {
        Some(journal) => journal,
        None => {
            let now = timestamp();
            let mut journal = Journal {
                version: 1,
                source_root: source.strip_prefix(data_dir).unwrap().to_path_buf(),
                target_root: new_root.strip_prefix(data_dir).unwrap().to_path_buf(),
                step: Step::Prepared,
                started_at: now,
                updated_at: now,
                steps: Vec::new(),
                device_label_dropped: false,
                cleanup_failed: Vec::new(),
            };
            save_journal(data_dir, &mut journal)?;
            checkpoint(Checkpoint::Prepared)?;
            journal
        }
    };
    if source_has_storage && !already_in_place {
        // On Android `files` already exists. Keep the pure host function's
        // contract equally strict rather than creating a directory before commit.
        let parent = new_root.parent().ok_or(AdoptionError::StorageUnavailable)?;
        if !parent.is_dir() {
            return Err(AdoptionError::StorageUnavailable);
        }
        fs::rename(&source, new_root).map_err(|_| AdoptionError::StorageUnavailable)?;
        sync_directory(source.parent().unwrap())?;
        sync_directory(parent)?;
        checkpoint(Checkpoint::RenamedBeforeJournal)?;
    }

    // Rename is the commit point. Infer it from the filesystem if the process
    // died before its journal update. Failures here leave the root and journal
    // untouched: in particular, never translate settings or clean up after a
    // missing/unreadable pepper. The callback must only load, never create it.
    if !already_in_place {
        verify_storage_read_only(new_root)?;
        pepper_check().map_err(|_| AdoptionError::PepperUnavailable)?;
    }

    if journal.step == Step::Prepared {
        journal.step = if already_in_place {
            Step::InPlaceVerified
        } else {
            Step::Renamed
        };
        save_journal(data_dir, &mut journal)?;
        checkpoint(Checkpoint::Renamed)?;
    }
    if matches!(journal.step, Step::Renamed | Step::InPlaceVerified) {
        journal.device_label_dropped = convert_host_mode(new_root)?;
        checkpoint(Checkpoint::HostModeBeforeJournal)?;
        journal.step = Step::HostModeConverted;
        save_journal(data_dir, &mut journal)?;
        checkpoint(Checkpoint::HostModeConverted)?;
    }
    if journal.step == Step::HostModeConverted {
        journal.cleanup_failed = cleanup_disposable(data_dir);
        checkpoint(Checkpoint::CleanupBeforeJournal)?;
        journal.step = Step::Complete;
        save_journal(data_dir, &mut journal)?;
        checkpoint(Checkpoint::Complete)?;
    }
    Ok(())
}

fn timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn validate_data_dir(data_dir: &Path) -> Result<(), AdoptionError> {
    if !data_dir.is_absolute() || has_traversal(data_dir) {
        return Err(AdoptionError::LegacyRootUnavailable);
    }
    let metadata =
        fs::symlink_metadata(data_dir).map_err(|_| AdoptionError::LegacyRootUnavailable)?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err(AdoptionError::LegacyRootUnavailable);
    }
    Ok(())
}

fn has_traversal(path: &Path) -> bool {
    // Path::components normalizes embedded `./`; reject the spelling as well.
    path.as_os_str()
        .as_encoded_bytes()
        .split(|byte| *byte == b'/')
        .any(|part| part == b"." || part == b"..")
        || path
            .components()
            .any(|part| matches!(part, Component::ParentDir | Component::CurDir))
}

/// The Android OS-owned `/data/data` alias may occur above `data_dir`, just as
/// in storage_root.rs. Every application-owned component below it is checked
/// with symlink_metadata; canonicalize must never follow an attacker link.
fn checked_child(data_dir: &Path, requested: &Path) -> Result<PathBuf, AdoptionError> {
    if has_traversal(requested) {
        return Err(AdoptionError::LegacyRootUnavailable);
    }
    let relative = requested
        .strip_prefix(data_dir)
        .map_err(|_| AdoptionError::LegacyRootOutsideDataDir)?;
    if relative.as_os_str().is_empty() {
        return Err(AdoptionError::LegacyRootUnavailable);
    }
    let mut current = data_dir.to_path_buf();
    for part in relative.components() {
        if !matches!(part, Component::Normal(_)) {
            return Err(AdoptionError::LegacyRootUnavailable);
        }
        current.push(part);
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(AdoptionError::LegacyRootUnavailable);
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err(AdoptionError::LegacyRootUnavailable),
        }
    }
    Ok(current)
}

fn legacy_root(data_dir: &Path) -> Result<PathBuf, AdoptionError> {
    validate_data_dir(data_dir)?;
    let configuration = data_dir.join("storage.json");
    if fs::symlink_metadata(&configuration).is_ok_and(|metadata| metadata.file_type().is_symlink())
    {
        return Err(AdoptionError::LegacyRootUnavailable);
    }
    // Tauri defaults on a missing/unreadable/invalid document or blank path.
    let override_path = fs::read(&configuration)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<TauriStorageConfiguration>(&bytes).ok())
        .map(|configuration| configuration.storage_root.trim().to_owned())
        .filter(|value| !value.is_empty());
    let requested = override_path
        .map(PathBuf::from)
        .unwrap_or_else(|| data_dir.join("storage"));
    // Tauri stores the path itself; relative overrides are not rebased or
    // guessed against a process working directory.
    if !requested.is_absolute() {
        return Err(AdoptionError::LegacyRootOutsideDataDir);
    }
    checked_source(data_dir, &requested)
}

fn checked_source(data_dir: &Path, requested: &Path) -> Result<PathBuf, AdoptionError> {
    let source = checked_child(data_dir, requested)?;
    // The app-global pepper stays in Android's no-backup directory. Even an
    // in-sandbox override must never rename an ancestor containing that blob.
    if data_dir
        .join("no_backup/chromvoid-keystore")
        .starts_with(&source)
    {
        return Err(AdoptionError::LegacyRootUnavailable);
    }
    Ok(source)
}

fn plain_metadata(path: &Path) -> Result<Option<fs::Metadata>, AdoptionError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(AdoptionError::StorageUnavailable),
        Ok(metadata) => Ok(Some(metadata)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err(AdoptionError::StorageUnavailable),
    }
}

/// Core writes format.version and salts at the root and encrypted chunks under
/// chunks/<first>/<next-two>/<name>. Any persisted Core marker or chunk is
/// considered storage, even if damaged: corruption must not permit destructive
/// recovery of a parallel vault. Empty directories alone are not storage.
fn contains_storage(root: &Path) -> Result<bool, AdoptionError> {
    let Some(metadata) = plain_metadata(root)? else {
        return Ok(false);
    };
    if !metadata.is_dir() {
        return Err(AdoptionError::StorageUnavailable);
    }
    for name in ["format.version", "salt", "master.salt", "master.verify"] {
        if plain_metadata(&root.join(name))?.is_some() {
            return Ok(true);
        }
    }
    contains_file(&root.join("chunks"))
}

fn contains_file(path: &Path) -> Result<bool, AdoptionError> {
    let Some(metadata) = plain_metadata(path)? else {
        return Ok(false);
    };
    if metadata.is_file() {
        return Ok(true);
    }
    if !metadata.is_dir() {
        return Err(AdoptionError::StorageUnavailable);
    }
    for entry in fs::read_dir(path).map_err(|_| AdoptionError::StorageUnavailable)? {
        if contains_file(&entry.map_err(|_| AdoptionError::StorageUnavailable)?.path())? {
            return Ok(true);
        }
    }
    Ok(false)
}

fn directory_empty_or_missing(path: &Path) -> Result<bool, AdoptionError> {
    let Some(metadata) = plain_metadata(path)? else {
        return Ok(true);
    };
    if !metadata.is_dir() {
        return Err(AdoptionError::StorageUnavailable);
    }
    Ok(fs::read_dir(path)
        .map_err(|_| AdoptionError::StorageUnavailable)?
        .next()
        .is_none())
}

fn verify_storage_read_only(root: &Path) -> Result<(), AdoptionError> {
    let format_path = root.join("format.version");
    if !plain_metadata(&format_path)?.is_some_and(|metadata| metadata.is_file()) {
        return Err(AdoptionError::StorageUnavailable);
    }
    let format: FormatVersionFile = serde_json::from_slice(
        &fs::read(format_path).map_err(|_| AdoptionError::StorageUnavailable)?,
    )
    .map_err(|_| AdoptionError::StorageUnavailable)?;
    if format.v != 2 || format.format != "sharded" || format.chunk_size == 0 {
        return Err(AdoptionError::StorageUnavailable);
    }
    let chunks = root.join("chunks");
    if !plain_metadata(&chunks)?.is_some_and(|metadata| metadata.is_dir()) {
        return Err(AdoptionError::StorageUnavailable);
    }
    let has_chunks = verify_chunks_read_only(&chunks, &chunks, 0)?;
    match plain_metadata(&root.join("salt"))? {
        Some(metadata) if metadata.is_file() => {
            let salt =
                fs::read(root.join("salt")).map_err(|_| AdoptionError::StorageUnavailable)?;
            if salt.len() != chromvoid_core::SALT_SIZE {
                return Err(AdoptionError::StorageUnavailable);
            }
        }
        None if !has_chunks => {}
        _ => return Err(AdoptionError::StorageUnavailable),
    }
    for (name, length) in [
        ("master.salt", chromvoid_core::SALT_SIZE),
        ("master.verify", 32),
    ] {
        if let Some(metadata) = plain_metadata(&root.join(name))? {
            if !metadata.is_file()
                || fs::read(root.join(name))
                    .map_err(|_| AdoptionError::StorageUnavailable)?
                    .len()
                    != length
            {
                return Err(AdoptionError::StorageUnavailable);
            }
        }
    }
    Ok(())
}

/// Validate the complete Core sharding layout without opening storage or
/// deleting temporary files. Reading every entry also rejects hidden symlinks
/// after the first valid chunk, rather than short-circuiting on its presence.
fn verify_chunks_read_only(root: &Path, path: &Path, depth: usize) -> Result<bool, AdoptionError> {
    let mut found_chunk = false;
    for entry in fs::read_dir(path).map_err(|_| AdoptionError::StorageUnavailable)? {
        let entry = entry.map_err(|_| AdoptionError::StorageUnavailable)?;
        let path = entry.path();
        let metadata = plain_metadata(&path)?.ok_or(AdoptionError::StorageUnavailable)?;
        let name = entry.file_name();
        let name = name.to_str().ok_or(AdoptionError::StorageUnavailable)?;
        let is_hex = |value: &str| {
            value
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        };
        if depth < 2 {
            if !metadata.is_dir() || name.len() != depth + 1 || !is_hex(name) {
                return Err(AdoptionError::StorageUnavailable);
            }
            found_chunk |= verify_chunks_read_only(root, &path, depth + 1)?;
        } else {
            if !metadata.is_file() {
                return Err(AdoptionError::StorageUnavailable);
            }
            // Core deliberately excludes its interrupted chunk writes from
            // enumeration. Leave them untouched for Core's normal recovery.
            if name.starts_with(".tmp.") || name.starts_with(".batch.") {
                continue;
            }
            if name.len() != 64
                || !is_hex(name)
                || path.strip_prefix(root).ok()
                    != Some(
                        Path::new(&name[0..1])
                            .join(&name[1..3])
                            .join(name)
                            .as_path(),
                    )
            {
                return Err(AdoptionError::StorageUnavailable);
            }
            let mut header = [0; chromvoid_core::NONCE_SIZE + chromvoid_core::TAG_SIZE];
            fs::File::open(&path)
                .and_then(|mut file| file.read_exact(&mut header))
                .map_err(|_| AdoptionError::StorageUnavailable)?;
            found_chunk = true;
        }
    }
    Ok(found_chunk)
}

fn read_journal(data_dir: &Path, target: &Path) -> Result<Option<Journal>, AdoptionError> {
    let path = data_dir.join(JOURNAL);
    if plain_metadata(&path)?.is_none() {
        return Ok(None);
    }
    let journal: Journal =
        serde_json::from_slice(&fs::read(path).map_err(|_| AdoptionError::StorageUnavailable)?)
            .map_err(|_| AdoptionError::StorageUnavailable)?;
    if journal.version != 1
        || journal.source_root.is_absolute()
        || journal.target_root.is_absolute()
        || data_dir.join(&journal.target_root) != target
    {
        return Err(AdoptionError::StorageUnavailable);
    }
    checked_source(data_dir, &data_dir.join(&journal.source_root))?;
    checked_child(data_dir, target)?;
    Ok(Some(journal))
}

fn save_journal(data_dir: &Path, journal: &mut Journal) -> Result<(), AdoptionError> {
    plain_metadata(&data_dir.join(JOURNAL))?;
    journal.updated_at = timestamp();
    if journal
        .steps
        .last()
        .is_none_or(|entry| entry.step != journal.step)
    {
        journal.steps.push(JournalStep {
            step: journal.step,
            at: journal.updated_at,
        });
    }
    write_json_pretty_atomic(&data_dir.join(JOURNAL), journal)
        .map_err(|_| AdoptionError::StorageUnavailable)?;
    sync_directory(data_dir)
}

fn sync_directory(path: &Path) -> Result<(), AdoptionError> {
    fs::File::open(path)
        .and_then(|directory| directory.sync_all())
        .map_err(|_| AdoptionError::StorageUnavailable)
}

fn convert_host_mode(root: &Path) -> Result<bool, AdoptionError> {
    let source = root.join("mobile_host_mode.json");
    let Some(metadata) = plain_metadata(&source)? else {
        return Ok(false);
    };
    if !metadata.is_file() {
        return Err(AdoptionError::StorageUnavailable);
    }
    let configuration: TauriHostConfiguration =
        serde_json::from_slice(&fs::read(&source).map_err(|_| AdoptionError::StorageUnavailable)?)
            .map_err(|_| AdoptionError::StorageUnavailable)?;
    let target = root.join("ios_host_mode.json");
    if plain_metadata(&target)?.is_none() {
        let converted = chromvoid_network_runtime::ios_host::configuration::IosHostConfiguration {
            relay_url: configuration.relay_url,
            enabled: configuration.enabled,
            updated_at: configuration.updated_at,
        };
        write_json_pretty_atomic(&target, &converted)
            .map_err(|_| AdoptionError::StorageUnavailable)?;
        sync_directory(root)?;
    }
    // Retain the original as harmless metadata. This makes a crash between the
    // destination write and journal update fully resumable without overwriting.
    Ok(true)
}

/// Disposable data must never block the completed vault handoff. Record only
/// directory names, retaining unsafe entries and any data we cannot remove.
fn cleanup_disposable(data_dir: &Path) -> Vec<String> {
    let mut failed = Vec::new();
    for name in DISPOSABLE_DIRECTORIES {
        let cleanup = || {
            let path = checked_child(data_dir, &data_dir.join(name))?;
            let Some(metadata) = plain_metadata(&path)? else {
                return Ok(());
            };
            if !metadata.is_dir() {
                return Err(AdoptionError::StorageUnavailable);
            }
            // remove_dir_all never follows symlinks within the disposable tree.
            fs::remove_dir_all(path).map_err(|_| AdoptionError::StorageUnavailable)?;
            sync_directory(data_dir)
        };
        if cleanup().is_err() {
            failed.push((*name).to_owned());
        }
    }
    failed
}

#[cfg(test)]
#[path = "tauri_adoption_tests.rs"]
mod tests;
