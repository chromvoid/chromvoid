//! The JNI surface of `com.chromvoid.app.nativebridge.CredentialProviderNativeShell`, the
//! platform module's provider shell. Each entry reads its strings, calls the shared owner in
//! `chromvoid-android-runtime` and answers in the bridge contract's envelope; Core is reached
//! only through the provider hook `android_provider` installs over the session.
use chromvoid_android_runtime::autofill::{
    AutofillContext, runtime_autofill_close_session, runtime_autofill_get_secret,
    runtime_autofill_list, runtime_autofill_list_with_diagnostics,
};
use chromvoid_android_runtime::bridge_contract::{decode_request, encode_response};
use chromvoid_android_runtime::passkey::{
    runtime_passkey_create, runtime_passkey_get, runtime_passkey_preflight, runtime_passkey_query,
};
use chromvoid_android_runtime::password_save::{
    runtime_password_save_finish, runtime_password_save_mark_launched,
    runtime_password_save_request, runtime_password_save_start,
};
use chromvoid_android_runtime::provider_hook::bridge_ready;
use chromvoid_android_runtime::provider_status::runtime_provider_status;
use jni::JNIEnv;
use jni::objects::{JClass, JString};
use jni::sys::{JNI_FALSE, JNI_TRUE, jboolean, jstring};
use serde_json::{Value, json};

fn bridge_error(code: &'static str, message: impl Into<String>) -> Value {
    json!({ "ok": false, "code": code, "message": message.into() })
}

fn respond(env: &mut JNIEnv<'_>, response: Value) -> jstring {
    env.new_string(encode_response(response).to_string())
        .map(|value| value.into_raw())
        .unwrap_or(std::ptr::null_mut())
}

fn read(env: &mut JNIEnv<'_>, value: &JString<'_>, field: &'static str) -> Result<String, Value> {
    env.get_string(value)
        .map(|value| value.to_string_lossy().into_owned())
        .map_err(|error| {
            bridge_error(
                "INVALID_NATIVE_STRING",
                format!("Invalid Android native string {field}: {error}"),
            )
        })
}

/// The device's API level, which decides what passkey paths it offers.
fn api_level(env: &mut JNIEnv<'_>) -> u64 {
    env.find_class("android/os/Build$VERSION")
        .and_then(|class| env.get_static_field(class, "SDK_INT", "I"))
        .and_then(|value| value.i())
        .map(|value| value.max(0) as u64)
        .unwrap_or_default()
}

macro_rules! read_or_respond {
    ($env:expr, $value:expr, $field:literal) => {
        match read($env, $value, $field) {
            Ok(value) => value,
            Err(error) => return respond($env, error),
        }
    };
}

/// The app opens its runtime before a provider path can run; this only says whether it has.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativeEnsureRuntime(
    _env: JNIEnv<'_>,
    _class: JClass<'_>,
    _data_dir: JString<'_>,
) -> jboolean {
    if bridge_ready() { JNI_TRUE } else { JNI_FALSE }
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativeRuntimeReady(
    _env: JNIEnv<'_>,
    _class: JClass<'_>,
) -> jboolean {
    if bridge_ready() { JNI_TRUE } else { JNI_FALSE }
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativeProviderStatus(
    mut env: JNIEnv<'_>,
    _class: JClass<'_>,
) -> jstring {
    let api_level = api_level(&mut env);
    respond(&mut env, runtime_provider_status(api_level))
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativeAutofillList(
    mut env: JNIEnv<'_>,
    _class: JClass<'_>,
    origin: JString<'_>,
    domain: JString<'_>,
) -> jstring {
    let origin = read_or_respond!(&mut env, &origin, "origin");
    let domain = read_or_respond!(&mut env, &domain, "domain");
    respond(
        &mut env,
        runtime_autofill_list(&AutofillContext { origin, domain }),
    )
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativeAutofillListWithDiagnostics(
    mut env: JNIEnv<'_>,
    _class: JClass<'_>,
    origin: JString<'_>,
    domain: JString<'_>,
) -> jstring {
    let origin = read_or_respond!(&mut env, &origin, "origin");
    let domain = read_or_respond!(&mut env, &domain, "domain");
    let response = runtime_autofill_list_with_diagnostics(&AutofillContext { origin, domain });
    respond(&mut env, response)
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativeAutofillCloseSession(
    mut env: JNIEnv<'_>,
    _class: JClass<'_>,
    session_id: JString<'_>,
) -> jstring {
    let session_id = read_or_respond!(&mut env, &session_id, "session_id");
    respond(&mut env, runtime_autofill_close_session(&session_id))
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativeAutofillGetSecret(
    mut env: JNIEnv<'_>,
    _class: JClass<'_>,
    session_id: JString<'_>,
    credential_id: JString<'_>,
    otp_id: JString<'_>,
) -> jstring {
    let session_id = read_or_respond!(&mut env, &session_id, "session_id");
    let credential_id = read_or_respond!(&mut env, &credential_id, "credential_id");
    let otp_id = read_or_respond!(&mut env, &otp_id, "otp_id");
    let otp_id = Some(otp_id.trim()).filter(|id| !id.is_empty());
    respond(
        &mut env,
        runtime_autofill_get_secret(&session_id, &credential_id, otp_id),
    )
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativePasskeyPreflight(
    mut env: JNIEnv<'_>,
    _class: JClass<'_>,
    command: JString<'_>,
    payload_json: JString<'_>,
) -> jstring {
    let command = read_or_respond!(&mut env, &command, "command");
    let payload_json = read_or_respond!(&mut env, &payload_json, "payload_json");
    let payload = match decode_request(&payload_json) {
        Ok(payload) => payload,
        Err(error) => return respond(&mut env, error),
    };
    let api_level = api_level(&mut env);
    respond(
        &mut env,
        runtime_passkey_preflight(&command, payload, api_level),
    )
}

fn passkey_operation(
    env: &mut JNIEnv<'_>,
    payload_json: &JString<'_>,
    operation: fn(Value, u64) -> Value,
) -> jstring {
    let payload_json = read_or_respond!(env, payload_json, "payload_json");
    let payload = match decode_request(&payload_json) {
        Ok(payload) => payload,
        Err(error) => return respond(env, error),
    };
    let api_level = api_level(env);
    respond(env, operation(payload, api_level))
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativePasskeyQuery(
    mut env: JNIEnv<'_>,
    _class: JClass<'_>,
    payload_json: JString<'_>,
) -> jstring {
    passkey_operation(&mut env, &payload_json, runtime_passkey_query)
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativePasskeyCreate(
    mut env: JNIEnv<'_>,
    _class: JClass<'_>,
    payload_json: JString<'_>,
) -> jstring {
    passkey_operation(&mut env, &payload_json, runtime_passkey_create)
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativePasskeyGet(
    mut env: JNIEnv<'_>,
    _class: JClass<'_>,
    payload_json: JString<'_>,
) -> jstring {
    passkey_operation(&mut env, &payload_json, runtime_passkey_get)
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativePasswordSaveStart(
    mut env: JNIEnv<'_>,
    _class: JClass<'_>,
    payload_json: JString<'_>,
) -> jstring {
    let payload_json = read_or_respond!(&mut env, &payload_json, "payload_json");
    let payload = match decode_request(&payload_json) {
        Ok(payload) => payload,
        Err(error) => return respond(&mut env, error),
    };
    respond(&mut env, runtime_password_save_start(payload))
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativePasswordSaveRequest(
    mut env: JNIEnv<'_>,
    _class: JClass<'_>,
    token: JString<'_>,
) -> jstring {
    let token = read_or_respond!(&mut env, &token, "token");
    respond(&mut env, runtime_password_save_request(&token))
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativePasswordSaveMarkLaunched(
    mut env: JNIEnv<'_>,
    _class: JClass<'_>,
    token: JString<'_>,
) -> jstring {
    let token = read_or_respond!(&mut env, &token, "token");
    respond(&mut env, runtime_password_save_mark_launched(&token))
}

/// The host's review ended: `outcome` is `saved` or `dismissed`.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_CredentialProviderNativeShell_nativePasswordSaveFinish(
    mut env: JNIEnv<'_>,
    _class: JClass<'_>,
    token: JString<'_>,
    outcome: JString<'_>,
) -> jstring {
    let token = read_or_respond!(&mut env, &token, "token");
    let outcome = read_or_respond!(&mut env, &outcome, "outcome");
    respond(&mut env, runtime_password_save_finish(&token, &outcome))
}
