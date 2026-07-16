use std::collections::{BTreeMap, BTreeSet};

use getrandom::getrandom;
use serde::{Deserialize, Serialize};

use super::model::{EnvProfileRecordV1, EnvSecretMetadataRecordV1};
use super::validation::{
    normalize_description, normalize_label, validate_slug, validate_variables,
};
use super::{
    AgentProfileMetadataV1, AgentSecretMetadataV1, EnvRuntimeError, EnvRuntimeErrorCode,
    EnvRuntimeResult, EnvVariableMappingV1, ENV_RUNTIME_RECORD_VERSION,
};

const MAX_SECRETS: usize = 1_024;
const MAX_PROFILES: usize = 256;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct EnvRuntimeStateV1 {
    version: u8,
    secrets: BTreeMap<String, EnvSecretMetadataRecordV1>,
    profiles: BTreeMap<String, EnvProfileRecordV1>,
}

impl Default for EnvRuntimeStateV1 {
    fn default() -> Self {
        Self {
            version: ENV_RUNTIME_RECORD_VERSION,
            secrets: BTreeMap::new(),
            profiles: BTreeMap::new(),
        }
    }
}

impl EnvRuntimeStateV1 {
    pub(crate) fn validate_integrity(&self) -> EnvRuntimeResult<()> {
        if self.version != ENV_RUNTIME_RECORD_VERSION {
            return Err(EnvRuntimeError::internal(
                "Unsupported Env Runtime state version",
            ));
        }
        if self.secrets.len() > MAX_SECRETS || self.profiles.len() > MAX_PROFILES {
            return Err(EnvRuntimeError::internal(
                "Env Runtime state exceeds v1 record limits",
            ));
        }

        for (id, secret) in &self.secrets {
            if secret.version != ENV_RUNTIME_RECORD_VERSION
                || id != &secret.id
                || !is_valid_record_id(id)
                || secret.revision == 0
            {
                return Err(EnvRuntimeError::internal(
                    "Invalid Env Runtime secret metadata",
                ));
            }
            normalize_label(secret.label.clone())
                .map_err(|_| EnvRuntimeError::internal("Invalid Env Runtime secret label"))?;
        }

        let mut profile_slugs = BTreeSet::new();
        for (id, profile) in &self.profiles {
            if profile.version != ENV_RUNTIME_RECORD_VERSION
                || id != &profile.id
                || !is_valid_record_id(id)
                || profile.revision == 0
            {
                return Err(EnvRuntimeError::internal("Invalid Env Runtime profile"));
            }
            validate_slug(&profile.slug)
                .map_err(|_| EnvRuntimeError::internal("Invalid Env Runtime profile slug"))?;
            normalize_label(profile.label.clone())
                .map_err(|_| EnvRuntimeError::internal("Invalid Env Runtime profile label"))?;
            normalize_description(profile.description.clone()).map_err(|_| {
                EnvRuntimeError::internal("Invalid Env Runtime profile description")
            })?;
            validate_variables(&profile.variables)
                .map_err(|_| EnvRuntimeError::internal("Invalid Env Runtime profile mappings"))?;
            if !profile_slugs.insert(profile.slug.as_str()) {
                return Err(EnvRuntimeError::internal(
                    "Duplicate Env Runtime profile slug",
                ));
            }
            if profile
                .variables
                .iter()
                .any(|variable| !self.secrets.contains_key(&variable.secret_id))
            {
                return Err(EnvRuntimeError::internal(
                    "Env Runtime profile references a missing secret",
                ));
            }
        }
        Ok(())
    }

    pub(crate) fn secret_count(&self) -> usize {
        self.secrets.len()
    }

    pub(crate) fn profile_count(&self) -> usize {
        self.profiles.len()
    }

    pub(crate) fn list_secrets(&self) -> Vec<AgentSecretMetadataV1> {
        self.secrets
            .values()
            .map(|secret| self.secret_projection(secret))
            .collect()
    }

    pub(crate) fn secret_by_id(
        &self,
        secret_id: &str,
    ) -> EnvRuntimeResult<&EnvSecretMetadataRecordV1> {
        self.secrets
            .get(secret_id)
            .ok_or_else(EnvRuntimeError::secret_not_found)
    }

    pub(crate) fn create_secret(
        &mut self,
        label: String,
        now: u64,
    ) -> EnvRuntimeResult<AgentSecretMetadataV1> {
        if self.secrets.len() >= MAX_SECRETS {
            return Err(EnvRuntimeError::validation(
                "Env Runtime supports at most 1024 secrets",
            ));
        }
        let id = unique_id("envsec", |candidate| self.secrets.contains_key(candidate))?;
        let secret = EnvSecretMetadataRecordV1 {
            version: ENV_RUNTIME_RECORD_VERSION,
            id: id.clone(),
            label: normalize_label(label)?,
            revision: 1,
            created_at_epoch_ms: now,
            updated_at_epoch_ms: now,
        };
        let metadata = self.secret_projection(&secret);
        self.secrets.insert(id, secret);
        Ok(metadata)
    }

    pub(crate) fn update_secret(
        &mut self,
        secret_id: &str,
        base_revision: u64,
        label: Option<String>,
        now: u64,
    ) -> EnvRuntimeResult<AgentSecretMetadataV1> {
        let label = label.map(normalize_label).transpose()?;
        let usage_count = self.secret_usage_count(secret_id);
        let secret = self
            .secrets
            .get_mut(secret_id)
            .ok_or_else(EnvRuntimeError::secret_not_found)?;
        require_revision(secret.revision, base_revision)?;
        let (revision, updated_at_epoch_ms) =
            advance_revision(secret.revision, secret.updated_at_epoch_ms, now)?;
        if let Some(label) = label {
            secret.label = label;
        }
        secret.revision = revision;
        secret.updated_at_epoch_ms = updated_at_epoch_ms;
        Ok(AgentSecretMetadataV1 {
            id: secret.id.clone(),
            label: secret.label.clone(),
            revision: secret.revision,
            usage_count,
        })
    }

    pub(crate) fn delete_secret(
        &mut self,
        secret_id: &str,
        base_revision: u64,
    ) -> EnvRuntimeResult<()> {
        let secret = self
            .secrets
            .get(secret_id)
            .ok_or_else(EnvRuntimeError::secret_not_found)?;
        require_revision(secret.revision, base_revision)?;
        if self.secret_usage_count(secret_id) > 0 {
            return Err(EnvRuntimeError::new(
                EnvRuntimeErrorCode::SecretInUse,
                "Env secret is referenced by a profile",
            ));
        }
        self.secrets.remove(secret_id);
        Ok(())
    }

    pub(crate) fn list_profiles(&self) -> Vec<AgentProfileMetadataV1> {
        self.profiles
            .values()
            .map(Self::profile_projection)
            .collect()
    }

    pub(crate) fn get_profile(
        &self,
        profile_ref: &str,
    ) -> EnvRuntimeResult<AgentProfileMetadataV1> {
        self.find_profile(profile_ref)
            .map(Self::profile_projection)
            .ok_or_else(EnvRuntimeError::profile_not_found)
    }

    pub(crate) fn profile_by_id(&self, profile_id: &str) -> EnvRuntimeResult<&EnvProfileRecordV1> {
        self.profiles
            .get(profile_id)
            .ok_or_else(EnvRuntimeError::profile_not_found)
    }

    pub(crate) fn create_profile(
        &mut self,
        slug: String,
        label: String,
        description: Option<String>,
        variables: Vec<EnvVariableMappingV1>,
        now: u64,
    ) -> EnvRuntimeResult<AgentProfileMetadataV1> {
        if self.profiles.len() >= MAX_PROFILES {
            return Err(EnvRuntimeError::validation(
                "Env Runtime supports at most 256 profiles",
            ));
        }
        validate_slug(&slug)?;
        validate_variables(&variables)?;
        self.require_secret_references(&variables)?;
        if self.profiles.values().any(|profile| profile.slug == slug) {
            return Err(EnvRuntimeError::validation(
                "Env profile slug already exists",
            ));
        }
        let id = unique_id("envprof", |candidate| self.profiles.contains_key(candidate))?;
        let profile = EnvProfileRecordV1 {
            version: ENV_RUNTIME_RECORD_VERSION,
            id: id.clone(),
            slug,
            label: normalize_label(label)?,
            description: normalize_description(description)?,
            revision: 1,
            variables,
            created_at_epoch_ms: now,
            updated_at_epoch_ms: now,
        };
        let projection = Self::profile_projection(&profile);
        self.profiles.insert(id, profile);
        Ok(projection)
    }

    #[allow(clippy::too_many_arguments)]
    pub(crate) fn update_profile(
        &mut self,
        profile_id: &str,
        base_revision: u64,
        slug: String,
        label: String,
        description: Option<String>,
        variables: Vec<EnvVariableMappingV1>,
        now: u64,
    ) -> EnvRuntimeResult<AgentProfileMetadataV1> {
        validate_slug(&slug)?;
        validate_variables(&variables)?;
        self.require_secret_references(&variables)?;
        let label = normalize_label(label)?;
        let description = normalize_description(description)?;
        if self
            .profiles
            .values()
            .any(|profile| profile.id != profile_id && profile.slug == slug)
        {
            return Err(EnvRuntimeError::validation(
                "Env profile slug already exists",
            ));
        }
        let profile = self
            .profiles
            .get_mut(profile_id)
            .ok_or_else(EnvRuntimeError::profile_not_found)?;
        require_revision(profile.revision, base_revision)?;
        let (revision, updated_at_epoch_ms) =
            advance_revision(profile.revision, profile.updated_at_epoch_ms, now)?;
        profile.slug = slug;
        profile.label = label;
        profile.description = description;
        profile.variables = variables;
        profile.revision = revision;
        profile.updated_at_epoch_ms = updated_at_epoch_ms;
        Ok(Self::profile_projection(profile))
    }

    pub(crate) fn delete_profile(
        &mut self,
        profile_id: &str,
        base_revision: u64,
    ) -> EnvRuntimeResult<()> {
        let profile = self
            .profiles
            .get(profile_id)
            .ok_or_else(EnvRuntimeError::profile_not_found)?;
        require_revision(profile.revision, base_revision)?;
        self.profiles.remove(profile_id);
        Ok(())
    }

    fn find_profile(&self, profile_ref: &str) -> Option<&EnvProfileRecordV1> {
        self.profiles.get(profile_ref).or_else(|| {
            self.profiles
                .values()
                .find(|profile| profile.slug == profile_ref)
        })
    }

    fn secret_projection(&self, secret: &EnvSecretMetadataRecordV1) -> AgentSecretMetadataV1 {
        AgentSecretMetadataV1 {
            id: secret.id.clone(),
            label: secret.label.clone(),
            revision: secret.revision,
            usage_count: self.secret_usage_count(&secret.id),
        }
    }

    fn profile_projection(profile: &EnvProfileRecordV1) -> AgentProfileMetadataV1 {
        AgentProfileMetadataV1 {
            id: profile.id.clone(),
            slug: profile.slug.clone(),
            label: profile.label.clone(),
            description: profile.description.clone(),
            revision: profile.revision,
            variables: profile.variables.clone(),
        }
    }

    fn secret_usage_count(&self, secret_id: &str) -> u64 {
        self.profiles
            .values()
            .filter(|profile| {
                profile
                    .variables
                    .iter()
                    .any(|variable| variable.secret_id == secret_id)
            })
            .count() as u64
    }

    fn require_secret_references(
        &self,
        variables: &[EnvVariableMappingV1],
    ) -> EnvRuntimeResult<()> {
        if variables
            .iter()
            .any(|variable| !self.secrets.contains_key(&variable.secret_id))
        {
            return Err(EnvRuntimeError::validation(
                "Env profile references a missing secret",
            ));
        }
        Ok(())
    }
}

fn require_revision(actual: u64, expected: u64) -> EnvRuntimeResult<()> {
    if actual == expected {
        Ok(())
    } else {
        Err(EnvRuntimeError::revision_conflict())
    }
}

fn advance_revision(revision: u64, updated_at: u64, now: u64) -> EnvRuntimeResult<(u64, u64)> {
    let revision = revision
        .checked_add(1)
        .ok_or_else(EnvRuntimeError::revision_conflict)?;
    Ok((revision, now.max(updated_at.saturating_add(1))))
}

fn unique_id(prefix: &str, mut exists: impl FnMut(&str) -> bool) -> EnvRuntimeResult<String> {
    for _ in 0..8 {
        let mut bytes = [0u8; 16];
        getrandom(&mut bytes).map_err(|error| {
            EnvRuntimeError::internal(format!("Failed to generate Env Runtime id: {error}"))
        })?;
        let mut encoded = String::with_capacity(prefix.len() + 1 + bytes.len() * 2);
        encoded.push_str(prefix);
        encoded.push('_');
        for byte in bytes {
            use std::fmt::Write as _;
            let _ = write!(encoded, "{byte:02x}");
        }
        if !exists(&encoded) {
            return Ok(encoded);
        }
    }
    Err(EnvRuntimeError::internal(
        "Failed to allocate unique Env Runtime id",
    ))
}

fn is_valid_record_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._:-".contains(&byte))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_keep_stable_ids_and_monotonic_timestamps() {
        let mut state = EnvRuntimeStateV1::default();
        let secret = state
            .create_secret("Token".to_string(), 100)
            .expect("create secret");
        let id = secret.id.clone();
        let updated = state
            .update_secret(&id, 1, Some("Renamed token".to_string()), 50)
            .expect("update secret");
        assert_eq!(updated.id, id);
        assert_eq!(updated.revision, 2);
        let record = state.secret_by_id(&id).expect("secret record");
        assert_eq!(record.created_at_epoch_ms, 100);
        assert_eq!(record.updated_at_epoch_ms, 101);
    }

    #[test]
    fn profile_references_are_validated_and_block_secret_delete() {
        let mut state = EnvRuntimeStateV1::default();
        let secret = state
            .create_secret("Token".to_string(), 100)
            .expect("create secret");
        let missing = state.create_profile(
            "missing".to_string(),
            "Missing".to_string(),
            None,
            vec![EnvVariableMappingV1 {
                name: "TOKEN".to_string(),
                secret_id: "envsec_missing".to_string(),
            }],
            100,
        );
        assert_eq!(
            missing.expect_err("missing reference").code(),
            EnvRuntimeErrorCode::ValidationFailed
        );

        state
            .create_profile(
                "local_dev".to_string(),
                "Local dev".to_string(),
                None,
                vec![EnvVariableMappingV1 {
                    name: "TOKEN".to_string(),
                    secret_id: secret.id.clone(),
                }],
                101,
            )
            .expect("create profile");
        let delete = state.delete_secret(&secret.id, secret.revision);
        assert_eq!(
            delete.expect_err("secret in use").code(),
            EnvRuntimeErrorCode::SecretInUse
        );
    }

    #[test]
    fn max_revisions_fail_before_mutating_secret_or_profile_records() {
        let mut state = EnvRuntimeStateV1::default();
        let secret = state
            .create_secret("Token".to_string(), 100)
            .expect("create secret");
        state
            .secrets
            .get_mut(&secret.id)
            .expect("secret record")
            .revision = u64::MAX;
        let secret_before = state
            .secrets
            .get(&secret.id)
            .expect("secret before")
            .clone();
        let secret_error = state
            .update_secret(
                &secret.id,
                u64::MAX,
                Some("Must not persist".to_string()),
                101,
            )
            .expect_err("secret revision overflow");
        assert_eq!(secret_error.code(), EnvRuntimeErrorCode::RevisionConflict);
        assert_eq!(state.secrets.get(&secret.id), Some(&secret_before));

        let profile = state
            .create_profile(
                "profile".to_string(),
                "Profile".to_string(),
                None,
                vec![EnvVariableMappingV1 {
                    name: "TOKEN".to_string(),
                    secret_id: secret.id,
                }],
                102,
            )
            .expect("create profile");
        state
            .profiles
            .get_mut(&profile.id)
            .expect("profile record")
            .revision = u64::MAX;
        let profile_before = state
            .profiles
            .get(&profile.id)
            .expect("profile before")
            .clone();
        let profile_error = state
            .update_profile(
                &profile.id,
                u64::MAX,
                "changed".to_string(),
                "Must not persist".to_string(),
                Some("Must not persist".to_string()),
                profile.variables,
                103,
            )
            .expect_err("profile revision overflow");
        assert_eq!(profile_error.code(), EnvRuntimeErrorCode::RevisionConflict);
        assert_eq!(state.profiles.get(&profile.id), Some(&profile_before));
    }
}
