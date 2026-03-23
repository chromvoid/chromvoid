use super::*;
use tempfile::TempDir;

fn create_test_storage() -> (Storage, TempDir) {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let storage = Storage::new(temp_dir.path()).expect("failed to create storage");
    (storage, temp_dir)
}

#[test]
fn test_storage_creation() {
    let (storage, _temp_dir) = create_test_storage();

    assert!(storage.base_path().join("chunks").exists());
}

#[test]
fn test_salt_creation() {
    let (storage, _temp_dir) = create_test_storage();

    assert!(!storage.salt_exists());

    let salt = storage.get_or_create_salt().expect("should create salt");

    assert!(storage.salt_exists());
    assert_eq!(salt.len(), SALT_SIZE);

    assert!(salt.iter().any(|&b| b != 0));
}

#[test]
fn test_salt_persistence() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");

    let storage1 = Storage::new(temp_dir.path()).expect("failed to create storage");
    let salt1 = storage1.get_or_create_salt().expect("should create salt");

    let storage2 = Storage::new(temp_dir.path()).expect("failed to create storage");
    let salt2 = storage2
        .get_or_create_salt()
        .expect("should read existing salt");

    assert_eq!(salt1, salt2);
}

#[test]
fn test_write_read_chunk() {
    let (storage, _temp_dir) = create_test_storage();

    let name = "01a2b3c4d5e6f7890123456789abcdef01a2b3c4d5e6f7890123456789abcdef";
    let data = b"Hello, KeepPrivy!";

    storage.write_chunk(name, data).expect("should write chunk");

    let read_data = storage.read_chunk(name).expect("should read chunk");

    assert_eq!(read_data, data);
}

#[test]
fn test_chunk_path_structure() {
    let (storage, _temp_dir) = create_test_storage();

    let name = "a1b2c3d4e5f67890123456789abcdef01a2b3c4d5e6f7890123456789abcdef0";
    let data = b"test";

    storage.write_chunk(name, data).expect("should write chunk");

    let expected_path = storage
        .base_path()
        .join("chunks")
        .join("a")
        .join("1b")
        .join(name);

    assert!(expected_path.exists());
}

#[test]
fn test_chunk_exists() {
    let (storage, _temp_dir) = create_test_storage();

    let name = "01a2b3c4d5e6f7890123456789abcdef01a2b3c4d5e6f7890123456789abcdef";

    assert!(!storage.chunk_exists(name).unwrap());

    storage.write_chunk(name, b"test").expect("should write");

    assert!(storage.chunk_exists(name).unwrap());
}

#[test]
fn test_delete_chunk() {
    let (storage, _temp_dir) = create_test_storage();

    let name = "01a2b3c4d5e6f7890123456789abcdef01a2b3c4d5e6f7890123456789abcdef";

    storage.write_chunk(name, b"test").expect("should write");
    assert!(storage.chunk_exists(name).unwrap());

    storage.delete_chunk(name).expect("should delete");
    assert!(!storage.chunk_exists(name).unwrap());
}

#[test]
fn test_delete_nonexistent_chunk() {
    let (storage, _temp_dir) = create_test_storage();

    let name = "01a2b3c4d5e6f7890123456789abcdef01a2b3c4d5e6f7890123456789abcdef";

    storage.delete_chunk(name).expect("should not error");
}

#[test]
fn test_read_nonexistent_chunk() {
    let (storage, _temp_dir) = create_test_storage();

    let name = "01a2b3c4d5e6f7890123456789abcdef01a2b3c4d5e6f7890123456789abcdef";

    let result = storage.read_chunk(name);

    assert!(result.is_err());
    assert!(matches!(result, Err(Error::ChunkNotFound(_))));
}

#[test]
fn test_list_chunks() {
    let (storage, _temp_dir) = create_test_storage();

    let names = [
        "01a2b3c4d5e6f7890123456789abcdef01a2b3c4d5e6f7890123456789abcdef",
        "a1b2c3d4e5f67890123456789abcdef01a2b3c4d5e6f7890123456789abcdef0",
        "f1e2d3c4b5a67890123456789abcdef01a2b3c4d5e6f7890123456789abcdef0",
    ];

    for name in &names {
        storage.write_chunk(name, b"test").expect("should write");
    }

    let listed = storage.list_chunks().expect("should list chunks");

    assert_eq!(listed.len(), names.len());
    for name in &names {
        assert!(listed.contains(&name.to_string()));
    }
}

#[test]
fn test_invalid_chunk_name_short() {
    let (storage, _temp_dir) = create_test_storage();

    let result = storage.write_chunk("ab", b"test");

    assert!(result.is_err());
    assert!(matches!(result, Err(Error::InvalidChunkName(_))));
}

#[test]
fn test_invalid_chunk_name_not_hex() {
    let (storage, _temp_dir) = create_test_storage();

    let result = storage.write_chunk("xyz123", b"test");

    assert!(result.is_err());
    assert!(matches!(result, Err(Error::InvalidChunkName(_))));
}
