//! Android process context handover.
//!
//! `ndk-context` stores raw JNI pointers, so the application context global
//! reference must outlive every Core keystore call. The application hands it
//! over once, before any runtime is constructed; nothing here touches storage.

use std::sync::Mutex;

use jni::objects::{GlobalRef, JObject};
use jni::sys::{JNI_FALSE, JNI_TRUE, jboolean};

static ANDROID_APPLICATION_CONTEXT: Mutex<Option<GlobalRef>> = Mutex::new(None);

fn initialize(env: &mut jni::JNIEnv<'_>, context: &JObject<'_>) -> Result<(), String> {
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
    // `ANDROID_APPLICATION_CONTEXT`, so both pointers stay valid for the
    // process lifetime. The guard above initializes exactly once.
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
pub extern "system" fn Java_com_chromvoid_air_ffi_AirNative_initializeRustContext(
    mut env: jni::JNIEnv<'_>,
    _class: JObject<'_>,
    application_context: JObject<'_>,
) -> jboolean {
    crate::android_log::install();
    match initialize(&mut env, &application_context) {
        Ok(()) => {
            crate::android_image_decoder::install(&mut env, &application_context);
            JNI_TRUE
        }
        Err(error) => {
            eprintln!("Android Rust context initialization failed: {error}");
            JNI_FALSE
        }
    }
}
