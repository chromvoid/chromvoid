#![cfg_attr(not(target_os = "android"), allow(dead_code))]

use std::path::Path;
use std::sync::{Arc, Mutex};

use crate::core_adapter::LocalCoreAdapter;
use crate::CoreAdapter;

static SHARED_ANDROID_ADAPTER: Mutex<Option<Arc<Mutex<Box<dyn CoreAdapter>>>>> = Mutex::new(None);

pub fn register_shared_app_adapter(adapter: Arc<Mutex<Box<dyn CoreAdapter>>>) {
    if let Ok(mut guard) = SHARED_ANDROID_ADAPTER.lock() {
        *guard = Some(adapter);
    }
}

pub fn ensure_shared_local_adapter(data_dir: &Path) -> Result<(), String> {
    if runtime_ready() {
        return Ok(());
    }

    let storage_root = crate::helpers::load_storage_root(data_dir);
    std::fs::create_dir_all(&storage_root)
        .map_err(|error| format!("Failed to create storage directory: {error}"))?;

    let adapter = LocalCoreAdapter::new(storage_root)?;
    register_shared_app_adapter(Arc::new(Mutex::new(
        Box::new(adapter) as Box<dyn CoreAdapter>
    )));

    Ok(())
}

pub fn shared_app_adapter() -> Option<Arc<Mutex<Box<dyn CoreAdapter>>>> {
    SHARED_ANDROID_ADAPTER
        .lock()
        .ok()
        .and_then(|guard| guard.clone())
}

pub fn runtime_ready() -> bool {
    shared_app_adapter().is_some()
}

pub fn with_shared_provider_adapter<T>(
    f: impl FnOnce(&mut dyn CoreAdapter) -> T,
) -> Result<T, String> {
    let Some(adapter_handle) = shared_app_adapter() else {
        return Err("Autofill unavailable: provider bridge is not active".to_string());
    };

    let mut adapter = adapter_handle
        .lock()
        .map_err(|_| "Autofill unavailable: provider bridge is not active".to_string())?;
    Ok(f(adapter.as_mut()))
}
