package com.chromvoid.air.ui.access

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Backup
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.SettingsBackupRestore
import androidx.compose.material.icons.rounded.Sync
import androidx.compose.material.icons.rounded.RestartAlt
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.AirRow
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.maintenance.MaintenanceAction
import com.chromvoid.air.ui.maintenance.MaintenanceNote
import com.chromvoid.air.ui.maintenance.MaintenanceSheet

public const val UTILITIES_CLOSE_TAG: String = "utilities-close"

public fun utilityTag(action: MaintenanceAction): String = "utility-${action.name.lowercase()}"

/**
 * The locked device's rare actions, as the iOS sheet: backup, restore and the
 * administrative password, then deletion and app reset under Danger. Core
 * operations ask for the administrative password; Android app reset has its
 * own local confirmation. The vault password stays with unlocked Settings.
 */
@Composable
public fun DeviceUtilitiesSheet(
    offers: (MaintenanceAction) -> Boolean,
    onChoose: (MaintenanceAction) -> Unit,
    onClose: () -> Unit,
) {
    val danger = listOf(MaintenanceAction.ERASE, MaintenanceAction.APP_RESET).filter(offers)
    val safe = UTILITIES.keys.filter { it !in danger && offers(it) }
    MaintenanceSheet(
        title = stringResource(R.string.utilities_title),
        onDismiss = onClose,
        closeTag = UTILITIES_CLOSE_TAG,
        closeLabel = stringResource(R.string.utilities_close),
    ) {
        item(key = "intro") { MaintenanceNote(stringResource(R.string.utilities_intro)) }
        if (safe.isNotEmpty()) {
            item(key = "safe") {
                AirSection {
                    safe.forEachIndexed { index, action ->
                        if (index > 0) RowDivider()
                        UtilityRow(action, onChoose)
                    }
                }
            }
        }
        if (danger.isNotEmpty()) {
            item(key = "danger") {
                AirSection(header = stringResource(R.string.utilities_danger)) {
                    danger.forEachIndexed { index, action ->
                        if (index > 0) RowDivider()
                        UtilityRow(action, onChoose)
                    }
                }
            }
        }
    }
}

/** What each utility is called, what it says about itself and its symbol, as on iOS. */
private class Utility(val title: Int, val detail: Int, val icon: ImageVector)

private val UTILITIES: Map<MaintenanceAction, Utility> = mapOf(
    MaintenanceAction.BACKUP to
        Utility(R.string.utilities_backup, R.string.utilities_backup_detail, Icons.Outlined.Backup),
    MaintenanceAction.RESTORE to
        Utility(R.string.utilities_restore, R.string.utilities_restore_detail, Icons.Outlined.SettingsBackupRestore),
    MaintenanceAction.ADMINISTRATOR_PASSWORD to
        Utility(R.string.utilities_admin, R.string.utilities_admin_detail, Icons.Rounded.Sync),
    MaintenanceAction.ERASE to
        Utility(R.string.utilities_erase, R.string.utilities_erase_detail, Icons.Outlined.DeleteOutline),
    MaintenanceAction.APP_RESET to
        Utility(R.string.app_reset_title, R.string.utilities_app_reset_detail, Icons.Rounded.RestartAlt),
)

@Composable
private fun UtilityRow(action: MaintenanceAction, onChoose: (MaintenanceAction) -> Unit) {
    val utility = UTILITIES.getValue(action)
    val danger = action == MaintenanceAction.ERASE || action == MaintenanceAction.APP_RESET
    AirRow(
        title = stringResource(utility.title),
        subtitle = stringResource(utility.detail),
        icon = utility.icon,
        iconTint = if (danger) Air.colors.danger else Air.colors.accent,
        titleColor = if (danger) Air.colors.danger else null,
        chevron = true,
        onClick = { onChoose(action) },
        modifier = Modifier.testTag(utilityTag(action)),
    )
}
