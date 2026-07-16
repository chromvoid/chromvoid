package com.chromvoid.app.main

import android.animation.ValueAnimator
import android.app.Activity
import android.graphics.Color
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
        startHeartbeatAnimation()
    }

    private var iconView: ChromVoidSplashIconView? = null
    private var introAnimator: ValueAnimator? = null
    private var heartbeatAnimator: ValueAnimator? = null
    private var overlay: View? = null
    private var startedAtMs = 0L
    private var releaseQueued = false
    private var releaseInProgress = false

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
        val icon = ChromVoidSplashIconView(activity)
        val logoSize = resolveLogoSizePx()
        logStartup("native_splash.logo.size", "px=$logoSize")

        overlayView.addView(
            icon,
            FrameLayout.LayoutParams(logoSize, logoSize, Gravity.CENTER),
        )
        overlay = overlayView
        iconView = icon
        startedAtMs = SystemClock.uptimeMillis()
        releaseQueued = false
        releaseInProgress = false
        attachOverlay(overlayView, "overlay.install")
        ensureOnTop("overlay.install")
        splashFallbackHandler.postDelayed(splashFallbackRunnable, STARTUP_SPLASH_FALLBACK_MS)
        logStartup("native_splash.overlay.installed", "fallbackMs=$STARTUP_SPLASH_FALLBACK_MS")
        icon.onFirstDraw = {
            if (overlay === overlayView && !releaseInProgress) {
                startAnimation()
            }
        }
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
        iconView = null
        releaseQueued = false
        releaseInProgress = false
    }

    internal fun hasOverlayForTests(): Boolean = overlay != null

    internal fun hasIconViewForTests(): Boolean = iconView != null

    internal fun introProgressForTests(): Float? = iconView?.introProgressForTests

    internal fun coreProgressForTests(): Float? = iconView?.coreProgressForTests

    internal fun spiralRevealProgressForTests(): Float? = iconView?.spiralRevealProgressForTests

    internal fun heartbeatProgressForTests(): Float? = iconView?.heartbeatProgressForTests

    internal fun hasRunningIntroAnimatorForTests(): Boolean = introAnimator?.isRunning == true

    internal fun hasHeartbeatAnimatorForTests(): Boolean = heartbeatAnimator != null

    internal fun dispatchIconFirstDrawForTests() {
        iconView?.dispatchFirstDrawForTests()
    }

    internal fun releaseQueuedForTests(): Boolean = releaseQueued

    private fun release() {
        val overlayView =
            overlay ?: run {
                logStartup("native_splash.release.skip-no-overlay", null)
                return
        }
        logStartup("native_splash.release.start", null)
        releaseInProgress = true
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
                iconView = null
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
        val icon = iconView ?: return
        logStartup("native_splash.animation.intro.started", null)
        if (!ValueAnimator.areAnimatorsEnabled()) {
            icon.setFinalFrame()
            logStartup("native_splash.animation.disabled", null)
            return
        }

        var cancelled = false
        val animator =
            ValueAnimator.ofFloat(0f, 1f).apply {
                duration = STARTUP_ANIMATION_INTRO_MS
                interpolator = LinearInterpolator()
                addUpdateListener { valueAnimator ->
                    val progress = valueAnimator.animatedValue as Float
                    icon.setIntroProgress(progress)
                }
                addListener(
                    object : android.animation.AnimatorListenerAdapter() {
                        override fun onAnimationCancel(animation: android.animation.Animator) {
                            cancelled = true
                        }

                        override fun onAnimationEnd(animation: android.animation.Animator) {
                            if (cancelled || introAnimator !== animation) return
                            introAnimator = null
                            icon.setFinalFrame()
                            logStartup("native_splash.animation.intro.completed", null)
                            splashFallbackHandler.postDelayed(
                                splashIdleStartRunnable,
                                STARTUP_HEARTBEAT_START_DELAY_MS,
                            )
                        }
                    },
                )
            }

        introAnimator = animator
        animator.start()
    }

    private fun startHeartbeatAnimation() {
        val icon = iconView
        if (overlay == null || icon == null || heartbeatAnimator != null || !ValueAnimator.areAnimatorsEnabled()) {
            logStartup(
                "native_splash.heartbeat.skip",
                "hasOverlay=${overlay != null} hasIcon=${icon != null} hasAnimator=${heartbeatAnimator != null}",
            )
            return
        }

        val animator =
            ValueAnimator.ofFloat(0f, 1f).apply {
                duration = STARTUP_ANIMATION_HEARTBEAT_MS
                repeatCount = ValueAnimator.INFINITE
                repeatMode = ValueAnimator.RESTART
                interpolator = LinearInterpolator()
                addUpdateListener { valueAnimator ->
                    icon.setHeartbeatProgress(valueAnimator.animatedValue as Float)
                }
            }

        heartbeatAnimator = animator
        animator.start()
        logStartup("native_splash.heartbeat.started", null)
    }

    private fun stopAnimation() {
        splashFallbackHandler.removeCallbacks(splashIdleStartRunnable)
        introAnimator?.cancel()
        introAnimator = null
        heartbeatAnimator?.cancel()
        heartbeatAnimator = null
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
        private const val STARTUP_HEARTBEAT_START_DELAY_MS = 80L
        private const val STARTUP_ANIMATION_INTRO_MS = 1_100L
        private const val STARTUP_ANIMATION_HEARTBEAT_MS = 2_300L
    }
}
