package com.chromvoid.air.ui.design

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.chromvoid.air.ui.Air

@Immutable
public data class AirSegment(val label: String, val tag: String)

/** A quiet track and a separate selected capsule, inside independent Android touch targets. */
@Composable
public fun AirSegmentedControl(
    segments: List<AirSegment>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = Air.colors
    val track = if (colors.isDark) colors.card else colors.surfaceSecondary
    val capsule = if (colors.isDark) colors.surfaceSecondary else colors.card
    Box(modifier = modifier.fillMaxWidth()) {
        Box(modifier = Modifier.matchParentSize().padding(vertical = 6.dp).background(track, CircleShape))
        Row(modifier = Modifier.fillMaxWidth().selectableGroup()) {
            segments.forEachIndexed { index, segment ->
                val selected = selectedIndex == index
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .sizeIn(minWidth = 48.dp, minHeight = 48.dp)
                        .selectable(
                            selected = selected,
                            enabled = enabled,
                            role = Role.RadioButton,
                            onClick = { onSelect(index) },
                        )
                        .testTag(segment.tag)
                        .padding(horizontal = 2.dp, vertical = 6.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 36.dp)
                            .background(if (selected) capsule else Color.Transparent, CircleShape)
                            .padding(horizontal = 6.dp, vertical = 6.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            segment.label,
                            style = AirType.subheadline,
                            color = if (enabled) colors.text else colors.textSecondary,
                            maxLines = 1,
                            softWrap = false,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }
    }
}
