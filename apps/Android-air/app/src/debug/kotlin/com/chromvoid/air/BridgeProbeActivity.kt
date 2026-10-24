package com.chromvoid.air

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.viewmodel.compose.viewModel
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.BridgeProbeScreen
import com.chromvoid.air.ui.BridgeProbeViewModel

/**
 * Development surface only, and only in a debug build: it runs the synthetic
 * fixture round trip that proves the native bridge works on this device. It
 * owns no storage and reaches no real vault.
 */
public class BridgeProbeActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        setContent {
            AirTheme {
                val model: BridgeProbeViewModel =
                    viewModel(factory = BridgeProbeViewModel.factory(this))
                BridgeProbeScreen(model)
            }
        }
    }
}
