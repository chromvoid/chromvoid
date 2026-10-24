//! Module access (ADR-041).
//!
//! Every module is available to everyone. A module resolves to `unsupported`
//! when the current platform or the active Core cannot run it, to
//! `disabled_by_rollout` when this release has not enabled it, and to `enabled`
//! otherwise. The guards below enforce exactly those two answers at the command
//! boundary.

use std::collections::BTreeSet;

use chromvoid_core::rpc::types::{
    CoreCapabilitiesResponse, RpcRequest, RpcResponse, CORE_FEATURE_WALLET_CORE_TON_V1,
    CORE_FEATURE_WALLET_DOMAIN_BASE_V1,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::app_state::AppState;
use crate::core_adapter::{CoreAdapter, CoreMode};
use crate::types::{rpc_err, rpc_ok, RpcResult, RuntimeCapabilities, TauriRpcResult};

pub(crate) const MODULE_REMOTE: &str = "remote";
pub(crate) const MODULE_CREDENTIAL_PROVIDER: &str = "credential-provider";
pub(crate) const MODULE_SSH_AGENT: &str = "ssh-agent";
pub(crate) const MODULE_ENV_RUNTIME: &str = "env-runtime";
pub(crate) const MODULE_CRYPTO_WALLET: &str = "crypto-wallet";
pub(crate) const MODULE_EMERGENCY_ACCESS: &str = "emergency-access";
pub(crate) const MODULE_BROWSER_EXTENSION: &str = "browser-extension";
pub(crate) const MODULE_MOUNTED_VAULT: &str = "mounted-vault";

const ALL_MODULES: &[&str] = &[
    MODULE_REMOTE,
    MODULE_CREDENTIAL_PROVIDER,
    MODULE_SSH_AGENT,
    MODULE_CRYPTO_WALLET,
    MODULE_EMERGENCY_ACCESS,
    MODULE_BROWSER_EXTENSION,
    MODULE_MOUNTED_VAULT,
    MODULE_ENV_RUNTIME,
];

pub(crate) const FEATURE_UNSUPPORTED_ON_PLATFORM: &str = "FEATURE_UNSUPPORTED_ON_PLATFORM";
pub(crate) const FEATURE_DISABLED_BY_ROLLOUT: &str = "FEATURE_DISABLED_BY_ROLLOUT";
pub(crate) const REMOTE_CORE_UNSUPPORTED: &str = "REMOTE_CORE_UNSUPPORTED";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ModuleAccessStatus {
    Unsupported,
    DisabledByRollout,
    Enabled,
}

impl ModuleAccessStatus {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Unsupported => "unsupported",
            Self::DisabledByRollout => "disabled_by_rollout",
            Self::Enabled => "enabled",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) struct ModuleAccessState {
    pub(crate) feature_key: String,
    pub(crate) status: ModuleAccessStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) denial_code: Option<String>,
}

#[derive(Debug, Clone)]
struct ModuleRolloutConfig {
    global_enabled: bool,
    disabled_modules: BTreeSet<String>,
}

#[derive(Debug, Clone, Copy, Default)]
struct ModuleRuntimeSupport {
    crypto_wallet: bool,
    env_runtime_local: bool,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ModuleAccessResolveArgs {
    pub(crate) feature_key: String,
}

#[cfg(desktop)]
pub(crate) fn guard_module(
    state: &tauri::State<'_, AppState>,
    feature_key: &str,
) -> Result<(), RpcResult<Value>> {
    let caps = crate::types::runtime_capabilities_for_current_target();
    let mut adapter = state
        .adapter
        .lock()
        .map_err(|_| rpc_err("Adapter mutex poisoned", Some("INTERNAL".to_string())))?;
    guard_module_for_adapter(adapter.as_mut(), feature_key, &caps)
}

pub(crate) async fn guard_module_async(
    state: &tauri::State<'_, AppState>,
    feature_key: &str,
) -> Result<(), RpcResult<Value>> {
    let caps = crate::types::runtime_capabilities_for_current_target();
    let feature_key = feature_key.to_string();
    run_module_adapter_task(state, "Module access guard", move |adapter| {
        guard_module_for_adapter(adapter, &feature_key, &caps)
    })
    .await
}

pub(crate) fn guard_module_for_adapter(
    adapter: &mut dyn CoreAdapter,
    feature_key: &str,
    caps: &RuntimeCapabilities,
) -> Result<(), RpcResult<Value>> {
    let access = resolve_for_adapter(adapter, feature_key, caps);
    if access.status == ModuleAccessStatus::Enabled {
        return Ok(());
    }
    Err(rpc_err(
        format!("Module unavailable: {feature_key}"),
        access.denial_code,
    ))
}

pub(crate) fn resolve_for_adapter(
    adapter: &mut dyn CoreAdapter,
    feature_key: &str,
    caps: &RuntimeCapabilities,
) -> ModuleAccessState {
    let support = module_runtime_support_for_adapter(adapter);
    if feature_key == MODULE_ENV_RUNTIME && !support.env_runtime_local {
        return denied(
            feature_key,
            ModuleAccessStatus::Unsupported,
            REMOTE_CORE_UNSUPPORTED,
        );
    }
    resolve_module_access(feature_key, caps, &support)
}

async fn run_module_adapter_task<T, F>(
    state: &tauri::State<'_, AppState>,
    task_label: &'static str,
    task: F,
) -> Result<T, RpcResult<Value>>
where
    T: Send + 'static,
    F: FnOnce(&mut dyn CoreAdapter) -> Result<T, RpcResult<Value>> + Send + 'static,
{
    let adapter = state.adapter.clone();
    match state
        .catalog_blocking_io_runtime
        .spawn_blocking(move || {
            let mut adapter = adapter
                .lock()
                .map_err(|_| rpc_err("Adapter mutex poisoned", Some("INTERNAL".to_string())))?;
            task(adapter.as_mut())
        })
        .await
    {
        Ok(result) => result,
        Err(error) => {
            let (message, code) = error.into_rpc_error(task_label);
            Err(rpc_err(
                message,
                code.or_else(|| Some("INTERNAL".to_string())),
            ))
        }
    }
}

fn resolve_module_access(
    feature_key: &str,
    caps: &RuntimeCapabilities,
    support: &ModuleRuntimeSupport,
) -> ModuleAccessState {
    resolve_module_access_with_rollout(feature_key, caps, &ModuleRolloutConfig::current(), support)
}

fn resolve_module_access_with_rollout(
    feature_key: &str,
    caps: &RuntimeCapabilities,
    rollout: &ModuleRolloutConfig,
    support: &ModuleRuntimeSupport,
) -> ModuleAccessState {
    if feature_key == MODULE_ENV_RUNTIME
        && cfg!(all(desktop, target_os = "macos"))
        && !support.env_runtime_local
    {
        return denied(
            feature_key,
            ModuleAccessStatus::Unsupported,
            REMOTE_CORE_UNSUPPORTED,
        );
    }
    if !is_module_supported(feature_key, caps, support) {
        return denied(
            feature_key,
            ModuleAccessStatus::Unsupported,
            FEATURE_UNSUPPORTED_ON_PLATFORM,
        );
    }
    if !rollout.global_enabled || rollout.disabled_modules.contains(feature_key) {
        return denied(
            feature_key,
            ModuleAccessStatus::DisabledByRollout,
            FEATURE_DISABLED_BY_ROLLOUT,
        );
    }
    enabled(feature_key)
}

#[tauri::command]
pub(crate) async fn module_access_snapshot(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> TauriRpcResult<Vec<ModuleAccessState>> {
    let caps = crate::types::runtime_capabilities_for_current_target();
    let access = match run_module_adapter_task(&state, "Module access snapshot", move |adapter| {
        let support = module_runtime_support_for_adapter(adapter);
        Ok(ALL_MODULES
            .iter()
            .map(|feature| resolve_module_access(feature, &caps, &support))
            .collect::<Vec<_>>())
    })
    .await
    {
        Ok(access) => access,
        Err(error) => {
            crate::credential_provider_bridge::on_identity_policy_status(&app, false);
            return Ok(denial_result(error));
        }
    };
    let credential_provider_enabled = access.iter().any(|item| {
        item.feature_key == MODULE_CREDENTIAL_PROVIDER && item.status == ModuleAccessStatus::Enabled
    });
    crate::credential_provider_bridge::on_identity_policy_status(&app, credential_provider_enabled);
    Ok(rpc_ok(access))
}

#[tauri::command]
pub(crate) async fn module_access_resolve(
    state: tauri::State<'_, AppState>,
    args: ModuleAccessResolveArgs,
) -> TauriRpcResult<ModuleAccessState> {
    let caps = crate::types::runtime_capabilities_for_current_target();
    let feature_key = args.feature_key;
    match run_module_adapter_task(&state, "Module access resolve", move |adapter| {
        Ok(resolve_for_adapter(adapter, &feature_key, &caps))
    })
    .await
    {
        Ok(access) => Ok(rpc_ok(access)),
        Err(error) => Ok(denial_result(error)),
    }
}

/// Re-types a guard denial for a command whose success payload differs.
pub(crate) fn denial_result<T>(error: RpcResult<Value>) -> RpcResult<T> {
    match error {
        RpcResult::Error { error, code, .. } => RpcResult::Error {
            ok: false,
            error,
            code,
        },
        RpcResult::Success { .. } => RpcResult::Error {
            ok: false,
            error: "Module access unavailable".to_string(),
            code: Some("INTERNAL".to_string()),
        },
    }
}

/// Flattens a guard denial into `"<denial code>: <message>"` for string error channels.
pub(crate) fn denial_reason(error: RpcResult<Value>) -> String {
    match error {
        RpcResult::Error {
            error,
            code: Some(code),
            ..
        } => format!("{code}: {error}"),
        RpcResult::Error { error, .. } => error,
        RpcResult::Success { .. } => "Module access unavailable".to_string(),
    }
}

impl ModuleRolloutConfig {
    fn current() -> Self {
        let global_enabled = std::env::var("CHROMVOID_MODULE_ROLLOUT_ENABLED")
            .map(|value| !(value == "0" || value.eq_ignore_ascii_case("false")))
            .unwrap_or(true);
        let mut disabled_modules: BTreeSet<String> = std::env::var("CHROMVOID_DISABLED_MODULES")
            .ok()
            .map(|value| {
                value
                    .split(',')
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(ToOwned::to_owned)
                    .collect()
            })
            .unwrap_or_default();
        let env_runtime_enabled = std::env::var("CHROMVOID_ENV_RUNTIME_V1_ENABLED")
            .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
            .unwrap_or(false);
        if !env_runtime_enabled {
            disabled_modules.insert(MODULE_ENV_RUNTIME.to_string());
        }
        Self {
            global_enabled,
            disabled_modules,
        }
    }
}

fn is_module_supported(
    feature_key: &str,
    caps: &RuntimeCapabilities,
    support: &ModuleRuntimeSupport,
) -> bool {
    match feature_key {
        MODULE_REMOTE => caps.supports_network_remote,
        MODULE_CREDENTIAL_PROVIDER => caps.supports_autofill,
        MODULE_SSH_AGENT => cfg!(desktop),
        MODULE_BROWSER_EXTENSION => caps.supports_gateway,
        MODULE_MOUNTED_VAULT => caps.supports_volume,
        MODULE_ENV_RUNTIME => cfg!(all(desktop, target_os = "macos")),
        MODULE_CRYPTO_WALLET => support.crypto_wallet,
        MODULE_EMERGENCY_ACCESS => false,
        _ => false,
    }
}

/// Runtime facts about the active Core. A mobile USB session that still awaits
/// approval must not receive any RPC, so it reports nothing as supported.
fn module_runtime_support_for_adapter(adapter: &mut dyn CoreAdapter) -> ModuleRuntimeSupport {
    if adapter.mobile_usb_session_requires_approval() {
        return ModuleRuntimeSupport::default();
    }

    ModuleRuntimeSupport {
        crypto_wallet: adapter_supports_crypto_wallet(adapter),
        env_runtime_local: adapter.mode() == CoreMode::Local,
    }
}

fn adapter_supports_crypto_wallet(adapter: &mut dyn CoreAdapter) -> bool {
    let response = adapter.handle(&RpcRequest::new("core:capabilities", Value::Null));
    let RpcResponse::Success { result, .. } = response else {
        return false;
    };
    let Ok(capabilities) = serde_json::from_value::<CoreCapabilitiesResponse>(result) else {
        return false;
    };
    capabilities
        .features
        .iter()
        .any(|feature| feature == CORE_FEATURE_WALLET_DOMAIN_BASE_V1)
        && capabilities
            .features
            .iter()
            .any(|feature| feature == CORE_FEATURE_WALLET_CORE_TON_V1)
}

fn enabled(feature_key: &str) -> ModuleAccessState {
    ModuleAccessState {
        feature_key: feature_key.to_string(),
        status: ModuleAccessStatus::Enabled,
        denial_code: None,
    }
}

fn denied(feature_key: &str, status: ModuleAccessStatus, code: &str) -> ModuleAccessState {
    ModuleAccessState {
        feature_key: feature_key.to_string(),
        status,
        denial_code: Some(code.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rollout_enabled() -> ModuleRolloutConfig {
        ModuleRolloutConfig {
            global_enabled: true,
            disabled_modules: BTreeSet::new(),
        }
    }

    fn default_support() -> ModuleRuntimeSupport {
        ModuleRuntimeSupport::default()
    }

    fn wallet_support() -> ModuleRuntimeSupport {
        ModuleRuntimeSupport {
            crypto_wallet: true,
            ..ModuleRuntimeSupport::default()
        }
    }

    fn supported_caps() -> RuntimeCapabilities {
        RuntimeCapabilities {
            platform: "test".to_string(),
            desktop: true,
            mobile: false,
            supports_native_path_io: true,
            supports_open_external: true,
            supports_native_share: true,
            supports_volume: true,
            supports_gateway: true,
            supports_network_remote: true,
            supports_mobile_usb_remote: false,
            supports_biometric: true,
            supports_autofill: true,
            supports_media_stream_protocol: true,
            supports_media_http_stream: true,
            supports_mse_video_playback: true,
            supports_desktop_native_video_playback: false,
            supports_mobile_native_video_playback: false,
            supports_native_audio_playback: false,
            supports_native_video_playback: false,
            supports_native_file_upload: false,
            supports_share_import: false,
            supports_native_otp_qr_scan: false,
            supports_mobile_backup_restore: false,
            supports_photo_library_save: false,
            supports_credential_provider_passkeys_lite: false,
            supports_storage_root_selection: true,
        }
    }

    #[test]
    fn supported_module_is_enabled_without_any_licence() {
        let access = resolve_module_access_with_rollout(
            MODULE_REMOTE,
            &supported_caps(),
            &rollout_enabled(),
            &default_support(),
        );

        assert_eq!(access.status, ModuleAccessStatus::Enabled);
        assert_eq!(access.denial_code, None);
    }

    #[test]
    fn every_supported_module_resolves_to_enabled_when_rollout_allows_it() {
        let support = ModuleRuntimeSupport {
            crypto_wallet: true,
            env_runtime_local: true,
        };
        for module in ALL_MODULES {
            let access = resolve_module_access_with_rollout(
                module,
                &supported_caps(),
                &rollout_enabled(),
                &support,
            );
            let expected_supported = is_module_supported(module, &supported_caps(), &support);
            assert_eq!(
                access.status == ModuleAccessStatus::Enabled,
                expected_supported,
                "{module}"
            );
            if !expected_supported {
                assert_eq!(
                    access.denial_code.as_deref(),
                    Some(FEATURE_UNSUPPORTED_ON_PLATFORM),
                    "{module}"
                );
            }
        }
    }

    #[test]
    fn emergency_access_is_never_supported() {
        let access = resolve_module_access_with_rollout(
            MODULE_EMERGENCY_ACCESS,
            &supported_caps(),
            &rollout_enabled(),
            &wallet_support(),
        );

        assert_eq!(access.status, ModuleAccessStatus::Unsupported);
        assert_eq!(
            access.denial_code.as_deref(),
            Some(FEATURE_UNSUPPORTED_ON_PLATFORM)
        );
    }

    #[test]
    fn unsupported_platform_wins_over_rollout() {
        let caps = RuntimeCapabilities {
            supports_network_remote: false,
            ..supported_caps()
        };
        let rollout = ModuleRolloutConfig {
            global_enabled: false,
            disabled_modules: BTreeSet::new(),
        };
        let access =
            resolve_module_access_with_rollout(MODULE_REMOTE, &caps, &rollout, &default_support());

        assert_eq!(access.status, ModuleAccessStatus::Unsupported);
    }

    #[test]
    fn global_rollout_switch_disables_supported_modules() {
        let rollout = ModuleRolloutConfig {
            global_enabled: false,
            disabled_modules: BTreeSet::new(),
        };
        let access = resolve_module_access_with_rollout(
            MODULE_REMOTE,
            &supported_caps(),
            &rollout,
            &default_support(),
        );

        assert_eq!(access.status, ModuleAccessStatus::DisabledByRollout);
        assert_eq!(
            access.denial_code.as_deref(),
            Some(FEATURE_DISABLED_BY_ROLLOUT)
        );
    }

    #[test]
    fn listed_module_is_disabled_by_rollout_and_others_stay_enabled() {
        let rollout = ModuleRolloutConfig {
            global_enabled: true,
            disabled_modules: BTreeSet::from([MODULE_SSH_AGENT.to_string()]),
        };

        let ssh = resolve_module_access_with_rollout(
            MODULE_SSH_AGENT,
            &supported_caps(),
            &rollout,
            &default_support(),
        );
        let remote = resolve_module_access_with_rollout(
            MODULE_REMOTE,
            &supported_caps(),
            &rollout,
            &default_support(),
        );

        if cfg!(desktop) {
            assert_eq!(ssh.status, ModuleAccessStatus::DisabledByRollout);
        } else {
            assert_eq!(ssh.status, ModuleAccessStatus::Unsupported);
        }
        assert_eq!(remote.status, ModuleAccessStatus::Enabled);
    }

    #[test]
    fn resolve_crypto_wallet_requires_core_wallet_support() {
        let access = resolve_module_access_with_rollout(
            MODULE_CRYPTO_WALLET,
            &supported_caps(),
            &rollout_enabled(),
            &default_support(),
        );

        assert_eq!(access.status, ModuleAccessStatus::Unsupported);
        assert_eq!(
            access.denial_code.as_deref(),
            Some(FEATURE_UNSUPPORTED_ON_PLATFORM)
        );
    }

    #[test]
    fn resolve_crypto_wallet_is_enabled_when_core_supports_wallet() {
        let access = resolve_module_access_with_rollout(
            MODULE_CRYPTO_WALLET,
            &supported_caps(),
            &rollout_enabled(),
            &wallet_support(),
        );

        assert_eq!(access.status, ModuleAccessStatus::Enabled);
        assert_eq!(access.denial_code, None);
    }

    #[test]
    fn status_wire_names_are_the_shared_contract() {
        for (status, wire) in [
            (ModuleAccessStatus::Unsupported, "unsupported"),
            (ModuleAccessStatus::DisabledByRollout, "disabled_by_rollout"),
            (ModuleAccessStatus::Enabled, "enabled"),
        ] {
            assert_eq!(status.as_str(), wire);
            assert_eq!(serde_json::to_value(status).unwrap(), Value::from(wire));
        }
    }

    struct SessionApprovalRequiredAdapter {
        handled_commands: Vec<String>,
    }

    impl CoreAdapter for SessionApprovalRequiredAdapter {
        fn mode(&self) -> CoreMode {
            CoreMode::Local
        }

        fn mobile_usb_session_requires_approval(&self) -> bool {
            true
        }

        fn is_unlocked(&self) -> bool {
            false
        }

        fn handle(&mut self, req: &RpcRequest) -> RpcResponse {
            self.handled_commands.push(req.command.clone());
            RpcResponse::Error {
                ok: false,
                error: "unexpected call".to_string(),
                code: Some("UNEXPECTED".to_string()),
            }
        }

        fn handle_with_stream(
            &mut self,
            _req: &RpcRequest,
            _stream: Option<chromvoid_core::rpc::RpcInputStream>,
        ) -> chromvoid_core::rpc::RpcReply {
            chromvoid_core::rpc::RpcReply::Json(RpcResponse::Error {
                ok: false,
                error: "unexpected call".to_string(),
                code: Some("UNEXPECTED".to_string()),
            })
        }

        fn save(&mut self) -> Result<(), String> {
            Ok(())
        }

        fn take_events(&mut self) -> Vec<Value> {
            Vec::new()
        }

        fn set_master_key(&mut self, _key: Option<String>) {}
    }

    #[test]
    fn module_runtime_support_skips_mobile_usb_before_session_approval() {
        let mut adapter = SessionApprovalRequiredAdapter {
            handled_commands: Vec::new(),
        };

        let support = module_runtime_support_for_adapter(&mut adapter);

        assert!(!support.crypto_wallet);
        assert!(!support.env_runtime_local);
        assert!(adapter.handled_commands.is_empty());
    }

    #[test]
    fn resolving_modules_sends_no_rpc_before_mobile_usb_session_approval() {
        let mut adapter = SessionApprovalRequiredAdapter {
            handled_commands: Vec::new(),
        };

        for module in ALL_MODULES {
            let _ = resolve_for_adapter(&mut adapter, module, &supported_caps());
        }

        assert!(adapter.handled_commands.is_empty());
    }
}
