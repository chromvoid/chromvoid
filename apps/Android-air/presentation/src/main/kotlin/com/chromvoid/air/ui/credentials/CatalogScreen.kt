package com.chromvoid.air.ui.credentials

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.rounded.Sort
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.CreditCard
import androidx.compose.material.icons.rounded.CreateNewFolder
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.FileDownload
import androidx.compose.material.icons.rounded.FileUpload
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.Password
import androidx.compose.material.icons.rounded.Tag
import androidx.compose.material.icons.rounded.RadioButtonUnchecked
import androidx.compose.material.icons.rounded.Sell
import androidx.compose.material.icons.rounded.Terminal
import androidx.compose.material.icons.rounded.Timer
import androidx.compose.material.icons.rounded.VerifiedUser
import androidx.compose.material.icons.rounded.Wallet
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.bridge.wire.CredentialSummary
import com.chromvoid.air.bridge.wire.PassmanagerGroupSummary
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirMenuHeading
import com.chromvoid.air.ui.design.AirMenuItem
import com.chromvoid.air.ui.design.AirSearchField
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirToast
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.ActionRow
import com.chromvoid.air.ui.design.CollectionTile
import com.chromvoid.air.ui.design.HeaderControl
import com.chromvoid.air.ui.design.Monogram
import com.chromvoid.air.ui.design.PillIcon
import com.chromvoid.air.ui.design.RowAction
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.design.SectionHeader
import com.chromvoid.air.ui.design.StatusBlock
import com.chromvoid.air.ui.design.TabBarClearance
import com.chromvoid.air.ui.transfer.TransferMode
import kotlinx.coroutines.delay

public const val CATALOG_SEARCH_TAG: String = "catalog-search"
public const val CATALOG_LIST_TAG: String = "catalog-list"
public const val CATALOG_EMPTY_TAG: String = "catalog-empty"
public const val CATALOG_NO_MATCH_TAG: String = "catalog-no-match"
public const val CATALOG_CLEAR_SEARCH_TAG: String = "catalog-clear-search"
public const val CATALOG_FAILED_TAG: String = "catalog-failed"
public const val CATALOG_NESTED_SECTION_TAG: String = "catalog-section-nested"

public fun catalogRowTag(id: String): String = "catalog-row-$id"

public fun quickCopyTag(id: String): String = "catalog-copy-$id"

public const val CATALOG_FEEDBACK_TAG: String = "catalog-feedback"
public const val CATALOG_CREATE_TAG: String = "catalog-create"

public fun createKindTag(kind: CredentialFormModel.Kind): String = "catalog-create-${kind.name.lowercase()}"

public const val CATALOG_UP_TAG: String = "catalog-up"
public const val CATALOG_LOCK_TAG: String = "lock-vault"
public const val CATALOG_TOOLS_TAG: String = "catalog-tools"
public const val CATALOG_TAGS_TAG: String = "catalog-tags"
public const val CATALOG_TAG_FILTER_TAG: String = "catalog-tag-filter"
public const val CATALOG_OPTIONS_TAG: String = "catalog-options"
public const val CATALOG_AUDIT_TAG: String = "catalog-audit"
public const val CATALOG_SSH_TAG: String = "catalog-ssh"
public const val CATALOG_CODES_TAG: String = "catalog-codes"
public const val CATALOG_PASSKEYS_TAG: String = "catalog-passkeys"
public const val CATALOG_WALLET_TAG: String = "catalog-wallet"
public const val CATALOG_IMPORT_TAG: String = "catalog-import"
public const val CATALOG_EXPORT_TAG: String = "catalog-export"
public const val CATALOG_CLEAR_TAG: String = "catalog-clear"
public const val CATALOG_SELECT_TAG: String = "catalog-select"
public const val SELECTION_COUNT_TAG: String = "selection-count"
public const val SELECTION_DELETE_TAG: String = "selection-delete"
public const val SELECTION_CANCEL_TAG: String = "selection-cancel"
public const val SELECTION_CONFIRM_TAG: String = "selection-confirm"
public const val SELECTION_FAILURES_TAG: String = "selection-failures"

public fun kindTabTag(kind: CatalogOptions.Kind): String = "catalog-kind-${kind.name.lowercase()}"

public fun sectionTag(key: String?): String = "catalog-section-${key.orEmpty()}"

public const val CATALOG_NEW_GROUP_TAG: String = "catalog-new-group"

public fun groupRowTag(path: String): String = "catalog-group-$path"

public fun groupMenuTag(path: String): String = "catalog-group-menu-$path"

public fun sortOptionTag(sort: CatalogOptions.Sort): String = "options-sort-${sort.name.lowercase()}"

public fun quickFilterTag(filter: CatalogOptions.QuickFilter): String = "options-filter-${filter.name.lowercase()}"

public fun groupingTag(grouping: CatalogOptions.Grouping): String = "options-grouping-${grouping.name.lowercase()}"

/** Counts of the root collections, read by the vault scope; null while unknown. */
public data class CollectionCounts(val codes: Long? = null, val ssh: Long? = null, val passkeys: Long? = null)

private const val LOAD_MORE_THRESHOLD = 10

/**
 * One level of the vault, laid out as the iOS vault: a large title with the
 * lock, the tools menu and the add menu; the search field; at the root the
 * collections as tiles; then the Passwords header with its sort-and-filter
 * menu, the subgroups and the records as open rows on the canvas. Scroll and
 * query survive opening a record and coming back; an empty vault and a search
 * that matched nothing are told apart.
 */
@Composable
public fun CatalogScreen(
    model: CatalogModel,
    groups: GroupsModel,
    onOpen: (String) -> Unit,
    onOpenGroup: (String) -> Unit,
    onCreate: (CredentialFormModel.Kind) -> Unit,
    modifier: Modifier = Modifier,
    /** Back to the level below; null on the vault root. */
    onUp: (() -> Unit)? = null,
    onTags: () -> Unit = {},
    onAudit: () -> Unit = {},
    onSsh: () -> Unit = {},
    /** Opens the wallet; null where this client offers none, and the tile stays shown but off. */
    onWallet: (() -> Unit)? = null,
    /** Opens the passkeys; null where this client offers none, and the tile stays shown but off. */
    onPasskeys: (() -> Unit)? = null,
    onCodes: () -> Unit = {},
    onTransfer: (TransferMode) -> Unit = {},
    onLock: () -> Unit = {},
    counts: CollectionCounts = CollectionCounts(),
    /** The record visible beside this catalog in list/detail; independent from bulk selection. */
    openedId: String? = null,
) {
    val state by model.state.collectAsStateWithLifecycle()
    val groupState by groups.state.collectAsStateWithLifecycle()
    val isRoot = onUp == null
    val searching = state.query.isNotBlank()
    // Subgroups belong to browsing; a search looks at records.
    val visibleGroups = if (!searching && state.selection == null) groupState.groups else emptyList()
    val sections = state.sections
    val hasDirectEntries = sections.firstOrNull()?.let { !it.isNested && it.entries.isNotEmpty() } == true
    val list = rememberLazyListState()
    var feedback by remember { mutableStateOf<String?>(null) }
    val copied = stringResource(R.string.vault_copied)
    val issue = state.quickCopyIssue?.second?.let { stringResource(issueText(it)) }
    LaunchedEffect(state.quickCopies) { if (state.quickCopies > 0) feedback = copied }
    LaunchedEffect(state.quickCopyIssue) { if (issue != null) feedback = issue }
    LaunchedEffect(feedback) {
        if (feedback != null) {
            delay(3_000)
            feedback = null
        }
    }
    LaunchedEffect(list, state.canLoadMore) {
        if (!state.canLoadMore) return@LaunchedEffect
        snapshotFlow { list.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 }
            .collect { last -> if (last >= list.layoutInfo.totalItemsCount - LOAD_MORE_THRESHOLD) model.loadMore() }
    }
    Box(modifier = modifier.fillMaxSize()) {
        AirScreen(
            title = if (isRoot) stringResource(R.string.vault_title) else GroupsModel.name(groups.parent),
            onBack = onUp,
            backTag = CATALOG_UP_TAG,
            backDescription = stringResource(R.string.detail_back),
            state = list,
            listTag = CATALOG_LIST_TAG,
            actions = {
                PillIcon(
                    Icons.Outlined.Lock,
                    stringResource(R.string.vault_lock),
                    onClick = onLock,
                    modifier = Modifier.testTag(CATALOG_LOCK_TAG),
                )
                ToolsMenu(model, state, onAudit, onTags, onTransfer)
                AddMenu(onCreate, groups, groupState.busy)
            },
        ) {
            item(key = "search") {
                AirSearchField(
                    value = state.query,
                    onValueChange = model::search,
                    placeholder = stringResource(if (isRoot) R.string.vault_search else R.string.vault_search_group),
                    fieldModifier = Modifier.testTag(CATALOG_SEARCH_TAG),
                    clearDescription = stringResource(R.string.vault_clear_search),
                    clearModifier = Modifier.testTag(CATALOG_CLEAR_SEARCH_TAG),
                )
            }
            if (isRoot && !searching && state.selection == null) {
                item(key = "collections") { Collections(counts, onCodes, onSsh, onWallet, onPasskeys) }
            }
            val selection = state.selection
            if (selection != null) {
                item(key = "selection") { SelectionBar(state, selection.size, model) }
            }
            item(key = "passwords-header") {
                SectionHeader(
                    stringResource(if (isRoot) R.string.vault_passwords else R.string.vault_groups),
                    count = state.totalCount?.takeIf { isRoot && !searching && !state.options.hasFilters }?.toString(),
                    trailing = { OptionsMenu(state.options, model::setOptions) },
                )
            }
            filterRows(state, model)
            status(state, model, isRoot, visibleGroups.isEmpty())
            visibleGroups.forEachIndexed { index, group ->
                item(key = "group:${group.path}") {
                    GroupRow(group, groups, onOpen = { onOpenGroup(group.path) })
                    if (index < visibleGroups.lastIndex || hasDirectEntries) RowDivider(inset = 62.dp)
                }
            }
            entries(sections, state, model, onOpen, openedId)
            if (state.loadingMore) {
                item(key = "more") {
                    Box(modifier = Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Air.colors.accent)
                    }
                }
            }
            item(key = "clearance") { TabBarClearance() }
        }
        GroupDialogs(groups, groupState)
        feedback?.let { text ->
            AirToast(
                text,
                Icons.Rounded.Check,
                tag = CATALOG_FEEDBACK_TAG,
                modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 96.dp),
            )
        }
    }
}

/** Codes, passkeys, SSH keys and the wallet as a grid of tiles above the passwords. */
@Composable
private fun Collections(
    counts: CollectionCounts,
    onCodes: () -> Unit,
    onSsh: () -> Unit,
    onWallet: (() -> Unit)?,
    onPasskeys: (() -> Unit)?,
) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            CollectionTile(
                stringResource(R.string.vault_codes),
                Icons.Rounded.Tag,
                counts.codes?.toString(),
                onClick = onCodes,
                modifier = Modifier.weight(1f).testTag(CATALOG_CODES_TAG),
            )
            CollectionTile(
                stringResource(R.string.vault_passkeys),
                Icons.Rounded.Key,
                counts.passkeys?.toString(),
                onClick = { onPasskeys?.invoke() },
                enabled = onPasskeys != null,
                modifier = Modifier.weight(1f).testTag(CATALOG_PASSKEYS_TAG),
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            CollectionTile(
                stringResource(R.string.vault_ssh),
                Icons.Rounded.Terminal,
                counts.ssh?.toString(),
                onClick = onSsh,
                modifier = Modifier.weight(1f).testTag(CATALOG_SSH_TAG),
            )
            CollectionTile(
                stringResource(R.string.vault_wallet),
                Icons.Rounded.Wallet,
                null,
                onClick = { onWallet?.invoke() },
                enabled = onWallet != null,
                modifier = Modifier.weight(1f).testTag(CATALOG_WALLET_TAG),
            )
        }
    }
}

/** Select, audit and tags, then import, export and clear: the tools that are not navigation. */
@Composable
private fun ToolsMenu(
    model: CatalogModel,
    state: CatalogModel.State,
    onAudit: () -> Unit,
    onTags: () -> Unit,
    onTransfer: (TransferMode) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    Box {
        PillIcon(
            Icons.Rounded.MoreHoriz,
            stringResource(R.string.vault_more),
            onClick = { open = true },
            modifier = Modifier.testTag(CATALOG_TOOLS_TAG),
        )
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            AirMenuItem(
                R.string.vault_select,
                Icons.Rounded.CheckCircle,
                CATALOG_SELECT_TAG,
                enabled = state.entries.isNotEmpty(),
            ) {
                open = false
                model.beginSelection()
            }
            AirMenuItem(R.string.vault_audit, Icons.Rounded.VerifiedUser, CATALOG_AUDIT_TAG) {
                open = false
                onAudit()
            }
            AirMenuItem(R.string.vault_tags, Icons.Rounded.Sell, CATALOG_TAGS_TAG) {
                open = false
                onTags()
            }
            HorizontalDivider()
            AirMenuItem(R.string.vault_import, Icons.Rounded.FileDownload, CATALOG_IMPORT_TAG) {
                open = false
                onTransfer(TransferMode.IMPORT)
            }
            AirMenuItem(R.string.vault_export, Icons.Rounded.FileUpload, CATALOG_EXPORT_TAG) {
                open = false
                onTransfer(TransferMode.EXPORT)
            }
            AirMenuItem(R.string.vault_clear, Icons.Rounded.DeleteOutline, CATALOG_CLEAR_TAG, destructive = true) {
                open = false
                onTransfer(TransferMode.CLEAR)
            }
        }
    }
}

/** A new login, a new card or a new group here. */
@Composable
private fun AddMenu(onCreate: (CredentialFormModel.Kind) -> Unit, groups: GroupsModel, busy: Boolean) {
    var open by remember { mutableStateOf(false) }
    Box {
        PillIcon(
            Icons.Rounded.Add,
            stringResource(R.string.vault_add),
            onClick = { open = true },
            modifier = Modifier.testTag(CATALOG_CREATE_TAG),
        )
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            AirMenuItem(
                R.string.vault_new_login,
                Icons.Rounded.Password,
                createKindTag(CredentialFormModel.Kind.LOGIN),
            ) {
                open = false
                onCreate(CredentialFormModel.Kind.LOGIN)
            }
            AirMenuItem(
                R.string.vault_new_card,
                Icons.Rounded.CreditCard,
                createKindTag(CredentialFormModel.Kind.CARD),
            ) {
                open = false
                onCreate(CredentialFormModel.Kind.CARD)
            }
            AirMenuItem(
                R.string.vault_new_group,
                Icons.Rounded.CreateNewFolder,
                CATALOG_NEW_GROUP_TAG,
                enabled = !busy,
            ) {
                open = false
                groups.beginCreate()
            }
        }
    }
}

/** Sort, order, type, grouping and quick filters: one menu in the Passwords header. */
@Composable
private fun OptionsMenu(options: CatalogOptions, onChange: (CatalogOptions) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        HeaderControl(
            stringResource(sortLabel(options.sort)),
            Icons.AutoMirrored.Rounded.Sort,
            onClick = { open = true },
            modifier = Modifier.testTag(CATALOG_OPTIONS_TAG),
        )
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            AirMenuHeading(R.string.vault_sort_by)
            CatalogOptions.Sort.entries.forEach { sort ->
                AirMenuItem(sortLabel(sort), null, sortOptionTag(sort), checked = options.sort == sort) {
                    open = false
                    onChange(options.copy(sort = sort))
                }
            }
            HorizontalDivider()
            AirMenuItem(R.string.vault_ascending, null, "options-ascending", checked = !options.descending) {
                open = false
                onChange(options.copy(descending = false))
            }
            AirMenuItem(R.string.vault_descending, null, "options-descending", checked = options.descending) {
                open = false
                onChange(options.copy(descending = true))
            }
            HorizontalDivider()
            AirMenuHeading(R.string.vault_type)
            listOf(
                CatalogOptions.Kind.ALL to R.string.vault_all_types,
                CatalogOptions.Kind.LOGINS to R.string.vault_type_login,
                CatalogOptions.Kind.CARDS to R.string.vault_type_card,
            ).forEach { (kind, label) ->
                AirMenuItem(label, null, kindTabTag(kind), checked = options.kind == kind) {
                    open = false
                    onChange(options.copy(kind = kind))
                }
            }
            HorizontalDivider()
            AirMenuHeading(R.string.vault_group_by)
            CatalogOptions.Grouping.entries.forEach { grouping ->
                AirMenuItem(
                    groupingLabel(grouping),
                    null,
                    groupingTag(grouping),
                    checked = options.grouping == grouping,
                ) {
                    open = false
                    onChange(options.copy(grouping = grouping))
                }
            }
            HorizontalDivider()
            AirMenuHeading(R.string.vault_quick_filters)
            CatalogOptions.QuickFilter.entries.forEach { filter ->
                val on = filter in options.quickFilters
                AirMenuItem(filterLabel(filter), null, quickFilterTag(filter), checked = on) {
                    open = false
                    onChange(options.copy(
                        quickFilters = if (on) options.quickFilters - filter else options.quickFilters + filter,
                    ))
                }
            }
        }
    }
}

/** The active tag, type and quick filters, each a way back to everything. */
private fun LazyListScope.filterRows(state: CatalogModel.State, model: CatalogModel) {
    val tag = state.tag
    if (tag == null && !state.options.hasFilters) return
    item(key = "filters") {
        Column(modifier = Modifier.padding(horizontal = 4.dp)) {
            if (tag != null) {
                ActionRow(
                    stringResource(R.string.vault_clear_tag) + " · " + tag.label,
                    onClick = { model.filterTag(null) },
                    icon = Icons.Rounded.Close,
                    modifier = Modifier.testTag(CATALOG_TAG_FILTER_TAG),
                )
            }
            if (state.options.hasFilters) {
                ActionRow(
                    stringResource(R.string.vault_clear_filters),
                    onClick = model::clearFilters,
                    icon = Icons.Rounded.Close,
                )
            }
        }
    }
}

/** Loading, failure and the two kinds of empty: an empty vault and a search that found nothing. */
private fun LazyListScope.status(state: CatalogModel.State, model: CatalogModel, isRoot: Boolean, noGroups: Boolean) {
    when {
        state.status == CatalogModel.Status.FAILED -> item(key = "failed") {
            StatusBlock(
                stringResource(R.string.vault_failed),
                message = stringResource(R.string.catalog_failed),
                action = stringResource(R.string.vault_try_again),
                onAction = { model.reload() },
                modifier = Modifier.testTag(CATALOG_FAILED_TAG),
            )
        }
        state.isEmptyVault && noGroups -> item(key = "empty") {
            StatusBlock(
                stringResource(if (isRoot) R.string.vault_empty else R.string.vault_group_empty),
                message = if (isRoot) stringResource(R.string.vault_empty_text) else null,
                modifier = Modifier.testTag(CATALOG_EMPTY_TAG),
            )
        }
        state.isNoMatch -> item(key = "no-match") {
            StatusBlock(
                stringResource(R.string.vault_no_match),
                message = stringResource(R.string.vault_no_match_text),
                action = stringResource(
                    if (state.query.isBlank()) R.string.vault_clear_filters else R.string.vault_clear_search,
                ),
                onAction = if (state.query.isBlank()) model::clearFilters else model::clearSearch,
                modifier = Modifier.testTag(CATALOG_NO_MATCH_TAG),
            )
        }
        state.entries.isEmpty() && state.status == CatalogModel.Status.LOADING -> item(key = "loading") {
            Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Air.colors.accent)
            }
        }
    }
}

/** The model separates this level's records from nested groups and preserves Core's chosen grouping. */
private fun LazyListScope.entries(
    sections: List<CatalogModel.Section>,
    state: CatalogModel.State,
    model: CatalogModel,
    onOpen: (String) -> Unit,
    openedId: String?,
) {
    sections.forEach { section ->
        if (section.isNested) {
            item(key = CATALOG_NESTED_SECTION_TAG) {
                SectionHeader(
                    stringResource(R.string.vault_nested_groups),
                    modifier = Modifier.testTag(CATALOG_NESTED_SECTION_TAG),
                )
            }
        } else if (state.options.grouping != CatalogOptions.Grouping.NONE) {
            item(key = "section:${state.options.grouping}:${section.groupKey}") {
                val title = sectionTitle(
                    state.options.grouping,
                    section.groupKey,
                )?.let { stringResource(it) } ?: section.groupKey.orEmpty()
                SectionHeader(title, modifier = Modifier.testTag(sectionTag(section.groupKey)))
            }
        }
        section.entries.forEachIndexed { index, entry ->
            item(key = entry.id) {
                EntryRow(
                    entry,
                    copying = state.quickCopying == entry.id,
                    selected = state.selection?.let { entry.id in it },
                    opened = openedId?.let { entry.id == it },
                    onClick = { if (state.selection != null) model.toggleSelection(entry.id) else onOpen(entry.id) },
                    onLongPress = { model.beginSelection(entry.id) },
                    onQuickCopy = { model.quickCopy(entry) },
                    icons = model.icons,
                )
                if (index < section.entries.lastIndex) RowDivider(inset = 78.dp)
            }
        }
    }
}

/**
 * A record as an open row on the canvas: its monogram, name, login and
 * website, a timer glyph when it has codes, and one-tap copy of its password
 * or card number.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun EntryRow(
    entry: CredentialSummary,
    copying: Boolean,
    /** Null when not selecting; otherwise whether this record is chosen. */
    selected: Boolean?,
    /** Null outside an active list/detail context. */
    opened: Boolean?,
    onClick: () -> Unit,
    onLongPress: () -> Unit,
    onQuickCopy: () -> Unit,
    icons: CredentialIconCache?,
) {
    val colors = Air.colors
    val detail = listOfNotNull(entry.username.takeIf { it.isNotBlank() }, entry.website?.takeIf { it.isNotBlank() })
        .joinToString(" · ")
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (opened == true && selected == null) Modifier.background(colors.surfaceSecondary) else Modifier)
            .combinedClickable(onClick = onClick, onLongClick = onLongPress)
            .semantics {
                if (opened != null) this.selected = selected ?: opened
            }
            .testTag(catalogRowTag(entry.id))
            .heightIn(min = 72.dp)
            .padding(start = 20.dp, end = 8.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        if (selected != null) {
            Icon(
                if (selected) Icons.Rounded.CheckCircle else Icons.Rounded.RadioButtonUnchecked,
                contentDescription = null,
                tint = if (selected) colors.accent else colors.textSecondary,
                modifier = Modifier.size(26.dp),
            )
        }
        EntryIcon(entry.title, entry.entryType, entry.iconRef, icons)
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                entry.title,
                style = AirType.headline,
                color = colors.text,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (detail.isNotEmpty() || entry.hasCodes == true) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    if (entry.hasCodes == true) {
                        Icon(
                            Icons.Rounded.Timer,
                            contentDescription = stringResource(R.string.vault_has_codes),
                            tint = colors.accent,
                            modifier = Modifier.size(15.dp),
                        )
                    }
                    if (detail.isNotEmpty()) {
                        Text(
                            detail,
                            style = AirType.subheadline,
                            color = colors.textSecondary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
            if (entry.groupPath.isNotBlank() && entry.groupPath != "/") {
                Text(entry.groupPath, style = AirType.caption, color = colors.textSecondary, maxLines = 1)
            }
        }
        if (selected == null && CatalogModel.primarySecret(entry.entryType) != null) {
            if (copying) {
                Box(modifier = Modifier.size(48.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(
                        strokeWidth = 2.dp,
                        color = colors.accent,
                        modifier = Modifier.size(20.dp),
                    )
                }
            } else {
                RowAction(
                    Icons.Rounded.ContentCopy,
                    stringResource(
                        if (entry.entryType == "payment_card") {
                            R.string.vault_copy_number
                        } else {
                            R.string.vault_copy_password
                        },
                    ),
                    onClick = onQuickCopy,
                    modifier = Modifier.testTag(quickCopyTag(entry.id)),
                )
            }
        }
    }
}

/** A subgroup opens on tap; its overflow and labeled long press offer the same actions. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun GroupRow(group: PassmanagerGroupSummary, groups: GroupsModel, onOpen: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    val colors = Air.colors
    val actions = stringResource(R.string.group_actions)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(
                role = Role.Button,
                onClick = onOpen,
                onLongClickLabel = actions,
                onLongClick = { menu = true },
            )
            .testTag(groupRowTag(group.path))
            .heightIn(min = 56.dp)
            .padding(start = 20.dp, end = 8.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Icon(Icons.Rounded.Folder, contentDescription = null, tint = colors.accent, modifier = Modifier.size(28.dp))
        Text(
            GroupsModel.name(group.path),
            style = AirType.body,
            color = colors.text,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(group.entryCount.toString(), style = AirType.subheadline, color = colors.textSecondary)
            Icon(
                Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                contentDescription = null,
                tint = colors.textTertiary,
                modifier = Modifier.size(22.dp),
            )
            Box {
                RowAction(
                    Icons.Rounded.MoreHoriz,
                    actions,
                    onClick = { menu = true },
                    modifier = Modifier.testTag(groupMenuTag(group.path)),
                    tint = colors.textSecondary,
                )
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    AirMenuItem(R.string.group_rename, null, "group-rename-${group.path}") {
                        menu = false
                        groups.beginRename(group.path)
                    }
                    AirMenuItem(R.string.group_delete, null, "group-delete-${group.path}", destructive = true) {
                        menu = false
                        groups.requestDelete(group.path)
                    }
                }
            }
        }
    }
}

/** The count, the delete and the way out of selection; failures say how many stayed. */
@Composable
private fun SelectionBar(state: CatalogModel.State, count: Int, model: CatalogModel) {
    AirSection {
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 4.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                pluralStringResource(R.plurals.select_count, count, count),
                style = AirType.headline,
                color = Air.colors.text,
                modifier = Modifier.weight(1f).testTag(SELECTION_COUNT_TAG),
            )
            TextButton(
                onClick = model::requestDelete,
                enabled = count > 0 && !state.deleting,
                modifier = Modifier.testTag(SELECTION_DELETE_TAG),
            ) {
                Text(
                    stringResource(R.string.group_delete),
                    color = if (count > 0) Air.colors.danger else Air.colors.textTertiary,
                )
            }
            TextButton(
                onClick = model::endSelection,
                enabled = !state.deleting,
                modifier = Modifier.testTag(SELECTION_CANCEL_TAG),
            ) {
                Text(stringResource(R.string.form_keep_cancel), color = Air.colors.accent)
            }
        }
        if (state.deleting) {
            androidx.compose.material3.LinearProgressIndicator(
                color = Air.colors.accent,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (state.deleteFailures > 0) {
            Text(
                pluralStringResource(R.plurals.select_failures, state.deleteFailures, state.deleteFailures),
                color = Air.colors.danger,
                style = AirType.footnote,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp).testTag(SELECTION_FAILURES_TAG),
            )
        }
    }
    if (state.confirmingDelete) {
        AlertDialog(
            onDismissRequest = model::cancelDelete,
            title = { Text(pluralStringResource(R.plurals.select_delete_title, count, count)) },
            text = { Text(stringResource(R.string.select_delete_text)) },
            confirmButton = {
                TextButton(onClick = model::confirmDelete, modifier = Modifier.testTag(SELECTION_CONFIRM_TAG)) {
                    Text(stringResource(R.string.group_delete), color = Air.colors.danger)
                }
            },
            dismissButton = {
                TextButton(onClick = model::cancelDelete) { Text(stringResource(R.string.form_keep_cancel)) }
            },
        )
    }
}

private fun sortLabel(sort: CatalogOptions.Sort): Int = when (sort) {
    CatalogOptions.Sort.NAME -> R.string.options_sort_name
    CatalogOptions.Sort.USERNAME -> R.string.options_sort_username
    CatalogOptions.Sort.WEBSITE -> R.string.options_sort_website
    CatalogOptions.Sort.CREATED -> R.string.options_sort_created
    CatalogOptions.Sort.MODIFIED -> R.string.options_sort_modified
}

private fun filterLabel(filter: CatalogOptions.QuickFilter): Int = when (filter) {
    CatalogOptions.QuickFilter.RECENT -> R.string.options_filter_recent
    CatalogOptions.QuickFilter.WITH_CODES -> R.string.options_filter_codes
    CatalogOptions.QuickFilter.WITH_SSH -> R.string.options_filter_ssh
}

private fun groupingLabel(grouping: CatalogOptions.Grouping): Int = when (grouping) {
    CatalogOptions.Grouping.NONE -> R.string.options_grouping_none
    CatalogOptions.Grouping.WEBSITE -> R.string.options_grouping_website
    CatalogOptions.Grouping.MODIFIED -> R.string.options_grouping_modified
    CatalogOptions.Grouping.SECURITY -> R.string.options_grouping_security
}

/** The name dialog for a new or renamed group, and the delete confirmation. */
@Composable
private fun GroupDialogs(groups: GroupsModel, state: GroupsModel.State) {
    val edit = state.edit
    if (edit != null) {
        val initial = (edit as? GroupsModel.Edit.Rename)?.let { GroupsModel.name(it.path) }.orEmpty()
        val name = remember(edit) { TextFieldState(initialText = initial) }
        AlertDialog(
            onDismissRequest = groups::cancelEdit,
            title = {
                Text(stringResource(if (edit is GroupsModel.Edit.Rename) R.string.group_rename else R.string.group_new))
            },
            text = {
                GroupNameField(
                    state = name,
                    error = state.issue?.let { stringResource(groupIssueText(it)) },
                    modifier = Modifier.testTag(GROUP_NAME_TAG),
                )
            },
            confirmButton = {
                TextButton(
                    onClick = { groups.save(name.text.toString()) },
                    enabled = !state.busy,
                    modifier = Modifier.testTag(GROUP_SAVE_TAG),
                ) {
                    Text(stringResource(R.string.form_save))
                }
            },
            dismissButton = {
                TextButton(onClick = groups::cancelEdit) { Text(stringResource(R.string.form_keep_cancel)) }
            },
        )
    }
    val deleting = state.deleting
    if (deleting != null) {
        AlertDialog(
            onDismissRequest = groups::cancelDelete,
            title = { Text(stringResource(R.string.group_delete_title, GroupsModel.name(deleting))) },
            text = { Text(stringResource(R.string.group_delete_text)) },
            confirmButton = {
                TextButton(onClick = groups::confirmDelete, modifier = Modifier.testTag(GROUP_DELETE_CONFIRM_TAG)) {
                    Text(stringResource(R.string.group_delete))
                }
            },
            dismissButton = {
                TextButton(onClick = groups::cancelDelete) { Text(stringResource(R.string.form_keep_cancel)) }
            },
        )
    }
    if (edit == null && state.issue != null) {
        AlertDialog(
            onDismissRequest = groups::cancelEdit,
            text = { Text(stringResource(groupIssueText(state.issue))) },
            confirmButton = { TextButton(onClick = groups::cancelEdit) { Text(stringResource(R.string.action_ok)) } },
        )
    }
}

public const val GROUP_NAME_TAG: String = "group-name"
public const val GROUP_SAVE_TAG: String = "group-save"
public const val GROUP_DELETE_CONFIRM_TAG: String = "group-delete-confirm"

internal fun groupIssueText(issue: GroupsModel.Issue): Int = when (issue) {
    GroupsModel.Issue.NAME_INVALID -> R.string.group_issue_name_invalid
    GroupsModel.Issue.NAME_TAKEN -> R.string.group_issue_name_taken
    GroupsModel.Issue.DENIED -> R.string.form_issue_denied
    GroupsModel.Issue.FAILED -> R.string.group_issue_failed
}
