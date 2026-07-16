use std::collections::{HashMap, HashSet};

use super::super::validation::{
    validate_args, validate_opaque_id, validate_passthrough_env, validate_sha256_shape,
    validate_slug, validate_stored_label, validate_stored_path, MAX_DEVICE_PRESETS,
};
#[cfg(test)]
use super::super::validation::{
    MAX_ENV_NAME_BYTES, MAX_LABEL_BYTES, MAX_OPAQUE_ID_BYTES, MAX_PASSTHROUGH_NAMES,
    MAX_PATH_BYTES, MAX_PRESET_ARGS, MAX_PRESET_ARG_BYTES, MAX_SLUG_BYTES,
};
use super::DevicePreset;

pub(super) fn validate_presets(presets: &HashMap<String, DevicePreset>) -> Result<(), String> {
    if presets.len() > MAX_DEVICE_PRESETS {
        return Err(format!(
            "device preset store exceeds the {MAX_DEVICE_PRESETS}-record limit"
        ));
    }

    let mut slugs = HashSet::with_capacity(presets.len());
    for (map_id, preset) in presets {
        if map_id != &preset.id {
            return Err("preset map key does not match the embedded id".to_string());
        }
        validate_opaque_id(&preset.id, "preset id").map_err(|error| error.message)?;
        validate_opaque_id(&preset.profile_id, "profile id").map_err(|error| error.message)?;
        validate_slug(&preset.slug).map_err(|error| error.message)?;
        if !slugs.insert(preset.slug.as_str()) {
            return Err("preset slugs must be unique".to_string());
        }
        validate_stored_label(&preset.label).map_err(|error| error.message)?;
        if preset.revision == 0 {
            return Err("preset revision must be positive".to_string());
        }
        if preset.created_at_epoch_ms > preset.updated_at_epoch_ms {
            return Err("preset creation time must not exceed its update time".to_string());
        }
        validate_stored_path(&preset.workspace_root, "workspace root")
            .map_err(|error| error.message)?;
        validate_stored_path(&preset.cwd, "working directory").map_err(|error| error.message)?;
        validate_stored_path(&preset.executable, "executable").map_err(|error| error.message)?;
        validate_sha256_shape(&preset.executable_sha256).map_err(|error| error.message)?;
        validate_args(&preset.args).map_err(|error| error.message)?;
        validate_passthrough_env(&preset.passthrough_env).map_err(|error| error.message)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn preset(id: &str, slug: &str) -> DevicePreset {
        DevicePreset {
            id: id.to_string(),
            profile_id: "profile-1".to_string(),
            slug: slug.to_string(),
            label: "Test".to_string(),
            revision: 1,
            workspace_root: "/tmp".to_string(),
            cwd: "/tmp".to_string(),
            executable: "/usr/bin/true".to_string(),
            executable_sha256: "00".repeat(32),
            args: Vec::new(),
            passthrough_env: vec!["PATH".to_string()],
            created_at_epoch_ms: 1,
            updated_at_epoch_ms: 1,
        }
    }

    fn one(candidate: DevicePreset) -> HashMap<String, DevicePreset> {
        HashMap::from([(candidate.id.clone(), candidate)])
    }

    fn assert_invalid_preset(mutate: impl FnOnce(&mut DevicePreset)) {
        let mut candidate = preset("preset-1", "test");
        mutate(&mut candidate);
        assert!(validate_presets(&one(candidate)).is_err());
    }

    #[test]
    fn validates_record_count_identity_and_unique_canonical_slugs() {
        assert!(validate_presets(&one(preset("preset-1", "test"))).is_ok());

        let too_many = (0..=MAX_DEVICE_PRESETS)
            .map(|index| {
                let id = format!("preset-{index}");
                (id.clone(), preset(&id, &format!("preset-{index}")))
            })
            .collect();
        assert!(validate_presets(&too_many).is_err());

        let mismatched = HashMap::from([("other-preset".to_string(), preset("preset-1", "test"))]);
        assert!(validate_presets(&mismatched).is_err());
        assert!(validate_presets(&one(preset("invalid/id", "test"))).is_err());
        assert_invalid_preset(|candidate| candidate.profile_id = "invalid/id".to_string());
        assert_invalid_preset(|candidate| candidate.slug = "Uppercase".to_string());

        let duplicates = HashMap::from([
            ("preset-1".to_string(), preset("preset-1", "test")),
            ("preset-2".to_string(), preset("preset-2", "test")),
        ]);
        assert!(validate_presets(&duplicates).is_err());
    }

    #[test]
    fn accepts_inclusive_v1_boundaries() {
        let mut boundary = preset(
            &"i".repeat(MAX_OPAQUE_ID_BYTES),
            &"a".repeat(MAX_SLUG_BYTES),
        );
        boundary.profile_id = "p".repeat(MAX_OPAQUE_ID_BYTES);
        boundary.label = "x".repeat(MAX_LABEL_BYTES);
        boundary.workspace_root = format!("/{}", "w".repeat(MAX_PATH_BYTES - 1));
        boundary.cwd = "/".to_string();
        boundary.args = vec!["x".repeat(MAX_PRESET_ARG_BYTES); 16];
        boundary.passthrough_env = std::iter::once("A".repeat(MAX_ENV_NAME_BYTES))
            .chain((1..MAX_PASSTHROUGH_NAMES).map(|index| format!("ENV_{index}")))
            .collect();

        let mut presets = one(boundary);
        for index in 1..MAX_DEVICE_PRESETS {
            let id = format!("preset-{index}");
            presets.insert(id.clone(), preset(&id, &format!("preset-{index}")));
        }

        assert!(validate_presets(&presets).is_ok());
    }

    #[test]
    fn validates_labels_revisions_and_timestamps() {
        assert_invalid_preset(|candidate| candidate.label = " Test".to_string());
        assert_invalid_preset(|candidate| candidate.label = "bad\nlabel".to_string());
        assert_invalid_preset(|candidate| candidate.label = "x".repeat(MAX_LABEL_BYTES + 1));
        assert_invalid_preset(|candidate| candidate.revision = 0);
        assert_invalid_preset(|candidate| {
            candidate.created_at_epoch_ms = 2;
            candidate.updated_at_epoch_ms = 1;
        });
    }

    #[test]
    fn validates_absolute_lexically_normalized_paths_and_hashes() {
        assert_invalid_preset(|candidate| candidate.workspace_root = "tmp".to_string());
        assert_invalid_preset(|candidate| candidate.cwd = "/tmp/../tmp".to_string());
        assert_invalid_preset(|candidate| candidate.executable = "/usr//bin/true".to_string());
        assert_invalid_preset(|candidate| candidate.workspace_root = "/tmp/".to_string());
        assert_invalid_preset(|candidate| {
            candidate.workspace_root = format!("/{}", "x".repeat(MAX_PATH_BYTES));
        });
        assert_invalid_preset(|candidate| candidate.cwd = "/tmp/\0child".to_string());
        assert_invalid_preset(|candidate| candidate.executable_sha256 = "0".repeat(63));
        assert_invalid_preset(|candidate| candidate.executable_sha256 = "A".repeat(64));
        assert_invalid_preset(|candidate| candidate.executable_sha256 = "g".repeat(64));
    }

    #[test]
    fn validates_argument_and_passthrough_limits() {
        assert_invalid_preset(|candidate| {
            candidate.args = vec![String::new(); MAX_PRESET_ARGS + 1]
        });
        assert_invalid_preset(|candidate| {
            candidate.args = vec!["x".repeat(MAX_PRESET_ARG_BYTES + 1)];
        });
        assert_invalid_preset(|candidate| {
            candidate.args = vec!["x".repeat(MAX_PRESET_ARG_BYTES); 17];
        });
        assert_invalid_preset(|candidate| candidate.args = vec!["bad\0arg".to_string()]);
        assert_invalid_preset(|candidate| {
            candidate.passthrough_env = vec!["PATH".to_string(); MAX_PASSTHROUGH_NAMES + 1];
        });
        assert_invalid_preset(|candidate| {
            candidate.passthrough_env = vec!["PATH".to_string(), "PATH".to_string()];
        });
        assert_invalid_preset(|candidate| {
            candidate.passthrough_env = vec!["9INVALID".to_string()];
        });
        assert_invalid_preset(|candidate| {
            candidate.passthrough_env = vec![format!("A{}", "X".repeat(MAX_ENV_NAME_BYTES))];
        });
        assert_invalid_preset(|candidate| {
            candidate.passthrough_env = vec!["BAD\0NAME".to_string()];
        });
    }
}
