//! Bitwarden's unencrypted JSON mapped to the existing credential import document.
use super::super::{entry, otp, path, secret};
use super::external::{folder_path, safe_name};
use crate::credential_import::ImportDocumentInfo;
use crate::error::ErrorCode;
use crate::rpc::types::{
    CredentialImportWarning, CredentialImportWarningCode as Warning, PassmanagerOtpUriRequest,
    RpcResponse,
};
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, BTreeSet};

const MAX_ENTRIES: usize = 10_000;

fn invalid(message: &'static str) -> RpcResponse {
    RpcResponse::error(message, Some(ErrorCode::EmptyPayload))
}
fn text<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}
fn array<'a>(value: &'a Value, key: &str) -> Result<&'a [Value], RpcResponse> {
    match value.get(key) {
        None | Some(Value::Null) => Ok(&[]),
        Some(Value::Array(items)) => Ok(items),
        _ => Err(invalid("Invalid Bitwarden export structure")),
    }
}
fn warn(warnings: &mut BTreeMap<Warning, u32>, code: Warning, count: usize) {
    let total = warnings.entry(code).or_default();
    *total = total.saturating_add(u32::try_from(count).unwrap_or(u32::MAX));
}
fn details(note: &mut String, heading: &str, values: &Value) {
    if let Some(values) = values.as_object() {
        let lines: Vec<_> = values
            .iter()
            .filter_map(|(key, value)| {
                value
                    .as_str()
                    .filter(|value| !value.is_empty())
                    .map(|value| format!("{key}: {value}"))
            })
            .collect();
        if !lines.is_empty() {
            if !note.is_empty() {
                note.push_str("\n\n");
            }
            note.push_str(heading);
            note.push('\n');
            note.push_str(&lines.join("\n"));
        }
    }
}

pub(super) fn convert(data: &Value) -> Result<(Value, ImportDocumentInfo), RpcResponse> {
    if data
        .get("encrypted")
        .is_some_and(|value| value != &Value::Bool(false))
    {
        return Err(invalid("Choose an unencrypted Bitwarden JSON export"));
    }
    let items = data
        .get("items")
        .and_then(Value::as_array)
        .ok_or_else(|| invalid("Bitwarden export items must be an array"))?;
    let mut seen_ids = BTreeSet::new();
    for item in items {
        if !item.is_object() {
            return Err(invalid("Bitwarden items must be objects"));
        }
        if let Some(id) = text(item, "id").filter(|id| !id.is_empty()) {
            if !seen_ids.insert(id) {
                return Err(invalid(
                    "Bitwarden export contains duplicate item identifiers",
                ));
            }
        }
        for field in ["fields", "collectionIds"] {
            array(item, field)?;
        }
        for field in ["login", "card", "identity"] {
            if item
                .get(field)
                .is_some_and(|value| !value.is_null() && !value.is_object())
            {
                return Err(invalid("Invalid Bitwarden record details"));
            }
        }
        if let Some(login) = item.get("login") {
            array(login, "uris")?;
            array(login, "fido2Credentials")?;
        }
    }
    let mut folders = BTreeMap::new();
    for folder in array(data, "folders")? {
        let id = text(folder, "id").ok_or_else(|| invalid("Invalid Bitwarden folder"))?;
        let name = text(folder, "name").ok_or_else(|| invalid("Invalid Bitwarden folder"))?;
        folders.insert(id, folder_path(name));
    }
    let collections: BTreeMap<_, _> = array(data, "collections")?
        .iter()
        .filter_map(|value| Some((text(value, "id")?, text(value, "name")?)))
        .collect();
    let mut warnings = BTreeMap::new();
    if items.len() > MAX_ENTRIES {
        warn(
            &mut warnings,
            Warning::EntryLimit,
            items.len() - MAX_ENTRIES,
        );
    }
    let mut entries = Vec::new();
    for item in items.iter().take(MAX_ENTRIES) {
        let kind = item.get("type").and_then(Value::as_u64).unwrap_or(0);
        if !(1..=4).contains(&kind) {
            warn(&mut warnings, Warning::UnsupportedRecords, 1);
            continue;
        }
        let title = safe_name(text(item, "name").unwrap_or("Untitled"));
        let folder = text(item, "folderId")
            .and_then(|id| folders.get(id))
            .cloned()
            .unwrap_or_default();
        let login = item.get("login").unwrap_or(&Value::Null);
        let mut note = text(item, "notes").unwrap_or_default().to_owned();
        let custom: Vec<_> = array(item, "fields")?
            .iter()
            .filter_map(|field| {
                Some(format!(
                    "- {}: {}",
                    text(field, "name")?,
                    text(field, "value")?
                ))
            })
            .collect();
        if !custom.is_empty() {
            if !note.is_empty() {
                note.push('\n');
            }
            note.push_str("\nImported Fields:\n");
            note.push_str(&custom.join("\n"));
        }
        if kind == 4 {
            details(&mut note, "--- Identity Details ---", &item["identity"]);
        }
        let urls: Vec<_> = array(login, "uris")?
            .iter()
            .filter_map(|uri| {
                let value = text(uri, "uri").filter(|value| !value.is_empty())?;
                let mode = match uri.get("match").and_then(Value::as_u64) {
                    Some(1) => "host",
                    Some(2) => "starts_with",
                    Some(3) => "exact",
                    Some(4) => "regex",
                    Some(5) => "never",
                    _ => "base_domain",
                };
                Some(json!({"value":value,"match":mode}))
            })
            .collect();
        let tags: Vec<_> = array(item, "collectionIds")?
            .iter()
            .filter_map(|id| {
                collections
                    .get(id.as_str()?)
                    .map(|tag| Value::String(tag.trim().to_string()))
            })
            .collect();
        let original_id = text(item, "id").filter(|id| !id.is_empty());
        let mut output = json!({
            "title":title,"entryType":"login","folderPath":folder,
            "username":text(login,"username").unwrap_or_default(),
            "password":text(login,"password").unwrap_or_default(),
            "urls":urls,"tags":tags,"otps":[],
            "import_source":{"type":match kind {2=>"secure_note",3=>"card",4=>"identity",_=>"login"},
                "imported_at":path::now_unix_ms(),"original_id":original_id,"folder_path":folder}
        });
        if let Some(id) = original_id {
            output["id"] = Value::String(id.to_owned());
        }
        if kind == 3 {
            let card = &item["card"];
            let numeric = |key| text(card, key).and_then(|value| value.parse::<u64>().ok());
            output["paymentCard"] = json!({"cardholderName":text(card,"cardholderName").unwrap_or_default(),
                "expMonth":numeric("expMonth"),"expYear":numeric("expYear"),"brand":text(card,"brand")});
            output["entryType"] = json!("payment_card");
            let card_secrets: Result<Vec<_>, _> = [
                ("number", "cardPan", "card_pan"),
                ("code", "cardCvv", "card_cvv"),
            ]
            .into_iter()
            .filter_map(|(input, output, kind)| {
                text(card, input)
                    .filter(|value| !value.is_empty())
                    .map(|value| (output, kind, value))
            })
            .map(|(output, kind, value)| {
                secret::normalize_secret_value(kind, value).map(|value| (output, value))
            })
            .collect();
            if entry::normalized_payment_card_meta(&output)
                .ok()
                .flatten()
                .is_some()
                && card_secrets.is_ok()
            {
                for (key, value) in card_secrets.expect("validated card secrets") {
                    output[key] = Value::String(value);
                }
            } else {
                output["entryType"] = json!("login");
                output.as_object_mut().unwrap().remove("paymentCard");
                details(&mut note, "Imported card details:", card);
                warn(&mut warnings, Warning::CardInNote, 1);
            }
        }
        if let Some(secret) = text(login, "totp").filter(|value| !value.trim().is_empty()) {
            let uri = if secret.to_ascii_lowercase().starts_with("otpauth://") {
                secret.to_owned()
            } else {
                let mut uri = url::Url::parse("otpauth://totp/").expect("static OTP URI");
                uri.query_pairs_mut().append_pair("secret", secret);
                uri.to_string()
            };
            match otp::uri::parse(PassmanagerOtpUriRequest {
                uri,
                fallback_label: Some(title.clone()),
            }) {
                Ok(parsed) => {
                    let settings = parsed.settings;
                    output["otps"] = json!([{"id":"bitwarden-totp","label":settings.label,
                        "secret":parsed.secret,"encoding":settings.encoding,"algorithm":settings.algorithm,
                        "digits":settings.digits,"period":settings.period,"type":settings.otp_type,
                        "counter":settings.counter.and_then(|value|value.parse::<u64>().ok())}]);
                }
                Err(_) => {
                    if !note.is_empty() {
                        note.push_str("\n\n");
                    }
                    note.push_str("Imported OTP setup: ");
                    note.push_str(secret);
                    warn(&mut warnings, Warning::OtpInNote, 1);
                }
            }
        }
        warn(
            &mut warnings,
            Warning::PasskeysOmitted,
            array(login, "fido2Credentials")?.len(),
        );
        output["note"] = Value::String(note);
        entries.push(output);
    }
    if !items.is_empty() && entries.is_empty() {
        return Err(invalid(
            "This Bitwarden export has no supported credential records",
        ));
    }
    let root = Value::Object(Map::from_iter([
        (
            "folders".into(),
            Value::Array(folders.into_values().map(Value::String).collect()),
        ),
        ("entries".into(), Value::Array(entries)),
    ]));
    Ok((
        root,
        ImportDocumentInfo {
            legacy_ids: Default::default(),
            source: Some("bitwarden".into()),
            warnings: warnings
                .into_iter()
                .filter(|(_, count)| *count > 0)
                .map(|(code, count)| CredentialImportWarning { code, count })
                .collect(),
        },
    ))
}
