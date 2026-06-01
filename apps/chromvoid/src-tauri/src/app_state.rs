use std::sync::Arc;
use std::sync::Mutex;

use crate::core_adapter::CoreAdapter;
use crate::core_rpc_dispatcher::CoreRpcDispatcher;
use crate::session_settings;

pub(crate) struct AppState {
    pub(crate) adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    pub(crate) core_rpc_dispatcher: CoreRpcDispatcher,
    #[cfg(desktop)]
    pub(crate) sync_runtime: Arc<crate::commands::sync_cmds::SyncRuntimeState>,
    pub(crate) storage_root: Arc<Mutex<std::path::PathBuf>>,
    pub(crate) license_root: std::path::PathBuf,
    #[cfg(desktop)]
    pub(crate) gateway: Arc<Mutex<crate::gateway::GatewayState>>,
    pub(crate) session_settings: Arc<Mutex<session_settings::SessionSettings>>,
    pub(crate) mobile_is_foreground: Arc<Mutex<bool>>,
    pub(crate) last_activity: Arc<Mutex<std::time::Instant>>,
    pub(crate) vault_background_io_runtime:
        Arc<crate::vault_background_io::VaultBackgroundIoRuntimeState>,
    pub(crate) catalog_blocking_io_runtime:
        Arc<crate::catalog_blocking_io::CatalogBlockingIoRuntimeState>,
    pub(crate) task_lifecycle: Arc<crate::task_lifecycle::TaskLifecycleRuntime>,
    pub(crate) image_preview_runtime: Arc<crate::image_preview::ImagePreviewRuntimeState>,
    pub(crate) prepared_preview_runtime: Arc<crate::commands::catalog::PreparedPreviewRuntimeState>,
    pub(crate) media_streams: Arc<crate::media_source::LocalMediaSourceManager>,
    pub(crate) media_protocol_runtime: Arc<crate::media_stream::MediaProtocolRuntimeState>,
    #[cfg(desktop)]
    pub(crate) network_pairing_runtime: Arc<crate::network::pairing::NetworkPairingRuntimeState>,
    #[cfg(desktop)]
    pub(crate) remote_io_runtime: Arc<crate::remote_io_runtime::RemoteIoRuntimeState>,
    pub(crate) mobile_acceptor_runtime:
        Arc<crate::network::mobile_acceptor::MobileAcceptorRuntimeState>,
    pub(crate) ios_lifecycle_runtime: Arc<crate::network::ios_lifecycle::IosLifecycleRuntimeState>,
    pub(crate) ios_host_runtime: Arc<crate::network::ios_pairing::IosHostRuntimeState>,
    pub(crate) android_host_runtime: Arc<crate::network::mobile_host::AndroidHostRuntimeState>,
    pub(crate) android_provider_runtime: Arc<crate::mobile::android::AndroidProviderRuntimeState>,
    pub(crate) android_audio_sessions: Arc<crate::mobile::android::AndroidAudioSessionRegistry>,
    pub(crate) android_native_upload_runtime:
        Arc<crate::mobile::android::AndroidNativeUploadRuntimeState>,
    pub(crate) android_saf_picker_runtime:
        Arc<crate::mobile::android::AndroidSafPickerRuntimeState>,
    pub(crate) android_biometric_runtime: Arc<crate::mobile::android::AndroidBiometricRuntimeState>,
    pub(crate) android_password_save_runtime:
        Arc<crate::mobile::android::AndroidPasswordSaveRuntimeState>,
    pub(crate) android_autofill_runtime: Arc<crate::mobile::android::AndroidAutofillRuntimeState>,
    pub(crate) ios_native_bridge_runtime:
        Arc<crate::mobile::ios::native_bridge::IosNativeBridgeRuntimeState>,
    #[cfg(desktop)]
    pub(crate) volume_manager: Arc<Mutex<crate::volume_manager::VolumeManager>>,
    #[cfg(desktop)]
    pub(crate) exit_in_progress: Arc<std::sync::atomic::AtomicBool>,
    #[cfg(desktop)]
    pub(crate) _sleep_watcher: Option<crate::sleep_watcher::PlatformSleepWatcher>,
    #[cfg(desktop)]
    pub(crate) ssh_agent: Arc<Mutex<crate::ssh_agent::SshAgentState>>,
}
