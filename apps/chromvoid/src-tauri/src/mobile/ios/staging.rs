use std::{
    fmt, fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};

pub const STAGING_ROOT_DIR: &str = "NativeStaging";
pub const STAGING_MANIFEST_FILE: &str = "manifest.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IosStagingArea {
    Uploads,
    SharedFiles,
    ExternalActions,
    BackupRestore,
}

impl IosStagingArea {
    fn dir_name(self) -> &'static str {
        match self {
            Self::Uploads => "uploads",
            Self::SharedFiles => "shared-files",
            Self::ExternalActions => "external-actions",
            Self::BackupRestore => "backup-restore",
        }
    }

    fn all() -> &'static [Self] {
        &[
            Self::Uploads,
            Self::SharedFiles,
            Self::ExternalActions,
            Self::BackupRestore,
        ]
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IosStagedFileRef {
    pub staged_name: String,
    pub display_name: String,
    pub size: u64,
    pub mime_type: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IosStagingManifest {
    pub session_id: String,
    pub created_at_unix_ms: u128,
    pub files: Vec<IosStagedFileRef>,
}

impl IosStagingManifest {
    pub fn new(session_id: impl Into<String>, files: Vec<IosStagedFileRef>) -> Self {
        Self {
            session_id: session_id.into(),
            created_at_unix_ms: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.as_millis())
                .unwrap_or_default(),
            files,
        }
    }
}

#[derive(Debug)]
pub enum IosStagingError {
    AppGroupUnavailable,
    InvalidName(&'static str),
    Io(std::io::Error),
    Json(serde_json::Error),
}

impl fmt::Display for IosStagingError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::AppGroupUnavailable => f.write_str("iOS App Group container is unavailable"),
            Self::InvalidName(name) => write!(f, "Invalid iOS staging {name}"),
            Self::Io(error) => write!(f, "iOS staging I/O failed: {error}"),
            Self::Json(error) => write!(f, "iOS staging manifest JSON failed: {error}"),
        }
    }
}

impl std::error::Error for IosStagingError {}

impl From<std::io::Error> for IosStagingError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<serde_json::Error> for IosStagingError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

pub fn app_group_container_path() -> Result<PathBuf, IosStagingError> {
    #[cfg(any(target_os = "ios", target_os = "macos"))]
    {
        use crate::credential_provider_bridge::APP_GROUP_ID;
        use objc2_foundation::{NSFileManager, NSString};

        let group_identifier = NSString::from_str(APP_GROUP_ID);
        let manager = NSFileManager::defaultManager();
        let Some(container_url) =
            manager.containerURLForSecurityApplicationGroupIdentifier(&group_identifier)
        else {
            return Err(IosStagingError::AppGroupUnavailable);
        };
        let Some(path) = container_url.path() else {
            return Err(IosStagingError::AppGroupUnavailable);
        };
        return Ok(PathBuf::from(path.to_string()));
    }

    #[cfg(not(any(target_os = "ios", target_os = "macos")))]
    {
        Err(IosStagingError::AppGroupUnavailable)
    }
}

pub fn staging_root(container_root: &Path) -> PathBuf {
    container_root.join(STAGING_ROOT_DIR)
}

pub fn session_dir(
    container_root: &Path,
    area: IosStagingArea,
    session_id: &str,
) -> Result<PathBuf, IosStagingError> {
    ensure_safe_segment(session_id, "session id")?;
    Ok(staging_root(container_root)
        .join(area.dir_name())
        .join(session_id))
}

pub fn staged_file_path(
    container_root: &Path,
    area: IosStagingArea,
    session_id: &str,
    staged_name: &str,
) -> Result<PathBuf, IosStagingError> {
    ensure_safe_segment(staged_name, "file name")?;
    Ok(session_dir(container_root, area, session_id)?.join(staged_name))
}

pub fn prepare_session_dir(
    container_root: &Path,
    area: IosStagingArea,
    session_id: &str,
) -> Result<PathBuf, IosStagingError> {
    let dir = session_dir(container_root, area, session_id)?;
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn write_manifest(
    container_root: &Path,
    area: IosStagingArea,
    manifest: &IosStagingManifest,
) -> Result<PathBuf, IosStagingError> {
    ensure_safe_segment(&manifest.session_id, "session id")?;
    for file in &manifest.files {
        ensure_safe_segment(&file.staged_name, "file name")?;
    }

    let dir = prepare_session_dir(container_root, area, &manifest.session_id)?;
    let path = dir.join(STAGING_MANIFEST_FILE);
    let json = serde_json::to_vec_pretty(manifest)?;
    crate::helpers::storage::write_bytes_atomic(&path, &json).map_err(|error| {
        IosStagingError::Io(std::io::Error::new(std::io::ErrorKind::Other, error))
    })?;
    Ok(path)
}

pub fn read_manifest(
    container_root: &Path,
    area: IosStagingArea,
    session_id: &str,
) -> Result<IosStagingManifest, IosStagingError> {
    let path = session_dir(container_root, area, session_id)?.join(STAGING_MANIFEST_FILE);
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

pub fn purge_session(
    container_root: &Path,
    area: IosStagingArea,
    session_id: &str,
) -> Result<(), IosStagingError> {
    let dir = session_dir(container_root, area, session_id)?;
    if dir.exists() {
        fs::remove_dir_all(dir)?;
    }
    Ok(())
}

pub fn purge_all(container_root: &Path) -> Result<(), IosStagingError> {
    let root = staging_root(container_root);
    if root.exists() {
        fs::remove_dir_all(root)?;
    }
    Ok(())
}

pub fn purge_stale_sessions(
    container_root: &Path,
    max_age: Duration,
) -> Result<u64, IosStagingError> {
    let root = staging_root(container_root);
    if !root.exists() {
        return Ok(0);
    }

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let max_age_ms = max_age.as_millis();
    let mut removed = 0_u64;

    for area in IosStagingArea::all() {
        let area_root = root.join(area.dir_name());
        if !area_root.exists() {
            continue;
        }

        for entry in fs::read_dir(area_root)? {
            let entry = entry?;
            if !entry.file_type()?.is_dir() {
                continue;
            }

            let Some(session_id) = entry.file_name().to_str().map(str::to_string) else {
                fs::remove_dir_all(entry.path())?;
                removed = removed.saturating_add(1);
                continue;
            };

            let stale = match read_manifest(container_root, *area, &session_id) {
                Ok(manifest) => manifest.created_at_unix_ms.saturating_add(max_age_ms) <= now_ms,
                Err(_) => true,
            };
            if stale {
                fs::remove_dir_all(entry.path())?;
                removed = removed.saturating_add(1);
            }
        }
    }

    Ok(removed)
}

fn ensure_safe_segment(value: &str, name: &'static str) -> Result<(), IosStagingError> {
    let valid = !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_'));
    if valid && value != "." && value != ".." {
        Ok(())
    } else {
        Err(IosStagingError::InvalidName(name))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file_ref(staged_name: &str) -> IosStagedFileRef {
        IosStagedFileRef {
            staged_name: staged_name.to_string(),
            display_name: "Report.pdf".to_string(),
            size: 42,
            mime_type: Some("application/pdf".to_string()),
        }
    }

    #[test]
    fn ios_staging_manifest_uses_relative_file_names() {
        let temp = tempfile::tempdir().expect("tempdir");
        let manifest = IosStagingManifest::new("session-1", vec![file_ref("item-1.pdf")]);

        let manifest_path =
            write_manifest(temp.path(), IosStagingArea::SharedFiles, &manifest).expect("manifest");
        let json = fs::read_to_string(manifest_path).expect("json");

        assert!(json.contains("\"stagedName\": \"item-1.pdf\""));
        assert!(!json.contains(temp.path().to_string_lossy().as_ref()));

        let loaded =
            read_manifest(temp.path(), IosStagingArea::SharedFiles, "session-1").expect("loaded");
        assert_eq!(loaded.session_id, "session-1");
        assert_eq!(loaded.files[0].staged_name, "item-1.pdf");
    }

    #[test]
    fn ios_staging_rejects_path_traversal_segments() {
        let temp = tempfile::tempdir().expect("tempdir");

        let err = session_dir(temp.path(), IosStagingArea::Uploads, "../vault")
            .expect_err("unsafe session id");
        assert!(matches!(err, IosStagingError::InvalidName("session id")));

        let err = staged_file_path(
            temp.path(),
            IosStagingArea::Uploads,
            "session-1",
            "nested/file.txt",
        )
        .expect_err("unsafe staged file");
        assert!(matches!(err, IosStagingError::InvalidName("file name")));
    }

    #[test]
    fn ios_staging_purges_single_session() {
        let temp = tempfile::tempdir().expect("tempdir");
        write_manifest(
            temp.path(),
            IosStagingArea::ExternalActions,
            &IosStagingManifest::new("open-1", vec![file_ref("item.pdf")]),
        )
        .expect("manifest");

        let dir = session_dir(temp.path(), IosStagingArea::ExternalActions, "open-1")
            .expect("session dir");
        assert!(dir.exists());

        purge_session(temp.path(), IosStagingArea::ExternalActions, "open-1").expect("purged");
        assert!(!dir.exists());
    }

    #[test]
    fn ios_staging_purges_all_areas() {
        let temp = tempfile::tempdir().expect("tempdir");
        write_manifest(
            temp.path(),
            IosStagingArea::BackupRestore,
            &IosStagingManifest::new("backup-1", vec![file_ref("backup.cvbak")]),
        )
        .expect("manifest");

        assert!(staging_root(temp.path()).exists());
        purge_all(temp.path()).expect("purged");
        assert!(!staging_root(temp.path()).exists());
    }

    #[test]
    fn ios_staging_purges_stale_sessions() {
        let temp = tempfile::tempdir().expect("tempdir");
        let stale_manifest = IosStagingManifest {
            session_id: "share-old".to_string(),
            created_at_unix_ms: 0,
            files: vec![file_ref("item.pdf")],
        };
        let fresh_manifest = IosStagingManifest::new("share-fresh", vec![file_ref("fresh.pdf")]);
        write_manifest(temp.path(), IosStagingArea::SharedFiles, &stale_manifest)
            .expect("stale manifest");
        write_manifest(temp.path(), IosStagingArea::SharedFiles, &fresh_manifest)
            .expect("fresh manifest");

        let removed =
            purge_stale_sessions(temp.path(), Duration::from_secs(60)).expect("purged stale");

        assert_eq!(removed, 1);
        assert!(
            !session_dir(temp.path(), IosStagingArea::SharedFiles, "share-old")
                .expect("old dir")
                .exists()
        );
        assert!(
            session_dir(temp.path(), IosStagingArea::SharedFiles, "share-fresh")
                .expect("fresh dir")
                .exists()
        );
    }
}
