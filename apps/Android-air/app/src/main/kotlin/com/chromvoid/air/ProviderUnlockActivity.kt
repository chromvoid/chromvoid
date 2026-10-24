package com.chromvoid.air

import android.content.Intent
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.access.AccessViewModel
import com.chromvoid.air.ui.access.UnlockScreen
import com.chromvoid.air.ui.settings.AppearanceModel
import com.chromvoid.app.shared.ProviderUnlock
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * The unlock another app's request asked for - a fill, a Credential Manager sign-in, a passkey
 * to create: the vault's unlock screen, alone, over the app that asked. Once the vault is open
 * it answers that request as an open vault would - the same entries, each still reading its
 * secret only when chosen - and closes. Leaving it first answers nothing. A vault not set up
 * yet has nothing to offer, and it closes.
 */
public class ProviderUnlockActivity : FragmentActivity() {
    private var answered = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ScreenCapture.apply(window)
        val graph = AirAppGraph.of(this)
        val session = graph.session
        // A fill may be the first thing this process does: open the runtime, locked.
        lifecycleScope.launch { session.start() }
        val appearance = AppearanceModel(graph.appearancePreferences) { recreate() }
        setContent {
            val theme by appearance.state.collectAsStateWithLifecycle()
            AirTheme(theme.theme) {
                val model: AccessViewModel = viewModel(
                    factory = accessViewModelFactory(session, animateUnlockCompletion = false),
                )
                ProviderUnlockContent(model, onUnlocked = { complete() }, onUnavailable = { answer(null) })
            }
        }
    }

    override fun onStart() {
        super.onStart()
        lifecycleScope.launch { AirAppGraph.of(this@ProviderUnlockActivity).session.activate() }
    }

    private suspend fun complete() {
        val result = withContext(Dispatchers.IO) {
            runCatching { ProviderUnlock.result(this@ProviderUnlockActivity, intent) }.getOrNull()
        }
        answer(result)
    }

    private fun answer(result: Intent?) {
        if (answered) return
        answered = true
        if (result == null) setResult(RESULT_CANCELED) else setResult(RESULT_OK, result)
        finish()
    }
}

@Composable
internal fun ProviderUnlockContent(
    model: AccessViewModel,
    onUnlocked: suspend () -> Unit,
    onUnavailable: () -> Unit,
) {
    val state by model.displayState.collectAsStateWithLifecycle()
    when (state) {
        AirSessionState.Locked -> UnlockScreen(model)
        is AirSessionState.Unlocked -> {
            Working()
            LaunchedEffect(Unit) { onUnlocked() }
        }
        AirSessionState.NeedsAdministrator, is AirSessionState.Unavailable -> {
            LaunchedEffect(Unit) { onUnavailable() }
        }
        AirSessionState.Starting -> Working()
    }
}

@Composable
private fun Working() {
    Box(modifier = Modifier.fillMaxSize().background(Air.colors.canvas), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = Air.colors.accent)
    }
}
