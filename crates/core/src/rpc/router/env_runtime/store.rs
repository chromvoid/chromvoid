use zeroize::Zeroizing;

use crate::env_runtime::{
    validate_secret_value, EnvRuntimeError, EnvRuntimeErrorCode, EnvRuntimeResult,
    EnvRuntimeStateV1, EnvSecretMetadataRecordV1, EnvSecretValueRecordV1,
    ENV_RUNTIME_RECORD_VERSION,
};
use crate::storage::Storage;
use crate::vault::VaultSession;

use super::super::domain_read::{read_blob_by_path, DomainReadScope};
use super::super::domain_uow::DomainUnitOfWork;

pub(super) const ENV_RUNTIME_ROOT: &str = "/.cv-env-runtime";
const ENV_RUNTIME_DOMAIN_ID: &str = ".cv-env-runtime";
const ENV_RUNTIME_STATE_PATH: &str = "/.cv-env-runtime/state.json";
const ENV_RUNTIME_VALUES_PATH: &str = "/.cv-env-runtime/values";
const JSON_MIME: &str = "application/json";

pub(super) fn load_state(
    session: &VaultSession,
    storage: &Storage,
) -> EnvRuntimeResult<EnvRuntimeStateV1> {
    let Some(bytes) = read_blob_by_path(
        session,
        storage,
        DomainReadScope::EnvRuntime,
        ENV_RUNTIME_STATE_PATH,
    )
    .map_err(|error| EnvRuntimeError::internal(error.message()))?
    else {
        return Ok(EnvRuntimeStateV1::default());
    };
    let state = serde_json::from_slice::<EnvRuntimeStateV1>(&bytes)
        .map_err(|_| EnvRuntimeError::internal("Invalid Env Runtime state record"))?;
    state.validate_integrity()?;
    Ok(state)
}

pub(super) fn load_secret_value(
    session: &VaultSession,
    storage: &Storage,
    metadata: &EnvSecretMetadataRecordV1,
) -> EnvRuntimeResult<EnvSecretValueRecordV1> {
    let bytes = read_blob_by_path(
        session,
        storage,
        DomainReadScope::EnvRuntime,
        &secret_value_path(&metadata.id),
    )
    .map_err(|_| resolution_error())?
    .ok_or_else(resolution_error)?;
    let bytes = Zeroizing::new(bytes);
    let value =
        serde_json::from_slice::<EnvSecretValueRecordV1>(&bytes).map_err(|_| resolution_error())?;
    if value.version != ENV_RUNTIME_RECORD_VERSION
        || value.secret_id != metadata.id
        || value.revision != metadata.revision
        || validate_secret_value(&value.value).is_err()
    {
        return Err(resolution_error());
    }
    Ok(value)
}

pub(super) fn begin_uow<'a>(
    session: &VaultSession,
    storage: &'a Storage,
    hint: &str,
) -> DomainUnitOfWork<'a> {
    DomainUnitOfWork::begin(session, storage, ENV_RUNTIME_DOMAIN_ID, hint)
}

pub(super) fn stage_state(
    uow: &mut DomainUnitOfWork<'_>,
    state: &EnvRuntimeStateV1,
) -> EnvRuntimeResult<()> {
    let bytes = serde_json::to_vec(state)
        .map_err(|_| EnvRuntimeError::internal("Failed to encode Env Runtime state"))?;
    uow.stage_blob_write(ENV_RUNTIME_ROOT, "state.json", &bytes, JSON_MIME)
        .map(|_| ())
        .map_err(|error| EnvRuntimeError::internal(error.message()))
}

pub(super) fn stage_secret_value(
    uow: &mut DomainUnitOfWork<'_>,
    value: &EnvSecretValueRecordV1,
) -> EnvRuntimeResult<()> {
    let bytes = serde_json::to_vec(value)
        .map(Zeroizing::new)
        .map_err(|_| EnvRuntimeError::internal("Failed to encode Env Runtime secret value"))?;
    uow.stage_blob_write(
        ENV_RUNTIME_VALUES_PATH,
        &secret_value_filename(&value.secret_id),
        &bytes,
        JSON_MIME,
    )
    .map(|_| ())
    .map_err(|error| EnvRuntimeError::internal(error.message()))
}

pub(super) fn stage_delete_secret_value(
    uow: &mut DomainUnitOfWork<'_>,
    secret_id: &str,
) -> EnvRuntimeResult<()> {
    let path = secret_value_path(secret_id);
    let node_id = uow
        .catalog()
        .find_by_path(&path)
        .map(|node| node.node_id)
        .ok_or_else(|| EnvRuntimeError::internal("Env Runtime secret value is missing"))?;
    uow.stage_delete_node(node_id)
        .map_err(|error| EnvRuntimeError::internal(error.message()))
}

pub(super) fn commit_uow(
    uow: DomainUnitOfWork<'_>,
    session: &mut VaultSession,
) -> EnvRuntimeResult<()> {
    uow.commit(session)
        .map(|_| ())
        .map_err(|error| EnvRuntimeError::internal(error.message()))
}

fn secret_value_filename(secret_id: &str) -> String {
    format!("{secret_id}.json")
}

fn secret_value_path(secret_id: &str) -> String {
    format!(
        "{ENV_RUNTIME_VALUES_PATH}/{}",
        secret_value_filename(secret_id)
    )
}

fn resolution_error() -> EnvRuntimeError {
    EnvRuntimeError::new(
        EnvRuntimeErrorCode::ResolutionFailed,
        "Env Runtime secret resolution failed",
    )
}
