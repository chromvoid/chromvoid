use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormatVersionFile {
    pub v: u64,
    pub format: String,
    pub chunk_size: u32,
    pub created_at: u64,
    #[serde(default)]
    pub migration_applied: serde_json::Value,

    // Forward-compatible: allow extra fields (e.g. future migration metadata).
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

impl FormatVersionFile {
    pub fn new_default(created_at: u64) -> Self {
        let mut extra = serde_json::Map::new();
        extra.insert("kdf".to_string(), serde_json::json!(2));
        extra.insert("pepper".to_string(), serde_json::json!(true));

        Self {
            v: 2,
            format: "sharded".to_string(),
            chunk_size: crate::types::DEFAULT_CHUNK_SIZE,
            created_at,
            migration_applied: serde_json::Value::Null,
            extra,
        }
    }
}
