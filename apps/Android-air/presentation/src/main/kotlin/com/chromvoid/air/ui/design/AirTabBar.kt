package com.chromvoid.air.ui.design

import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.indication
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.chromvoid.air.ui.Air

/** One destination of the floating tab bar. */
public class AirTab(public val label: String, public val icon: ImageVector, public val tag: String)

/**
 * The floating capsule tab bar of the iOS client: the selected tab sits in a
 * soft pill with an accent icon and label.
 */
@Composable
public fun AirTabBar(tabs: List<AirTab>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    val colors = Air.colors
    Box(
        modifier = modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 12.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            modifier = Modifier
                // Bound the phone capsule within its window.
                .widthIn(max = MAX_WIDTH)
                .fillMaxWidth()
                .height(IntrinsicSize.Min)
                .shadow(16.dp, BarShape, clip = false, ambientColor = ShadowTint, spotColor = ShadowTint)
                .clip(BarShape)
                .background(colors.card)
                .selectableGroup()
                .padding(5.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            tabs.forEachIndexed { index, tab ->
                val active = index == selected
                val interaction = remember { MutableInteractionSource() }
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .heightIn(min = 58.dp)
                        .selectable(
                            selected = active,
                            interactionSource = interaction,
                            indication = null,
                            role = Role.Tab,
                            onClick = { onSelect(index) },
                        )
                        .testTag(tab.tag),
                ) {
                    // Clip the capsule and its ripple, leaving the label the full cell width.
                    Box(
                        modifier = Modifier
                            .matchParentSize()
                            .clip(TabShape)
                            .background(if (active) colors.surfaceSecondary else colors.card)
                            .indication(interaction, LocalIndication.current),
                    )
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Top,
                    ) {
                        Icon(
                            tab.icon,
                            contentDescription = null,
                            tint = if (active) colors.accent else colors.text,
                            modifier = Modifier.size(26.dp),
                        )
                        Text(
                            tab.label,
                            style = AirType.caption.copy(fontWeight = FontWeight.Medium),
                            color = if (active) colors.accent else colors.text,
                            maxLines = 1,
                            softWrap = false,
                            overflow = TextOverflow.Ellipsis,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
        }
    }
}

private val MAX_WIDTH = 560.dp
// Keep the standard capsule's corners as the label's scaled line height grows.
private val BarShape = RoundedCornerShape(34.dp)
private val TabShape = RoundedCornerShape(29.dp)
