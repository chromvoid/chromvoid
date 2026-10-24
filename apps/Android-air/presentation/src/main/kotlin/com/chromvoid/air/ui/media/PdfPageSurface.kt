package com.chromvoid.air.ui.media

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateCentroid
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.text
import androidx.compose.ui.semantics.traversalIndex
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.roundToInt
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

public fun pdfTextTag(index: Int): String = "pdf-text-$index"

public fun pdfLinkTag(page: Int, index: Int): String = "pdf-link-$page-$index"

/** A fitted page or an overscanned visible region, in pixels at [pageWidth]. */
private data class PdfRegion(val pageWidth: Int, val left: Int, val top: Int, val width: Int, val height: Int)

private data class PdfRaster(val region: PdfRegion, val image: ImageBitmap)

private const val SHARP_RENDER_DELAY_MILLIS = 120L

@Composable
internal fun PdfPageSurface(
    model: PdfPreviewModel,
    state: PdfPreviewModel.State,
    index: Int,
    pageWidth: Int,
    pageHeight: Int,
    width: Int,
    list: LazyListState,
    matches: List<PdfPreviewModel.Match>,
    shownMatch: PdfPreviewModel.Match?,
) {
    val height = width.toFloat() * pageHeight / pageWidth.coerceAtLeast(1)
    val viewport = state.viewport(index)
    val visible by remember(list, index) {
        derivedStateOf {
            val layout = list.layoutInfo
            val item = layout.visibleItemsInfo.firstOrNull { it.index == index }
            if (item == null) 0 to 0 else {
                val top = (layout.viewportStartOffset - item.offset).coerceIn(0, item.size)
                val bottom = (layout.viewportEndOffset - item.offset).coerceIn(top, item.size)
                top to bottom - top
            }
        }
    }
    val (visibleTop, visibleHeight) = visible
    val currentVisible by rememberUpdatedState(visible)
    val currentViewport by rememberUpdatedState(viewport)
    var content by remember(model, index) { mutableStateOf<PdfPageContent?>(null) }
    var fitted by remember(model, index) { mutableStateOf<PdfRaster?>(null) }
    var sharp by remember(model, index) { mutableStateOf<PdfRaster?>(null) }
    LaunchedEffect(model, index) { content = model.content(index) }
    val fittedRegion = PdfRegion(width, 0, 0, width, height.roundToInt().coerceAtLeast(1))
    LaunchedEffect(model, index, fittedRegion) {
        fitted = model.renderPage(index, width)?.let { PdfRaster(fittedRegion, it.asImageBitmap()) }
    }
    val region = if (viewport.zoom > 1f && visibleHeight > 0) {
        val scaledWidth = (width * viewport.zoom).roundToInt()
        val scaledHeight = (height * viewport.zoom).roundToInt()
        val margin = width / 8
        val left = (floor(viewport.panX).toInt() - margin).coerceAtLeast(0)
        val top = (floor(viewport.panY + visibleTop).toInt() - margin).coerceAtLeast(0)
        val right = (ceil(viewport.panX + width).toInt() + margin).coerceAtMost(scaledWidth)
        val bottom = (ceil(viewport.panY + visibleTop + visibleHeight).toInt() + margin).coerceAtMost(scaledHeight)
        PdfRegion(scaledWidth, left, top, right - left, bottom - top)
    } else null
    LaunchedEffect(model, index, region) {
        if (region == null) {
            sharp = null
        } else {
            // Native PDF rendering cannot be interrupted. Coalesce motion before acquiring its mutex.
            delay(SHARP_RENDER_DELAY_MILLIS)
            val bitmap = model.renderRegion(
                index, region.pageWidth, region.left, region.top, region.width, region.height,
            )
            sharp = bitmap?.let { PdfRaster(region, it.asImageBitmap()) }
        }
    }
    val scope = rememberCoroutineScope()
    val opener = LocalUriHandler.current
    val label = stringResource(R.string.pdf_page, index + 1, state.pageCount)
    val description = when {
        !state.readsText -> "$label, ${stringResource(R.string.pdf_text_unavailable)}"
        content == null -> "$label, ${stringResource(R.string.pdf_loading)}"
        content?.text.isNullOrBlank() -> "$label, ${stringResource(R.string.pdf_no_text)}"
        else -> label
    }
    val zoomIn = stringResource(R.string.pdf_zoom_in)
    val fit = stringResource(R.string.pdf_fit_width)
    val previous = stringResource(R.string.pdf_previous_page)
    val next = stringResource(R.string.pdf_next_page)
    val zoomState = stringResource(R.string.pdf_zoom, (viewport.zoom * 100).roundToInt())
    Box(
        modifier = Modifier
            .padding(horizontal = 16.dp)
            .fillMaxWidth()
            .aspectRatio(pageWidth.toFloat() / pageHeight.coerceAtLeast(1))
            .clipToBounds()
            .background(Color.White)
            .semantics {
                contentDescription = description
                stateDescription = zoomState
                isTraversalGroup = true
                customActions = buildList {
                    if (viewport.zoom < PdfPreviewModel.MAXIMUM_ZOOM) add(CustomAccessibilityAction(zoomIn) {
                        model.transformPage(
                            index, 2f, 0f, 0f, width / 2f, visibleTop + visibleHeight / 2f,
                            width.toFloat(), height, visibleTop.toFloat(), visibleHeight.toFloat(),
                        )
                        true
                    })
                    if (viewport.zoom > 1f) add(CustomAccessibilityAction(fit) {
                        model.toggleZoom(index, 0f, 0f, width.toFloat(), height)
                        true
                    })
                    if (index > 0) add(CustomAccessibilityAction(previous) {
                        model.goToPage(index - 1)
                        true
                    })
                    if (index + 1 < state.pageCount) add(CustomAccessibilityAction(next) {
                        model.goToPage(index + 1)
                        true
                    })
                }
            }
            .pointerInput(model, index, width, height) {
                detectTapGestures(
                    onDoubleTap = { at ->
                        model.toggleZoom(
                            index, at.x, at.y, width.toFloat(), height,
                            currentVisible.first.toFloat(), currentVisible.second.toFloat(),
                        )
                    },
                    onTap = { at ->
                        val current = currentViewport
                        val scale = width * current.zoom / pageWidth
                        scope.launch {
                            model.linkAt(index, (at.x + current.panX) / scale, (at.y + current.panY) / scale)
                                ?.let(opener::openUri)
                        }
                    },
                )
            }
            .pointerInput(model, index, width, height) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    do {
                        val event = awaitPointerEvent()
                        if (event.changes.count { it.pressed } >= 2 || currentViewport.zoom > 1f) {
                            val pan = event.calculatePan()
                            val center = event.calculateCentroid(useCurrent = false)
                            if (center != Offset.Unspecified) {
                                model.transformPage(
                                    index, event.calculateZoom(), pan.x, pan.y, center.x, center.y,
                                    width.toFloat(), height,
                                    currentVisible.first.toFloat(), currentVisible.second.toFloat(),
                                )
                                event.changes.forEach { if (it.positionChanged()) it.consume() }
                            }
                        }
                    } while (event.changes.any { it.pressed })
                }
            }
            .testTag(pdfPageTag(index)),
        contentAlignment = Alignment.Center,
    ) {
        val fittedPage = fitted
        val sharpRegion = sharp.takeIf { viewport.zoom > 1f }
        val ready = if (viewport.zoom == 1f) fittedPage != null else region != null && sharpRegion?.region == region
        if (fittedPage != null || sharpRegion != null) {
            val colors = Air.colors
            Canvas(
                modifier = Modifier.fillMaxSize().then(
                    if (ready) Modifier.testTag(pdfDrawnTag(index)) else Modifier,
                ),
            ) {
                // The full fitted page covers newly exposed edges while the previous sharp region moves.
                fittedPage?.let { drawRaster(it, width, viewport) }
                sharpRegion?.let { drawRaster(it, width, viewport) }
                val scale = width * viewport.zoom / pageWidth
                matches.filter { it.page == index }.forEach { match ->
                    val tint = if (match == shownMatch) colors.accent else colors.warning
                    match.rects.forEach { rect ->
                        drawRect(
                            color = tint.copy(alpha = if (match == shownMatch) 0.45f else 0.35f),
                            topLeft = Offset(rect.left * scale - viewport.panX, rect.top * scale - viewport.panY),
                            size = Size((rect.right - rect.left) * scale, (rect.bottom - rect.top) * scale),
                        )
                    }
                }
            }
        } else if (visibleHeight > 0) {
            CircularProgressIndicator(color = Air.colors.accent, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
        }
        content?.let { page ->
            if (page.text.isNotBlank()) Box(
                modifier = Modifier.fillMaxSize().testTag(pdfTextTag(index)).semantics {
                    text = AnnotatedString(page.text)
                    traversalIndex = 0f
                },
            )
            PdfLinkNodes(model, index, page.links, width, pageWidth, viewport, visibleTop, visibleHeight)
        }
    }
}

private fun DrawScope.drawRaster(raster: PdfRaster, width: Int, viewport: PdfViewport) {
    val ratio = width * viewport.zoom / raster.region.pageWidth
    drawImage(
        raster.image,
        dstOffset = IntOffset(
            (raster.region.left * ratio - viewport.panX).roundToInt(),
            (raster.region.top * ratio - viewport.panY).roundToInt(),
        ),
        dstSize = IntSize(
            (raster.region.width * ratio).roundToInt().coerceAtLeast(1),
            (raster.region.height * ratio).roundToInt().coerceAtLeast(1),
        ),
    )
}

/** Semantics-only targets leave pointer taps and multi-touch with the page's gesture handlers. */
@Composable
private fun BoxScope.PdfLinkNodes(
    model: PdfPreviewModel,
    page: Int,
    links: List<PdfLink>,
    width: Int,
    pageWidth: Int,
    viewport: PdfViewport,
    visibleTop: Int,
    visibleHeight: Int,
) {
    val density = LocalDensity.current
    val opener = LocalUriHandler.current
    val scale = width * viewport.zoom / pageWidth
    links.forEachIndexed { index, link ->
        val name = when (link) {
            is PdfLink.External -> link.uri
            is PdfLink.Page -> stringResource(R.string.pdf_go_to_page, link.index + 1)
        }
        val left = (link.bounds.minOfOrNull { it.left } ?: 0f) * scale - viewport.panX
        val top = (link.bounds.minOfOrNull { it.top } ?: 0f) * scale - viewport.panY
        val right = (link.bounds.maxOfOrNull { it.right } ?: pageWidth.toFloat()) * scale - viewport.panX
        val bottom = (link.bounds.maxOfOrNull { it.bottom } ?: 1f) * scale - viewport.panY
        val clippedLeft = left.coerceIn(0f, width.toFloat())
        val clippedRight = right.coerceIn(clippedLeft, width.toFloat())
        val clippedTop = top.coerceIn(visibleTop.toFloat(), (visibleTop + visibleHeight).toFloat())
        val clippedBottom = bottom.coerceIn(clippedTop, (visibleTop + visibleHeight).toFloat())
        if (clippedRight <= clippedLeft || clippedBottom <= clippedTop) return@forEachIndexed
        Box(
            modifier = Modifier
                .align(Alignment.TopStart)
                .offset { IntOffset(clippedLeft.roundToInt(), clippedTop.roundToInt()) }
                .size(
                    with(density) { (clippedRight - clippedLeft).coerceAtLeast(1f).toDp() },
                    with(density) { (clippedBottom - clippedTop).coerceAtLeast(1f).toDp() },
                )
                .testTag(pdfLinkTag(page, index))
                .semantics {
                    contentDescription = name
                    role = Role.Button
                    traversalIndex = index + 1f
                    onClick {
                        model.activateLink(link)?.let(opener::openUri)
                        true
                    }
                },
        )
    }
}
