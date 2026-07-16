use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};

use chromvoid_protocol::{AgentPresetDraftV1, AgentProfileDraftV1};

use super::{EnvRuntimeError, EnvRuntimeErrorCode};

pub(crate) const MAX_PROFILE_VARIABLES: usize = 128;
pub(crate) const MAX_OPAQUE_ID_BYTES: usize = 128;
pub(crate) const MAX_ENV_NAME_BYTES: usize = 128;
pub(crate) const MAX_DESCRIPTION_BYTES: usize = 512;
pub(crate) const MAX_SLUG_BYTES: usize = 64;
pub(crate) const MAX_LABEL_BYTES: usize = 80;
pub(crate) const MAX_PATH_BYTES: usize = 4_096;
pub(crate) const MAX_DEVICE_PRESETS: usize = 256;
pub(crate) const MAX_PRESET_ARGS: usize = 128;
pub(crate) const MAX_PRESET_ARG_BYTES: usize = 4 * 1_024;
pub(crate) const MAX_PRESET_TOTAL_ARG_BYTES: usize = 64 * 1_024;
pub(crate) const MAX_PASSTHROUGH_NAMES: usize = 32;

pub(crate) fn validate_profile_draft(draft: &AgentProfileDraftV1) -> Result<(), EnvRuntimeError> {
    validate_slug(&draft.slug)?;
    validate_label(&draft.label)?;
    validate_description(draft.description.as_deref())?;
    if draft.variables.is_empty() || draft.variables.len() > MAX_PROFILE_VARIABLES {
        return Err(EnvRuntimeError::new(
            EnvRuntimeErrorCode::INVALID_PROFILE,
            format!("A profile must contain 1-{MAX_PROFILE_VARIABLES} environment variables"),
        ));
    }
    let mut seen = HashSet::with_capacity(draft.variables.len());
    for variable in &draft.variables {
        validate_env_name(&variable.name)?;
        if let Some(secret_id) = variable.secret_id.as_deref() {
            validate_opaque_id(secret_id, "secret id")?;
        }
        if !seen.insert(variable.name.as_str()) {
            return Err(EnvRuntimeError::new(
                EnvRuntimeErrorCode::INVALID_PROFILE,
                format!("Duplicate environment variable '{}'", variable.name),
            ));
        }
    }
    Ok(())
}

pub(crate) fn validate_preset_draft(draft: &AgentPresetDraftV1) -> Result<(), EnvRuntimeError> {
    validate_slug(&draft.slug)?;
    validate_label(&draft.label)?;
    validate_opaque_id(&draft.profile_id, "profile id")?;
    for (value, label) in [
        (&draft.workspace_root, "workspace root"),
        (&draft.cwd, "working directory"),
        (&draft.executable, "executable"),
    ] {
        validate_path_input(value, label)?;
    }
    validate_args(&draft.args)?;
    validate_passthrough_env(&draft.passthrough_env)
}

pub(crate) fn validate_slug(slug: &str) -> Result<(), EnvRuntimeError> {
    if slug.is_empty()
        || slug.len() > MAX_SLUG_BYTES
        || !slug.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-' || byte == b'_'
        })
        || !slug
            .as_bytes()
            .first()
            .is_some_and(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
        || !slug
            .as_bytes()
            .last()
            .is_some_and(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
    {
        return Err(EnvRuntimeError::new(
            EnvRuntimeErrorCode::INVALID_SLUG,
            "Slug must contain 1-64 lowercase letters, digits, or internal hyphens/underscores",
        ));
    }
    Ok(())
}

pub(crate) fn validate_label(label: &str) -> Result<(), EnvRuntimeError> {
    let trimmed = label.trim();
    if trimmed.is_empty()
        || trimmed.as_bytes().len() > MAX_LABEL_BYTES
        || trimmed.chars().any(char::is_control)
    {
        return Err(EnvRuntimeError::new(
            EnvRuntimeErrorCode::INVALID_LABEL,
            "Label must contain 1-80 UTF-8 bytes without control characters",
        ));
    }
    Ok(())
}

pub(crate) fn validate_stored_label(label: &str) -> Result<(), EnvRuntimeError> {
    validate_label(label)?;
    if label.trim() != label {
        return Err(EnvRuntimeError::new(
            EnvRuntimeErrorCode::INVALID_LABEL,
            "Stored label must be trimmed",
        ));
    }
    Ok(())
}

pub(crate) fn validate_description(description: Option<&str>) -> Result<(), EnvRuntimeError> {
    let Some(description) = description else {
        return Ok(());
    };
    if description.as_bytes().len() > MAX_DESCRIPTION_BYTES
        || description.trim() != description
        || description
            .chars()
            .any(|character| character.is_control() && character != '\n')
    {
        return Err(EnvRuntimeError::new(
            EnvRuntimeErrorCode::INVALID_DESCRIPTION,
            format!(
                "Description must contain at most {MAX_DESCRIPTION_BYTES} UTF-8 bytes, be trimmed, and contain no control characters except newlines"
            ),
        ));
    }
    Ok(())
}

pub(crate) fn validate_opaque_id(value: &str, label: &str) -> Result<(), EnvRuntimeError> {
    if value.is_empty()
        || value.len() > MAX_OPAQUE_ID_BYTES
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'-'))
    {
        return Err(EnvRuntimeError::new(
            EnvRuntimeErrorCode::INVALID_REQUEST,
            format!("Invalid {label}"),
        ));
    }
    Ok(())
}

pub(crate) fn validate_env_name(name: &str) -> Result<(), EnvRuntimeError> {
    if name.len() > MAX_ENV_NAME_BYTES {
        return Err(EnvRuntimeError::new(
            EnvRuntimeErrorCode::INVALID_ENV_NAME,
            format!("Environment variable names are limited to {MAX_ENV_NAME_BYTES} bytes"),
        ));
    }
    let mut bytes = name.bytes();
    let first = bytes.next().ok_or_else(|| {
        EnvRuntimeError::new(
            EnvRuntimeErrorCode::INVALID_ENV_NAME,
            "Environment variable name is empty",
        )
    })?;
    if !(first.is_ascii_alphabetic() || first == b'_')
        || !bytes.all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
    {
        return Err(EnvRuntimeError::new(
            EnvRuntimeErrorCode::INVALID_ENV_NAME,
            format!("Invalid environment variable name '{name}'"),
        ));
    }
    Ok(())
}

pub(crate) fn validate_args(args: &[String]) -> Result<(), EnvRuntimeError> {
    if args.len() > MAX_PRESET_ARGS
        || args.iter().any(|argument| {
            argument.as_bytes().len() > MAX_PRESET_ARG_BYTES || argument.contains('\0')
        })
        || args.iter().map(|argument| argument.len()).sum::<usize>() > MAX_PRESET_TOTAL_ARG_BYTES
    {
        return Err(EnvRuntimeError::new(
            EnvRuntimeErrorCode::INVALID_PRESET,
            format!(
                "Preset arguments are limited to {MAX_PRESET_ARGS} entries, {MAX_PRESET_ARG_BYTES} bytes each, and {MAX_PRESET_TOTAL_ARG_BYTES} bytes total"
            ),
        ));
    }
    Ok(())
}

pub(crate) fn validate_passthrough_env(names: &[String]) -> Result<(), EnvRuntimeError> {
    if names.len() > MAX_PASSTHROUGH_NAMES {
        return Err(EnvRuntimeError::new(
            EnvRuntimeErrorCode::INVALID_PRESET,
            format!("At most {MAX_PASSTHROUGH_NAMES} passthrough variables are allowed"),
        ));
    }
    let mut seen = HashSet::with_capacity(names.len());
    for name in names {
        validate_env_name(name)?;
        if !seen.insert(name.as_str()) {
            return Err(EnvRuntimeError::new(
                EnvRuntimeErrorCode::INVALID_PRESET,
                format!("Duplicate passthrough variable '{name}'"),
            ));
        }
    }
    Ok(())
}

pub(crate) fn validate_path_input(value: &str, label: &str) -> Result<(), EnvRuntimeError> {
    if value.is_empty() || value.len() > MAX_PATH_BYTES || value.contains('\0') {
        return Err(EnvRuntimeError::new(
            EnvRuntimeErrorCode::INVALID_PATH,
            format!("Preset {label} must contain 1-{MAX_PATH_BYTES} UTF-8 bytes without NUL"),
        ));
    }
    Ok(())
}

pub(crate) fn validate_stored_path(value: &str, label: &str) -> Result<(), EnvRuntimeError> {
    validate_path_input(value, label)?;
    let path = Path::new(value);
    if !path.is_absolute() {
        return Err(EnvRuntimeError::new(
            EnvRuntimeErrorCode::INVALID_PATH,
            format!("Preset {label} must be absolute"),
        ));
    }
    let mut components = path.components();
    if !matches!(components.next(), Some(Component::RootDir)) {
        return Err(EnvRuntimeError::new(
            EnvRuntimeErrorCode::INVALID_PATH,
            format!("Preset {label} must be a canonical macOS path"),
        ));
    }
    let mut normalized = PathBuf::from("/");
    for component in components {
        match component {
            Component::Normal(segment) => normalized.push(segment),
            Component::Prefix(_)
            | Component::RootDir
            | Component::CurDir
            | Component::ParentDir => {
                return Err(EnvRuntimeError::new(
                    EnvRuntimeErrorCode::INVALID_PATH,
                    format!("Preset {label} must be lexically normalized"),
                ));
            }
        }
    }
    if normalized.to_str() != Some(value) {
        return Err(EnvRuntimeError::new(
            EnvRuntimeErrorCode::INVALID_PATH,
            format!("Preset {label} must be lexically normalized"),
        ));
    }
    Ok(())
}

pub(crate) fn validate_sha256_shape(value: &str) -> Result<(), EnvRuntimeError> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(EnvRuntimeError::new(
            EnvRuntimeErrorCode::INVALID_PRESET,
            "Executable SHA-256 must be exactly 64 lowercase hex bytes",
        ));
    }
    Ok(())
}
