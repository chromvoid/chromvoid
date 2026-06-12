use std::sync::Mutex;

use crate::error::ErrorCode;
use crate::rpc::router::otp_sidecar::{
    generate_otp, remove_otp_secret, rename_otp_secret, set_otp_secret, OtpGenerateRequest,
    OtpRemoveSecretRequest, OtpRenameSecretRequest, OtpSidecarError,
};
use crate::rpc::types::OtpGenerateResponse;
use crate::storage::Storage;
use crate::vault::VaultSession;

use super::super::otp_target::{
    resolve_with_cache, PassmanagerOtpTargetCache, PassmanagerOtpTargetRequest, ResolvedOtpTarget,
};
use super::super::path::node_in_passmanager;
use super::error::PassmanagerOtpError;
use super::request::{
    PassmanagerOtpGenerateRequest, PassmanagerOtpRemoveSecretRequest,
    PassmanagerOtpRenameSecretRequest, PassmanagerOtpSetSecretRequest,
};

pub(super) fn set_secret(
    session: &VaultSession,
    storage: &Storage,
    cache: &Mutex<PassmanagerOtpTargetCache>,
    request: PassmanagerOtpSetSecretRequest<'_>,
) -> Result<(), PassmanagerOtpError> {
    let target = resolve_required_target(session, storage, cache, request.target, false)?;
    check_pm_access(session, target.node_id)?;
    let sidecar_request = request.into_sidecar_request(target.node_id, target.label)?;
    set_otp_secret(session, storage, sidecar_request).map_err(PassmanagerOtpError::from)
}

pub(super) fn generate(
    session: &VaultSession,
    storage: &Storage,
    cache: &Mutex<PassmanagerOtpTargetCache>,
    request: PassmanagerOtpGenerateRequest<'_>,
) -> Result<OtpGenerateResponse, PassmanagerOtpError> {
    if let Some(node_id) = request.node_id {
        check_pm_access(session, node_id)?;
        return generate_otp(
            session,
            storage,
            OtpGenerateRequest {
                node_id,
                label: request.target.fallback_label,
                ts: request.ts,
            },
        )
        .map_err(PassmanagerOtpError::from);
    }

    generate_by_id_lookup(session, storage, cache, request.target, request.ts)
}

pub(super) fn remove_secret(
    session: &VaultSession,
    storage: &Storage,
    cache: &Mutex<PassmanagerOtpTargetCache>,
    request: PassmanagerOtpRemoveSecretRequest<'_>,
) -> Result<(), PassmanagerOtpError> {
    let lookup = PassmanagerOtpTargetRequest {
        fallback_label: None,
        ..request.target
    };
    let target = resolve_required_target(session, storage, cache, lookup, false)?;
    check_pm_access(session, target.node_id)?;
    remove_otp_secret(
        session,
        storage,
        OtpRemoveSecretRequest {
            node_id: target.node_id,
            label: &target.label,
        },
    )
    .map_err(PassmanagerOtpError::from)
}

pub(super) fn rename_secret(
    session: &VaultSession,
    storage: &Storage,
    cache: &Mutex<PassmanagerOtpTargetCache>,
    request: PassmanagerOtpRenameSecretRequest<'_>,
) -> Result<(), PassmanagerOtpError> {
    let target = resolve_required_target(session, storage, cache, request.target, false)?;
    check_pm_access(session, target.node_id)?;
    rename_otp_secret(
        session,
        storage,
        OtpRenameSecretRequest {
            node_id: target.node_id,
            previous_label: request.previous_label,
            next_label: request.next_label,
        },
    )
    .map_err(PassmanagerOtpError::from)
}

pub(in crate::rpc::router) fn generate_by_id_lookup(
    session: &VaultSession,
    storage: &Storage,
    cache: &Mutex<PassmanagerOtpTargetCache>,
    lookup: PassmanagerOtpTargetRequest<'_>,
    ts: Option<u64>,
) -> Result<OtpGenerateResponse, PassmanagerOtpError> {
    let target = resolve_required_target(session, storage, cache, lookup, false)?;
    let initial = generate_for_target(session, storage, &target, ts);
    let initial_error = match initial {
        Ok(response) => return Ok(response),
        Err(error) => error,
    };

    if !should_retry_with_fresh_target(initial_error.code()) {
        return Err(PassmanagerOtpError::from(initial_error));
    }

    let refreshed = match resolve_target(session, storage, cache, lookup, true) {
        Ok(Some(target)) => target,
        Ok(None) | Err(_) => return Err(PassmanagerOtpError::from(initial_error)),
    };
    if refreshed == target {
        return Err(PassmanagerOtpError::from(initial_error));
    }

    generate_for_target(session, storage, &refreshed, ts).map_err(PassmanagerOtpError::from)
}

fn resolve_required_target(
    session: &VaultSession,
    storage: &Storage,
    cache: &Mutex<PassmanagerOtpTargetCache>,
    request: PassmanagerOtpTargetRequest<'_>,
    force_refresh: bool,
) -> Result<ResolvedOtpTarget, PassmanagerOtpError> {
    resolve_target(session, storage, cache, request, force_refresh)?
        .ok_or_else(PassmanagerOtpError::target_not_found)
}

fn resolve_target(
    session: &VaultSession,
    storage: &Storage,
    cache: &Mutex<PassmanagerOtpTargetCache>,
    request: PassmanagerOtpTargetRequest<'_>,
    force_refresh: bool,
) -> Result<Option<ResolvedOtpTarget>, PassmanagerOtpError> {
    resolve_with_cache(cache, session, storage, request, force_refresh)
        .map_err(PassmanagerOtpError::resolve_failed)
}

fn generate_for_target(
    session: &VaultSession,
    storage: &Storage,
    target: &ResolvedOtpTarget,
    ts: Option<u64>,
) -> Result<OtpGenerateResponse, OtpSidecarError> {
    generate_otp(
        session,
        storage,
        OtpGenerateRequest {
            node_id: target.node_id,
            label: Some(&target.label),
            ts,
        },
    )
}

fn should_retry_with_fresh_target(code: ErrorCode) -> bool {
    matches!(
        code,
        ErrorCode::OtpSecretNotFound | ErrorCode::OtpSettingsNotFound | ErrorCode::NodeNotFound
    )
}

fn check_pm_access(session: &VaultSession, node_id: u64) -> Result<(), PassmanagerOtpError> {
    if !node_in_passmanager(session, node_id) {
        return Err(PassmanagerOtpError::access_denied());
    }
    Ok(())
}
