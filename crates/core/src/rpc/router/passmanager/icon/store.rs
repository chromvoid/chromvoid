use super::super::error::PassmanagerCommandError;
use super::super::file_store::{read_file_bytes_by_path, stage_file_bytes_at_path};
use super::types::{IconIndexFile, PASSMANAGER_ICONS_DIR, PASSMANAGER_ICONS_INDEX_PATH};
use crate::error::ErrorCode;
use crate::rpc::router::domain_uow::DomainUnitOfWork;
use crate::vault::VaultSession;

pub(super) fn ensure_icons_dir_exists_uow(
    uow: &mut DomainUnitOfWork<'_>,
) -> Result<(), PassmanagerCommandError> {
    uow.ensure_dir(PASSMANAGER_ICONS_DIR).map_err(|error| {
        PassmanagerCommandError::from_domain_uow_error(error, "Failed to ensure icon directory")
    })
}

pub(in super::super) fn load_icon_index(
    session: &VaultSession,
    storage: &crate::storage::Storage,
) -> Result<IconIndexFile, PassmanagerCommandError> {
    let Some(bytes) = read_file_bytes_by_path(session, storage, PASSMANAGER_ICONS_INDEX_PATH)?
    else {
        return Ok(IconIndexFile::default());
    };

    let index = serde_json::from_slice::<IconIndexFile>(&bytes).map_err(|e| {
        PassmanagerCommandError::new(
            format!("Failed to parse icon index: {e}"),
            Some(ErrorCode::InternalError),
        )
    })?;
    Ok(index)
}

pub(super) fn stage_save_icon_index(
    uow: &mut DomainUnitOfWork<'_>,
    index: &IconIndexFile,
) -> Result<(), PassmanagerCommandError> {
    let bytes = match serde_json::to_vec(index) {
        Ok(bytes) => bytes,
        Err(e) => {
            return Err(PassmanagerCommandError::new(
                format!("Failed to serialize icon index: {e}"),
                Some(ErrorCode::InternalError),
            ))
        }
    };

    stage_file_bytes_at_path(
        uow,
        PASSMANAGER_ICONS_DIR,
        "index.json",
        &bytes,
        "application/json",
    )
}
