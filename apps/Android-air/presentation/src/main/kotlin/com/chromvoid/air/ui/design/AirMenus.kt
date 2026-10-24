package com.chromvoid.air.ui.design

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.RadioButtonUnchecked
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.chromvoid.air.ui.Air

/**
 * One item of a dropdown menu, as the iOS menus read: an icon or a tick on the
 * left, the label, the danger colour for a destructive action.
 */
@Composable
public fun AirMenuItem(
    label: Int,
    icon: ImageVector?,
    tag: String,
    enabled: Boolean = true,
    destructive: Boolean = false,
    checked: Boolean? = null,
    onClick: () -> Unit,
) {
    val tint = if (destructive) Air.colors.danger else Air.colors.text
    DropdownMenuItem(
        text = { Text(
            stringResource(label),
            style = AirType.body,
            color = if (enabled) tint else Air.colors.textTertiary,
        ) },
        leadingIcon = when {
            checked != null -> ({
                Icon(
                    if (checked) Icons.Rounded.Check else Icons.Rounded.RadioButtonUnchecked,
                    contentDescription = null,
                    tint = if (checked) Air.colors.accent else Air.colors.card,
                )
            })
            icon != null -> ({ Icon(icon, contentDescription = null, tint = tint) })
            else -> null
        },
        enabled = enabled,
        onClick = onClick,
        modifier = Modifier.testTag(tag),
    )
}

/** A caption inside a menu that names the choices below it ("Sort by"). */
@Composable
public fun AirMenuHeading(text: Int) {
    Text(
        stringResource(text),
        style = AirType.footnote,
        color = Air.colors.textSecondary,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
    )
}
