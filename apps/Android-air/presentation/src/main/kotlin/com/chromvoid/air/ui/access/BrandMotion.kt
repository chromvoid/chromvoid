package com.chromvoid.air.ui.access

import androidx.compose.animation.core.CubicBezierEasing
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin

/** All motion values follow business/brand/motion.md, on its 256-unit artboard. */
internal object BrandMotionSpec {
    const val INTRO_MS = 1440L
    const val RETURN_MS = 350L
    const val CYCLE_MS = 1400L
    const val RUN_MS = 1150L
    const val FINISH_MS = 220L
    const val NAVIGATE_MS = 150L
    const val RING_MS = 550L
    const val SIGNAL_LENGTH = 78f

    val easeInOut = CubicBezierEasing(0.45f, 0f, 0.55f, 1f)
    val easeOut = CubicBezierEasing(0.5f, 1f, 0.89f, 1f)

    fun finishDuration(startedAt: Long, completedAt: Long): Long =
        if ((completedAt - startedAt).coerceAtLeast(0) % CYCLE_MS < RUN_MS) FINISH_MS else 0L
}

public enum class BrandEntry { APPEAR, RETURN, STILL }

/** Process memory, deliberately neither saved with an activity nor persisted to disk. */
internal class BrandIntroState {
    private var played = false

    @Synchronized
    fun claim(): BrandEntry = if (played) BrandEntry.RETURN else {
        played = true
        BrandEntry.APPEAR
    }
}

internal object BrandIntro {
    private val process = BrandIntroState()

    fun claim(): BrandEntry = process.claim()
}

/** Presentation only: no password, vault contents or authorization decision enters this timeline. */
public sealed interface BrandUnlockMotion {
    public data object Idle : BrandUnlockMotion
    /** An operation failed: settle even if the cold-start appearance was still running. */
    public data object Rest : BrandUnlockMotion
    public data class Deriving(val startedAt: Long) : BrandUnlockMotion
    public data class Finishing(val startedAt: Long, val completedAt: Long) : BrandUnlockMotion
    public data class Open(val startedAt: Long, val transitionStarted: Boolean = false) : BrandUnlockMotion
}

internal data class BrandMotionFrame(
    val trace: Float = 1f,
    val width: Float = 72f,
    val sceneOpacity: Float = 1f,
    val sceneRotation: Float = 0f,
    val sceneScale: Float = 1f,
    val auraOpacity: Float = 0.05f,
    val auraScale: Float = 1f,
    val coreScale: Float = 1f,
    val coreOpacity: Float = 1f,
    val coreRingOpacity: Float = 0.58f,
    val coreRingScale: Float = 1f,
    val signalStart: Float? = null,
    val signalOpacity: Float = 0f,
    val openRingProgress: Float? = null,
)

internal fun brandMotionFrame(
    entry: BrandEntry,
    entryElapsed: Long,
    motion: BrandUnlockMotion,
    now: Long,
    reducedMotion: Boolean,
    pathLength: Float,
): BrandMotionFrame {
    if (reducedMotion) {
        val age = if (motion is BrandUnlockMotion.Deriving) now - motion.startedAt else 0L
        val opacity = 1f - 0.4f * (0.5f - 0.5f * cos(2 * PI * age / 2400).toFloat())
        return BrandMotionFrame(coreOpacity = opacity)
    }
    val base = entryFrame(entry, entryElapsed)
    return when (motion) {
        BrandUnlockMotion.Idle -> base
        BrandUnlockMotion.Rest -> BrandMotionFrame()
        is BrandUnlockMotion.Deriving -> {
            val elapsed = (now - motion.startedAt).coerceAtLeast(0)
            val cycle = elapsed % BrandMotionSpec.CYCLE_MS
            val responseAge = elapsed - BrandMotionSpec.RUN_MS
            val responseCycle = responseAge % BrandMotionSpec.CYCLE_MS
            // The 260 ms response overlaps the next signal cycle by 10 ms.
            val response = if (responseAge >= 0 && responseCycle < 260) {
                sin(PI * responseCycle / 260).toFloat()
            } else 0f
            base.copy(
                signalStart = if (cycle < BrandMotionSpec.RUN_MS) signalPosition(cycle, pathLength) else null,
                signalOpacity = 0.85f * fraction(cycle, 0, 140),
                coreScale = base.coreScale * (1f + 0.07f * response),
                auraOpacity = base.auraOpacity + 0.22f * response,
            )
        }
        is BrandUnlockMotion.Finishing -> {
            val cycle = (motion.completedAt - motion.startedAt).coerceAtLeast(0) % BrandMotionSpec.CYCLE_MS
            val start = signalPosition(cycle, pathLength)
            val progress = fraction(now - motion.completedAt, 0, BrandMotionSpec.FINISH_MS)
            base.copy(signalStart = start + (pathLength - start) * progress * progress, signalOpacity = 0.85f)
        }
        is BrandUnlockMotion.Open -> {
            val age = now - motion.startedAt
            val response = if (age in 0..220) sin(PI * age / 220).toFloat() else 0f
            base.copy(
                coreScale = base.coreScale * (1f + 0.06f * response),
                auraOpacity = base.auraOpacity + 0.2f * response,
                openRingProgress = if (age < BrandMotionSpec.RING_MS) {
                    BrandMotionSpec.easeOut.transform(fraction(age, 0, BrandMotionSpec.RING_MS))
                } else null,
            )
        }
    }
}

private fun signalPosition(cycle: Long, length: Float): Float =
    -BrandMotionSpec.SIGNAL_LENGTH + (length + BrandMotionSpec.SIGNAL_LENGTH) *
        fraction(cycle, 0, BrandMotionSpec.RUN_MS).pow(1.6f)

private fun entryFrame(entry: BrandEntry, elapsed: Long): BrandMotionFrame {
    if ((entry == BrandEntry.APPEAR && elapsed >= BrandMotionSpec.INTRO_MS) ||
        (entry == BrandEntry.RETURN && elapsed >= BrandMotionSpec.RETURN_MS)
    ) return BrandMotionFrame()
    return when (entry) {
        BrandEntry.STILL -> BrandMotionFrame()
        BrandEntry.RETURN -> BrandMotionFrame(coreScale = 0.85f + 0.15f * backOut(fraction(elapsed, 0, 350), 1f))
        BrandEntry.APPEAR -> {
            val scene = BrandMotionSpec.easeOut.transform(fraction(elapsed, 0, 1050))
            val aura = BrandMotionSpec.easeOut.transform(fraction(elapsed, 820, 480))
            val coreRing = BrandMotionSpec.easeOut.transform(fraction(elapsed, 1020, 340))
            BrandMotionFrame(
                trace = BrandMotionSpec.easeInOut.transform(fraction(elapsed, 0, 1080)),
                width = 10f + 62f * BrandMotionSpec.easeOut.transform(fraction(elapsed, 80, 780)),
                sceneOpacity = fraction(elapsed, 0, 140),
                sceneRotation = -8f * (1f - scene),
                sceneScale = 0.88f + 0.12f * scene,
                auraOpacity = 0.05f * aura,
                auraScale = 0.8f + 0.2f * aura,
                coreScale = 0.18f + 0.82f * backOut(fraction(elapsed, 900, 540), 1.25f),
                coreOpacity = BrandMotionSpec.easeOut.transform(fraction(elapsed, 900, 160)),
                coreRingOpacity = 1f - 0.42f * coreRing,
                coreRingScale = 0.88f + 0.12f * coreRing,
            )
        }
    }
}

private fun fraction(elapsed: Long, start: Long, duration: Long): Float =
    ((elapsed - start).toFloat() / duration).coerceIn(0f, 1f)

private fun backOut(progress: Float, overshoot: Float): Float {
    val x = progress - 1f
    return 1f + (overshoot + 1f) * x * x * x + overshoot * x * x
}
