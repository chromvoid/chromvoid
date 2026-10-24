package com.chromvoid.air.ui.media

import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.rounded.PlayDisabled
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.PlayerView
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.ActionPill
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.DoneButton
import com.chromvoid.air.ui.design.LinkButton
import com.chromvoid.air.ui.design.PillIcon
import com.chromvoid.air.ui.root.CoversTabBar

public const val MEDIA_TAG: String = "media"
public const val MEDIA_CLOSE_TAG: String = "media-close"
public const val MEDIA_PLAYER_TAG: String = "media-player"
public const val MEDIA_ISSUE_TAG: String = "media-issue"

/**
 * Audio or video, as the iOS player presents it: Done, the name and the lock
 * in the bar, the platform's player with its controls, why it cannot play
 * otherwise. It never starts on its own and pauses when the app leaves the
 * screen.
 */
@OptIn(UnstableApi::class)
@Composable
public fun MediaPreviewScreen(model: MediaPreviewModel, onClose: () -> Unit, onLock: () -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    CoversTabBar()
    BackHandler(onBack = onClose)
    LaunchedEffect(model) { model.load() }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle, model) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_STOP) model.pause() }
        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
            model.pause()
        }
    }
    val colors = Air.colors
    Column(modifier = Modifier.fillMaxSize().background(colors.canvas).testTag(MEDIA_TAG)) {
        Row(
            modifier = Modifier.fillMaxWidth().statusBarsPadding().height(60.dp).padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            DoneButton(
                stringResource(R.string.files_done),
                onClick = onClose,
                modifier = Modifier.testTag(MEDIA_CLOSE_TAG),
            )
            Text(
                model.name,
                style = AirType.headline,
                color = colors.text,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
                modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
            )
            ActionPill { PillIcon(Icons.Outlined.Lock, stringResource(R.string.vault_lock), onClick = onLock) }
        }
        Box(
            modifier = Modifier.weight(1f).fillMaxWidth().navigationBarsPadding(),
            contentAlignment = Alignment.Center,
        ) {
            val player = state.player
            when {
                player != null -> AndroidView(
                    factory = { context ->
                        PlayerView(context).apply {
                            useController = true
                            controllerAutoShow = true
                            setShowNextButton(false)
                            setShowPreviousButton(false)
                        }
                    },
                    update = { it.player = player },
                    onRelease = { it.player = null },
                    modifier = Modifier.fillMaxSize().testTag(MEDIA_PLAYER_TAG),
                )
                state.status == MediaPreviewModel.Status.FAILED -> Column(
                    modifier = Modifier.padding(32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Icon(
                        Icons.Rounded.PlayDisabled,
                        contentDescription = null,
                        tint = colors.textSecondary,
                        modifier = Modifier.size(44.dp),
                    )
                    Text(
                        stringResource(R.string.media_unplayable),
                        style = AirType.body,
                        color = colors.text,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.testTag(MEDIA_ISSUE_TAG),
                    )
                    LinkButton(stringResource(R.string.media_try_again), onClick = model::load)
                }
                else -> Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    CircularProgressIndicator(color = colors.accent)
                    Text(
                        stringResource(R.string.media_loading_media),
                        style = AirType.subheadline,
                        color = colors.textSecondary,
                    )
                }
            }
        }
    }
}
