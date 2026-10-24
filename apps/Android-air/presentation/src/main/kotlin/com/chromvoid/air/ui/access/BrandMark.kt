package com.chromvoid.air.ui.access

import android.content.res.Configuration
import android.database.ContentObserver
import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.MotionDurationScale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asAndroidPath
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import kotlinx.coroutines.isActive

/** Raster artwork with the geometry and timeline from business/brand/motion.md. Decorative only. */
@Composable
public fun BrandMark(
    size: Dp,
    modifier: Modifier = Modifier,
    motion: BrandUnlockMotion = BrandUnlockMotion.Idle,
    animated: Boolean = false,
    onReducedMotionChanged: (Boolean) -> Unit = {},
) {
    val entry = remember(animated) { if (animated) BrandIntro.claim() else BrandEntry.STILL }
    val enteredAt = remember(entry) { brandTime() }
    val owner = remember { Any() }
    val transition = LocalBrandMarkTransition.current
    DisposableEffect(transition?.state, owner) {
        onDispose { transition?.state?.detach(owner) }
    }
    val placed = if (transition == null) modifier else modifier.onGloballyPositioned {
        transition.state.place(
            BrandMarkPlacement(owner, it.positionInRoot(), it.size, it.boundsInRoot(), entry, enteredAt),
        )
    }
    if (transition?.retainedOwner === owner) {
        Spacer(placed.size(size))
    } else {
        BrandMarkScene(size, placed, motion, entry, enteredAt, onReducedMotionChanged)
    }
}

@Composable
internal fun BrandMarkScene(
    size: Dp,
    modifier: Modifier,
    motion: BrandUnlockMotion,
    entry: BrandEntry,
    enteredAt: Long,
    onReducedMotionChanged: (Boolean) -> Unit,
    exiting: Boolean = false,
) {
    val dark = Air.colors.isDark
    val artwork = rememberBrandArtwork(dark)
    val geometry = remember { BrandGeometry() }
    var now by remember { mutableLongStateOf(brandTime()) }
    val reducedMotion = rememberBrandReducedMotion()
    val reducedMotionChanged by rememberUpdatedState(onReducedMotionChanged)
    LaunchedEffect(reducedMotion) { reducedMotionChanged(reducedMotion) }
    LaunchedEffect(entry, motion, reducedMotion) {
        now = brandTime()
        while (isActive && needsBrandFrame(entry, enteredAt, motion, now, reducedMotion)) {
            withFrameNanos { now = brandTime() }
        }
    }
    Canvas(modifier.size(size).testTag(BRAND_MARK_TAG)) {
        val frame = brandMotionFrame(entry, now - enteredAt, motion, now, reducedMotion, geometry.length)
        val artboardScale = this.size.minDimension / ARTBOARD
        withTransform({ scale(artboardScale, artboardScale, Offset.Zero) }) {
            frame.openRingProgress?.let { progress ->
                drawCircle(
                    color = if (dark) Color(0xFF84D5FF) else Color(0xFF0B9FD5),
                    radius = 22f * (1f + 3f * progress),
                    center = CORE,
                    alpha = 0.8f * (1f - progress),
                    style = Stroke(width = 2.dp.toPx() / artboardScale),
                )
            }
            if (exiting && motion is BrandUnlockMotion.Open) {
                val elapsed = now - motion.startedAt - BrandMotionSpec.NAVIGATE_MS
                val duration = BrandMotionSpec.RING_MS - BrandMotionSpec.NAVIGATE_MS
                val progress = (elapsed.toFloat() / duration).coerceIn(0f, 1f)
                // Fade the outgoing artwork with the route; the ring keeps its canonical opacity above.
                brandLayer(alpha = 1f - BrandMotionSpec.easeOut.transform(progress)) {
                    drawBrandSceneArtwork(artwork, geometry, frame, dark)
                }
            } else drawBrandSceneArtwork(artwork, geometry, frame, dark)
        }
    }
}

private fun DrawScope.drawBrandSceneArtwork(
    artwork: ImageBitmap,
    geometry: BrandGeometry,
    frame: BrandMotionFrame,
    dark: Boolean,
) {
    drawBrandAura(artwork, geometry, frame)
    rotate(frame.sceneRotation, CORE) {
        scale(frame.sceneScale, frame.sceneScale, CORE) {
            brandLayer(alpha = frame.sceneOpacity) {
                drawBrandRibbon(artwork, geometry, frame)
            }
            if (frame.signalStart != null && frame.signalOpacity > 0f) {
                brandLayer {
                    drawImage(
                        geometry.signal(frame.signalStart, dark),
                        alpha = frame.signalOpacity * frame.sceneOpacity,
                    )
                    brandLayer(blendMode = BlendMode.DstIn) {
                        drawBrandRibbon(artwork, geometry, frame)
                    }
                }
            }
        }
    }
    scale(frame.coreScale, frame.coreScale, CORE) {
        clipPath(geometry.coreDisc) { drawArtwork(artwork, frame.coreOpacity) }
        scale(frame.coreRingScale, frame.coreRingScale, CORE) {
            clipPath(geometry.coreRing) {
                drawArtwork(artwork, frame.coreOpacity * (frame.coreRingOpacity / 0.58f).coerceAtMost(1f))
            }
            // The raster's ring is already at its resting opacity, 0.58.
            val additionalRing = (frame.coreRingOpacity - 0.58f).coerceAtLeast(0f)
            if (additionalRing > 0f) {
                drawCircle(
                    Color(0xFF98F7FF),
                    radius = 17.5f,
                    center = CORE,
                    alpha = additionalRing * frame.coreOpacity,
                    style = Stroke(0.9f),
                )
            }
        }
    }
}

@Composable
private fun rememberBrandArtwork(dark: Boolean): ImageBitmap {
    val context = LocalContext.current
    val configuration = LocalConfiguration.current
    return remember(context, configuration, dark) {
        val themed = Configuration(configuration).apply {
            uiMode = (uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or
                if (dark) Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO
        }
        val resources = context.createConfigurationContext(themed).resources
        ImageBitmap.imageResource(resources, R.drawable.brand_mark)
    }
}

/** Observe the same system scale that backs Android's “Remove animations” setting, including changes. */
@Composable
private fun rememberBrandReducedMotion(): Boolean {
    val resolver = LocalContext.current.contentResolver
    fun readDisabled(): Boolean = Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    var disabled by remember(resolver) { mutableStateOf(readDisabled()) }
    DisposableEffect(resolver) {
        val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) { disabled = readDisabled() }
        }
        resolver.registerContentObserver(
            Settings.Global.getUriFor(Settings.Global.ANIMATOR_DURATION_SCALE),
            false,
            observer,
        )
        disabled = readDisabled()
        onDispose { resolver.unregisterContentObserver(observer) }
    }
    val motionScale = rememberCoroutineScope().coroutineContext[MotionDurationScale]
    return disabled || motionScale?.scaleFactor == 0f
}

private fun brandTime(): Long = System.nanoTime() / 1_000_000L

private fun needsBrandFrame(
    entry: BrandEntry,
    enteredAt: Long,
    motion: BrandUnlockMotion,
    now: Long,
    reducedMotion: Boolean,
): Boolean {
    if (motion == BrandUnlockMotion.Rest) return false
    if (motion is BrandUnlockMotion.Deriving) return true
    if (reducedMotion) return false
    val entryActive = when (entry) {
        BrandEntry.APPEAR -> now - enteredAt < BrandMotionSpec.INTRO_MS
        BrandEntry.RETURN -> now - enteredAt < BrandMotionSpec.RETURN_MS
        BrandEntry.STILL -> false
    }
    return entryActive || when (motion) {
        is BrandUnlockMotion.Finishing -> now - motion.completedAt < BrandMotionSpec.FINISH_MS
        is BrandUnlockMotion.Open -> now - motion.startedAt < BrandMotionSpec.RING_MS
        else -> false
    }
}

private fun DrawScope.drawBrandRibbon(artwork: ImageBitmap, geometry: BrandGeometry, frame: BrandMotionFrame) {
    brandLayer {
        drawPath(
            geometry.reveal(frame.trace),
            Color.White,
            style = Stroke(width = frame.width, cap = StrokeCap.Butt),
        )
        drawPath(geometry.pocket, Color.Transparent, blendMode = BlendMode.Clear)
        drawArtwork(artwork, blendMode = BlendMode.SrcIn)
    }
}

private fun DrawScope.drawBrandAura(artwork: ImageBitmap, geometry: BrandGeometry, frame: BrandMotionFrame) {
    scale(frame.auraScale, frame.auraScale, CORE) {
        clipPath(geometry.aura) { drawArtwork(artwork, (frame.auraOpacity / 0.05f).coerceIn(0f, 1f)) }
        val additionalAura = (frame.auraOpacity - 0.05f).coerceAtLeast(0f)
        if (additionalAura > 0f) drawImage(geometry.auraGlow, alpha = additionalAura)
    }
}

private fun DrawScope.drawArtwork(
    artwork: ImageBitmap,
    alpha: Float = 1f,
    blendMode: BlendMode = BlendMode.SrcOver,
) {
    drawImage(
        image = artwork,
        dstSize = IntSize(ARTBOARD.toInt(), ARTBOARD.toInt()),
        alpha = alpha,
        blendMode = blendMode,
        filterQuality = FilterQuality.High,
    )
}

private inline fun DrawScope.brandLayer(
    alpha: Float = 1f,
    blendMode: BlendMode = BlendMode.SrcOver,
    draw: DrawScope.() -> Unit,
) {
    drawContext.canvas.saveLayer(ARTBOARD_BOUNDS, Paint().apply {
        this.alpha = alpha
        this.blendMode = blendMode
    })
    try { draw() } finally { drawContext.canvas.restore() }
}

private const val ARTBOARD = 256f
private val CORE = Offset(143f, 118f)
private val ARTBOARD_BOUNDS = Rect(0f, 0f, ARTBOARD, ARTBOARD)

/** Paths stay on the canonical artboard; Compose measures and trims the actual cubic trace. */
private class BrandGeometry {
    private val trace = Path().apply {
        moveTo(38f, 178f)
        cubicTo(32f, 160f, 30f, 135f, 34f, 114f)
        cubicTo(40f, 81f, 59f, 55f, 88f, 42f)
        cubicTo(120f, 27f, 154f, 39f, 180f, 62f)
        cubicTo(205f, 86f, 211f, 124f, 198f, 153f)
        cubicTo(184f, 184f, 153f, 199f, 122f, 189f)
        cubicTo(93f, 180f, 75f, 154f, 79f, 125f)
        cubicTo(82f, 100f, 102f, 88f, 131f, 98f)
        asAndroidPath().transform(android.graphics.Matrix().apply {
            setRotate(-90f, 128f, 128f)
            postTranslate(15f, -10f)
        })
    }
    private val measure = PathMeasure().apply { setPath(trace, false) }
    val length: Float = measure.length
    private val revealed = Path()
    private val signalPath = Path()
    val pocket: Path = Path().apply {
        addOval(Rect(114f, 95f, 174f, 145f))
        asAndroidPath().transform(android.graphics.Matrix().apply { setRotate(-12f, 144f, 120f) })
    }
    val coreDisc: Path = coreCircle(17.05f)
    val coreRing: Path = annulus(18f, 17.05f)
    val aura: Path = Path.combine(PathOperation.Intersect, annulus(30f, 18f), pocket)
    private val signalBitmap by lazy { Bitmap.createBitmap(256, 256, Bitmap.Config.ARGB_8888) }
    private val signalImage by lazy { signalBitmap.asImageBitmap() }
    private val signalCanvas by lazy { android.graphics.Canvas(signalBitmap) }
    private val signalPaint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        style = android.graphics.Paint.Style.STROKE
        strokeWidth = 100f
        strokeCap = android.graphics.Paint.Cap.BUTT
        strokeJoin = android.graphics.Paint.Join.ROUND
        maskFilter = BlurMaskFilter(7f, BlurMaskFilter.Blur.NORMAL)
    }
    val auraGlow: ImageBitmap by lazy {
        val bitmap = Bitmap.createBitmap(256, 256, Bitmap.Config.ARGB_8888)
        val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            color = Color(0xFF00E5FF).toArgb()
            maskFilter = BlurMaskFilter(4f, BlurMaskFilter.Blur.NORMAL)
        }
        android.graphics.Canvas(bitmap).drawCircle(CORE.x, CORE.y, 21f, paint)
        bitmap.asImageBitmap()
    }

    fun reveal(progress: Float): Path {
        revealed.reset()
        measure.getSegment(0f, length * progress.coerceIn(0f, 1f), revealed, true)
        return revealed
    }

    fun signal(start: Float, dark: Boolean): ImageBitmap {
        signalPath.reset()
        val from = start.coerceIn(0f, length)
        val to = (start + BrandMotionSpec.SIGNAL_LENGTH).coerceIn(0f, length)
        measure.getSegment(from, to, signalPath, true)
        // Software blur is consistent on API 29+, where hardware mask-filter support differs.
        // The bounded buffer is reused and uploaded only while an unlock signal is actually active.
        signalBitmap.eraseColor(android.graphics.Color.TRANSPARENT)
        signalPaint.color = (if (dark) Color(0xFF2FE0FF) else Color(0xFF1FC2F0)).toArgb()
        signalCanvas.drawPath(signalPath.asAndroidPath(), signalPaint)
        return signalImage
    }

    private fun coreCircle(radius: Float): Path = Path().apply {
        addOval(Rect(CORE.x - radius, CORE.y - radius, CORE.x + radius, CORE.y + radius))
    }

    private fun annulus(outer: Float, inner: Float): Path = coreCircle(outer).apply {
        fillType = PathFillType.EvenOdd
        addPath(coreCircle(inner))
    }
}
