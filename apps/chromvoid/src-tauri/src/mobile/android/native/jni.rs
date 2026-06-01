use jni::objects::{JClass, JObject, JString, JValue};

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

    // SAFETY: ctx.vm() returns a non-null JavaVM* (null-checked above on line 8); lifetime tied to the JVM
    // which outlives this process.
    let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }
        .map_err(|e| format!("{operation}: JavaVM::from_raw: {e}"))?;

    let mut env = vm
        .attach_current_thread()
        .map_err(|e| format!("{operation}: attach_current_thread: {e}"))?;

    // SAFETY: ctx.context() returns a non-null Android Context jobject (null-checked above on line 11); the
    // global ref is owned by ndk_context, so this borrow is valid for the JNI call below.
    let context = unsafe { JObject::from_raw(ctx.context().cast()) };
    f(&mut env, context)
}

pub fn find_class<'local, 'other_local>(
    env: &mut jni::JNIEnv<'local>,
    context: &JObject<'other_local>,
    class_name: &str,
) -> Result<JClass<'local>, String> {
    if !class_name.starts_with("com/") {
        return env
            .find_class(class_name)
            .map_err(|e| format!("find_class: {e}"));
    }

    let context = env
        .new_local_ref(context)
        .map_err(|e| format!("new_local_ref context: {e}"))?;
    let class_loader = env
        .call_method(&context, "getClassLoader", "()Ljava/lang/ClassLoader;", &[])
        .map_err(|e| format!("getClassLoader: {e}"))?
        .l()
        .map_err(|e| format!("getClassLoader return type: {e}"))?;

    let class_name = env
        .new_string(class_name.replace('/', "."))
        .map_err(|e| format!("new_string class_name: {e}"))?;
    let class_name_obj = JObject::from(class_name);

    let class = env
        .call_method(
            &class_loader,
            "loadClass",
            "(Ljava/lang/String;)Ljava/lang/Class;",
            &[JValue::Object(&class_name_obj)],
        )
        .map_err(|e| format!("loadClass: {e}"))?
        .l()
        .map_err(|e| format!("loadClass return type: {e}"))?;

    Ok(JClass::from(class))
}

pub fn current_device_api_level() -> Option<u64> {
    with_jni_env("android_sdk_int", |env, _context| {
        current_device_api_level_from_env(env).ok_or_else(|| "SDK_INT unavailable".to_string())
    })
    .map_err(|error| {
        tracing::warn!("android credential provider: failed to query SDK_INT: {error}");
        error
    })
    .ok()
}

pub fn current_device_api_level_from_env(env: &mut jni::JNIEnv<'_>) -> Option<u64> {
    let result = (|| {
        let class = env
            .find_class("android/os/Build$VERSION")
            .map_err(|e| format!("find_class: {e}"))?;
        let value = env
            .get_static_field(class, "SDK_INT", "I")
            .map_err(|e| format!("get_static_field SDK_INT: {e}"))?
            .i()
            .map_err(|e| format!("SDK_INT return type: {e}"))?;
        Ok::<u64, String>(value as u64)
    })();

    result
        .map_err(|error| {
            tracing::warn!(
                "android credential provider: failed to query SDK_INT from JNI env: {error}"
            );
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
        let class = find_class(env, &context, class_name)?;

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
    with_jni_env(operation, |env, context| {
        let class = find_class(env, &context, class_name)?;

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
    with_jni_env(operation, |env, context| {
        let class = find_class(env, &context, class_name)?;

        env.call_static_method(class, method_name, "()Z", &[])
            .map_err(|e| format!("call {method_name}: {e}"))?
            .z()
            .map_err(|e| format!("{method_name} return type: {e}"))
    })
}

pub fn try_get_java_string(
    env: &mut jni::JNIEnv<'_>,
    value: &JString<'_>,
) -> Result<String, String> {
    env.get_string(value)
        .map(|v| v.to_string_lossy().into_owned())
        .map_err(|e| format!("get Java string: {e}"))
}

pub fn try_get_java_string_object(
    env: &mut jni::JNIEnv<'_>,
    value: JObject<'_>,
    operation: &str,
) -> Result<String, String> {
    if value.is_null() {
        return Err(format!("{operation} returned null"));
    }
    try_get_java_string(env, &JString::from(value)).map_err(|error| format!("{operation}: {error}"))
}
