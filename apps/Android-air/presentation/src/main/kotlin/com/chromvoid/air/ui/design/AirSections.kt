package com.chromvoid.air.ui.design

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.chromvoid.air.ui.Air

/** The corner of a grouped section, as iOS 26 rounds an inset-grouped list. */
public val SectionShape: RoundedCornerShape = RoundedCornerShape(24.dp)

/**
 * A grouped section: an optional header above a white rounded card, an
 * optional footer below. Rows inside are separated with [RowDivider].
 */
@Composable
public fun AirSection(
    modifier: Modifier = Modifier,
    header: String? = null,
    headerTrailing: (@Composable RowScope.() -> Unit)? = null,
    footer: String? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        if (header != null || headerTrailing != null) {
            SectionHeader(header.orEmpty(), style = AirType.sectionHeader, trailing = headerTrailing)
        }
        Column(
            modifier = Modifier.fillMaxWidth().clip(SectionShape).background(Air.colors.card),
            content = content,
        )
        if (footer != null) SectionFooter(footer)
    }
}

/** A grouped caption or a standalone title above open rows on the canvas. */
@Composable
public fun SectionHeader(
    text: String,
    modifier: Modifier = Modifier,
    count: String? = null,
    style: TextStyle = AirType.title3,
    trailing: (@Composable RowScope.() -> Unit)? = null,
) {
    Row(
        modifier = modifier.fillMaxWidth().heightIn(
            min = 40.dp,
        ).padding(start = 20.dp, end = 8.dp, top = 8.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text, style = style, color = Air.colors.textSecondary)
        if (count != null) {
            Text(" · $count", style = style, color = Air.colors.textSecondary)
        }
        Box(modifier = Modifier.weight(1f))
        trailing?.invoke(this)
    }
}

@Composable
public fun SectionFooter(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = AirType.footnote,
        color = Air.colors.textSecondary,
        modifier = modifier.padding(start = 20.dp, end = 20.dp, top = 8.dp),
    )
}

/** The hairline between rows of a section; [inset] lines it up with the row's text. */
@Composable
public fun RowDivider(inset: Dp = 20.dp) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = inset, end = 20.dp)
            .height(0.5.dp)
            .background(Air.colors.separator),
    )
}

/**
 * A plain row of a section: title (and optional subtitle) on the left, a
 * trailing value or control on the right, a chevron when it navigates.
 */
@Composable
public fun AirRow(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    value: String? = null,
    icon: ImageVector? = null,
    iconTint: Color? = null,
    titleColor: Color? = null,
    /** A monospaced title for a value read character by character, such as a generated password. */
    titleFamily: FontFamily? = null,
    chevron: Boolean = false,
    enabled: Boolean = true,
    onClick: (() -> Unit)? = null,
    trailing: (@Composable RowScope.() -> Unit)? = null,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .then(
                if (onClick != null) {
                    Modifier.clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                } else {
                    // A label and its value are read as one, as iOS reads a labelled value;
                    // a control in the trailing slot keeps its own node.
                    Modifier.semantics(mergeDescendants = true) {}
                },
            )
            .heightIn(min = 56.dp)
            .padding(horizontal = 20.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null, tint = iconTint ?: Air.colors.accent, modifier = Modifier.size(24.dp))
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                title,
                style = AirType.body.copy(fontFamily = titleFamily),
                color = when {
                    !enabled -> Air.colors.textTertiary
                    titleColor != null -> titleColor
                    else -> Air.colors.text
                },
            )
            if (subtitle != null) {
                Text(subtitle, style = AirType.subheadline, color = Air.colors.textSecondary)
            }
        }
        if (value != null) Text(value, style = AirType.body, color = Air.colors.textSecondary)
        trailing?.invoke(this)
        if (chevron) {
            Icon(
                Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                contentDescription = null,
                tint = Air.colors.textTertiary,
                modifier = Modifier.size(22.dp),
            )
        }
    }
}

/** A labelled switch with one action and state for the whole row. */
@Composable
public fun AirSwitchRow(
    title: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    AirRow(
        title = title,
        modifier = modifier.toggleable(
            value = checked,
            enabled = enabled,
            role = Role.Switch,
            onValueChange = onCheckedChange,
        ),
        trailing = {
            AirSwitch(
                checked = checked,
                onCheckedChange = null,
                enabled = enabled,
                modifier = Modifier.minimumInteractiveComponentSize().clearAndSetSemantics {},
            )
        },
    )
}

/** An accent action, with optional context below it: "Add website", "Try again". */
@Composable
public fun ActionRow(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    destructive: Boolean = false,
    enabled: Boolean = true,
    subtitle: String? = null,
) {
    AirRow(
        title = title,
        modifier = modifier,
        subtitle = subtitle,
        icon = icon,
        iconTint = if (destructive) Air.colors.danger else Air.colors.accent,
        titleColor = if (destructive) Air.colors.danger else Air.colors.accent,
        enabled = enabled,
        onClick = onClick,
    )
}

/** A status line inside the canvas: loading, an empty state, a failure with its retry. */
@Composable
public fun StatusBlock(
    title: String,
    modifier: Modifier = Modifier,
    message: String? = null,
    icon: ImageVector? = null,
    action: String? = null,
    onAction: (() -> Unit)? = null,
) {
    AirSection(modifier = modifier) {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (icon != null) Icon(icon, contentDescription = null, tint = Air.colors.accent)
                Text(title, style = AirType.headline, color = Air.colors.text)
            }
            if (message != null) Text(message, style = AirType.subheadline, color = Air.colors.textSecondary)
        }
        if (action != null && onAction != null) {
            RowDivider()
            ActionRow(action, onClick = onAction)
        }
    }
}
