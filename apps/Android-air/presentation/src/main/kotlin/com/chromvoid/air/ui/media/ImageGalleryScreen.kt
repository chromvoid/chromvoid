package com.chromvoid.air.ui.media

import android.text.format.Formatter
import android.widget.ImageView
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBackIos
import androidx.compose.material.icons.automirrored.rounded.ArrowForwardIos
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.ActionPill
import com.chromvoid.air.ui.design.AirRow
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.DoneButton
import com.chromvoid.air.ui.design.LinkButton
import com.chromvoid.air.ui.design.PillIcon
import com.chromvoid.air.ui.design.RoundButton
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.root.CoversTabBar
import java.text.DateFormat
import java.util.Date
import java.util.Locale

public const val GALLERY_TAG: String = "gallery"
public const val GALLERY_CLOSE_TAG: String = "gallery-close"
public const val GALLERY_INFO_TAG: String = "gallery-info"
public const val GALLERY_NEXT_TAG: String = "gallery-next"
public const val GALLERY_PREVIOUS_TAG: String = "gallery-previous"
public const val GALLERY_POSITION_TAG: String = "gallery-position"
public const val GALLERY_PLAY_TAG: String = "gallery-play"
public const val IMAGE_INFO_TAG: String = "image-info"
public const val IMAGE_INFO_DONE_TAG: String = "image-info-done"
public const val IMAGE_DIMENSIONS_TAG: String = "image-dimensions"

public fun galleryImageTag(id: Long): String = "gallery-image-$id"

/**
 * The images of a folder, as the iOS gallery shows them: Done, the name and
 * information in the bar; the image, zoomed with two fingers or a double tap;
 * the way to the previous and next image and where this one is. Swiping pages
 * through them unless the image is zoomed.
 */
@Composable
public fun ImageGalleryScreen(model: ImageGalleryModel, onClose: () -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    var info by rememberSaveable { mutableStateOf(false) }
    var zoomed by remember { mutableStateOf(false) }
    CoversTabBar()
    BackHandler(onBack = { if (info) info = false else onClose() })
    val pager = rememberPagerState(initialPage = state.index.coerceAtLeast(0)) { state.items.size }
    LaunchedEffect(pager) {
        snapshotFlow { pager.settledPage }.collect { page ->
            model.state.value.items.getOrNull(page)?.let { model.select(it.id) }
        }
    }
    LaunchedEffect(state.index) {
        if (state.index >= 0 && pager.currentPage != state.index) pager.animateScrollToPage(state.index)
    }
    val colors = Air.colors
    Box(modifier = Modifier.fillMaxSize().background(colors.canvas).testTag(GALLERY_TAG)) {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth().statusBarsPadding().height(60.dp).padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                DoneButton(
                    stringResource(R.string.files_done),
                    onClick = onClose,
                    modifier = Modifier.testTag(GALLERY_CLOSE_TAG),
                )
                Text(
                    state.name,
                    style = AirType.headline,
                    color = colors.text,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
                )
                ActionPill {
                    PillIcon(
                        Icons.Outlined.Info,
                        stringResource(R.string.media_image_info),
                        onClick = { info = true },
                        enabled = state.previews[state.selected] != null,
                        modifier = Modifier.testTag(GALLERY_INFO_TAG),
                    )
                }
            }
            HorizontalPager(
                state = pager,
                userScrollEnabled = !zoomed,
                key = { page -> state.items.getOrNull(page)?.id ?: page },
                modifier = Modifier.weight(1f).fillMaxWidth(),
            ) { page ->
                val item = state.items.getOrNull(page)
                val preview = item?.let { state.previews[it.id] }
                Box(
                    modifier = Modifier.fillMaxSize().testTag(galleryImageTag(item?.id ?: -1)),
                    contentAlignment = Alignment.Center,
                ) {
                    if (preview != null) {
                        ImagePage(preview, onZoom = { zoomed = it })
                    } else {
                        Loading(null)
                    }
                }
            }
            state.issue?.let { issue ->
                Text(
                    stringResource(
                        if (issue == ImageGalleryModel.Issue.CHANGED) {
                            R.string.media_gallery_changed
                        } else {
                            R.string.files_issue_other
                        },
                    ),
                    style = AirType.footnote,
                    color = colors.textSecondary,
                    modifier = Modifier.padding(16.dp),
                )
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 24.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                RoundButton(
                    Icons.AutoMirrored.Rounded.ArrowBackIos,
                    stringResource(R.string.media_previous_image),
                    onClick = model::previous,
                    enabled = state.canGoBack,
                    iconOffset = 4.dp,
                    modifier = Modifier.testTag(GALLERY_PREVIOUS_TAG),
                )
                Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
                    if (state.loadingMore) {
                        CircularProgressIndicator(
                            color = colors.accent,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(20.dp),
                        )
                    } else if (state.index >= 0) {
                        Text(
                            "${state.index + 1} / ${state.items.size}${if (state.hasMore) "+" else ""}",
                            style = AirType.body,
                            color = colors.textSecondary,
                            modifier = Modifier.testTag(GALLERY_POSITION_TAG),
                        )
                    }
                }
                RoundButton(
                    Icons.AutoMirrored.Rounded.ArrowForwardIos,
                    stringResource(R.string.media_next_image),
                    onClick = model::next,
                    enabled = state.canGoForward,
                    modifier = Modifier.testTag(GALLERY_NEXT_TAG),
                )
            }
        }
        if (info) {
            state.previews[state.selected]?.let { ImageInfoSheet(it, onDone = { info = false }) }
        }
    }
}

/** One image of the gallery: the picture, its loading state, or why it cannot be shown. */
@Composable
private fun ImagePage(preview: ImagePreviewModel, onZoom: (Boolean) -> Unit) {
    val state by preview.state.collectAsStateWithLifecycle()
    val image = state.image
    when {
        image != null -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Zoomable(onZoom, modifier = Modifier.weight(1f)) {
                val animation = state.animation
                if (animation != null && state.playing) {
                    AndroidView(
                        factory = { context ->
                            ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_CENTER }
                        },
                        update = { it.setImageDrawable(animation) },
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    Image(
                        image.asImageBitmap(),
                        contentDescription = preview.name,
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
            if (state.animation != null) {
                ActionPill(modifier = Modifier.padding(8.dp)) {
                    PillIcon(
                        if (state.playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                        stringResource(
                            if (state.playing) R.string.media_pause_animation else R.string.media_play_animation,
                        ),
                        onClick = if (state.playing) preview::pause else preview::play,
                        modifier = Modifier.testTag(GALLERY_PLAY_TAG),
                    )
                }
            }
        }
        state.status == ImagePreviewModel.Status.FAILED -> Column(
            modifier = Modifier.padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(
                Icons.Outlined.Image,
                contentDescription = null,
                tint = Air.colors.textSecondary,
                modifier = Modifier.size(44.dp),
            )
            Text(
                stringResource(issueText(state.issue)),
                style = AirType.body,
                color = Air.colors.text,
                textAlign = TextAlign.Center,
            )
            LinkButton(stringResource(R.string.media_try_again), onClick = { preview.load() })
        }
        else -> Loading(state.placeholder?.asImageBitmap())
    }
}

@Composable
private fun Loading(placeholder: androidx.compose.ui.graphics.ImageBitmap?) {
    val label = stringResource(R.string.media_loading_image)
    Box(
        modifier = Modifier.fillMaxSize().semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        // The camera's own thumbnail stands in, softened, until the full read lands.
        if (placeholder != null) {
            Image(
                placeholder,
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize().blur(14.dp),
            )
        }
        CircularProgressIndicator(color = Air.colors.accent)
    }
}

/**
 * Pinch and double tap zoom the content; one finger pans it while zoomed and
 * is otherwise left to the pager, so swiping still turns the page.
 */
@Composable
private fun Zoomable(onZoom: (Boolean) -> Unit, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    Box(
        modifier = modifier
            .fillMaxSize()
            .clipToBounds()
            .pointerInput(Unit) {
                detectTapGestures(onDoubleTap = {
                    if (scale > 1f) {
                        scale = 1f
                        offset = Offset.Zero
                    } else {
                        scale = DOUBLE_TAP_SCALE
                    }
                    onZoom(scale > 1f)
                })
            }
            .pointerInput(Unit) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    do {
                        val event = awaitPointerEvent()
                        val fingers = event.changes.count { it.pressed }
                        if (fingers >= 2 || scale > 1f) {
                            scale = (scale * event.calculateZoom()).coerceIn(1f, MAXIMUM_SCALE)
                            offset = if (scale <= 1f) Offset.Zero else offset + event.calculatePan()
                            onZoom(scale > 1f)
                            event.changes.forEach { if (it.positionChanged()) it.consume() }
                        }
                    } while (event.changes.any { it.pressed })
                }
            }
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                translationX = offset.x
                translationY = offset.y
            },
        contentAlignment = Alignment.Center,
    ) {
        content()
    }
}

/** Everything known about the open image: the catalog's facts, its pixels and the camera's records. */
@Composable
public fun ImageInfoSheet(preview: ImagePreviewModel, onDone: () -> Unit) {
    val state by preview.state.collectAsStateWithLifecycle()
    LaunchedEffect(preview) { preview.loadDetails() }
    val context = LocalContext.current
    val details = state.details
    val facts = preview.facts
    val dates = remember { DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT) }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Air.colors.canvas)
            .pointerInput(Unit) { detectTapGestures {} }
            .testTag(IMAGE_INFO_TAG),
    ) {
        AirScreen(
            title = stringResource(R.string.media_image_info),
            largeTitle = false,
            leading = {
                DoneButton(
                    stringResource(R.string.files_done),
                    onClick = onDone,
                    modifier = Modifier.testTag(IMAGE_INFO_DONE_TAG),
                )
            },
        ) {
            item(key = "name") {
                AirSection(header = stringResource(R.string.files_info_name)) { AirRow(title = preview.name) }
            }
            facts?.path?.let { path ->
                item(key = "location") {
                    AirSection(header = stringResource(R.string.files_info_location)) { AirRow(title = path) }
                }
            }
            item(key = "image") {
                AirSection(header = stringResource(R.string.media_image)) {
                    val width = details?.pixelWidth
                    val height = details?.pixelHeight
                    AirRow(
                        title = stringResource(R.string.media_dimensions),
                        value = if (width != null && height != null) {
                            "$width × $height"
                        } else {
                            stringResource(R.string.media_loading)
                        },
                        modifier = Modifier.testTag(IMAGE_DIMENSIONS_TAG),
                    )
                    if (facts != null) {
                        RowDivider()
                        AirRow(
                            title = stringResource(R.string.files_info_size),
                            value = Formatter.formatFileSize(context, facts.size),
                        )
                        facts.mimeType?.let {
                            RowDivider()
                            AirRow(title = stringResource(R.string.files_info_type), value = it)
                        }
                    }
                }
            }
            item(key = "dates") {
                AirSection(header = stringResource(R.string.media_dates)) {
                    details?.taken?.let {
                        AirRow(title = stringResource(R.string.media_taken), value = dates.format(Date(it)))
                        RowDivider()
                    }
                    if (facts != null) {
                        AirRow(
                            title = stringResource(R.string.media_added),
                            value = dates.format(Date(facts.createdAt)),
                        )
                        if (facts.updatedAt != facts.createdAt) {
                            RowDivider()
                            AirRow(
                                title = stringResource(R.string.media_modified),
                                value = dates.format(Date(facts.updatedAt)),
                            )
                        }
                    }
                }
            }
            if (details != null && details.hasCamera) {
                item(key = "camera") { CameraSection(details) }
            }
            val latitude = details?.latitude
            val longitude = details?.longitude
            if (latitude != null && longitude != null) {
                item(key = "place") {
                    AirSection(header = stringResource(R.string.media_place)) {
                        AirRow(
                            title = stringResource(R.string.media_coordinates),
                            value = coordinates(latitude, longitude),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CameraSection(details: ImageDetails) {
    AirSection(header = stringResource(R.string.media_camera)) {
        val rows = buildList {
            listOfNotNull(details.cameraMake, details.cameraModel).joinToString(" ").takeIf { it.isNotEmpty() }
                ?.let { add(R.string.media_device to it) }
            details.lens?.let { add(R.string.media_lens to it) }
            listOfNotNull(
                details.focalLength?.let { "${number(it)} mm" },
                details.fNumber?.let { "ƒ/${number(it)}" },
                details.exposureTime?.let(::exposure),
                details.iso?.let { "ISO $it" },
            ).joinToString(" · ").takeIf { it.isNotEmpty() }?.let { add(R.string.media_exposure to it) }
            details.software?.let { add(R.string.media_software to it) }
        }
        rows.forEachIndexed { index, (label, value) ->
            if (index > 0) RowDivider()
            AirRow(title = stringResource(label), value = value)
        }
    }
}

private fun issueText(issue: ImagePreviewModel.Issue?): Int = when (issue) {
    ImagePreviewModel.Issue.TOO_LARGE -> R.string.media_image_too_large
    ImagePreviewModel.Issue.CHANGED -> R.string.media_image_changed
    ImagePreviewModel.Issue.UNDECODABLE, null -> R.string.media_image_undecodable
    ImagePreviewModel.Issue.FAILED -> R.string.files_issue_other
}

private fun number(value: Double): String =
    if (value == Math.rint(value)) value.toLong().toString() else String.format(Locale.US, "%.1f", value)

private fun exposure(seconds: Double): String =
    if (seconds >= 1) "${number(seconds)} s" else "1/${Math.round(1 / seconds)} s"

private fun coordinates(latitude: Double, longitude: Double): String =
    String.format(Locale.US, "%.5f", kotlin.math.abs(latitude)) + (if (latitude < 0) " S" else " N") + ", " +
        String.format(Locale.US, "%.5f", kotlin.math.abs(longitude)) + (if (longitude < 0) " W" else " E")

private const val DOUBLE_TAP_SCALE = 2.5f
private const val MAXIMUM_SCALE = 5f
