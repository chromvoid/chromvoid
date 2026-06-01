use super::super::error::PassmanagerCommandError;

fn is_valid_ssh_key_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

pub(in crate::rpc::router::passmanager) fn secret_filename(secret_type: &str) -> Option<String> {
    match secret_type {
        "password" => Some(".password".to_string()),
        "note" => Some(".note".to_string()),
        "card_pan" => Some(".card_pan".to_string()),
        "card_cvv" => Some(".card_cvv".to_string()),
        "ssh_private_key" => Some(".ssh_private_key.default".to_string()),
        "ssh_public_key" => Some(".ssh_public_key.default".to_string()),
        _ => {
            if let Some(id) = secret_type.strip_prefix("ssh_private_key:") {
                if is_valid_ssh_key_id(id) {
                    return Some(format!(".ssh_private_key.{id}"));
                }
            }
            if let Some(id) = secret_type.strip_prefix("ssh_public_key:") {
                if is_valid_ssh_key_id(id) {
                    return Some(format!(".ssh_public_key.{id}"));
                }
            }
            None
        }
    }
}

pub(super) fn entry_type_from_meta(meta: &serde_json::Value) -> &str {
    meta.get("entry_type")
        .or_else(|| meta.get("entryType"))
        .and_then(|v| v.as_str())
        .unwrap_or("login")
}

pub(super) fn is_secret_compatible(entry_type: &str, secret_type: &str) -> bool {
    match secret_type {
        "password" => entry_type == "login",
        "note" => entry_type == "login" || entry_type == "payment_card",
        "card_pan" | "card_cvv" => entry_type == "payment_card",
        _ => {
            secret_type.starts_with("ssh_private_key") || secret_type.starts_with("ssh_public_key")
        }
    }
}

pub(in crate::rpc::router::passmanager) fn normalize_secret_value(
    secret_type: &str,
    value: &str,
) -> Result<String, PassmanagerCommandError> {
    match secret_type {
        "card_pan" => {
            let digits: String = value.chars().filter(|c| c.is_ascii_digit()).collect();
            if !(12..=19).contains(&digits.len()) {
                return Err(PassmanagerCommandError::empty_payload(
                    "card_pan must contain 12-19 digits after normalization",
                ));
            }
            Ok(digits)
        }
        "card_cvv" => {
            let digits: String = value.chars().filter(|c| c.is_ascii_digit()).collect();
            if !(3..=4).contains(&digits.len()) {
                return Err(PassmanagerCommandError::empty_payload(
                    "card_cvv must contain 3-4 digits after normalization",
                ));
            }
            Ok(digits)
        }
        _ => Ok(value.to_string()),
    }
}
