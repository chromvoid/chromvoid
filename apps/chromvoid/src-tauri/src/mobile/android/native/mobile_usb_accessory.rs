use jni::objects::{JObject, JString, JValue};
use jni::sys::{jboolean, jint};

fn read_string(
    env: &mut jni::JNIEnv<'_>,
    value: &JString<'_>,
    field: &'static str,
) -> Result<String, String> {
    super::jni::try_get_java_string(env, value)
        .map_err(|error| format!("Invalid Android mobile USB string {field}: {error}"))
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_MobileUsbAccessoryNativeShell_nativeStartAccessorySession(
    mut env: jni::JNIEnv<'_>,
    _receiver: JObject<'_>,
    session_id: JString<'_>,
    fd: jint,
    identity_json: JString<'_>,
) -> jboolean {
    let session_id = match read_string(&mut env, &session_id, "session_id") {
        Ok(session_id) => session_id,
        Err(error) => {
            super::super::usb_accessory_runtime::android_usb_log_warn(format!(
                "event=jni_start_invalid_session_id error={}",
                error
            ));
            tracing::warn!("mobile_usb_android: invalid native session id error={error}");
            return 0;
        }
    };
    super::super::usb_accessory_runtime::android_usb_log_info(format!(
        "event=jni_start_called session_id={} fd={}",
        super::super::usb_accessory_runtime::log_session_id(&session_id),
        fd
    ));
    let identity_json = match read_string(&mut env, &identity_json, "identity_json") {
        Ok(identity_json) => identity_json,
        Err(error) => {
            super::super::usb_accessory_runtime::android_usb_log_warn(format!(
                "event=jni_start_invalid_identity session_id={} error={}",
                super::super::usb_accessory_runtime::log_session_id(&session_id),
                error
            ));
            tracing::warn!(
                "mobile_usb_android: invalid native identity session_id={} error={}",
                session_id,
                error
            );
            return 0;
        }
    };

    let result = match super::super::shared_android_usb_accessory_runtime().start_fd_session(
        &session_id,
        fd,
        &identity_json,
    ) {
        Ok(()) => 1,
        Err(error) => {
            super::super::usb_accessory_runtime::android_usb_log_warn(format!(
                "event=jni_start_rejected session_id={} error={}",
                super::super::usb_accessory_runtime::log_session_id(&session_id),
                error
            ));
            tracing::warn!(
                "mobile_usb_android: native start rejected session_id={} error={}",
                session_id,
                error
            );
            0
        }
    };
    if result == 1 {
        super::super::usb_accessory_runtime::android_usb_log_info(format!(
            "event=jni_start_accepted session_id={}",
            super::super::usb_accessory_runtime::log_session_id(&session_id)
        ));
    }
    result
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_MobileUsbAccessoryNativeShell_nativeStopAccessorySession(
    mut env: jni::JNIEnv<'_>,
    _receiver: JObject<'_>,
    session_id: JString<'_>,
) {
    let session_id = match read_string(&mut env, &session_id, "session_id") {
        Ok(session_id) => session_id,
        Err(error) => {
            super::super::usb_accessory_runtime::android_usb_log_warn(format!(
                "event=jni_stop_invalid_session_id error={}",
                error
            ));
            tracing::warn!("mobile_usb_android: invalid native stop session id error={error}");
            return;
        }
    };
    super::super::usb_accessory_runtime::android_usb_log_info(format!(
        "event=jni_stop_called session_id={}",
        super::super::usb_accessory_runtime::log_session_id(&session_id)
    ));
    super::super::shared_android_usb_accessory_runtime().stop_session(&session_id);
}

pub(super) fn notify_session_ended(session_id: &str, reason_code: &str) {
    let result = super::jni::with_jni_env("mobile_usb_accessory_session_ended", |env, context| {
        let class = super::jni::find_class(
            env,
            &context,
            "com/chromvoid/app/nativebridge/MobileUsbAccessoryNativeShell",
        )?;
        let session_id = env
            .new_string(session_id)
            .map_err(|error| format!("new_string session_id: {error}"))?;
        let session_id = JObject::from(session_id);
        let reason_code = env
            .new_string(reason_code)
            .map_err(|error| format!("new_string reason_code: {error}"))?;
        let reason_code = JObject::from(reason_code);

        env.call_static_method(
            class,
            "onNativeAccessorySessionEnded",
            "(Landroid/content/Context;Ljava/lang/String;Ljava/lang/String;)V",
            &[
                JValue::Object(&context),
                JValue::Object(&session_id),
                JValue::Object(&reason_code),
            ],
        )
        .map_err(|error| format!("call onNativeAccessorySessionEnded: {error}"))?;
        Ok(())
    });

    if let Err(error) = result {
        tracing::warn!(
            "mobile_usb_android: failed to notify native session ended session_id={} error={}",
            session_id,
            error
        );
    }
}
