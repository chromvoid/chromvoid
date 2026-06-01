use std::fs::File;
use std::io::{Read, Seek, SeekFrom};

use tar::{Builder as TarBuilder, EntryType, Header as TarHeader, HeaderMode};

use super::super::session_lifecycle::{now_ms, ExpiringSessionMeta};
use super::super::state::RpcRouter;
use super::error::{VaultExportAccessError, VaultExportCommandError, VaultExportResult};
use super::models::VaultExportSession;
use super::request::VaultExportStartRequest;
use crate::storage::StorageTempNamespace;
use crate::types::KEY_SIZE;

const VAULT_EXPORT_TEMP_PREFIX: &str = "chromvoid-export-";
const EXPORT_CHUNK_SIZE: usize = 64 * 1024;

enum VaultExportEntryKind {
    Directory,
    File,
    Symlink { target: String },
    Other,
}

struct VaultExportEntry {
    path: String,
    node_id: u64,
    kind: VaultExportEntryKind,
}

pub(in crate::rpc::router) struct VaultExportStartContext {
    vault_key: [u8; KEY_SIZE],
    entries: Vec<VaultExportEntry>,
}

pub(in crate::rpc::router) struct VaultExportBuildResult {
    pub(in crate::rpc::router) session: VaultExportSession,
    pub(in crate::rpc::router) estimated_size: u64,
    pub(in crate::rpc::router) file_count: u64,
}

pub(in crate::rpc::router) struct VaultExportChunk {
    pub(in crate::rpc::router) chunk_index: u64,
    pub(in crate::rpc::router) bytes: Vec<u8>,
    pub(in crate::rpc::router) is_last: bool,
}

pub(in crate::rpc::router) struct VaultExportStream {
    pub(in crate::rpc::router) file: File,
    pub(in crate::rpc::router) file_size: u64,
    pub(in crate::rpc::router) chunk_size: u32,
    pub(in crate::rpc::router) name: String,
    pub(in crate::rpc::router) mime_type: String,
}

impl RpcRouter {
    pub(in crate::rpc::router) fn collect_vault_export_start_context(
        &self,
    ) -> VaultExportResult<VaultExportStartContext> {
        let session = self
            .session
            .as_ref()
            .ok_or_else(VaultExportCommandError::vault_not_unlocked)?;
        let vault_key = *session.vault_key();

        fn walk(node: &crate::catalog::CatalogNode, ids: &mut Vec<u64>) {
            for child in node.children() {
                ids.push(child.node_id);
                walk(child, ids);
            }
        }

        let mut ids = Vec::new();
        walk(session.catalog().root(), &mut ids);

        let mut entries: Vec<_> = ids
            .into_iter()
            .filter_map(|node_id| {
                let path = session.catalog().get_path(node_id)?;
                if path.is_empty() {
                    return None;
                }
                let node = session.catalog().find_by_id(node_id)?;
                let kind = if node.is_dir() {
                    VaultExportEntryKind::Directory
                } else if node.is_file() {
                    VaultExportEntryKind::File
                } else if node.is_symlink() {
                    VaultExportEntryKind::Symlink {
                        target: node.link_to.clone().unwrap_or_default(),
                    }
                } else {
                    VaultExportEntryKind::Other
                };
                Some(VaultExportEntry {
                    path,
                    node_id,
                    kind,
                })
            })
            .collect();
        entries.sort_by(|a, b| a.path.cmp(&b.path));

        Ok(VaultExportStartContext { vault_key, entries })
    }

    pub(in crate::rpc::router) fn build_vault_export(
        &mut self,
        context: VaultExportStartContext,
        request: VaultExportStartRequest,
    ) -> VaultExportResult<VaultExportBuildResult> {
        if let Err(e) = self
            .storage
            .cleanup_temp_namespace(StorageTempNamespace::VaultExport)
            .and_then(|_| {
                self.storage
                    .cleanup_legacy_temp_files(StorageTempNamespace::VaultExport)
                    .map(|_| ())
            })
        {
            return Err(VaultExportCommandError::internal(format!(
                "Failed to clean stale export temp files: {}",
                e
            )));
        }

        let ts = now_ms();
        let export_id = format!("export-{}", ts);
        let vault_key = &context.vault_key;

        let mut temp_file = match self.storage.create_temp_file(
            StorageTempNamespace::VaultExport,
            VAULT_EXPORT_TEMP_PREFIX,
            ".tar",
        ) {
            Ok(f) => f,
            Err(e) => {
                return Err(VaultExportCommandError::internal(format!(
                    "Failed to create export temp file: {}",
                    e
                )))
            }
        };

        let mut file_count: u64 = 0;

        {
            let mut tar = TarBuilder::new(temp_file.as_file_mut());
            tar.mode(HeaderMode::Deterministic);

            for entry in &context.entries {
                if !matches!(entry.kind, VaultExportEntryKind::Directory) {
                    continue;
                }
                let tar_path = format!("{}/", entry.path);

                let mut header = TarHeader::new_gnu();
                if let Err(e) = header.set_path(&tar_path) {
                    return Err(VaultExportCommandError::internal(format!(
                        "Invalid export path {}: {}",
                        tar_path, e
                    )));
                }
                header.set_entry_type(EntryType::Directory);
                header.set_mode(0o755);
                header.set_uid(0);
                header.set_gid(0);
                header.set_mtime(0);
                header.set_size(0);
                header.set_cksum();

                if let Err(e) = tar.append(&header, std::io::empty()) {
                    return Err(VaultExportCommandError::internal(format!(
                        "Failed to append dir {}: {}",
                        tar_path, e
                    )));
                }
            }

            for entry in &context.entries {
                let bytes: Vec<u8> = match &entry.kind {
                    VaultExportEntryKind::File => self
                        .read_file_plain(vault_key, entry.node_id)
                        .map_err(|error| {
                            VaultExportCommandError::from_plain_blob_read_error(
                                error,
                                "Failed to read export file",
                            )
                        })?,
                    VaultExportEntryKind::Symlink { target } => target.as_bytes().to_vec(),
                    VaultExportEntryKind::Other => Vec::new(),
                    VaultExportEntryKind::Directory => continue,
                };

                let mut header = TarHeader::new_gnu();
                if let Err(e) = header.set_path(&entry.path) {
                    return Err(VaultExportCommandError::internal(format!(
                        "Invalid export path {}: {}",
                        entry.path, e
                    )));
                }
                header.set_entry_type(EntryType::Regular);
                header.set_mode(0o644);
                header.set_uid(0);
                header.set_gid(0);
                header.set_mtime(0);
                header.set_size(bytes.len() as u64);
                header.set_cksum();

                if let Err(e) = tar.append(&header, bytes.as_slice()) {
                    return Err(VaultExportCommandError::internal(format!(
                        "Failed to append file {}: {}",
                        entry.path, e
                    )));
                }

                file_count = file_count.saturating_add(1);
            }

            if request.include_otp_secrets {
                let mut items: Vec<serde_json::Value> = Vec::new();
                for entry in &context.entries {
                    let chunk_name = crate::crypto::otp_chunk_name(vault_key, entry.node_id);
                    if !self.storage.chunk_exists(&chunk_name).ok().unwrap_or(false) {
                        continue;
                    }
                    let encrypted = match self.storage.read_chunk(&chunk_name) {
                        Ok(b) => b,
                        Err(_) => continue,
                    };
                    let plain = match crate::crypto::decrypt(
                        &encrypted,
                        vault_key,
                        chunk_name.as_bytes(),
                    ) {
                        Ok(p) => p,
                        Err(_) => continue,
                    };
                    let secrets: crate::rpc::types::OtpSecrets =
                        match serde_json::from_slice(&plain) {
                            Ok(s) => s,
                            Err(_) => continue,
                        };
                    if secrets.secrets.is_empty() {
                        continue;
                    }
                    items.push(serde_json::json!({
                        "node_id": entry.node_id,
                        "path": entry.path,
                        "secrets": secrets.secrets,
                    }));
                }

                let otp_plain = match serde_json::to_vec(&items) {
                    Ok(b) => b,
                    Err(e) => {
                        return Err(VaultExportCommandError::internal(format!(
                            "Failed to serialize OTP secrets: {}",
                            e
                        )))
                    }
                };
                let otp_path = "otp/secrets.json";
                let mut header = TarHeader::new_gnu();
                if let Err(e) = header.set_path(otp_path) {
                    return Err(VaultExportCommandError::internal(format!(
                        "Invalid export path {}: {}",
                        otp_path, e
                    )));
                }
                header.set_entry_type(EntryType::Regular);
                header.set_mode(0o600);
                header.set_uid(0);
                header.set_gid(0);
                header.set_mtime(0);
                header.set_size(otp_plain.len() as u64);
                header.set_cksum();
                if let Err(e) = tar.append(&header, otp_plain.as_slice()) {
                    return Err(VaultExportCommandError::internal(format!(
                        "Failed to append OTP secrets: {}",
                        e
                    )));
                }
                file_count = file_count.saturating_add(1);
            }

            if let Err(e) = tar.finish() {
                return Err(VaultExportCommandError::internal(format!(
                    "Failed to finish tar: {}",
                    e
                )));
            }
        }
        if let Err(e) = temp_file.sync_file_and_parent() {
            return Err(VaultExportCommandError::internal(format!(
                "Failed to sync export file: {}",
                e
            )));
        }

        let file_size = match temp_file.as_file().metadata() {
            Ok(meta) => meta.len(),
            Err(e) => {
                return Err(VaultExportCommandError::internal(format!(
                    "Failed to read export file metadata: {}",
                    e
                )))
            }
        };

        let file_hash = match temp_file.reopen() {
            Ok(file) => match crate::crypto::sha256_hex_reader(file) {
                Ok(hash) => hash,
                Err(e) => {
                    return Err(VaultExportCommandError::internal(format!(
                        "Failed to hash export file: {}",
                        e
                    )))
                }
            },
            Err(e) => {
                return Err(VaultExportCommandError::internal(format!(
                    "Failed to reopen export file: {}",
                    e
                )))
            }
        };

        let temp_file = temp_file.into_artifact();
        let session = VaultExportSession {
            id: export_id,
            meta: ExpiringSessionMeta::new(ts),
            temp_file,
            file_size,
            file_hash,
            file_count,
            included_otp_secrets: request.include_otp_secrets,
            chunk_size: EXPORT_CHUNK_SIZE,
        };

        Ok(VaultExportBuildResult {
            estimated_size: file_size,
            file_count,
            session,
        })
    }

    pub(in crate::rpc::router) fn read_vault_export_chunk(
        &self,
        session: &VaultExportSession,
        chunk_index: u64,
    ) -> Result<VaultExportChunk, VaultExportAccessError> {
        let chunk_size = session.chunk_size;
        let total = session.file_size as usize;
        let chunk_count = if total == 0 {
            0
        } else {
            (total + chunk_size - 1) / chunk_size
        };
        if chunk_index as usize >= chunk_count {
            return Err(VaultExportAccessError::Response(
                VaultExportCommandError::node_not_found("chunk_index out of range"),
            ));
        }

        let start = chunk_index * (chunk_size as u64);
        let end = std::cmp::min(start + chunk_size as u64, session.file_size);

        let mut file = match session.temp_file.open() {
            Ok(f) => f,
            Err(e) => {
                return Err(VaultExportAccessError::BrokenSession(
                    VaultExportCommandError::internal(format!("Failed to open export file: {}", e)),
                ))
            }
        };
        if let Err(e) = file.seek(SeekFrom::Start(start)) {
            return Err(VaultExportAccessError::BrokenSession(
                VaultExportCommandError::internal(format!("Failed to seek export file: {}", e)),
            ));
        }

        let mut bytes = vec![0u8; (end - start) as usize];
        if let Err(e) = file.read_exact(&mut bytes) {
            return Err(VaultExportAccessError::BrokenSession(
                VaultExportCommandError::internal(format!("Failed to read export file: {}", e)),
            ));
        }

        Ok(VaultExportChunk {
            chunk_index,
            bytes,
            is_last: (chunk_index as usize) + 1 == chunk_count,
        })
    }

    pub(in crate::rpc::router) fn open_vault_export_stream(
        &self,
        session: &VaultExportSession,
    ) -> Result<VaultExportStream, VaultExportAccessError> {
        let file = match session.temp_file.open() {
            Ok(file) => file,
            Err(e) => {
                return Err(VaultExportAccessError::BrokenSession(
                    VaultExportCommandError::internal(format!("Failed to open export file: {}", e)),
                ))
            }
        };

        let chunk_size = match u32::try_from(session.chunk_size) {
            Ok(value) => value,
            Err(_) => {
                return Err(VaultExportAccessError::Response(
                    VaultExportCommandError::internal("Invalid chunk size"),
                ))
            }
        };

        Ok(VaultExportStream {
            file,
            file_size: session.file_size,
            chunk_size,
            name: format!("{}.tar", session.id),
            mime_type: "application/x-tar".to_string(),
        })
    }
}
