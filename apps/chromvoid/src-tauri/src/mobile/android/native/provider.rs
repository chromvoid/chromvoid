use std::path::Path;

use jni::objects::{JClass, JString};
use jni::sys::{jboolean, jstring};

const CREDENTIAL_PROVIDER_NATIVE_SHELL_CLASS: &str =
    "com/chromvoid/app/nativebridge/CredentialProviderNativeShell";

pub fn autofill_provider_selected() -> Result<bool, String> {
    super::jni::call_static_bool_no_args(
        "autofill_provider_selected",
        CREDENTIAL_PROVIDER_NATIVE_SHELL_CLASS,
        "appAutofillProviderSelected",
    )
}

pub fn open_autofill_provider_settings() -> Result<bool, String> {
    super::jni::call_static_bool_no_args(
        "open_autofill_provider_settings",
        CREDENTIAL_PROVIDER_NATIVE_SHELL_CLASS,
        "openAutofillProviderSettings",
    )
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativeEnsureRuntime(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    data_dir: JString<'_>,
) -> jboolean {
    let data_dir = super::jni::get_java_string(&mut env, &data_dir);
    let ready = super::super::runtime::ensure_shared_local_adapter(Path::new(&data_dir)).is_ok();
    if ready {
        1
    } else {
        0
    }
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativeRuntimeReady(
    _env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
) -> jboolean {
    if super::super::runtime::runtime_ready() {
        1
    } else {
        0
    }
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativeProviderStatus(
    env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
) -> jstring {
    let api_level = super::jni::current_device_api_level().unwrap_or_default();
    let response = super::super::provider_status::runtime_provider_status(api_level);
    env.new_string(super::super::bridge_contract::encode_response(response).to_string())
        .map(|value| value.into_raw())
        .unwrap_or(std::ptr::null_mut())
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativeAutofillList(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    origin: JString<'_>,
    domain: JString<'_>,
) -> jstring {
    let origin = super::jni::get_java_string(&mut env, &origin);
    let domain = super::jni::get_java_string(&mut env, &domain);
    let response =
        super::super::autofill::runtime_autofill_list(&super::super::autofill::AutofillContext {
            origin,
            domain,
        });
    env.new_string(super::super::bridge_contract::encode_response(response).to_string())
        .map(|value| value.into_raw())
        .unwrap_or(std::ptr::null_mut())
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativeAutofillGetSecret(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    session_id: JString<'_>,
    credential_id: JString<'_>,
    otp_id: JString<'_>,
) -> jstring {
    let session_id = super::jni::get_java_string(&mut env, &session_id);
    let credential_id = super::jni::get_java_string(&mut env, &credential_id);
    let otp_id = super::jni::get_java_string(&mut env, &otp_id);
    let otp_id = if otp_id.trim().is_empty() {
        None
    } else {
        Some(otp_id.trim())
    };
    let response =
        super::super::autofill::runtime_autofill_get_secret(&session_id, &credential_id, otp_id);
    env.new_string(super::super::bridge_contract::encode_response(response).to_string())
        .map(|value| value.into_raw())
        .unwrap_or(std::ptr::null_mut())
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativePasskeyPreflight(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    command: JString<'_>,
    payload_json: JString<'_>,
) -> jstring {
    let command = super::jni::get_java_string(&mut env, &command);
    let payload_json = super::jni::get_java_string(&mut env, &payload_json);
    let payload = match super::super::bridge_contract::decode_request(&payload_json) {
        Ok(payload) => payload,
        Err(error) => {
            return env
                .new_string(super::super::bridge_contract::encode_response(error).to_string())
                .map(|value| value.into_raw())
                .unwrap_or(std::ptr::null_mut());
        }
    };
    let api_level = super::jni::current_device_api_level().unwrap_or_default();
    let response = super::super::passkey::runtime_passkey_preflight(&command, payload, api_level);
    env.new_string(super::super::bridge_contract::encode_response(response).to_string())
        .map(|value| value.into_raw())
        .unwrap_or(std::ptr::null_mut())
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativePasswordSaveStart(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    payload_json: JString<'_>,
) -> jstring {
    let payload_json = super::jni::get_java_string(&mut env, &payload_json);
    let payload = match super::super::bridge_contract::decode_request(&payload_json) {
        Ok(payload) => payload,
        Err(error) => {
            return env
                .new_string(super::super::bridge_contract::encode_response(error).to_string())
                .map(|value| value.into_raw())
                .unwrap_or(std::ptr::null_mut());
        }
    };
    let response = super::super::password_save::runtime_password_save_start(payload);
    env.new_string(super::super::bridge_contract::encode_response(response).to_string())
        .map(|value| value.into_raw())
        .unwrap_or(std::ptr::null_mut())
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativePasswordSaveRequest(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    token: JString<'_>,
) -> jstring {
    let token = super::jni::get_java_string(&mut env, &token);
    let response = super::super::password_save::runtime_password_save_request(&token);
    env.new_string(super::super::bridge_contract::encode_response(response).to_string())
        .map(|value| value.into_raw())
        .unwrap_or(std::ptr::null_mut())
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativePasswordSaveMarkLaunched(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    token: JString<'_>,
) -> jstring {
    let token = super::jni::get_java_string(&mut env, &token);
    let response = super::super::password_save::runtime_password_save_mark_launched(&token);
    env.new_string(super::super::bridge_contract::encode_response(response).to_string())
        .map(|value| value.into_raw())
        .unwrap_or(std::ptr::null_mut())
}
