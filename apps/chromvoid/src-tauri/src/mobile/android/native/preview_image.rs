use jni::objects::{JByteArray, JClass, JObject, JValue};

const HEIF_PREVIEW_NATIVE_SHELL_CLASS: &str =
    "com/chromvoid/app/nativebridge/HeifPreviewNativeShell";
const HEIF_PREVIEW_RESULT_CLASS: &str = "Lcom/chromvoid/app/nativebridge/HeifPreviewNativeResult;";

pub fn convert_image_preview(
    bytes: &[u8],
    tier: crate::image_preview::ImageDerivativeTier,
) -> Result<crate::image_preview::PreviewImageOutput, String> {
    super::jni::with_jni_env("image_preview_decode", |env, context| {
        let class = super::jni::find_class(env, &context, HEIF_PREVIEW_NATIVE_SHELL_CLASS)?;
        let result_signature = format!("([BII){HEIF_PREVIEW_RESULT_CLASS}");
        let max_preview_edge = tier.max_edge();
        let tier_code = match tier {
            crate::image_preview::ImageDerivativeTier::Thumbnail => 0,
            crate::image_preview::ImageDerivativeTier::DisplayPreview => 1,
        };

        let payload = env
            .byte_array_from_slice(bytes)
            .map_err(|e| format!("byte_array_from_slice: {e}"))?;

        let result = env
            .call_static_method(
                &class,
                "decodePreview",
                result_signature.as_str(),
                &[
                    JValue::Object(&JObject::from(payload)),
                    JValue::Int(max_preview_edge as i32),
                    JValue::Int(tier_code),
                ],
            )
            .map_err(|e| format!("call decodePreview: {e}"))?
            .l()
            .map_err(|e| format!("decodePreview return type: {e}"))?;

        if result.is_null() {
            let reason = read_last_decode_failure(env, &class);
            if let Some(reason) = reason {
                tracing::warn!(
                    "image_derivative android_decode_failed tier={} max_edge={} reason={}",
                    tier.label(),
                    max_preview_edge,
                    reason
                );
                return Err(format!(
                    "Android image preview decoder returned null: {reason}"
                ));
            }

            tracing::warn!(
                "image_derivative android_decode_failed tier={} max_edge={} reason=unknown",
                tier.label(),
                max_preview_edge
            );
            return Err("Android image preview decoder returned null".to_string());
        }

        let bytes = env
            .call_method(&result, "getBytes", "()[B", &[])
            .map_err(|e| format!("getBytes: {e}"))?
            .l()
            .map_err(|e| format!("getBytes return type: {e}"))?;
        let mime_type = env
            .call_method(&result, "getMimeType", "()Ljava/lang/String;", &[])
            .map_err(|e| format!("getMimeType: {e}"))?
            .l()
            .map_err(|e| format!("getMimeType return type: {e}"))?;
        let file_extension = env
            .call_method(&result, "getFileExtension", "()Ljava/lang/String;", &[])
            .map_err(|e| format!("getFileExtension: {e}"))?
            .l()
            .map_err(|e| format!("getFileExtension return type: {e}"))?;

        let bytes = env
            .convert_byte_array(&JByteArray::from(bytes))
            .map_err(|e| format!("convert_byte_array: {e}"))?;
        if bytes.is_empty() {
            return Err("Android image preview decoder returned empty payload".to_string());
        }
        let mime_type = super::jni::try_get_java_string_object(env, mime_type, "getMimeType")?;
        let file_extension =
            super::jni::try_get_java_string_object(env, file_extension, "getFileExtension")?;

        match (mime_type.as_str(), file_extension.as_str()) {
            // Android API 28-29 uses PNG as the conservative framework-encoder fallback.
            (crate::image_preview::PNG_PREVIEW_MIME, "png") => {
                Ok(crate::image_preview::PreviewImageOutput::png(bytes))
            }
            (crate::image_preview::WEBP_PREVIEW_MIME, "webp") => {
                Ok(crate::image_preview::PreviewImageOutput::webp(bytes))
            }
            _ => Err(format!(
                "Android image preview decoder returned unsupported format: mime_type={mime_type} extension={file_extension}"
            )),
        }
    })
}

fn read_last_decode_failure(env: &mut jni::JNIEnv<'_>, class: &JClass<'_>) -> Option<String> {
    let value = env
        .call_static_method(class, "getLastDecodeFailure", "()Ljava/lang/String;", &[])
        .ok()?
        .l()
        .ok()?;
    if value.is_null() {
        return None;
    }

    let reason = super::jni::try_get_java_string_object(env, value, "getLastDecodeFailure").ok()?;
    let reason = reason.trim();
    if reason.is_empty() {
        return None;
    }

    Some(reason.chars().take(240).collect())
}
