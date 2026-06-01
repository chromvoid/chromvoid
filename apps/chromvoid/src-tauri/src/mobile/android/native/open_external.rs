use jni::objects::{JObject, JValue};

const OPEN_EXTERNAL_NATIVE_SHELL_CLASS: &str =
    "com/chromvoid/app/nativebridge/OpenExternalNativeShell";

pub fn open_file_with_system(
    path: &std::path::Path,
    mime_type: Option<&str>,
) -> Result<(), String> {
    let file_path = path.to_string_lossy().into_owned();

    super::jni::with_jni_env("open_file_with_system", |env, context| {
        let class = super::jni::find_class(env, &context, OPEN_EXTERNAL_NATIVE_SHELL_CLASS)?;

        let file_path = env
            .new_string(&file_path)
            .map_err(|e| format!("new_string file_path: {e}"))?;
        let mime_type = match mime_type {
            Some(value) => JObject::from(
                env.new_string(value)
                    .map_err(|e| format!("new_string mime_type: {e}"))?,
            ),
            None => JObject::null(),
        };
        let file_path_obj = JObject::from(file_path);

        let result = env
            .call_static_method(
                class,
                "openFileInSystem",
                "(Landroid/content/Context;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;",
                &[
                    JValue::Object(&context),
                    JValue::Object(&file_path_obj),
                    JValue::Object(&mime_type),
                ],
            )
            .map_err(|e| format!("call openFileInSystem: {e}"))?
            .l()
            .map_err(|e| format!("openFileInSystem return type: {e}"))?;

        if result.is_null() {
            return Ok(());
        }

        Err(super::jni::try_get_java_string_object(
            env,
            result,
            "openFileInSystem",
        )?)
    })
}

pub fn open_url_with_system(url: &str) -> Result<(), String> {
    super::jni::with_jni_env("open_url_with_system", |env, context| {
        let class = super::jni::find_class(env, &context, OPEN_EXTERNAL_NATIVE_SHELL_CLASS)?;
        let url = JObject::from(
            env.new_string(url)
                .map_err(|e| format!("new_string url: {e}"))?,
        );

        let result = env
            .call_static_method(
                class,
                "openUrlExternal",
                "(Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;",
                &[JValue::Object(&context), JValue::Object(&url)],
            )
            .map_err(|e| format!("call openUrlExternal: {e}"))?
            .l()
            .map_err(|e| format!("openUrlExternal return type: {e}"))?;

        if result.is_null() {
            return Ok(());
        }

        Err(super::jni::try_get_java_string_object(
            env,
            result,
            "openUrlExternal",
        )?)
    })
}
