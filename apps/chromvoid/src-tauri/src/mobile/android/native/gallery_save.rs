use jni::objects::{JObject, JValue};

const GALLERY_SAVE_NATIVE_SHELL_CLASS: &str =
    "com/chromvoid/app/nativebridge/GallerySaveNativeShell";

pub fn save_image_to_gallery(
    bytes: &[u8],
    file_name: &str,
    mime_type: Option<&str>,
) -> Result<String, String> {
    super::jni::with_jni_env("gallery_save", |env, context| {
        let class = super::jni::find_class(env, &context, GALLERY_SAVE_NATIVE_SHELL_CLASS)?;

        let payload = env
            .byte_array_from_slice(bytes)
            .map_err(|e| format!("byte_array_from_slice: {e}"))?;
        let file_name = env
            .new_string(file_name)
            .map_err(|e| format!("new_string file_name: {e}"))?;
        let mime_type = match mime_type {
            Some(value) => JObject::from(
                env.new_string(value)
                    .map_err(|e| format!("new_string mime_type: {e}"))?,
            ),
            None => JObject::null(),
        };
        let payload_obj = JObject::from(payload);
        let file_name_obj = JObject::from(file_name);

        let result = env
            .call_static_method(
                class,
                "saveImageToGallery",
                "(Landroid/content/Context;[BLjava/lang/String;Ljava/lang/String;)Ljava/lang/String;",
                &[
                    JValue::Object(&context),
                    JValue::Object(&payload_obj),
                    JValue::Object(&file_name_obj),
                    JValue::Object(&mime_type),
                ],
            )
            .map_err(|e| format!("call saveImageToGallery: {e}"))?
            .l()
            .map_err(|e| format!("saveImageToGallery return type: {e}"))?;

        super::jni::try_get_java_string_object(env, result, "Android gallery save")
    })
}
