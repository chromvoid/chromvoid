package com.chromvoid.air.ui.maintenance

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/**
 * Shows the open administration screen over whatever the session shows - the
 * welcome, the locked screen or the open vault - as the iOS sheets cover
 * them. What lies underneath stays composed, so closing the screen returns to
 * the same tab and scroll position, but it is hidden from accessibility while
 * covered, as a sheet's background is.
 */
@Composable
public fun MaintenanceHost(maintenance: MaintenanceScope?, content: @Composable () -> Unit) {
    val route = maintenance?.route?.collectAsStateWithLifecycle()?.value
    Box(modifier = Modifier.fillMaxSize()) {
        Box(modifier = if (route != null) Modifier.fillMaxSize().clearAndSetSemantics {} else Modifier.fillMaxSize()) {
            content()
        }
        if (maintenance != null && route != null) {
            when (route) {
                is MaintenanceRoute.Password -> PasswordMaintenanceScreen(route.model, onDismiss = maintenance::dismiss)
                is MaintenanceRoute.Backup -> StorageBackupScreen(route.model, onDismiss = maintenance::dismiss)
                is MaintenanceRoute.Restore -> StorageRestoreScreen(route.model, onDismiss = maintenance::dismiss)
                is MaintenanceRoute.Erase -> StorageEraseScreen(
                    route.model,
                    onDismiss = maintenance::dismiss,
                    onResetApp = if (maintenance.offers(MaintenanceAction.APP_RESET)) {
                        maintenance::resetAppInsteadOfErasing
                    } else {
                        null
                    },
                )
                is MaintenanceRoute.ResetApp -> AppResetScreen(route.model, onDismiss = maintenance::dismiss)
            }
        }
    }
}
