use crate::rpc::types::{CredentialImportWarningCode as Warning, PassmanagerOtpUriRequest};
use keepass::db::Entry;
use serde_json::{json, Value};

const STANDARD: &[&str] = &["Title", "UserName", "Password", "URL", "Notes"];
const OTP: &[&str] = &[
    "otp",
    "OTP",
    "TOTP Seed",
    "totp-secret",
    "TimeOtp-Secret-Base32",
    "TimeOtp-Secret-Base64",
];

fn append(note: &mut String, label: &str, value: &str) {
    if value.is_empty() {
        return;
    }
    if !note.is_empty() {
        note.push('\n')
    }
    note.push_str(label);
    note.push_str(": ");
    note.push_str(value);
}

pub(super) fn map(entry: &Entry, output: &mut Value) -> Vec<Warning> {
    let mut warnings = Vec::new();
    output["username"] = json!(entry.get_username().unwrap_or_default());
    output["password"] = json!(entry.get_password().unwrap_or_default());
    output["tags"] = json!(entry.tags);
    if let Some(url) = entry.get_url().filter(|value| !value.is_empty()) {
        output["urls"] = json!([{"value":url,"match":"base_domain"}]);
    }
    for (name, time) in [
        ("createdAt", entry.times.creation),
        ("updatedAt", entry.times.last_modification),
    ] {
        if let Some(time) = time {
            output[name] = json!(time.and_utc().timestamp_millis());
        }
    }
    let mut note = entry.get("Notes").unwrap_or_default().to_owned();
    let mut consumed = None;
    if let Some((field, raw)) = OTP.iter().find_map(|name| {
        entry
            .get(name)
            .filter(|value| !value.is_empty())
            .map(|value| (*name, value))
    }) {
        let uri = if raw.trim_start().starts_with("otpauth://") {
            raw.trim().to_owned()
        } else {
            let mut uri = url::Url::parse("otpauth://totp/").expect("static OTP URI");
            uri.query_pairs_mut().append_pair("secret", raw.trim());
            if field == "TimeOtp-Secret-Base64" {
                uri.query_pairs_mut().append_pair("encoding", "base64");
            }
            uri.to_string()
        };
        match super::super::super::otp::uri::parse(PassmanagerOtpUriRequest {
            uri,
            fallback_label: output["title"].as_str().map(str::to_owned),
        }) {
            Ok(parsed) => {
                let settings = parsed.settings;
                output["otps"] = json!([{"id":"keepass-otp","secret":parsed.secret,"label":settings.label,"encoding":settings.encoding,
                    "algorithm":settings.algorithm,"digits":settings.digits,"period":settings.period,"type":settings.otp_type,
                    "counter":settings.counter.and_then(|value| value.parse::<u64>().ok())}]);
                consumed = Some(field);
            }
            Err(_) => warnings.push(Warning::OtpInNote),
        }
    }
    let mut fields: Vec<_> = entry.fields.iter().collect();
    fields.sort_by_key(|(name, _)| *name);
    for (name, value) in fields {
        if STANDARD.contains(&name.as_str()) || consumed == Some(name.as_str()) {
            continue;
        }
        append(&mut note, name, value.get());
    }
    if let Some(history) = &entry.history {
        for old in history.get_entries() {
            let values: std::collections::BTreeMap<_, _> = old
                .fields
                .iter()
                .map(|(key, value)| (key, value.get()))
                .collect();
            append(&mut note, "Previous values", &json!(values).to_string());
        }
    }
    if let Some(override_url) = &entry.override_url {
        append(&mut note, "URL override", override_url)
    }
    output["note"] = json!(note);
    warnings
}
