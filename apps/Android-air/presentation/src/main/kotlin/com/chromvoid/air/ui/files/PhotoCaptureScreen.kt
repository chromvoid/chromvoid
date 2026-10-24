package com.chromvoid.air.ui.files

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.LinkButton

public const val CAPTURE_SHUTTER_TAG: String = "capture-shutter"
public const val CAPTURE_CANCEL_TAG: String = "capture-cancel"
public const val CAPTURE_RETAKE_TAG: String = "capture-retake"
public const val CAPTURE_USE_TAG: String = "capture-use"
public const val CAPTURE_REVIEW_TAG: String = "capture-review"

/**
 * Take Photo, as iOS's camera offers it: the back camera with a shutter, then the photo just
 * taken to use or to take again. While [review] is null the [camera] shows; [ready] once it can
 * take a photo.
 */
@Composable
public fun PhotoCaptureScreen(
    review: ImageBitmap?,
    ready: Boolean,
    onShutter: () -> Unit,
    onCancel: () -> Unit,
    onRetake: () -> Unit,
    onUse: () -> Unit,
    camera: @Composable () -> Unit,
) {
    val colors = Air.colors
    Box(modifier = Modifier.fillMaxSize().background(colors.canvas)) {
        if (review == null) {
            camera()
        } else {
            Image(
                bitmap = review,
                contentDescription = stringResource(R.string.files_capture_review),
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize().safeDrawingPadding().testTag(CAPTURE_REVIEW_TAG),
            )
        }
        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(colors.canvas.copy(alpha = BAR_ALPHA))
                .safeDrawingPadding()
                .padding(horizontal = 16.dp, vertical = 20.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (review == null) {
                LinkButton(
                    stringResource(R.string.form_cancel),
                    onClick = onCancel,
                    modifier = Modifier.testTag(CAPTURE_CANCEL_TAG),
                )
                Shutter(enabled = ready, onClick = onShutter)
                // Keeps the shutter in the middle, as the camera's own bar does.
                Box(modifier = Modifier.size(SHUTTER_SIZE))
            } else {
                LinkButton(
                    stringResource(R.string.files_capture_retake),
                    onClick = onRetake,
                    modifier = Modifier.testTag(CAPTURE_RETAKE_TAG),
                )
                LinkButton(
                    stringResource(R.string.files_capture_use),
                    onClick = onUse,
                    modifier = Modifier.testTag(CAPTURE_USE_TAG),
                )
            }
        }
    }
}

@Composable
private fun Shutter(enabled: Boolean, onClick: () -> Unit) {
    val colors = Air.colors
    val label = stringResource(R.string.files_take_photo)
    Box(
        modifier = Modifier
            .size(SHUTTER_SIZE)
            .border(4.dp, colors.text, CircleShape)
            .padding(8.dp)
            .clip(CircleShape)
            .background(if (enabled) colors.text else colors.textTertiary)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label }
            .testTag(CAPTURE_SHUTTER_TAG),
    )
}

private val SHUTTER_SIZE = 72.dp
private const val BAR_ALPHA = 0.6f
