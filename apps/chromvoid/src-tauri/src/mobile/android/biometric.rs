#![cfg_attr(not(target_os = "android"), allow(dead_code))]

use crate::mobile::BiometricAuthError;

pub const AUTH_STATE_SUCCESS: i32 = 0;
pub const AUTH_STATE_DENIED: i32 = 1;
pub const AUTH_STATE_CANCELLED: i32 = 2;

const BIOMETRIC_ERROR_HW_UNAVAILABLE: i32 = 1;
const BIOMETRIC_ERROR_UNABLE_TO_PROCESS: i32 = 2;
const BIOMETRIC_ERROR_TIMEOUT: i32 = 3;
const BIOMETRIC_ERROR_NO_SPACE: i32 = 4;
const BIOMETRIC_ERROR_CANCELED: i32 = 5;
const BIOMETRIC_ERROR_LOCKOUT: i32 = 7;
const BIOMETRIC_ERROR_VENDOR: i32 = 8;
const BIOMETRIC_ERROR_LOCKOUT_PERMANENT: i32 = 9;
const BIOMETRIC_ERROR_USER_CANCELED: i32 = 10;
const BIOMETRIC_ERROR_NO_BIOMETRICS: i32 = 11;
const BIOMETRIC_ERROR_HW_NOT_PRESENT: i32 = 12;
const BIOMETRIC_ERROR_NEGATIVE_BUTTON: i32 = 13;
const BIOMETRIC_ERROR_NO_DEVICE_CREDENTIAL: i32 = 14;
const BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED: i32 = 15;
const BIOMETRIC_INTERNAL_NO_ACTIVITY: i32 = -1001;
const BIOMETRIC_INTERNAL_PROMPT_IN_PROGRESS: i32 = -1002;
const BIOMETRIC_INTERNAL_PROMPT_EXCEPTION: i32 = -1003;

pub fn map_android_error_code(error_code: i32) -> BiometricAuthError {
    match error_code {
        BIOMETRIC_INTERNAL_NO_ACTIVITY
        | BIOMETRIC_INTERNAL_PROMPT_IN_PROGRESS
        | BIOMETRIC_INTERNAL_PROMPT_EXCEPTION => {
            BiometricAuthError::internal(format!("Biometric bridge internal error ({error_code})"))
        }
        BIOMETRIC_ERROR_CANCELED
        | BIOMETRIC_ERROR_USER_CANCELED
        | BIOMETRIC_ERROR_NEGATIVE_BUTTON => {
            BiometricAuthError::cancelled(format!("Biometric prompt cancelled ({error_code})"))
        }
        BIOMETRIC_ERROR_LOCKOUT | BIOMETRIC_ERROR_LOCKOUT_PERMANENT => {
            BiometricAuthError::denied(format!("Biometric authentication denied ({error_code})"))
        }
        BIOMETRIC_ERROR_HW_UNAVAILABLE
        | BIOMETRIC_ERROR_UNABLE_TO_PROCESS
        | BIOMETRIC_ERROR_TIMEOUT
        | BIOMETRIC_ERROR_NO_SPACE
        | BIOMETRIC_ERROR_VENDOR
        | BIOMETRIC_ERROR_NO_BIOMETRICS
        | BIOMETRIC_ERROR_HW_NOT_PRESENT
        | BIOMETRIC_ERROR_NO_DEVICE_CREDENTIAL
        | BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED => {
            BiometricAuthError::unavailable(format!("Biometric unavailable ({error_code})"))
        }
        code if code < 0 => {
            BiometricAuthError::internal(format!("Biometric bridge internal error ({error_code})"))
        }
        _ => {
            BiometricAuthError::internal(format!("Biometric authentication failed ({error_code})"))
        }
    }
}

pub fn map_prompt_result(state: i32, error_code: i32) -> Result<(), BiometricAuthError> {
    match state {
        AUTH_STATE_SUCCESS => Ok(()),
        AUTH_STATE_DENIED => Err(BiometricAuthError::denied(
            "Biometric authentication failed",
        )),
        AUTH_STATE_CANCELLED => Err(BiometricAuthError::cancelled("User cancelled prompt")),
        _ => Err(map_android_error_code(error_code)),
    }
}
