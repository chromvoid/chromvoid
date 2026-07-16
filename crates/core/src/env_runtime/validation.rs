use std::collections::BTreeSet;

use super::{EnvRuntimeError, EnvRuntimeResult, EnvVariableMappingV1};

const MAX_SLUG_BYTES: usize = 64;
const MAX_LABEL_BYTES: usize = 80;
const MAX_DESCRIPTION_BYTES: usize = 512;
const MAX_ENV_NAME_BYTES: usize = 128;
const MAX_PROFILE_VARIABLES: usize = 128;
const MAX_SECRET_VALUE_BYTES: usize = 65_536;

pub(crate) fn validate_slug(slug: &str) -> EnvRuntimeResult<()> {
    if slug.is_empty() || slug.len() > MAX_SLUG_BYTES || !slug.is_ascii() {
        return Err(EnvRuntimeError::validation(
            "slug must contain 1-64 ASCII characters",
        ));
    }
    let bytes = slug.as_bytes();
    if !is_slug_edge(bytes[0]) || !is_slug_edge(bytes[bytes.len() - 1]) {
        return Err(EnvRuntimeError::validation(
            "slug must start and end with a lowercase ASCII letter or digit",
        ));
    }
    if !bytes
        .iter()
        .all(|byte| is_slug_edge(*byte) || *byte == b'-' || *byte == b'_')
    {
        return Err(EnvRuntimeError::validation(
            "slug may contain only lowercase ASCII letters, digits, hyphens, and underscores",
        ));
    }
    Ok(())
}

pub(crate) fn normalize_label(label: String) -> EnvRuntimeResult<String> {
    let normalized = label.trim();
    if normalized.is_empty() || normalized.len() > MAX_LABEL_BYTES {
        return Err(EnvRuntimeError::validation(
            "label must contain 1-80 UTF-8 bytes",
        ));
    }
    if normalized.chars().any(char::is_control) {
        return Err(EnvRuntimeError::validation(
            "label must not contain control characters",
        ));
    }
    Ok(normalized.to_string())
}

pub(crate) fn normalize_description(
    description: Option<String>,
) -> EnvRuntimeResult<Option<String>> {
    let Some(description) = description else {
        return Ok(None);
    };
    let normalized = description.trim();
    if normalized.is_empty() {
        return Ok(None);
    }
    if normalized.len() > MAX_DESCRIPTION_BYTES {
        return Err(EnvRuntimeError::validation(
            "description must not exceed 512 UTF-8 bytes",
        ));
    }
    if normalized
        .chars()
        .any(|character| character != '\n' && character.is_control())
    {
        return Err(EnvRuntimeError::validation(
            "description must not contain control characters other than newline",
        ));
    }
    Ok(Some(normalized.to_string()))
}

pub(crate) fn validate_env_name(name: &str) -> EnvRuntimeResult<()> {
    if name.is_empty() || name.len() > MAX_ENV_NAME_BYTES || !name.is_ascii() {
        return Err(EnvRuntimeError::validation(
            "environment variable name must contain 1-128 ASCII characters",
        ));
    }
    let mut bytes = name.bytes();
    let first = bytes.next().expect("non-empty env name");
    if first != b'_' && !first.is_ascii_alphabetic() {
        return Err(EnvRuntimeError::validation(
            "environment variable name must start with an ASCII letter or underscore",
        ));
    }
    if !bytes.all(|byte| byte == b'_' || byte.is_ascii_alphanumeric()) {
        return Err(EnvRuntimeError::validation(
            "environment variable name may contain only ASCII letters, digits, and underscores",
        ));
    }
    Ok(())
}

pub(crate) fn validate_variables(variables: &[EnvVariableMappingV1]) -> EnvRuntimeResult<()> {
    if variables.is_empty() || variables.len() > MAX_PROFILE_VARIABLES {
        return Err(EnvRuntimeError::validation(
            "profile must contain 1-128 environment variable mappings",
        ));
    }
    let mut names = BTreeSet::new();
    for variable in variables {
        validate_env_name(&variable.name)?;
        if !names.insert(variable.name.as_str()) {
            return Err(EnvRuntimeError::validation(
                "environment variable names must be unique within a profile",
            ));
        }
        if variable.secret_id.is_empty() {
            return Err(EnvRuntimeError::validation(
                "environment variable mapping secret_id is required",
            ));
        }
    }
    Ok(())
}

pub(crate) fn validate_secret_value(value: &str) -> EnvRuntimeResult<()> {
    if value.is_empty() || value.len() > MAX_SECRET_VALUE_BYTES {
        return Err(EnvRuntimeError::validation(
            "secret value must contain 1-65536 UTF-8 bytes",
        ));
    }
    if value.as_bytes().contains(&0) {
        return Err(EnvRuntimeError::validation(
            "secret value must not contain NUL bytes",
        ));
    }
    Ok(())
}

fn is_slug_edge(byte: u8) -> bool {
    byte.is_ascii_lowercase() || byte.is_ascii_digit()
}
