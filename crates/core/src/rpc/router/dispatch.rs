//! RPC command dispatch — routes incoming requests to domain handlers

use crate::error::ErrorCode;
use crate::rpc::commands::{
    handle_catalog_shard_list_request, handle_catalog_shard_load_request,
    handle_catalog_shard_sync_request, handle_catalog_sync_delta, *,
};
use crate::rpc::stream::{RpcInputStream, RpcReply};
use crate::rpc::types::{RpcRequest, RpcResponse, PROTOCOL_VERSION};

use super::shard_compact::handle_catalog_shard_compact_persist;
use super::state::RpcRouter;

impl RpcRouter {
    /// Handle an RPC request
    pub fn handle(&mut self, request: &RpcRequest) -> RpcResponse {
        // Check protocol version
        if request.v != PROTOCOL_VERSION {
            return RpcResponse::error(
                format!("unsupported protocol version: {}", request.v),
                Some(ErrorCode::InternalError),
            );
        }

        // Route command
        match request.command.as_str() {
            // System commands (no vault required)
            "ping" => handle_ping(&request.data),
            "pong" => handle_pong(&request.data),

            // Vault commands
            "vault:unlock" => self.handle_vault_unlock(&request.data),
            "vault:lock" => self.handle_vault_lock(),
            "vault:status" => handle_vault_status(self.session.as_ref()),

            // Vault export (ADR-004/ADR-012)
            "vault:export:start" => self.handle_vault_export_start(&request.data),
            "vault:export:downloadChunk" => self.handle_vault_export_download_chunk(&request.data),
            "vault:export:download" => {
                let _export_id = match request.data.get("export_id").and_then(|v| v.as_str()) {
                    Some(v) => v,
                    None => {
                        return RpcResponse::error(
                            "export_id is required",
                            Some(ErrorCode::EmptyPayload),
                        )
                    }
                };
                RpcResponse::error("Streaming required", Some(ErrorCode::StreamRequired))
            }
            "vault:export:finish" => self.handle_vault_export_finish(&request.data),

            // Catalog commands (vault required)
            "catalog:list" => self.with_session(|s| handle_catalog_list(s, &request.data)),
            "catalog:createDir" => {
                self.with_session_mut(|s| handle_catalog_create_dir(s, &request.data))
            }
            "catalog:rename" => self.with_session_mut(|s| handle_catalog_rename(s, &request.data)),
            "catalog:delete" => {
                let storage = self.storage.clone();
                self.with_session_mut(|s| handle_catalog_delete(s, &request.data, &storage))
            }
            "catalog:move" => self.with_session_mut(|s| handle_catalog_move(s, &request.data)),
            "catalog:prepareUpload" => {
                let storage = self.storage.clone();
                self.with_session_mut(|s| handle_catalog_prepare_upload(s, &request.data, &storage))
            }

            // PassManager domain commands (ADR-028): scoped access to /.passmanager only.
            "passmanager:secret:save" => self.handle_passmanager_secret_save(&request.data),
            "passmanager:secret:read" => self.handle_passmanager_secret_read(&request.data),
            "passmanager:secret:delete" => self.handle_passmanager_secret_delete(&request.data),
            "passmanager:group:ensure" => self.handle_passmanager_group_ensure(&request.data),
            "passmanager:group:setMeta" => self.handle_passmanager_group_set_meta(&request.data),
            "passmanager:group:list" => self.handle_passmanager_group_list(&request.data),
            "passmanager:root:import" => self.handle_passmanager_root_import(&request.data),
            "passmanager:root:export" => self.handle_passmanager_root_export(&request.data),
            "passmanager:icon:put" => self.handle_passmanager_icon_put(&request.data),
            "passmanager:icon:get" => self.handle_passmanager_icon_get(&request.data),
            "passmanager:icon:list" => self.handle_passmanager_icon_list(&request.data),
            "passmanager:icon:gc" => self.handle_passmanager_icon_gc(&request.data),
            "passmanager:otp:setSecret" => self.handle_passmanager_otp_set_secret(&request.data),
            "passmanager:otp:generate" => self.handle_passmanager_otp_generate(&request.data),
            "passmanager:otp:removeSecret" => {
                self.handle_passmanager_otp_remove_secret(&request.data)
            }
            "passmanager:entry:save" => self.handle_passmanager_entry_save(&request.data),
            "passmanager:entry:read" => self.handle_passmanager_entry_read(&request.data),
            "passmanager:entry:delete" => self.handle_passmanager_entry_delete(&request.data),
            "passmanager:entry:move" => self.handle_passmanager_entry_move(&request.data),
            "passmanager:entry:rename" => self.handle_passmanager_entry_rename(&request.data),
            "passmanager:entry:list" => self.handle_passmanager_entry_list(&request.data),

            // ADR-004: subscription commands (no-op in Core; embedding layer consumes events)
            "catalog:subscribe" => {
                if self.session.is_none() {
                    return RpcResponse::error(
                        "Vault not unlocked",
                        Some(ErrorCode::VaultRequired),
                    );
                }
                self.catalog_subscribed = true;
                RpcResponse::success(serde_json::Value::Null)
            }
            "catalog:unsubscribe" => {
                if self.session.is_none() {
                    return RpcResponse::error(
                        "Vault not unlocked",
                        Some(ErrorCode::VaultRequired),
                    );
                }
                self.catalog_subscribed = false;
                RpcResponse::success(serde_json::Value::Null)
            }
            // ADR-004: catalog:upload is STREAM
            "catalog:upload" => self.with_session(|s| {
                let node_id = match request.data.get("node_id").and_then(|v| v.as_u64()) {
                    Some(id) => id,
                    None => {
                        return RpcResponse::error(
                            "node_id is required",
                            Some(ErrorCode::EmptyPayload),
                        )
                    }
                };
                let _size = match request.data.get("size").and_then(|v| v.as_u64()) {
                    Some(s) => s,
                    None => {
                        return RpcResponse::error(
                            "size is required",
                            Some(ErrorCode::EmptyPayload),
                        )
                    }
                };
                if let Some(path) = s.catalog().get_path(node_id) {
                    if is_system_path_guarded(&path) {
                        return RpcResponse::error("Access denied", Some(ErrorCode::AccessDenied));
                    }
                }

                RpcResponse::error("No incoming stream", Some(ErrorCode::NoStream))
            }),

            // ADR-004: catalog:download is STREAM
            "catalog:download" => self.with_session(|s| {
                let node_id = match request.data.get("node_id").and_then(|v| v.as_u64()) {
                    Some(id) => id,
                    None => {
                        return RpcResponse::error(
                            "node_id is required",
                            Some(ErrorCode::EmptyPayload),
                        )
                    }
                };
                if let Some(path) = s.catalog().get_path(node_id) {
                    if is_system_path_guarded(&path) {
                        return RpcResponse::error("Access denied", Some(ErrorCode::AccessDenied));
                    }
                }
                RpcResponse::error("Streaming required", Some(ErrorCode::StreamRequired))
            }),
            "catalog:syncInit" | "catalog:sync:init" => self.handle_catalog_sync_init_v2(),

            // Admin commands (ADR-004)
            "master:setup" => self.handle_master_setup(&request.data),
            "admin:erase" => self.handle_admin_erase_v2(&request.data),
            "admin:backup" => self.handle_admin_backup_v2(&request.data),
            "admin:restore" => self.handle_admin_restore_v2(&request.data),

            // Erase (ADR-004/ADR-012)
            "erase:initiate" => self.handle_erase_confirm(&request.data),
            "erase:confirm" => self.handle_erase_confirm(&request.data),
            "erase:execute" => self.handle_erase_execute(&request.data),

            // Local backup/restore (ADR-012)
            "backup:local:start" => self.handle_backup_local_start(&request.data),
            "backup:local:downloadChunk" => self.handle_backup_local_download_chunk(&request.data),
            "backup:local:getMetadata" => self.handle_backup_local_get_metadata(&request.data),
            "backup:local:finish" => self.handle_backup_local_finish(&request.data),
            "backup:local:cancel" => self.handle_backup_local_cancel(&request.data),

            "restore:local:validate" => self.handle_restore_local_validate(&request.data),
            "restore:local:start" => self.handle_restore_local_start(&request.data),
            "restore:local:uploadChunk" => self.handle_restore_local_upload_chunk(&request.data),
            "restore:local:commit" => self.handle_restore_local_commit(&request.data),
            "restore:local:cancel" => self.handle_restore_local_cancel(&request.data),

            "catalog:secret:write" => self.with_session(|s| {
                let node_id = match request.data.get("node_id").and_then(|v| v.as_u64()) {
                    Some(id) => id,
                    None => {
                        return RpcResponse::error(
                            "node_id is required",
                            Some(ErrorCode::EmptyPayload),
                        )
                    }
                };
                let _size = match request.data.get("size").and_then(|v| v.as_u64()) {
                    Some(s) => s,
                    None => {
                        return RpcResponse::error(
                            "size is required",
                            Some(ErrorCode::EmptyPayload),
                        )
                    }
                };
                if let Some(path) = s.catalog().get_path(node_id) {
                    if is_system_path_guarded(&path) {
                        return RpcResponse::error("Access denied", Some(ErrorCode::AccessDenied));
                    }
                }
                RpcResponse::error("No incoming stream", Some(ErrorCode::NoStream))
            }),
            "catalog:secret:read" => self.with_session(|s| {
                let node_id = match request.data.get("node_id").and_then(|v| v.as_u64()) {
                    Some(id) => id,
                    None => {
                        return RpcResponse::error(
                            "node_id is required",
                            Some(ErrorCode::EmptyPayload),
                        )
                    }
                };
                if let Some(path) = s.catalog().get_path(node_id) {
                    if is_system_path_guarded(&path) {
                        return RpcResponse::error("Access denied", Some(ErrorCode::AccessDenied));
                    }
                }
                RpcResponse::error("Streaming required", Some(ErrorCode::StreamRequired))
            }),
            "catalog:secret:erase" => {
                let storage = self.storage.clone();
                self.with_session(|s| handle_catalog_secret_erase(s, &request.data, &storage))
            }

            "catalog:sync:delta" => {
                self.with_session(|s| handle_catalog_sync_delta(s, &request.data))
            }

            "catalog:shard:list" => {
                let storage = self.storage.clone();
                self.with_session(|s| handle_catalog_shard_list_request(s, &request.data, &storage))
            }
            "catalog:shard:load" => {
                let storage = self.storage.clone();
                self.with_session(|s| handle_catalog_shard_load_request(s, &request.data, &storage))
            }
            "catalog:shard:sync" | "catalog:sync:shard" => {
                let storage = self.storage.clone();
                self.with_session(|s| handle_catalog_shard_sync_request(s, &request.data, &storage))
            }
            "catalog:shard:compact" => {
                let shard_id = request
                    .data
                    .get("shard_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if shard_id.is_empty() {
                    return RpcResponse::error(
                        "shard_id is required",
                        Some(ErrorCode::EmptyPayload),
                    );
                }
                if is_system_shard_id_guarded(shard_id) {
                    return RpcResponse::error("Access denied", Some(ErrorCode::AccessDenied));
                }
                let storage = self.storage.clone();
                self.with_session_mut(|s| {
                    handle_catalog_shard_compact_persist(s, &storage, shard_id)
                })
            }

            // Credential provider bridge (ADR-020)
            "credential_provider:status" => self.credential_provider_status(),
            "credential_provider:session:open" => self.credential_provider_open_session(),
            "credential_provider:session:close" => {
                self.credential_provider_close_session(&request.data)
            }
            "credential_provider:list" => self.credential_provider_list(&request.data),
            "credential_provider:search" => self.credential_provider_search(&request.data),
            "credential_provider:getSecret" => self.credential_provider_get_secret(&request.data),
            "credential_provider:recordUse" => self.credential_provider_record_use(&request.data),
            "credential_provider:passkey:create" => {
                self.credential_provider_passkey_stub(&request.data)
            }
            "credential_provider:passkey:get" => {
                self.credential_provider_passkey_stub(&request.data)
            }

            // Unknown command
            _ => RpcResponse::error(
                format!("unknown command: {}", request.command),
                Some(ErrorCode::UnknownCommand),
            ),
        }
    }

    /// Handle an RPC request with an optional incoming stream.
    ///
    /// This is the stream-capable entrypoint (ADR-004). For now it falls back to
    /// the JSON-only handler; stream-aware command implementations will be added
    /// incrementally.
    pub fn handle_with_stream(
        &mut self,
        request: &RpcRequest,
        stream: Option<RpcInputStream>,
    ) -> RpcReply {
        match request.command.as_str() {
            "catalog:upload" => self.handle_catalog_upload_stream(&request.data, stream),
            "catalog:download" => self.handle_catalog_download_stream(&request.data),
            "catalog:secret:write" => {
                self.handle_catalog_secret_write_stream(&request.data, stream)
            }
            "catalog:secret:read" => self.handle_catalog_secret_read_stream(&request.data),
            "passmanager:secret:save" => {
                RpcReply::Json(self.handle_passmanager_secret_save(&request.data))
            }
            "passmanager:group:list" => {
                RpcReply::Json(self.handle_passmanager_group_list(&request.data))
            }
            "passmanager:group:setMeta" => {
                RpcReply::Json(self.handle_passmanager_group_set_meta(&request.data))
            }
            "passmanager:root:export" => {
                RpcReply::Json(self.handle_passmanager_root_export(&request.data))
            }
            "passmanager:icon:put" => {
                RpcReply::Json(self.handle_passmanager_icon_put(&request.data))
            }
            "passmanager:icon:get" => {
                RpcReply::Json(self.handle_passmanager_icon_get(&request.data))
            }
            "passmanager:icon:list" => {
                RpcReply::Json(self.handle_passmanager_icon_list(&request.data))
            }
            "passmanager:icon:gc" => RpcReply::Json(self.handle_passmanager_icon_gc(&request.data)),
            "admin:backup" => self.handle_admin_backup_stream(&request.data),
            "admin:restore" => self.handle_admin_restore_stream(&request.data, stream),
            "vault:export:download" => self.handle_vault_export_download_stream(&request.data),
            _ => RpcReply::Json(self.handle(request)),
        }
    }
}
