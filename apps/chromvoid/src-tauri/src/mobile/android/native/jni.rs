use jni::objects::{JObject, JString, JValue};

pub fn with_jni_env<T>(
    operation: &'static str,
    f: impl FnOnce(&mut jni::JNIEnv<'_>, JObject<'_>) -> Result<T, String>,
) -> Result<T, String> {
    let ctx = ndk_context::android_context();
    if ctx.vm().is_null() {
        return Err(format!("{operation}: JavaVM pointer is null"));
    }
    if ctx.context().is_null() {
        return Err(format!("{operation}: Android Context pointer is null"));
    }

    let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }
        .map_err(|e| format!("{operation}: JavaVM::from_raw: {e}"))?;

    let mut env = vm
        .attach_current_thread()
        .map_err(|e| format!("{operation}: attach_current_thread: {e}"))?;

    let context = unsafe { JObject::from_raw(ctx.context().cast()) };
    f(&mut env, context)
}

pub fn current_device_api_level() -> Option<u64> {
    with_jni_env("android_sdk_int", |env, _context| {
        let class = env
            .find_class("android/os/Build$VERSION")
            .map_err(|e| format!("find_class: {e}"))?;
        let value = env
            .get_static_field(class, "SDK_INT", "I")
            .map_err(|e| format!("get_static_field SDK_INT: {e}"))?
            .i()
            .map_err(|e| format!("SDK_INT return type: {e}"))?;
        Ok(value as u64)
    })
    .map_err(|error| {
        tracing::warn!("android credential provider: failed to query SDK_INT: {error}");
        error
    })
    .ok()
}

pub fn call_static_int_method_with_context(
    operation: &'static str,
    class_name: &str,
    method_name: &str,
) -> Result<i32, String> {
    with_jni_env(operation, |env, context| {
        let class = env
            .find_class(class_name)
            .map_err(|e| format!("find_class: {e}"))?;

        env.call_static_method(
            class,
            method_name,
            "(Landroid/content/Context;)I",
            &[JValue::Object(&context)],
        )
        .map_err(|e| format!("call {method_name}: {e}"))?
        .i()
        .map_err(|e| format!("{method_name} return type: {e}"))
    })
}

pub fn call_static_int_method_with_string_arg(
    operation: &'static str,
    class_name: &str,
    method_name: &str,
    arg: &str,
) -> Result<i32, String> {
    with_jni_env(operation, |env, _context| {
        let class = env
            .find_class(class_name)
            .map_err(|e| format!("find_class: {e}"))?;

        let j_arg = env
            .new_string(arg)
            .map_err(|e| format!("new_string: {e}"))?;

        env.call_static_method(
            class,
            method_name,
            "(Ljava/lang/String;)I",
            &[JValue::Object(&JObject::from(j_arg))],
        )
        .map_err(|e| format!("call {method_name}: {e}"))?
        .i()
        .map_err(|e| format!("{method_name} return type: {e}"))
    })
}

pub fn call_static_bool_no_args(
    operation: &'static str,
    class_name: &str,
    method_name: &str,
) -> Result<bool, String> {
    with_jni_env(operation, |env, _context| {
        let class = env
            .find_class(class_name)
            .map_err(|e| format!("find_class: {e}"))?;

        env.call_static_method(class, method_name, "()Z", &[])
            .map_err(|e| format!("call {method_name}: {e}"))?
            .z()
            .map_err(|e| format!("{method_name} return type: {e}"))
    })
}

pub fn get_java_string(env: &mut jni::JNIEnv<'_>, value: &JString<'_>) -> String {
    env.get_string(value)
        .map(|v| v.to_string_lossy().into_owned())
        .unwrap_or_default()
}
