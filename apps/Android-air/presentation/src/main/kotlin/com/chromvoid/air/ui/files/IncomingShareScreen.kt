package com.chromvoid.air.ui.files

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.ActionRow
import com.chromvoid.air.ui.design.AirRow
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.DoneButton
import com.chromvoid.air.ui.design.PillIcon
import com.chromvoid.air.ui.design.PillText
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.root.CoversTabBar

public const val INCOMING_TAG: String = "incoming"
public const val INCOMING_CANCEL_TAG: String = "incoming-cancel"
public const val INCOMING_SAVE_TAG: String = "incoming-save"
public const val INCOMING_DESTINATION_TAG: String = "incoming-destination"
public const val INCOMING_PASSWORDS_TAG: String = "incoming-passwords"
public const val INCOMING_NOTHING_TAG: String = "incoming-nothing"

public fun incomingFileTag(index: Int): String = "incoming-file-$index"

/**
 * Files another app shared, as a sheet over whatever was on screen: what
 * came, where it will be saved, and Save; for a credential export, the
 * Passwords import instead. Once saving starts, the import's own progress
 * and results take the sheet.
 */
@Composable
public fun IncomingShareScreen(
    model: IncomingShareModel,
    device: FileDevice?,
    onClose: () -> Unit,
    onLock: () -> Unit,
) {
    CoversTabBar()
    val state by model.state.collectAsStateWithLifecycle()
    val running by model.import.collectAsStateWithLifecycle()
    val chooser by model.chooser.collectAsStateWithLifecycle()
    running?.let { import ->
        FileImportScreen(import, device, onClose = onClose, onLock = onLock, offersMore = false)
        return
    }
    BackHandler(onBack = onClose)
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Air.colors.canvas)
            .pointerInput(Unit) { detectTapGestures {} }
            .testTag(INCOMING_TAG),
    ) {
        AirScreen(
            title = stringResource(R.string.incoming_title),
            largeTitle = false,
            leading = {
                DoneButton(
                    stringResource(R.string.form_keep_cancel),
                    onClick = onClose,
                    modifier = Modifier.testTag(INCOMING_CANCEL_TAG),
                )
            },
            actions = {
                PillIcon(Icons.Outlined.Lock, stringResource(R.string.vault_lock), onClick = onLock)
                PillText(
                    stringResource(R.string.form_save),
                    onClick = model::save,
                    enabled = state.names.isNotEmpty(),
                    emphasized = true,
                    modifier = Modifier.testTag(INCOMING_SAVE_TAG),
                )
            },
        ) {
            item(key = "files") {
                AirSection(
                    header = stringResource(R.string.incoming_files),
                    footer = stringResource(R.string.incoming_note),
                ) {
                    if (state.names.isEmpty()) {
                        AirRow(
                            title = stringResource(R.string.incoming_nothing),
                            titleColor = Air.colors.textSecondary,
                            modifier = Modifier.testTag(INCOMING_NOTHING_TAG),
                        )
                    }
                    state.names.forEachIndexed { index, name ->
                        if (index > 0) RowDivider(inset = 58.dp)
                        AirRow(
                            title = name,
                            icon = Icons.Outlined.Description,
                            modifier = Modifier.testTag(incomingFileTag(index)),
                        )
                    }
                }
            }
            if (state.names.isNotEmpty()) {
                item(key = "destination") {
                    AirSection(header = stringResource(R.string.incoming_destination)) {
                        AirRow(
                            title = state.destination,
                            icon = Icons.Outlined.Folder,
                            chevron = true,
                            onClick = model::chooseDestination,
                            modifier = Modifier.testTag(INCOMING_DESTINATION_TAG),
                        )
                    }
                }
            }
            if (model.offersCredentials) {
                item(key = "passwords") {
                    AirSection(footer = stringResource(R.string.incoming_passwords_text)) {
                        ActionRow(
                            stringResource(R.string.incoming_passwords),
                            onClick = model::importCredentials,
                            icon = Icons.Outlined.Key,
                            modifier = Modifier.testTag(INCOMING_PASSWORDS_TAG),
                        )
                    }
                }
            }
        }
        chooser?.let {
            FolderChooserScreen(
                it,
                title = stringResource(R.string.incoming_destination),
                hint = stringResource(R.string.incoming_destination_hint),
                confirm = stringResource(R.string.attachments_use),
                onCancel = model::dismissChooser,
                onLock = onLock,
            )
        }
    }
}
