use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use chromvoid_core::license::{
    feature_set_from_snapshot, BuildPolicy, EntitlementSnapshot, SignedCert,
    PRO_FEATURE_BROWSER_EXTENSION, PRO_FEATURE_CREDENTIAL_PROVIDER, PRO_FEATURE_CRYPTO_WALLET,
    PRO_FEATURE_EMERGENCY_ACCESS, PRO_FEATURE_MOUNTED_VAULT, PRO_FEATURE_REMOTE,
    PRO_FEATURE_SSH_AGENT,
};
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::app_state::AppState;
use crate::core_adapter::{CoreAdapter, CoreMode};
use crate::types::{rpc_err, rpc_ok, RpcResult, RuntimeCapabilities, TauriRpcResult};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ModuleAccessStatus {
    Unsupported,
    DisabledByRollout,
    EntitlementUnavailable,
    LockedPro,
    Enabled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) struct ModuleAccessState {
    pub(crate) feature_key: String,
    pub(crate) status: ModuleAccessStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) denial_code: Option<String>,
}

#[derive(Debug, Clone)]
struct ProRolloutConfig {
    global_enabled: bool,
    disabled_features: BTreeSet<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct LicenseActivationCodeActivateArgs {
    pub(crate) activation_code: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct LicenseSeatStatusArgs {}

#[derive(Debug, Deserialize)]
pub(crate) struct ModuleAccessResolveArgs {
    pub(crate) feature_key: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct LicenseFingerprintResult {
    device_fingerprint: String,
}

#[derive(Debug, Deserialize)]
struct LicenseHttpErrorBody {
    code: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PendingLicenseDeactivation {
    cert: SignedCert,
    device_fingerprint: String,
    created_at_ms: u64,
}

const LICENSE_HTTP_TIMEOUT: Duration = Duration::from_secs(10);
const PENDING_LICENSE_DEACTIVATION_FILE: &str = "pending_deactivation.json";

pub(crate) fn current_build_policy() -> BuildPolicy {
    match std::env::var("CHROMVOID_PRO_BUILD_POLICY") {
        Ok(value) if value.eq_ignore_ascii_case("enforce") => BuildPolicy::Enforce,
        _ => BuildPolicy::default_for_build(),
    }
}

pub(crate) fn license_vault_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("license_vault")
}

#[cfg(desktop)]
pub(crate) fn guard_pro_feature(
    state: &tauri::State<'_, AppState>,
    feature_key: &str,
) -> Result<(), RpcResult<Value>> {
    let caps = crate::types::runtime_capabilities_for_current_target();
    let mut adapter = state
        .adapter
        .lock()
        .map_err(|_| rpc_err("Adapter mutex poisoned", Some("INTERNAL".to_string())))?;
    guard_pro_feature_for_adapter(adapter.as_mut(), feature_key, &caps)
}

pub(crate) async fn guard_pro_feature_async(
    state: &tauri::State<'_, AppState>,
    feature_key: &str,
) -> Result<(), RpcResult<Value>> {
    let caps = crate::types::runtime_capabilities_for_current_target();
    let feature_key = feature_key.to_string();
    run_pro_rpc_adapter_task(state, "Pro feature guard", "INTERNAL", move |adapter| {
        guard_pro_feature_for_adapter(adapter, &feature_key, &caps)
    })
    .await
}

pub(crate) fn guard_pro_feature_for_adapter(
    adapter: &mut dyn CoreAdapter,
    feature_key: &str,
    caps: &RuntimeCapabilities,
) -> Result<(), RpcResult<Value>> {
    let entitlement = entitlement_snapshot_for_adapter(adapter);
    let access = resolve_module_access(feature_key, caps, entitlement.as_ref());
    if access.status == ModuleAccessStatus::Enabled {
        return Ok(());
    }
    Err(rpc_err(
        format!("Pro feature unavailable: {feature_key}"),
        access.denial_code,
    ))
}

pub(crate) fn resolve_for_adapter(
    adapter: &mut dyn CoreAdapter,
    feature_key: &str,
    caps: &RuntimeCapabilities,
) -> ModuleAccessState {
    let entitlement = entitlement_snapshot_for_adapter(adapter);
    resolve_module_access(feature_key, caps, entitlement.as_ref())
}

pub(crate) fn entitlement_snapshot_for_adapter(
    adapter: &mut dyn CoreAdapter,
) -> Option<EntitlementSnapshot> {
    let response = adapter.handle(&RpcRequest::new("license:status", Value::Null));
    let mut snapshot = match response {
        RpcResponse::Success { result, .. } => {
            serde_json::from_value::<EntitlementSnapshot>(result).ok()?
        }
        RpcResponse::Error { .. } => return None,
    };
    if matches!(adapter.mode(), CoreMode::Remote { .. }) {
        snapshot.source_core = "remote_host".to_string();
    }
    Some(snapshot)
}

async fn run_pro_rpc_adapter_task<T, F>(
    state: &tauri::State<'_, AppState>,
    task_label: &'static str,
    unavailable_code: &'static str,
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
            let mut adapter = adapter.lock().map_err(|_| {
                rpc_err("Adapter mutex poisoned", Some(unavailable_code.to_string()))
            })?;
            task(adapter.as_mut())
        })
        .await
    {
        Ok(result) => result,
        Err(error) => {
            let (message, code) = error.into_rpc_error(task_label);
            Err(rpc_err(
                message,
                code.or_else(|| Some(unavailable_code.to_string())),
            ))
        }
    }
}

async fn run_pro_string_adapter_task<T, F>(
    state: &tauri::State<'_, AppState>,
    task_label: &'static str,
    task: F,
) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&mut dyn CoreAdapter) -> Result<T, String> + Send + 'static,
{
    let adapter = state.adapter.clone();
    match state
        .catalog_blocking_io_runtime
        .spawn_blocking(move || {
            let mut adapter = adapter
                .lock()
                .map_err(|_| "Adapter mutex poisoned".to_string())?;
            task(adapter.as_mut())
        })
        .await
    {
        Ok(result) => result,
        Err(error) => {
            let (message, _code) = error.into_rpc_error(task_label);
            Err(message)
        }
    }
}

pub(crate) fn resolve_module_access(
    feature_key: &str,
    caps: &RuntimeCapabilities,
    entitlement: Option<&EntitlementSnapshot>,
) -> ModuleAccessState {
    resolve_module_access_with_rollout(feature_key, caps, entitlement, &ProRolloutConfig::current())
}

fn resolve_module_access_with_rollout(
    feature_key: &str,
    caps: &RuntimeCapabilities,
    entitlement: Option<&EntitlementSnapshot>,
    rollout: &ProRolloutConfig,
) -> ModuleAccessState {
    if !is_feature_supported(feature_key, caps) {
        return denied(
            feature_key,
            ModuleAccessStatus::Unsupported,
            "FEATURE_UNSUPPORTED_ON_PLATFORM",
        );
    }
    if !rollout.global_enabled || rollout.disabled_features.contains(feature_key) {
        return denied(
            feature_key,
            ModuleAccessStatus::DisabledByRollout,
            "FEATURE_DISABLED_BY_ROLLOUT",
        );
    }

    let Some(entitlement) = entitlement else {
        return denied(
            feature_key,
            ModuleAccessStatus::EntitlementUnavailable,
            "ENTITLEMENT_UNAVAILABLE",
        );
    };

    let feature_keys = feature_set_from_snapshot(entitlement);
    if feature_keys.contains(feature_key) {
        enabled(feature_key)
    } else {
        denied(feature_key, ModuleAccessStatus::LockedPro, "PRO_REQUIRED")
    }
}

#[tauri::command]
pub(crate) async fn license_activation_code_activate(
    state: tauri::State<'_, AppState>,
    args: LicenseActivationCodeActivateArgs,
) -> Result<RpcResult<Value>, String> {
    let activation_code = args.activation_code.trim();
    if activation_code.is_empty() {
        return Ok(rpc_err(
            "activation_code is required",
            Some("BAD_REQUEST".to_string()),
        ));
    }

    let device_fingerprint = match license_device_fingerprint(&state).await {
        Ok(value) => value,
        Err(error) => return Ok(error),
    };

    let api_base = license_api_base();
    let url = format!("{}/api/license/activate-code", api_base);
    let client = match license_http_client() {
        Ok(client) => client,
        Err(error) => {
            return Ok(rpc_err(
                format!("Activation code request failed: {error}"),
                Some("LICENSE_ACTIVATION_FAILED".to_string()),
            ))
        }
    };
    let cert = match client
        .post(url)
        .json(&serde_json::json!({
            "activation_code": activation_code,
            "device_fingerprint": device_fingerprint,
        }))
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => match response.json::<SignedCert>().await
        {
            Ok(cert) => cert,
            Err(error) => {
                return Ok(rpc_err(
                    format!("Invalid activation code response: {error}"),
                    Some("LICENSE_ACTIVATION_FAILED".to_string()),
                ))
            }
        },
        Ok(response) => {
            return Ok(rpc_err(
                license_http_error_message(response, "Activation code failed").await,
                Some("LICENSE_ACTIVATION_FAILED".to_string()),
            ))
        }
        Err(error) => {
            return Ok(rpc_err(
                format!("Activation code request failed: {error}"),
                Some("LICENSE_ACTIVATION_FAILED".to_string()),
            ))
        }
    };

    install_license_cert(&state, cert).await
}

#[tauri::command]
pub(crate) async fn license_account_cabinet_handoff(
    state: tauri::State<'_, AppState>,
) -> Result<RpcResult<Value>, String> {
    let cert = match current_license_cert(&state).await {
        Ok(cert) => cert,
        Err(error) => return Ok(error),
    };
    let device_fingerprint = cert.payload.device_fingerprint.clone();
    let client = match license_http_client() {
        Ok(client) => client,
        Err(error) => {
            return Ok(rpc_err(
                format!("License cabinet handoff request failed: {error}"),
                Some("LICENSE_CABINET_HANDOFF_FAILED".to_string()),
            ))
        }
    };
    let response = match client
        .post(format!("{}/api/account/seat-handoff", license_api_base()))
        .json(&serde_json::json!({
            "cert": cert,
            "device_fingerprint": device_fingerprint,
        }))
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            return Ok(rpc_err(
                format!("License cabinet handoff request failed: {error}"),
                Some("LICENSE_CABINET_HANDOFF_FAILED".to_string()),
            ))
        }
    };

    Ok(license_json_response(
        response,
        "LICENSE_CABINET_HANDOFF_FAILED",
        "License cabinet handoff failed",
    )
    .await)
}

#[tauri::command]
pub(crate) async fn license_status(state: tauri::State<'_, AppState>) -> TauriRpcResult<Value> {
    Ok(
        match entitlement_snapshot_for_state(&state, "License status").await {
            Ok(snapshot) => license_status_from_snapshot(snapshot),
            Err(error) => error,
        },
    )
}

async fn entitlement_snapshot_for_state(
    state: &tauri::State<'_, AppState>,
    task_label: &'static str,
) -> Result<Option<EntitlementSnapshot>, RpcResult<Value>> {
    run_pro_rpc_adapter_task(state, task_label, "ENTITLEMENT_UNAVAILABLE", |adapter| {
        Ok(entitlement_snapshot_for_adapter(adapter))
    })
    .await
}

fn module_access_error<T>(error: RpcResult<Value>) -> RpcResult<T> {
    match error {
        RpcResult::Error { error, code, .. } => RpcResult::Error {
            ok: false,
            error,
            code,
        },
        RpcResult::Success { .. } => RpcResult::Error {
            ok: false,
            error: "Module access unavailable".to_string(),
            code: Some("ENTITLEMENT_UNAVAILABLE".to_string()),
        },
    }
}

fn license_status_from_snapshot(snapshot: Option<EntitlementSnapshot>) -> RpcResult<Value> {
    match snapshot {
        Some(snapshot) => rpc_ok(entitlement_snapshot_json(snapshot)),
        None => rpc_err(
            "License status unavailable",
            Some("ENTITLEMENT_UNAVAILABLE".to_string()),
        ),
    }
}

fn entitlement_snapshot_json(snapshot: EntitlementSnapshot) -> Value {
    match serde_json::to_value(snapshot) {
        Ok(value) => value,
        Err(error) => {
            tracing::warn!("license: failed to serialize entitlement snapshot: {error}");
            Value::Null
        }
    }
}

#[tauri::command]
pub(crate) async fn license_seat_status(
    state: tauri::State<'_, AppState>,
    _args: LicenseSeatStatusArgs,
) -> Result<RpcResult<Value>, String> {
    let client = match license_http_client() {
        Ok(client) => client,
        Err(error) => {
            return Ok(rpc_err(
                format!("License seat status request failed: {error}"),
                Some("LICENSE_SEAT_STATUS_FAILED".to_string()),
            ))
        }
    };
    let api_base = license_api_base();

    let cert = match current_license_cert(&state).await {
        Ok(cert) => cert,
        Err(error) => return Ok(error),
    };
    let device_fingerprint = cert.payload.device_fingerprint.clone();
    let response = match client
        .post(format!("{}/api/license/status", api_base))
        .json(&serde_json::json!({
            "cert": cert,
            "device_fingerprint": device_fingerprint,
        }))
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            return Ok(rpc_err(
                format!("License seat status request failed: {error}"),
                Some("LICENSE_SEAT_STATUS_FAILED".to_string()),
            ))
        }
    };

    Ok(license_json_response(
        response,
        "LICENSE_SEAT_STATUS_FAILED",
        "License seat status failed",
    )
    .await)
}

#[tauri::command]
pub(crate) async fn license_current_seat_deactivate(
    state: tauri::State<'_, AppState>,
) -> Result<RpcResult<Value>, String> {
    let pending = match read_pending_license_deactivation(&state).await {
        Ok(Some(pending)) => pending,
        Ok(None) => {
            let cert = match current_license_cert(&state).await {
                Ok(cert) => cert,
                Err(error) => return Ok(error),
            };
            let pending = PendingLicenseDeactivation {
                device_fingerprint: cert.payload.device_fingerprint.clone(),
                cert,
                created_at_ms: current_time_ms(),
            };
            if let Err(error) = write_pending_license_deactivation(&state, pending.clone()).await {
                return Ok(rpc_err(
                    format!("Failed to stage license seat release: {error}"),
                    Some("LICENSE_SEAT_RELEASE_FAILED".to_string()),
                ));
            }
            pending
        }
        Err(error) => {
            return Ok(rpc_err(
                format!("Failed to read pending license seat release: {error}"),
                Some("LICENSE_SEAT_RELEASE_FAILED".to_string()),
            ))
        }
    };

    let uninstall = uninstall_license_cert(&state).await?;
    let RpcResult::Success { .. } = uninstall else {
        return Ok(uninstall);
    };

    let response = match release_pending_license_deactivation(&pending).await {
        Ok(response) => response,
        Err(error) => {
            return Ok(rpc_err(
                format!("License seat release request failed: {error}"),
                Some("LICENSE_SEAT_RELEASE_FAILED".to_string()),
            ))
        }
    };
    let seat_status = license_json_response(
        response,
        "LICENSE_SEAT_RELEASE_FAILED",
        "License seat release failed",
    )
    .await;
    let RpcResult::Success { result, .. } = seat_status else {
        return Ok(seat_status);
    };

    if let Err(error) = remove_pending_license_deactivation(&state).await {
        return Ok(rpc_err(
            format!("License seat released but pending release cleanup failed: {error}"),
            Some("LICENSE_SEAT_RELEASE_FAILED".to_string()),
        ));
    }

    Ok(rpc_ok(result))
}

#[tauri::command]
pub(crate) async fn module_access_snapshot(
    state: tauri::State<'_, AppState>,
) -> TauriRpcResult<Vec<ModuleAccessState>> {
    let caps = crate::types::runtime_capabilities_for_current_target();
    let entitlement = match entitlement_snapshot_for_state(&state, "Module access snapshot").await {
        Ok(entitlement) => entitlement,
        Err(error) => return Ok(module_access_error(error)),
    };
    Ok(rpc_ok(
        all_pro_feature_keys()
            .iter()
            .map(|feature| resolve_module_access(feature, &caps, entitlement.as_ref()))
            .collect(),
    ))
}

#[tauri::command]
pub(crate) async fn module_access_resolve(
    state: tauri::State<'_, AppState>,
    args: ModuleAccessResolveArgs,
) -> TauriRpcResult<ModuleAccessState> {
    let caps = crate::types::runtime_capabilities_for_current_target();
    let feature_key = args.feature_key;
    match run_pro_rpc_adapter_task(
        &state,
        "Module access resolve",
        "ENTITLEMENT_UNAVAILABLE",
        move |adapter| Ok(resolve_for_adapter(adapter, &feature_key, &caps)),
    )
    .await
    {
        Ok(access) => Ok(rpc_ok(access)),
        Err(error) => Ok(module_access_error(error)),
    }
}

fn all_pro_feature_keys() -> &'static [&'static str] {
    &[
        PRO_FEATURE_REMOTE,
        PRO_FEATURE_CREDENTIAL_PROVIDER,
        PRO_FEATURE_SSH_AGENT,
        PRO_FEATURE_CRYPTO_WALLET,
        PRO_FEATURE_EMERGENCY_ACCESS,
        PRO_FEATURE_BROWSER_EXTENSION,
        PRO_FEATURE_MOUNTED_VAULT,
    ]
}

impl ProRolloutConfig {
    fn current() -> Self {
        let global_enabled = std::env::var("CHROMVOID_PRO_ROLLOUT_ENABLED")
            .map(|value| !(value == "0" || value.eq_ignore_ascii_case("false")))
            .unwrap_or(true);
        let disabled_features = std::env::var("CHROMVOID_PRO_DISABLED_FEATURES")
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
        Self {
            global_enabled,
            disabled_features,
        }
    }
}

fn is_feature_supported(feature_key: &str, caps: &RuntimeCapabilities) -> bool {
    match feature_key {
        PRO_FEATURE_REMOTE => caps.supports_network_remote,
        PRO_FEATURE_CREDENTIAL_PROVIDER => caps.supports_autofill,
        PRO_FEATURE_SSH_AGENT => cfg!(desktop),
        PRO_FEATURE_BROWSER_EXTENSION => caps.supports_gateway,
        PRO_FEATURE_MOUNTED_VAULT => caps.supports_volume,
        PRO_FEATURE_CRYPTO_WALLET | PRO_FEATURE_EMERGENCY_ACCESS => false,
        _ => false,
    }
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

fn license_api_base() -> String {
    std::env::var("CHROMVOID_LICENSE_API_BASE_URL")
        .unwrap_or_else(|_| "https://chromvoid.com".to_string())
        .trim_end_matches('/')
        .to_string()
}

fn license_http_client() -> Result<reqwest::Client, reqwest::Error> {
    reqwest::Client::builder()
        .timeout(LICENSE_HTTP_TIMEOUT)
        .connect_timeout(LICENSE_HTTP_TIMEOUT)
        .build()
}

async fn release_pending_license_deactivation(
    pending: &PendingLicenseDeactivation,
) -> Result<reqwest::Response, reqwest::Error> {
    license_http_client()?
        .post(format!("{}/api/license/deactivate", license_api_base()))
        .json(&serde_json::json!({
            "cert": &pending.cert,
            "device_fingerprint": &pending.device_fingerprint,
        }))
        .send()
        .await
}

fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn pending_license_deactivation_path(license_root: &Path) -> PathBuf {
    license_root.join(PENDING_LICENSE_DEACTIVATION_FILE)
}

async fn read_pending_license_deactivation(
    state: &tauri::State<'_, AppState>,
) -> Result<Option<PendingLicenseDeactivation>, String> {
    let license_root = state.license_root.clone();
    state
        .catalog_blocking_io_runtime
        .spawn_blocking(move || read_pending_license_deactivation_file(&license_root))
        .await
        .map_err(|error| format!("pending license deactivation read task failed: {error:?}"))?
}

async fn write_pending_license_deactivation(
    state: &tauri::State<'_, AppState>,
    pending: PendingLicenseDeactivation,
) -> Result<(), String> {
    let license_root = state.license_root.clone();
    state
        .catalog_blocking_io_runtime
        .spawn_blocking(move || write_pending_license_deactivation_file(&license_root, &pending))
        .await
        .map_err(|error| format!("pending license deactivation write task failed: {error:?}"))?
}

async fn remove_pending_license_deactivation(
    state: &tauri::State<'_, AppState>,
) -> Result<(), String> {
    let license_root = state.license_root.clone();
    state
        .catalog_blocking_io_runtime
        .spawn_blocking(move || remove_pending_license_deactivation_file(&license_root))
        .await
        .map_err(|error| format!("pending license deactivation cleanup task failed: {error:?}"))?
}

fn read_pending_license_deactivation_file(
    license_root: &Path,
) -> Result<Option<PendingLicenseDeactivation>, String> {
    let path = pending_license_deactivation_path(license_root);
    let bytes = match std::fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("read {}: {error}", path.display())),
    };
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|error| format!("parse {}: {error}", path.display()))
}

fn write_pending_license_deactivation_file(
    license_root: &Path,
    pending: &PendingLicenseDeactivation,
) -> Result<(), String> {
    std::fs::create_dir_all(license_root)
        .map_err(|error| format!("create {}: {error}", license_root.display()))?;
    crate::helpers::storage::write_json_pretty_atomic(
        &pending_license_deactivation_path(license_root),
        pending,
    )
}

fn remove_pending_license_deactivation_file(license_root: &Path) -> Result<(), String> {
    let path = pending_license_deactivation_path(license_root);
    match std::fs::remove_file(&path) {
        Ok(()) => sync_parent_dir_best_effort(license_root),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("remove {}: {error}", path.display())),
    }
}

fn sync_parent_dir_best_effort(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        std::fs::File::open(path)
            .and_then(|dir| dir.sync_all())
            .map_err(|error| format!("sync {}: {error}", path.display()))?;
    }
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
}

async fn license_device_fingerprint(
    state: &tauri::State<'_, AppState>,
) -> Result<String, RpcResult<Value>> {
    run_pro_rpc_adapter_task(
        state,
        "License fingerprint",
        "ENTITLEMENT_UNAVAILABLE",
        |adapter| match adapter.handle(&RpcRequest::new("license:fingerprint", Value::Null)) {
            RpcResponse::Success { result, .. } => {
                match serde_json::from_value::<LicenseFingerprintResult>(result) {
                    Ok(result) => Ok(result.device_fingerprint),
                    Err(error) => Err(rpc_err(
                        format!("Invalid license fingerprint response: {error}"),
                        Some("ENTITLEMENT_UNAVAILABLE".to_string()),
                    )),
                }
            }
            RpcResponse::Error { error, code, .. } => Err(rpc_err(error, code)),
        },
    )
    .await
}

async fn current_license_cert(
    state: &tauri::State<'_, AppState>,
) -> Result<SignedCert, RpcResult<Value>> {
    run_pro_rpc_adapter_task(
        state,
        "Current license cert",
        "ENTITLEMENT_UNAVAILABLE",
        |adapter| match adapter.handle(&RpcRequest::new("license:cert", Value::Null)) {
            RpcResponse::Success { result, .. } => serde_json::from_value::<SignedCert>(result)
                .map_err(|error| {
                    rpc_err(
                        format!("Invalid license cert response: {error}"),
                        Some("LICENSE_INVALID".to_string()),
                    )
                }),
            RpcResponse::Error { error, code, .. } => Err(rpc_err(error, code)),
        },
    )
    .await
}

async fn install_license_cert(
    state: &tauri::State<'_, AppState>,
    cert: SignedCert,
) -> Result<RpcResult<Value>, String> {
    run_pro_string_adapter_task(
        state,
        "Install license cert",
        move |adapter| match adapter.handle(&RpcRequest::new(
            "license:install",
            serde_json::json!({ "cert": cert }),
        )) {
            RpcResponse::Success { result, .. } => Ok(rpc_ok(result)),
            RpcResponse::Error { error, code, .. } => Ok(rpc_err(error, code)),
        },
    )
    .await
}

async fn uninstall_license_cert(
    state: &tauri::State<'_, AppState>,
) -> Result<RpcResult<Value>, String> {
    run_pro_string_adapter_task(state, "Uninstall license cert", |adapter| {
        match adapter.handle(&RpcRequest::new("license:uninstall", Value::Null)) {
            RpcResponse::Success { result, .. } => Ok(rpc_ok(result)),
            RpcResponse::Error { error, code, .. } => Ok(rpc_err(error, code)),
        }
    })
    .await
}

async fn license_json_response(
    response: reqwest::Response,
    error_code: &str,
    context: &str,
) -> RpcResult<Value> {
    let status = response.status();
    if status.is_success() {
        return match response.json::<Value>().await {
            Ok(value) => rpc_ok(value),
            Err(error) => rpc_err(
                format!("Invalid license response: {error}"),
                Some(error_code.to_string()),
            ),
        };
    }

    rpc_err(
        license_http_error_message_with_status(
            status,
            response.text().await.ok().as_deref(),
            context,
        ),
        Some(error_code.to_string()),
    )
}

async fn license_http_error_message(response: reqwest::Response, context: &str) -> String {
    let status = response.status();
    let body = response.text().await.ok();
    license_http_error_message_with_status(status, body.as_deref(), context)
}

fn license_http_error_message_with_status(
    status: reqwest::StatusCode,
    body: Option<&str>,
    context: &str,
) -> String {
    let body = body.unwrap_or("").trim();
    if !body.is_empty() {
        if let Ok(parsed) = serde_json::from_str::<LicenseHttpErrorBody>(body) {
            if let Some(detail) = parsed
                .error
                .as_deref()
                .or(parsed.code.as_deref())
                .map(str::trim)
                .filter(|detail| !detail.is_empty())
            {
                return format!("{context}: {detail}");
            }
        }
        return format!("{context}: {status}: {body}");
    }

    format!("{context}: {status}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use chromvoid_core::license::{LicenseCert, LicensePlan, LICENSE_KEY_ID_2026_01};

    fn rollout_enabled() -> ProRolloutConfig {
        ProRolloutConfig {
            global_enabled: true,
            disabled_features: BTreeSet::new(),
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
            supports_biometric: true,
            supports_autofill: true,
            supports_media_stream_protocol: true,
            supports_native_audio_playback: false,
            supports_native_video_playback: false,
            supports_native_file_upload: false,
            supports_share_import: false,
            supports_native_otp_qr_scan: false,
            supports_mobile_backup_restore: false,
            supports_photo_library_save: false,
            supports_credential_provider_passkeys_lite: false,
            supports_android_native_video: false,
            android_native_audio_playback_rollout_enabled: false,
            supports_android_native_upload: false,
            supports_android_share_import: false,
            supports_android_native_otp_qr_scan: false,
            supports_storage_root_selection: true,
            supports_android_saf_backup_restore: false,
        }
    }

    fn snapshot(
        licensed: bool,
        plan: LicensePlan,
        feature_keys: Vec<&str>,
        build_policy: BuildPolicy,
    ) -> EntitlementSnapshot {
        EntitlementSnapshot {
            licensed,
            plan,
            feature_keys: feature_keys.into_iter().map(ToOwned::to_owned).collect(),
            source_core: "local".to_string(),
            build_policy,
        }
    }

    fn test_signed_cert() -> SignedCert {
        SignedCert {
            payload: LicenseCert {
                v: 1,
                kid: LICENSE_KEY_ID_2026_01.to_string(),
                license_id: "license-test".to_string(),
                featureset: "pro".to_string(),
                seat_limit: 3,
                device_fingerprint: "device-test".to_string(),
                issued_at: "2026-06-10T00:00:00Z".to_string(),
                exp: None,
                source: None,
            },
            signature: "signature".to_string(),
        }
    }

    #[test]
    fn pending_license_deactivation_roundtrips_and_clears() {
        let temp = tempfile::tempdir().expect("tempdir");
        let pending = PendingLicenseDeactivation {
            cert: test_signed_cert(),
            device_fingerprint: "device-test".to_string(),
            created_at_ms: 42,
        };

        write_pending_license_deactivation_file(temp.path(), &pending).expect("write pending");
        let loaded = read_pending_license_deactivation_file(temp.path())
            .expect("read pending")
            .expect("pending exists");

        assert_eq!(loaded.device_fingerprint, pending.device_fingerprint);
        assert_eq!(
            loaded.cert.payload.license_id,
            pending.cert.payload.license_id
        );
        remove_pending_license_deactivation_file(temp.path()).expect("remove pending");
        assert!(read_pending_license_deactivation_file(temp.path())
            .expect("read after remove")
            .is_none());
    }

    #[test]
    fn pending_license_deactivation_parse_error_is_reported() {
        let temp = tempfile::tempdir().expect("tempdir");
        std::fs::write(
            pending_license_deactivation_path(temp.path()),
            b"{not valid json",
        )
        .expect("write invalid pending");

        let error = read_pending_license_deactivation_file(temp.path())
            .expect_err("invalid tombstone must fail");

        assert!(error.contains("parse"));
    }

    #[test]
    fn license_http_client_builds_with_timeout_configuration() {
        license_http_client().expect("client");
    }

    #[test]
    fn license_http_error_message_uses_backend_error_json() {
        let message = license_http_error_message_with_status(
            reqwest::StatusCode::BAD_REQUEST,
            Some(r#"{"code":"ERR_ACTIVATION_CODE_INVALID","error":"ERR_ACTIVATION_CODE_INVALID"}"#),
            "Activation code failed",
        );

        assert_eq!(
            message,
            "Activation code failed: ERR_ACTIVATION_CODE_INVALID"
        );
    }

    #[test]
    fn license_http_error_message_keeps_plain_body_for_non_json_errors() {
        let message = license_http_error_message_with_status(
            reqwest::StatusCode::BAD_REQUEST,
            Some("plain failure"),
            "Activation code failed",
        );

        assert_eq!(
            message,
            "Activation code failed: 400 Bad Request: plain failure"
        );
    }

    #[test]
    fn resolve_keeps_free_bypass_snapshot_locked_for_ui() {
        let entitlement = EntitlementSnapshot::free(BuildPolicy::Bypass);
        let access = resolve_module_access_with_rollout(
            PRO_FEATURE_REMOTE,
            &supported_caps(),
            Some(&entitlement),
            &rollout_enabled(),
        );

        assert_eq!(access.status, ModuleAccessStatus::LockedPro);
        assert_eq!(access.denial_code.as_deref(), Some("PRO_REQUIRED"));
    }

    #[test]
    fn resolve_reports_entitlement_unavailable_without_snapshot() {
        let access = resolve_module_access_with_rollout(
            PRO_FEATURE_REMOTE,
            &supported_caps(),
            None,
            &rollout_enabled(),
        );

        assert_eq!(access.status, ModuleAccessStatus::EntitlementUnavailable);
        assert_eq!(
            access.denial_code.as_deref(),
            Some("ENTITLEMENT_UNAVAILABLE")
        );
    }

    #[test]
    fn resolve_enables_entitled_feature_under_enforce_policy() {
        let entitlement = snapshot(
            true,
            LicensePlan::Pro,
            vec![PRO_FEATURE_REMOTE],
            BuildPolicy::Enforce,
        );
        let access = resolve_module_access_with_rollout(
            PRO_FEATURE_REMOTE,
            &supported_caps(),
            Some(&entitlement),
            &rollout_enabled(),
        );

        assert_eq!(access.status, ModuleAccessStatus::Enabled);
        assert_eq!(access.denial_code, None);
    }

    #[test]
    fn guard_requires_entitlement_even_for_bypass_snapshot() {
        let entitlement = EntitlementSnapshot::free(BuildPolicy::Bypass);
        let locked = resolve_module_access_with_rollout(
            PRO_FEATURE_REMOTE,
            &supported_caps(),
            Some(&entitlement),
            &rollout_enabled(),
        );

        assert_ne!(locked.status, ModuleAccessStatus::Enabled);
    }
}
