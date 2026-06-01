use jni::objects::{JObject, JObjectArray, JValue};

const SHARE_FILE_NATIVE_SHELL_CLASS: &str = "com/chromvoid/app/nativebridge/ShareFileNativeShell";

fn build_string_array<'local>(
    env: &mut jni::JNIEnv<'local>,
    values: &[Option<&str>],
) -> Result<JObjectArray<'local>, String> {
    let string_class = env
        .find_class("java/lang/String")
        .map_err(|e| format!("find_class java/lang/String: {e}"))?;
    let array = env
        .new_object_array(values.len() as i32, string_class, JObject::null())
        .map_err(|e| format!("new_object_array: {e}"))?;

    for (index, value) in values.iter().enumerate() {
        let object = match value {
            Some(value) => JObject::from(
                env.new_string(value)
                    .map_err(|e| format!("new_string[{index}]: {e}"))?,
            ),
            None => JObject::null(),
        };

        env.set_object_array_element(&array, index as i32, object)
            .map_err(|e| format!("set_object_array_element[{index}]: {e}"))?;
    }

    Ok(array)
}

pub fn share_files_with_system(items: &[(&std::path::Path, Option<&str>)]) -> Result<(), String> {
    if items.is_empty() {
        return Err("No files provided for sharing".to_string());
    }

    let file_paths: Vec<String> = items
        .iter()
        .map(|(path, _)| path.to_string_lossy().into_owned())
        .collect();
    let path_refs: Vec<Option<&str>> = file_paths.iter().map(|path| Some(path.as_str())).collect();
    let mime_refs: Vec<Option<&str>> = items.iter().map(|(_, mime_type)| *mime_type).collect();

    super::jni::with_jni_env("share_files_with_system", |env, context| {
        let class = super::jni::find_class(env, &context, SHARE_FILE_NATIVE_SHELL_CLASS)?;
        let path_array = build_string_array(env, &path_refs)?;
        let mime_array = build_string_array(env, &mime_refs)?;
        let path_obj = JObject::from(path_array);
        let mime_obj = JObject::from(mime_array);

        let result = env
            .call_static_method(
                class,
                "shareFilesInSystem",
                "(Landroid/content/Context;[Ljava/lang/String;[Ljava/lang/String;)Ljava/lang/String;",
                &[
                    JValue::Object(&context),
                    JValue::Object(&path_obj),
                    JValue::Object(&mime_obj),
                ],
            )
            .map_err(|e| format!("call shareFilesInSystem: {e}"))?
            .l()
            .map_err(|e| format!("shareFilesInSystem return type: {e}"))?;

        if result.is_null() {
            return Ok(());
        }

        Err(super::jni::try_get_java_string_object(
            env,
            result,
            "shareFilesInSystem",
        )?)
    })
}
