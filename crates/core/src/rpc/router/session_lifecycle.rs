//! Shared lifecycle helpers for long-running local sessions.

use std::collections::HashSet;

use super::backup::{BackupLocalMetadata, BackupLocalSession};
use super::restore::RestoreLocalSession;
use super::state::RpcRouter;
use super::vault_export::VaultExportSession;
use crate::error::ErrorCode;
use crate::rpc::types::RpcResponse;

pub(in crate::rpc::router) const LONG_RUNNING_SESSION_IDLE_TTL_MS: u64 = 60 * 60 * 1000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::rpc::router) struct ExpiringSessionMeta {
    pub(in crate::rpc::router) created_at_ms: u64,
    pub(in crate::rpc::router) last_accessed_at_ms: u64,
}

impl ExpiringSessionMeta {
    pub(in crate::rpc::router) fn new(now_ms: u64) -> Self {
        Self {
            created_at_ms: now_ms,
            last_accessed_at_ms: now_ms,
        }
    }

    pub(in crate::rpc::router) fn is_idle_expired(&self, now_ms: u64, ttl_ms: u64) -> bool {
        now_ms.saturating_sub(self.last_accessed_at_ms) > ttl_ms
    }

    pub(in crate::rpc::router) fn touch(&mut self, now_ms: u64) {
        self.last_accessed_at_ms = now_ms;
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::rpc::router) struct LongRunningSessionTtls {
    pub(in crate::rpc::router) backup_local_ms: u64,
    pub(in crate::rpc::router) restore_local_ms: u64,
    pub(in crate::rpc::router) vault_export_ms: u64,
}

impl Default for LongRunningSessionTtls {
    fn default() -> Self {
        Self {
            backup_local_ms: LONG_RUNNING_SESSION_IDLE_TTL_MS,
            restore_local_ms: LONG_RUNNING_SESSION_IDLE_TTL_MS,
            vault_export_ms: LONG_RUNNING_SESSION_IDLE_TTL_MS,
        }
    }
}

#[derive(Default)]
pub(super) struct LongRunningSessions {
    pub(super) backup_local: Option<BackupLocalSession>,
    pub(super) backup_local_max_size: Option<u64>,
    pub(super) restore_local: Option<RestoreLocalSession>,
    pub(super) vault_export: Option<VaultExportSession>,
    pub(super) ttls: LongRunningSessionTtls,
}

pub(in crate::rpc::router) fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Debug, Clone)]
pub(in crate::rpc::router) struct LongRunningSessionError {
    message: String,
    code: Option<String>,
}

pub(in crate::rpc::router) type LongRunningSessionResult<T> = Result<T, LongRunningSessionError>;

impl LongRunningSessionError {
    fn new(message: impl Into<String>, code: Option<ErrorCode>) -> Self {
        Self {
            message: message.into(),
            code: code.map(String::from),
        }
    }

    pub(in crate::rpc::router) fn backup_local_not_found() -> Self {
        Self::new("backup_id not found", Some(ErrorCode::NodeNotFound))
    }

    pub(in crate::rpc::router) fn restore_local_not_found() -> Self {
        Self::new("restore_id not found", Some(ErrorCode::NodeNotFound))
    }

    pub(in crate::rpc::router) fn vault_export_not_found() -> Self {
        Self::new("export_id not found", Some(ErrorCode::NodeNotFound))
    }

    pub(in crate::rpc::router) fn into_rpc_response(self) -> RpcResponse {
        RpcResponse::error(self.message, self.code)
    }
}

impl RpcRouter {
    pub(in crate::rpc::router) fn backup_local_max_size(&self) -> Option<u64> {
        self.long_running_sessions.backup_local_max_size
    }

    pub(in crate::rpc::router) fn backup_local_is_active(&self) -> bool {
        self.long_running_sessions.backup_local.is_some()
    }

    pub(in crate::rpc::router) fn start_backup_local_session(
        &mut self,
        session: BackupLocalSession,
    ) {
        self.long_running_sessions.backup_local = Some(session);
    }

    pub(in crate::rpc::router) fn backup_local_session(
        &self,
        backup_id: &str,
    ) -> LongRunningSessionResult<&BackupLocalSession> {
        match &self.long_running_sessions.backup_local {
            Some(session) if session.id == backup_id => Ok(session),
            _ => Err(LongRunningSessionError::backup_local_not_found()),
        }
    }

    pub(in crate::rpc::router) fn backup_local_session_mut(
        &mut self,
        backup_id: &str,
    ) -> LongRunningSessionResult<&mut BackupLocalSession> {
        match &mut self.long_running_sessions.backup_local {
            Some(session) if session.id == backup_id => Ok(session),
            _ => Err(LongRunningSessionError::backup_local_not_found()),
        }
    }

    pub(in crate::rpc::router) fn cache_backup_local_metadata(
        &mut self,
        backup_id: &str,
        metadata: BackupLocalMetadata,
    ) -> LongRunningSessionResult<()> {
        self.backup_local_session_mut(backup_id)?.metadata = Some(metadata);
        Ok(())
    }

    pub(in crate::rpc::router) fn finish_backup_local_session(
        &mut self,
        backup_id: &str,
    ) -> LongRunningSessionResult<()> {
        self.backup_local_session(backup_id)?;
        self.long_running_sessions.backup_local = None;
        Ok(())
    }

    pub(in crate::rpc::router) fn cancel_backup_local_session(
        &mut self,
        requested_backup_id: Option<&str>,
    ) -> LongRunningSessionResult<String> {
        let active_id = match &self.long_running_sessions.backup_local {
            Some(session) => session.id.clone(),
            None => return Err(LongRunningSessionError::backup_local_not_found()),
        };

        if let Some(requested) = requested_backup_id {
            if requested != active_id {
                return Err(LongRunningSessionError::backup_local_not_found());
            }
        }

        self.long_running_sessions.backup_local = None;
        Ok(active_id)
    }

    pub(in crate::rpc::router) fn clear_backup_local_session(&mut self) {
        self.long_running_sessions.backup_local = None;
    }

    pub(in crate::rpc::router) fn expire_backup_local_if_idle(&mut self) {
        let Some(session) = &self.long_running_sessions.backup_local else {
            return;
        };
        if session
            .meta
            .is_idle_expired(now_ms(), self.long_running_sessions.ttls.backup_local_ms)
        {
            self.long_running_sessions.backup_local = None;
        }
    }

    pub(in crate::rpc::router) fn touch_backup_local(&mut self, backup_id: &str) {
        if let Some(session) = &mut self.long_running_sessions.backup_local {
            if session.id == backup_id {
                session.meta.touch(now_ms());
            }
        }
    }

    pub(in crate::rpc::router) fn restore_local_is_active(&self) -> bool {
        self.long_running_sessions.restore_local.is_some()
    }

    pub(in crate::rpc::router) fn start_restore_local_session(
        &mut self,
        session: RestoreLocalSession,
    ) {
        self.long_running_sessions.restore_local = Some(session);
    }

    pub(in crate::rpc::router) fn restore_local_session(
        &self,
        restore_id: &str,
    ) -> LongRunningSessionResult<&RestoreLocalSession> {
        match &self.long_running_sessions.restore_local {
            Some(session) if session.id == restore_id => Ok(session),
            _ => Err(LongRunningSessionError::restore_local_not_found()),
        }
    }

    pub(in crate::rpc::router) fn restore_local_session_mut(
        &mut self,
        restore_id: &str,
    ) -> LongRunningSessionResult<&mut RestoreLocalSession> {
        match &mut self.long_running_sessions.restore_local {
            Some(session) if session.id == restore_id => Ok(session),
            _ => Err(LongRunningSessionError::restore_local_not_found()),
        }
    }

    pub(in crate::rpc::router) fn restore_local_rollback_state(
        &self,
        requested_restore_id: Option<&str>,
    ) -> LongRunningSessionResult<(String, HashSet<String>)> {
        let session = match &self.long_running_sessions.restore_local {
            Some(session) => session,
            None => return Err(LongRunningSessionError::restore_local_not_found()),
        };

        if let Some(requested) = requested_restore_id {
            if requested != session.id {
                return Err(LongRunningSessionError::restore_local_not_found());
            }
        }

        Ok((session.id.clone(), session.chunk_names.clone()))
    }

    pub(in crate::rpc::router) fn finish_restore_local_session(
        &mut self,
        restore_id: &str,
    ) -> LongRunningSessionResult<()> {
        self.restore_local_session(restore_id)?;
        self.long_running_sessions.restore_local = None;
        Ok(())
    }

    pub(in crate::rpc::router) fn clear_restore_local_session(&mut self) {
        self.long_running_sessions.restore_local = None;
    }

    pub(in crate::rpc::router) fn expire_restore_local_if_idle(&mut self) {
        let Some(session) = &self.long_running_sessions.restore_local else {
            return;
        };
        if session
            .meta
            .is_idle_expired(now_ms(), self.long_running_sessions.ttls.restore_local_ms)
        {
            let chunk_names = session.chunk_names.clone();
            crate::rpc::router::restore::local::rollback_restore_local(self, &chunk_names);
        }
    }

    pub(in crate::rpc::router) fn touch_restore_local(&mut self, restore_id: &str) {
        if let Some(session) = &mut self.long_running_sessions.restore_local {
            if session.id == restore_id {
                session.meta.touch(now_ms());
            }
        }
    }

    pub(in crate::rpc::router) fn expire_vault_export_if_idle(&mut self) {
        let Some(session) = &self.long_running_sessions.vault_export else {
            return;
        };
        if session
            .meta
            .is_idle_expired(now_ms(), self.long_running_sessions.ttls.vault_export_ms)
        {
            self.clear_vault_export_session();
        }
    }

    pub(in crate::rpc::router) fn vault_export_is_active(&self) -> bool {
        self.long_running_sessions.vault_export.is_some()
    }

    pub(in crate::rpc::router) fn start_vault_export_session(
        &mut self,
        session: VaultExportSession,
    ) {
        self.long_running_sessions.vault_export = Some(session);
    }

    pub(in crate::rpc::router) fn vault_export_session(
        &self,
        export_id: &str,
    ) -> LongRunningSessionResult<&VaultExportSession> {
        match &self.long_running_sessions.vault_export {
            Some(session) if session.id == export_id => Ok(session),
            _ => Err(LongRunningSessionError::vault_export_not_found()),
        }
    }

    pub(in crate::rpc::router) fn finish_vault_export_session(
        &mut self,
        export_id: &str,
    ) -> LongRunningSessionResult<VaultExportSession> {
        match self.long_running_sessions.vault_export.take() {
            Some(session) if session.id == export_id => Ok(session),
            Some(session) => {
                self.long_running_sessions.vault_export = Some(session);
                Err(LongRunningSessionError::vault_export_not_found())
            }
            None => Err(LongRunningSessionError::vault_export_not_found()),
        }
    }

    pub(in crate::rpc::router) fn clear_vault_export_session(&mut self) {
        self.long_running_sessions.vault_export = None;
    }

    pub(in crate::rpc::router) fn clear_vault_export(&mut self) {
        self.clear_vault_export_session();
    }

    pub(in crate::rpc::router) fn touch_vault_export(&mut self, export_id: &str) {
        if let Some(session) = &mut self.long_running_sessions.vault_export {
            if session.id == export_id {
                session.meta.touch(now_ms());
            }
        }
    }
}
