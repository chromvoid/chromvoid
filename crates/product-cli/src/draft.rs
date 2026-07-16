use std::collections::HashSet;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

use chromvoid_protocol::{
    AgentPresetDraftV1, AgentProfileDraftV1, AGENT_MAX_REASON_BYTES, AGENT_MAX_REQUEST_BYTES,
};
use serde::de::DeserializeOwned;

use crate::error::CliError;

pub fn read_profile_draft(path: &Path) -> Result<AgentProfileDraftV1, CliError> {
    let draft = read_json_object(path)?;
    validate_profile_draft(&draft)?;
    Ok(draft)
}

pub fn read_preset_draft(path: &Path) -> Result<AgentPresetDraftV1, CliError> {
    let draft = read_json_object(path)?;
    validate_preset_draft(&draft)?;
    Ok(draft)
}

pub fn validate_reason(reason: &Option<String>) -> Result<(), CliError> {
    if reason
        .as_ref()
        .is_some_and(|value| value.len() > AGENT_MAX_REASON_BYTES)
    {
        return Err(CliError::usage(
            "INVALID_REASON",
            format!("--reason must be at most {AGENT_MAX_REASON_BYTES} UTF-8 bytes"),
        ));
    }
    if reason.as_ref().is_some_and(|value| value.contains('\0')) {
        return Err(CliError::usage(
            "INVALID_REASON",
            "--reason must not contain NUL",
        ));
    }
    Ok(())
}

pub fn validate_identifier(value: &str, label: &str) -> Result<(), CliError> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .as_bytes()
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'-'))
    {
        return Err(CliError::usage(
            "INVALID_IDENTIFIER",
            format!("{label} must be 1..128 ASCII identifier bytes"),
        ));
    }
    Ok(())
}

pub fn validate_profile_draft(draft: &AgentProfileDraftV1) -> Result<(), CliError> {
    validate_slug(&draft.slug)?;
    validate_label(&draft.label)?;
    if let Some(description) = &draft.description {
        if description.len() > 512
            || description.trim() != description
            || description.contains('\0')
            || description
                .chars()
                .any(|character| character.is_control() && character != '\n')
        {
            return Err(CliError::usage(
                "INVALID_PROFILE_DRAFT",
                "description must be at most 512 UTF-8 bytes and contain no unsupported controls",
            ));
        }
    }
    if !(1..=128).contains(&draft.variables.len()) {
        return Err(CliError::usage(
            "INVALID_PROFILE_DRAFT",
            "profile variables must contain 1..128 mappings",
        ));
    }
    let mut names = HashSet::with_capacity(draft.variables.len());
    for variable in &draft.variables {
        if !is_env_name(&variable.name) {
            return Err(CliError::usage(
                "INVALID_PROFILE_DRAFT",
                format!("invalid environment variable name: {}", variable.name),
            ));
        }
        if !names.insert(variable.name.as_str()) {
            return Err(CliError::usage(
                "INVALID_PROFILE_DRAFT",
                format!("duplicate environment variable name: {}", variable.name),
            ));
        }
        if let Some(secret_id) = &variable.secret_id {
            validate_identifier(secret_id, "secret_id")?;
        }
    }
    Ok(())
}

pub fn validate_preset_draft(draft: &AgentPresetDraftV1) -> Result<(), CliError> {
    validate_identifier(&draft.profile_id, "profile_id")?;
    validate_slug(&draft.slug)?;
    validate_label(&draft.label)?;
    validate_absolute_path(&draft.workspace_root, "workspace_root")?;
    validate_absolute_path(&draft.cwd, "cwd")?;
    validate_absolute_path(&draft.executable, "executable")?;
    if draft.args.len() > 128 {
        return Err(CliError::usage(
            "INVALID_PRESET_DRAFT",
            "args must contain at most 128 items",
        ));
    }
    let mut total_args = 0_usize;
    for arg in &draft.args {
        let len = arg.len();
        if len > 4096 || arg.contains('\0') {
            return Err(CliError::usage(
                "INVALID_PRESET_DRAFT",
                "each arg must be at most 4096 UTF-8 bytes and contain no NUL",
            ));
        }
        total_args = total_args.saturating_add(len);
    }
    if total_args > 64 * 1024 {
        return Err(CliError::usage(
            "INVALID_PRESET_DRAFT",
            "combined args must be at most 64 KiB",
        ));
    }
    if draft.passthrough_env.len() > 32 {
        return Err(CliError::usage(
            "INVALID_PRESET_DRAFT",
            "passthrough_env must contain at most 32 names",
        ));
    }
    let mut passthrough = HashSet::with_capacity(draft.passthrough_env.len());
    for name in &draft.passthrough_env {
        if !is_env_name(name) || !passthrough.insert(name.as_str()) {
            return Err(CliError::usage(
                "INVALID_PRESET_DRAFT",
                format!("invalid or duplicate passthrough env name: {name}"),
            ));
        }
    }
    Ok(())
}

fn read_json_object<T: DeserializeOwned>(path: &Path) -> Result<T, CliError> {
    let bytes = if path == Path::new("-") {
        let mut bytes = Vec::new();
        std::io::stdin()
            .take((AGENT_MAX_REQUEST_BYTES + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(|error| {
                CliError::usage(
                    "DRAFT_READ_FAILED",
                    format!("Read draft from stdin: {error}"),
                )
            })?;
        bytes
    } else {
        let file = File::open(path).map_err(|error| {
            CliError::usage(
                "DRAFT_READ_FAILED",
                format!("Open draft {}: {error}", path.display()),
            )
        })?;
        let mut bytes = Vec::new();
        file.take((AGENT_MAX_REQUEST_BYTES + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(|error| {
                CliError::usage(
                    "DRAFT_READ_FAILED",
                    format!("Read draft {}: {error}", path.display()),
                )
            })?;
        bytes
    };
    if bytes.len() > AGENT_MAX_REQUEST_BYTES {
        return Err(CliError::usage(
            "DRAFT_TOO_LARGE",
            format!("draft exceeds {AGENT_MAX_REQUEST_BYTES} bytes"),
        ));
    }
    serde_json::from_slice(&bytes).map_err(|error| {
        CliError::usage(
            "INVALID_DRAFT_JSON",
            format!("Draft must be one valid UTF-8 JSON object: {error}"),
        )
    })
}

fn validate_slug(slug: &str) -> Result<(), CliError> {
    let bytes = slug.as_bytes();
    let valid = (1..=64).contains(&bytes.len())
        && bytes[0].is_ascii_alphanumeric()
        && !bytes[0].is_ascii_uppercase()
        && bytes[bytes.len() - 1].is_ascii_alphanumeric()
        && !bytes[bytes.len() - 1].is_ascii_uppercase()
        && bytes.iter().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'_' | b'-')
        });
    if !valid {
        return Err(CliError::usage(
            "INVALID_SLUG",
            "slug must be 1..64 lowercase ASCII letters/digits with internal '_' or '-'",
        ));
    }
    Ok(())
}

fn validate_label(label: &str) -> Result<(), CliError> {
    if label.trim() != label
        || !(1..=80).contains(&label.len())
        || label.contains('\0')
        || label.chars().any(char::is_control)
    {
        return Err(CliError::usage(
            "INVALID_LABEL",
            "label must be trimmed, contain 1..80 UTF-8 bytes, and have no controls",
        ));
    }
    Ok(())
}

fn validate_absolute_path(value: &str, label: &str) -> Result<(), CliError> {
    if value.len() > 4096 || value.contains('\0') || !PathBuf::from(value).is_absolute() {
        return Err(CliError::usage(
            "INVALID_PRESET_DRAFT",
            format!("{label} must be an absolute UTF-8 path of at most 4096 bytes"),
        ));
    }
    Ok(())
}

fn is_env_name(value: &str) -> bool {
    let bytes = value.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= 128
        && (bytes[0].is_ascii_alphabetic() || bytes[0] == b'_')
        && bytes[1..]
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || *byte == b'_')
}

#[cfg(test)]
mod tests {
    use std::fs;

    use chromvoid_protocol::AgentVariableMappingV1;

    use super::*;

    #[test]
    fn profile_validation_allows_unbound_proposal_mapping() {
        let draft = AgentProfileDraftV1 {
            slug: "backend-dev".into(),
            label: "Backend development".into(),
            description: None,
            variables: vec![AgentVariableMappingV1 {
                name: "API_TOKEN".into(),
                secret_id: None,
            }],
        };
        validate_profile_draft(&draft).expect("valid draft");
    }

    #[test]
    fn profile_validation_rejects_duplicate_env_names() {
        let variable = AgentVariableMappingV1 {
            name: "API_TOKEN".into(),
            secret_id: None,
        };
        let draft = AgentProfileDraftV1 {
            slug: "backend".into(),
            label: "Backend".into(),
            description: None,
            variables: vec![variable.clone(), variable],
        };
        assert!(validate_profile_draft(&draft).is_err());
    }

    #[test]
    fn preset_validation_rejects_relative_executable() {
        let draft = AgentPresetDraftV1 {
            profile_id: "profile-1".into(),
            slug: "test".into(),
            label: "Tests".into(),
            workspace_root: "/tmp/project".into(),
            cwd: "/tmp/project".into(),
            executable: "bun".into(),
            args: vec!["test".into()],
            passthrough_env: vec![],
        };
        assert!(validate_preset_draft(&draft).is_err());
    }

    #[test]
    fn draft_parser_rejects_unknown_fields() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("profile.json");
        fs::write(
            &path,
            r#"{"slug":"a","label":"A","description":null,"variables":[],"secret":"no"}"#,
        )
        .expect("write fixture");
        assert!(matches!(
            read_profile_draft(&path),
            Err(CliError::Local {
                code: "INVALID_DRAFT_JSON",
                ..
            })
        ));
    }
}
