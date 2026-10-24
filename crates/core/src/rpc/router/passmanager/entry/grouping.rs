//! Stable metadata grouping keys for bounded catalog presentation.
use crate::rpc::router::credential_types::PassmanagerCredentialMeta;
use serde_json::{Map, Value};

#[derive(Default, Eq, PartialEq, Ord, PartialOrd)]
pub(super) struct GroupKey {
    rank: u8,
    pub(super) key: String,
}

pub(super) fn key(mode: Option<&str>, anchor: Option<u64>, meta: &Map<String, Value>) -> GroupKey {
    let (rank, key) = match mode {
        Some("website") => {
            let rules = PassmanagerCredentialMeta::url_rules(meta);
            let website = rules.iter().find(|rule| {
                ["base_domain", "host", "starts_with", "exact"].contains(&rule.r#match.as_str())
            });
            let Some(rule) = website else {
                return GroupKey {
                    rank: 1,
                    key: String::new(),
                };
            };
            let value = rule.value.trim();
            let url = if value.contains("://") {
                value.to_owned()
            } else {
                format!("https://{value}")
            };
            let host = url::Url::parse(&url)
                .ok()
                .and_then(|url| url.host_str().map(str::to_owned));
            let key = host
                .map(|host| host.strip_prefix("www.").unwrap_or(&host).to_owned())
                .unwrap_or_else(|| value.to_owned());
            return GroupKey {
                rank: u8::from(key.is_empty()),
                key,
            };
        }
        Some("modified") => {
            let now = anchor.unwrap_or(0); // Request validation requires an explicit positive anchor.
            let updated = normalized_timestamp(meta).unwrap_or(now);
            let days = (i128::from(now) - i128::from(updated)).div_euclid(86_400_000);
            if days == 0 {
                (0, "today")
            } else if days == 1 {
                (1, "yesterday")
            } else if days < 7 {
                (2, "week")
            } else if days < 30 {
                (3, "month")
            } else if days < 365 {
                (4, "year")
            } else {
                (5, "older")
            }
        }
        Some("security") => {
            let has_otp = meta.get("entry_type").and_then(Value::as_str) != Some("payment_card")
                && meta
                    .get("otps")
                    .and_then(Value::as_array)
                    .is_some_and(|items| !items.is_empty());
            if has_otp {
                (0, "otp")
            } else {
                (1, "basic")
            }
        }
        _ => return GroupKey::default(),
    };
    GroupKey {
        rank,
        key: key.to_owned(),
    }
}

// Existing client's imported timestamp units, shared by recent filtering and grouping.
// Missing/invalid timestamps are treated as current without rewriting stored metadata.
pub(super) fn normalized_timestamp(meta: &Map<String, Value>) -> Option<u64> {
    let value = meta.get("updatedTs").or_else(|| meta.get("updated_ts"))?;
    let number = value
        .as_f64()
        .or_else(|| value.as_str()?.trim().parse::<f64>().ok())?;
    if !number.is_finite() || number <= 0.0 {
        return None;
    }
    let millis = if number < 10_000_000_000.0 {
        number * 1000.0
    } else if number < 10_000_000_000_000.0 {
        number
    } else if number < 10_000_000_000_000_000.0 {
        number / 1000.0
    } else {
        number / 1_000_000.0
    };
    Some(millis.floor() as u64)
}
