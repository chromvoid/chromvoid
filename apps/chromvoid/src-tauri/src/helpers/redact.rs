use serde_json::Value;

pub(crate) fn redact_rpc_data(command: &str, data: &Value) -> Value {
    // Env Runtime payloads can contain secret material, raw references, env
    // names, paths, arguments, and untrusted reasons. Redact the entire domain
    // so newly added fields cannot silently become loggable.
    if command.starts_with("env_runtime:") {
        return Value::String("<redacted>".to_string());
    }
    if command == "passmanager:entry:create" {
        return Value::String("<redacted>".to_string());
    }

    fn should_redact(command: &str, key: &str) -> bool {
        matches!(
            key,
            "password"
                | "master_password"
                | "pin"
                | "secret"
                | "entropy"
                | "mnemonic_entropy"
                | "mnemonicEntropy"
                | "private_key"
                | "privateKey"
                | "bip39_passphrase"
                | "bip39Passphrase"
                | "mnemonic"
                | "canonical_payload"
                | "canonicalPayload"
                | "signed_payload"
                | "signedPayload"
        ) || (command == "passmanager:secret:save" && key == "value")
            || (command.starts_with("wallet:")
                && matches!(
                    key,
                    "mnemonic"
                        | "entropy"
                        | "mnemonic_entropy"
                        | "mnemonicEntropy"
                        | "bip39_passphrase"
                        | "bip39Passphrase"
                        | "private_key"
                        | "privateKey"
                        | "canonical_payload"
                        | "canonicalPayload"
                        | "signed_payload"
                        | "signedPayload"
                ))
            || (command.starts_with("backup:") && matches!(key, "master_password" | "password"))
            || (command == "vault:rekey" && matches!(key, "current_password" | "new_password"))
            || (command == "master:rekey"
                && matches!(
                    key,
                    "current_password"
                        | "current_master_password"
                        | "currentMasterPassword"
                        | "new_master_password"
                        | "newMasterPassword"
                        | "new_password"
                ))
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
