//! Core's image derivatives on Android: the platform's image decoder, reached from Rust.
//!
//! Core makes a stored preview or thumbnail itself when a client asks it to, as it does on Apple
//! with ImageIO. Android's decoder lives in the JVM (`ImageDerivativeNativeShell` in the platform
//! module): it reads the original from a direct buffer over Rust's memory, decodes it scaled
//! down with its orientation applied, and answers with a PNG or a WebP. The class is resolved
//! once, on the Java thread that hands the application context over: a Core worker thread
//! cannot find an application class by name.
use std::sync::{Condvar, Mutex, OnceLock, PoisonError};

use chromvoid_media_runtime::image_preview::{
    ImageDerivativeTier, PreviewImageOutput, install_platform_image_decoder,
};
use jni::objects::{GlobalRef, JByteArray, JClass, JObject, JStaticMethodID, JString, JValue};
use jni::signature::ReturnType;
use jni::sys::jvalue;
use jni::{JNIEnv, JavaVM};

const SHELL_CLASS: &str = "com.chromvoid.app.nativebridge.ImageDerivativeNativeShell";
const DECODE_SIGNATURE: &str =
    "(Ljava/nio/ByteBuffer;II)Lcom/chromvoid/app/nativebridge/ImageDerivativeNativeResult;";
/// Core runs several derivative jobs at once; two decodes at a time bound what the JVM holds.
const DECODES_AT_ONCE: usize = 2;

struct Decoder {
    vm: JavaVM,
    shell: GlobalRef,
    decode: JStaticMethodID,
}

static DECODER: OnceLock<Decoder> = OnceLock::new();

/// Installs the decoder for Core; a failure leaves Android without image derivatives, as before.
pub(crate) fn install(env: &mut JNIEnv<'_>, context: &JObject<'_>) {
    if DECODER.get().is_some() {
        return;
    }
    match resolve(env, context) {
        Ok(decoder) => {
            if DECODER.set(decoder).is_ok() {
                install_platform_image_decoder(decode);
            }
        }
        Err(error) => {
            let _ = env.exception_clear();
            tracing::warn!(%error, "image derivatives: the Android decoder is unavailable");
        }
    }
}

fn resolve(env: &mut JNIEnv<'_>, context: &JObject<'_>) -> jni::errors::Result<Decoder> {
    let loader = env
        .call_method(context, "getClassLoader", "()Ljava/lang/ClassLoader;", &[])?
        .l()?;
    let name = JObject::from(env.new_string(SHELL_CLASS)?);
    let class = env
        .call_method(
            &loader,
            "loadClass",
            "(Ljava/lang/String;)Ljava/lang/Class;",
            &[JValue::Object(&name)],
        )?
        .l()?;
    let class = JClass::from(class);
    let decode = env.get_static_method_id(&class, "decodePreview", DECODE_SIGNATURE)?;
    Ok(Decoder {
        vm: env.get_java_vm()?,
        shell: env.new_global_ref(&class)?,
        decode,
    })
}

fn decode(bytes: &[u8], tier: ImageDerivativeTier) -> Result<PreviewImageOutput, String> {
    let decoder = DECODER
        .get()
        .ok_or("The Android image decoder is not installed")?;
    let _slot = Slot::take();
    // A Core worker is attached for the call and detached after it, unless it was attached already.
    let mut env = decoder
        .vm
        .attach_current_thread()
        .map_err(|error| format!("attach to the JVM: {error}"))?;
    let answer = env.with_local_frame(8, |env| call(env, decoder, bytes, tier));
    if env.exception_check().unwrap_or(false) {
        let _ = env.exception_clear();
    }
    answer.map_err(|error| format!("Android image decoder: {error}"))?
}

fn call(
    env: &mut JNIEnv<'_>,
    decoder: &Decoder,
    bytes: &[u8],
    tier: ImageDerivativeTier,
) -> jni::errors::Result<Result<PreviewImageOutput, String>> {
    // SAFETY: the buffer covers `bytes`, which outlives this call. The decoder only reads it and
    // keeps no reference once it returns (`ImageDerivativeNativeShell`'s contract), and the local
    // frame releases the buffer object with the call. Rust clears the bytes afterwards.
    let source = unsafe { env.new_direct_byte_buffer(bytes.as_ptr().cast_mut(), bytes.len())? };
    let tier_code = match tier {
        ImageDerivativeTier::Thumbnail => 0,
        ImageDerivativeTier::DisplayPreview => 1,
    };
    let shell = <&JClass>::from(decoder.shell.as_obj());
    // SAFETY: the method id was resolved against this class with DECODE_SIGNATURE, and the
    // arguments match it: a ByteBuffer and two ints.
    let answer = unsafe {
        env.call_static_method_unchecked(
            shell,
            decoder.decode,
            ReturnType::Object,
            &[
                jvalue { l: source.as_raw() },
                jvalue {
                    i: tier.max_edge() as i32,
                },
                jvalue { i: tier_code },
            ],
        )?
    }
    .l()?;

    let failure = env
        .get_field(&answer, "failure", "Ljava/lang/String;")?
        .l()?;
    if !failure.is_null() {
        let failure: String = env.get_string(&JString::from(failure))?.into();
        return Ok(Err(failure));
    }
    let mime = env
        .get_field(&answer, "mimeType", "Ljava/lang/String;")?
        .l()?;
    let mime: String = env.get_string(&JString::from(mime))?.into();
    let array = JByteArray::from(env.get_field(&answer, "bytes", "[B")?.l()?);
    if array.is_null() {
        return Ok(Err("the decoder answered without a derivative".into()));
    }
    let encoded = env.convert_byte_array(&array)?;
    // The JVM's copy of the derivative is cleared before the frame lets it go.
    env.set_byte_array_region(&array, 0, &vec![0i8; encoded.len()])?;
    Ok(match mime.as_str() {
        "image/png" => Ok(PreviewImageOutput::png(encoded)),
        "image/webp" => Ok(PreviewImageOutput::webp(encoded)),
        other => Err(format!("the decoder answered with {other}")),
    })
}

/// One of the [DECODES_AT_ONCE] decodes, held for the call.
struct Slot;

static TAKEN: Mutex<usize> = Mutex::new(0);
static FREED: Condvar = Condvar::new();

impl Slot {
    fn take() -> Self {
        let mut taken = TAKEN.lock().unwrap_or_else(PoisonError::into_inner);
        while *taken >= DECODES_AT_ONCE {
            taken = FREED.wait(taken).unwrap_or_else(PoisonError::into_inner);
        }
        *taken += 1;
        Self
    }
}

impl Drop for Slot {
    fn drop(&mut self) {
        *TAKEN.lock().unwrap_or_else(PoisonError::into_inner) -= 1;
        FREED.notify_one();
    }
}
