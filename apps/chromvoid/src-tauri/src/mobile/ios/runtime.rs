#![cfg_attr(not(target_os = "ios"), allow(dead_code))]

use std::path::PathBuf;
use std::sync::{Arc, OnceLock};

use tauri::Manager;

static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();
static STORAGE_ROOT: OnceLock<PathBuf> = OnceLock::new();

pub(crate) fn register_app_handle(app: tauri::AppHandle) {
    if APP_HANDLE.set(app).is_err() {
        tracing::warn!("ios_runtime: app handle already registered");
    }
}

pub(crate) fn register_storage_root(storage_root: PathBuf) {
    if STORAGE_ROOT.set(storage_root).is_err() {
        tracing::warn!("ios_runtime: storage root already registered");
    }
}

pub(crate) fn app_handle() -> Option<tauri::AppHandle> {
    APP_HANDLE.get().cloned()
}

pub(crate) fn storage_root() -> Option<PathBuf> {
    if let Some(storage_root) = storage_root_from_app_state() {
        return Some(storage_root);
    }
    STORAGE_ROOT.get().cloned()
}

fn storage_root_from_app_state() -> Option<PathBuf> {
    with_app_state(|state| match state.storage_root.lock() {
        Ok(storage_root) => Some(storage_root.clone()),
        Err(_) => {
            tracing::warn!("ios_runtime: storage root mutex poisoned");
            None
        }
    })
    .flatten()
}

pub(crate) fn with_app_state<T>(
    f: impl FnOnce(tauri::State<'_, crate::app_state::AppState>) -> T,
) -> Option<T> {
    let app = app_handle()?;
    app.try_state::<crate::app_state::AppState>().map(f)
}

pub(crate) fn app_ios_native_bridge_runtime(
) -> Option<Arc<crate::mobile::ios::native_bridge::IosNativeBridgeRuntimeState>> {
    with_app_state(|state| state.ios_native_bridge_runtime.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn storage_root_locator_is_unavailable_idempotent_and_cloned() {
        assert!(app_handle().is_none());
        assert!(storage_root().is_none());
        assert!(storage_root_from_app_state().is_none());
        assert!(with_app_state(|_| ()).is_none());
        assert!(app_ios_native_bridge_runtime().is_none());

        let first = PathBuf::from("/tmp/chromvoid-ios-runtime-first");
        let second = PathBuf::from("/tmp/chromvoid-ios-runtime-second");

        register_storage_root(first.clone());
        register_storage_root(second);

        assert_eq!(storage_root(), Some(first.clone()));

        let mut cloned = storage_root().expect("storage root");
        cloned.push("mutated");
        assert_eq!(storage_root(), Some(first));
    }
}
