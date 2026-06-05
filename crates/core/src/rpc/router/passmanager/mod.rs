//! PassManager domain commands (ADR-028): scoped access to /.passmanager only.

mod entry;
mod error;
mod file_store;
mod group;
mod icon;
pub(in crate::rpc::router) mod otp;
pub(in crate::rpc::router) mod otp_target;
mod path;
mod root_export;
mod root_import;
mod secret;
mod tags;

use super::super::types::RpcResponse;
use super::domain_uow::DomainUnitOfWork;
use super::state::RpcRouter;
use crate::error::ErrorCode;
use crate::storage::Storage;
use crate::vault::VaultSession;

impl RpcRouter {
    // ── Entry handlers ──────────────────────────────────────────────────────

    pub(super) fn handle_passmanager_entry_save(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        self.commit_passmanager_domain_uow("passmanager-entry-save", |s, storage, uow| {
            entry::handle_save(s, storage, uow, data)
        })
    }

    pub(super) fn handle_passmanager_entry_read(&self, data: &serde_json::Value) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session(|s| entry::handle_read(s, &storage, data))
    }

    pub(super) fn handle_passmanager_entry_delete(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        self.commit_passmanager_domain_uow("passmanager-entry-delete", |s, storage, uow| {
            entry::handle_delete(s, storage, uow, data)
        })
    }

    pub(super) fn handle_passmanager_entry_move(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        self.commit_passmanager_domain_uow("passmanager-entry-move", |s, storage, uow| {
            entry::handle_move(s, storage, uow, data)
        })
    }

    pub(super) fn handle_passmanager_entry_rename(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        self.commit_passmanager_domain_uow("passmanager-entry-rename", |s, storage, uow| {
            entry::handle_rename(s, storage, uow, data)
        })
    }

    pub(super) fn handle_passmanager_entry_list(&self, data: &serde_json::Value) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session(|s| entry::handle_list(s, &storage, data))
    }

    // ── Secret handlers ─────────────────────────────────────────────────────

    pub(super) fn handle_passmanager_secret_save(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        self.commit_passmanager_domain_uow("passmanager-secret-save", |s, storage, uow| {
            secret::handle_save(s, storage, uow, data)
        })
    }

    pub(super) fn handle_passmanager_secret_read(&self, data: &serde_json::Value) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session(|s| secret::handle_read(s, &storage, data))
    }

    pub(super) fn handle_passmanager_secret_delete(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        self.commit_passmanager_domain_uow("passmanager-secret-delete", |s, storage, uow| {
            secret::handle_delete(s, storage, uow, data)
        })
    }

    // ── Group handlers ──────────────────────────────────────────────────────

    pub(super) fn handle_passmanager_group_ensure(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        self.commit_passmanager_domain_uow("passmanager-group-ensure", |_s, _storage, uow| {
            group::handle_ensure(uow, data)
        })
    }

    pub(super) fn handle_passmanager_group_list(&self, data: &serde_json::Value) -> RpcResponse {
        self.with_session(|s| group::handle_list(s, data))
    }

    pub(super) fn handle_passmanager_group_delete(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        self.commit_passmanager_domain_uow("passmanager-group-delete", |s, storage, uow| {
            group::handle_delete(s, storage, uow, data)
        })
    }

    pub(super) fn handle_passmanager_group_set_meta(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        self.commit_passmanager_domain_uow("passmanager-group-set-meta", |s, storage, uow| {
            group::handle_set_meta(s, storage, uow, data)
        })
    }

    pub(super) fn handle_passmanager_tags_set_catalog(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        self.commit_passmanager_domain_uow("passmanager-tags-set-catalog", |s, storage, uow| {
            tags::handle_set_catalog(s, storage, uow, data)
        })
    }

    // ── Icon handlers ────────────────────────────────────────────────────────

    pub(super) fn handle_passmanager_icon_put(&mut self, data: &serde_json::Value) -> RpcResponse {
        self.commit_passmanager_domain_uow("passmanager-icon-put", |s, storage, uow| {
            icon::handle_put(s, storage, uow, data)
        })
    }

    pub(super) fn handle_passmanager_icon_get(&self, data: &serde_json::Value) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session(|s| icon::handle_get(s, &storage, data))
    }

    pub(super) fn handle_passmanager_icon_list(&self, data: &serde_json::Value) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session(|s| icon::handle_list(s, &storage, data))
    }

    pub(super) fn handle_passmanager_icon_set_meta(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        self.commit_passmanager_domain_uow("passmanager-icon-set-meta", |s, storage, uow| {
            icon::handle_set_meta(s, storage, uow, data)
        })
    }

    pub(super) fn handle_passmanager_icon_gc(&mut self, data: &serde_json::Value) -> RpcResponse {
        self.commit_passmanager_domain_uow("passmanager-icon-gc", |s, storage, uow| {
            icon::handle_gc(s, storage, uow, data)
        })
    }

    // ── OTP handlers ─────────────────────────────────────────────────────────

    pub(super) fn handle_passmanager_otp_set_secret(
        &self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        let storage = self.storage.clone();
        let Some(session) = self.session.as_ref() else {
            return otp::PassmanagerOtpError::vault_required().into_rpc_response();
        };
        otp::handle_set_secret(session, &storage, &self.passmanager_otp_target_cache, data)
    }

    pub(super) fn handle_passmanager_otp_generate(&self, data: &serde_json::Value) -> RpcResponse {
        let storage = self.storage.clone();
        let Some(session) = self.session.as_ref() else {
            return otp::PassmanagerOtpError::vault_required().into_rpc_response();
        };
        otp::handle_generate(session, &storage, &self.passmanager_otp_target_cache, data)
    }

    pub(super) fn handle_passmanager_otp_remove_secret(
        &self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        let storage = self.storage.clone();
        let Some(session) = self.session.as_ref() else {
            return otp::PassmanagerOtpError::vault_required().into_rpc_response();
        };
        otp::handle_remove_secret(session, &storage, &self.passmanager_otp_target_cache, data)
    }

    fn commit_passmanager_domain_uow<F>(&mut self, tx_id_hint: &str, f: F) -> RpcResponse
    where
        F: FnOnce(&VaultSession, &Storage, &mut DomainUnitOfWork<'_>) -> RpcResponse,
    {
        let storage = self.storage.clone();
        let Some(session) = self.session.as_mut() else {
            return RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultRequired));
        };
        let mut uow = DomainUnitOfWork::begin(session, &storage, ".passmanager", tx_id_hint);
        let response = f(session, &storage, &mut uow);
        if !response.is_ok() {
            return response;
        }
        match uow.commit(session) {
            Ok(_) => response,
            Err(error) => error.into_rpc_response(),
        }
    }
}
