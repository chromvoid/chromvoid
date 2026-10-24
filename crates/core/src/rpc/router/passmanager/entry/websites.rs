//! Revision-checked website edits share the provider decoder and entry metadata transaction.
use std::collections::HashSet;

use serde::de::DeserializeOwned;
use serde_json::{json, Value};

use super::super::{error::PassmanagerCommandError as Error, path::now_unix_ms};
use super::{detail, stage_entry_meta_json};
use crate::{
    error::ErrorCode,
    rpc::{
        router::{credential_types::PassmanagerCredentialMeta, domain_uow::DomainUnitOfWork},
        types::*,
    },
    storage::Storage,
    vault::VaultSession,
};

const ALIASES: [&str; 3] = ["urls", "url_rules", "urlRules"];
const MODES: [&str; 6] = [
    "base_domain",
    "host",
    "starts_with",
    "exact",
    "regex",
    "never",
];

fn decode<T: DeserializeOwned>(data: &Value) -> Result<T, Error> {
    serde_json::from_value(data.clone())
        .map_err(|_| Error::empty_payload("Invalid website request"))
}

fn raw_rules(meta: &Value) -> (&str, Vec<Value>) {
    let mut fallback = ("urls", Vec::new());
    for key in ALIASES {
        let Some(value) = meta.get(key).filter(|value| !value.is_null()) else {
            continue;
        };
        let values = match value {
            Value::Array(values) => values.clone(),
            value => vec![value.clone()],
        };
        if values
            .iter()
            .any(|value| PassmanagerCredentialMeta::url_rule_from_value(value).is_some())
        {
            return (key, values);
        }
        if fallback.1.is_empty() {
            fallback = (key, values);
        }
    }
    fallback
}

fn project(values: &[Value]) -> Result<Vec<CredentialWebsiteRule>, Error> {
    if values.len() > 100 {
        return Err(Error::empty_payload("Too many saved website rules"));
    }
    values
        .iter()
        .enumerate()
        .map(|(index, value)| {
            let rule = PassmanagerCredentialMeta::url_rule_from_value(value)
                .ok_or_else(|| Error::empty_payload("Unsupported saved website rule"))?;
            Ok(CredentialWebsiteRule {
                source_index: Some(index as u32),
                value: rule.value,
                match_mode: rule.r#match,
            })
        })
        .collect()
}

fn check_login(meta: &Value) -> Result<(), Error> {
    if meta
        .get("entry_type")
        .or_else(|| meta.get("entryType"))
        .and_then(Value::as_str)
        .unwrap_or("login")
        != "login"
    {
        return Err(Error::empty_payload("Website rules require a login"));
    }
    Ok(())
}

pub(in crate::rpc::router::passmanager) fn read(
    session: &VaultSession,
    storage: &Storage,
    data: &Value,
) -> Result<PassmanagerWebsiteResult, Error> {
    let request: PassmanagerWebsiteReadRequest = decode(data)?;
    let (_, meta, path) = detail::load(session, storage, &request.entry_id)?;
    check_login(&meta)?;
    Ok(PassmanagerWebsiteResult {
        rules: project(&raw_rules(&meta).1)?,
        errors: vec![],
        revision: Some(detail::revision(&meta, &path)?),
    })
}

fn normalize(rule: &CredentialWebsiteRule) -> Result<(String, String), &'static str> {
    if rule.value.len() > 4096 {
        return Err("too_long");
    }
    if !MODES.contains(&rule.match_mode.as_str()) {
        return Err("invalid_mode");
    }
    if rule.match_mode == "regex" {
        let value = rule.value.trim();
        regex::Regex::new(value).map_err(|_| "invalid_regex")?;
        return Ok((value.to_string(), format!("regex:{value}")));
    }
    // Same normalization as the existing website editor: remove whitespace and add HTTPS.
    let mut value: String = rule.value.chars().filter(|c| !c.is_whitespace()).collect();
    if !value.to_ascii_lowercase().starts_with("https://")
        && !value.to_ascii_lowercase().starts_with("http://")
    {
        value = format!("https://{value}");
    }
    let parsed = url::Url::parse(&value).map_err(|_| "invalid_value")?;
    if !matches!(parsed.scheme(), "http" | "https")
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("invalid_value");
    }
    if value.ends_with('/')
        && parsed.path() == "/"
        && parsed.query().is_none()
        && parsed.fragment().is_none()
    {
        value.pop();
    }
    Ok((value, format!("url:{parsed}")))
}

fn validate_rows(
    rules: Vec<CredentialWebsiteRule>,
    baseline: &[CredentialWebsiteRule],
) -> Result<PassmanagerWebsiteResult, Error> {
    if rules.len() > 100 {
        return Err(Error::empty_payload("Too many website rules"));
    }
    let mut result = PassmanagerWebsiteResult {
        rules: Vec::new(),
        errors: Vec::new(),
        revision: None,
    };
    let mut indexes = HashSet::new();
    let mut signatures = Vec::new();
    for (index, mut rule) in rules.into_iter().enumerate() {
        let previous = match rule.source_index {
            Some(source) if indexes.insert(source) => baseline.get(source as usize),
            Some(_) => return Err(Error::empty_payload("Repeated website source index")),
            None => None,
        };
        if rule.source_index.is_some() && previous.is_none() {
            return Err(Error::empty_payload("Invalid website source index"));
        }
        if rule.value.trim().is_empty() {
            continue;
        }
        let unchanged = previous == Some(&rule);
        match normalize(&rule) {
            Ok((value, signature)) => {
                signatures.push((index as u32, signature, unchanged));
                if !unchanged {
                    rule.value = value;
                }
            }
            Err(code) if !unchanged => result.errors.push(WebsiteRuleError {
                index: index as u32,
                code: code.into(),
            }),
            Err(_) => {} // Preserve untouched imported rules, including patterns unsupported by the current matcher.
        }
        result.rules.push(rule);
    }
    let mut counts = std::collections::HashMap::new();
    for (_, signature, _) in &signatures {
        *counts.entry(signature).or_insert(0) += 1;
    }
    for (index, signature, unchanged) in &signatures {
        if !unchanged && counts.get(signature).is_some_and(|count| *count > 1) {
            result.errors.push(WebsiteRuleError {
                index: *index,
                code: "duplicate".into(),
            });
        }
    }
    result.errors.sort_by_key(|error| error.index);
    Ok(result)
}

pub(in crate::rpc::router::passmanager) fn validate(
    data: &Value,
) -> Result<PassmanagerWebsiteResult, Error> {
    let request: PassmanagerWebsiteValidateRequest = decode(data)?;
    validate_rows(request.rules, &[])
}

pub(in crate::rpc::router::passmanager) fn update(
    session: &VaultSession,
    storage: &Storage,
    uow: &mut DomainUnitOfWork<'_>,
    data: &Value,
) -> Result<PassmanagerWebsiteResult, Error> {
    let request: PassmanagerWebsiteUpdateRequest = decode(data)?;
    let (node, meta, path) = detail::load(session, storage, &request.entry_id)?;
    let (result, changed) = prepare_update(meta, &path, request)?;
    if let Some(meta) = changed {
        stage_entry_meta_json(uow, node, &meta)?;
    }
    Ok(result)
}

fn prepare_update(
    mut meta: Value,
    path: &str,
    request: PassmanagerWebsiteUpdateRequest,
) -> Result<(PassmanagerWebsiteResult, Option<Value>), Error> {
    check_login(&meta)?;
    let revision = detail::revision(&meta, &path)?;
    if request.revision != revision {
        return Err(Error::new(
            "Entry changed; reload before editing",
            Some(ErrorCode::SyncConflict),
        ));
    }
    let (owner, original) = raw_rules(&meta);
    let owner = owner.to_string();
    let baseline = project(&original)?;
    let mut result = validate_rows(request.rules, &baseline)?;
    result.revision = Some(revision);
    if !result.errors.is_empty() || result.rules == baseline {
        return Ok((result, None));
    }
    let values: Vec<Value> = result
        .rules
        .iter()
        .map(|rule| {
            if let Some(index) = rule.source_index {
                if baseline.get(index as usize) == Some(rule) {
                    return original[index as usize].clone();
                }
            }
            let mut value = rule
                .source_index
                .and_then(|index| original.get(index as usize))
                .filter(|value| value.is_object())
                .cloned()
                .unwrap_or_else(|| json!({}));
            let object = value
                .as_object_mut()
                .expect("selected object or fresh object");
            for alias in ["url", "href", "mode", "type"] {
                object.remove(alias);
            }
            object.insert("value".into(), json!(rule.value));
            object.insert("match".into(), json!(rule.match_mode));
            value
        })
        .collect();
    if values.is_empty() {
        for alias in ALIASES {
            meta.as_object_mut()
                .expect("loaded metadata object")
                .remove(alias);
        }
    } else {
        meta[&owner] = json!(values);
    }
    meta.as_object_mut()
        .expect("loaded metadata object")
        .remove("updated_ts");
    meta["updatedTs"] = json!(now_unix_ms());
    result.rules = project(&raw_rules(&meta).1)?;
    result.revision = Some(detail::revision(&meta, &path)?);
    Ok((result, Some(meta)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn website_alias_edit_and_clear_preserve_legacy_metadata_without_resurrection() {
        let path = "/.passmanager/Aliases";
        let meta = json!({"id":"aliases","title":"Aliases","urls":[],"url_rules":[],
            "urlRules":[{"url":"alias.example","type":"starts_with","future":42}],"extra":{"keep":true}});
        let mut rules = project(&raw_rules(&meta).1).unwrap();
        assert_eq!(rules[0].match_mode, "starts_with");
        rules[0].value = "new.example".into();
        let request = PassmanagerWebsiteUpdateRequest {
            entry_id: "aliases".into(),
            revision: detail::revision(&meta, path).unwrap(),
            rules,
        };
        let (saved, changed) = prepare_update(meta, path, request).unwrap();
        let changed = changed.unwrap();
        assert_eq!(
            changed["urlRules"][0],
            json!({"value":"https://new.example","match":"starts_with","future":42})
        );
        assert_eq!(changed["extra"], json!({"keep":true}));
        let request = PassmanagerWebsiteUpdateRequest {
            entry_id: "aliases".into(),
            revision: saved.revision.unwrap(),
            rules: vec![],
        };
        let (cleared, changed) = prepare_update(changed, path, request).unwrap();
        assert!(cleared.rules.is_empty() && cleared.errors.is_empty());
        let changed = changed.unwrap();
        for alias in ALIASES {
            assert!(changed.get(alias).is_none());
        }
        assert_eq!(changed["extra"], json!({"keep":true}));
    }
}
