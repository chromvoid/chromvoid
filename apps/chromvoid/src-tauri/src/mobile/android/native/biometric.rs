use std::os::raw::c_void;
use std::sync::mpsc;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use crate::mobile::BiometricAuthError;

const AUTH_TIMEOUT: Duration = Duration::from_secs(30);
const BIOMETRIC_NATIVE_SHELL_CLASS: &str = "com/chromvoid/app/nativebridge/BiometricNativeShell";

struct PendingAuth {
    tx: mpsc::SyncSender<Result<(), BiometricAuthError>>,
}

static PENDING_AUTH: LazyLock<Mutex<Option<PendingAuth>>> = LazyLock::new(|| Mutex::new(None));

pub fn authenticate_with_biometric(reason: &str) -> Result<(), BiometricAuthError> {
    if !biometric_bridge_available() {
        return Err(BiometricAuthError::unavailable(
            "Android BiometricPrompt bridge is unavailable",
        ));
    }

    let (tx, rx) = mpsc::sync_channel(1);
    {
        let mut guard = PENDING_AUTH
            .lock()
            .map_err(|_| BiometricAuthError::internal("Biometric bridge state is unavailable"))?;
        *guard = Some(PendingAuth { tx });
    }

    tracing::info!("android biometric app gate: launching prompt");
    let start_code = jni_biometric_prompt_start(reason).map_err(BiometricAuthError::internal)?;
    if start_code != 0 {
        let mut guard = PENDING_AUTH
            .lock()
            .map_err(|_| BiometricAuthError::internal("Biometric bridge state is unavailable"))?;
        *guard = None;
        return Err(super::super::biometric::map_android_error_code(start_code));
    }

    rx.recv_timeout(AUTH_TIMEOUT)
        .map_err(|_| BiometricAuthError::cancelled("Biometric authentication timed out"))?
}

pub fn biometric_bridge_available() -> bool {
    match jni_biometric_prompt_available() {
        Ok(code) => code == 0,
        Err(error) => {
            tracing::warn!("android biometric app gate: availability check failed: {error}");
            false
        }
    }
}

fn complete_authentication(state: i32, error_code: i32) {
    tracing::info!(
        "android biometric app gate: completion state={} error_code={}",
        state,
        error_code
    );
    let sender = match PENDING_AUTH.lock() {
        Ok(mut guard) => guard.take().map(|pending| pending.tx),
        Err(_) => None,
    };

    if let Some(tx) = sender {
        let _ = tx.send(super::super::biometric::map_prompt_result(
            state, error_code,
        ));
    }
}

fn jni_biometric_prompt_available() -> Result<i32, String> {
    super::jni::call_static_int_method_with_context(
        "biometric_prompt_available",
        BIOMETRIC_NATIVE_SHELL_CLASS,
        "biometricPromptAvailable",
    )
}

fn jni_biometric_prompt_start(reason: &str) -> Result<i32, String> {
    super::jni::call_static_int_method_with_string_arg(
        "start_biometric_prompt",
        BIOMETRIC_NATIVE_SHELL_CLASS,
        "startPrompt",
        reason,
    )
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_BiometricNativeShell_nativeOnAuthSuccess(
    _env: *mut c_void,
    _class: *mut c_void,
) {
    complete_authentication(super::super::biometric::AUTH_STATE_SUCCESS, 0);
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_BiometricNativeShell_nativeOnAuthDenied(
    _env: *mut c_void,
    _class: *mut c_void,
) {
    complete_authentication(super::super::biometric::AUTH_STATE_DENIED, 0);
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_BiometricNativeShell_nativeOnAuthCancelled(
    _env: *mut c_void,
    _class: *mut c_void,
) {
    complete_authentication(super::super::biometric::AUTH_STATE_CANCELLED, 0);
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_BiometricNativeShell_nativeOnAuthError(
    _env: *mut c_void,
    _class: *mut c_void,
    error_code: i32,
) {
    complete_authentication(-1, error_code);
}
