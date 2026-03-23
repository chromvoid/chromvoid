use crate::mobile::BiometricAuthError;

#[cfg(any(target_os = "ios", target_os = "macos"))]
mod native {
    use std::sync::mpsc;
    use std::time::Duration;

    use block2::RcBlock;
    use objc2::runtime::Bool;
    use objc2_foundation::{NSError, NSString};
    use objc2_local_authentication::{LAContext, LAError, LAPolicy};

    use crate::mobile::BiometricAuthError;

    const AUTH_TIMEOUT: Duration = Duration::from_secs(30);

    pub fn biometric_bridge_available() -> bool {
        let context = unsafe { LAContext::new() };
        can_evaluate_biometrics(&context).is_ok()
    }

    pub fn authenticate_with_biometric(reason: &str) -> Result<(), BiometricAuthError> {
        let context = unsafe { LAContext::new() };
        can_evaluate_biometrics(&context)?;

        let localized_reason = NSString::from_str(reason);
        let (tx, rx) = mpsc::sync_channel(1);

        let reply = RcBlock::new(move |success: Bool, error: *mut NSError| {
            let result = if success.as_bool() {
                Ok(())
            } else {
                Err(map_la_error(error, "Biometric authentication failed"))
            };
            let _ = tx.send(result);
        });

        unsafe {
            context.evaluatePolicy_localizedReason_reply(
                LAPolicy::DeviceOwnerAuthenticationWithBiometrics,
                &localized_reason,
                &reply,
            );
        }

        rx.recv_timeout(AUTH_TIMEOUT)
            .map_err(|_| BiometricAuthError::cancelled("Biometric authentication timed out"))?
    }

    fn can_evaluate_biometrics(context: &LAContext) -> Result<(), BiometricAuthError> {
        unsafe {
            context
                .canEvaluatePolicy_error(LAPolicy::DeviceOwnerAuthenticationWithBiometrics)
                .map_err(|error| {
                    map_error_code(error.code(), error.localizedDescription().to_string())
                })
        }
    }

    fn map_la_error(error: *mut NSError, fallback: &str) -> BiometricAuthError {
        if error.is_null() {
            return BiometricAuthError::unavailable(fallback);
        }

        let error = unsafe { &*error };
        map_error_code(error.code(), error.localizedDescription().to_string())
    }

    fn map_error_code(code: isize, message: String) -> BiometricAuthError {
        if code == LAError::UserCancel.0
            || code == LAError::SystemCancel.0
            || code == LAError::AppCancel.0
        {
            return BiometricAuthError::cancelled(message);
        }

        if code == LAError::AuthenticationFailed.0 || code == LAError::UserFallback.0 {
            return BiometricAuthError::denied(message);
        }

        BiometricAuthError::unavailable(message)
    }
}

#[cfg(any(target_os = "ios", target_os = "macos"))]
pub fn authenticate_with_biometric(reason: &str) -> Result<(), BiometricAuthError> {
    native::authenticate_with_biometric(reason)
}

#[cfg(any(target_os = "ios", target_os = "macos"))]
pub fn biometric_bridge_available() -> bool {
    native::biometric_bridge_available()
}

#[cfg(any(target_os = "ios", target_os = "macos"))]
pub fn autofill_extension_ready() -> bool {
    crate::credential_provider_bridge::runtime_ready()
}

#[cfg(not(any(target_os = "ios", target_os = "macos")))]
pub fn authenticate_with_biometric(_reason: &str) -> Result<(), BiometricAuthError> {
    Err(BiometricAuthError::unavailable(
        "Native Apple biometric bridge requires iOS or macOS",
    ))
}

#[cfg(not(any(target_os = "ios", target_os = "macos")))]
pub fn biometric_bridge_available() -> bool {
    false
}

#[cfg(not(any(target_os = "ios", target_os = "macos")))]
pub fn autofill_extension_ready() -> bool {
    false
}
