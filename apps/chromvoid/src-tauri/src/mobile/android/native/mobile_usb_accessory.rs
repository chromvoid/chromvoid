use jni::objects::{JObject, JString, JValue};
use jni::sys::{jboolean, jint, JNI_FALSE, JNI_TRUE};
use tauri::Emitter;

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
    reason_code: JString<'_>,
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
    let reason_code = match read_string(&mut env, &reason_code, "reason_code") {
        Ok(reason_code) => reason_code,
        Err(error) => {
            super::super::usb_accessory_runtime::android_usb_log_warn(format!(
                "event=jni_stop_invalid_reason session_id={} error={}",
                super::super::usb_accessory_runtime::log_session_id(&session_id),
                error
            ));
            tracing::warn!(
                "mobile_usb_android: invalid native stop reason session_id={} error={}",
                session_id,
                error
            );
            return;
        }
    };
    let reason =
        match super::super::AndroidMobileUsbHostStopReason::from_local_stop_reason(&reason_code) {
            Some(reason) => reason,
            None => {
                super::super::usb_accessory_runtime::android_usb_log_warn(format!(
                    "event=jni_stop_unknown_reason session_id={} reason={}",
                    super::super::usb_accessory_runtime::log_session_id(&session_id),
                    reason_code
                ));
                tracing::warn!(
                    "mobile_usb_android: unknown native stop reason session_id={} reason={}",
                    session_id,
                    reason_code
                );
                super::super::AndroidMobileUsbHostStopReason::Shutdown
            }
        };
    super::super::usb_accessory_runtime::android_usb_log_info(format!(
        "event=jni_stop_called session_id={} reason={}",
        super::super::usb_accessory_runtime::log_session_id(&session_id),
        reason.as_str()
    ));
    super::super::shared_android_usb_accessory_runtime().stop_session(&session_id, reason);
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_MobileUsbAccessoryNativeShell_nativeResolveUsbApproval(
    mut env: jni::JNIEnv<'_>,
    _receiver: JObject<'_>,
    kind: JString<'_>,
    attempt_id: JString<'_>,
    approved: jboolean,
) -> jboolean {
    let kind = match read_string(&mut env, &kind, "approval_kind") {
        Ok(kind) => kind,
        Err(error) => {
            tracing::warn!(
                "mobile_usb_android: ignored native approval with invalid kind: {error}"
            );
            return JNI_FALSE;
        }
    };
    let attempt_id = match read_string(&mut env, &attempt_id, "approval_attempt_id") {
        Ok(attempt_id) => attempt_id,
        Err(error) => {
            tracing::warn!(
                "mobile_usb_android: ignored native approval with invalid attempt id: {error}"
            );
            return JNI_FALSE;
        }
    };
    let kind = match crate::network::mobile_acceptor::MobileUsbApprovalKind::from_native(&kind) {
        Ok(kind) => kind,
        Err(error) => {
            tracing::warn!(
                "mobile_usb_android: ignored native approval kind={kind:?} error={error}"
            );
            return JNI_FALSE;
        }
    };
    if matches!(
        kind,
        crate::network::mobile_acceptor::MobileUsbApprovalKind::Pairing
    ) && approved == JNI_TRUE
    {
        tracing::warn!("mobile_usb_android: pairing approval must display its PIN in ChromVoid");
        return JNI_FALSE;
    }
    let Some(app) = crate::mobile::android::runtime::app_handle() else {
        tracing::warn!("mobile_usb_android: ignored native approval before app registration");
        return JNI_FALSE;
    };
    let Some(runtime) = crate::mobile::android::runtime::app_mobile_acceptor_runtime() else {
        tracing::warn!(
            "mobile_usb_android: ignored native approval before mobile acceptor registration"
        );
        return JNI_FALSE;
    };

    match runtime.resolve_usb_approval(kind, &attempt_id, approved == JNI_TRUE) {
        Ok(()) => {
            if let Err(error) = app.emit(
                "mobile_usb_host_approval_resolved",
                serde_json::json!({ "attempt_id": attempt_id }),
            ) {
                tracing::warn!(
                    "mobile_usb_android: failed to emit resolved approval event: {error}"
                );
            }
            JNI_TRUE
        }
        Err(error) => {
            tracing::warn!("mobile_usb_android: ignored stale or invalid native approval: {error}");
            JNI_FALSE
        }
    }
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

pub(super) fn notify_approval_required(kind: &str, attempt_id: &str) {
    let result = super::jni::with_jni_env("mobile_usb_approval_required", |env, context| {
        let class = super::jni::find_class(
            env,
            &context,
            "com/chromvoid/app/nativebridge/MobileUsbAccessoryNativeShell",
        )?;
        let kind = env
            .new_string(kind)
            .map_err(|error| format!("new_string kind: {error}"))?;
        let kind = JObject::from(kind);
        let attempt_id = env
            .new_string(attempt_id)
            .map_err(|error| format!("new_string attempt_id: {error}"))?;
        let attempt_id = JObject::from(attempt_id);

        env.call_static_method(
            class,
            "onNativeUsbApprovalRequired",
            "(Landroid/content/Context;Ljava/lang/String;Ljava/lang/String;)V",
            &[
                JValue::Object(&context),
                JValue::Object(&kind),
                JValue::Object(&attempt_id),
            ],
        )
        .map_err(|error| format!("call onNativeUsbApprovalRequired: {error}"))?;
        Ok(())
    });

    if let Err(error) = result {
        tracing::warn!(
            "mobile_usb_android: failed to post USB approval notification kind={} error={}",
            kind,
            error
        );
    }
}

pub(super) fn notify_approval_resolved() {
    let result = super::jni::with_jni_env("mobile_usb_approval_resolved", |env, context| {
        let class = super::jni::find_class(
            env,
            &context,
            "com/chromvoid/app/nativebridge/MobileUsbAccessoryNativeShell",
        )?;

        env.call_static_method(
            class,
            "onNativeUsbApprovalResolved",
            "(Landroid/content/Context;)V",
            &[JValue::Object(&context)],
        )
        .map_err(|error| format!("call onNativeUsbApprovalResolved: {error}"))?;
        Ok(())
    });

    if let Err(error) = result {
        tracing::warn!(
            "mobile_usb_android: failed to cancel USB approval notification error={}",
            error
        );
    }
}
