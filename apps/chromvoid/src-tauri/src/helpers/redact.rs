use serde_json::Value;

pub(crate) fn redact_rpc_data(command: &str, data: &Value) -> Value {
    fn should_redact(command: &str, key: &str) -> bool {
        matches!(
            key,
            "password" | "master_password" | "pin" | "secret" | "private_key" | "privateKey"
        ) || (command == "passmanager:secret:save" && key == "value")
            || (command.starts_with("backup:") && matches!(key, "master_password" | "password"))
    }

    fn redact_value(command: &str, key_hint: Option<&str>, value: &Value) -> Value {
        if let Some(key) = key_hint {
            if should_redact(command, key) {
                return Value::String("<redacted>".to_string());
            }
        }

        match value {
            Value::Object(map) => {
                let mut out = serde_json::Map::new();
                for (k, v) in map {
                    out.insert(k.clone(), redact_value(command, Some(k), v));
                }
                Value::Object(out)
            }
            Value::Array(items) => Value::Array(
                items
                    .iter()
                    .map(|item| redact_value(command, None, item))
                    .collect(),
            ),
            _ => value.clone(),
        }
    }

    redact_value(command, None, data)
}
