//! Bounded source bytes owned by Core, never a caller-supplied path.
use std::fs::File;
use std::io::Write;

use crate::rpc::router::backup_pack::MAX_MANIFEST_TOTAL_BYTES;
use crate::rpc::RpcResponse;

use super::super::super::error::RestoreCommandError;

pub const MAX_RESTORE_APPEND_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LocalRestoreArtifact {
    Metadata,
    MasterSalt,
    MasterVerify,
    Manifest,
    Pack,
}

impl LocalRestoreArtifact {
    pub const ALL: [Self; 5] = [
        Self::Metadata,
        Self::MasterSalt,
        Self::MasterVerify,
        Self::Manifest,
        Self::Pack,
    ];

    pub fn name(self) -> &'static str {
        match self {
            Self::Metadata => "metadata.enc",
            Self::MasterSalt => "master.salt",
            Self::MasterVerify => "master.verify",
            Self::Manifest => "chunks.manifest.json",
            Self::Pack => "chunks.pack",
        }
    }

    /// Older backups use the surviving installation's master material instead.
    pub fn required(self) -> bool {
        !matches!(self, Self::MasterSalt | Self::MasterVerify)
    }

    pub fn byte_limit(self) -> u64 {
        match self {
            Self::Metadata => 64 * 1024,
            Self::MasterSalt => 16,
            Self::MasterVerify => 32,
            Self::Manifest => 16 * 1024 * 1024,
            Self::Pack => MAX_MANIFEST_TOTAL_BYTES,
        }
    }
}

/// Append only on the owning serial worker. Preparation consumes and seals the source;
/// the pack is an unnamed temporary file, removed when its last owned handle closes.
pub struct LocalRestoreInput {
    pub(super) metadata: Vec<u8>,
    pub(super) master_salt: Option<Vec<u8>>,
    pub(super) master_verify: Option<Vec<u8>>,
    pub(super) manifest: Vec<u8>,
    pub(super) pack: File,
    pub(super) pack_size: u64,
}

impl LocalRestoreInput {
    /// Match Core's existing long-running local restore idle policy.
    pub fn idle_timeout() -> std::time::Duration {
        std::time::Duration::from_millis(
            crate::rpc::router::session_lifecycle::LONG_RUNNING_SESSION_IDLE_TTL_MS,
        )
    }

    pub fn new() -> Result<Self, RpcResponse> {
        Ok(Self {
            metadata: Vec::new(),
            master_salt: None,
            master_verify: None,
            manifest: Vec::new(),
            pack: tempfile::tempfile().map_err(|error| io_error(error).into_rpc_response())?,
            pack_size: 0,
        })
    }

    pub fn append(
        &mut self,
        artifact: LocalRestoreArtifact,
        bytes: &[u8],
    ) -> Result<(), RpcResponse> {
        self.append_inner(artifact, bytes)
            .map_err(RestoreCommandError::into_rpc_response)
    }

    fn append_inner(
        &mut self,
        artifact: LocalRestoreArtifact,
        bytes: &[u8],
    ) -> Result<(), RestoreCommandError> {
        if bytes.len() > MAX_RESTORE_APPEND_BYTES {
            return Err(RestoreCommandError::invalid_backup(
                "Restore input chunk exceeds limit",
            ));
        }
        let buffer = match artifact {
            LocalRestoreArtifact::Pack => {
                if bytes.len() as u64 > artifact.byte_limit() - self.pack_size {
                    return Err(RestoreCommandError::invalid_backup(
                        "Restore pack exceeds limit",
                    ));
                }
                self.pack.write_all(bytes).map_err(io_error)?;
                self.pack_size += bytes.len() as u64;
                return Ok(());
            }
            LocalRestoreArtifact::Metadata => &mut self.metadata,
            LocalRestoreArtifact::MasterSalt => self.master_salt.get_or_insert_with(Vec::new),
            LocalRestoreArtifact::MasterVerify => self.master_verify.get_or_insert_with(Vec::new),
            LocalRestoreArtifact::Manifest => &mut self.manifest,
        };
        if bytes.len() as u64 > artifact.byte_limit() - buffer.len() as u64 {
            return Err(RestoreCommandError::invalid_backup(
                "Restore artifact exceeds limit",
            ));
        }
        buffer.extend_from_slice(bytes);
        Ok(())
    }
}

pub(super) fn io_error(error: std::io::Error) -> RestoreCommandError {
    RestoreCommandError::internal(format!("Restore temporary file IO failed: {error}"))
}
