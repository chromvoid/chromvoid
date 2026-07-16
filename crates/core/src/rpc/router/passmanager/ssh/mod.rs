mod migration;
mod service;
mod store;
mod types;

use serde_json::Value;

use super::super::state::RpcRouter;
use crate::rpc::types::RpcResponse;

pub(in crate::rpc::router::passmanager) use migration::{
    collect_export_keys, normalize_imported_keys, remove_legacy_metadata, stage_cleanup_nodes,
};
pub(in crate::rpc::router::passmanager) use store::{
    metadata_document_bytes, SSH_METADATA_FILENAME, SSH_ROOT_PATH,
};
pub(in crate::rpc::router::passmanager) use types::SshKeyMetadata;

impl RpcRouter {
    pub(in super::super) fn handle_passmanager_ssh_list(&mut self, _data: &Value) -> RpcResponse {
        let storage = self.storage.clone();
        let needs_migration = self
            .session
            .as_ref()
            .is_some_and(|session| migration::has_legacy_keys(session, &storage));

        if needs_migration {
            let mut cleanup_node_ids = Vec::new();
            let migrated = self.commit_passmanager_domain_uow(
                "passmanager-ssh-legacy-migrate",
                |session, storage, uow| match migration::stage_legacy_migration(
                    session, storage, uow,
                ) {
                    Ok(node_ids) => {
                        cleanup_node_ids = node_ids;
                        RpcResponse::success(Value::Null)
                    }
                    Err(error) => error.into_rpc_response(),
                },
            );
            if !migrated.is_ok() {
                return migrated;
            }

            if !cleanup_node_ids.is_empty() {
                let cleanup = self.commit_passmanager_domain_uow(
                    "passmanager-ssh-legacy-cleanup",
                    |_session, _storage, uow| match migration::stage_cleanup_nodes(
                        uow,
                        &cleanup_node_ids,
                    ) {
                        Ok(()) => RpcResponse::success(Value::Null),
                        Err(error) => error.into_rpc_response(),
                    },
                );
                if !cleanup.is_ok() {
                    tracing::warn!(
                        "passmanager:ssh:list completed migration but legacy secret cleanup failed: {}",
                        cleanup.error_message().unwrap_or("unknown error")
                    );
                }
            }
        }

        let storage = self.storage.clone();
        self.with_session(|session| match store::load_keys(session, &storage) {
            Ok(ssh_keys) => RpcResponse::success(serde_json::json!({"sshKeys": ssh_keys})),
            Err(error) => error.into_rpc_response(),
        })
    }

    pub(in super::super) fn handle_passmanager_ssh_key_update(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        self.commit_passmanager_domain_uow("passmanager-ssh-key-update", |session, storage, uow| {
            match service::update_key(session, storage, uow, data) {
                Ok(()) => RpcResponse::success(Value::Null),
                Err(error) => error.into_rpc_response(),
            }
        })
    }

    pub(in super::super) fn handle_passmanager_ssh_key_delete(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        self.commit_passmanager_domain_uow("passmanager-ssh-key-delete", |session, storage, uow| {
            match service::delete_key(session, storage, uow, data) {
                Ok(()) => RpcResponse::success(Value::Null),
                Err(error) => error.into_rpc_response(),
            }
        })
    }

    pub(in super::super) fn handle_passmanager_ssh_secret_read(&self, data: &Value) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session(
            |session| match service::read_secret(session, &storage, data) {
                Ok(value) => RpcResponse::success(serde_json::json!({"value": value})),
                Err(error) => error.into_rpc_response(),
            },
        )
    }

    pub(in super::super) fn handle_passmanager_ssh_secret_save(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        self.commit_passmanager_domain_uow(
            "passmanager-ssh-secret-save",
            |_session, _storage, uow| match service::save_secret(uow, data) {
                Ok(()) => RpcResponse::success(Value::Null),
                Err(error) => error.into_rpc_response(),
            },
        )
    }

    pub(in super::super) fn handle_passmanager_ssh_secret_delete(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        self.commit_passmanager_domain_uow(
            "passmanager-ssh-secret-delete",
            |_session, _storage, uow| match service::delete_secret(uow, data) {
                Ok(()) => RpcResponse::success(Value::Null),
                Err(error) => error.into_rpc_response(),
            },
        )
    }
}
