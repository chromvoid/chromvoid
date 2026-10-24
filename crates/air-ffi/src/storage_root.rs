use std::path::{Component, Path, PathBuf};

use crate::BridgeError;

fn rejects_traversal(requested: &Path) -> bool {
    !requested.is_absolute()
        || requested
            .components()
            .any(|part| matches!(part, Component::ParentDir | Component::CurDir))
}

/// Reject a component that exists but is not a plain directory. A missing
/// component is allowed: the runtime creates the root itself.
fn is_plain_directory_or_missing(path: &Path) -> bool {
    match path.symlink_metadata() {
        Ok(metadata) => metadata.is_dir() && !metadata.file_type().is_symlink(),
        Err(error) => error.kind() == std::io::ErrorKind::NotFound,
    }
}

/// The sandbox home is supplied by the native process, never by an RPC payload.
#[cfg(any(target_os = "ios", test))]
pub(crate) fn validate_apple_storage_root(
    home: &Path,
    requested: &Path,
) -> Result<PathBuf, BridgeError> {
    if !home.is_absolute() || rejects_traversal(requested) {
        return Err(BridgeError::InvalidStorageRoot);
    }
    let expected = home.join("Library/Application Support/ChromVoidAir");
    if requested != expected {
        return Err(BridgeError::InvalidStorageRoot);
    }
    let home_metadata = home
        .symlink_metadata()
        .map_err(|_| BridgeError::InvalidStorageRoot)?;
    if !home_metadata.is_dir() || home_metadata.file_type().is_symlink() {
        return Err(BridgeError::InvalidStorageRoot);
    }
    let mut current = home.to_path_buf();
    for part in ["Library", "Application Support", "ChromVoidAir"] {
        current.push(part);
        if !is_plain_directory_or_missing(&current) {
            return Err(BridgeError::InvalidStorageRoot);
        }
    }
    Ok(expected)
}

/// Android has no sandbox home variable, so the package identity read from the
/// OS is what binds the requested path. `/data/user/<n>/<package>` and its
/// `/data/data/<package>` alias are both legitimate spellings of the private
/// directory; the alias itself is an OS-owned symlink and is not walked.
/// Only the components the application can create - `files` and the root - are
/// checked for a planted symlink.
#[cfg(any(target_os = "android", test))]
pub(crate) fn validate_android_storage_root(
    package: &str,
    requested: &Path,
) -> Result<PathBuf, BridgeError> {
    if package.is_empty() || rejects_traversal(requested) {
        return Err(BridgeError::InvalidStorageRoot);
    }
    let mut parts = requested.components().filter_map(|part| match part {
        Component::Normal(value) => value.to_str(),
        _ => None,
    });
    if parts.next() != Some("data") {
        return Err(BridgeError::InvalidStorageRoot);
    }
    let private_dir = match parts.next() {
        Some("user") => {
            let user = parts.next().ok_or(BridgeError::InvalidStorageRoot)?;
            if user.is_empty() || !user.bytes().all(|byte| byte.is_ascii_digit()) {
                return Err(BridgeError::InvalidStorageRoot);
            }
            PathBuf::from("/data/user").join(user)
        }
        Some("data") => PathBuf::from("/data/data"),
        _ => return Err(BridgeError::InvalidStorageRoot),
    };
    if parts.next() != Some(package)
        || parts.next() != Some("files")
        || parts.next() != Some("ChromVoidAir")
        || parts.next().is_some()
    {
        return Err(BridgeError::InvalidStorageRoot);
    }
    let mut current = private_dir.join(package);
    for part in ["files", "ChromVoidAir"] {
        current.push(part);
        if !is_plain_directory_or_missing(&current) {
            return Err(BridgeError::InvalidStorageRoot);
        }
    }
    Ok(current)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn root_validation_does_not_create_files_and_rejects_other_locations() {
        let home = tempfile::tempdir().unwrap();
        let root = home.path().join("Library/Application Support/ChromVoidAir");
        assert_eq!(
            validate_apple_storage_root(home.path(), &root).unwrap(),
            root
        );
        assert!(!root.exists());
        for path in [
            home.path().to_path_buf(),
            home.path().join("other"),
            root.join("../ChromVoidAir"),
        ] {
            assert!(matches!(
                validate_apple_storage_root(home.path(), &path),
                Err(BridgeError::InvalidStorageRoot)
            ));
        }
    }
    #[cfg(unix)]
    #[test]
    fn symlink_cannot_redirect_the_fixed_root() {
        let home = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(outside.path(), home.path().join("Library")).unwrap();
        assert!(matches!(
            validate_apple_storage_root(
                home.path(),
                &home.path().join("Library/Application Support/ChromVoidAir")
            ),
            Err(BridgeError::InvalidStorageRoot)
        ));
        assert_eq!(std::fs::read_dir(outside.path()).unwrap().count(), 0);
    }
    #[test]
    fn android_root_accepts_both_private_directory_spellings() {
        for path in [
            "/data/user/0/com.chromvoid.air.dev/files/ChromVoidAir",
            "/data/user/10/com.chromvoid.air.dev/files/ChromVoidAir",
            "/data/data/com.chromvoid.air.dev/files/ChromVoidAir",
        ] {
            assert_eq!(
                validate_android_storage_root("com.chromvoid.air.dev", Path::new(path)).unwrap(),
                PathBuf::from(path)
            );
        }
    }
    #[test]
    fn android_root_rejects_another_package_or_location() {
        for path in [
            "/data/user/0/com.other.app/files/ChromVoidAir",
            "/data/user/0/com.chromvoid.air.dev/files",
            "/data/user/0/com.chromvoid.air.dev/files/ChromVoidAir/nested",
            "/data/user/x/com.chromvoid.air.dev/files/ChromVoidAir",
            "/sdcard/com.chromvoid.air.dev/files/ChromVoidAir",
            "/data/user/0/com.chromvoid.air.dev/files/../files/ChromVoidAir",
            "data/user/0/com.chromvoid.air.dev/files/ChromVoidAir",
        ] {
            assert!(matches!(
                validate_android_storage_root("com.chromvoid.air.dev", Path::new(path)),
                Err(BridgeError::InvalidStorageRoot)
            ));
        }
        assert!(matches!(
            validate_android_storage_root(
                "",
                Path::new("/data/user/0/com.chromvoid.air.dev/files/ChromVoidAir")
            ),
            Err(BridgeError::InvalidStorageRoot)
        ));
    }
}
