package com.chromvoid.app

import android.net.Uri
import android.util.Size
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.TorchState
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.chromvoid.app.nativebridge.OtpQrScannerNativeShell
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.ZoomSuggestionOptions
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

internal class OtpQrCameraController(
    private val activity: AppCompatActivity,
    private val previewView: PreviewView,
    private val setStatus: (String) -> Unit,
    private val setTorchState: (hasTorch: Boolean, enabled: Boolean) -> Unit,
    private val isCompleted: () -> Boolean,
    private val finishWithResult: (status: String, value: String, message: String) -> Unit,
) {
    private val cameraExecutor = Executors.newSingleThreadExecutor()
    private val analysisBusy = AtomicBoolean(false)
    private var cameraProvider: ProcessCameraProvider? = null
    private var camera: Camera? = null
    private var scanner = BarcodeScanning.getClient(createScannerOptions(enableZoom = false))
    private var torchEnabled = false

    fun startCamera() {
        setStatus(activity.getString(R.string.otp_qr_status_scanning))
        val providerFuture = ProcessCameraProvider.getInstance(activity)
        providerFuture.addListener(
            {
                val provider =
                    runCatching { providerFuture.get() }
                        .getOrElse {
                            finishWithResult(
                                OtpQrScannerNativeShell.RESULT_UNAVAILABLE,
                                "",
                                "Camera provider unavailable",
                            )
                            return@addListener
                        }
                cameraProvider = provider
                bindCamera(provider)
            },
            ContextCompat.getMainExecutor(activity),
        )
    }

    fun decodeImageUri(uri: Uri) {
        if (isCompleted()) return
        setStatus(activity.getString(R.string.otp_qr_status_image))
        val image =
            runCatching { InputImage.fromFilePath(activity, uri) }
                .getOrElse {
                    finishWithResult(
                        OtpQrScannerNativeShell.RESULT_INVALID,
                        "",
                        "Selected image could not be opened",
                    )
                    return
                }
        val imageScanner = BarcodeScanning.getClient(createScannerOptions(enableZoom = false))
        imageScanner
            .process(image)
            .addOnSuccessListener { barcodes ->
                if (!handleBarcodes(barcodes, fromImagePicker = true)) {
                    finishWithResult(
                        OtpQrScannerNativeShell.RESULT_INVALID,
                        "",
                        "No QR code found in the selected image",
                    )
                }
            }
            .addOnFailureListener { error ->
                finishWithResult(
                    OtpQrScannerNativeShell.RESULT_INVALID,
                    "",
                    error.message ?: "Image QR decode failed",
                )
            }
            .addOnCompleteListener {
                imageScanner.close()
            }
    }

    fun focusAt(
        x: Float,
        y: Float,
    ) {
        val currentCamera = camera ?: return
        val point = previewView.meteringPointFactory.createPoint(x, y)
        val action =
            FocusMeteringAction.Builder(point, FocusMeteringAction.FLAG_AF)
                .setAutoCancelDuration(2, TimeUnit.SECONDS)
                .build()
        currentCamera.cameraControl.startFocusAndMetering(action)
        setStatus(activity.getString(R.string.otp_qr_status_focusing))
    }

    fun toggleTorch() {
        val currentCamera = camera ?: return
        if (!currentCamera.cameraInfo.hasFlashUnit()) return

        torchEnabled = currentCamera.cameraInfo.torchState.value != TorchState.ON
        currentCamera.cameraControl.enableTorch(torchEnabled)
        setTorchState(true, torchEnabled)
    }

    fun release() {
        cameraProvider?.unbindAll()
        scanner.close()
        cameraExecutor.shutdown()
    }

    private fun bindCamera(provider: ProcessCameraProvider) {
        val preview = Preview.Builder().build().also {
            it.setSurfaceProvider(previewView.surfaceProvider)
        }
        val analysis =
            ImageAnalysis.Builder()
                .setTargetResolution(Size(1280, 720))
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()

        try {
            provider.unbindAll()
            val nextCamera =
                provider.bindToLifecycle(
                    activity,
                    CameraSelector.DEFAULT_BACK_CAMERA,
                    preview,
                    analysis,
                )
            camera = nextCamera
            scanner.close()
            scanner = BarcodeScanning.getClient(createScannerOptions(enableZoom = true))
            analysis.setAnalyzer(cameraExecutor) { imageProxy -> analyzeFrame(imageProxy) }
            updateTorchVisibility()
        } catch (error: Exception) {
            finishWithResult(
                OtpQrScannerNativeShell.RESULT_UNAVAILABLE,
                "",
                error.message ?: "Camera unavailable",
            )
        }
    }

    private fun analyzeFrame(imageProxy: ImageProxy) {
        if (isCompleted() || !analysisBusy.compareAndSet(false, true)) {
            imageProxy.close()
            return
        }

        val mediaImage = imageProxy.image
        if (mediaImage == null) {
            analysisBusy.set(false)
            imageProxy.close()
            return
        }

        val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
        scanner
            .process(image)
            .addOnSuccessListener { barcodes ->
                handleBarcodes(barcodes, fromImagePicker = false)
            }
            .addOnFailureListener {
                setStatus(activity.getString(R.string.otp_qr_status_scanning))
            }
            .addOnCompleteListener {
                analysisBusy.set(false)
                imageProxy.close()
            }
    }

    private fun handleBarcodes(
        barcodes: List<Barcode>,
        fromImagePicker: Boolean,
    ): Boolean {
        val value = OtpQrBarcodeResultExtractor.firstNonBlankRawValue(barcodes.map { barcode -> barcode.rawValue })
        if (value == null) {
            if (!fromImagePicker) setStatus(activity.getString(R.string.otp_qr_status_scanning))
            return false
        }

        finishWithResult(OtpQrScannerNativeShell.RESULT_SUCCESS, value, "")
        return true
    }

    private fun createScannerOptions(enableZoom: Boolean): BarcodeScannerOptions {
        val builder =
            BarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                .enableAllPotentialBarcodes()

        if (enableZoom) {
            val maxZoomRatio = camera?.cameraInfo?.zoomState?.value?.maxZoomRatio ?: 1f
            builder.setZoomSuggestionOptions(
                ZoomSuggestionOptions.Builder { zoomRatio ->
                    val currentCamera = camera
                    if (currentCamera == null) {
                        false
                    } else {
                        currentCamera.cameraControl.setZoomRatio(zoomRatio)
                        true
                    }
                }.setMaxSupportedZoomRatio(maxZoomRatio).build(),
            )
        }

        return builder.build()
    }

    private fun updateTorchVisibility() {
        val hasTorch = camera?.cameraInfo?.hasFlashUnit() == true
        torchEnabled = camera?.cameraInfo?.torchState?.value == TorchState.ON
        setTorchState(hasTorch, torchEnabled)
    }
}
