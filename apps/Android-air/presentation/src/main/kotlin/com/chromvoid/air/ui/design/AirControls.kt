package com.chromvoid.air.ui.design

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Cancel
import androidx.compose.material.icons.rounded.CreditCard
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air

/**
 * The vault's search field: a capsule in the secondary surface, a ring on
 * focus instead of a fill change, a clear button while it holds text.
 */
@Composable
public fun AirSearchField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    fieldModifier: Modifier = Modifier,
    clearDescription: String = "",
    clearModifier: Modifier = Modifier,
) {
    val colors = Air.colors
    var focused by remember { mutableStateOf(false) }
    val ring by animateColorAsState(if (focused) colors.accent.copy(alpha = 0.5f) else colors.accent.copy(alpha = 0f))
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .height(44.dp)
            .clip(CircleShape)
            .background(colors.surfaceSecondary)
            .border(BorderStroke(1.5.dp, ring), CircleShape)
            .padding(start = 14.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            Icons.Rounded.Search,
            contentDescription = null,
            tint = if (focused) colors.accent else colors.textSecondary,
            modifier = Modifier.size(22.dp),
        )
        Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
            if (value.isEmpty()) Text(placeholder, style = AirType.body, color = colors.textSecondary, maxLines = 1)
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                singleLine = true,
                textStyle = AirType.body.copy(color = colors.text),
                cursorBrush = SolidColor(colors.accent),
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.None,
                    autoCorrectEnabled = false,
                    imeAction = ImeAction.Search,
                ),
                keyboardActions = KeyboardActions(),
                modifier = fieldModifier
                    .fillMaxWidth()
                    .onFocusChanged { focused = it.isFocused }
                    .semantics { contentDescription = placeholder },
            )
        }
        if (value.isNotEmpty()) {
            Box(
                modifier = clearModifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .clickable(role = Role.Button) { onValueChange("") }
                    .semantics { contentDescription = clearDescription },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Rounded.Cancel,
                    contentDescription = null,
                    tint = colors.textSecondary,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
    }
}

/**
 * The picture of a credential: an initial-letter badge in the brand container,
 * a card symbol for a payment card, a key when there is no title.
 */
@Composable
public fun Monogram(title: String, entryType: String, modifier: Modifier = Modifier, size: Dp = 44.dp) {
    val colors = Air.colors
    val initial = title.trim().firstOrNull()?.uppercaseChar()
    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(size * 0.28f))
            .background(colors.container),
        contentAlignment = Alignment.Center,
    ) {
        when {
            entryType == "payment_card" -> Icon(
                Icons.Rounded.CreditCard,
                contentDescription = null,
                tint = colors.onContainer,
                modifier = Modifier.size(size * 0.5f),
            )
            initial != null -> Text(
                initial.toString(),
                color = colors.onContainer,
                fontSize = (size.value * 0.46f).sp,
                fontWeight = FontWeight.SemiBold,
            )
            else -> Icon(
                Icons.Rounded.Key,
                contentDescription = null,
                tint = colors.onContainer,
                modifier = Modifier.size(size * 0.5f),
            )
        }
    }
}

/**
 * A collection at the vault root: symbol in the brand container, the count as
 * the main figure, the name below; an empty collection shows a quiet dash.
 */
@Composable
public fun CollectionTile(
    title: String,
    icon: ImageVector,
    count: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = Air.colors
    val empty = count == null || count == "0"
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(22.dp))
            .background(colors.card)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = if (count != null) "$title, $count" else title }
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Box(
                modifier = Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(colors.container),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = null, tint = colors.onContainer, modifier = Modifier.size(21.dp))
            }
            Box(modifier = Modifier.weight(1f))
            Text(
                if (empty) "—" else count.orEmpty(),
                style = AirType.title2.copy(fontWeight = if (empty) FontWeight.Normal else FontWeight.SemiBold),
                color = if (empty) colors.textTertiary else colors.text,
            )
        }
        Text(title, style = AirType.body.copy(fontWeight = FontWeight.Medium), color = colors.text)
    }
}

/**
 * One field of a record: caption above the value, a trailing strip of 48 dp
 * actions so copy is always one tap away.
 */
@Composable
public fun DetailRow(
    label: String?,
    modifier: Modifier = Modifier,
    actions: @Composable RowScope.() -> Unit = {},
    value: @Composable () -> Unit,
) {
    Row(
        modifier = modifier.fillMaxWidth().heightIn(
            min = 64.dp,
        ).padding(start = 20.dp, end = 8.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            if (label != null) Text(label, style = AirType.footnote, color = Air.colors.textSecondary)
            value()
        }
        Row(verticalAlignment = Alignment.CenterVertically, content = actions)
    }
}

/** One accent action of a row's trailing strip. */
@Composable
public fun RowAction(
    icon: ImageVector,
    description: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    tint: androidx.compose.ui.graphics.Color? = null,
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
            tint = if (enabled) tint ?: Air.colors.accent else Air.colors.textTertiary,
            modifier = Modifier.size(24.dp),
        )
    }
}

/** Seconds left, or a stable, silent accessibility node while the next code is being requested. */
@Composable
public fun CountdownRing(secondsLeft: Long?, period: Long, modifier: Modifier = Modifier) {
    val colors = Air.colors
    val description = if (secondsLeft != null) {
        pluralStringResource(R.plurals.code_expires_in, secondsLeft.toInt(), secondsLeft)
    } else {
        stringResource(R.string.code_updating)
    }
    Box(
        modifier = modifier.size(44.dp).clearAndSetSemantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        if (secondsLeft != null) {
            val late = secondsLeft <= 5
            val fraction = (secondsLeft.toFloat() / period.coerceAtLeast(1).toFloat()).coerceIn(0f, 1f)
            val track = colors.textTertiary
            val arc = if (late) colors.warning else colors.accent
            Canvas(modifier = Modifier.size(38.dp)) {
                val stroke = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round)
                drawArc(track, 0f, 360f, useCenter = false, style = Stroke(width = 3.dp.toPx()))
                drawArc(arc, -90f, 360f * fraction, useCenter = false, style = stroke)
            }
            Text(
                secondsLeft.toString(),
                style = AirType.caption.copy(fontWeight = FontWeight.SemiBold),
                color = if (late) colors.warning else colors.textSecondary,
            )
        }
    }
}

/** "123 456" and "1234 5678" read faster than an unbroken run of digits. */
public fun groupedCode(code: String): String {
    if (code.length < 6 || code.length % 2 != 0) return code
    return code.substring(0, code.length / 2) + " " + code.substring(code.length / 2)
}

/** The filled primary control: a full-width capsule in the button colour. */
@Composable
public fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    busy: Boolean = false,
) {
    val colors = Air.colors
    val inProgress = stringResource(R.string.common_in_progress)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(54.dp)
            .clip(CircleShape)
            .background(if (enabled) colors.button else colors.button.copy(alpha = 0.4f))
            .clickable(enabled = enabled && !busy, role = Role.Button, onClick = onClick)
            .semantics { if (busy) stateDescription = inProgress },
        contentAlignment = Alignment.Center,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (busy) {
                CircularProgressIndicator(
                    color = colors.onButton,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(22.dp).clearAndSetSemantics {},
                )
            }
            Text(text, style = AirType.headline, color = colors.onButton)
        }
    }
}

/** The tonal companion of [PrimaryButton], as an iOS bordered button: the second action beside a primary one. */
@Composable
public fun SecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = Air.colors
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(54.dp)
            .clip(CircleShape)
            .background(colors.container.copy(alpha = if (enabled) 1f else 0.4f))
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = AirType.headline, color = if (enabled) colors.onContainer else colors.textTertiary)
    }
}

/** A plain action in the accent, as an iOS borderless button: for the rare path beside a primary one. */
@Composable
public fun LinkButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    style: TextStyle = AirType.body,
) {
    val colors = Air.colors
    Box(
        modifier = modifier
            // Android's smallest touch target; iOS draws the same button at 44 pt.
            .heightIn(min = MIN_TOUCH)
            .clip(RoundedCornerShape(8.dp))
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = style, color = if (enabled) colors.accent else colors.textTertiary)
    }
}

/** The sort-and-filter control of a section header: "Name ≡" in the accent. */
@Composable
public fun HeaderControl(
    text: String,
    icon: ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    description: String = text,
) {
    Row(
        modifier = modifier
            .heightIn(min = MIN_TOUCH)
            .clip(CircleShape)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = description }
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(text, style = AirType.subheadline.copy(fontWeight = FontWeight.Medium), color = Air.colors.accent)
        Icon(icon, contentDescription = null, tint = Air.colors.accent, modifier = Modifier.size(20.dp))
    }
}

/** A short confirmation floating above the tab bar, as the iOS toast. */
@Composable
public fun AirToast(text: String, icon: ImageVector, modifier: Modifier = Modifier, tag: String? = null) {
    val colors = Air.colors
    Row(
        modifier = modifier
            .padding(horizontal = 24.dp)
            .clip(CircleShape)
            .background(if (colors.isDark) colors.surfaceSecondary else colors.text.copy(alpha = 0.86f))
            .padding(horizontal = 18.dp, vertical = 12.dp)
            .semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite }
            .then(if (tag != null) Modifier.testTag(tag) else Modifier),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = if (colors.isDark) colors.accent else colors.card,
            modifier = Modifier.size(18.dp),
        )
        Text(text, style = AirType.subheadline, color = if (colors.isDark) colors.text else colors.card)
    }
}

/** The iOS switch: green when on, a white thumb, a quiet grey track when off. */
@Composable
public fun AirSwitch(
    checked: Boolean,
    onCheckedChange: ((Boolean) -> Unit)?,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = Air.colors
    Switch(
        checked = checked,
        onCheckedChange = onCheckedChange,
        enabled = enabled,
        modifier = modifier,
        colors = SwitchDefaults.colors(
            checkedThumbColor = Color.White,
            checkedTrackColor = colors.success,
            checkedBorderColor = Color.Transparent,
            uncheckedThumbColor = Color.White,
            uncheckedTrackColor = colors.separator,
            uncheckedBorderColor = Color.Transparent,
        ),
    )
}

/** The smallest touch target Android's accessibility guidance allows. */
private val MIN_TOUCH = 48.dp
