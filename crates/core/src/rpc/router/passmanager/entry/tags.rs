//! Credential tag normalization for PassManager entry metadata.

use icu_properties::{
    props::{CaseIgnorable, Cased},
    CodePointSetData,
};
use unicode_normalization::UnicodeNormalization;

const CREDENTIAL_TAG_MAX_LENGTH: usize = 32;
const CREDENTIAL_TAG_MAX_PER_ENTRY: usize = 12;

fn normalize_tag_text(value: &str) -> String {
    let normalized = value.nfkc().collect::<String>();
    let without_prefix = normalized.trim().trim_start_matches('#').trim();
    without_prefix
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub(in crate::rpc::router::passmanager) fn credential_tag_key(label: &str) -> String {
    lowercase_like_js(&normalize_tag_text(label))
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-")
}

fn lowercase_like_js(value: &str) -> String {
    let chars = value.chars().collect::<Vec<_>>();
    let cased = CodePointSetData::new::<Cased>();
    let case_ignorable = CodePointSetData::new::<CaseIgnorable>();
    let mut result = String::with_capacity(value.len());

    for (index, ch) in chars.iter().copied().enumerate() {
        if ch == '\u{03A3}' && is_final_sigma_context(&chars, index, cased, case_ignorable) {
            result.push('\u{03C2}');
            continue;
        }

        result.extend(ch.to_lowercase());
    }

    result
}

fn is_final_sigma_context(
    chars: &[char],
    index: usize,
    cased: icu_properties::CodePointSetDataBorrowed<'static>,
    case_ignorable: icu_properties::CodePointSetDataBorrowed<'static>,
) -> bool {
    let has_cased_before = chars[..index]
        .iter()
        .rev()
        .copied()
        .find(|ch| !case_ignorable.contains(*ch))
        .is_some_and(|ch| cased.contains(ch));

    let has_cased_after = chars[index + 1..]
        .iter()
        .copied()
        .find(|ch| !case_ignorable.contains(*ch))
        .is_some_and(|ch| cased.contains(ch));

    has_cased_before && !has_cased_after
}

pub(in crate::rpc::router::passmanager::entry) fn normalize_credential_tags(
    value: &serde_json::Value,
) -> Vec<String> {
    let Some(values) = value.as_array() else {
        return Vec::new();
    };

    let mut seen = std::collections::HashSet::<String>::new();
    let mut tags = Vec::<String>::new();

    for value in values {
        let Some(raw_label) = value.as_str() else {
            continue;
        };
        let label = normalize_tag_text(raw_label);
        if label.is_empty() || label.chars().count() > CREDENTIAL_TAG_MAX_LENGTH {
            continue;
        }

        let key = credential_tag_key(&label);
        if key.is_empty() || !seen.insert(key) {
            continue;
        }

        tags.push(label);
        if tags.len() >= CREDENTIAL_TAG_MAX_PER_ENTRY {
            break;
        }
    }

    tags
}

pub(in crate::rpc::router::passmanager) fn normalize_credential_tag_catalog(
    value: &serde_json::Value,
) -> Vec<String> {
    let Some(values) = value.as_array() else {
        return Vec::new();
    };

    let mut seen = std::collections::HashSet::<String>::new();
    let mut tags = Vec::<String>::new();

    for value in values {
        let Some(raw_label) = value.as_str() else {
            continue;
        };
        let label = normalize_tag_text(raw_label);
        if label.is_empty() || label.chars().count() > CREDENTIAL_TAG_MAX_LENGTH {
            continue;
        }

        let key = credential_tag_key(&label);
        if key.is_empty() || !seen.insert(key) {
            continue;
        }

        tags.push(label);
    }

    tags
}

pub(in crate::rpc::router::passmanager) fn normalize_entry_tags(
    meta: &mut serde_json::Map<String, serde_json::Value>,
) {
    let Some(tags_value) = meta.remove("tags") else {
        return;
    };

    let tags = normalize_credential_tags(&tags_value);
    if tags.is_empty() {
        return;
    }

    meta.insert(
        "tags".to_string(),
        serde_json::Value::Array(tags.into_iter().map(serde_json::Value::String).collect()),
    );
}
