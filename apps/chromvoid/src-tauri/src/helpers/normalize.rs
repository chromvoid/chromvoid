use serde_json::Value;

pub(crate) fn normalize_u64_fields(value: &mut Value) {
    const KEYS: &[&str] = &[
        "node_id",
        "nodeId",
        "size",
        "from_version",
        "fromVersion",
        "offset",
        "chunk_index",
        "chunkIndex",
        "chunk_count",
        "chunkCount",
        "ts",
        "TS",
        "version",
        "v",
    ];

    match value {
        Value::Array(items) => {
            for it in items {
                normalize_u64_fields(it);
            }
        }
        Value::Object(map) => {
            for (k, v) in map.iter_mut() {
                if KEYS.contains(&k.as_str()) {
                    if let Value::String(s) = v {
                        let digits = s.as_bytes().iter().all(|c| c.is_ascii_digit());
                        if digits {
                            if let Ok(n) = s.parse::<u64>() {
                                *v = Value::Number(serde_json::Number::from(n));
                                continue;
                            }
                        }
                    }
                }
                normalize_u64_fields(v);
            }
        }
        _ => {}
    }
}
