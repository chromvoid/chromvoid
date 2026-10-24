mod scan;
pub(super) use scan::read_page;

use std::collections::HashSet;

use serde::de::DeserializeOwned;

use super::super::domain_uow::DomainUnitOfWork;
use super::error::PassmanagerCommandError;
use super::file_store::{read_file_bytes_by_path, stage_file_bytes_at_path};
use crate::rpc::types::{
    CredentialSecurityAuditArtifactV1, PassmanagerSecurityAuditGetRequest,
    PassmanagerSecurityAuditGetResult, PassmanagerSecurityAuditSetRequest,
    PassmanagerSecurityAuditSetResult, RpcResponse,
};
use crate::vault::VaultSession;

pub(super) const PASSMANAGER_SECURITY_AUDIT_DIR: &str = "/.passmanager/.security-audit";
pub(super) const PASSMANAGER_SECURITY_AUDIT_INDEX_PATH: &str =
    "/.passmanager/.security-audit/index.json";

const SECURITY_AUDIT_ARTIFACT_VERSION: u8 = 1;
const SECURITY_AUDIT_ALGORITHM_VERSION: u8 = 1;
const JS_MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

pub(super) fn handle_get(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    data: &serde_json::Value,
) -> RpcResponse {
    if let Err(error) = parse_request::<PassmanagerSecurityAuditGetRequest>(data) {
        return error.into_rpc_response();
    }

    match load_artifact(session, storage) {
        Ok(artifact) => RpcResponse::success(PassmanagerSecurityAuditGetResult { artifact }),
        Err(error) => error.into_rpc_response(),
    }
}

pub(super) fn handle_set(uow: &mut DomainUnitOfWork<'_>, data: &serde_json::Value) -> RpcResponse {
    let request = match parse_request::<PassmanagerSecurityAuditSetRequest>(data) {
        Ok(request) => request,
        Err(error) => return error.into_rpc_response(),
    };

    if let Err(reason) = validate_artifact(&request.artifact) {
        return PassmanagerCommandError::empty_payload(format!(
            "invalid security audit artifact: {reason}"
        ))
        .into_rpc_response();
    }

    let bytes = match serde_json::to_vec(&request.artifact) {
        Ok(bytes) => bytes,
        Err(error) => {
            return PassmanagerCommandError::internal(format!(
                "Failed to serialize security audit artifact: {error}"
            ))
            .into_rpc_response()
        }
    };

    match stage_file_bytes_at_path(
        uow,
        PASSMANAGER_SECURITY_AUDIT_DIR,
        "index.json",
        &bytes,
        "application/json",
    ) {
        Ok(()) => RpcResponse::success(PassmanagerSecurityAuditSetResult {}),
        Err(error) => error.into_rpc_response(),
    }
}

fn parse_request<T: DeserializeOwned>(
    data: &serde_json::Value,
) -> Result<T, PassmanagerCommandError> {
    serde_json::from_value(data.clone()).map_err(|error| {
        PassmanagerCommandError::empty_payload(format!("invalid security audit request: {error}"))
    })
}

fn load_artifact(
    session: &VaultSession,
    storage: &crate::storage::Storage,
) -> Result<Option<CredentialSecurityAuditArtifactV1>, PassmanagerCommandError> {
    let Some(bytes) =
        read_file_bytes_by_path(session, storage, PASSMANAGER_SECURITY_AUDIT_INDEX_PATH)?
    else {
        return Ok(None);
    };

    let Ok(artifact) = serde_json::from_slice::<CredentialSecurityAuditArtifactV1>(&bytes) else {
        return Ok(None);
    };
    if validate_artifact(&artifact).is_err() {
        return Ok(None);
    }

    Ok(Some(artifact))
}

fn validate_artifact(artifact: &CredentialSecurityAuditArtifactV1) -> Result<(), &'static str> {
    if artifact.version != SECURITY_AUDIT_ARTIFACT_VERSION {
        return Err("unsupported artifact version");
    }
    if artifact.algorithm_version != SECURITY_AUDIT_ALGORITHM_VERSION {
        return Err("unsupported algorithm version");
    }
    if artifact.revision.is_empty() {
        return Err("revision is required");
    }
    if artifact.generated_at > JS_MAX_SAFE_INTEGER {
        return Err("generatedAt must be a safe numeric epoch");
    }

    for (entry_id, summary) in &artifact.entries {
        if entry_id.is_empty() || summary.entry_id != *entry_id {
            return Err("entry key must match a non-empty entryId");
        }

        let strength_score = summary.strength_score.0;
        if strength_score.is_some_and(|score| score > 4) {
            return Err("strengthScore must be between 0 and 4 or null");
        }
        let expected_weak_password = strength_score.is_some_and(|score| score <= 1);
        if summary.weak_password != expected_weak_password {
            return Err("weakPassword does not match strengthScore");
        }
    }

    let mut unique_failed_entry_ids = HashSet::new();
    for entry_id in &artifact.failed_entry_ids {
        if entry_id.is_empty() || !unique_failed_entry_ids.insert(entry_id) {
            return Err("failedEntryIds must contain unique non-empty ids");
        }
    }

    Ok(())
}
