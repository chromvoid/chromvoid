package com.chromvoid.app.main

import android.animation.ValueAnimator
import android.app.Activity
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.RenderEffect
import android.graphics.Shader
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.LinearInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import com.chromvoid.app.R
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

internal class StartupSplashController(
    private val activity: Activity,
    private val logStartup: (String, String?) -> Unit,
) {
    private val splashFallbackHandler = Handler(Looper.getMainLooper())
    private val splashFallbackRunnable = Runnable {
        logStartup("native_splash.fallback.timeout", null)
        release()
    }
    private val splashReadyReleaseRunnable = Runnable {
        logStartup("native_splash.ready_release.run", null)
        release()
    }
    private val splashIdleStartRunnable = Runnable {
        logStartup("native_splash.idle.start_delayed", null)
        startIdleAnimation()
    }

    private var baseLogo: ImageView? = null
    private var glowLogo: ImageView? = null
    private var idleAnimator: ValueAnimator? = null
    private var overlay: View? = null
    private var startedAtMs = 0L
    private var releaseQueued = false

    fun install() {
        if (overlay != null) {
            logStartup("native_splash.overlay.install.skip-existing", null)
            return
        }

        logStartup("native_splash.overlay.install.begin", null)
        val overlayView =
            FrameLayout(activity).apply {
                setBackgroundColor(BACKGROUND_COLOR)
                importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
                isClickable = true
                isFocusable = false
            }
        val glow =
            ImageView(activity).apply {
                setImageResource(R.drawable.splash_logo)
                scaleType = ImageView.ScaleType.FIT_CENTER
                alpha = 0f
                importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    setRenderEffect(
                        RenderEffect.createBlurEffect(
                            STARTUP_GLOW_BLUR_PX,
                            STARTUP_GLOW_BLUR_PX,
                            Shader.TileMode.CLAMP,
                        ),
                    )
                }
            }
        val logo =
            ImageView(activity).apply {
                setImageResource(R.drawable.splash_logo)
                scaleType = ImageView.ScaleType.FIT_CENTER
                alpha = 1f
                importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
            }
        val logoSize = resolveLogoSizePx()
        logStartup("native_splash.logo.size", "px=$logoSize")

        overlayView.addView(
            glow,
            FrameLayout.LayoutParams(logoSize, logoSize, Gravity.CENTER),
        )
        overlayView.addView(
            logo,
            FrameLayout.LayoutParams(logoSize, logoSize, Gravity.CENTER),
        )
        overlay = overlayView
        baseLogo = logo
        glowLogo = glow
        startedAtMs = SystemClock.uptimeMillis()
        releaseQueued = false
        attachOverlay(overlayView, "overlay.install")
        ensureOnTop("overlay.install")
        splashFallbackHandler.postDelayed(splashFallbackRunnable, STARTUP_SPLASH_FALLBACK_MS)
        logStartup("native_splash.overlay.installed", "fallbackMs=$STARTUP_SPLASH_FALLBACK_MS")
        startAnimation()
    }

    fun requestRelease() {
        if (releaseQueued || overlay == null) {
            logStartup(
                "native_splash.release.request.ignored",
                "queued=$releaseQueued hasOverlay=${overlay != null}",
            )
            return
        }

        releaseQueued = true
        val elapsedMs = SystemClock.uptimeMillis() - startedAtMs
        val delayMs = max(0L, STARTUP_SPLASH_MIN_VISIBLE_MS - elapsedMs)
        logStartup("native_splash.release.requested", "overlayElapsedMs=$elapsedMs delayMs=$delayMs")
        splashFallbackHandler.postDelayed(splashReadyReleaseRunnable, delayMs)
    }

    fun ensureOnTop(reason: String) {
        val overlayView = overlay ?: return
        val parent = overlayView.parent as? ViewGroup
        val decorView = activity.window.decorView as? ViewGroup
        if (parent == null || parent !== decorView) {
            parent?.removeView(overlayView)
            attachOverlay(overlayView, reason)
        }
        overlayView.bringToFront()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            overlayView.elevation = dpToPx(STARTUP_SPLASH_ELEVATION_DP).toFloat()
        }
        overlayView.requestLayout()
        overlayView.invalidate()
        logStartup(
            "native_splash.overlay.bring_to_front",
            "reason=$reason attached=${overlayView.isAttachedToWindow}",
        )
    }

    fun dispose() {
        stopAnimation()
        splashFallbackHandler.removeCallbacks(splashFallbackRunnable)
        splashFallbackHandler.removeCallbacks(splashReadyReleaseRunnable)
        splashFallbackHandler.removeCallbacks(splashIdleStartRunnable)
        val overlayView = overlay
        if (overlayView != null) {
            overlayView.animate().cancel()
            (overlayView.parent as? ViewGroup)?.removeView(overlayView)
        }
        overlay = null
        baseLogo = null
        glowLogo = null
        releaseQueued = false
    }

    internal fun hasOverlayForTests(): Boolean = overlay != null

    internal fun releaseQueuedForTests(): Boolean = releaseQueued

    private fun release() {
        val overlayView =
            overlay ?: run {
                logStartup("native_splash.release.skip-no-overlay", null)
                return
            }
        logStartup("native_splash.release.start", null)
        splashFallbackHandler.removeCallbacks(splashFallbackRunnable)
        splashFallbackHandler.removeCallbacks(splashReadyReleaseRunnable)
        stopAnimation()
        overlayView.animate().cancel()
        overlayView
            .animate()
            .alpha(0f)
            .setDuration(STARTUP_SPLASH_FADE_MS)
            .setInterpolator(AccelerateDecelerateInterpolator())
            .withEndAction {
                logStartup("native_splash.release.end", null)
                (overlayView.parent as? ViewGroup)?.removeView(overlayView)
                if (overlay === overlayView) {
                    overlay = null
                }
                baseLogo = null
                glowLogo = null
            }
            .start()
    }

    private fun attachOverlay(overlayView: View, reason: String) {
        val decorView = activity.window.decorView as? ViewGroup
        if (decorView == null) {
            activity.addContentView(
                overlayView,
                ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                ),
            )
            logStartup("native_splash.overlay.attached", "reason=$reason target=content")
            return
        }

        decorView.addView(
            overlayView,
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
        logStartup("native_splash.overlay.attached", "reason=$reason target=decor")
    }

    private fun resolveLogoSizePx(): Int {
        val metrics = activity.resources.displayMetrics
        val minViewportPx = min(metrics.widthPixels, metrics.heightPixels).toFloat()
        val preferredPx = (minViewportPx * STARTUP_LOGO_VIEWPORT_FRACTION).roundToInt()
        return min(max(dpToPx(STARTUP_LOGO_MIN_DP), preferredPx), dpToPx(STARTUP_LOGO_MAX_DP))
    }

    private fun dpToPx(value: Int): Int = (value * activity.resources.displayMetrics.density).roundToInt()

    private fun startAnimation() {
        logStartup("native_splash.animation.base-frame", null)
        applyBaseFrame()
        splashFallbackHandler.postDelayed(splashIdleStartRunnable, STARTUP_IDLE_START_DELAY_MS)
    }

    private fun startIdleAnimation() {
        if (overlay == null || idleAnimator != null) {
            logStartup(
                "native_splash.idle.skip",
                "hasOverlay=${overlay != null} hasAnimator=${idleAnimator != null}",
            )
            return
        }

        val animator =
            ValueAnimator.ofFloat(0f, 1f).apply {
                duration = STARTUP_ANIMATION_IDLE_MS
                repeatCount = ValueAnimator.INFINITE
                repeatMode = ValueAnimator.RESTART
                interpolator = LinearInterpolator()
                addUpdateListener { valueAnimator ->
                    val progress = valueAnimator.animatedValue as Float
                    applyIdleFrame(progress)
                }
            }

        idleAnimator = animator
        animator.start()
        logStartup("native_splash.idle.started", null)
    }

    private fun applyBaseFrame() {
        baseLogo?.colorFilter = createColorFilter(
            hueDegrees = STARTUP_FILTER_VIOLET_HUE_DEGREES,
            saturation = STARTUP_FILTER_VIOLET_SATURATION,
            brightness = STARTUP_FILTER_VIOLET_BRIGHTNESS,
        )
        baseLogo?.alpha = 1f
        baseLogo?.scaleX = 1f
        baseLogo?.scaleY = 1f

        glowLogo?.alpha = 0f
        glowLogo?.scaleX = 1f
        glowLogo?.scaleY = 1f
    }

    private fun applyIdleFrame(progress: Float) {
        val cyanBlend = smoothStep((1f - kotlin.math.cos(progress * TWO_PI)).toFloat() * 0.5f)
        val glowScale = 1.012f + cyanBlend * STARTUP_GLOW_SCALE_DELTA

        baseLogo?.colorFilter = createColorFilter(
            hueDegrees = lerp(STARTUP_FILTER_VIOLET_HUE_DEGREES, STARTUP_FILTER_CYAN_HUE_DEGREES, cyanBlend),
            saturation = lerp(STARTUP_FILTER_VIOLET_SATURATION, STARTUP_FILTER_CYAN_SATURATION, cyanBlend),
            brightness = lerp(STARTUP_FILTER_VIOLET_BRIGHTNESS, STARTUP_FILTER_CYAN_BRIGHTNESS, cyanBlend),
        )
        baseLogo?.alpha = 1f
        baseLogo?.scaleX = 1f
        baseLogo?.scaleY = 1f

        glowLogo?.colorFilter = createColorFilter(
            hueDegrees = lerp(STARTUP_GLOW_VIOLET_HUE_DEGREES, STARTUP_GLOW_CYAN_HUE_DEGREES, cyanBlend),
            saturation = lerp(STARTUP_GLOW_VIOLET_SATURATION, STARTUP_GLOW_CYAN_SATURATION, cyanBlend),
            brightness = lerp(STARTUP_GLOW_VIOLET_BRIGHTNESS, STARTUP_GLOW_CYAN_BRIGHTNESS, cyanBlend),
        )
        glowLogo?.alpha = lerp(STARTUP_GLOW_VIOLET_ALPHA, STARTUP_GLOW_CYAN_ALPHA, cyanBlend)
        glowLogo?.scaleX = glowScale
        glowLogo?.scaleY = glowScale
    }

    private fun createColorFilter(
        hueDegrees: Float,
        saturation: Float,
        brightness: Float,
    ): ColorMatrixColorFilter {
        val matrix = ColorMatrix(hueRotationMatrix(hueDegrees))
        matrix.postConcat(
            ColorMatrix().apply {
                setSaturation(saturation)
            },
        )
        matrix.postConcat(
            ColorMatrix(
                floatArrayOf(
                    brightness, 0f, 0f, 0f, 0f,
                    0f, brightness, 0f, 0f, 0f,
                    0f, 0f, brightness, 0f, 0f,
                    0f, 0f, 0f, 1f, 0f,
                ),
            ),
        )
        return ColorMatrixColorFilter(matrix)
    }

    private fun hueRotationMatrix(degrees: Float): FloatArray {
        val radians = Math.toRadians(degrees.toDouble())
        val cos = kotlin.math.cos(radians).toFloat()
        val sin = kotlin.math.sin(radians).toFloat()
        val lumR = 0.213f
        val lumG = 0.715f
        val lumB = 0.072f

        return floatArrayOf(
            lumR + cos * (1f - lumR) + sin * (-lumR),
            lumG + cos * (-lumG) + sin * (-lumG),
            lumB + cos * (-lumB) + sin * (1f - lumB),
            0f,
            0f,
            lumR + cos * (-lumR) + sin * 0.143f,
            lumG + cos * (1f - lumG) + sin * 0.14f,
            lumB + cos * (-lumB) + sin * -0.283f,
            0f,
            0f,
            lumR + cos * (-lumR) + sin * -(1f - lumR),
            lumG + cos * (-lumG) + sin * lumG,
            lumB + cos * (1f - lumB) + sin * lumB,
            0f,
            0f,
            0f,
            0f,
            0f,
            1f,
            0f,
        )
    }

    private fun stopAnimation() {
        splashFallbackHandler.removeCallbacks(splashIdleStartRunnable)
        idleAnimator?.cancel()
        idleAnimator = null
    }

    private fun lerp(from: Float, to: Float, progress: Float): Float {
        return from + (to - from) * progress.coerceIn(0f, 1f)
    }

    private fun smoothStep(progress: Float): Float {
        val t = progress.coerceIn(0f, 1f)
        return t * t * (3f - 2f * t)
    }

    companion object {
        const val BACKGROUND_HEX = "#030507"
        val BACKGROUND_COLOR: Int = Color.parseColor(BACKGROUND_HEX)

        private const val STARTUP_SPLASH_MIN_VISIBLE_MS = 1_600L
        private const val STARTUP_SPLASH_FADE_MS = 180L
        private const val STARTUP_SPLASH_FALLBACK_MS = 12_000L
        private const val STARTUP_SPLASH_ELEVATION_DP = 32
        private const val STARTUP_LOGO_MIN_DP = 300
        private const val STARTUP_LOGO_MAX_DP = 420
        private const val STARTUP_LOGO_VIEWPORT_FRACTION = 0.38f
        private const val STARTUP_IDLE_START_DELAY_MS = 450L
        private const val STARTUP_ANIMATION_IDLE_MS = 4_800L
        private const val STARTUP_FILTER_VIOLET_HUE_DEGREES = 0f
        private const val STARTUP_FILTER_CYAN_HUE_DEGREES = -68f
        private const val STARTUP_FILTER_VIOLET_SATURATION = 1.04f
        private const val STARTUP_FILTER_CYAN_SATURATION = 1.16f
        private const val STARTUP_FILTER_VIOLET_BRIGHTNESS = 1.02f
        private const val STARTUP_FILTER_CYAN_BRIGHTNESS = 1.07f
        private const val STARTUP_GLOW_VIOLET_HUE_DEGREES = -12f
        private const val STARTUP_GLOW_CYAN_HUE_DEGREES = -72f
        private const val STARTUP_GLOW_VIOLET_SATURATION = 1.16f
        private const val STARTUP_GLOW_CYAN_SATURATION = 1.3f
        private const val STARTUP_GLOW_VIOLET_BRIGHTNESS = 1.05f
        private const val STARTUP_GLOW_CYAN_BRIGHTNESS = 1.14f
        private const val STARTUP_GLOW_VIOLET_ALPHA = 0.025f
        private const val STARTUP_GLOW_CYAN_ALPHA = 0.115f
        private const val STARTUP_GLOW_SCALE_DELTA = 0.032f
        private const val STARTUP_GLOW_BLUR_PX = 18f
        private val TWO_PI = (Math.PI * 2).toFloat()
    }
}
