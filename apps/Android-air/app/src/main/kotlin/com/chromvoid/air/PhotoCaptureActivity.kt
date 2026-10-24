package com.chromvoid.air

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.os.Bundle
import android.view.OrientationEventListener
import android.view.Surface
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.chromvoid.air.session.PlatformPhotoCapture
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.design.DarkAirColors
import com.chromvoid.air.ui.files.PhotoCapture
import com.chromvoid.air.ui.files.PhotoCaptureScreen
import com.chromvoid.air.ui.settings.AppearanceModel
import java.io.ByteArrayOutputStream

/**
 * Take Photo for Files, as iOS's camera: the back camera behind a shutter, then the photo to use
 * or retake. The photo is captured into memory and handed to the import in this process; nothing
 * is written to the device. The window is secure, and the import letting go - a lock does -
 * closes it.
 */
public class PhotoCaptureActivity : ComponentActivity() {
    private var capture = ""
    private var answered = false
    private var shot: ImageCapture? = null
    private var ready by mutableStateOf(false)
    private var photo: ByteArray? = null
    private var review by mutableStateOf<ImageBitmap?>(null)
    private var takenAt = 0L
    private val preview by lazy { PreviewView(this) }

    private val permission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startCamera() else answer(PhotoCapture.Result.PermissionDenied)
    }

    /** The photo is taken upright however the phone is held. */
    private val orientation by lazy {
        object : OrientationEventListener(this) {
            override fun onOrientationChanged(degrees: Int) {
                if (degrees == ORIENTATION_UNKNOWN) return
                shot?.targetRotation = when (degrees) {
                    in 45 until 135 -> Surface.ROTATION_270
                    in 135 until 225 -> Surface.ROTATION_180
                    in 225 until 315 -> Surface.ROTATION_90
                    else -> Surface.ROTATION_0
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        applyAirWindowTheme(DarkAirColors)
        capture = intent.getStringExtra(EXTRA_CAPTURE).orEmpty()
        if (capture.isEmpty() || !PlatformPhotoCapture.attach(capture, this)) {
            answered = true
            finish()
            return
        }
        setContent {
            AirTheme(AppearanceModel.Theme.DARK) {
                PhotoCaptureScreen(
                    review = review,
                    ready = ready,
                    onShutter = ::takePhoto,
                    onCancel = { answer(PhotoCapture.Result.Cancelled) },
                    onRetake = ::retake,
                    onUse = ::use,
                    camera = { AndroidView(factory = { preview }, modifier = Modifier.fillMaxSize()) },
                )
            }
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startCamera()
        } else {
            permission.launch(Manifest.permission.CAMERA)
        }
    }

    override fun onResume() {
        super.onResume()
        if (orientation.canDetectOrientation()) orientation.enable()
    }

    override fun onPause() {
        orientation.disable()
        super.onPause()
    }

    override fun onDestroy() {
        if (!answered) answer(PhotoCapture.Result.Cancelled)
        photo?.fill(0)
        super.onDestroy()
    }

    private fun startCamera() {
        val providing = ProcessCameraProvider.getInstance(this)
        providing.addListener({
            val bound = runCatching {
                val provider = providing.get()
                val camera = Preview.Builder().build().also { it.surfaceProvider = preview.surfaceProvider }
                val still = ImageCapture.Builder()
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                    .build()
                val selector = if (provider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA)) {
                    CameraSelector.DEFAULT_BACK_CAMERA
                } else {
                    CameraSelector.DEFAULT_FRONT_CAMERA
                }
                provider.unbindAll()
                provider.bindToLifecycle(this, selector, camera, still)
                shot = still
            }
            if (bound.isSuccess) ready = true else answer(PhotoCapture.Result.Unavailable)
        }, ContextCompat.getMainExecutor(this))
    }

    private fun takePhoto() {
        val still = shot ?: return
        if (!ready) return
        ready = false
        still.takePicture(
            ContextCompat.getMainExecutor(this),
            object : ImageCapture.OnImageCapturedCallback() {
                override fun onCaptureSuccess(image: ImageProxy) {
                    val jpeg = try {
                        upright(image)
                    } finally {
                        image.close()
                    }
                    photo?.fill(0)
                    photo = jpeg
                    takenAt = System.currentTimeMillis()
                    review = reviewImage(jpeg)
                }

                override fun onError(exception: ImageCaptureException) {
                    answer(PhotoCapture.Result.Unavailable)
                }
            },
        )
    }

    private fun retake() {
        photo?.fill(0)
        photo = null
        review = null
        ready = shot != null
    }

    private fun use() {
        val jpeg = photo ?: return
        photo = null
        answer(PhotoCapture.Result.Taken(jpeg, takenAt))
    }

    private fun answer(result: PhotoCapture.Result) {
        if (answered) return
        answered = true
        PlatformPhotoCapture.deliver(capture, result)
        finish()
    }

    public companion object {
        public const val EXTRA_CAPTURE: String = "com.chromvoid.air.extra.PHOTO_CAPTURE"
        private const val JPEG_QUALITY = 92
        private const val REVIEW_EDGE = 2048

        /**
         * The captured JPEG, turned upright. A photo the camera already took upright is kept as it
         * came; one it did not is decoded, turned and encoded again, as iOS encodes its photos.
         */
        private fun upright(image: ImageProxy): ByteArray {
            val buffer = image.planes[0].buffer
            val jpeg = ByteArray(buffer.remaining()).also(buffer::get)
            val degrees = image.imageInfo.rotationDegrees
            return if (degrees == 0) jpeg else turned(jpeg, degrees)
        }

        internal fun turned(jpeg: ByteArray, degrees: Int): ByteArray {
            val decoded = checkNotNull(BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size)) { "The photo did not decode" }
            jpeg.fill(0)
            val upright = Bitmap.createBitmap(
                decoded,
                0,
                0,
                decoded.width,
                decoded.height,
                Matrix().apply { postRotate(degrees.toFloat()) },
                true,
            )
            if (upright !== decoded) decoded.recycle()
            val out = WipedOutputStream()
            return try {
                check(upright.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)) { "The photo did not encode" }
                out.toByteArray()
            } finally {
                out.wipe()
                upright.recycle()
            }
        }

        /** The encoder's own buffer holds the photo too; it is cleared once copied out. */
        private class WipedOutputStream : ByteArrayOutputStream() {
            fun wipe() = buf.fill(0)
        }

        private fun reviewImage(jpeg: ByteArray): ImageBitmap? {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size, bounds)
            var sample = 1
            while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= REVIEW_EDGE) sample *= 2
            val options = BitmapFactory.Options().apply { inSampleSize = sample }
            return BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size, options)?.asImageBitmap()
        }
    }
}
