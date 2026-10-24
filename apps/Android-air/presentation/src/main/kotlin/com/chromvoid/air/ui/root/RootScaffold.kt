package com.chromvoid.air.ui.root

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AlternateEmail
import androidx.compose.material.icons.rounded.DeviceHub
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirTab
import com.chromvoid.air.ui.design.AirTabBar
import com.chromvoid.air.ui.design.AirNavigationRail
import com.chromvoid.air.ui.design.AIR_RAIL_WIDTH
import com.chromvoid.air.ui.design.EXPANDED_WIDTH
import com.chromvoid.air.ui.design.LocalAirWindowExpanded
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.TabBarClearance
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.ui.unit.dp
import com.chromvoid.air.ui.Air

/**
 * The four product roots from the UX specification. Each keeps its own stack;
 * a locked session may reach only the roots that hold no vault content.
 */
public enum class AirRoot(
    public val labelRes: Int,
    public val icon: ImageVector,
    public val availableWhenLocked: Boolean,
) {
    VAULT(R.string.root_vault, Icons.Rounded.AlternateEmail, availableWhenLocked = false),
    FILES(R.string.root_files, Icons.Rounded.Folder, availableWhenLocked = false),
    CONNECTIONS(R.string.root_connections, Icons.Rounded.DeviceHub, availableWhenLocked = true),
    SETTINGS(R.string.root_settings, Icons.Rounded.Settings, availableWhenLocked = true),
}

public const val ROOT_CONTENT_TAG: String = "root-content"

/**
 * What a root's content may ask of the scaffold around it. A full-screen
 * presentation - a sheet, a viewer - or a contextual selection toolbar covers
 * root navigation, as an iOS sheet does, for as long as it is shown.
 */
public class RootChrome internal constructor() {
    internal var covering: Int by mutableIntStateOf(0)
}

public val LocalRootChrome: androidx.compose.runtime.ProvidableCompositionLocal<RootChrome?> =
    staticCompositionLocalOf { null }

/** Hides root navigation (the phone tab bar or tablet rail) while the caller is shown. */
@Composable
public fun CoversTabBar() {
    val chrome = LocalRootChrome.current ?: return
    DisposableEffect(chrome) {
        chrome.covering += 1
        onDispose { chrome.covering -= 1 }
    }
}

/**
 * Four roots under a phone's floating tab bar or beside a tablet's navigation rail. [vault], [files],
 * [connections] and [settings] render their roots when they have content; a
 * root without one keeps a placeholder. Each root's saveable state is kept while
 * another root is shown, so switching back returns to the same place.
 * [overlay] draws over every root - a sheet that belongs to none of them.
 * [request] brings a root forward once; [onRequestHandled] says it did.
 */
@Composable
public fun RootScaffold(
    unlocked: Boolean,
    vault: (@Composable (Modifier) -> Unit)? = null,
    files: (@Composable (Modifier) -> Unit)? = null,
    connections: (@Composable (Modifier) -> Unit)? = null,
    settings: (@Composable (Modifier) -> Unit)? = null,
    overlay: (@Composable () -> Unit)? = null,
    request: AirRoot? = null,
    onRequestHandled: () -> Unit = {},
) {
    var selected by rememberSaveable {
        mutableStateOf(if (unlocked) AirRoot.VAULT else AirRoot.CONNECTIONS)
    }
    val roots = remember(unlocked) {
        AirRoot.entries.filter { unlocked || it.availableWhenLocked }
    }
    // A lock can remove the selected root under the user; fall back to a safe
    // one instead of rendering a destination this session may not see.
    if (selected !in roots) {
        selected = roots.first()
    }
    LaunchedEffect(request) {
        val wanted = request ?: return@LaunchedEffect
        if (wanted in roots) selected = wanted
        onRequestHandled()
    }
    val rootStates = rememberSaveableStateHolder()
    val chrome = remember { RootChrome() }
    BoxWithConstraints(modifier = Modifier.fillMaxSize().background(Air.colors.canvas)) {
        val expanded = maxWidth >= EXPANDED_WIDTH
        val showNavigation = chrome.covering == 0
        val tabs = roots.map { AirTab(stringResource(it.labelRes), it.icon, "root-${it.name.lowercase()}") }
        CompositionLocalProvider(LocalRootChrome provides chrome, LocalAirWindowExpanded provides expanded) {
            // Keep content in one composition position across width and modal changes.
            Box(modifier = Modifier.padding(start = if (expanded && showNavigation) AIR_RAIL_WIDTH else 0.dp)) {
                rootStates.SaveableStateProvider(selected.name) {
                    val content = Modifier.fillMaxSize().testTag(ROOT_CONTENT_TAG)
                    when {
                        selected == AirRoot.VAULT && vault != null -> vault(content)
                        selected == AirRoot.FILES && files != null -> files(content)
                        selected == AirRoot.CONNECTIONS && connections != null -> connections(content)
                        selected == AirRoot.SETTINGS && settings != null -> settings(content)
                        else -> Placeholder(selected, unlocked, content)
                    }
                }
            }
            overlay?.invoke()
        }
        if (showNavigation) {
            if (expanded) {
                AirNavigationRail(
                    tabs = tabs,
                    selected = roots.indexOf(selected),
                    onSelect = { selected = roots[it] },
                    modifier = Modifier.align(Alignment.CenterStart).testTag("root-rail"),
                )
            } else {
                AirTabBar(
                    tabs = tabs,
                    selected = roots.indexOf(selected),
                    onSelect = { selected = roots[it] },
                    modifier = Modifier.align(Alignment.BottomCenter).testTag("root-tab-bar"),
                )
            }
        }
    }
}

@Composable
private fun Placeholder(root: AirRoot, unlocked: Boolean, modifier: Modifier) {
    AirScreen(title = stringResource(root.labelRes), modifier = modifier) {
        item {
            AirSection {
                if (!unlocked) {
                    Text(
                        stringResource(R.string.root_locked_notice),
                        style = AirType.body,
                        color = Air.colors.text,
                        modifier = Modifier.padding(20.dp),
                    )
                }
                Text(
                    stringResource(R.string.root_placeholder),
                    style = AirType.subheadline,
                    color = Air.colors.textSecondary,
                    modifier = Modifier.padding(20.dp),
                )
            }
        }
        item { TabBarClearance() }
    }
}
