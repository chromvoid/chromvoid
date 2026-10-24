package com.chromvoid.air.ui.files

import android.text.format.Formatter
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.rounded.Sort
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.automirrored.outlined.NoteAdd
import androidx.compose.material.icons.rounded.FileDownload
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.CreateNewFolder
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.RadioButtonUnchecked
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.bridge.wire.CatalogListItem
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.AirMenuHeading
import com.chromvoid.air.ui.design.AirMenuItem
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSegment
import com.chromvoid.air.ui.design.AirSegmentedControl
import com.chromvoid.air.ui.design.AirSearchField
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.PillIcon
import com.chromvoid.air.ui.design.PillText
import com.chromvoid.air.ui.design.RowAction
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.design.SectionShape
import com.chromvoid.air.ui.design.StatusBlock
import com.chromvoid.air.ui.design.TabBarClearance
import com.chromvoid.air.ui.root.CoversTabBar

public const val FILES_LIST_TAG: String = "files-list"
public const val FILES_UP_TAG: String = "files-up"
public const val FILES_LOCK_TAG: String = "files-lock"
public const val FILES_OPTIONS_TAG: String = "files-options"
public const val FILES_ADD_TAG: String = "files-add"
public const val FILES_NEW_FOLDER_TAG: String = "files-new-folder"
public const val FILES_NEW_NOTE_TAG: String = "files-new-note"
public const val FILES_IMPORT_TAG: String = "files-import"
public const val FILES_EXPORT_SELECTED_TAG: String = "files-export-selected"
public const val FILES_SHARE_SELECTED_TAG: String = "files-share-selected"
public const val FILES_SELECT_TAG: String = "files-select"
public const val FILES_SELECT_DONE_TAG: String = "files-select-done"
public const val FILES_SEARCH_TAG: String = "files-search"
public const val FILES_ALL_TAG: String = "files-all"
public const val FILES_NOTES_TAG: String = "files-notes"
public const val FILES_HIDDEN_TAG: String = "files-hidden"
public const val FILES_DESCENDING_TAG: String = "files-descending"
public const val FILES_TOTAL_TAG: String = "files-total"
public const val FILES_REFRESH_TAG: String = "files-refresh"
public const val FILES_EMPTY_TAG: String = "files-empty"
public const val FILES_SELECTION_COUNT_TAG: String = "files-selection-count"
public const val FILES_MOVE_SELECTED_TAG: String = "files-move-selected"
public const val FILES_DELETE_SELECTED_TAG: String = "files-delete-selected"

public fun fileRowTag(name: String): String = "file-row-$name"

public fun fileActionsTag(name: String): String = "file-actions-$name"

public fun fileMenuTag(name: String, action: String): String = "file-$action-$name"

public fun fileSortTag(sort: FolderModel.Sort): String = "files-sort-${sort.name.lowercase()}"

private const val LOAD_MORE_THRESHOLD = 10

/**
 * One folder, laid out as the iOS Files root: a large title with the lock,
 * sort and filter, and add; the search field; All files or Notes; the items in
 * one grouped card with their count below. Each row's overflow and labeled
 * long press offer the same actions; Select chooses several for a batch.
 */
@Composable
public fun FolderScreen(
    files: FilesScope,
    folder: FolderModel,
    modifier: Modifier = Modifier,
    onUp: (() -> Unit)? = null,
    onLock: () -> Unit = {},
) {
    val state by folder.state.collectAsStateWithLifecycle()
    val busy by files.busy.collectAsStateWithLifecycle()
    val list = rememberLazyListState()
    val selection = state.selection
    LaunchedEffect(list, state.canLoadMore) {
        if (!state.canLoadMore) return@LaunchedEffect
        snapshotFlow { list.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 }
            .collect { last -> if (last >= list.layoutInfo.totalItemsCount - LOAD_MORE_THRESHOLD) folder.loadMore() }
    }
    if (selection != null) CoversTabBar()
    Column(
        modifier = modifier.fillMaxSize().background(Air.colors.canvas)
            .then(if (selection != null) Modifier.navigationBarsPadding() else Modifier),
    ) {
        AirScreen(
            title = if (onUp == null) stringResource(R.string.root_files) else folder.name,
            modifier = Modifier.weight(1f),
            onBack = onUp,
            backTag = FILES_UP_TAG,
            backDescription = stringResource(R.string.detail_back),
            state = list,
            listTag = FILES_LIST_TAG,
            actions = {
                PillIcon(
                    Icons.Outlined.Lock,
                    stringResource(R.string.vault_lock),
                    onClick = onLock,
                    modifier = Modifier.testTag(FILES_LOCK_TAG),
                )
                OptionsMenu(folder, state)
                if (selection != null) {
                    PillText(
                        stringResource(R.string.files_done),
                        onClick = folder::endSelection,
                        emphasized = true,
                        modifier = Modifier.testTag(FILES_SELECT_DONE_TAG),
                    )
                } else {
                    AddMenu(files, enabled = !busy)
                }
            },
        ) {
            item(key = "search") {
                AirSearchField(
                    value = state.query,
                    onValueChange = folder::search,
                    placeholder = stringResource(
                        if (state.notesOnly) R.string.files_search_notes else R.string.files_search,
                    ),
                    fieldModifier = Modifier.testTag(FILES_SEARCH_TAG),
                    clearDescription = stringResource(R.string.vault_clear_search),
                )
            }
            item(key = "projection") { Projection(state.notesOnly, folder::setNotesOnly) }
            status(state, folder, files)
            items(state, files, folder)
            if (state.loadingMore) {
                item(key = "more") {
                    Box(modifier = Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Air.colors.accent)
                    }
                }
            }
            if (selection == null) item(key = "clearance") { TabBarClearance() }
        }
        if (selection != null) SelectionBar(files, selection.size)
    }
}

/** All files or only the notes below this folder, as the iOS segmented picker. */
@Composable
private fun Projection(notesOnly: Boolean, onChange: (Boolean) -> Unit) {
    AirSegmentedControl(
        segments = listOf(
            AirSegment(stringResource(R.string.files_all), FILES_ALL_TAG),
            AirSegment(stringResource(R.string.files_notes), FILES_NOTES_TAG),
        ),
        selectedIndex = if (notesOnly) 1 else 0,
        onSelect = { onChange(it == 1) },
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
    )
}

/** Select, the sort order and whether hidden items show: everything that shapes the list. */
@Composable
private fun OptionsMenu(folder: FolderModel, state: FolderModel.State) {
    var open by remember { mutableStateOf(false) }
    Box {
        PillIcon(
            Icons.AutoMirrored.Rounded.Sort,
            stringResource(R.string.files_sort_filter),
            onClick = { open = true },
            modifier = Modifier.testTag(FILES_OPTIONS_TAG),
        )
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            AirMenuItem(
                R.string.vault_select,
                Icons.Rounded.CheckCircle,
                FILES_SELECT_TAG,
                enabled = state.selection == null && state.items.isNotEmpty(),
            ) {
                open = false
                folder.beginSelection()
            }
            HorizontalDivider()
            AirMenuHeading(R.string.vault_sort_by)
            FolderModel.Sort.entries.forEach { sort ->
                AirMenuItem(sortLabel(sort), null, fileSortTag(sort), checked = state.sort == sort) {
                    open = false
                    folder.setSort(sort)
                }
            }
            HorizontalDivider()
            AirMenuItem(R.string.vault_descending, null, FILES_DESCENDING_TAG, checked = state.descending) {
                open = false
                folder.setDescending(!state.descending)
            }
            AirMenuItem(R.string.files_show_hidden, null, FILES_HIDDEN_TAG, checked = state.includeHidden) {
                open = false
                folder.setIncludeHidden(!state.includeHidden)
            }
        }
    }
}

/** What can be added to the folder on screen. */
@Composable
private fun AddMenu(files: FilesScope, enabled: Boolean) {
    var open by remember { mutableStateOf(false) }
    Box {
        PillIcon(
            Icons.Rounded.Add,
            stringResource(R.string.files_add),
            onClick = { open = true },
            enabled = enabled,
            modifier = Modifier.testTag(FILES_ADD_TAG),
        )
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            AirMenuItem(R.string.files_new_note, Icons.AutoMirrored.Outlined.NoteAdd, FILES_NEW_NOTE_TAG) {
                open = false
                files.beginNote()
            }
            AirMenuItem(
                R.string.files_import,
                Icons.Rounded.FileDownload,
                FILES_IMPORT_TAG,
                enabled = files.device != null,
            ) {
                open = false
                files.beginImport()
            }
            AirMenuItem(R.string.files_new_folder, Icons.Rounded.CreateNewFolder, FILES_NEW_FOLDER_TAG) {
                open = false
                files.beginCreateFolder()
            }
        }
    }
}

/** The fixed selection toolbar replaces root navigation and reserves its own space below the list. */
@Composable
private fun SelectionBar(files: FilesScope, count: Int) {
    AirSection {
        Text(
            stringResource(R.string.files_selected_count, count),
            style = AirType.headline,
            color = Air.colors.text,
            modifier = Modifier
                .padding(start = 20.dp, end = 20.dp, top = 14.dp)
                .semantics { liveRegion = LiveRegionMode.Polite }
                .testTag(FILES_SELECTION_COUNT_TAG),
        )
        FlowRow(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 2.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            SelectionAction(R.string.files_move, count > 0, FILES_MOVE_SELECTED_TAG) {
                files.beginOperation(FileOperationModel.Kind.MOVE)
            }
            if (files.canShare) {
                SelectionAction(R.string.files_share, count > 0, FILES_SHARE_SELECTED_TAG) { files.share() }
            }
            SelectionAction(R.string.files_export, count > 0, FILES_EXPORT_SELECTED_TAG) { files.beginExport() }
            SelectionAction(R.string.files_delete, count > 0, FILES_DELETE_SELECTED_TAG, destructive = true) {
                files.beginOperation(FileOperationModel.Kind.DELETE)
            }
        }
    }
}

@Composable
private fun SelectionAction(
    label: Int,
    enabled: Boolean,
    tag: String,
    destructive: Boolean = false,
    onClick: () -> Unit,
) {
    TextButton(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp).testTag(tag),
    ) {
        Text(
            stringResource(label),
            color = when {
                !enabled -> Air.colors.textTertiary
                destructive -> Air.colors.danger
                else -> Air.colors.accent
            },
        )
    }
}

/** Loading, a failure with its refresh, and the two kinds of empty. */
private fun LazyListScope.status(state: FolderModel.State, folder: FolderModel, files: FilesScope) {
    val issue = state.issue
    when {
        issue != null -> item(key = "issue") {
            StatusBlock(
                title = stringResource(folderIssueText(issue)),
                action = stringResource(R.string.files_refresh),
                onAction = folder::reload,
                modifier = Modifier.testTag(FILES_REFRESH_TAG),
            )
        }
        state.status == FolderModel.Status.LOADING && state.items.isEmpty() -> item(key = "loading") {
            Row(
                modifier = Modifier.fillMaxWidth().padding(24.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(
                    color = Air.colors.accent,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(20.dp),
                )
                Text(
                    stringResource(R.string.files_loading),
                    style = AirType.subheadline,
                    color = Air.colors.textSecondary,
                )
            }
        }
        state.isNoMatch -> item(key = "no-match") {
            StatusBlock(
                title = stringResource(R.string.files_no_match),
                message = stringResource(R.string.files_no_match_text),
                icon = Icons.Rounded.Search,
                modifier = Modifier.testTag(FILES_EMPTY_TAG),
            )
        }
        state.isEmptyFolder && state.notesOnly -> item(key = "no-notes") {
            StatusBlock(
                title = stringResource(R.string.files_no_notes),
                message = stringResource(R.string.files_no_notes_text),
                icon = Icons.Outlined.Folder,
                action = stringResource(R.string.files_new_note),
                onAction = files::beginNote,
                modifier = Modifier.testTag(FILES_EMPTY_TAG),
            )
        }
        state.isEmptyFolder -> item(key = "empty") {
            StatusBlock(
                title = stringResource(R.string.files_empty),
                message = stringResource(R.string.files_empty_text),
                icon = Icons.Outlined.Folder,
                action = stringResource(R.string.files_new_folder),
                onAction = files::beginCreateFolder,
                modifier = Modifier.testTag(FILES_EMPTY_TAG),
            )
        }
    }
}

/** The items as the rows of one grouped card, each its own list item so a long folder stays lazy. */
private fun LazyListScope.items(state: FolderModel.State, files: FilesScope, folder: FolderModel) {
    val items = state.items
    if (items.isEmpty()) return
    items.forEachIndexed { index, item ->
        item(key = "item:${item.nodeID}") {
            val shape = cardShape(index, items.size)
            Column(modifier = Modifier.padding(horizontal = 16.dp).clip(shape).background(Air.colors.card)) {
                FileRow(item, state, files, folder)
                if (index < items.lastIndex) RowDivider(inset = 66.dp)
            }
        }
    }
    item(key = "total") {
        Row(modifier = Modifier.fillMaxWidth().padding(start = 36.dp, end = 36.dp, top = 8.dp)) {
            Text(stringResource(R.string.files_items), style = AirType.footnote, color = Air.colors.textSecondary)
            Box(modifier = Modifier.weight(1f))
            Text(
                state.total.toString(),
                style = AirType.footnote,
                color = Air.colors.textSecondary,
                modifier = Modifier.testTag(FILES_TOTAL_TAG),
            )
        }
    }
}

private val TopShape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
private val BottomShape = RoundedCornerShape(bottomStart = 24.dp, bottomEnd = 24.dp)

private fun cardShape(index: Int, count: Int): Shape = when {
    count == 1 -> SectionShape
    index == 0 -> TopShape
    index == count - 1 -> BottomShape
    else -> RectangleShape
}

/**
 * A folder or a file: its symbol, name, where it is (in Notes) and size; a
 * chevron into a folder, the information mark on a file. While selecting, a
 * tap chooses it instead.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FileRow(item: CatalogListItem, state: FolderModel.State, files: FilesScope, folder: FolderModel) {
    var menu by remember { mutableStateOf(false) }
    val colors = Air.colors
    val context = LocalContext.current
    val actions = stringResource(R.string.files_actions, item.name)
    val selection = state.selection
    val chosen = selection?.containsKey(item.nodeID) == true
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(
                onClick = { files.open(item) },
                onLongClickLabel = actions,
                onLongClick = { if (selection == null) menu = true },
            )
            .semantics {
                role = Role.Button
                if (selection != null) selected = chosen
            }
            .testTag(fileRowTag(item.name))
            .heightIn(min = 60.dp)
            .padding(start = 20.dp, end = 8.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        if (selection != null) {
            Icon(
                if (chosen) Icons.Rounded.CheckCircle else Icons.Rounded.RadioButtonUnchecked,
                contentDescription = null,
                tint = if (chosen) colors.accent else colors.textSecondary,
                modifier = Modifier.size(24.dp),
            )
        }
        Icon(
            if (item.isDir) Icons.Outlined.Folder else Icons.Outlined.Description,
            contentDescription = null,
            tint = colors.accent,
            modifier = Modifier.size(32.dp),
        )
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                item.name,
                style = AirType.body,
                color = colors.text,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            val parent = item.parentPath
            if (state.notesOnly && parent != null) {
                Text(parent, style = AirType.footnote, color = colors.textSecondary, maxLines = 1)
            }
            val size = item.size
            if (!item.isDir && size != null) {
                Text(
                    Formatter.formatFileSize(context, size),
                    style = AirType.footnote,
                    color = colors.textSecondary,
                )
            }
        }
        if (selection == null) {
            val opens = files.opensViewer(item)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    if (opens) Icons.AutoMirrored.Rounded.KeyboardArrowRight else Icons.Outlined.Info,
                    contentDescription = null,
                    tint = colors.textTertiary,
                    modifier = Modifier.size(if (opens) 22.dp else 20.dp),
                )
                Box {
                    RowAction(
                        Icons.Rounded.MoreHoriz,
                        actions,
                        onClick = { menu = true },
                        modifier = Modifier.testTag(fileActionsTag(item.name)),
                        tint = colors.textSecondary,
                    )
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        AirMenuItem(R.string.files_rename, null, fileMenuTag(item.name, "rename")) {
                            menu = false
                            files.beginRename(item)
                        }
                        AirMenuItem(R.string.files_move, null, fileMenuTag(item.name, "move")) {
                            menu = false
                            files.beginOperation(FileOperationModel.Kind.MOVE, item)
                        }
                        if (!item.isDir && files.canShare) {
                            AirMenuItem(R.string.files_share, null, fileMenuTag(item.name, "share")) {
                                menu = false
                                files.share(item)
                            }
                            AirMenuItem(R.string.files_open_with, null, fileMenuTag(item.name, "open-with")) {
                                menu = false
                                files.openElsewhere(item)
                            }
                        }
                        if (files.device != null && files.savesToGallery(item)) {
                            AirMenuItem(R.string.files_save_gallery, null, fileMenuTag(item.name, "gallery")) {
                                menu = false
                                files.saveToGallery(item)
                            }
                        }
                        if (!item.isDir) {
                            AirMenuItem(R.string.files_export, null, fileMenuTag(item.name, "export")) {
                                menu = false
                                files.beginExport(item)
                            }
                            AirMenuItem(R.string.files_info, null, fileMenuTag(item.name, "info")) {
                                menu = false
                                files.showInfo(item)
                            }
                        }
                        AirMenuItem(R.string.files_delete, null, fileMenuTag(item.name, "delete"), destructive = true) {
                            menu = false
                            files.requestDelete(item)
                        }
                        AirMenuItem(R.string.vault_select, null, fileMenuTag(item.name, "select")) {
                            menu = false
                            folder.beginSelection(item)
                        }
                    }
                }
            }
        }
    }
}

private fun sortLabel(sort: FolderModel.Sort): Int = when (sort) {
    FolderModel.Sort.NAME -> R.string.files_sort_name
    FolderModel.Sort.DATE -> R.string.files_sort_date
    FolderModel.Sort.SIZE -> R.string.files_sort_size
    FolderModel.Sort.TYPE -> R.string.files_sort_type
}
