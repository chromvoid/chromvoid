#![cfg_attr(not(target_os = "android"), allow(dead_code))]

use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};

use crate::core_adapter::LocalCoreAdapter;
use crate::CoreAdapter;
use tauri::Manager;

static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();
static PROVIDER_RUNTIME: OnceLock<Arc<AndroidProviderRuntimeState>> = OnceLock::new();

pub struct AndroidProviderRuntimeState {
    fallback_adapter: Mutex<Option<Arc<Mutex<Box<dyn CoreAdapter>>>>>,
}

impl AndroidProviderRuntimeState {
    pub const fn new() -> Self {
        Self {
            fallback_adapter: Mutex::new(None),
        }
    }

    fn fallback_adapter(&self) -> Option<Arc<Mutex<Box<dyn CoreAdapter>>>> {
        self.fallback_adapter
            .lock()
            .ok()
            .and_then(|guard| guard.clone())
    }

    fn set_fallback_adapter(
        &self,
        adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    ) -> Result<(), String> {
        let mut guard = self
            .fallback_adapter
            .lock()
            .map_err(|_| "Android provider runtime mutex poisoned".to_string())?;
        *guard = Some(adapter);
        Ok(())
    }
}

pub(crate) fn shared_provider_runtime() -> Arc<AndroidProviderRuntimeState> {
    PROVIDER_RUNTIME
        .get_or_init(|| Arc::new(AndroidProviderRuntimeState::new()))
        .clone()
}

pub fn register_app_handle(app: tauri::AppHandle) {
    if APP_HANDLE.set(app).is_err() {
        tracing::warn!("android_runtime: app handle already registered");
    }
}

pub(crate) fn app_handle() -> Option<tauri::AppHandle> {
    APP_HANDLE.get().cloned()
}

fn app_state_runtime<T>(
    f: impl FnOnce(tauri::State<'_, crate::app_state::AppState>) -> Arc<T>,
) -> Option<Arc<T>> {
    let app = APP_HANDLE.get()?;
    app.try_state::<crate::app_state::AppState>().map(f)
}

fn app_adapter() -> Option<Arc<Mutex<Box<dyn CoreAdapter>>>> {
    app_state_runtime(|state| state.adapter.clone())
}

fn app_android_provider_runtime() -> Option<Arc<AndroidProviderRuntimeState>> {
    app_state_runtime(|state| state.android_provider_runtime.clone())
}

#[cfg(target_os = "android")]
pub fn app_mobile_acceptor_runtime(
) -> Option<Arc<crate::network::mobile_acceptor::MobileAcceptorRuntimeState>> {
    app_state_runtime(|state| state.mobile_acceptor_runtime.clone())
}

pub fn app_android_native_upload_runtime(
) -> Option<Arc<crate::mobile::android::AndroidNativeUploadRuntimeState>> {
    app_state_runtime(|state| state.android_native_upload_runtime.clone())
}

pub fn app_android_saf_picker_runtime(
) -> Option<Arc<crate::mobile::android::AndroidSafPickerRuntimeState>> {
    app_state_runtime(|state| state.android_saf_picker_runtime.clone())
}

pub fn app_android_biometric_runtime(
) -> Option<Arc<crate::mobile::android::AndroidBiometricRuntimeState>> {
    app_state_runtime(|state| state.android_biometric_runtime.clone())
}

pub fn app_android_password_save_runtime(
) -> Option<Arc<crate::mobile::android::AndroidPasswordSaveRuntimeState>> {
    app_state_runtime(|state| state.android_password_save_runtime.clone())
}

pub fn app_android_autofill_runtime(
) -> Option<Arc<crate::mobile::android::AndroidAutofillRuntimeState>> {
    app_state_runtime(|state| state.android_autofill_runtime.clone())
}

pub fn ensure_shared_local_adapter(data_dir: &Path) -> Result<(), String> {
    if runtime_ready() {
        return Ok(());
    }

    let storage_root = crate::helpers::load_storage_root(data_dir);
    std::fs::create_dir_all(&storage_root)
        .map_err(|error| format!("Failed to create storage directory: {error}"))?;

    let adapter = LocalCoreAdapter::new_with_license_store(
        storage_root,
        crate::pro::license_vault_dir(data_dir),
        crate::pro::current_build_policy(),
    )?;
    shared_provider_runtime().set_fallback_adapter(Arc::new(Mutex::new(
        Box::new(adapter) as Box<dyn CoreAdapter>
    )))?;

    Ok(())
}

pub fn provider_adapter() -> Option<Arc<Mutex<Box<dyn CoreAdapter>>>> {
    app_adapter().or_else(|| {
        app_android_provider_runtime()
            .unwrap_or_else(shared_provider_runtime)
            .fallback_adapter()
    })
}

pub fn runtime_ready() -> bool {
    provider_adapter().is_some()
}

pub fn with_shared_provider_adapter<T>(
    f: impl FnOnce(&mut dyn CoreAdapter) -> T,
) -> Result<T, String> {
    let Some(adapter_handle) = provider_adapter() else {
        return Err("Autofill unavailable: provider bridge is not active".to_string());
    };

    let mut adapter = adapter_handle
        .lock()
        .map_err(|_| "Autofill unavailable: provider bridge is not active".to_string())?;
    Ok(f(adapter.as_mut()))
}

#[cfg(test)]
pub(crate) fn register_test_provider_adapter(adapter: Arc<Mutex<Box<dyn CoreAdapter>>>) {
    let _ = shared_provider_runtime().set_fallback_adapter(adapter);
}

#[cfg(test)]
mod tests {
    use super::*;
    use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
    use chromvoid_core::rpc::{RpcInputStream, RpcReply};
    use serde_json::Value;

    struct NoopAdapter;

    impl CoreAdapter for NoopAdapter {
        fn mode(&self) -> crate::CoreMode {
            crate::CoreMode::Local
        }

        fn is_unlocked(&self) -> bool {
            false
        }

        fn handle(&mut self, _req: &RpcRequest) -> RpcResponse {
            RpcResponse::error("unsupported command", Some("UNKNOWN_COMMAND"))
        }

        fn handle_with_stream(
            &mut self,
            req: &RpcRequest,
            _stream: Option<RpcInputStream>,
        ) -> RpcReply {
            RpcReply::Json(self.handle(req))
        }

        fn save(&mut self) -> Result<(), String> {
            Ok(())
        }

        fn take_events(&mut self) -> Vec<Value> {
            Vec::new()
        }

        fn set_master_key(&mut self, _key: Option<String>) {}
    }

    fn noop_adapter_handle() -> Arc<Mutex<Box<dyn CoreAdapter>>> {
        Arc::new(Mutex::new(Box::new(NoopAdapter) as Box<dyn CoreAdapter>))
    }

    #[test]
    fn shared_provider_runtime_returns_same_instance() {
        let first = shared_provider_runtime();
        let second = shared_provider_runtime();

        assert!(Arc::ptr_eq(&first, &second));
    }

    #[test]
    fn runtime_ready_reflects_shared_fallback_adapter() {
        shared_provider_runtime()
            .set_fallback_adapter(noop_adapter_handle())
            .expect("set fallback adapter");

        assert!(runtime_ready());
    }

    #[test]
    fn ensure_shared_local_adapter_reuses_existing_ready_runtime() {
        shared_provider_runtime()
            .set_fallback_adapter(noop_adapter_handle())
            .expect("set fallback adapter");

        let missing_data_dir = Path::new("/definitely/missing/chromvoid/provider/runtime");

        assert!(ensure_shared_local_adapter(missing_data_dir).is_ok());
    }

    #[test]
    fn set_fallback_adapter_maps_poisoned_mutex() {
        let runtime = Arc::new(AndroidProviderRuntimeState::new());
        let poisoned = runtime.clone();

        let _ = std::thread::spawn(move || {
            let _guard = poisoned
                .fallback_adapter
                .lock()
                .expect("fallback adapter lock");
            panic!("poison fallback adapter lock");
        })
        .join();

        let error = runtime
            .set_fallback_adapter(noop_adapter_handle())
            .expect_err("poisoned runtime should fail");

        assert_eq!(error, "Android provider runtime mutex poisoned");
    }
}
