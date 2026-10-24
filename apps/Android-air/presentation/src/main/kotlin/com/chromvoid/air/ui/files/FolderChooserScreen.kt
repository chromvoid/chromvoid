package com.chromvoid.air.ui.files

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CreateNewFolder
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
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
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.DoneButton
import com.chromvoid.air.ui.design.PillIcon
import com.chromvoid.air.ui.design.PillText
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.design.StatusBlock
import com.chromvoid.air.ui.root.CoversTabBar

public const val CHOOSER_TAG: String = "folder-chooser"
public const val CHOOSER_CANCEL_TAG: String = "folder-chooser-cancel"
public const val CHOOSER_USE_TAG: String = "folder-chooser-use"
public const val CHOOSER_UP_TAG: String = "folder-chooser-up"
public const val CHOOSER_NEW_FOLDER_TAG: String = "folder-chooser-new"
public const val CHOOSER_ISSUE_TAG: String = "folder-chooser-issue"

public fun chooserFolderTag(name: String): String = "folder-chooser-$name"

/**
 * A vault folder chosen as on iOS: the folder shown and what the choice does
 * ([hint]), its folders to go into, a new folder, and [confirm].
 */
@Composable
public fun FolderChooserScreen(
    model: FolderChooserModel,
    title: String,
    hint: String,
    confirm: String,
    onCancel: () -> Unit,
    onLock: () -> Unit,
) {
    CoversTabBar()
    val folders by model.folders.collectAsStateWithLifecycle()
    val issue by model.issue.collectAsStateWithLifecycle()
    val edit by model.edit.collectAsStateWithLifecycle()
    val folder = folders.lastOrNull() ?: return
    val nested = folders.size > 1
    BackHandler { if (nested) model.closeFolder() else onCancel() }
    val listing by folder.state.collectAsStateWithLifecycle()
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Air.colors.canvas)
            .pointerInput(Unit) { detectTapGestures {} }
            .testTag(CHOOSER_TAG),
    ) {
        AirScreen(
            title = if (nested) folder.name else title,
            // Large, so the three actions never squeeze the title out of the bar.
            largeTitle = true,
            onBack = if (nested) model::closeFolder else null,
            backTag = CHOOSER_UP_TAG,
            backDescription = stringResource(R.string.detail_back),
            leading = if (nested) {
                null
            } else {
                {
                    DoneButton(
                        stringResource(R.string.form_keep_cancel),
                        onCancel,
                        Modifier.testTag(CHOOSER_CANCEL_TAG),
                    )
                }
            },
            actions = {
                PillIcon(
                    Icons.Outlined.CreateNewFolder,
                    stringResource(R.string.files_new_folder),
                    onClick = model::beginCreateFolder,
                    enabled = listing.status == FolderModel.Status.READY,
                    modifier = Modifier.testTag(CHOOSER_NEW_FOLDER_TAG),
                )
                PillIcon(Icons.Outlined.Lock, stringResource(R.string.vault_lock), onClick = onLock)
                PillText(
                    confirm,
                    onClick = model::select,
                    emphasized = true,
                    modifier = Modifier.testTag(CHOOSER_USE_TAG),
                )
            },
        ) {
            item(key = "summary") {
                AirSection(footer = hint) {
                    AirRow(title = folder.path)
                    issue?.let { issue ->
                        RowDivider()
                        Text(
                            stringResource(
                                when (issue) {
                                    FolderChooserModel.Issue.WAIT_FOR_FOLDER -> R.string.files_wait_folder
                                    FolderChooserModel.Issue.ROOT -> R.string.attachments_root
                                },
                            ),
                            style = AirType.footnote,
                            color = Air.colors.danger,
                            modifier = Modifier
                                .padding(horizontal = 20.dp, vertical = 12.dp)
                                .testTag(CHOOSER_ISSUE_TAG),
                        )
                    }
                }
            }
            when {
                listing.issue != null -> item(key = "issue") {
                    StatusBlock(
                        title = stringResource(folderIssueText(listing.issue)),
                        action = stringResource(R.string.files_refresh),
                        onAction = folder::reload,
                    )
                }
                listing.status == FolderModel.Status.LOADING && listing.items.isEmpty() -> item(key = "loading") {
                    Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Air.colors.accent)
                    }
                }
                else -> item(key = "folders") {
                    val children = listing.items.filter { it.isDir }
                    AirSection(header = stringResource(R.string.files_folders)) {
                        if (children.isEmpty() && !listing.canLoadMore) {
                            AirRow(
                                title = stringResource(R.string.files_no_nested),
                                titleColor = Air.colors.textSecondary,
                            )
                        }
                        children.forEachIndexed { index, item ->
                            if (index > 0) RowDivider(inset = 58.dp)
                            AirRow(
                                title = item.name,
                                icon = Icons.Outlined.Folder,
                                chevron = true,
                                onClick = { model.openFolder(item) },
                                modifier = Modifier.testTag(chooserFolderTag(item.name)),
                            )
                        }
                        if (listing.canLoadMore) {
                            RowDivider()
                            ActionRow(
                                stringResource(R.string.files_load_more),
                                onClick = folder::loadMore,
                                enabled = !listing.loadingMore,
                            )
                        }
                    }
                }
            }
        }
        edit?.let { NameSheet(it, onName = model::setName, onSave = model::saveName, onCancel = model::cancelEdit) }
    }
}
