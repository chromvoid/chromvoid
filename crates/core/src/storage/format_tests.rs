use super::*;

use crate::types::DEFAULT_CHUNK_SIZE;

#[test]
fn default_v2_format_and_metadata() {
    let f = FormatVersionFile::new_default(0);

    assert_eq!(f.v, 2);
    assert_eq!(f.format, "sharded");
    assert_eq!(f.chunk_size, DEFAULT_CHUNK_SIZE);
    assert!(f.migration_applied.is_null());
}

#[test]
fn default_extra_includes_kdf_v2_and_pepper() {
    let f = FormatVersionFile::new_default(0);

    assert_eq!(f.extra.get("kdf"), Some(&serde_json::json!(2)));
    assert_eq!(f.extra.get("pepper"), Some(&serde_json::json!(true)));
}

#[test]
fn serde_roundtrip_preserves_all_fields() {
    let original = FormatVersionFile::new_default(1_717_000_000);

    let bytes = serde_json::to_vec(&original).expect("serialize");
    let parsed: FormatVersionFile = serde_json::from_slice(&bytes).expect("deserialize");

    assert_eq!(parsed.v, original.v);
    assert_eq!(parsed.format, original.format);
    assert_eq!(parsed.chunk_size, original.chunk_size);
    assert_eq!(parsed.created_at, original.created_at);
    assert_eq!(parsed.migration_applied, original.migration_applied);
    assert_eq!(parsed.extra.get("kdf"), original.extra.get("kdf"));
    assert_eq!(parsed.extra.get("pepper"), original.extra.get("pepper"));
}

#[test]
fn forward_compat_unknown_fields_land_in_extra() {
    let json = serde_json::json!({
        "v": 2,
        "format": "sharded",
        "chunk_size": DEFAULT_CHUNK_SIZE,
        "created_at": 42,
        "migration_applied": null,
        "kdf": 2,
        "pepper": true,
        "future_field": "from_a_newer_version",
        "future_obj": { "nested": 1 },
    });

    let parsed: FormatVersionFile =
        serde_json::from_value(json.clone()).expect("forward-compat parse");

    assert_eq!(
        parsed.extra.get("future_field"),
        Some(&serde_json::json!("from_a_newer_version"))
    );
    assert_eq!(
        parsed.extra.get("future_obj"),
        Some(&serde_json::json!({ "nested": 1 }))
    );

    let reserialized = serde_json::to_value(&parsed).expect("re-serialize");
    assert_eq!(reserialized.get("future_field"), json.get("future_field"));
    assert_eq!(reserialized.get("future_obj"), json.get("future_obj"));
}

#[test]
fn created_at_value_persists() {
    let f = FormatVersionFile::new_default(1_717_000_000);
    assert_eq!(f.created_at, 1_717_000_000);

    let bytes = serde_json::to_vec(&f).expect("serialize");
    let parsed: FormatVersionFile = serde_json::from_slice(&bytes).expect("deserialize");
    assert_eq!(parsed.created_at, 1_717_000_000);
}

#[test]
fn migration_applied_default_is_null_when_omitted_in_json() {
    let json = serde_json::json!({
        "v": 2,
        "format": "sharded",
        "chunk_size": DEFAULT_CHUNK_SIZE,
        "created_at": 0,
    });

    let parsed: FormatVersionFile = serde_json::from_value(json).expect("parse without field");
    assert!(parsed.migration_applied.is_null());
}
