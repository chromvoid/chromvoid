use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub(crate) const THUMBNAIL_MAX_EDGE: u32 = 256;
pub(crate) const MAX_PREVIEW_EDGE: u32 = 1920;
pub(crate) const DERIVATIVE_MAX_INPUT_BYTES: usize = 64 * 1024 * 1024;
#[cfg(any(
    test,
    target_os = "ios",
    target_os = "macos",
    target_os = "linux",
    target_os = "windows"
))]
pub(crate) const DERIVATIVE_MAX_SOURCE_PIXELS: u64 = 80_000_000;
#[allow(dead_code)]
pub(crate) const ANIMATED_DERIVATIVE_POLICY: &str = "first-frame";
#[cfg(any(
    test,
    target_os = "ios",
    target_os = "macos",
    target_os = "linux",
    target_os = "windows"
))]
const WEBP_PREVIEW_QUALITY: f32 = 86.0;
#[cfg(any(
    test,
    target_os = "ios",
    target_os = "macos",
    target_os = "linux",
    target_os = "windows"
))]
const JPEG_PREVIEW_QUALITY: u8 = 82;
#[cfg(any(
    test,
    target_os = "ios",
    target_os = "macos",
    target_os = "linux",
    target_os = "windows"
))]
pub(crate) const JPEG_PREVIEW_MIME: &str = "image/jpeg";
pub(crate) const PNG_PREVIEW_MIME: &str = "image/png";
pub(crate) const WEBP_PREVIEW_MIME: &str = "image/webp";

pub(crate) const DERIVATIVE_STORAGE_VERSION: u32 = 6;
const DERIVATIVE_LOCK_IDLE_TTL: Duration = Duration::from_secs(10 * 60);
const IMAGE_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "avif", "heic", "heif", "tif", "tiff",
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ImageDerivativeTier {
    Thumbnail,
    DisplayPreview,
}

pub(crate) struct ImagePreviewRuntimeState {
    derivative_locks: Mutex<HashMap<String, ImageDerivativeLockEntry>>,
    legacy_derivative_cleanups: Mutex<HashSet<String>>,
}

struct ImageDerivativeLockEntry {
    lock: Arc<Mutex<()>>,
    last_used: Instant,
}

impl ImagePreviewRuntimeState {
    pub(crate) fn new() -> Self {
        Self {
            derivative_locks: Mutex::new(HashMap::new()),
            legacy_derivative_cleanups: Mutex::new(HashSet::new()),
        }
    }

    pub(crate) fn cleanup_legacy_derivative_cache_once(
        &self,
        app_cache_dir: &Path,
    ) -> Result<(), String> {
        let legacy_root = app_cache_dir.join("image-derivatives");
        let key = legacy_root.display().to_string();

        let mut seen = self
            .legacy_derivative_cleanups
            .lock()
            .map_err(|_| "Legacy derivative cleanup registry poisoned".to_string())?;
        if seen.contains(&key) {
            return Ok(());
        }

        match std::fs::remove_dir_all(&legacy_root) {
            Ok(()) => {
                tracing::info!(
                    "image_derivative legacy_cache_cleanup path={}",
                    legacy_root.display()
                );
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                tracing::warn!(
                    "image_derivative legacy_cache_cleanup_failed path={} error={error}",
                    legacy_root.display()
                );
            }
        }

        seen.insert(key);
        Ok(())
    }

    pub(crate) fn derivative_lock(&self, cache_key: &str) -> Result<Arc<Mutex<()>>, String> {
        let mut locks = self
            .derivative_locks
            .lock()
            .map_err(|_| "Derivative lock registry poisoned".to_string())?;
        let now = Instant::now();
        prune_derivative_locks_locked(&mut locks, now);
        if let Some(entry) = locks.get_mut(cache_key) {
            entry.last_used = now;
            return Ok(entry.lock.clone());
        }
        let lock = Arc::new(Mutex::new(()));
        locks.insert(
            cache_key.to_string(),
            ImageDerivativeLockEntry {
                lock: lock.clone(),
                last_used: now,
            },
        );
        Ok(lock)
    }

    #[cfg(test)]
    fn derivative_lock_count_for_tests(&self) -> usize {
        self.derivative_locks
            .lock()
            .map(|locks| locks.len())
            .unwrap_or_default()
    }

    #[cfg(test)]
    fn force_derivative_lock_idle_for_tests(&self, cache_key: &str) {
        let Ok(mut locks) = self.derivative_locks.lock() else {
            return;
        };
        if let Some(entry) = locks.get_mut(cache_key) {
            entry.last_used = Instant::now()
                .checked_sub(DERIVATIVE_LOCK_IDLE_TTL + Duration::from_secs(1))
                .unwrap_or_else(Instant::now);
        }
    }

    #[cfg(test)]
    fn prune_derivative_locks_for_tests(&self) -> Result<usize, String> {
        let mut locks = self
            .derivative_locks
            .lock()
            .map_err(|_| "Derivative lock registry poisoned".to_string())?;
        Ok(prune_derivative_locks_locked(&mut locks, Instant::now()))
    }
}

fn prune_derivative_locks_locked(
    locks: &mut HashMap<String, ImageDerivativeLockEntry>,
    now: Instant,
) -> usize {
    let before = locks.len();
    locks.retain(|_, entry| {
        Arc::strong_count(&entry.lock) > 1
            || now
                .checked_duration_since(entry.last_used)
                .unwrap_or_default()
                < DERIVATIVE_LOCK_IDLE_TTL
    });
    before.saturating_sub(locks.len())
}

impl ImageDerivativeTier {
    pub(crate) fn max_edge(self) -> u32 {
        match self {
            Self::Thumbnail => THUMBNAIL_MAX_EDGE,
            Self::DisplayPreview => MAX_PREVIEW_EDGE,
        }
    }

    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Thumbnail => "thumbnail",
            Self::DisplayPreview => "preview",
        }
    }
}

pub(crate) struct PreviewImageOutput {
    pub(crate) bytes: Vec<u8>,
    pub(crate) mime_type: &'static str,
    pub(crate) file_extension: &'static str,
}

impl PreviewImageOutput {
    #[cfg(any(
        test,
        target_os = "ios",
        target_os = "macos",
        target_os = "linux",
        target_os = "windows"
    ))]
    pub(crate) fn jpeg(bytes: Vec<u8>) -> Self {
        Self {
            bytes,
            mime_type: JPEG_PREVIEW_MIME,
            file_extension: "jpg",
        }
    }

    pub(crate) fn png(bytes: Vec<u8>) -> Self {
        Self {
            bytes,
            mime_type: PNG_PREVIEW_MIME,
            file_extension: "png",
        }
    }

    pub(crate) fn webp(bytes: Vec<u8>) -> Self {
        Self {
            bytes,
            mime_type: WEBP_PREVIEW_MIME,
            file_extension: "webp",
        }
    }
}

#[cfg(any(
    test,
    target_os = "ios",
    target_os = "macos",
    target_os = "linux",
    target_os = "windows"
))]
fn encode_webp_derivative_pixels(
    pixels: &[u8],
    width: u32,
    height: u32,
    has_alpha: bool,
) -> Result<PreviewImageOutput, String> {
    if width == 0 || height == 0 {
        return Err("Cannot encode a zero-sized WebP derivative".to_string());
    }

    let encoder = if has_alpha {
        webp::Encoder::from_rgba(pixels, width, height)
    } else {
        webp::Encoder::from_rgb(pixels, width, height)
    };
    let encoded = encoder
        .encode_simple(
            has_alpha,
            if has_alpha {
                100.0
            } else {
                WEBP_PREVIEW_QUALITY
            },
        )
        .map_err(|error| format!("Failed to encode WebP derivative: {error:?}"))?;
    Ok(PreviewImageOutput::webp(encoded.to_vec()))
}

pub(crate) fn derivative_storage_key(
    node_id: u64,
    source_revision: u64,
    tier: ImageDerivativeTier,
) -> String {
    format!(
        "{node_id}-{}-{}-v{}",
        source_revision,
        tier.label(),
        DERIVATIVE_STORAGE_VERSION
    )
}

#[cfg_attr(not(any(target_os = "windows", target_os = "linux")), allow(dead_code))]
pub(crate) fn is_heif_image(file_name: &str, mime_type: Option<&str>) -> bool {
    let ext = extension(file_name);
    if ext == "heic" || ext == "heif" {
        return true;
    }

    let normalized_mime = normalize_mime(mime_type);
    normalized_mime == "image/heic" || normalized_mime == "image/heif"
}

pub(crate) fn is_image_derivative_candidate(file_name: &str, mime_type: Option<&str>) -> bool {
    let ext = extension(file_name);
    if IMAGE_EXTENSIONS.contains(&ext.as_str()) {
        return true;
    }

    normalize_mime(mime_type).starts_with("image/")
}

pub(crate) fn convert_image_derivative(
    bytes: &[u8],
    file_name: &str,
    mime_type: Option<&str>,
    tier: ImageDerivativeTier,
) -> Result<PreviewImageOutput, String> {
    validate_input_size(bytes.len())?;
    let max_preview_edge = tier.max_edge();
    validate_requested_output_edge(max_preview_edge)?;

    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
        let _ = (file_name, mime_type);
        return apple::convert_image_preview(bytes, tier);
    }

    #[cfg(target_os = "android")]
    {
        let _ = (file_name, mime_type);
        return crate::mobile::android::convert_image_preview(bytes, tier);
    }

    #[cfg(any(target_os = "windows", target_os = "linux"))]
    {
        return desktop::convert_image_preview(bytes, file_name, mime_type, tier);
    }

    #[allow(unreachable_code)]
    Err("Image derivative conversion is not supported on this target".to_string())
}

fn extension(file_name: &str) -> String {
    file_name
        .rsplit('.')
        .next()
        .map(|part| part.trim().to_ascii_lowercase())
        .unwrap_or_default()
}

fn normalize_mime(mime_type: Option<&str>) -> String {
    mime_type
        .map(|value| {
            value
                .split(';')
                .next()
                .unwrap_or_default()
                .trim()
                .to_ascii_lowercase()
        })
        .unwrap_or_default()
}

fn validate_input_size(byte_len: usize) -> Result<(), String> {
    if byte_len == 0 {
        return Err("Image preview payload is empty".to_string());
    }

    if byte_len > DERIVATIVE_MAX_INPUT_BYTES {
        return Err(format!(
            "Image preview payload exceeds derivative input limit: bytes={byte_len} max={DERIVATIVE_MAX_INPUT_BYTES}"
        ));
    }

    Ok(())
}

fn validate_requested_output_edge(max_preview_edge: u32) -> Result<(), String> {
    if max_preview_edge == 0 {
        return Err("Image derivative max edge must be greater than zero".to_string());
    }

    if max_preview_edge > MAX_PREVIEW_EDGE {
        return Err(format!(
            "Image derivative max edge exceeds policy: edge={max_preview_edge} max={MAX_PREVIEW_EDGE}"
        ));
    }

    Ok(())
}

#[cfg(any(
    test,
    target_os = "ios",
    target_os = "macos",
    target_os = "linux",
    target_os = "windows"
))]
fn checked_pixel_count(width: u32, height: u32) -> Result<u64, String> {
    if width == 0 || height == 0 {
        return Err(format!(
            "Image derivative dimensions must be non-zero: width={width} height={height}"
        ));
    }

    u64::from(width)
        .checked_mul(u64::from(height))
        .ok_or_else(|| {
            format!("Image derivative pixel count overflow: width={width} height={height}")
        })
}

#[cfg(any(
    test,
    target_os = "ios",
    target_os = "macos",
    target_os = "linux",
    target_os = "windows"
))]
fn validate_decode_dimensions(width: u32, height: u32, label: &str) -> Result<(), String> {
    let pixels = checked_pixel_count(width, height)?;
    if pixels > DERIVATIVE_MAX_SOURCE_PIXELS {
        return Err(format!(
            "{label} exceeds derivative pixel limit: width={width} height={height} pixels={pixels} max={DERIVATIVE_MAX_SOURCE_PIXELS}"
        ));
    }

    Ok(())
}

#[cfg(any(
    test,
    target_os = "ios",
    target_os = "macos",
    target_os = "linux",
    target_os = "windows"
))]
fn validate_output_dimensions(width: u32, height: u32, max_edge: u32) -> Result<(), String> {
    checked_pixel_count(width, height)?;
    if width.max(height) > max_edge {
        return Err(format!(
            "Image derivative output exceeds requested edge: width={width} height={height} max_edge={max_edge}"
        ));
    }

    Ok(())
}

#[cfg(any(target_os = "windows", target_os = "linux"))]
mod desktop {
    use std::io::Cursor;
    use std::time::Instant;

    use image::codecs::jpeg::JpegEncoder;
    use image::imageops::FilterType;
    use image::{
        DynamicImage, GenericImageView, ImageDecoder, ImageFormat, ImageReader, RgbImage, RgbaImage,
    };
    use libheif_rs::{ColorSpace, HeifContext, LibHeif, RgbChroma};

    pub(super) fn convert_image_preview(
        bytes: &[u8],
        file_name: &str,
        mime_type: Option<&str>,
        tier: super::ImageDerivativeTier,
    ) -> Result<super::PreviewImageOutput, String> {
        let max_preview_edge = tier.max_edge();
        if super::is_heif_image(file_name, mime_type) {
            return convert_heif_preview(bytes, tier);
        }

        let decode_started = Instant::now();
        let mut image = decode_raster_image(bytes)?;
        let decode_ms = decode_started.elapsed().as_millis();
        scale_dynamic_image(&mut image, max_preview_edge)?;

        let encode_started = Instant::now();
        let output = encode_dynamic_image(&image, tier)?;
        tracing::info!(
            "image_derivative decode_resize_ms={} encode_ms={} output_bytes={} mime_type={}",
            decode_ms,
            encode_started.elapsed().as_millis(),
            output.bytes.len(),
            output.mime_type,
        );
        Ok(output)
    }

    fn decode_raster_image(bytes: &[u8]) -> Result<DynamicImage, String> {
        let reader = ImageReader::new(Cursor::new(bytes))
            .with_guessed_format()
            .map_err(|error| format!("Failed to guess image format: {error}"))?;
        let mut decoder = reader
            .into_decoder()
            .map_err(|error| format!("Failed to create image decoder: {error}"))?;
        let (width, height) = decoder.dimensions();
        super::validate_decode_dimensions(width, height, "Raster image")?;
        let orientation = decoder
            .orientation()
            .map_err(|error| format!("Failed to read image orientation: {error}"))?;
        let mut image = DynamicImage::from_decoder(decoder)
            .map_err(|error| format!("Failed to decode image: {error}"))?;
        image.apply_orientation(orientation);
        Ok(image)
    }

    fn scale_dynamic_image(image: &mut DynamicImage, max_preview_edge: u32) -> Result<(), String> {
        let (width, height) = image.dimensions();
        let (target_width, target_height) = clamp_dimensions(width, height, max_preview_edge);
        super::validate_output_dimensions(target_width, target_height, max_preview_edge)?;
        if target_width == width && target_height == height {
            return Ok(());
        }

        *image = image.resize_exact(target_width, target_height, FilterType::Triangle);
        Ok(())
    }

    fn encode_dynamic_image(
        image: &DynamicImage,
        tier: super::ImageDerivativeTier,
    ) -> Result<super::PreviewImageOutput, String> {
        match tier {
            super::ImageDerivativeTier::Thumbnail => {
                if image.color().has_alpha() {
                    let rgba = image.to_rgba8();
                    return super::encode_webp_derivative_pixels(
                        rgba.as_raw(),
                        rgba.width(),
                        rgba.height(),
                        true,
                    );
                }

                let rgb = image.to_rgb8();
                super::encode_webp_derivative_pixels(rgb.as_raw(), rgb.width(), rgb.height(), false)
            }
            super::ImageDerivativeTier::DisplayPreview if image.color().has_alpha() => {
                let mut bytes = Vec::new();
                image
                    .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
                    .map_err(|error| format!("Failed to encode PNG derivative: {error}"))?;
                Ok(super::PreviewImageOutput::png(bytes))
            }
            super::ImageDerivativeTier::DisplayPreview => {
                let rgb = image.to_rgb8();
                let mut bytes = Vec::new();
                let mut encoder =
                    JpegEncoder::new_with_quality(&mut bytes, super::JPEG_PREVIEW_QUALITY);
                encoder
                    .encode_image(&DynamicImage::ImageRgb8(rgb))
                    .map_err(|error| format!("Failed to encode JPEG derivative: {error}"))?;
                Ok(super::PreviewImageOutput::jpeg(bytes))
            }
        }
    }

    fn convert_heif_preview(
        bytes: &[u8],
        tier: super::ImageDerivativeTier,
    ) -> Result<super::PreviewImageOutput, String> {
        let max_preview_edge = tier.max_edge();
        let decode_started = Instant::now();
        let context = HeifContext::read_from_bytes(bytes)
            .map_err(|error| format!("Failed to read HEIF bytes: {error}"))?;
        let handle = context
            .primary_image_handle()
            .map_err(|error| format!("Failed to resolve primary HEIF image: {error}"))?;
        super::validate_decode_dimensions(handle.width(), handle.height(), "HEIF image")?;

        let has_alpha = handle.has_alpha_channel();
        let chroma = if has_alpha {
            RgbChroma::Rgba
        } else {
            RgbChroma::Rgb
        };
        let lib_heif = LibHeif::new();
        let decoded = lib_heif
            .decode(&handle, ColorSpace::Rgb(chroma), None)
            .map_err(|error| format!("Failed to decode HEIF image: {error}"))?;

        let (target_width, target_height) =
            clamp_dimensions(decoded.width(), decoded.height(), max_preview_edge);
        super::validate_output_dimensions(target_width, target_height, max_preview_edge)?;
        let scaled = if target_width != decoded.width() || target_height != decoded.height() {
            decoded
                .scale(target_width, target_height, None)
                .map_err(|error| format!("Failed to scale HEIF image: {error}"))?
        } else {
            decoded
        };

        let plane = scaled
            .planes()
            .interleaved
            .ok_or_else(|| "Decoded HEIF image is missing an interleaved RGB plane".to_string())?;
        let bytes_per_pixel = if has_alpha { 4usize } else { 3usize };
        let row_bytes = plane.width as usize * bytes_per_pixel;
        let mut packed = Vec::with_capacity(plane.height as usize * row_bytes);
        for row in 0..plane.height as usize {
            let row_start = row
                .checked_mul(plane.stride)
                .ok_or_else(|| "HEIF row stride overflow".to_string())?;
            let row_end = row_start
                .checked_add(row_bytes)
                .ok_or_else(|| "HEIF row slice overflow".to_string())?;
            let row_slice = plane
                .data
                .get(row_start..row_end)
                .ok_or_else(|| "Decoded HEIF image buffer is truncated".to_string())?;
            packed.extend_from_slice(row_slice);
        }

        let image = if has_alpha {
            let rgba = RgbaImage::from_raw(plane.width, plane.height, packed)
                .ok_or_else(|| "Failed to materialize RGBA preview buffer".to_string())?;
            DynamicImage::ImageRgba8(rgba)
        } else {
            let rgb = RgbImage::from_raw(plane.width, plane.height, packed)
                .ok_or_else(|| "Failed to materialize RGB preview buffer".to_string())?;
            DynamicImage::ImageRgb8(rgb)
        };

        let decode_ms = decode_started.elapsed().as_millis();
        let encode_started = Instant::now();
        let output = encode_dynamic_image(&image, tier)?;
        tracing::info!(
            "image_derivative decode_resize_ms={} encode_ms={} output_bytes={} mime_type={}",
            decode_ms,
            encode_started.elapsed().as_millis(),
            output.bytes.len(),
            output.mime_type,
        );
        Ok(output)
    }

    fn clamp_dimensions(width: u32, height: u32, max_edge: u32) -> (u32, u32) {
        if width == 0 || height == 0 || max_edge == 0 {
            return (width, height);
        }
        let longest = width.max(height);
        if longest <= max_edge {
            return (width, height);
        }

        let scale = max_edge as f64 / longest as f64;
        let scaled_width = ((width as f64) * scale).round().max(1.0) as u32;
        let scaled_height = ((height as f64) * scale).round().max(1.0) as u32;
        (scaled_width, scaled_height)
    }
}

#[cfg(any(target_os = "macos", target_os = "ios"))]
mod apple {
    use std::ffi::c_void;
    use std::ptr::NonNull;
    use std::time::Instant;

    use image::codecs::jpeg::JpegEncoder;
    use image::{DynamicImage, RgbImage};
    use objc2_foundation::{ns_string, NSData, NSDictionary, NSMutableData, NSNumber, NSString};

    type CFDictionaryRef = *const c_void;
    type CFDataRef = *const c_void;
    type CFMutableDataRef = *mut c_void;
    type CFStringRef = *const c_void;
    type CGColorSpaceRef = *mut c_void;
    type CGContextRef = *mut c_void;
    type CGImageDestinationRef = *mut c_void;
    type CGImageRef = *mut c_void;
    type CGImageSourceRef = *mut c_void;
    type CGFloat = f64;

    const CG_IMAGE_ALPHA_PREMULTIPLIED_LAST: u32 = 1;
    const CG_BITMAP_BYTE_ORDER_32_BIG: u32 = 4 << 12;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct CGPoint {
        x: CGFloat,
        y: CGFloat,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct CGSize {
        width: CGFloat,
        height: CGFloat,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct CGRect {
        origin: CGPoint,
        size: CGSize,
    }

    #[link(name = "ImageIO", kind = "framework")]
    // SAFETY: signatures match Apple's ImageIO framework headers; ImageIO is implicitly available on
    // Darwin targets.
    unsafe extern "C" {
        fn CGImageSourceCreateWithData(
            data: CFDataRef,
            options: CFDictionaryRef,
        ) -> CGImageSourceRef;
        fn CGImageSourceCopyPropertiesAtIndex(
            source: CGImageSourceRef,
            index: usize,
            options: CFDictionaryRef,
        ) -> CFDictionaryRef;
        fn CGImageSourceCreateThumbnailAtIndex(
            source: CGImageSourceRef,
            index: usize,
            options: CFDictionaryRef,
        ) -> CGImageRef;
        fn CGImageDestinationCreateWithData(
            data: CFMutableDataRef,
            type_: CFStringRef,
            count: usize,
            options: CFDictionaryRef,
        ) -> CGImageDestinationRef;
        fn CGImageDestinationAddImage(
            destination: CGImageDestinationRef,
            image: CGImageRef,
            properties: CFDictionaryRef,
        );
        fn CGImageDestinationFinalize(destination: CGImageDestinationRef) -> bool;
        static kCGImagePropertyHasAlpha: CFStringRef;
        static kCGImagePropertyPixelHeight: CFStringRef;
        static kCGImagePropertyPixelWidth: CFStringRef;
    }

    #[link(name = "CoreGraphics", kind = "framework")]
    // SAFETY: signatures match Apple's CoreGraphics framework headers; CoreGraphics is implicitly
    // available on Darwin targets.
    unsafe extern "C" {
        fn CGImageGetWidth(image: CGImageRef) -> usize;
        fn CGImageGetHeight(image: CGImageRef) -> usize;
        fn CGColorSpaceCreateDeviceRGB() -> CGColorSpaceRef;
        fn CGBitmapContextCreate(
            data: *mut c_void,
            width: usize,
            height: usize,
            bits_per_component: usize,
            bytes_per_row: usize,
            space: CGColorSpaceRef,
            bitmap_info: u32,
        ) -> CGContextRef;
        fn CGContextDrawImage(context: CGContextRef, rect: CGRect, image: CGImageRef);
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    // SAFETY: signature matches Apple's CoreFoundation framework header; CoreFoundation is implicitly
    // available on Darwin targets.
    unsafe extern "C" {
        fn CFRelease(value: *const c_void);
    }

    struct OwnedCf(NonNull<c_void>);

    impl OwnedCf {
        fn from_ptr<T>(ptr: *mut T) -> Option<Self> {
            NonNull::new(ptr.cast()).map(Self)
        }

        fn as_ptr(&self) -> *mut c_void {
            self.0.as_ptr()
        }
    }

    impl Drop for OwnedCf {
        fn drop(&mut self) {
            // SAFETY: NonNull self.0 came from CF Create*/Copy* call (+1 retain) on construction;
            // this is the matching release.
            unsafe { CFRelease(self.0.as_ptr()) }
        }
    }

    pub(super) fn convert_image_preview(
        bytes: &[u8],
        tier: super::ImageDerivativeTier,
    ) -> Result<super::PreviewImageOutput, String> {
        let max_preview_edge = tier.max_edge();
        let decode_started = Instant::now();
        let source_data = NSData::with_bytes(bytes);
        // SAFETY: source_data is a live NSData borrow held through this call; null options is accepted
        // by ImageIO.
        let source = OwnedCf::from_ptr(unsafe {
            CGImageSourceCreateWithData((&*source_data as *const NSData).cast(), std::ptr::null())
        })
        .ok_or_else(|| "Failed to create CGImageSource from image bytes".to_string())?;
        validate_source_dimensions(&source)?;

        let true_value = NSNumber::numberWithBool(true);
        let max_pixel_size = NSNumber::numberWithUnsignedInteger(max_preview_edge as usize);
        let options = NSDictionary::from_slices(
            &[
                ns_string!("kCGImageSourceCreateThumbnailFromImageAlways"),
                ns_string!("kCGImageSourceCreateThumbnailWithTransform"),
                ns_string!("kCGImageSourceShouldCacheImmediately"),
                ns_string!("kCGImageSourceThumbnailMaxPixelSize"),
            ],
            &[&*true_value, &*true_value, &*true_value, &*max_pixel_size],
        );

        // SAFETY: source is a valid CGImageSourceRef from CGImageSourceCreateWithData above; options
        // dict outlives the call.
        let image = OwnedCf::from_ptr(unsafe {
            CGImageSourceCreateThumbnailAtIndex(
                source.as_ptr(),
                0,
                (&*options as *const NSDictionary<NSString, NSNumber>).cast(),
            )
        })
        .ok_or_else(|| "Failed to decode image preview".to_string())?;
        let (thumbnail_width, thumbnail_height) = cgimage_dimensions(&image)?;
        super::validate_output_dimensions(thumbnail_width, thumbnail_height, max_preview_edge)?;

        let decode_ms = decode_started.elapsed().as_millis();
        let has_alpha = source_has_alpha(&source);
        let encode_started = Instant::now();
        let output = encode_cgimage_derivative(&image, tier, has_alpha)?;
        tracing::info!(
            "image_derivative decode_resize_ms={} encode_ms={} output_bytes={} mime_type={}",
            decode_ms,
            encode_started.elapsed().as_millis(),
            output.bytes.len(),
            output.mime_type,
        );
        Ok(output)
    }

    fn encode_cgimage_derivative(
        image: &OwnedCf,
        tier: super::ImageDerivativeTier,
        has_alpha: bool,
    ) -> Result<super::PreviewImageOutput, String> {
        match tier {
            super::ImageDerivativeTier::DisplayPreview if has_alpha => encode_with_imageio(
                image,
                ns_string!("public.png"),
                None,
                super::PreviewImageOutput::png,
            ),
            super::ImageDerivativeTier::DisplayPreview => encode_cgimage_jpeg(image),
            super::ImageDerivativeTier::Thumbnail => match encode_webp_with_imageio(image) {
                Ok(Some(output)) => Ok(output),
                Ok(None) => {
                    tracing::warn!("image_derivative imageio_webp_unavailable fallback=rust_webp");
                    encode_cgimage_webp(image, has_alpha)
                }
                Err(error) => {
                    tracing::warn!(
                        "image_derivative imageio_webp_failed fallback=rust_webp error={error}"
                    );
                    encode_cgimage_webp(image, has_alpha)
                }
            },
        }
    }

    fn encode_cgimage_jpeg(image: &OwnedCf) -> Result<super::PreviewImageOutput, String> {
        let (rgba, width, height) = render_cgimage_rgba(image)?;
        let rgb = RgbImage::from_raw(width, height, rgba_to_rgb(&rgba))
            .ok_or_else(|| "Failed to build RGB preview image".to_string())?;
        let mut bytes = Vec::new();
        let mut encoder = JpegEncoder::new_with_quality(&mut bytes, super::JPEG_PREVIEW_QUALITY);
        encoder
            .encode_image(&DynamicImage::ImageRgb8(rgb))
            .map_err(|error| format!("Failed to encode JPEG derivative: {error}"))?;
        Ok(super::PreviewImageOutput::jpeg(bytes))
    }

    fn encode_webp_with_imageio(
        image: &OwnedCf,
    ) -> Result<Option<super::PreviewImageOutput>, String> {
        encode_optional_with_imageio(
            image,
            ns_string!("public.webp"),
            Some(super::WEBP_PREVIEW_QUALITY / 100.0),
            super::PreviewImageOutput::webp,
        )
    }

    fn encode_with_imageio(
        image: &OwnedCf,
        uti: &NSString,
        quality: Option<f32>,
        build_output: fn(Vec<u8>) -> super::PreviewImageOutput,
    ) -> Result<super::PreviewImageOutput, String> {
        encode_optional_with_imageio(image, uti, quality, build_output)?
            .ok_or_else(|| "ImageIO derivative encoder is unavailable".to_string())
    }

    fn encode_optional_with_imageio(
        image: &OwnedCf,
        uti: &NSString,
        quality: Option<f32>,
        build_output: fn(Vec<u8>) -> super::PreviewImageOutput,
    ) -> Result<Option<super::PreviewImageOutput>, String> {
        let encoded_data = NSMutableData::new();
        // SAFETY: encoded_data is a live NSMutableData borrow; UTI is a 'static NSString from ns_string;
        // null creation options are accepted by ImageIO.
        let destination = match OwnedCf::from_ptr(unsafe {
            CGImageDestinationCreateWithData(
                (&*encoded_data as *const NSMutableData).cast_mut().cast(),
                uti as *const NSString as *const c_void,
                1,
                std::ptr::null(),
            )
        }) {
            Some(destination) => destination,
            None => return Ok(None),
        };

        let quality = quality.map(NSNumber::numberWithFloat);
        let encode_options = quality.as_ref().map(|quality| {
            NSDictionary::from_slices(
                &[ns_string!("kCGImageDestinationLossyCompressionQuality")],
                &[&**quality],
            )
        });
        // SAFETY: destination came from CGImageDestinationCreateWithData above (+1 retain held by
        // OwnedCf); image and encode_options outlive the call.
        unsafe {
            CGImageDestinationAddImage(
                destination.as_ptr(),
                image.as_ptr(),
                encode_options
                    .as_ref()
                    .map(|options| (&**options as *const NSDictionary<NSString, NSNumber>).cast())
                    .unwrap_or(std::ptr::null()),
            )
        }

        // SAFETY: destination came from CGImageDestinationCreateWithData above (+1 retain held by OwnedCf).
        if !unsafe { CGImageDestinationFinalize(destination.as_ptr()) } {
            return Ok(None);
        }

        let bytes = encoded_data.to_vec();
        if bytes.is_empty() {
            return Ok(None);
        }

        Ok(Some(build_output(bytes)))
    }

    fn encode_cgimage_webp(
        image: &OwnedCf,
        has_alpha: bool,
    ) -> Result<super::PreviewImageOutput, String> {
        let (mut rgba, width, height) = render_cgimage_rgba(image)?;
        if has_alpha {
            unpremultiply_alpha(&mut rgba);
            return super::encode_webp_derivative_pixels(&rgba, width, height, true);
        }

        let rgb = rgba_to_rgb(&rgba);
        super::encode_webp_derivative_pixels(&rgb, width, height, false)
    }

    fn render_cgimage_rgba(image: &OwnedCf) -> Result<(Vec<u8>, u32, u32), String> {
        let (width_u32, height_u32) = cgimage_dimensions(image)?;
        let width = width_u32 as usize;
        let height = height_u32 as usize;
        super::validate_decode_dimensions(width_u32, height_u32, "Rendered preview image")?;
        let image_ref = image.as_ptr().cast();
        let bytes_per_row = width
            .checked_mul(4)
            .ok_or_else(|| "Preview image row size overflow".to_string())?;
        let buffer_len = bytes_per_row
            .checked_mul(height)
            .ok_or_else(|| "Preview image buffer size overflow".to_string())?;
        let mut pixels = vec![0u8; buffer_len];

        // SAFETY: takes no args; returns a +1-owned CGColorSpaceRef captured by OwnedCf.
        let color_space = OwnedCf::from_ptr(unsafe { CGColorSpaceCreateDeviceRGB() })
            .ok_or_else(|| "Failed to create preview color space".to_string())?;
        let bitmap_info = CG_IMAGE_ALPHA_PREMULTIPLIED_LAST | CG_BITMAP_BYTE_ORDER_32_BIG;
        // SAFETY: pixels is a &mut buffer of width*height*4 bytes (validated above); color_space is
        // +1-owned and held until OwnedCf drops.
        let context = OwnedCf::from_ptr(unsafe {
            CGBitmapContextCreate(
                pixels.as_mut_ptr().cast(),
                width,
                height,
                8,
                bytes_per_row,
                color_space.as_ptr(),
                bitmap_info,
            )
        })
        .ok_or_else(|| "Failed to create preview bitmap context".to_string())?;
        let rect = CGRect {
            origin: CGPoint { x: 0.0, y: 0.0 },
            size: CGSize {
                width: width as CGFloat,
                height: height as CGFloat,
            },
        };
        // SAFETY: context came from CGBitmapContextCreate above; image_ref is the CGImage held by
        // image: &OwnedCf; rect is by-value POD.
        unsafe { CGContextDrawImage(context.as_ptr(), rect, image_ref) };

        Ok((pixels, width_u32, height_u32))
    }

    fn cgimage_dimensions(image: &OwnedCf) -> Result<(u32, u32), String> {
        let image_ref = image.as_ptr().cast();
        // SAFETY: image_ref is the CGImage held by &OwnedCf; CGImageGetWidth is a thin accessor.
        let width = unsafe { CGImageGetWidth(image_ref) };
        // SAFETY: image_ref is the CGImage held by &OwnedCf; CGImageGetHeight is a thin accessor.
        let height = unsafe { CGImageGetHeight(image_ref) };
        let width_u32 = u32::try_from(width)
            .map_err(|_| "Preview image width exceeds WebP encoder limits".to_string())?;
        let height_u32 = u32::try_from(height)
            .map_err(|_| "Preview image height exceeds WebP encoder limits".to_string())?;
        Ok((width_u32, height_u32))
    }

    fn validate_source_dimensions(source: &OwnedCf) -> Result<(), String> {
        let properties = source_properties(source)
            .ok_or_else(|| "Failed to read image source properties".to_string())?;
        // SAFETY: CGImageSourceCopyPropertiesAtIndex returns a CFDictionaryRef with NSString keys and
        // NSNumber values; toll-free bridge to NSDictionary; lifetime tied to the borrowed OwnedCf.
        let properties =
            unsafe { &*(properties.as_ptr() as *const NSDictionary<NSString, NSNumber>) };
        // SAFETY: kCGImagePropertyPixelWidth is a 'static CFStringRef from ImageIO — non-null and outlives this borrow.
        let width_key = unsafe { &*(kCGImagePropertyPixelWidth as *const NSString) };
        // SAFETY: kCGImagePropertyPixelHeight is a 'static CFStringRef from ImageIO — non-null and outlives this borrow.
        let height_key = unsafe { &*(kCGImagePropertyPixelHeight as *const NSString) };
        let width = source_dimension_value(properties, width_key, "width")?;
        let height = source_dimension_value(properties, height_key, "height")?;

        super::validate_decode_dimensions(width, height, "Image source")
    }

    fn source_dimension_value(
        properties: &NSDictionary<NSString, NSNumber>,
        key: &NSString,
        label: &str,
    ) -> Result<u32, String> {
        // SAFETY: properties is a non-null NSDictionary borrow; key is a 'static NSString
        // (kCGImagePropertyPixel{Width,Height}); the unchecked variant skips a class check we already
        // guarantee.
        let value = unsafe { properties.objectForKey_unchecked(key) }
            .ok_or_else(|| format!("Image source {label} is missing"))?;
        u32::try_from(value.as_u64())
            .map_err(|_| format!("Image source {label} exceeds supported range"))
    }

    fn unpremultiply_alpha(pixels: &mut [u8]) {
        for pixel in pixels.chunks_exact_mut(4) {
            let alpha = u16::from(pixel[3]);
            if alpha == 0 {
                pixel[0] = 0;
                pixel[1] = 0;
                pixel[2] = 0;
                continue;
            }
            if alpha == 255 {
                continue;
            }
            for channel in &mut pixel[..3] {
                *channel = ((u16::from(*channel) * 255 + alpha / 2) / alpha).min(255) as u8;
            }
        }
    }

    fn rgba_to_rgb(rgba: &[u8]) -> Vec<u8> {
        let mut rgb = Vec::with_capacity(rgba.len() / 4 * 3);
        for pixel in rgba.chunks_exact(4) {
            rgb.extend_from_slice(&pixel[..3]);
        }
        rgb
    }

    fn source_has_alpha(source: &OwnedCf) -> bool {
        let Some(properties) = source_properties(source) else {
            return false;
        };

        // SAFETY: CGImageSourceCopyPropertiesAtIndex returns a CFDictionaryRef with NSString keys and
        // NSNumber values; toll-free bridge to NSDictionary; lifetime tied to the borrowed OwnedCf.
        let properties =
            unsafe { &*(properties.as_ptr() as *const NSDictionary<NSString, NSNumber>) };
        // SAFETY: kCGImagePropertyHasAlpha is a 'static CFStringRef from ImageIO — non-null and outlives this borrow.
        let has_alpha_key = unsafe { &*(kCGImagePropertyHasAlpha as *const NSString) };
        // SAFETY: properties is a non-null NSDictionary borrow; has_alpha_key is a 'static NSString.
        unsafe { properties.objectForKey_unchecked(has_alpha_key) }
            .map(|value| value.boolValue())
            .unwrap_or(false)
    }

    fn source_properties(source: &OwnedCf) -> Option<OwnedCf> {
        // SAFETY: source is a valid CGImageSourceRef held by &OwnedCf; null options is accepted;
        // cast_mut converts the +1-owned CFTypeRef into the form OwnedCf::from_ptr expects.
        OwnedCf::from_ptr(unsafe {
            CGImageSourceCopyPropertiesAtIndex(source.as_ptr(), 0, std::ptr::null()).cast_mut()
        })
    }
}

#[cfg(test)]
mod tests {
    use image::codecs::gif::GifEncoder;
    use image::codecs::jpeg::JpegEncoder;
    use image::{Delay, Frame, GenericImageView, ImageBuffer, Rgb, Rgba};

    use super::*;

    #[test]
    fn image_preview_runtime_reuses_lock_for_same_key() {
        let runtime = ImagePreviewRuntimeState::new();

        let first = runtime
            .derivative_lock("node-1-preview")
            .expect("first lock should be created");
        let second = runtime
            .derivative_lock("node-1-preview")
            .expect("second lock should be reused");

        assert!(Arc::ptr_eq(&first, &second));
    }

    #[test]
    fn image_preview_runtime_instances_do_not_share_locks() {
        let first_runtime = ImagePreviewRuntimeState::new();
        let second_runtime = ImagePreviewRuntimeState::new();

        let first = first_runtime
            .derivative_lock("node-1-preview")
            .expect("first runtime lock should be created");
        let second = second_runtime
            .derivative_lock("node-1-preview")
            .expect("second runtime lock should be created");

        assert!(!Arc::ptr_eq(&first, &second));
    }

    #[test]
    fn image_preview_runtime_prunes_idle_unshared_locks() {
        let runtime = ImagePreviewRuntimeState::new();
        let first = runtime
            .derivative_lock("node-1-preview")
            .expect("first lock should be created");

        runtime.force_derivative_lock_idle_for_tests("node-1-preview");
        assert_eq!(
            runtime
                .prune_derivative_locks_for_tests()
                .expect("in-use lock prune should succeed"),
            0
        );
        assert_eq!(runtime.derivative_lock_count_for_tests(), 1);

        drop(first);
        assert_eq!(
            runtime
                .prune_derivative_locks_for_tests()
                .expect("idle lock prune should succeed"),
            1
        );
        assert_eq!(runtime.derivative_lock_count_for_tests(), 0);
    }

    #[test]
    fn legacy_derivative_cleanup_is_tracked_per_runtime() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let legacy_root = tempdir.path().join("image-derivatives");
        std::fs::create_dir_all(&legacy_root).expect("legacy root should be created");

        let runtime = ImagePreviewRuntimeState::new();
        runtime
            .cleanup_legacy_derivative_cache_once(tempdir.path())
            .expect("first cleanup should run");
        assert!(!legacy_root.exists());

        std::fs::create_dir_all(&legacy_root).expect("legacy root should be recreated");
        runtime
            .cleanup_legacy_derivative_cache_once(tempdir.path())
            .expect("second cleanup should be skipped for the same runtime");
        assert!(legacy_root.exists());

        let other_runtime = ImagePreviewRuntimeState::new();
        other_runtime
            .cleanup_legacy_derivative_cache_once(tempdir.path())
            .expect("other runtime should clean independently");
        assert!(!legacy_root.exists());
    }

    #[test]
    fn poisoned_derivative_lock_registry_returns_controlled_error() {
        let runtime = ImagePreviewRuntimeState::new();
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _guard = runtime
                .derivative_locks
                .lock()
                .expect("test should acquire derivative lock registry");
            panic!("poison derivative lock registry");
        }));

        let error = runtime
            .derivative_lock("node-1-preview")
            .expect_err("poisoned registry should return an error");

        assert_eq!(error, "Derivative lock registry poisoned");
    }

    #[test]
    fn poisoned_legacy_cleanup_registry_returns_controlled_error() {
        let runtime = ImagePreviewRuntimeState::new();
        let tempdir = tempfile::tempdir().expect("tempdir");
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _guard = runtime
                .legacy_derivative_cleanups
                .lock()
                .expect("test should acquire cleanup registry");
            panic!("poison cleanup registry");
        }));

        let error = runtime
            .cleanup_legacy_derivative_cache_once(tempdir.path())
            .expect_err("poisoned cleanup registry should return an error");

        assert_eq!(error, "Legacy derivative cleanup registry poisoned");
    }

    fn build_jpeg_source(width: u32, height: u32) -> Vec<u8> {
        let image = ImageBuffer::from_pixel(width, height, Rgb([240u8, 16u8, 16u8]));
        let mut bytes = Vec::new();
        let mut encoder = JpegEncoder::new_with_quality(&mut bytes, 90);
        encoder
            .encode_image(&image)
            .expect("test jpeg source should encode");
        bytes
    }

    fn build_oriented_jpeg(width: u32, height: u32, orientation: u16) -> Vec<u8> {
        let mut jpeg = build_jpeg_source(width, height);
        let mut exif_payload = Vec::new();
        exif_payload.extend_from_slice(b"Exif\0\0");
        exif_payload.extend_from_slice(b"MM");
        exif_payload.extend_from_slice(&42u16.to_be_bytes());
        exif_payload.extend_from_slice(&8u32.to_be_bytes());
        exif_payload.extend_from_slice(&1u16.to_be_bytes());
        exif_payload.extend_from_slice(&0x0112u16.to_be_bytes());
        exif_payload.extend_from_slice(&3u16.to_be_bytes());
        exif_payload.extend_from_slice(&1u32.to_be_bytes());
        exif_payload.extend_from_slice(&orientation.to_be_bytes());
        exif_payload.extend_from_slice(&0u16.to_be_bytes());
        exif_payload.extend_from_slice(&0u32.to_be_bytes());

        let app1_len = u16::try_from(exif_payload.len() + 2).expect("test exif length fits u16");
        let mut segment = vec![0xff, 0xe1];
        segment.extend_from_slice(&app1_len.to_be_bytes());
        segment.extend_from_slice(&exif_payload);

        jpeg.splice(2..2, segment);
        jpeg
    }

    fn jpeg_contains_exif_app1(bytes: &[u8]) -> bool {
        if !bytes.starts_with(&[0xff, 0xd8]) {
            return false;
        }

        let mut cursor = 2;
        while cursor + 4 <= bytes.len() {
            if bytes[cursor] != 0xff {
                cursor += 1;
                continue;
            }

            while cursor < bytes.len() && bytes[cursor] == 0xff {
                cursor += 1;
            }
            if cursor >= bytes.len() {
                return false;
            }

            let marker = bytes[cursor];
            cursor += 1;
            if marker == 0xda || marker == 0xd9 {
                return false;
            }
            if matches!(marker, 0x01 | 0xd0..=0xd7) {
                continue;
            }
            if cursor + 2 > bytes.len() {
                return false;
            }

            let len = u16::from_be_bytes([bytes[cursor], bytes[cursor + 1]]) as usize;
            if len < 2 || cursor + len > bytes.len() {
                return false;
            }
            let payload_start = cursor + 2;
            let payload_end = cursor + len;
            if marker == 0xe1 && bytes[payload_start..payload_end].starts_with(b"Exif\0\0") {
                return true;
            }
            cursor = payload_end;
        }

        false
    }

    fn build_two_frame_gif() -> Vec<u8> {
        let first = ImageBuffer::from_pixel(4, 4, Rgba([250u8, 0u8, 0u8, 255u8]));
        let second = ImageBuffer::from_pixel(4, 4, Rgba([0u8, 250u8, 0u8, 255u8]));
        let mut bytes = Vec::new();
        {
            let mut encoder = GifEncoder::new(&mut bytes);
            encoder
                .encode_frame(Frame::from_parts(
                    first,
                    0,
                    0,
                    Delay::from_numer_denom_ms(100, 1),
                ))
                .expect("first gif frame should encode");
            encoder
                .encode_frame(Frame::from_parts(
                    second,
                    0,
                    0,
                    Delay::from_numer_denom_ms(100, 1),
                ))
                .expect("second gif frame should encode");
        }
        bytes
    }

    fn decode_output_dimensions(output: &PreviewImageOutput) -> (u32, u32) {
        let decoded = image::load_from_memory(&output.bytes).expect("preview output should decode");
        decoded.dimensions()
    }

    fn expect_convert_error(result: Result<PreviewImageOutput, String>) -> String {
        match result {
            Ok(_) => panic!("conversion should fail"),
            Err(error) => error,
        }
    }

    #[test]
    fn derivative_input_size_policy_is_enforced() {
        let error =
            validate_input_size(DERIVATIVE_MAX_INPUT_BYTES + 1).expect_err("input should fail");

        assert!(error.contains("derivative input limit"));
    }

    #[test]
    fn derivative_rejects_invalid_output_edge() {
        let error = validate_requested_output_edge(MAX_PREVIEW_EDGE + 1)
            .expect_err("oversized output edge should fail");

        assert!(error.contains("max edge exceeds policy"));
    }

    #[test]
    fn derivative_rejects_corrupt_input() {
        let error = expect_convert_error(convert_image_derivative(
            b"not an image",
            "broken.jpg",
            Some("image/jpeg"),
            ImageDerivativeTier::Thumbnail,
        ));

        assert!(error.contains("Failed"));
    }

    #[test]
    fn derivative_rejects_oversized_dimensions_before_decode() {
        let error = validate_decode_dimensions(100_000, 1_000, "PNG image")
            .expect_err("oversized image dimensions should fail");

        assert!(error.contains("derivative pixel limit"));
    }

    #[test]
    fn derivative_applies_exif_orientation_and_strips_metadata() {
        let source = build_oriented_jpeg(80, 40, 6);
        let output = convert_image_derivative(
            &source,
            "oriented.jpg",
            Some("image/jpeg"),
            ImageDerivativeTier::DisplayPreview,
        )
        .expect("oriented jpeg should convert");

        assert_eq!(output.mime_type, JPEG_PREVIEW_MIME);
        assert_eq!(decode_output_dimensions(&output), (40, 80));
        assert!(!jpeg_contains_exif_app1(&output.bytes));
    }

    #[test]
    fn animated_inputs_use_first_frame_policy() {
        let source = build_two_frame_gif();
        let output = convert_image_derivative(
            &source,
            "animated.gif",
            Some("image/gif"),
            ImageDerivativeTier::Thumbnail,
        )
        .expect("animated gif should convert using first frame");

        assert_eq!(ANIMATED_DERIVATIVE_POLICY, "first-frame");
        let decoded =
            image::load_from_memory(&output.bytes).expect("animated derivative should decode");
        let rgba = decoded.to_rgba8();
        let pixel = rgba.get_pixel(0, 0);
        assert!(
            pixel[0] > pixel[1] + 40,
            "first frame should dominate output"
        );
    }
}
