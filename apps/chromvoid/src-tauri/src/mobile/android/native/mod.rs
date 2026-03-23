mod biometric;
mod jni;
mod password_save;
mod provider;
mod service;

use crate::mobile::BiometricAuthError;

pub fn authenticate_with_biometric(reason: &str) -> Result<(), BiometricAuthError> {
    biometric::authenticate_with_biometric(reason)
}

pub fn biometric_bridge_available() -> bool {
    biometric::biometric_bridge_available()
}

pub fn current_device_api_level() -> Option<u64> {
    jni::current_device_api_level()
}

pub fn start_connection_service(device_name: &str) -> bool {
    service::start_connection_service(device_name)
}

pub fn stop_connection_service() -> bool {
    service::stop_connection_service()
}

pub fn autofill_provider_selected() -> Result<bool, String> {
    provider::autofill_provider_selected()
}

pub fn open_autofill_provider_settings() -> Result<bool, String> {
    provider::open_autofill_provider_settings()
}

pub fn notify_password_save_review_result(token: Option<&str>, outcome: &str, finished: bool) {
    password_save::notify_password_save_review_result(token, outcome, finished)
}
