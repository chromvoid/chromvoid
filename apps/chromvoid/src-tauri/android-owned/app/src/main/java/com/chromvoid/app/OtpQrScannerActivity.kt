package com.chromvoid.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.chromvoid.app.nativebridge.OtpQrScannerNativeShell

class OtpQrScannerActivity : AppCompatActivity() {
    private val requestCameraPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                cameraController?.startCamera()
            } else {
                finishWithResult(
                    OtpQrScannerNativeShell.RESULT_PERMISSION_DENIED,
                    message = "Camera permission denied",
                )
            }
        }
    private val imagePicker =
        registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
            if (uri != null) {
                cameraController?.decodeImageUri(uri)
            }
        }

    private lateinit var previewView: PreviewView
    private lateinit var statusText: TextView
    private lateinit var torchButton: TextView
    private var cameraController: OtpQrCameraController? = null
    private var scanId = ""
    private var completed = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        scanId = intent.getStringExtra(EXTRA_SCAN_ID).orEmpty()
        if (!OtpQrScannerNativeShell.bindActivity(this, scanId)) {
            finishWithResult(OtpQrScannerNativeShell.RESULT_INVALID, message = "Invalid scan session")
            return
        }
        buildUi()
        cameraController =
            OtpQrCameraController(
                activity = this,
                previewView = previewView,
                setStatus = ::setStatus,
                setTorchState = ::setTorchState,
                isCompleted = { completed },
                finishWithResult = ::finishWithResult,
            )

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            cameraController?.startCamera()
        } else {
            requestCameraPermission.launch(Manifest.permission.CAMERA)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
    }

    override fun onDestroy() {
        if (!completed && scanId.isNotBlank()) {
            OtpQrScannerNativeShell.handleActivityResult(scanId, OtpQrScannerNativeShell.RESULT_CANCELLED)
        }
        OtpQrScannerNativeShell.releaseActivity(this, scanId)
        cameraController?.release()
        cameraController = null
        super.onDestroy()
    }

    fun finishCancelledFromNative() {
        finishWithResult(OtpQrScannerNativeShell.RESULT_CANCELLED)
    }

    private fun setTorchState(
        hasTorch: Boolean,
        enabled: Boolean,
    ) {
        if (!::torchButton.isInitialized) return
        torchButton.visibility = if (hasTorch) View.VISIBLE else View.GONE
        torchButton.text =
            if (enabled) {
                getString(R.string.otp_qr_torch_on)
            } else {
                getString(R.string.otp_qr_torch)
            }
    }

    private fun buildUi() {
        val root =
            FrameLayout(this).apply {
                setBackgroundColor(Color.BLACK)
                layoutParams =
                    ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
            }
        previewView =
            PreviewView(this).apply {
                implementationMode = PreviewView.ImplementationMode.PERFORMANCE
                scaleType = PreviewView.ScaleType.FILL_CENTER
                layoutParams =
                    FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT,
                    )
                setOnTouchListener { _, event ->
                    if (event.action == MotionEvent.ACTION_UP) {
                        cameraController?.focusAt(event.x, event.y)
                    }
                    true
                }
            }
        root.addView(previewView)
        root.addView(ReticleView(this))

        val topBar =
            LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(16), dp(12), dp(16), dp(8))
                background = verticalScrim(top = 0x99000000.toInt(), bottom = 0x00000000)
            }
        val cancel = scannerButton(getString(R.string.otp_qr_cancel)).apply {
            setOnClickListener { finishWithResult(OtpQrScannerNativeShell.RESULT_CANCELLED) }
        }
        val topSpacer = View(this).apply {
            layoutParams = LinearLayout.LayoutParams(0, 1, 1f)
        }
        torchButton = scannerButton(getString(R.string.otp_qr_torch)).apply {
            visibility = View.GONE
            setOnClickListener { cameraController?.toggleTorch() }
        }
        topBar.addView(cancel)
        topBar.addView(topSpacer)
        topBar.addView(torchButton)
        root.addView(
            topBar,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.TOP,
            ),
        )

        val bottomBar =
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                setPadding(dp(20), dp(24), dp(20), dp(28))
                background = verticalScrim(top = 0x00000000, bottom = 0xB8000000.toInt())
            }
        statusText =
            TextView(this).apply {
                text = getString(R.string.otp_qr_status_scanning)
                setTextColor(Color.WHITE)
                textSize = 14f
                gravity = Gravity.CENTER
            }
        val chooseImage = scannerButton(getString(R.string.otp_qr_choose_image)).apply {
            setOnClickListener { imagePicker.launch("image/*") }
        }
        bottomBar.addView(
            statusText,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                bottomMargin = dp(14)
            },
        )
        bottomBar.addView(chooseImage)
        root.addView(
            bottomBar,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM,
            ),
        )
        setContentView(root)
    }

    private fun finishWithResult(
        status: String,
        value: String = "",
        message: String = "",
    ) {
        if (completed) return
        completed = true
        OtpQrScannerNativeShell.handleActivityResult(scanId, status, value, message)
        finish()
    }

    private fun setStatus(value: String) {
        if (!::statusText.isInitialized) return
        runOnUiThread {
            statusText.text = value
        }
    }

    private fun scannerButton(label: String): TextView =
        TextView(this).apply {
            text = label
            setTextColor(Color.WHITE)
            textSize = 15f
            gravity = Gravity.CENTER
            isClickable = true
            isFocusable = true
            minHeight = dp(44)
            minWidth = dp(72)
            setPadding(dp(14), 0, dp(14), 0)
            background =
                GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    cornerRadius = dp(14).toFloat()
                    setColor(0x66000000)
                    setStroke(dp(1), 0x55FFFFFF)
                }
        }

    private fun verticalScrim(
        top: Int,
        bottom: Int,
    ): GradientDrawable =
        GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(top, bottom))

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private class ReticleView(context: android.content.Context) : View(context) {
        private val paint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.WHITE
                strokeWidth = context.resources.displayMetrics.density * 3f
                style = Paint.Style.STROKE
                strokeCap = Paint.Cap.ROUND
            }
        private val glow =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = 0x55FFFFFF
                strokeWidth = context.resources.displayMetrics.density
                style = Paint.Style.STROKE
            }

        init {
            importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
            setWillNotDraw(false)
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val size = (minOf(width, height) * 0.64f).coerceAtMost(dp(310).toFloat())
            val left = (width - size) / 2f
            val top = (height - size) / 2f
            val right = left + size
            val bottom = top + size
            val corner = size * 0.18f
            canvas.drawRoundRect(left, top, right, bottom, dp(24).toFloat(), dp(24).toFloat(), glow)
            drawCorner(canvas, left, top, corner, 1f, 1f)
            drawCorner(canvas, right, top, corner, -1f, 1f)
            drawCorner(canvas, left, bottom, corner, 1f, -1f)
            drawCorner(canvas, right, bottom, corner, -1f, -1f)
        }

        private fun drawCorner(
            canvas: Canvas,
            x: Float,
            y: Float,
            length: Float,
            xDirection: Float,
            yDirection: Float,
        ) {
            canvas.drawLine(x, y, x + length * xDirection, y, paint)
            canvas.drawLine(x, y, x, y + length * yDirection, paint)
        }

        private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
    }

    companion object {
        const val EXTRA_SCAN_ID = "com.chromvoid.app.extra.OTP_QR_SCAN_ID"
    }
}
