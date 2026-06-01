use serde_json::{Map, Value};

use super::entry::{
    CredentialProviderOtpOption, CredentialProviderOtpResolution, PassmanagerUrlRule,
};

#[derive(Debug, Clone)]
pub(in crate::rpc::router) struct PassmanagerCredentialMetaDecodeError {
    details: Value,
}

impl PassmanagerCredentialMetaDecodeError {
    pub(in crate::rpc::router) fn diagnostics(&self) -> Value {
        self.details.clone()
    }
}

#[derive(Debug, Clone)]
pub(in crate::rpc::router) struct PassmanagerCredentialMeta {
    pub(in crate::rpc::router) entry_id: String,
    pub(in crate::rpc::router) label: String,
    pub(in crate::rpc::router) username: String,
    pub(in crate::rpc::router) app_id: Option<String>,
    pub(in crate::rpc::router) url_rules: Vec<PassmanagerUrlRule>,
    pub(in crate::rpc::router) otp_options: Vec<CredentialProviderOtpOption>,
    pub(in crate::rpc::router) is_payment_card: bool,
}

impl PassmanagerCredentialMeta {
    pub(in crate::rpc::router) fn decode(
        meta_bytes: &[u8],
        fallback_entry_id: &str,
        fallback_label: &str,
    ) -> Result<Self, PassmanagerCredentialMetaDecodeError> {
        let meta: Value = serde_json::from_slice(meta_bytes).map_err(|error| {
            PassmanagerCredentialMetaDecodeError {
                details: serde_json::json!({
                    "byte_len": meta_bytes.len(),
                    "preview": Self::meta_preview(meta_bytes),
                    "serde_error": error.to_string(),
                }),
            }
        })?;
        let Some(meta_obj) = meta.as_object() else {
            return Err(PassmanagerCredentialMetaDecodeError {
                details: serde_json::json!({
                    "byte_len": meta_bytes.len(),
                    "preview": Self::meta_preview(meta_bytes),
                    "serde_error": "meta root is not a JSON object",
                }),
            });
        };

        let raw_otps = Self::otp_values(meta_obj);
        let otp_count = raw_otps.len();
        let otp_options = raw_otps
            .iter()
            .enumerate()
            .filter_map(|(index, otp)| Self::otp_option(otp, index, otp_count))
            .collect::<Vec<_>>();

        Ok(Self {
            entry_id: Self::meta_string(meta_obj, &["id", "entry_id", "entryId"])
                .unwrap_or_else(|| fallback_entry_id.to_string()),
            label: Self::meta_string(meta_obj, &["title"])
                .unwrap_or_else(|| fallback_label.to_string()),
            username: Self::meta_string(meta_obj, &["username"]).unwrap_or_default(),
            app_id: Self::meta_string(meta_obj, &["app_id", "appId"]),
            url_rules: Self::url_rules(meta_obj),
            otp_options,
            is_payment_card: Self::meta_string(meta_obj, &["entry_type", "entryType"]).as_deref()
                == Some("payment_card"),
        })
    }

    fn meta_preview(meta_bytes: &[u8]) -> String {
        const LIMIT: usize = 240;

        let preview = String::from_utf8_lossy(meta_bytes);
        let mut normalized = String::with_capacity(preview.len().min(LIMIT));
        for ch in preview.chars() {
            if normalized.len() >= LIMIT {
                break;
            }
            match ch {
                '\n' => normalized.push_str("\\n"),
                '\r' => normalized.push_str("\\r"),
                '\t' => normalized.push_str("\\t"),
                _ if ch.is_control() => normalized.push(' '),
                _ => normalized.push(ch),
            }
        }
        normalized
    }

    fn meta_string(meta: &Map<String, Value>, keys: &[&str]) -> Option<String> {
        keys.iter().find_map(|key| {
            meta.get(*key)
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string)
        })
    }

    fn url_rule_from_value(value: &Value) -> Option<PassmanagerUrlRule> {
        match value {
            Value::String(raw) => {
                let normalized = raw.trim();
                if normalized.is_empty() {
                    return None;
                }
                Some(PassmanagerUrlRule {
                    value: normalized.to_string(),
                    r#match: "base_domain".to_string(),
                })
            }
            Value::Object(object) => {
                let normalized = object
                    .get("value")
                    .or_else(|| object.get("url"))
                    .or_else(|| object.get("href"))
                    .and_then(|value| value.as_str())
                    .map(str::trim)
                    .filter(|value| !value.is_empty())?;
                let match_kind = object
                    .get("match")
                    .or_else(|| object.get("mode"))
                    .or_else(|| object.get("type"))
                    .and_then(|value| value.as_str())
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .unwrap_or("base_domain");
                Some(PassmanagerUrlRule {
                    value: normalized.to_string(),
                    r#match: match_kind.to_string(),
                })
            }
            _ => None,
        }
    }

    fn url_rules(meta: &Map<String, Value>) -> Vec<PassmanagerUrlRule> {
        let mut rules = Vec::new();
        for key in ["urls", "url_rules", "urlRules"] {
            let Some(raw_rules) = meta.get(key) else {
                continue;
            };
            match raw_rules {
                Value::Array(items) => {
                    for item in items {
                        if let Some(rule) = Self::url_rule_from_value(item) {
                            rules.push(rule);
                        }
                    }
                }
                other => {
                    if let Some(rule) = Self::url_rule_from_value(other) {
                        rules.push(rule);
                    }
                }
            }
            if !rules.is_empty() {
                return rules;
            }
        }

        if let Some(url) = meta.get("url").or_else(|| meta.get("href")) {
            if let Some(rule) = Self::url_rule_from_value(url) {
                rules.push(rule);
            }
        }

        rules
    }

    fn otp_values<'a>(meta: &'a Map<String, Value>) -> Vec<&'a Value> {
        for key in ["otps", "otp_options", "otpOptions"] {
            let Some(otps) = meta.get(key) else {
                continue;
            };
            return match otps {
                Value::Array(items) => items.iter().collect(),
                Value::Object(_) => vec![otps],
                _ => Vec::new(),
            };
        }
        Vec::new()
    }

    fn otp_option(
        value: &Value,
        index: usize,
        otp_count: usize,
    ) -> Option<CredentialProviderOtpOption> {
        let object = value.as_object()?;
        let persisted_id = Self::meta_string(object, &["id", "otp_id", "otpId"]);
        let label = Self::meta_string(object, &["label", "name"]);
        let otp_type = Self::meta_string(object, &["type", "otpType", "otp_type"])
            .map(|value| value.to_ascii_uppercase())
            .or_else(|| Some("TOTP".to_string()));

        let resolution = if let Some(id) = persisted_id.clone() {
            CredentialProviderOtpResolution::ById(id)
        } else if let Some(label) = label.clone() {
            CredentialProviderOtpResolution::ByLabel(label)
        } else if otp_count == 1 {
            CredentialProviderOtpResolution::FirstAvailable
        } else {
            return None;
        };

        Some(CredentialProviderOtpOption {
            id: persisted_id.unwrap_or_else(|| format!("otp-{}", index + 1)),
            label,
            otp_type,
            resolution,
        })
    }
}
