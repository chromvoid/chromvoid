//! RPC command dispatch — routes incoming requests to domain handlers

use crate::error::ErrorCode;
use crate::rpc::commands::{
    handle_catalog_shard_compact_request, handle_catalog_shard_list_request,
    handle_catalog_shard_load_request, handle_catalog_shard_sync_request, *,
};
use crate::rpc::stream::{RpcInputStream, RpcReply};
use crate::rpc::types::{CoreCapabilitiesResponse, RpcRequest, RpcResponse, PROTOCOL_VERSION};

use super::state::RpcRouter;
use crate::rpc::request_parse::{required_str, required_u64};

fn require_stream_node_gate(
    session: &crate::vault::VaultSession,
    data: &serde_json::Value,
    require_size: bool,
) -> Result<(), RpcResponse> {
    let node_id = required_u64(data, "node_id")?;
    if require_size {
        let _ = required_u64(data, "size")?;
    }
    if let Some(path) = session.catalog().get_path(node_id) {
        if is_system_path_guarded(&path) {
            return Err(RpcResponse::error(
                "Access denied",
                Some(ErrorCode::AccessDenied),
            ));
        }
    }
    Ok(())
}

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

        if request.command.starts_with("wallet:") {
            let started_at = std::time::Instant::now();
            let response = match request.command.as_str() {
                "wallet:status" => self.handle_wallet_status(&request.data),
                "wallet:list" => self.handle_wallet_list(&request.data),
                "wallet:hd:generateMnemonic" => {
                    self.handle_wallet_hd_generate_mnemonic(&request.data)
                }
                "wallet:hd:create" => self.handle_wallet_hd_create(&request.data),
                "wallet:import:create" => self.handle_wallet_import_create(&request.data),
                "wallet:accounts:list" => self.handle_wallet_accounts_list(&request.data),
                "wallet:accounts:derive" => self.handle_wallet_accounts_derive(&request.data),
                "wallet:addresses:derive" => self.handle_wallet_addresses_derive(&request.data),
                "wallet:balance:get" => self.handle_wallet_balance_get(&request.data),
                "wallet:transaction:quote" => self.handle_wallet_transaction_quote(&request.data),
                "wallet:transaction:prepare" => {
                    self.handle_wallet_transaction_prepare(&request.data)
                }
                "wallet:transaction:confirm" => {
                    self.handle_wallet_transaction_confirm(&request.data)
                }
                "wallet:transaction:cancel" => self.handle_wallet_transaction_cancel(&request.data),
                "wallet:transaction:rebroadcast" => {
                    self.handle_wallet_transaction_rebroadcast(&request.data)
                }
                "wallet:transactions:list" => self.handle_wallet_transactions_list(&request.data),
                "wallet:transactions:refresh" => {
                    self.handle_wallet_transactions_refresh(&request.data)
                }
                "wallet:transactions:sync" => self.handle_wallet_transactions_sync(&request.data),
                "wallet:backup:export" => self.handle_wallet_backup_export(&request.data),
                "wallet:ton:rotateKey" => self.handle_wallet_ton_rotate_key(&request.data),
                "wallet:spendAuthorization:create" => {
                    self.handle_wallet_spend_authorization_create(&request.data)
                }
                "wallet:spendAuthorization:revoke" => {
                    self.handle_wallet_spend_authorization_revoke(&request.data)
                }
                "wallet:addressBook:list" => self.handle_wallet_address_book_list(&request.data),
                "wallet:addressBook:create" => {
                    self.handle_wallet_address_book_create(&request.data)
                }
                "wallet:addressBook:update" => {
                    self.handle_wallet_address_book_update(&request.data)
                }
                "wallet:addressBook:delete" => {
                    self.handle_wallet_address_book_delete(&request.data)
                }
                "wallet:address:detect" => self.handle_wallet_address_detect(&request.data),
                _ => RpcResponse::error(
                    format!("Unknown command: {}", request.command),
                    Some(ErrorCode::InternalError),
                ),
            };
            return self.observe_wallet_rpc_response(&request.command, started_at, response);
        }

        if let Err(response) = self.guard_storage_command(&request.command) {
            return response;
        }

        // Route command
        match request.command.as_str() {
            // System commands (no vault required)
            "ping" => handle_ping(&request.data),
            "pong" => handle_pong(&request.data),
            "core:capabilities" => RpcResponse::success(CoreCapabilitiesResponse {
                protocol_version: PROTOCOL_VERSION,
                features: self.core_capability_features(),
            }),

            // Vault commands
            "vault:unlock" => self.handle_vault_unlock(&request.data),
            "vault:repair:diagnose" => self.handle_vault_repair_diagnose(&request.data),
            "vault:repair:apply" => self.handle_vault_repair_apply(&request.data),
            "vault:lock" => self.handle_vault_lock(),
            "vault:status" => handle_vault_status(self.session.as_ref()),
            "vault:rekey" => self.handle_vault_rekey(&request.data, &|| false, &mut |_| {}),
            "master:rekey" => self.handle_master_rekey(&request.data),

            // Portable Vault Env Runtime domain. Resolved env values are never
            // exposed here; spawn resolution is a typed local-only method.
            "env_runtime:status" => self.handle_env_runtime_status(&request.data),
            "env_runtime:secret:list" => self.handle_env_runtime_secret_list(&request.data),
            "env_runtime:secret:create" => self.handle_env_runtime_secret_create(&request.data),
            "env_runtime:secret:update" => self.handle_env_runtime_secret_update(&request.data),
            "env_runtime:secret:delete" => self.handle_env_runtime_secret_delete(&request.data),
            "env_runtime:secret:reveal" => self.handle_env_runtime_secret_reveal(&request.data),
            "env_runtime:profile:list" => self.handle_env_runtime_profile_list(&request.data),
            "env_runtime:profile:get" => self.handle_env_runtime_profile_get(&request.data),
            "env_runtime:profile:create" => self.handle_env_runtime_profile_create(&request.data),
            "env_runtime:profile:update" => self.handle_env_runtime_profile_update(&request.data),
            "env_runtime:profile:delete" => self.handle_env_runtime_profile_delete(&request.data),

            // Vault export (ADR-004/ADR-012)
            "vault:export:start" => self.handle_vault_export_start(&request.data),
            "vault:export:downloadChunk" => self.handle_vault_export_download_chunk(&request.data),
            "vault:export:download" => {
                let _export_id = match required_str(&request.data, "export_id") {
                    Ok(export_id) => export_id,
                    Err(response) => return response,
                };
                RpcResponse::error("Streaming required", Some(ErrorCode::StreamRequired))
            }
            "vault:export:finish" => self.handle_vault_export_finish(&request.data),

            // Catalog commands (vault required)
            "catalog:list" => {
                let storage = self.storage.clone();
                self.with_session_mut(|s| handle_catalog_list(s, &request.data, &storage))
            }
            "catalog:sync:manifest" => {
                let storage = self.storage.clone();
                self.with_session(|s| {
                    handle_catalog_sync_manifest_request(s, &request.data, &storage)
                })
            }
            "catalog:folder:list" => {
                let storage = self.storage.clone();
                self.with_session(|s| handle_catalog_folder_list(s, &storage, &request.data))
            }
            "catalog:folder:batch" => {
                let storage = self.storage.clone();
                self.with_session(|s| handle_catalog_folder_batch(s, &storage, &request.data))
            }
            "catalog:notes:list" => {
                let storage = self.storage.clone();
                self.with_session(|s| handle_catalog_notes_list(s, &storage))
            }
            "catalog:file-links:complete" => {
                self.with_session(|s| handle_catalog_file_links_complete(s, &request.data))
            }
            "catalog:file-links:resolve" => {
                self.with_session(|s| handle_catalog_file_links_resolve(s, &request.data))
            }
            "catalog:document:resolve-link" => {
                self.with_session(|s| handle_catalog_document_link(s, &request.data))
            }
            "catalog:attachment:prepare" => self
                .commit_catalog_mutation(|s| handle_catalog_attachment_prepare(s, &request.data)),
            "catalog:createDir" => {
                self.commit_catalog_mutation(|s| handle_catalog_create_dir(s, &request.data))
            }
            "catalog:rename" => {
                self.commit_catalog_mutation(|s| handle_catalog_rename(s, &request.data))
            }
            "catalog:delete" => self.commit_catalog_mutation_with_output(
                |s| handle_catalog_delete_with_cleanup(s, &request.data),
                |session, storage, derivative_index_state, cleanup| {
                    let _ = cleanup.cleanup_derivatives(
                        storage,
                        session.vault_key(),
                        derivative_index_state,
                    );
                },
            ),
            "catalog:move" => self.commit_catalog_mutation_with_output(
                |s| handle_catalog_move_with_cleanup(s, &request.data),
                |session, storage, derivative_index_state, cleanup| {
                    let _ = cleanup.cleanup_derivatives(
                        storage,
                        session.vault_key(),
                        derivative_index_state,
                    );
                },
            ),
            "catalog:trash" => {
                let storage = self.storage.clone();
                self.commit_catalog_mutation(|s| handle_catalog_trash(s, &request.data, &storage))
            }
            "catalog:trash:list" => {
                let storage = self.storage.clone();
                self.with_session_mut(|s| handle_catalog_trash_list(s, &storage))
            }
            "catalog:trash:restore" => {
                let storage = self.storage.clone();
                self.commit_catalog_mutation(|s| {
                    handle_catalog_trash_restore(s, &request.data, &storage)
                })
            }
            "catalog:trash:empty" => {
                let storage = self.storage.clone();
                self.commit_catalog_mutation_with_output(
                    |s| handle_catalog_trash_empty_with_cleanup(s, &request.data, &storage),
                    |session, storage, derivative_index_state, cleanup| {
                        let _ = cleanup.cleanup_derivatives(
                            storage,
                            session.vault_key(),
                            derivative_index_state,
                        );
                    },
                )
            }
            "catalog:exchange" => {
                self.commit_catalog_mutation(|s| handle_catalog_exchange(s, &request.data))
            }
            "catalog:source:metadata" => {
                self.commit_catalog_mutation(|s| handle_catalog_source_metadata(s, &request.data))
            }
            "catalog:media:inspect" => match self.handle_catalog_media_inspect(&request.data) {
                RpcReply::Json(response) => response,
                RpcReply::Stream(_) | RpcReply::RangeStream(_) => RpcResponse::error(
                    "Unexpected media inspect stream",
                    Some(ErrorCode::InternalError),
                ),
            },
            "catalog:derivative:stats" => match self.session.as_ref() {
                Some(session) => handle_catalog_derivative_stats(
                    session,
                    &self.storage,
                    self.derivative_index_state.as_ref(),
                ),
                None => RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultRequired)),
            },
            "catalog:derivative:compact" => match self.session.as_ref() {
                Some(session) => handle_catalog_derivative_compact(
                    session,
                    &request.data,
                    &self.storage,
                    self.derivative_index_state.as_ref(),
                ),
                None => RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultRequired)),
            },

            // PassManager domain commands (ADR-028): scoped access to /.passmanager only.
            "passmanager:secret:save" => self.handle_passmanager_secret_save(&request.data),
            "passmanager:secret:read" => self.handle_passmanager_secret_read(&request.data),
            "passmanager:secret:delete" => self.handle_passmanager_secret_delete(&request.data),
            "passmanager:ssh:key:import" => self.handle_passmanager_ssh_import(&request.data),
            "passmanager:ssh:key:export" => self.handle_passmanager_ssh_export(&request.data),
            "passmanager:ssh:keygen" => self.handle_passmanager_ssh_keygen(&request.data),
            "passmanager:ssh:page" => self.handle_passmanager_ssh_page(&request.data),
            "passmanager:ssh:key:edit" => self.handle_passmanager_ssh_edit(&request.data),
            "passmanager:ssh:list" => self.handle_passmanager_ssh_list(&request.data),
            "passmanager:ssh:key:update" => self.handle_passmanager_ssh_key_update(&request.data),
            "passmanager:ssh:key:delete" => self.handle_passmanager_ssh_key_delete(&request.data),
            "passmanager:ssh:secret:read" => self.handle_passmanager_ssh_secret_read(&request.data),
            "passmanager:ssh:secret:save" => self.handle_passmanager_ssh_secret_save(&request.data),
            "passmanager:ssh:secret:delete" => {
                self.handle_passmanager_ssh_secret_delete(&request.data)
            }
            "passmanager:tag:page" => self.handle_passmanager_tag_page(&request.data),
            "passmanager:tag:save" => self.handle_passmanager_tag_save(&request.data),
            "passmanager:tag:delete" => self.handle_passmanager_tag_delete(&request.data),
            "passmanager:group:page" => self.handle_passmanager_group_page(&request.data),
            "passmanager:group:rename" => self.handle_passmanager_group_rename(&request.data),
            "passmanager:group:ensure" => self.handle_passmanager_group_ensure(&request.data),
            "passmanager:group:setMeta" => self.handle_passmanager_group_set_meta(&request.data),
            "passmanager:group:list" => self.handle_passmanager_group_list(&request.data),
            "passmanager:group:delete" => self.handle_passmanager_group_delete(&request.data),
            "passmanager:tags:setCatalog" => {
                self.handle_passmanager_tags_set_catalog(&request.data)
            }
            "passmanager:import:limits"
            | "passmanager:import:start"
            | "passmanager:import:append"
            | "passmanager:import:review"
            | "passmanager:import:commit"
            | "passmanager:import:cancel" => {
                self.handle_passmanager_import(&request.command, &request.data)
            }
            "passmanager:root:import:preview" => {
                self.handle_passmanager_root_import_preview(&request.data)
            }
            "passmanager:root:import" => self.handle_passmanager_root_import(&request.data),
            "passmanager:root:export" => self.handle_passmanager_root_export(&request.data),
            "passmanager:icon:put" => self.handle_passmanager_icon_put(&request.data),
            "passmanager:icon:get" => self.handle_passmanager_icon_get(&request.data),
            "passmanager:icon:getMany" => self.handle_passmanager_icon_get_many(&request.data),
            "passmanager:icon:list" => self.handle_passmanager_icon_list(&request.data),
            "passmanager:icon:setMeta" => self.handle_passmanager_icon_set_meta(&request.data),
            "passmanager:icon:gc" => self.handle_passmanager_icon_gc(&request.data),
            "passmanager:securityAudit:page" => {
                self.handle_passmanager_security_audit_page(&request.data)
            }
            "passmanager:securityAudit:get" => {
                self.handle_passmanager_security_audit_get(&request.data)
            }
            "passmanager:securityAudit:set" => {
                self.handle_passmanager_security_audit_set(&request.data)
            }
            "passmanager:otp:setSecret" => self.handle_passmanager_otp_set_secret(&request.data),
            "passmanager:password:generate" => {
                self.handle_passmanager_password_generate(&request.data)
            }
            "passmanager:otp:parseUri" => self.handle_passmanager_otp_parse_uri(&request.data),
            "passmanager:otp:record:list" => self.handle_passmanager_otp_record_list(&request.data),
            "passmanager:otp:record:save" => self.handle_passmanager_otp_record_save(&request.data),
            "passmanager:otp:record:delete" => {
                self.handle_passmanager_otp_record_delete(&request.data)
            }
            "passmanager:otp:record:code" => self.handle_passmanager_otp_record_code(&request.data),
            "passmanager:otp:generate" => self.handle_passmanager_otp_generate(&request.data),
            "passmanager:otp:preview" => self.handle_passmanager_otp_preview(&request.data),
            "passmanager:otp:removeSecret" => {
                self.handle_passmanager_otp_remove_secret(&request.data)
            }
            "passmanager:otp:renameSecret" => {
                self.handle_passmanager_otp_rename_secret(&request.data)
            }

            // Passkeys domain commands (ADR-034): scoped access to /.passkeys only.
            "passkeys:list" => self.handle_passkeys_list(),
            "passkeys:delete" => self.handle_passkeys_delete(&request.data),
            "passmanager:entry:create" => self.handle_passmanager_entry_create(&request.data),
            "passmanager:entry:save" => self.handle_passmanager_entry_save(&request.data),
            "passmanager:entry:read" => self.handle_passmanager_entry_read(&request.data),
            "passmanager:entry:delete" => self.handle_passmanager_entry_delete(&request.data),
            "passmanager:entry:move" => self.handle_passmanager_entry_move(&request.data),
            "passmanager:entry:rename" => self.handle_passmanager_entry_rename(&request.data),
            "passmanager:entry:websites:read" => {
                self.handle_passmanager_website_read(&request.data)
            }
            "passmanager:entry:websites:validate" => {
                self.handle_passmanager_website_validate(&request.data)
            }
            "passmanager:entry:websites:update" => {
                self.handle_passmanager_website_update(&request.data)
            }
            "passmanager:entry:detail" => self.handle_passmanager_entry_detail(&request.data),
            "passmanager:entry:update" => self.handle_passmanager_entry_update(&request.data),
            "passmanager:entry:page" => self.handle_passmanager_entry_page(&request.data),
            "passmanager:entry:list" => self.handle_passmanager_entry_list(&request.data),

            // ADR-004: subscription commands (no-op in Core; embedding layer consumes events)
            "catalog:subscribe" => {
                if self.session.is_none() {
                    return RpcResponse::error(
                        "Vault not unlocked",
                        Some(ErrorCode::VaultRequired),
                    );
                }
                self.event_queue.subscribe_catalog();
                RpcResponse::success(serde_json::Value::Null)
            }
            "catalog:unsubscribe" => {
                if self.session.is_none() {
                    return RpcResponse::error(
                        "Vault not unlocked",
                        Some(ErrorCode::VaultRequired),
                    );
                }
                self.event_queue.unsubscribe_catalog();
                RpcResponse::success(serde_json::Value::Null)
            }
            // ADR-004: catalog:upload is STREAM
            "catalog:upload" => match self.handle_catalog_upload_stream(&request.data, None) {
                RpcReply::Json(response) => response,
                RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
                    RpcResponse::error("Unexpected upload stream", Some(ErrorCode::InternalError))
                }
            },
            "catalog:upload:abort" => self.handle_catalog_upload_abort(&request.data),
            "catalog:file:replace" => self.with_session(|s| {
                if let Err(response) = require_stream_node_gate(s, &request.data, true) {
                    return response;
                }
                RpcResponse::error("No incoming stream", Some(ErrorCode::NoStream))
            }),
            "catalog:file:patch" => self.handle_catalog_file_patch(&request.data),

            // ADR-004: catalog:download is STREAM
            "catalog:download" => self.with_session(|s| {
                if let Err(response) = require_stream_node_gate(s, &request.data, false) {
                    return response;
                }
                RpcResponse::error("Streaming required", Some(ErrorCode::StreamRequired))
            }),
            "catalog:downloadRange" => self.with_session(|s| {
                if let Err(response) = require_stream_node_gate(s, &request.data, false) {
                    return response;
                }
                RpcResponse::error("Streaming required", Some(ErrorCode::StreamRequired))
            }),
            // Admin commands (ADR-004)
            "master:setup" => self.handle_master_setup(&request.data),
            "admin:erase" => self.handle_admin_erase_v2(&request.data),
            "admin:backup" => self.handle_admin_backup_v2(&request.data),
            "admin:restore" => self.handle_admin_restore_v2(&request.data),
            "admin:storage:gc:scan" => self.handle_admin_storage_gc_scan(&request.data),
            "admin:storage:gc:delete" => self.handle_admin_storage_gc_delete(&request.data),

            // Erase (ADR-004/ADR-012)
            "erase:initiate" => self.handle_erase_confirm(&request.data),
            "erase:confirm" => self.handle_erase_confirm(&request.data),
            "erase:execute" => self.handle_erase_execute(&request.data),

            // Local backup/restore (ADR-012)
            "backup:local:start" => self.handle_backup_local_start(&request.data),
            "backup:local:downloadChunk" => self.handle_backup_local_download_chunk(&request.data),
            "backup:local:getChunkManifest" => {
                self.handle_backup_local_get_chunk_manifest(&request.data)
            }
            "backup:local:getMetadata" => self.handle_backup_local_get_metadata(&request.data),
            "backup:local:downloadPack" => {
                RpcResponse::error("Streaming required", Some(ErrorCode::StreamRequired))
            }
            "backup:local:finish" => self.handle_backup_local_finish(&request.data),
            "backup:local:cancel" => self.handle_backup_local_cancel(&request.data),

            "restore:local:validate" => self.handle_restore_local_validate(&request.data),
            "restore:local:validatePayload" => {
                self.handle_restore_local_validate_payload(&request.data)
            }
            "restore:local:validateMasterMaterial" => {
                self.handle_restore_local_validate_master_material(&request.data)
            }
            "restore:local:start" => self.handle_restore_local_start(&request.data),
            "restore:local:uploadPack" => {
                RpcResponse::error("No incoming stream", Some(ErrorCode::NoStream))
            }
            "restore:local:commit" => self.handle_restore_local_commit(&request.data),
            "restore:local:cancel" => self.handle_restore_local_cancel(&request.data),

            "catalog:secret:write" => self.with_session(|s| {
                if let Err(response) = require_stream_node_gate(s, &request.data, true) {
                    return response;
                }
                RpcResponse::error("No incoming stream", Some(ErrorCode::NoStream))
            }),
            "catalog:secret:read" => self.with_session(|s| {
                if let Err(response) = require_stream_node_gate(s, &request.data, false) {
                    return response;
                }
                RpcResponse::error("Streaming required", Some(ErrorCode::StreamRequired))
            }),
            "catalog:derivative:write" => self.with_session(|s| {
                if let Err(response) = require_stream_node_gate(s, &request.data, true) {
                    return response;
                }
                RpcResponse::error("No incoming stream", Some(ErrorCode::NoStream))
            }),
            "catalog:derivative:read" => self.with_session(|s| {
                if let Err(response) = require_stream_node_gate(s, &request.data, false) {
                    return response;
                }
                RpcResponse::error("Streaming required", Some(ErrorCode::StreamRequired))
            }),
            "catalog:secret:erase" => {
                let storage = self.storage.clone();
                let derivative_index_state = std::sync::Arc::clone(&self.derivative_index_state);
                match self.session.as_mut() {
                    Some(session) => handle_catalog_secret_erase(
                        session,
                        &request.data,
                        &storage,
                        derivative_index_state.as_ref(),
                    ),
                    None => {
                        RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultRequired))
                    }
                }
            }

            "catalog:shard:list" => {
                let storage = self.storage.clone();
                self.with_session(|s| handle_catalog_shard_list_request(s, &request.data, &storage))
            }
            "catalog:shard:load" => {
                let storage = self.storage.clone();
                self.with_session(|s| handle_catalog_shard_load_request(s, &request.data, &storage))
            }
            "catalog:sync:shard" => {
                let storage = self.storage.clone();
                self.with_session(|s| handle_catalog_shard_sync_request(s, &request.data, &storage))
            }
            "catalog:shard:compact" => {
                let storage = self.storage.clone();
                self.with_session_mut(|s| {
                    handle_catalog_shard_compact_request(s, &request.data, &storage)
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
            "credential_provider:getOneTimeCode" => {
                self.credential_provider_get_one_time_code(&request.data)
            }
            "credential_provider:recordUse" => self.credential_provider_record_use(&request.data),
            "credential_provider:passkey:create" => {
                self.credential_provider_passkey_create(&request.data)
            }
            "credential_provider:passkey:get" => {
                self.credential_provider_passkey_get(&request.data)
            }
            "credential_provider:passkey:query" => {
                self.credential_provider_passkey_query(&request.data)
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
        if let Err(response) = self.guard_storage_command(&request.command) {
            return RpcReply::Json(response);
        }
        match request.command.as_str() {
            "catalog:upload" => self.handle_catalog_upload_stream(&request.data, stream),
            "catalog:file:replace" => {
                self.handle_catalog_file_replace_stream(&request.data, stream)
            }
            "catalog:download" => self.handle_catalog_download_stream(&request.data),
            "catalog:downloadRange" => self.handle_catalog_download_range_stream(&request.data),
            "catalog:secret:write" => {
                self.handle_catalog_secret_write_stream(&request.data, stream)
            }
            "catalog:secret:read" => self.handle_catalog_secret_read_stream(&request.data),
            "catalog:derivative:write" => {
                self.handle_catalog_derivative_write_stream(&request.data, stream)
            }
            "catalog:derivative:read" => self.handle_catalog_derivative_read_stream(&request.data),
            "passmanager:secret:save" => {
                RpcReply::Json(self.handle_passmanager_secret_save(&request.data))
            }
            "passmanager:group:list" => {
                RpcReply::Json(self.handle_passmanager_group_list(&request.data))
            }
            "passmanager:group:delete" => {
                RpcReply::Json(self.handle_passmanager_group_delete(&request.data))
            }
            "passmanager:group:setMeta" => {
                RpcReply::Json(self.handle_passmanager_group_set_meta(&request.data))
            }
            "passmanager:tags:setCatalog" => {
                RpcReply::Json(self.handle_passmanager_tags_set_catalog(&request.data))
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
            "passmanager:icon:getMany" => {
                RpcReply::Json(self.handle_passmanager_icon_get_many(&request.data))
            }
            "passmanager:icon:list" => {
                RpcReply::Json(self.handle_passmanager_icon_list(&request.data))
            }
            "passmanager:icon:setMeta" => {
                RpcReply::Json(self.handle_passmanager_icon_set_meta(&request.data))
            }
            "passmanager:icon:gc" => RpcReply::Json(self.handle_passmanager_icon_gc(&request.data)),
            "passmanager:securityAudit:get" => {
                RpcReply::Json(self.handle_passmanager_security_audit_get(&request.data))
            }
            "passmanager:securityAudit:set" => {
                RpcReply::Json(self.handle_passmanager_security_audit_set(&request.data))
            }
            "admin:backup" => self.handle_admin_backup_stream(&request.data),
            "admin:restore" => self.handle_admin_restore_stream(&request.data, stream),
            "backup:local:downloadPack" => self.handle_backup_local_download_pack(&request.data),
            "restore:local:uploadPack" => {
                self.handle_restore_local_upload_pack(&request.data, stream)
            }
            "vault:export:download" => self.handle_vault_export_download_stream(&request.data),
            _ => RpcReply::Json(self.handle(request)),
        }
    }
}
