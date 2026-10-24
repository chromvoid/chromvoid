//! PassManager domain commands (ADR-028): scoped access to /.passmanager only.

mod entry;
mod error;
mod file_store;
mod group;
mod icon;
pub(in crate::rpc::router) mod import_session;
pub(in crate::rpc::router) mod otp;
pub(in crate::rpc::router) mod otp_target;
mod password_generator;
mod path;
mod root_export;
mod root_import;
mod secret;
mod security_audit;
mod ssh;
mod tags;

use super::super::types::RpcResponse;
use super::domain_uow::DomainUnitOfWork;
use super::state::RpcRouter;
use crate::error::ErrorCode;
use crate::storage::Storage;
use crate::vault::VaultSession;

impl RpcRouter {
    pub(super) fn handle_passmanager_password_generate(
        &self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        self.with_session(|_| {
            let request = match serde_json::from_value(data.clone()) {
                Ok(request) => request,
                Err(_) => {
                    return RpcResponse::error(
                        "Invalid generation settings",
                        Some(ErrorCode::EmptyPayload),
                    )
                }
            };
            match password_generator::generate(request) {
                Ok(value) => RpcResponse::success(value),
                Err(error) => error.into_rpc_response(),
            }
        })
    }

    pub(super) fn handle_passmanager_tag_page(&self, data: &serde_json::Value) -> RpcResponse {
        self.with_session(
            |session| match tags::read_page(session, &self.storage, data) {
                Ok(page) => RpcResponse::success(page),
                Err(error) => error.into_rpc_response(),
            },
        )
    }
    pub(super) fn handle_passmanager_tag_save(&mut self, data: &serde_json::Value) -> RpcResponse {
        self.commit_passmanager_domain_uow("passmanager-tag-save", |session, storage, uow| {
            match tags::save(session, storage, uow, data) {
                Ok(tag) => RpcResponse::success(tag),
                Err(error) => error.into_rpc_response(),
            }
        })
    }
    pub(super) fn handle_passmanager_tag_delete(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        self.commit_passmanager_domain_uow("passmanager-tag-delete", |session, storage, uow| {
            match tags::delete(session, storage, uow, data) {
                Ok(()) => RpcResponse::success(serde_json::Value::Null),
                Err(error) => error.into_rpc_response(),
            }
        })
    }

    // ── Entry handlers ──────────────────────────────────────────────────────

    pub(super) fn handle_passmanager_entry_create(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        self.commit_passmanager_domain_uow("passmanager-entry-create", |s, storage, uow| {
            entry::handle_create(s, storage, uow, data)
        })
    }

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

    pub(super) fn handle_passmanager_entry_page(&self, data: &serde_json::Value) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session(|s| entry::handle_page(s, &storage, data))
    }

    pub(super) fn handle_passmanager_entry_detail(&self, data: &serde_json::Value) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session(|s| match entry::detail::read(s, &storage, data) {
            Ok(value) => RpcResponse::success(value),
            Err(error) => error.into_rpc_response(),
        })
    }

    pub(super) fn handle_passmanager_entry_update(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        self.commit_passmanager_domain_uow("passmanager-entry-update", |s, storage, uow| {
            match entry::detail::update(s, storage, uow, data) {
                Ok(value) => RpcResponse::success(value),
                Err(error) => error.into_rpc_response(),
            }
        })
    }

    pub(super) fn handle_passmanager_website_read(&self, data: &serde_json::Value) -> RpcResponse {
        self.with_session(|s| match entry::websites::read(s, &self.storage, data) {
            Ok(value) => RpcResponse::success(value),
            Err(error) => error.into_rpc_response(),
        })
    }
    pub(super) fn handle_passmanager_website_validate(
        &self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        self.with_session(|_| match entry::websites::validate(data) {
            Ok(value) => RpcResponse::success(value),
            Err(error) => error.into_rpc_response(),
        })
    }
    pub(super) fn handle_passmanager_website_update(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        self.commit_passmanager_domain_uow("passmanager-websites-update", |s, storage, uow| {
            match entry::websites::update(s, storage, uow, data) {
                Ok(value) => RpcResponse::success(value),
                Err(error) => error.into_rpc_response(),
            }
        })
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

    pub(super) fn handle_passmanager_group_page(&self, data: &serde_json::Value) -> RpcResponse {
        self.with_session(|s| match group::navigation::read_page(s, data) {
            Ok(value) => RpcResponse::success(value),
            Err(error) => error.into_rpc_response(),
        })
    }

    pub(super) fn handle_passmanager_group_rename(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        self.commit_passmanager_domain_uow("passmanager-group-rename", |s, storage, uow| {
            match group::navigation::rename(s, storage, uow, data) {
                Ok(()) => RpcResponse::success(serde_json::Value::Null),
                Err(error) => error.into_rpc_response(),
            }
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

    pub(super) fn handle_passmanager_icon_get_many(&self, data: &serde_json::Value) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session(|s| icon::handle_get_many(s, &storage, data))
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

    pub(super) fn handle_passmanager_security_audit_page(
        &self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session(
            |session| match security_audit::read_page(session, &storage, data) {
                Ok(page) => RpcResponse::success(page),
                Err(error) => error.into_rpc_response(),
            },
        )
    }

    // ── Security audit handlers ──────────────────────────────────────────────

    pub(super) fn handle_passmanager_security_audit_get(
        &self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session(|s| security_audit::handle_get(s, &storage, data))
    }

    pub(super) fn handle_passmanager_security_audit_set(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        self.commit_passmanager_domain_uow("passmanager-security-audit-set", |_s, _storage, uow| {
            security_audit::handle_set(uow, data)
        })
    }

    pub(super) fn handle_passmanager_otp_parse_uri(&self, data: &serde_json::Value) -> RpcResponse {
        if self.session.is_none() {
            return RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultRequired));
        }
        let request = match serde_json::from_value(data.clone()) {
            Ok(request) => request,
            Err(_) => {
                return RpcResponse::error(
                    "Invalid OTP setup request",
                    Some(ErrorCode::EmptyPayload),
                )
            }
        };
        match otp::uri::parse(request) {
            Ok(value) => RpcResponse::success(value),
            Err(error) => error.into_rpc_response(),
        }
    }

    pub(super) fn handle_passmanager_otp_record_list(
        &self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        let Some(session) = self.session.as_ref() else {
            return RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultRequired));
        };
        match otp::records::list(session, &self.storage, data) {
            Ok(value) => RpcResponse::success(value),
            Err(error) => error.into_rpc_response(),
        }
    }
    pub(super) fn handle_passmanager_otp_record_code(
        &self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        let Some(session) = self.session.as_ref() else {
            return RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultRequired));
        };
        match otp::records::code(session, &self.storage, data) {
            Ok(value) => RpcResponse::success(value),
            Err(error) => error.into_rpc_response(),
        }
    }
    pub(super) fn handle_passmanager_otp_record_save(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        self.commit_passmanager_domain_uow("otp-record-save", |session, storage, uow| {
            match otp::records::save(session, storage, uow, data) {
                Ok(()) => RpcResponse::success(serde_json::Value::Null),
                Err(error) => error.into_rpc_response(),
            }
        })
    }
    pub(super) fn handle_passmanager_otp_record_delete(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        self.commit_passmanager_domain_uow("otp-record-delete", |session, storage, uow| {
            match otp::records::delete(session, storage, uow, data) {
                Ok(()) => RpcResponse::success(serde_json::Value::Null),
                Err(error) => error.into_rpc_response(),
            }
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

    pub(super) fn handle_passmanager_otp_preview(&self, data: &serde_json::Value) -> RpcResponse {
        let Some(session) = self.session.as_ref() else {
            return otp::PassmanagerOtpError::vault_required().into_rpc_response();
        };
        otp::handle_preview(session, data)
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

    pub(super) fn handle_passmanager_otp_rename_secret(
        &self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        let storage = self.storage.clone();
        let Some(session) = self.session.as_ref() else {
            return otp::PassmanagerOtpError::vault_required().into_rpc_response();
        };
        otp::handle_rename_secret(session, &storage, &self.passmanager_otp_target_cache, data)
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
            Ok(_) => {
                self.event_queue.push_update_state();
                response
            }
            Err(error) => error.into_rpc_response(),
        }
    }
}
