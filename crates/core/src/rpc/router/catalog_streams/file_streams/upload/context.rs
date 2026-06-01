use crate::types::KEY_SIZE;
use crate::vault::VaultSession;

use super::super::super::super::state::RpcRouter;
use super::error::{UploadCommandError, UploadResult};

pub(super) struct UploadVaultContext {
    vault_key: [u8; KEY_SIZE],
}

impl UploadVaultContext {
    pub(super) fn require(router: &RpcRouter) -> UploadResult<Self> {
        let session = require_session(router)?;
        Ok(Self {
            vault_key: *session.vault_key(),
        })
    }

    pub(super) fn vault_key(&self) -> &[u8; KEY_SIZE] {
        &self.vault_key
    }
}

pub(super) fn require_session(router: &RpcRouter) -> UploadResult<&VaultSession> {
    router.session.as_ref().ok_or_else(vault_required)
}

pub(super) fn require_session_mut(router: &mut RpcRouter) -> UploadResult<&mut VaultSession> {
    router.session.as_mut().ok_or_else(vault_required)
}

fn vault_required() -> UploadCommandError {
    UploadCommandError::vault_required()
}
