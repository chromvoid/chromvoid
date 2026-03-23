//! Android keystore backend.

use super::{Keystore, KeystoreError, STORAGE_PEPPER_LEN};
use std::sync::Arc;

#[cfg(target_os = "android")]
use jni::objects::{JByteArray, JObject, JValue};
#[cfg(target_os = "android")]
use jni::{JNIEnv, JavaVM};

#[cfg(target_os = "android")]
const BRIDGE_CLASS: &str = "com/chromvoid/app/KeystoreBridge";

trait AndroidKeystoreBackend: Send + Sync {
    fn load_storage_pepper(&self) -> Result<Option<Vec<u8>>, KeystoreError>;
    fn store_storage_pepper(&self, pepper: [u8; STORAGE_PEPPER_LEN]) -> Result<(), KeystoreError>;
    fn delete_storage_pepper(&self) -> Result<(), KeystoreError>;
}

#[derive(Debug, Default, Clone, Copy)]
struct JniAndroidKeystoreBackend;

#[cfg(target_os = "android")]
impl JniAndroidKeystoreBackend {
    fn with_env<T>(
        &self,
        operation_name: &'static str,
        f: impl FnOnce(&mut JNIEnv<'_>) -> Result<T, KeystoreError>,
    ) -> Result<T, KeystoreError> {
        let ctx = ndk_context::android_context();
        if ctx.vm().is_null() {
            return Err(KeystoreError::Unavailable);
        }

        let vm = unsafe { JavaVM::from_raw(ctx.vm().cast()) }
            .map_err(|e| KeystoreError::Other(format!("{operation_name}: {e}")))?;

        let mut env = vm
            .attach_current_thread()
            .map_err(|e| KeystoreError::Other(format!("{operation_name}: {e}")))?;
        f(&mut env)
    }

    fn bridge_class<'a>(
        &self,
        env: &mut JNIEnv<'a>,
    ) -> Result<jni::objects::JClass<'a>, KeystoreError> {
        let ctx = ndk_context::android_context();
        if ctx.context().is_null() {
            return Err(KeystoreError::Unavailable);
        }

        let context = unsafe { JObject::from_raw(ctx.context().cast()) };
        let class_loader = env
            .call_method(&context, "getClassLoader", "()Ljava/lang/ClassLoader;", &[])
            .map_err(|e| Self::map_jni_error(env, "getClassLoader", e))?
            .l()
            .map_err(|e| KeystoreError::Other(format!("getClassLoader return conversion: {e}")))?;
        std::mem::forget(context);

        let class_name = env
            .new_string(BRIDGE_CLASS.replace('/', "."))
            .map_err(|e| KeystoreError::Other(format!("bridge class name allocation: {e}")))?;
        let class_name_obj = JObject::from(class_name);
        let class = env
            .call_method(
                &class_loader,
                "loadClass",
                "(Ljava/lang/String;)Ljava/lang/Class;",
                &[JValue::Object(&class_name_obj)],
            )
            .map_err(|e| Self::map_jni_error(env, "load bridge class", e))?
            .l()
            .map_err(|e| {
                KeystoreError::Other(format!("load bridge class return conversion: {e}"))
            })?;

        Ok(jni::objects::JClass::from(class))
    }

    fn map_jni_error(
        env: &mut JNIEnv<'_>,
        operation: &'static str,
        err: jni::errors::Error,
    ) -> KeystoreError {
        match err {
            jni::errors::Error::JavaException => Self::map_pending_exception(env, operation),
            other => KeystoreError::Other(format!("{operation}: {other}")),
        }
    }

    fn map_pending_exception(env: &mut JNIEnv<'_>, operation: &'static str) -> KeystoreError {
        let throwable = match env.exception_occurred() {
            Ok(t) => t,
            Err(e) => return KeystoreError::Other(format!("{operation}: java exception: {e}")),
        };
        if let Err(e) = env.exception_clear() {
            return KeystoreError::Other(format!("{operation}: clear java exception: {e}"));
        }

        let mapped = if Self::is_exception(
            env,
            &throwable,
            "android/security/keystore/KeyPermanentlyInvalidatedException",
        ) {
            KeystoreError::KeyInvalidated
        } else if Self::is_exception(env, &throwable, "java/lang/SecurityException") {
            KeystoreError::PermissionDenied
        } else {
            let message = Self::exception_message(env, &throwable)
                .unwrap_or_else(|| "unknown java exception".to_string());
            KeystoreError::Other(format!("{operation}: {message}"))
        };

        mapped
    }

    fn is_exception(env: &mut JNIEnv<'_>, throwable: &JObject<'_>, class_name: &str) -> bool {
        env.is_instance_of(throwable, class_name).unwrap_or(false)
    }

    fn exception_message(env: &mut JNIEnv<'_>, throwable: &JObject<'_>) -> Option<String> {
        let message = env
            .call_method(throwable, "toString", "()Ljava/lang/String;", &[])
            .ok()?
            .l()
            .ok()?;
        if message.is_null() {
            return None;
        }

        let jstr = jni::objects::JString::from(message);
        env.get_string(&jstr).ok().map(|s| s.into())
    }
}

#[cfg(target_os = "android")]
impl AndroidKeystoreBackend for JniAndroidKeystoreBackend {
    fn load_storage_pepper(&self) -> Result<Option<Vec<u8>>, KeystoreError> {
        self.with_env("load storage pepper", |env| {
            let class = self.bridge_class(env)?;
            let value = env
                .call_static_method(class, "loadPepper", "()[B", &[])
                .map_err(|e| Self::map_jni_error(env, "loadPepper", e))?;
            let array_obj = value
                .l()
                .map_err(|e| KeystoreError::Other(format!("loadPepper return conversion: {e}")))?;
            if array_obj.is_null() {
                return Ok(None);
            }

            let array = JByteArray::from(array_obj);
            env.convert_byte_array(array)
                .map(Some)
                .map_err(|e| KeystoreError::Other(format!("loadPepper bytes conversion: {e}")))
        })
    }

    fn store_storage_pepper(&self, pepper: [u8; STORAGE_PEPPER_LEN]) -> Result<(), KeystoreError> {
        self.with_env("store storage pepper", |env| {
            let class = self.bridge_class(env)?;
            let array = env
                .byte_array_from_slice(&pepper)
                .map_err(|e| KeystoreError::Other(format!("storePepper byte[] allocation: {e}")))?;
            let array_obj = JObject::from(array);
            env.call_static_method(class, "storePepper", "([B)V", &[JValue::Object(&array_obj)])
                .map_err(|e| Self::map_jni_error(env, "storePepper", e))?;
            Ok(())
        })
    }

    fn delete_storage_pepper(&self) -> Result<(), KeystoreError> {
        self.with_env("delete storage pepper", |env| {
            let class = self.bridge_class(env)?;
            env.call_static_method(class, "deletePepper", "()V", &[])
                .map_err(|e| Self::map_jni_error(env, "deletePepper", e))?;
            Ok(())
        })
    }
}

#[cfg(not(target_os = "android"))]
impl AndroidKeystoreBackend for JniAndroidKeystoreBackend {
    fn load_storage_pepper(&self) -> Result<Option<Vec<u8>>, KeystoreError> {
        Err(KeystoreError::Unavailable)
    }

    fn store_storage_pepper(&self, _pepper: [u8; STORAGE_PEPPER_LEN]) -> Result<(), KeystoreError> {
        Err(KeystoreError::Unavailable)
    }

    fn delete_storage_pepper(&self) -> Result<(), KeystoreError> {
        Err(KeystoreError::Unavailable)
    }
}

#[derive(Clone)]
pub struct AndroidKeystore {
    backend: Arc<dyn AndroidKeystoreBackend>,
}

impl std::fmt::Debug for AndroidKeystore {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AndroidKeystore").finish_non_exhaustive()
    }
}

impl Default for AndroidKeystore {
    fn default() -> Self {
        Self::new()
    }
}

impl AndroidKeystore {
    pub fn new() -> Self {
        Self {
            backend: Arc::new(JniAndroidKeystoreBackend),
        }
    }

    #[cfg(test)]
    fn with_backend(backend: Arc<dyn AndroidKeystoreBackend>) -> Self {
        Self { backend }
    }
}

impl Keystore for AndroidKeystore {
    fn load_storage_pepper(&self) -> Result<Option<[u8; STORAGE_PEPPER_LEN]>, KeystoreError> {
        let pepper = match self.backend.load_storage_pepper()? {
            Some(pepper) => pepper,
            None => return Ok(None),
        };

        if pepper.len() != STORAGE_PEPPER_LEN {
            return Err(KeystoreError::Corrupted);
        }

        let mut out = [0u8; STORAGE_PEPPER_LEN];
        out.copy_from_slice(&pepper);
        Ok(Some(out))
    }

    fn store_storage_pepper(&self, pepper: [u8; STORAGE_PEPPER_LEN]) -> Result<(), KeystoreError> {
        self.backend.store_storage_pepper(pepper)
    }

    fn delete_storage_pepper(&self) -> Result<(), KeystoreError> {
        self.backend.delete_storage_pepper()
    }
}

#[cfg(test)]
#[path = "android_tests.rs"]
mod tests;
