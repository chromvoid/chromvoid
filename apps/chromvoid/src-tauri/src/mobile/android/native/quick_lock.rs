use jni::objects::{JClass, JString, JValue};
use jni::sys::{jboolean, JNI_FALSE, JNI_TRUE};

const VAULT_STATUS_CONTROLLER_CLASS: &str = "com/chromvoid/app/VaultStatusNotificationController";
const QUICK_SETTINGS_TILE_CLASS: &str = "com/chromvoid/app/VaultQuickSettingsTileService";

fn read_quick_lock_source(env: &mut jni::JNIEnv<'_>, source: &JString<'_>) -> String {
    match super::jni::try_get_java_string(env, source) {
        Ok(source) => source,
        Err(error) => {
            tracing::warn!(
                "Android quick lock action received invalid source string; using generic source: {error}"
            );
            String::new()
        }
    }
}

pub fn sync_vault_quick_lock(
    unlocked: bool,
    notification_enabled: bool,
    quick_tile_enabled: bool,
) -> bool {
    match jni_sync_vault_quick_lock(unlocked, notification_enabled, quick_tile_enabled) {
        Ok(()) => true,
        Err(error) => {
            tracing::warn!("Android quick lock sync failed via JNI: {error}");
            false
        }
    }
}

pub fn request_quick_lock_tile() -> i32 {
    match super::jni::call_static_int_method_with_context(
        "request_quick_lock_tile",
        QUICK_SETTINGS_TILE_CLASS,
        "requestAddTile",
    ) {
        Ok(status) => status,
        Err(error) => {
            tracing::warn!("Android quick lock tile request failed via JNI: {error}");
            3
        }
    }
}

fn jni_sync_vault_quick_lock(
    unlocked: bool,
    notification_enabled: bool,
    quick_tile_enabled: bool,
) -> Result<(), String> {
    super::jni::with_jni_env("sync_vault_quick_lock", |env, context| {
        let class = super::jni::find_class(env, &context, VAULT_STATUS_CONTROLLER_CLASS)?;

        env.call_static_method(
            class,
            "syncFromNative",
            "(Landroid/content/Context;ZZZ)V",
            &[
                JValue::Object(&context),
                JValue::Bool(jbool(unlocked)),
                JValue::Bool(jbool(notification_enabled)),
                JValue::Bool(jbool(quick_tile_enabled)),
            ],
        )
        .map_err(|e| format!("call syncFromNative: {e}"))?;

        Ok(())
    })
}

fn jbool(value: bool) -> jboolean {
    if value {
        JNI_TRUE
    } else {
        JNI_FALSE
    }
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_VaultStatusNotificationController_nativeOnQuickLockAction(
    mut env: jni::JNIEnv<'_>,
    _class: JClass<'_>,
    source: JString<'_>,
) {
    let source = read_quick_lock_source(&mut env, &source);
    let Some(app) = crate::mobile::android::runtime::app_handle() else {
        tracing::warn!("Android quick lock action ignored before app handle registration");
        return;
    };

    crate::commands::vault::spawn_lock_vault_from_android_quick_action(app, source);
}
