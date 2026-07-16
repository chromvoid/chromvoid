use std::sync::Mutex;

use jni::objects::{GlobalRef, JObject};
use jni::sys::{jboolean, JNI_FALSE, JNI_TRUE};

// `ndk-context` only stores raw JNI pointers, so ChromVoid must keep the
// application context global reference alive for the lifetime of the process.
static ANDROID_APPLICATION_CONTEXT: Mutex<Option<GlobalRef>> = Mutex::new(None);

fn initialize_android_context(
    env: &mut jni::JNIEnv<'_>,
    context: &JObject<'_>,
) -> Result<(), String> {
    let mut application_context = ANDROID_APPLICATION_CONTEXT
        .lock()
        .map_err(|_| "Android application context mutex poisoned".to_string())?;
    if application_context.is_some() {
        return Ok(());
    }

    let vm = env
        .get_java_vm()
        .map_err(|error| format!("get JavaVM: {error}"))?;
    let context = env
        .new_global_ref(context)
        .map_err(|error| format!("create application context global ref: {error}"))?;

    // SAFETY: the JavaVM belongs to the process and `context` is retained in
    // `ANDROID_APPLICATION_CONTEXT`, so both pointers remain valid for the
    // process lifetime. This function is guarded to initialize exactly once.
    unsafe {
        ndk_context::initialize_android_context(
            vm.get_java_vm_pointer().cast(),
            context.as_obj().as_raw().cast(),
        );
    }
    *application_context = Some(context);
    Ok(())
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_chromvoid_app_MainActivity_nativeInitializeRustContext(
    mut env: jni::JNIEnv<'_>,
    _activity: JObject<'_>,
    application_context: JObject<'_>,
) -> jboolean {
    match initialize_android_context(&mut env, &application_context) {
        Ok(()) => JNI_TRUE,
        Err(error) => {
            eprintln!("Android Rust context initialization failed: {error}");
            JNI_FALSE
        }
    }
}
