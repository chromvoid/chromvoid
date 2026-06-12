use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use uuid::Uuid;

const DEFAULT_HOST_PATH_TOKEN_TTL: Duration = Duration::from_secs(10 * 60);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum HostPathPurpose {
    Upload,
    Download,
    WriteText,
}

impl HostPathPurpose {
    fn label(self) -> &'static str {
        match self {
            Self::Upload => "upload",
            Self::Download => "download",
            Self::WriteText => "write_text",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HostPathTokenGrant {
    pub(crate) token: String,
    pub(crate) name: String,
    pub(crate) size: Option<u64>,
}

#[derive(Debug, Clone)]
struct HostPathCapability {
    path: PathBuf,
    purpose: HostPathPurpose,
    expires_at: Instant,
}

pub(crate) struct HostPathCapabilityRegistry {
    entries: Mutex<HashMap<String, HostPathCapability>>,
    ttl: Duration,
}

impl HostPathCapabilityRegistry {
    pub(crate) fn new() -> Self {
        Self::with_ttl(DEFAULT_HOST_PATH_TOKEN_TTL)
    }

    fn with_ttl(ttl: Duration) -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            ttl,
        }
    }

    pub(crate) fn issue_existing_file(
        &self,
        path: impl AsRef<Path>,
        purpose: HostPathPurpose,
    ) -> Result<HostPathTokenGrant, String> {
        let path = canonicalize_existing_file(path.as_ref())?;
        let metadata = std::fs::metadata(&path)
            .map_err(|error| format!("Failed to stat selected file: {error}"))?;
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| !name.trim().is_empty())
            .ok_or_else(|| "Selected file has no valid file name".to_string())?
            .to_string();
        Ok(self.issue_canonical_path(path, purpose, name, Some(metadata.len())))
    }

    pub(crate) fn issue_save_target(
        &self,
        path: impl AsRef<Path>,
        purpose: HostPathPurpose,
    ) -> Result<HostPathTokenGrant, String> {
        let path = canonicalize_save_target(path.as_ref())?;
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| !name.trim().is_empty())
            .ok_or_else(|| "Selected target has no valid file name".to_string())?
            .to_string();
        Ok(self.issue_canonical_path(path, purpose, name, None))
    }

    pub(crate) fn consume(&self, token: &str, purpose: HostPathPurpose) -> Result<PathBuf, String> {
        let now = Instant::now();
        let mut entries = self
            .entries
            .lock()
            .map_err(|_| "Host path token registry poisoned".to_string())?;
        entries.retain(|_, entry| entry.expires_at > now);

        let Some(entry) = entries.get(token).cloned() else {
            return Err("Host path token is invalid or expired".to_string());
        };
        if entry.purpose != purpose {
            return Err(format!(
                "Host path token purpose mismatch: expected {}, got {}",
                purpose.label(),
                entry.purpose.label()
            ));
        }

        entries.remove(token);
        Ok(entry.path)
    }

    fn issue_canonical_path(
        &self,
        path: PathBuf,
        purpose: HostPathPurpose,
        name: String,
        size: Option<u64>,
    ) -> HostPathTokenGrant {
        let token = Uuid::new_v4().to_string();
        let capability = HostPathCapability {
            path,
            purpose,
            expires_at: Instant::now() + self.ttl,
        };
        if let Ok(mut entries) = self.entries.lock() {
            entries.insert(token.clone(), capability);
        }
        HostPathTokenGrant { token, name, size }
    }
}

fn canonicalize_existing_file(path: &Path) -> Result<PathBuf, String> {
    let canonical =
        std::fs::canonicalize(path).map_err(|error| format!("Failed to resolve file: {error}"))?;
    let metadata =
        std::fs::metadata(&canonical).map_err(|error| format!("Failed to stat file: {error}"))?;
    if !metadata.is_file() {
        return Err("Selected path is not a file".to_string());
    }
    Ok(canonical)
}

fn canonicalize_save_target(path: &Path) -> Result<PathBuf, String> {
    if path.exists() {
        let canonical = std::fs::canonicalize(path)
            .map_err(|error| format!("Failed to resolve target: {error}"))?;
        if canonical.is_dir() {
            return Err("Selected target is a directory".to_string());
        }
        return Ok(canonical);
    }

    let file_name = path
        .file_name()
        .ok_or_else(|| "Selected target has no file name".to_string())?;
    let parent = path
        .parent()
        .ok_or_else(|| "Selected target has no parent directory".to_string())?;
    let parent = std::fs::canonicalize(parent)
        .map_err(|error| format!("Failed to resolve target directory: {error}"))?;
    if !parent.is_dir() {
        return Err("Selected target parent is not a directory".to_string());
    }
    Ok(parent.join(file_name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_is_single_use_for_matching_purpose() {
        let registry = HostPathCapabilityRegistry::with_ttl(Duration::from_secs(60));
        let dir = tempfile::tempdir().expect("tempdir");
        let file = dir.path().join("upload.txt");
        std::fs::write(&file, b"data").expect("write file");

        let grant = registry
            .issue_existing_file(&file, HostPathPurpose::Upload)
            .expect("issue token");
        assert_eq!(
            registry
                .consume(&grant.token, HostPathPurpose::Upload)
                .expect("consume token"),
            std::fs::canonicalize(&file).expect("canonicalize")
        );
        assert!(registry
            .consume(&grant.token, HostPathPurpose::Upload)
            .is_err());
    }

    #[test]
    fn purpose_mismatch_does_not_consume_token() {
        let registry = HostPathCapabilityRegistry::with_ttl(Duration::from_secs(60));
        let dir = tempfile::tempdir().expect("tempdir");
        let file = dir.path().join("upload.txt");
        std::fs::write(&file, b"data").expect("write file");

        let grant = registry
            .issue_existing_file(&file, HostPathPurpose::Upload)
            .expect("issue token");
        assert!(registry
            .consume(&grant.token, HostPathPurpose::Download)
            .is_err());
        assert!(registry
            .consume(&grant.token, HostPathPurpose::Upload)
            .is_ok());
    }

    #[test]
    fn expired_token_is_rejected() {
        let registry = HostPathCapabilityRegistry::with_ttl(Duration::ZERO);
        let dir = tempfile::tempdir().expect("tempdir");
        let file = dir.path().join("upload.txt");
        std::fs::write(&file, b"data").expect("write file");

        let grant = registry
            .issue_existing_file(&file, HostPathPurpose::Upload)
            .expect("issue token");
        assert!(registry
            .consume(&grant.token, HostPathPurpose::Upload)
            .is_err());
    }

    #[test]
    fn nonexistent_upload_path_is_rejected() {
        let registry = HostPathCapabilityRegistry::with_ttl(Duration::from_secs(60));
        let dir = tempfile::tempdir().expect("tempdir");
        let missing = dir.path().join("missing.txt");

        assert!(registry
            .issue_existing_file(&missing, HostPathPurpose::Upload)
            .is_err());
    }

    #[test]
    fn save_target_canonicalizes_existing_parent() {
        let registry = HostPathCapabilityRegistry::with_ttl(Duration::from_secs(60));
        let dir = tempfile::tempdir().expect("tempdir");
        let target = dir.path().join("export.json");

        let grant = registry
            .issue_save_target(&target, HostPathPurpose::WriteText)
            .expect("issue save token");
        let consumed = registry
            .consume(&grant.token, HostPathPurpose::WriteText)
            .expect("consume token");
        let canonical_parent = std::fs::canonicalize(dir.path()).expect("canonicalize");
        assert_eq!(consumed.parent(), Some(canonical_parent.as_path()));
        assert_eq!(
            consumed.file_name().and_then(|name| name.to_str()),
            Some("export.json")
        );
    }
}
