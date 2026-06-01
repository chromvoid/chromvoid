use jni::objects::{JObject, JValue};

const IMAGE_METADATA_NATIVE_SHELL_CLASS: &str =
    "com/chromvoid/app/nativebridge/ImageMetadataNativeShell";

pub fn extract_image_metadata_json(bytes: &[u8]) -> Result<Option<String>, String> {
    super::jni::with_jni_env("image_metadata_extract", |env, context| {
        let class = super::jni::find_class(env, &context, IMAGE_METADATA_NATIVE_SHELL_CLASS)?;
        let payload = env
            .byte_array_from_slice(bytes)
            .map_err(|e| format!("byte_array_from_slice: {e}"))?;

        let result = env
            .call_static_method(
                class,
                "extractMetadata",
                "([B)Ljava/lang/String;",
                &[JValue::Object(&JObject::from(payload))],
            )
            .map_err(|e| format!("call extractMetadata: {e}"))?
            .l()
            .map_err(|e| format!("extractMetadata return type: {e}"))?;

        if result.is_null() {
            return Ok(None);
        }

        let text = super::jni::try_get_java_string_object(env, result, "extractMetadata")?;
        Ok((!text.trim().is_empty()).then_some(text))
    })
}
