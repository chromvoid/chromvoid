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

pub(crate) type TauriRpcResult<T> = Result<RpcResult<T>, String>;

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
pub(crate) struct MasterRekeyResult {
    pub(crate) rewrapped_artifacts: Vec<String>,
    pub(crate) backup_recommended: bool,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
pub(crate) struct PasswordStrengthFeedbackDetails {
    pub(crate) warning: String,
    pub(crate) suggestions: Vec<String>,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
pub(crate) struct PasswordStrengthFeedback {
    pub(crate) score: u8,
    pub(crate) feedback: PasswordStrengthFeedbackDetails,
}

impl PasswordStrengthFeedback {
    pub(crate) fn neutral() -> Self {
        Self {
            score: 0,
            feedback: PasswordStrengthFeedbackDetails {
                warning: String::new(),
                suggestions: Vec::new(),
            },
        }
    }
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
pub(crate) struct RestoreProgressEvent {
    pub(crate) restore_id: String,
    pub(crate) phase: String,
    pub(crate) chunk_index: u64,
    pub(crate) chunk_count: u64,
    pub(crate) bytes_written: u64,
    pub(crate) estimated_size: u64,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct VaultRekeyProgressEvent {
    pub(crate) phase: String,
    pub(crate) processed_chunks: u64,
    pub(crate) total_chunks: u64,
    pub(crate) can_cancel: bool,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct RestoreLocalSourceSelected {
    pub(crate) backup_path: String,
    pub(crate) display_name: String,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct RuntimeCapabilities {
    pub(crate) platform: String,
    pub(crate) desktop: bool,
    pub(crate) mobile: bool,
    pub(crate) supports_native_path_io: bool,
    pub(crate) supports_open_external: bool,
    pub(crate) supports_native_share: bool,
    pub(crate) supports_volume: bool,
    pub(crate) supports_gateway: bool,
    pub(crate) supports_usb_remote: bool,
    pub(crate) supports_network_remote: bool,
    pub(crate) supports_biometric: bool,
    pub(crate) supports_autofill: bool,
    pub(crate) supports_media_stream_protocol: bool,
    pub(crate) supports_native_audio_playback: bool,
    pub(crate) supports_native_video_playback: bool,
    pub(crate) supports_native_file_upload: bool,
    pub(crate) supports_share_import: bool,
    pub(crate) supports_native_otp_qr_scan: bool,
    pub(crate) supports_mobile_backup_restore: bool,
    pub(crate) supports_photo_library_save: bool,
    pub(crate) supports_credential_provider_passkeys_lite: bool,
    pub(crate) supports_android_native_video: bool,
    pub(crate) android_native_audio_playback_rollout_enabled: bool,
    pub(crate) supports_android_native_upload: bool,
    pub(crate) supports_android_share_import: bool,
    pub(crate) supports_android_native_otp_qr_scan: bool,
    pub(crate) supports_storage_root_selection: bool,
    pub(crate) supports_android_saf_backup_restore: bool,
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

#[derive(Debug, Deserialize)]
pub(crate) struct OpenExternalArgs {
    #[serde(alias = "nodeId")]
    pub(crate) node_id: u64,

    #[serde(alias = "openId")]
    pub(crate) open_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct SaveImageToGalleryArgs {
    #[serde(alias = "nodeId")]
    pub(crate) node_id: u64,

    #[serde(alias = "fileName")]
    pub(crate) file_name: String,

    #[serde(alias = "mimeType")]
    pub(crate) mime_type: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ShareFilesArgs {
    pub(crate) items: Vec<ShareFileItemArgs>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ShareFileItemArgs {
    #[serde(alias = "nodeId")]
    pub(crate) node_id: u64,

    #[serde(alias = "fileName")]
    pub(crate) file_name: String,

    #[serde(alias = "mimeType")]
    pub(crate) mime_type: Option<String>,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
pub(crate) struct SaveImageToGalleryResult {
    pub(crate) name: String,
    pub(crate) uri: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct PreviewImageArgs {
    #[serde(alias = "nodeId")]
    pub(crate) node_id: u64,

    #[serde(alias = "fileName")]
    pub(crate) file_name: String,

    #[serde(alias = "mimeType")]
    pub(crate) mime_type: Option<String>,

    #[serde(alias = "refreshDerivativeCache", default)]
    pub(crate) refresh_derivative_cache: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum PreviewFileVariant {
    Raw,
    PreviewImage,
    ThumbnailImage,
}

#[derive(Debug, Deserialize)]
pub(crate) struct PreparePreviewFileArgs {
    #[serde(alias = "nodeId")]
    pub(crate) node_id: u64,

    #[serde(alias = "fileName")]
    pub(crate) file_name: String,

    #[serde(alias = "mimeType")]
    pub(crate) mime_type: Option<String>,

    pub(crate) variant: PreviewFileVariant,

    #[serde(alias = "previewId")]
    pub(crate) preview_id: String,

    #[serde(alias = "refreshDerivativeCache", default)]
    pub(crate) refresh_derivative_cache: bool,
}

#[derive(Debug, Serialize)]
pub(crate) struct PreparedPreviewFileResult {
    pub(crate) preview_id: String,
    pub(crate) path: String,
    pub(crate) name: String,
    pub(crate) mime_type: String,
    pub(crate) size: u64,
    pub(crate) variant: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ReleasePreviewFileArgs {
    #[serde(alias = "previewId")]
    pub(crate) preview_id: String,

    pub(crate) path: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct PurgePreviewCacheArgs {
    pub(crate) reason: String,
}

#[derive(Debug, Clone, Copy, Default, Serialize, PartialEq, Eq)]
pub(crate) struct PurgePreviewCacheResult {
    pub(crate) files_removed: u64,
    pub(crate) directories_removed: u64,
    pub(crate) bytes_removed: u64,
    pub(crate) skipped_entries: u64,
}

pub(crate) struct LogGuards {
    pub(crate) _guards: Vec<WorkerGuard>,
}

// ── Helper functions ──────────────────────────────────────────────────

pub(crate) fn rpc_ok<T: Serialize>(result: T) -> RpcResult<T> {
    RpcResult::Success { ok: true, result }
}

pub(crate) fn rpc_err<T>(error: impl Into<String>, code: Option<String>) -> RpcResult<T> {
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

    let supports_android_native_video = android_native_video_enabled_for_target();
    let android_native_audio_playback_rollout_enabled =
        android_native_audio_playback_enabled_for_target();
    let supports_android_native_upload = cfg!(target_os = "android");
    let supports_android_share_import = cfg!(target_os = "android");
    let supports_android_native_otp_qr_scan = cfg!(target_os = "android");
    let supports_android_saf_backup_restore = cfg!(target_os = "android");

    RuntimeCapabilities {
        platform: platform.to_string(),
        desktop: cfg!(desktop),
        mobile: cfg!(mobile),
        supports_native_path_io: cfg!(desktop),
        supports_open_external: cfg!(desktop)
            || cfg!(target_os = "android")
            || ios_native_feature_enabled_for_target("CHROMVOID_DISABLE_IOS_OPEN_EXTERNAL", true),
        supports_native_share: cfg!(target_os = "android")
            || ios_native_feature_enabled_for_target("CHROMVOID_DISABLE_IOS_NATIVE_SHARE", true),
        supports_volume: cfg!(desktop),
        supports_gateway: cfg!(desktop),
        supports_usb_remote: cfg!(desktop),
        supports_network_remote: cfg!(desktop) || cfg!(mobile),
        // Availability for the mobile biometric app gate only.
        supports_biometric: mobile::biometric_bridge_available(),
        supports_autofill: mobile::autofill_extension_ready()
            || mobile::autofill_bridge_available(),
        supports_media_stream_protocol: media_stream_protocol_enabled_for_target(),
        supports_native_audio_playback: android_native_audio_playback_rollout_enabled
            || ios_native_feature_enabled_for_target(
                "CHROMVOID_DISABLE_IOS_NATIVE_AUDIO_PLAYBACK",
                true,
            ),
        supports_native_video_playback: supports_android_native_video
            || ios_native_feature_enabled_for_target(
                "CHROMVOID_DISABLE_IOS_NATIVE_VIDEO_PLAYBACK",
                true,
            ),
        supports_native_file_upload: supports_android_native_upload
            || ios_native_feature_enabled_for_target("CHROMVOID_DISABLE_IOS_NATIVE_UPLOAD", true),
        supports_share_import: supports_android_share_import
            || ios_native_feature_enabled_for_target("CHROMVOID_DISABLE_IOS_SHARE_IMPORT", true),
        supports_native_otp_qr_scan: supports_android_native_otp_qr_scan
            || ios_native_feature_enabled_for_target(
                "CHROMVOID_DISABLE_IOS_NATIVE_OTP_QR_SCAN",
                true,
            ),
        supports_mobile_backup_restore: supports_android_saf_backup_restore
            || ios_native_feature_enabled_for_target(
                "CHROMVOID_DISABLE_IOS_MOBILE_BACKUP_RESTORE",
                true,
            ),
        supports_photo_library_save: cfg!(target_os = "android")
            || ios_native_feature_enabled_for_target(
                "CHROMVOID_DISABLE_IOS_PHOTO_LIBRARY_SAVE",
                true,
            ),
        supports_credential_provider_passkeys_lite: cfg!(target_os = "android")
            || ios_native_feature_enabled_for_target(
                "CHROMVOID_DISABLE_IOS_CREDENTIAL_PROVIDER_PASSKEYS_LITE",
                mobile::credential_provider_passkeys_lite_supported(),
            ),
        supports_android_native_video,
        android_native_audio_playback_rollout_enabled,
        supports_android_native_upload,
        supports_android_share_import,
        supports_android_native_otp_qr_scan,
        supports_storage_root_selection: cfg!(desktop),
        supports_android_saf_backup_restore,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct IosNativeFeatureRollbackGate {
    disable_env: &'static str,
    capability: &'static str,
}

const IOS_NATIVE_FEATURE_ROLLBACK_GATES: &[IosNativeFeatureRollbackGate] = &[
    IosNativeFeatureRollbackGate {
        disable_env: "CHROMVOID_DISABLE_IOS_OPEN_EXTERNAL",
        capability: "supports_open_external",
    },
    IosNativeFeatureRollbackGate {
        disable_env: "CHROMVOID_DISABLE_IOS_NATIVE_SHARE",
        capability: "supports_native_share",
    },
    IosNativeFeatureRollbackGate {
        disable_env: "CHROMVOID_DISABLE_IOS_NATIVE_AUDIO_PLAYBACK",
        capability: "supports_native_audio_playback",
    },
    IosNativeFeatureRollbackGate {
        disable_env: "CHROMVOID_DISABLE_IOS_NATIVE_VIDEO_PLAYBACK",
        capability: "supports_native_video_playback",
    },
    IosNativeFeatureRollbackGate {
        disable_env: "CHROMVOID_DISABLE_IOS_NATIVE_UPLOAD",
        capability: "supports_native_file_upload",
    },
    IosNativeFeatureRollbackGate {
        disable_env: "CHROMVOID_DISABLE_IOS_SHARE_IMPORT",
        capability: "supports_share_import",
    },
    IosNativeFeatureRollbackGate {
        disable_env: "CHROMVOID_DISABLE_IOS_NATIVE_OTP_QR_SCAN",
        capability: "supports_native_otp_qr_scan",
    },
    IosNativeFeatureRollbackGate {
        disable_env: "CHROMVOID_DISABLE_IOS_MOBILE_BACKUP_RESTORE",
        capability: "supports_mobile_backup_restore",
    },
    IosNativeFeatureRollbackGate {
        disable_env: "CHROMVOID_DISABLE_IOS_PHOTO_LIBRARY_SAVE",
        capability: "supports_photo_library_save",
    },
    IosNativeFeatureRollbackGate {
        disable_env: "CHROMVOID_DISABLE_IOS_CREDENTIAL_PROVIDER_PASSKEYS_LITE",
        capability: "supports_credential_provider_passkeys_lite",
    },
];

fn media_stream_protocol_enabled_for_target() -> bool {
    if !cfg!(desktop) {
        return false;
    }

    std::env::var("CHROMVOID_DISABLE_MEDIA_STREAM_PROTOCOL").as_deref() != Ok("1")
}

fn android_native_video_enabled_for_target() -> bool {
    if !cfg!(target_os = "android") {
        return false;
    }

    std::env::var("CHROMVOID_DISABLE_ANDROID_NATIVE_VIDEO").as_deref() != Ok("1")
}

fn android_native_audio_playback_enabled_for_target() -> bool {
    if !cfg!(target_os = "android") {
        return false;
    }

    if std::env::var("CHROMVOID_DISABLE_ANDROID_NATIVE_AUDIO_PLAYBACK").as_deref() == Ok("1") {
        return false;
    }

    true
}

fn ios_native_feature_enabled_for_target(disable_env: &str, bridge_available: bool) -> bool {
    let known_gate = IOS_NATIVE_FEATURE_ROLLBACK_GATES.iter().any(|gate| {
        let _capability = gate.capability;
        gate.disable_env == disable_env
    });
    debug_assert!(
        known_gate,
        "unknown iOS native feature rollback gate: {disable_env}"
    );

    if !cfg!(target_os = "ios") || !bridge_available {
        return false;
    }

    std::env::var(disable_env).as_deref() != Ok("1")
}

#[cfg(test)]
mod runtime_capabilities_tests {
    use super::runtime_capabilities_for_current_target;
    use std::sync::Mutex;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    struct EnvGuard {
        key: &'static str,
        previous: Option<std::ffi::OsString>,
    }

    impl EnvGuard {
        fn unset(key: &'static str) -> Self {
            let previous = std::env::var_os(key);
            // SAFETY: env mutation in test fixture; serialised by ENV_LOCK Mutex and restored on Drop.
            unsafe {
                std::env::remove_var(key);
            }
            Self { key, previous }
        }

        fn set(key: &'static str, value: &'static str) -> Self {
            let previous = std::env::var_os(key);
            // SAFETY: env mutation in test fixture; serialised by ENV_LOCK Mutex and restored on Drop.
            unsafe {
                std::env::set_var(key, value);
            }
            Self { key, previous }
        }
    }

    impl Drop for EnvGuard {
        fn drop(&mut self) {
            match self.previous.take() {
                // SAFETY: env mutation in test fixture; serialised by ENV_LOCK Mutex and restored on Drop.
                Some(value) => unsafe {
                    std::env::set_var(self.key, value);
                },
                // SAFETY: env mutation in test fixture; serialised by ENV_LOCK Mutex and restored on Drop.
                None => unsafe {
                    std::env::remove_var(self.key);
                },
            }
        }
    }

    #[test]
    fn media_stream_protocol_capability_defaults_to_desktop_targets() {
        let _lock = ENV_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let _disable_guard = EnvGuard::unset("CHROMVOID_DISABLE_MEDIA_STREAM_PROTOCOL");

        assert_eq!(
            runtime_capabilities_for_current_target().supports_media_stream_protocol,
            cfg!(desktop),
        );
    }

    #[test]
    fn media_stream_protocol_capability_has_disable_rollback_gate() {
        let _lock = ENV_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        {
            let _guard = EnvGuard::set("CHROMVOID_DISABLE_MEDIA_STREAM_PROTOCOL", "1");
            assert!(!runtime_capabilities_for_current_target().supports_media_stream_protocol);
        }

        {
            let _guard = EnvGuard::set("CHROMVOID_DISABLE_MEDIA_STREAM_PROTOCOL", "0");
            assert_eq!(
                runtime_capabilities_for_current_target().supports_media_stream_protocol,
                cfg!(desktop),
            );
        }
    }

    #[test]
    fn android_native_video_capability_defaults_to_android_target_with_disable_gate() {
        let _lock = ENV_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        {
            let _guard = EnvGuard::unset("CHROMVOID_DISABLE_ANDROID_NATIVE_VIDEO");
            let _ios_guard = EnvGuard::unset("CHROMVOID_DISABLE_IOS_NATIVE_VIDEO_PLAYBACK");
            assert_eq!(
                runtime_capabilities_for_current_target().supports_android_native_video,
                cfg!(target_os = "android"),
            );
            assert_eq!(
                runtime_capabilities_for_current_target().supports_native_video_playback,
                cfg!(any(target_os = "android", target_os = "ios")),
            );
        }

        {
            let _guard = EnvGuard::set("CHROMVOID_DISABLE_ANDROID_NATIVE_VIDEO", "1");
            let _ios_guard = EnvGuard::unset("CHROMVOID_DISABLE_IOS_NATIVE_VIDEO_PLAYBACK");
            let caps = runtime_capabilities_for_current_target();
            assert!(!caps.supports_android_native_video);
            assert_eq!(caps.supports_native_video_playback, cfg!(target_os = "ios"));
        }
    }

    #[test]
    fn android_native_audio_rollout_defaults_to_android_target() {
        let _lock = ENV_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let _enable_guard = EnvGuard::unset("CHROMVOID_ENABLE_ANDROID_NATIVE_AUDIO_PLAYBACK");
        let _disable_guard = EnvGuard::unset("CHROMVOID_DISABLE_ANDROID_NATIVE_AUDIO_PLAYBACK");
        let _ios_disable_guard = EnvGuard::unset("CHROMVOID_DISABLE_IOS_NATIVE_AUDIO_PLAYBACK");

        let caps = runtime_capabilities_for_current_target();

        assert_eq!(
            caps.android_native_audio_playback_rollout_enabled,
            cfg!(target_os = "android"),
        );
        assert_eq!(
            caps.supports_native_audio_playback,
            cfg!(any(target_os = "android", target_os = "ios")),
        );
    }

    #[test]
    fn android_native_audio_rollout_uses_disable_precedence() {
        let _lock = ENV_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        {
            let _enable_guard =
                EnvGuard::set("CHROMVOID_ENABLE_ANDROID_NATIVE_AUDIO_PLAYBACK", "1");
            let _disable_guard = EnvGuard::unset("CHROMVOID_DISABLE_ANDROID_NATIVE_AUDIO_PLAYBACK");
            let _ios_disable_guard = EnvGuard::unset("CHROMVOID_DISABLE_IOS_NATIVE_AUDIO_PLAYBACK");
            let caps = runtime_capabilities_for_current_target();
            assert_eq!(
                caps.android_native_audio_playback_rollout_enabled,
                cfg!(target_os = "android"),
            );
            assert_eq!(
                caps.supports_native_audio_playback,
                cfg!(any(target_os = "android", target_os = "ios")),
            );
        }

        {
            let _enable_guard =
                EnvGuard::set("CHROMVOID_ENABLE_ANDROID_NATIVE_AUDIO_PLAYBACK", "1");
            let _disable_guard =
                EnvGuard::set("CHROMVOID_DISABLE_ANDROID_NATIVE_AUDIO_PLAYBACK", "1");
            let _ios_disable_guard = EnvGuard::unset("CHROMVOID_DISABLE_IOS_NATIVE_AUDIO_PLAYBACK");
            let caps = runtime_capabilities_for_current_target();
            assert!(!caps.android_native_audio_playback_rollout_enabled);
            assert_eq!(caps.supports_native_audio_playback, cfg!(target_os = "ios"));
        }
    }

    #[test]
    fn android_only_mobile_capabilities_default_to_android_target() {
        let caps = runtime_capabilities_for_current_target();

        assert_eq!(
            caps.supports_android_native_upload,
            cfg!(target_os = "android"),
        );
        assert_eq!(
            caps.supports_native_file_upload,
            cfg!(any(target_os = "android", target_os = "ios")),
        );
        assert_eq!(
            caps.supports_android_share_import,
            cfg!(target_os = "android"),
        );
        assert_eq!(
            caps.supports_share_import,
            cfg!(any(target_os = "android", target_os = "ios")),
        );
        assert_eq!(
            caps.supports_android_native_otp_qr_scan,
            cfg!(target_os = "android"),
        );
        assert_eq!(
            caps.supports_native_otp_qr_scan,
            cfg!(any(target_os = "android", target_os = "ios")),
        );
        assert_eq!(
            caps.supports_android_saf_backup_restore,
            cfg!(target_os = "android"),
        );
        assert_eq!(
            caps.supports_mobile_backup_restore,
            cfg!(any(target_os = "android", target_os = "ios")),
        );
        assert_eq!(
            caps.supports_photo_library_save,
            cfg!(any(target_os = "android", target_os = "ios")),
        );
        assert_eq!(
            caps.supports_credential_provider_passkeys_lite,
            cfg!(any(target_os = "android", target_os = "ios")),
        );
    }

    #[test]
    fn ios_native_feature_rollback_map_documents_all_gates() {
        let gates = super::IOS_NATIVE_FEATURE_ROLLBACK_GATES;
        let expected = [
            (
                "CHROMVOID_DISABLE_IOS_OPEN_EXTERNAL",
                "supports_open_external",
            ),
            (
                "CHROMVOID_DISABLE_IOS_NATIVE_SHARE",
                "supports_native_share",
            ),
            (
                "CHROMVOID_DISABLE_IOS_NATIVE_AUDIO_PLAYBACK",
                "supports_native_audio_playback",
            ),
            (
                "CHROMVOID_DISABLE_IOS_NATIVE_VIDEO_PLAYBACK",
                "supports_native_video_playback",
            ),
            (
                "CHROMVOID_DISABLE_IOS_NATIVE_UPLOAD",
                "supports_native_file_upload",
            ),
            (
                "CHROMVOID_DISABLE_IOS_SHARE_IMPORT",
                "supports_share_import",
            ),
            (
                "CHROMVOID_DISABLE_IOS_NATIVE_OTP_QR_SCAN",
                "supports_native_otp_qr_scan",
            ),
            (
                "CHROMVOID_DISABLE_IOS_MOBILE_BACKUP_RESTORE",
                "supports_mobile_backup_restore",
            ),
            (
                "CHROMVOID_DISABLE_IOS_PHOTO_LIBRARY_SAVE",
                "supports_photo_library_save",
            ),
            (
                "CHROMVOID_DISABLE_IOS_CREDENTIAL_PROVIDER_PASSKEYS_LITE",
                "supports_credential_provider_passkeys_lite",
            ),
        ];

        assert_eq!(gates.len(), expected.len());
        for (disable_env, capability) in expected {
            assert!(gates
                .iter()
                .any(|gate| gate.disable_env == disable_env && gate.capability == capability));
        }
    }
}
