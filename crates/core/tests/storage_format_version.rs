//! ADR-003: storage must include a format version file.

use chromvoid_core::storage::Storage;
use tempfile::TempDir;

#[test]
fn test_storage_has_format_version_file() {
    let temp_dir = TempDir::new().expect("temp dir");
    let _storage = Storage::new(temp_dir.path()).expect("storage");

    let path = temp_dir.path().join("format.version");
    assert!(
        path.exists(),
        "ADR-003 requires storage format version file at {path:?}"
    );

    let bytes = std::fs::read(&path).expect("read format.version");
    let v: serde_json::Value = serde_json::from_slice(&bytes).expect("format.version must be JSON");

    assert_eq!(v.get("v").and_then(|x| x.as_u64()), Some(2));
    assert!(v.get("format").and_then(|x| x.as_str()).is_some());
    assert!(v.get("chunk_size").and_then(|x| x.as_u64()).is_some());
    assert!(v.get("created_at").and_then(|x| x.as_u64()).is_some());
    assert!(v.get("migration_applied").is_some());
    assert_eq!(v.get("kdf").and_then(|x| x.as_u64()), Some(2));
    assert_eq!(v.get("pepper").and_then(|x| x.as_bool()), Some(true));
}
