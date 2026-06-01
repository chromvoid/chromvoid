package com.chromvoid.app

import android.app.StatusBarManager
import android.content.ComponentName
import android.content.Context
import android.graphics.drawable.Icon
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.util.Log

class VaultQuickSettingsTileService : TileService() {
    override fun onStartListening() {
        super.onStartListening()
        syncTile()
    }

    override fun onClick() {
        super.onClick()
        if (
            VaultStatusNotificationController.isQuickTileEnabled() &&
            VaultStatusNotificationController.isVaultUnlocked()
        ) {
            VaultStatusNotificationController.lockVaultFromQuickAction(SOURCE_TILE)
        }
        syncTile()
    }

    private fun syncTile() {
        val tile = qsTile ?: return
        tile.label = getString(R.string.vault_quick_lock_tile_label)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            tile.subtitle =
                if (VaultStatusNotificationController.isVaultUnlocked()) {
                    getString(R.string.vault_quick_lock_tile_unlocked)
                } else {
                    getString(R.string.vault_quick_lock_tile_locked)
                }
        }
        tile.state =
            when {
                !VaultStatusNotificationController.isQuickTileEnabled() -> Tile.STATE_UNAVAILABLE
                VaultStatusNotificationController.isVaultUnlocked() -> Tile.STATE_ACTIVE
                else -> Tile.STATE_INACTIVE
            }
        tile.updateTile()
    }

    companion object {
        private const val TAG = "ChromVoid/VaultTile"
        private const val SOURCE_TILE = "quick_settings_tile"

        private const val REQUEST_RESULT_REQUESTED = 0
        private const val REQUEST_RESULT_UNSUPPORTED = 1
        private const val REQUEST_RESULT_UNAVAILABLE = 2
        private const val REQUEST_RESULT_ERROR = 3

        @JvmStatic
        fun requestAddTile(context: Context): Int {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                return REQUEST_RESULT_UNSUPPORTED
            }

            val manager = context.getSystemService(StatusBarManager::class.java)
                ?: return REQUEST_RESULT_UNAVAILABLE
            val component = ComponentName(context, VaultQuickSettingsTileService::class.java)
            val label = context.getString(R.string.vault_quick_lock_tile_label)
            val icon = Icon.createWithResource(context, android.R.drawable.ic_lock_lock)

            return runCatching {
                manager.requestAddTileService(
                    component,
                    label,
                    icon,
                    context.mainExecutor,
                ) { result ->
                    Log.i(TAG, "Quick settings tile add request result=$result")
                }
                REQUEST_RESULT_REQUESTED
            }.getOrElse { error ->
                Log.w(TAG, "Failed to request quick settings tile", error)
                REQUEST_RESULT_ERROR
            }
        }

        fun requestStateRefresh(context: Context) {
            val component = ComponentName(context, VaultQuickSettingsTileService::class.java)
            runCatching {
                TileService.requestListeningState(context, component)
            }.onFailure { error ->
                Log.d(TAG, "Failed to request quick settings tile state refresh", error)
            }
        }
    }
}
