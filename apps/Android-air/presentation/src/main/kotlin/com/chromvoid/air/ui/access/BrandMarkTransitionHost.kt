package com.chromvoid.air.ui.access

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.absoluteOffset
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.ui.AirSessionState
import kotlin.math.roundToInt

public const val BRAND_MARK_TAG: String = "brand-mark"
public const val BRAND_MARK_RETAINED_TAG: String = "brand-mark-retained"

/** Keeps only the decorative mark alive after navigation; entry fields and handlers leave immediately. */
@Composable
public fun BrandMarkTransitionHost(
    model: AccessViewModel,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val placementState = remember { BrandMarkPlacementState() }
    val motion by model.unlockMotion.collectAsStateWithLifecycle()
    val actual by model.state.collectAsStateWithLifecycle()
    val open = motion as? BrandUnlockMotion.Open
    val placement = placementState.placement
    val owner = remember(open?.startedAt) { placement?.takeIf { it.attached }?.owner }
    val retained = open?.transitionStarted == true && actual is AirSessionState.Unlocked &&
        owner != null && placement?.owner === owner
    var origin by remember { mutableStateOf(Offset.Zero) }
    Box(modifier.fillMaxSize().onGloballyPositioned { origin = it.positionInRoot() }) {
        CompositionLocalProvider(
            LocalBrandMarkTransition provides BrandMarkTransitionScope(placementState, if (retained) owner else null),
        ) {
            content()
        }
        if (retained) {
            val size = with(LocalDensity.current) { placement.size.width.toDp() }
            val visible = placement.visibleBounds.translate(-placement.position)
            Box(
                Modifier.absoluteOffset {
                    IntOffset(
                        (placement.position.x - origin.x).roundToInt(),
                        (placement.position.y - origin.y).roundToInt(),
                    )
                }.testTag(BRAND_MARK_RETAINED_TAG),
            ) {
                BrandMarkScene(
                    size = size,
                    modifier = Modifier.drawWithContent {
                        clipRect(visible.left, visible.top, visible.right, visible.bottom) {
                            this@drawWithContent.drawContent()
                        }
                    },
                    motion = motion,
                    entry = placement.entry,
                    enteredAt = placement.enteredAt,
                    onReducedMotionChanged = model::setReducedMotion,
                    exiting = true,
                )
            }
        }
    }
}

internal val LocalBrandMarkTransition = staticCompositionLocalOf<BrandMarkTransitionScope?> { null }

internal data class BrandMarkTransitionScope(val state: BrandMarkPlacementState, val retainedOwner: Any?)

internal data class BrandMarkPlacement(
    val owner: Any,
    val position: Offset,
    val size: IntSize,
    val visibleBounds: Rect,
    val entry: BrandEntry,
    val enteredAt: Long,
    val attached: Boolean = true,
)

@Stable
internal class BrandMarkPlacementState {
    var placement: BrandMarkPlacement? by mutableStateOf(null)
        private set

    fun place(value: BrandMarkPlacement) {
        placement = value
    }

    fun detach(owner: Any) {
        placement?.takeIf { it.owner === owner }?.let { placement = it.copy(attached = false) }
    }
}
