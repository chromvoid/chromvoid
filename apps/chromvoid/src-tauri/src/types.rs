use chromvoid_core::rpc::RpcStreamMeta;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing_appender::non_blocking::WorkerGuard;

use crate::mobile;

// ── Data structs ──────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct StorageConfig {
    pub(crate) storage_root: String,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub(crate) enum RpcDispatchArgs {
    Cmd {
        cmd: chromvoid_core::rpc::types::RpcCommand,
    },
    Request {
        v: u8,
        command: String,
        data: Value,
    },
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub(crate) enum RpcResult<T> {
    Success {
        ok: bool,
        result: T,
    },
    Error {
        ok: bool,
        error: String,
        code: Option<String>,
    },
}

#[derive(Debug, Serialize)]
pub(crate) struct StreamOut {
    pub(crate) meta: RpcStreamMeta,
    pub(crate) bytes: Vec<u8>,
}

#[derive(Debug, Serialize)]
pub(crate) struct LocalStorageInfo {
    pub(crate) storage_root: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct MasterSetupResult {
    pub(crate) created: bool,
}

#[derive(Debug, Serialize)]
pub(crate) struct BackupLocalCreated {
    pub(crate) backup_id: String,
    pub(crate) backup_dir: String,
    pub(crate) estimated_size: u64,
    pub(crate) chunk_count: u64,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct BackupProgressEvent {
    pub(crate) backup_id: String,
    pub(crate) phase: String,
    pub(crate) chunk_index: u64,
    pub(crate) chunk_count: u64,
    pub(crate) bytes_written: u64,
    pub(crate) estimated_size: u64,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct RuntimeCapabilities {
    pub(crate) platform: String,
    pub(crate) desktop: bool,
    pub(crate) mobile: bool,
    pub(crate) supports_native_path_io: bool,
    pub(crate) supports_open_external: bool,
    pub(crate) supports_volume: bool,
    pub(crate) supports_gateway: bool,
    pub(crate) supports_usb_remote: bool,
    pub(crate) supports_network_remote: bool,
    pub(crate) supports_biometric: bool,
    pub(crate) supports_autofill: bool,
}

#[cfg(desktop)]
#[derive(Debug, Serialize, Clone)]
pub(crate) struct VolumeStatus {
    pub(crate) state: String,
    pub(crate) backend: Option<String>,
    pub(crate) mountpoint: Option<String>,
    pub(crate) webdav_port: Option<u16>,
    pub(crate) error: Option<String>,
}

#[cfg(desktop)]
#[derive(Debug, Serialize, Clone)]
pub(crate) struct BackendInfo {
    pub(crate) id: String,
    pub(crate) available: bool,
    pub(crate) label: String,
    pub(crate) install_url: Option<String>,
}

#[cfg(desktop)]
#[derive(Debug, Serialize)]
pub(crate) struct GatewayPairingInfo {
    pub(crate) pairing_token: String,
    pub(crate) pairing_expires_at_ms: u64,
    pub(crate) pin: String,
    pub(crate) pin_expires_at_ms: u64,
    pub(crate) attempts_left: u8,
    pub(crate) locked_until_ms: Option<u64>,
}

#[cfg(desktop)]
#[derive(Debug, Serialize)]
pub(crate) struct ActiveGrants {
    pub(crate) action_grants: Vec<crate::gateway::ActionGrant>,
    pub(crate) site_grants: Vec<crate::gateway::SiteGrant>,
}

#[cfg(desktop)]
#[derive(Debug, Serialize)]
pub(crate) struct DownloadPathResult {
    pub(crate) bytes_written: u64,
    pub(crate) name: String,
    pub(crate) mime_type: String,
}

#[cfg(desktop)]
#[derive(Debug, Deserialize)]
pub(crate) struct DownloadPathArgs {
    #[serde(alias = "nodeId")]
    pub(crate) node_id: u64,

    #[serde(alias = "targetPath")]
    pub(crate) target_path: String,

    #[serde(alias = "downloadId")]
    pub(crate) download_id: String,
}

#[cfg(desktop)]
#[derive(Debug, Deserialize)]
pub(crate) struct OpenExternalArgs {
    #[serde(alias = "nodeId")]
    pub(crate) node_id: u64,
}

pub(crate) struct LogGuards {
    pub(crate) _guards: Vec<WorkerGuard>,
}

// ── Helper functions ──────────────────────────────────────────────────

pub(crate) fn rpc_ok<T: Serialize>(result: T) -> RpcResult<T> {
    RpcResult::Success { ok: true, result }
}

pub(crate) fn rpc_err(error: impl Into<String>, code: Option<String>) -> RpcResult<Value> {
    RpcResult::Error {
        ok: false,
        error: error.into(),
        code,
    }
}

pub(crate) fn runtime_capabilities_for_current_target() -> RuntimeCapabilities {
    let platform = if cfg!(target_os = "ios") {
        "ios"
    } else if cfg!(target_os = "android") {
        "android"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    };

    RuntimeCapabilities {
        platform: platform.to_string(),
        desktop: cfg!(desktop),
        mobile: cfg!(mobile),
        supports_native_path_io: cfg!(desktop),
        supports_open_external: cfg!(desktop),
        supports_volume: cfg!(desktop),
        supports_gateway: cfg!(desktop),
        supports_usb_remote: cfg!(desktop),
        supports_network_remote: cfg!(desktop) || cfg!(mobile),
        // Availability for the mobile biometric app gate only.
        supports_biometric: mobile::biometric_bridge_available(),
        supports_autofill: mobile::autofill_extension_ready()
            || mobile::autofill_bridge_available(),
    }
}
