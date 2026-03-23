use jni::objects::JObject;
use jni::objects::JValue;

const PASSWORD_SAVE_NATIVE_SHELL_CLASS: &str =
    "com/chromvoid/app/nativebridge/PasswordSaveNativeShell";

pub fn notify_password_save_review_result(token: Option<&str>, outcome: &str, finished: bool) {
    let _ = super::jni::with_jni_env("password_save_review_result", |env, _context| {
        let class = env
            .find_class(PASSWORD_SAVE_NATIVE_SHELL_CLASS)
            .map_err(|e| format!("find_class: {e}"))?;
        let token = env
            .new_string(token.unwrap_or_default())
            .map_err(|e| format!("new_string token: {e}"))?;
        let outcome = env
            .new_string(outcome)
            .map_err(|e| format!("new_string outcome: {e}"))?;
        let token_obj = JObject::from(token);
        let outcome_obj = JObject::from(outcome);
        env.call_static_method(
            class,
            "completeReview",
            "(Ljava/lang/String;Ljava/lang/String;Z)V",
            &[
                JValue::Object(&token_obj),
                JValue::Object(&outcome_obj),
                JValue::Bool(if finished { 1 } else { 0 }),
            ],
        )
        .map_err(|e| format!("call_static_method completeReview: {e}"))?;
        Ok(())
    });
}
