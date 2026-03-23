use crate::mobile::BiometricAuthError;

pub mod app_lifecycle;
pub mod background_refresh;
mod bridge;
#[cfg(test)]
mod credential_provider_spec;
pub mod edge_swipe;
pub mod idle_timer;
pub mod keyboard;
pub mod push_bridge;

pub fn authenticate_with_biometric(reason: &str) -> Result<(), BiometricAuthError> {
    bridge::authenticate_with_biometric(reason)
}

pub fn biometric_bridge_available() -> bool {
    bridge::biometric_bridge_available()
}

pub fn autofill_extension_ready() -> bool {
    bridge::autofill_extension_ready()
}
