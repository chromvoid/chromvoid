use std::path::Path;

use jni::objects::{JClass, JString};
use jni::sys::{jboolean, jstring};
use serde_json::{json, Value};

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

fn bridge_error(code: &'static str, message: impl Into<String>) -> Value {
    json!({
        "ok": false,
        "code": code,
        "message": message.into(),
    })
}

fn encode_bridge_response(env: &mut jni::JNIEnv<'_>, response: Value) -> jstring {
    env.new_string(super::super::bridge_contract::encode_response(response).to_string())
        .map(|value| value.into_raw())
        .unwrap_or(std::ptr::null_mut())
}

fn read_bridge_string(
    env: &mut jni::JNIEnv<'_>,
    value: &JString<'_>,
    field: &'static str,
) -> Result<String, Value> {
    super::jni::try_get_java_string(env, value).map_err(|error| {
        bridge_error(
            "INVALID_NATIVE_STRING",
            format!("Invalid Android native string {field}: {error}"),
        )
    })
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativeEnsureRuntime(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    data_dir: JString<'_>,
) -> jboolean {
    let data_dir = match super::jni::try_get_java_string(&mut env, &data_dir) {
        Ok(data_dir) => data_dir,
        Err(error) => {
            tracing::warn!("android credential provider: invalid data_dir string: {error}");
            return 0;
        }
    };
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
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
) -> jstring {
    let api_level = super::jni::current_device_api_level_from_env(&mut env).unwrap_or_default();
    let response = super::super::provider_status::runtime_provider_status(api_level);
    encode_bridge_response(&mut env, response)
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativeAutofillList(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    origin: JString<'_>,
    domain: JString<'_>,
) -> jstring {
    let origin = match read_bridge_string(&mut env, &origin, "origin") {
        Ok(origin) => origin,
        Err(error) => return encode_bridge_response(&mut env, error),
    };
    let domain = match read_bridge_string(&mut env, &domain, "domain") {
        Ok(domain) => domain,
        Err(error) => return encode_bridge_response(&mut env, error),
    };
    let response =
        super::super::autofill::runtime_autofill_list(&super::super::autofill::AutofillContext {
            origin,
            domain,
        });
    encode_bridge_response(&mut env, response)
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativeAutofillListWithDiagnostics(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    origin: JString<'_>,
    domain: JString<'_>,
) -> jstring {
    let origin = match read_bridge_string(&mut env, &origin, "origin") {
        Ok(origin) => origin,
        Err(error) => return encode_bridge_response(&mut env, error),
    };
    let domain = match read_bridge_string(&mut env, &domain, "domain") {
        Ok(domain) => domain,
        Err(error) => return encode_bridge_response(&mut env, error),
    };
    let response = super::super::autofill::runtime_autofill_list_with_diagnostics(
        &super::super::autofill::AutofillContext { origin, domain },
    );
    encode_bridge_response(&mut env, response)
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativeAutofillCloseSession(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    session_id: JString<'_>,
) -> jstring {
    let session_id = match read_bridge_string(&mut env, &session_id, "session_id") {
        Ok(session_id) => session_id,
        Err(error) => return encode_bridge_response(&mut env, error),
    };
    let response = super::super::autofill::runtime_autofill_close_session(&session_id);
    encode_bridge_response(&mut env, response)
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativeAutofillGetSecret(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    session_id: JString<'_>,
    credential_id: JString<'_>,
    otp_id: JString<'_>,
) -> jstring {
    let session_id = match read_bridge_string(&mut env, &session_id, "session_id") {
        Ok(session_id) => session_id,
        Err(error) => return encode_bridge_response(&mut env, error),
    };
    let credential_id = match read_bridge_string(&mut env, &credential_id, "credential_id") {
        Ok(credential_id) => credential_id,
        Err(error) => return encode_bridge_response(&mut env, error),
    };
    let otp_id = match read_bridge_string(&mut env, &otp_id, "otp_id") {
        Ok(otp_id) => otp_id,
        Err(error) => return encode_bridge_response(&mut env, error),
    };
    let otp_id = if otp_id.trim().is_empty() {
        None
    } else {
        Some(otp_id.trim())
    };
    let response =
        super::super::autofill::runtime_autofill_get_secret(&session_id, &credential_id, otp_id);
    encode_bridge_response(&mut env, response)
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativePasskeyPreflight(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    command: JString<'_>,
    payload_json: JString<'_>,
) -> jstring {
    let command = match read_bridge_string(&mut env, &command, "command") {
        Ok(command) => command,
        Err(error) => return encode_bridge_response(&mut env, error),
    };
    let payload_json = match read_bridge_string(&mut env, &payload_json, "payload_json") {
        Ok(payload_json) => payload_json,
        Err(error) => return encode_bridge_response(&mut env, error),
    };
    let payload = match super::super::bridge_contract::decode_request(&payload_json) {
        Ok(payload) => payload,
        Err(error) => return encode_bridge_response(&mut env, error),
    };
    let api_level = super::jni::current_device_api_level_from_env(&mut env).unwrap_or_default();
    let response = super::super::passkey::runtime_passkey_preflight(&command, payload, api_level);
    encode_bridge_response(&mut env, response)
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativePasskeyQuery(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    payload_json: JString<'_>,
) -> jstring {
    let payload_json = match read_bridge_string(&mut env, &payload_json, "payload_json") {
        Ok(payload_json) => payload_json,
        Err(error) => return encode_bridge_response(&mut env, error),
    };
    native_passkey_operation(
        &mut env,
        &payload_json,
        super::super::passkey::runtime_passkey_query,
    )
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativePasskeyCreate(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    payload_json: JString<'_>,
) -> jstring {
    let payload_json = match read_bridge_string(&mut env, &payload_json, "payload_json") {
        Ok(payload_json) => payload_json,
        Err(error) => return encode_bridge_response(&mut env, error),
    };
    native_passkey_operation(
        &mut env,
        &payload_json,
        super::super::passkey::runtime_passkey_create,
    )
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativePasskeyGet(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    payload_json: JString<'_>,
) -> jstring {
    let payload_json = match read_bridge_string(&mut env, &payload_json, "payload_json") {
        Ok(payload_json) => payload_json,
        Err(error) => return encode_bridge_response(&mut env, error),
    };
    native_passkey_operation(
        &mut env,
        &payload_json,
        super::super::passkey::runtime_passkey_get,
    )
}

fn native_passkey_operation(
    env: &mut jni::JNIEnv<'_>,
    payload_json: &str,
    operation: fn(serde_json::Value, u64) -> serde_json::Value,
) -> jstring {
    let payload = match super::super::bridge_contract::decode_request(payload_json) {
        Ok(payload) => payload,
        Err(error) => return encode_bridge_response(env, error),
    };
    let api_level = super::jni::current_device_api_level_from_env(env).unwrap_or_default();
    let response = operation(payload, api_level);
    encode_bridge_response(env, response)
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativePasswordSaveStart(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    payload_json: JString<'_>,
) -> jstring {
    let payload_json = match read_bridge_string(&mut env, &payload_json, "payload_json") {
        Ok(payload_json) => payload_json,
        Err(error) => return encode_bridge_response(&mut env, error),
    };
    let payload = match super::super::bridge_contract::decode_request(&payload_json) {
        Ok(payload) => payload,
        Err(error) => return encode_bridge_response(&mut env, error),
    };
    let response = super::super::password_save::runtime_password_save_start(payload);
    encode_bridge_response(&mut env, response)
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativePasswordSaveRequest(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    token: JString<'_>,
) -> jstring {
    let token = match read_bridge_string(&mut env, &token, "token") {
        Ok(token) => token,
        Err(error) => return encode_bridge_response(&mut env, error),
    };
    let response = super::super::password_save::runtime_password_save_request(&token);
    encode_bridge_response(&mut env, response)
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativePasswordSaveMarkLaunched(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    token: JString<'_>,
) -> jstring {
    let token = match read_bridge_string(&mut env, &token, "token") {
        Ok(token) => token,
        Err(error) => return encode_bridge_response(&mut env, error),
    };
    let response = super::super::password_save::runtime_password_save_mark_launched(&token);
    encode_bridge_response(&mut env, response)
}
