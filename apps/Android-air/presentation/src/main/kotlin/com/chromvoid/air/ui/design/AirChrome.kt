package com.chromvoid.air.ui.design

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBackIos
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.root.LocalRootChrome

/**
 * One screen of a stack, laid out as the iOS client lays out a navigation
 * screen: a floating bar with a round back button on the left and a pill of
 * actions on the right, a large title that scrolls with the content, and the
 * content on the brand canvas. When the large title scrolls away, or the
 * screen has none, the title sits small in the bar, below its actions when space is limited.
 */
@Composable
public fun AirScreen(
    title: String,
    modifier: Modifier = Modifier,
    largeTitle: Boolean = true,
    onBack: (() -> Unit)? = null,
    backTag: String? = null,
    backDescription: String = "",
    /** Replaces the back button, for a screen shown as a sheet ("Done"). */
    leading: (@Composable () -> Unit)? = null,
    actions: (@Composable RowScope.() -> Unit)? = null,
    state: LazyListState = rememberLazyListState(),
    contentPadding: PaddingValues = PaddingValues(bottom = 24.dp),
    listTag: String? = null,
    content: LazyListScope.() -> Unit,
) {
    val colors = Air.colors
    val scrolled by remember(state) {
        derivedStateOf { state.firstVisibleItemIndex > 0 || state.firstVisibleItemScrollOffset > 40 }
    }
    BoxWithConstraints(
        modifier = modifier.fillMaxSize().background(colors.canvas),
        contentAlignment = Alignment.TopCenter,
    ) {
        val expanded = LocalAirWindowExpanded.current ?: (maxWidth >= EXPANDED_WIDTH)
        Column(
            modifier = Modifier
                .then(if (expanded) Modifier.widthIn(max = 640.dp) else Modifier)
                .fillMaxSize(),
        ) {
            AirTopBar(
                title = title.takeIf { !largeTitle || scrolled },
                modifier = Modifier.background(colors.canvas),
                leading = {
                    when {
                        leading != null -> leading()
                        onBack != null -> RoundButton(
                            icon = Icons.AutoMirrored.Rounded.ArrowBackIos,
                            description = backDescription,
                            onClick = onBack,
                            modifier = if (backTag != null) Modifier.testTag(backTag) else Modifier,
                            iconOffset = 3.dp,
                        )
                    }
                },
                actions = actions,
            )
            LazyColumn(
                state = state,
                contentPadding = contentPadding,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .then(if (listTag != null) Modifier.testTag(listTag) else Modifier),
            ) {
                if (largeTitle) {
                    item(key = "air-large-title") {
                        Text(
                            title,
                            style = AirType.largeTitle,
                            color = colors.text,
                            modifier = Modifier
                                .padding(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 12.dp)
                                .semantics { heading() },
                        )
                    }
                }
                content()
                item(key = "air-navigation-bars-clearance") {
                    // Size modifiers use only the insets left after an ancestor (such as imePadding).
                    Spacer(Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars))
                }
            }
        }
    }
}

/**
 * Shared chrome for list screens and documents. Actions keep their natural width; a title that
 * cannot fit between them moves below. At large font sizes the two action groups can wrap too.
 * The parent reserves the measured height, so neither titles nor content sit behind the bar.
 */
@Composable
public fun AirTopBar(
    title: String?,
    modifier: Modifier = Modifier,
    leading: (@Composable () -> Unit)? = null,
    actions: (@Composable RowScope.() -> Unit)? = null,
) {
    Layout(
        modifier = modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 16.dp),
        content = {
            Box(modifier = Modifier.widthIn(min = 44.dp)) { leading?.invoke() }
            Box(contentAlignment = Alignment.Center) {
                if (title != null) {
                    Text(
                        title,
                        style = AirType.headline,
                        color = Air.colors.text,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.semantics { heading() },
                    )
                }
            }
            Box(modifier = Modifier.widthIn(min = 44.dp), contentAlignment = Alignment.CenterEnd) {
                if (actions != null) ActionPill(content = actions)
            }
        },
    ) { measurables, constraints ->
        val width = constraints.maxWidth
        val loose = constraints.copy(minWidth = 0, minHeight = 0)
        val leadingPlaceable = measurables[0].measure(loose)
        val actionsPlaceable = measurables[2].measure(loose)
        val gap = 8.dp.roundToPx()
        val verticalPadding = 6.dp.roundToPx()
        val minimumHeight = 60.dp.roundToPx()
        val wrapActions = leadingPlaceable.width + actionsPlaceable.width + gap > width
        val titleWidth = measurables[1].maxIntrinsicWidth(Constraints.Infinity)
        val inlineTitle = !wrapActions &&
            titleWidth + leadingPlaceable.width + actionsPlaceable.width + gap * 2 <= width
        val titlePlaceable = measurables[1].measure(
            loose.copy(maxWidth = if (inlineTitle) {
                (width - leadingPlaceable.width - actionsPlaceable.width - gap * 2).coerceAtLeast(0)
            } else {
                width
            }),
        )
        val firstRowHeight = maxOf(
            minimumHeight,
            leadingPlaceable.height + verticalPadding * 2,
            if (wrapActions) 0 else actionsPlaceable.height + verticalPadding * 2,
            if (inlineTitle) titlePlaceable.height + verticalPadding * 2 else 0,
        )
        val actionsRowHeight = if (wrapActions) {
            maxOf(minimumHeight, actionsPlaceable.height + verticalPadding * 2)
        } else {
            0
        }
        val controlsHeight = firstRowHeight + actionsRowHeight
        val titleRowHeight = if (title != null && !inlineTitle) titlePlaceable.height + gap else 0
        layout(width, controlsHeight + titleRowHeight) {
            leadingPlaceable.placeRelative(0, (firstRowHeight - leadingPlaceable.height) / 2)
            val actionsY = if (wrapActions) {
                firstRowHeight + (actionsRowHeight - actionsPlaceable.height) / 2
            } else {
                (firstRowHeight - actionsPlaceable.height) / 2
            }
            actionsPlaceable.placeRelative(width - actionsPlaceable.width, actionsY)
            val titleX = if (inlineTitle) {
                leadingPlaceable.width + (width - leadingPlaceable.width - actionsPlaceable.width -
                    titlePlaceable.width) / 2
            } else {
                (width - titlePlaceable.width) / 2
            }
            titlePlaceable.placeRelative(
                titleX,
                if (inlineTitle) (firstRowHeight - titlePlaceable.height) / 2 else controlsHeight,
            )
        }
    }
}

/** A floating white capsule holding a screen's actions, as the iOS 26 bar draws them. */
@Composable
public fun ActionPill(modifier: Modifier = Modifier, content: @Composable RowScope.() -> Unit) {
    Row(
        modifier = modifier
            .shadow(10.dp, CircleShape, clip = false, ambientColor = ShadowTint, spotColor = ShadowTint)
            .clip(CircleShape)
            .background(Air.colors.card)
            .padding(horizontal = 4.dp)
            .heightIn(min = 48.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(0.dp),
        content = content,
    )
}

/** One icon action inside an [ActionPill]. */
@Composable
public fun PillIcon(
    icon: ImageVector,
    description: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    Box(
        modifier = modifier
            .size(48.dp)
            .clip(CircleShape)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = if (enabled) Air.colors.text else Air.colors.textTertiary,
            modifier = Modifier.size(24.dp),
        )
    }
}

/** One text action inside an [ActionPill] ("Edit", "Done", "Save"). */
@Composable
public fun PillText(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    emphasized: Boolean = false,
) {
    Box(
        modifier = modifier
            .heightIn(min = 48.dp)
            .clip(CircleShape)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            style = if (emphasized) AirType.headline else AirType.body,
            color = when {
                !enabled -> Air.colors.textTertiary
                emphasized -> Air.colors.accent
                else -> Air.colors.text
            },
        )
    }
}

/** A floating round button: the back arrow, or a single action like the lock. */
@Composable
public fun RoundButton(
    icon: ImageVector,
    description: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    iconOffset: androidx.compose.ui.unit.Dp = 0.dp,
    enabled: Boolean = true,
) {
    Box(
        modifier = modifier
            .size(48.dp)
            .shadow(10.dp, CircleShape, clip = false, ambientColor = ShadowTint, spotColor = ShadowTint)
            .clip(CircleShape)
            .background(Air.colors.card)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = if (enabled) Air.colors.text else Air.colors.textTertiary,
            modifier = Modifier.padding(start = iconOffset).size(22.dp),
        )
    }
}

/** The "Done" of a sheet-like screen, in the same floating capsule. */
@Composable
public fun DoneButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    ActionPill(modifier = modifier) { PillText(text, onClick) }
}

internal val ShadowTint = androidx.compose.ui.graphics.Color(0x33000000)

/**
 * Clears the floating tab bar only while it is visible. AirScreen owns system navigation insets.
 */
@Composable
public fun TabBarClearance() {
    val expanded = LocalAirWindowExpanded.current ?: (LocalConfiguration.current.screenWidthDp.dp >= EXPANDED_WIDTH)
    val showNavigation = LocalRootChrome.current?.covering == 0
    Spacer(modifier = Modifier.height(if (!expanded && showNavigation) 96.dp else 0.dp))
}

internal val PillShape = RoundedCornerShape(50)
