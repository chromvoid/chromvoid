use super::{array, invalid, text};
use crate::rpc::types::{
    CredentialImportWarningCode as Warning, PassmanagerOtpUriRequest, RpcResponse,
};
use serde_json::{json, Value};
use std::collections::BTreeSet;

fn value(field: &Value) -> Option<String> {
    let value = field.get("value")?;
    let selected = if let Some(object) = value.as_object() {
        ["concealed", "text", "value", "totp"]
            .into_iter()
            .find_map(|key| object.get(key))
            .unwrap_or(value)
    } else {
        value
    };
    match selected {
        Value::Null => None,
        Value::String(text) if text.is_empty() => None,
        Value::String(text) => Some(text.clone()),
        Value::Object(object) if object.is_empty() => None,
        _ => Some(selected.to_string()),
    }
}
fn signature(field: &Value) -> String {
    ["designation", "fieldType", "id", "name", "title"]
        .into_iter()
        .filter_map(|key| text(field, key))
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}
fn append(note: &mut String, label: &str, value: &str) {
    if value.is_empty() {
        return;
    }
    if !note.is_empty() {
        note.push('\n');
    }
    if !label.is_empty() {
        note.push_str(label);
        note.push_str(": ");
    }
    note.push_str(value);
}
pub(super) fn map(item: &Value, output: &mut Value) -> Result<Vec<Warning>, RpcResponse> {
    let details = item.get("details").unwrap_or(&Value::Null);
    let overview = item.get("overview").unwrap_or(&Value::Null);
    let mut warnings = Vec::new();
    let mut fields = Vec::new();
    for field in array(details, "loginFields")? {
        fields.push((String::new(), field));
    }
    for section in array(details, "sections")? {
        for field in array(section, "fields")? {
            fields.push((text(section, "title").unwrap_or_default().to_owned(), field));
        }
    }
    let mut used = BTreeSet::new();
    if matches!(text(item, "categoryUuid"), Some("001" | "005")) {
        for kind in ["username", "password"] {
            let found = fields
                .iter()
                .enumerate()
                .find(|(_, (_, field))| {
                    text(field, "designation") == Some(kind) && value(field).is_some()
                })
                .or_else(|| {
                    fields.iter().enumerate().find(|(_, (_, field))| {
                        let signature = signature(field);
                        (signature.contains(kind)
                            || (kind == "password" && text(field, "fieldType") == Some("P"))
                            || (kind == "username" && signature.contains("email")))
                            && value(field).is_some()
                    })
                });
            if let Some((index, (_, field))) = found {
                output[kind] = json!(value(field).unwrap());
                used.insert(index);
            }
        }
        if output.get("password").is_none() {
            if let Some(password) = text(details, "password") {
                output["password"] = json!(password);
            }
        }
    }
    let mut note = text(details, "notesPlain").unwrap_or_default().to_owned();
    let category = match text(item, "categoryUuid") {
        Some("002") => Some("Credit Card"),
        Some("003") => Some("Secure Note"),
        Some("004") => Some("Identity"),
        Some("001" | "005") => None,
        category => category,
    };
    if let Some(category) = category {
        append(&mut note, "Imported category", category);
    }

    append(
        &mut note,
        "",
        text(overview, "subtitle").unwrap_or_default(),
    );
    if let Some((index, (_, field))) = fields.iter().enumerate().find(|(_, (_, field))| {
        value(field).is_some_and(|value| {
            value.starts_with("otpauth://")
                || signature(field).contains("otp")
                || signature(field).contains("one-time password")
        })
    }) {
        let secret = value(field).unwrap();
        let uri = if secret.trim_start().starts_with("otpauth://") {
            secret.trim().to_owned()
        } else {
            let mut uri = url::Url::parse("otpauth://totp/").expect("static OTP URI");
            uri.query_pairs_mut().append_pair("secret", secret.trim());
            uri.to_string()
        };
        match super::super::super::otp::uri::parse(PassmanagerOtpUriRequest {
            uri,
            fallback_label: text(output, "title").map(str::to_owned),
        }) {
            Ok(parsed) => {
                let settings = parsed.settings;
                output["otps"] = json!([{"id":"1password-otp","label":settings.label,"secret":parsed.secret,
                    "encoding":settings.encoding,"algorithm":settings.algorithm,"digits":settings.digits,
                    "period":settings.period,"type":settings.otp_type,"counter":settings.counter.and_then(|v|v.parse::<u64>().ok())}]);
                used.insert(index);
            }
            Err(_) => warnings.push(Warning::OtpInNote),
        }
    }
    for (index, (section, field)) in fields.iter().enumerate() {
        if used.contains(&index) {
            continue;
        }
        if let Some(value) = value(field) {
            let label = ["title", "name", "id"]
                .into_iter()
                .find_map(|key| text(field, key).filter(|v| !v.is_empty()))
                .unwrap_or("Field");
            let label = if section.is_empty() {
                label.to_owned()
            } else {
                format!("{section} — {label}")
            };
            append(&mut note, &label, &value);
        }
    }
    if !matches!(text(item, "categoryUuid"), Some("001" | "005")) {
        if let Some(password) = text(details, "password") {
            append(&mut note, "Password", password);
        }
    }
    if let Some(history) = details
        .get("passwordHistory")
        .filter(|v| v.as_array().is_some_and(|v| !v.is_empty()))
    {
        append(&mut note, "Previous passwords", &history.to_string());
    }
    let mut urls = Vec::new();
    for entry in array(overview, "urls")? {
        let url = text(entry, "url").ok_or_else(|| invalid("Invalid 1Password URL"))?;
        let mode = match text(entry, "match")
            .unwrap_or_default()
            .to_lowercase()
            .as_str()
        {
            "host" => "host",
            "startswith" | "starts_with" => "starts_with",
            "exact" => "exact",
            "regex" => "regex",
            "never" => "never",
            _ => "base_domain",
        };
        let rule = json!({"value":url,"match":mode});
        if !urls.contains(&rule) {
            urls.push(rule);
        }
    }
    if let Some(url) = text(overview, "url").filter(|v| !v.is_empty()) {
        if !urls.iter().any(|item| item["value"] == url) {
            urls.insert(0, json!({"value":url,"match":"base_domain"}));
        }
    }
    output["note"] = json!(note);
    output["urls"] = json!(urls);
    output["tags"] = json!(array(overview, "tags")?);
    Ok(warnings)
}
