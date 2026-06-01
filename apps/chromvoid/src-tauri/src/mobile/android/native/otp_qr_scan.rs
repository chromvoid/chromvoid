use jni::objects::{JClass, JObject, JString, JValue};
use serde::Serialize;
use tauri::Emitter;

const OTP_QR_SCANNER_SHELL_CLASS: &str = "com/chromvoid/app/nativebridge/OtpQrScannerNativeShell";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OtpQrScanResultPayload {
    scan_id: String,
    status: String,
    value: Option<String>,
    message: Option<String>,
}

fn read_otp_qr_string(
    env: &mut jni::JNIEnv<'_>,
    value: &JString<'_>,
    field: &'static str,
) -> Result<String, String> {
    super::jni::try_get_java_string(env, value)
        .map_err(|error| format!("Invalid OTP QR scan string {field}: {error}"))
}

pub fn start_otp_qr_scan(_app: tauri::AppHandle, scan_id: &str) -> Result<(), String> {
    match jni_start_scan(scan_id)? {
        0 => Ok(()),
        1 => Err("OTP QR scan id is invalid".to_string()),
        2 => Err("OTP QR scanner is already running".to_string()),
        3 => Err("OTP QR scanner failed to launch".to_string()),
        code => Err(format!("OTP QR scanner failed to launch ({code})")),
    }
}

pub fn cancel_otp_qr_scan(scan_id: &str) -> bool {
    match jni_cancel_scan(scan_id) {
        Ok(cancelled) => cancelled,
        Err(error) => {
            tracing::warn!("otp_qr_scan: failed to cancel scan: {error}");
            false
        }
    }
}

fn emit_result(payload: OtpQrScanResultPayload) -> bool {
    let Some(app) = crate::mobile::android::runtime::app_handle() else {
        tracing::warn!("otp_qr_scan: AppHandle unavailable while emitting scan result");
        return false;
    };

    match app.emit("otp:qr-scan-result", payload) {
        Ok(()) => true,
        Err(error) => {
            tracing::warn!("otp_qr_scan: failed to emit scan result: {error}");
            false
        }
    }
}

fn jni_start_scan(scan_id: &str) -> Result<i32, String> {
    super::jni::with_jni_env("otp_qr_scan_start", |env, context| {
        let class = super::jni::find_class(env, &context, OTP_QR_SCANNER_SHELL_CLASS)?;
        let scan_id = env
            .new_string(scan_id)
            .map_err(|e| format!("new_string scan_id: {e}"))?;
        let scan_id = JObject::from(scan_id);

        env.call_static_method(
            class,
            "startScan",
            "(Landroid/content/Context;Ljava/lang/String;)I",
            &[JValue::Object(&context), JValue::Object(&scan_id)],
        )
        .map_err(|e| format!("call startScan: {e}"))?
        .i()
        .map_err(|e| format!("startScan return type: {e}"))
    })
}

fn jni_cancel_scan(scan_id: &str) -> Result<bool, String> {
    super::jni::with_jni_env("otp_qr_scan_cancel", |env, context| {
        let class = super::jni::find_class(env, &context, OTP_QR_SCANNER_SHELL_CLASS)?;
        let scan_id = env
            .new_string(scan_id)
            .map_err(|e| format!("new_string scan_id: {e}"))?;
        let scan_id = JObject::from(scan_id);

        env.call_static_method(
            class,
            "cancelScan",
            "(Ljava/lang/String;)Z",
            &[JValue::Object(&scan_id)],
        )
        .map_err(|e| format!("call cancelScan: {e}"))?
        .z()
        .map_err(|e| format!("cancelScan return type: {e}"))
    })
}

fn optional_json_string(value: String) -> Option<String> {
    if value.trim().is_empty() {
        None
    } else {
        Some(value)
    }
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_nativebridge_OtpQrScannerNativeShell_nativeOnOtpQrScanResult(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    scan_id: JString<'_>,
    status: JString<'_>,
    value: JString<'_>,
    message: JString<'_>,
) -> jni::sys::jboolean {
    let scan_id = match read_otp_qr_string(&mut env, &scan_id, "scan_id") {
        Ok(scan_id) => scan_id,
        Err(error) => {
            tracing::warn!("otp_qr_scan: ignored result with invalid scan_id: {error}");
            return 0;
        }
    };
    let status = match read_otp_qr_string(&mut env, &status, "status") {
        Ok(status) => status,
        Err(error) => {
            tracing::warn!("otp_qr_scan: result received invalid status: {error}");
            String::new()
        }
    };
    let value = match read_otp_qr_string(&mut env, &value, "value") {
        Ok(value) => value,
        Err(error) => {
            tracing::warn!("otp_qr_scan: result received invalid value: {error}");
            String::new()
        }
    };
    let message = match read_otp_qr_string(&mut env, &message, "message") {
        Ok(message) => message,
        Err(error) => {
            tracing::warn!("otp_qr_scan: result received invalid message: {error}");
            String::new()
        }
    };

    if scan_id.trim().is_empty() {
        return 0;
    }

    let payload = OtpQrScanResultPayload {
        scan_id,
        status: if status.trim().is_empty() {
            "invalid".to_string()
        } else {
            status
        },
        value: optional_json_string(value),
        message: optional_json_string(message),
    };

    emit_result(payload) as jni::sys::jboolean
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn optional_json_string_treats_blank_as_none() {
        assert_eq!(optional_json_string("".to_string()), None);
        assert_eq!(optional_json_string("  ".to_string()), None);
        assert_eq!(
            optional_json_string("qr".to_string()),
            Some("qr".to_string())
        );
    }

    #[test]
    fn result_payload_uses_camel_case_scan_id() {
        let payload = OtpQrScanResultPayload {
            scan_id: "scan-1".to_string(),
            status: "success".to_string(),
            value: Some("otpauth://totp/Test?secret=ABC".to_string()),
            message: None,
        };

        let json = serde_json::to_value(payload).unwrap_or(Value::Null);
        assert_eq!(json["scanId"], "scan-1");
        assert!(json.get("scan_id").is_none());
    }
}
