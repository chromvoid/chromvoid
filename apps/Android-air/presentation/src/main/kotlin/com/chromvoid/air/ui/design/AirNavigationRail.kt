package com.chromvoid.air.ui.design

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.NavigationRailItemDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.chromvoid.air.ui.Air

/** Android's persistent navigation, with the same destinations and identity as the phone tabs. */
@Composable
public fun AirNavigationRail(
    tabs: List<AirTab>,
    selected: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = Air.colors
    Row(modifier = modifier.width(AIR_RAIL_WIDTH).fillMaxHeight()) {
        NavigationRail(
            modifier = Modifier.weight(1f).fillMaxHeight(),
            containerColor = colors.canvas,
        ) {
            Column(
                modifier = Modifier.fillMaxHeight().verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp, alignment = Alignment.CenterVertically),
            ) {
                tabs.forEachIndexed { index, tab ->
                    NavigationRailItem(
                        selected = index == selected,
                        onClick = { onSelect(index) },
                        icon = { Icon(tab.icon, contentDescription = null, modifier = Modifier.size(26.dp)) },
                        label = {
                            Text(
                                tab.label,
                                style = AirType.caption.copy(fontWeight = FontWeight.Medium),
                                textAlign = TextAlign.Center,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                        },
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp).testTag(tab.tag),
                        colors = NavigationRailItemDefaults.colors(
                            selectedIconColor = colors.accent,
                            selectedTextColor = colors.accent,
                            indicatorColor = colors.surfaceSecondary,
                            unselectedIconColor = colors.text,
                            unselectedTextColor = colors.text,
                        ),
                    )
                }
            }
        }
        VerticalDivider(color = colors.separator)
    }
}

// Room for the full localized destination names while retaining useful list/detail width at 840dp.
internal val AIR_RAIL_WIDTH = 112.dp
