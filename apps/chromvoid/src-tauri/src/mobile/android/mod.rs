#![cfg_attr(not(target_os = "android"), allow(dead_code))]

mod autofill;
mod biometric;
mod bridge_contract;
#[cfg(target_os = "android")]
mod native;
mod passkey;
mod password_save;
mod provider_status;
mod runtime;

#[cfg(test)]
mod tests;

use crate::mobile::BiometricAuthError;

pub use autofill::{AndroidAutofillAdapter, AutofillContext};
pub use password_save::AndroidPasswordSaveOutcome;
pub(crate) use password_save::{
    finish_password_save_request, invalidate_all_password_save_requests,
};
#[cfg(not(target_os = "android"))]
mod native_stub {
    use crate::mobile::BiometricAuthError;

    pub fn authenticate_with_biometric(_reason: &str) -> Result<(), BiometricAuthError> {
        Err(BiometricAuthError::unavailable(
            "Native Android biometric bridge is not available on this target",
        ))
    }

    pub fn biometric_bridge_available() -> bool {
        false
    }

    pub fn current_device_api_level() -> Option<u64> {
        None
    }

    pub fn start_connection_service(_device_name: &str) -> bool {
        false
    }

    pub fn stop_connection_service() -> bool {
        false
    }

    pub fn autofill_provider_selected() -> Result<bool, String> {
        Err("Android autofill provider selection is not available on this target".to_string())
    }

    pub fn open_autofill_provider_settings() -> Result<bool, String> {
        Err("Android autofill provider settings are not available on this target".to_string())
    }

    pub fn notify_password_save_review_result(
        _token: Option<&str>,
        _outcome: &str,
        _finished: bool,
    ) {
    }
}

pub fn authenticate_with_biometric(reason: &str) -> Result<(), BiometricAuthError> {
    #[cfg(target_os = "android")]
    {
        return native::authenticate_with_biometric(reason);
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::authenticate_with_biometric(reason);
    }
}

pub(crate) fn register_shared_app_adapter(
    adapter: std::sync::Arc<std::sync::Mutex<Box<dyn crate::CoreAdapter>>>,
) {
    runtime::register_shared_app_adapter(adapter)
}

#[cfg(test)]
pub(crate) fn runtime_ready() -> bool {
    runtime::runtime_ready()
}

pub fn biometric_bridge_available() -> bool {
    #[cfg(target_os = "android")]
    {
        return native::biometric_bridge_available();
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::biometric_bridge_available();
    }
}

pub fn start_connection_service(device_name: &str) -> bool {
    #[cfg(target_os = "android")]
    {
        return native::start_connection_service(device_name);
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::start_connection_service(device_name);
    }
}

pub fn stop_connection_service() -> bool {
    #[cfg(target_os = "android")]
    {
        return native::stop_connection_service();
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::stop_connection_service();
    }
}

pub fn autofill_bridge_available() -> bool {
    #[cfg(target_os = "android")]
    {
        return current_device_api_level().is_some_and(|api_level| {
            api_level >= provider_status::ANDROID_CREDENTIAL_PROVIDER_MIN_API
        }) && runtime::runtime_ready();
    }

    #[cfg(test)]
    {
        return true;
    }

    #[cfg(not(any(target_os = "android", test)))]
    {
        false
    }
}

pub fn current_device_api_level() -> Option<u64> {
    #[cfg(target_os = "android")]
    {
        return native::current_device_api_level();
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::current_device_api_level();
    }
}

pub fn notify_password_save_review_result(token: Option<&str>, outcome: &str, finished: bool) {
    #[cfg(target_os = "android")]
    {
        native::notify_password_save_review_result(token, outcome, finished);
        return;
    }

    #[cfg(not(target_os = "android"))]
    {
        native_stub::notify_password_save_review_result(token, outcome, finished);
    }
}

pub fn autofill_provider_selected() -> Result<bool, String> {
    #[cfg(target_os = "android")]
    {
        return native::autofill_provider_selected();
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::autofill_provider_selected();
    }
}

pub fn open_autofill_provider_settings() -> Result<bool, String> {
    #[cfg(target_os = "android")]
    {
        return native::open_autofill_provider_settings();
    }

    #[cfg(not(target_os = "android"))]
    {
        return native_stub::open_autofill_provider_settings();
    }
}
