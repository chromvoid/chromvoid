use std::os::raw::c_void;

use jni::objects::{JObject, JValue};

const SERVICE_CLASS: &str = "com/chromvoid/app/ConnectionForegroundService";

pub fn start_connection_service(device_name: &str) -> bool {
    tracing::info!(
        "Android foreground service start requested for: {}",
        device_name
    );
    match jni_start_service(device_name) {
        Ok(()) => true,
        Err(error) => {
            tracing::error!("Failed to start foreground service via JNI: {error}");
            false
        }
    }
}

pub fn stop_connection_service() -> bool {
    tracing::info!("Android foreground service stop requested");
    match jni_stop_service() {
        Ok(()) => true,
        Err(error) => {
            tracing::error!("Failed to stop foreground service via JNI: {error}");
            false
        }
    }
}

fn jni_start_service(device_name: &str) -> Result<(), String> {
    super::jni::with_jni_env("start_connection_service", |env, context| {
        let class = env
            .find_class(SERVICE_CLASS)
            .map_err(|e| format!("find_class: {e}"))?;

        let j_device_name = env
            .new_string(device_name)
            .map_err(|e| format!("new_string: {e}"))?;

        env.call_static_method(
            class,
            "start",
            "(Landroid/content/Context;Ljava/lang/String;)V",
            &[
                JValue::Object(&context),
                JValue::Object(&JObject::from(j_device_name)),
            ],
        )
        .map_err(|e| format!("call start: {e}"))?;

        Ok(())
    })
}

fn jni_stop_service() -> Result<(), String> {
    super::jni::with_jni_env("stop_connection_service", |env, context| {
        let class = env
            .find_class(SERVICE_CLASS)
            .map_err(|e| format!("find_class: {e}"))?;

        env.call_static_method(
            class,
            "stop",
            "(Landroid/content/Context;)V",
            &[JValue::Object(&context)],
        )
        .map_err(|e| format!("call stop: {e}"))?;

        Ok(())
    })
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_ConnectionForegroundService_nativeOnServiceStopped(
    _env: *mut c_void,
    _this: *mut c_void,
) {
    let _ = crate::network::mobile_acceptor::stop_listening();
}
