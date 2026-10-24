package com.chromvoid.air.ui.help

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Hub
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Restore
import androidx.compose.material.icons.outlined.ShieldMoon
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.AirRow
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.RowDivider

public const val HELP_SCREEN_TAG: String = "help-screen"
public const val HELP_BACK_TAG: String = "help-back"

public fun helpTopicTag(topic: HelpTopic): String = "help-topic-${topic.name.lowercase()}"

public fun helpDetailTag(topic: HelpTopic): String = "help-detail-${topic.name.lowercase()}"

/** Offline guidance, as on iOS; it holds no runtime state and nothing from the vault. */
public enum class HelpTopic(
    internal val title: Int,
    internal val icon: ImageVector,
    internal val paragraphs: List<Int>,
) {
    PASSWORDS(
        R.string.help_passwords_title,
        Icons.Outlined.Key,
        listOf(R.string.help_passwords_1, R.string.help_passwords_2, R.string.help_passwords_3),
    ),
    STORAGE(
        R.string.help_storage_title,
        Icons.Outlined.ShieldMoon,
        listOf(R.string.help_storage_1, R.string.help_storage_2, R.string.help_storage_3),
    ),
    BACKUPS(
        R.string.help_backups_title,
        Icons.Outlined.Restore,
        listOf(R.string.help_backups_1, R.string.help_backups_2, R.string.help_backups_3),
    ),
    CONNECTIONS(
        R.string.help_connections_title,
        Icons.Outlined.Hub,
        listOf(R.string.help_connections_1, R.string.help_connections_2, R.string.help_connections_3),
    ),
}

/**
 * Help as a small stack: the topics, then one topic. Opened at a topic (the
 * storage failure opens its own), back from that topic closes Help.
 */
@Composable
public fun HelpFlow(onClose: () -> Unit, modifier: Modifier = Modifier, start: HelpTopic? = null) {
    var topic by rememberSaveable { mutableStateOf(start) }
    val current = topic
    val back = {
        if (current != null && start == null) topic = null else onClose()
    }
    BackHandler(onBack = back)
    if (current == null) {
        HelpScreen(onBack = onClose, onOpen = { topic = it }, modifier = modifier)
    } else {
        HelpTopicScreen(current, onBack = back, modifier = modifier)
    }
}

@Composable
private fun HelpScreen(onBack: () -> Unit, onOpen: (HelpTopic) -> Unit, modifier: Modifier = Modifier) {
    AirScreen(
        title = stringResource(R.string.help_title),
        largeTitle = false,
        onBack = onBack,
        backTag = HELP_BACK_TAG,
        backDescription = stringResource(R.string.detail_back),
        modifier = modifier.testTag(HELP_SCREEN_TAG),
    ) {
        item(key = "topics") {
            AirSection {
                HelpTopic.entries.forEachIndexed { index, topic ->
                    if (index > 0) RowDivider(inset = 58.dp)
                    AirRow(
                        title = stringResource(topic.title),
                        icon = topic.icon,
                        chevron = true,
                        onClick = { onOpen(topic) },
                        modifier = Modifier.testTag(helpTopicTag(topic)),
                    )
                }
            }
        }
    }
}

@Composable
private fun HelpTopicScreen(topic: HelpTopic, onBack: () -> Unit, modifier: Modifier = Modifier) {
    val colors = Air.colors
    AirScreen(
        title = stringResource(R.string.help_title),
        largeTitle = false,
        onBack = onBack,
        backTag = HELP_BACK_TAG,
        backDescription = stringResource(R.string.detail_back),
        modifier = modifier.testTag(helpDetailTag(topic)),
    ) {
        item(key = "topic") {
            Column(
                modifier = Modifier.fillMaxWidth().padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(24.dp),
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(topic.icon, contentDescription = null, tint = colors.accent, modifier = Modifier.size(28.dp))
                    Text(
                        stringResource(topic.title),
                        style = AirType.title2.copy(fontWeight = FontWeight.Bold),
                        color = colors.text,
                        modifier = Modifier.semantics { heading() },
                    )
                }
                topic.paragraphs.forEach { paragraph ->
                    Text(stringResource(paragraph), style = AirType.body, color = colors.text)
                }
            }
        }
    }
}
