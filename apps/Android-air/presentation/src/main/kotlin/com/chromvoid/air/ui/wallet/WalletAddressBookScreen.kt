package com.chromvoid.air.ui.wallet

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Contacts
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.bridge.wire.WalletAddressBookEntry
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.ActionRow
import com.chromvoid.air.ui.design.AirMenuItem
import com.chromvoid.air.ui.design.AirRow
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.DoneButton
import com.chromvoid.air.ui.design.PillIcon
import com.chromvoid.air.ui.design.PillText
import com.chromvoid.air.ui.design.RowAction
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.design.StatusBlock
import com.chromvoid.air.ui.design.airEditableField
import com.chromvoid.air.ui.root.CoversTabBar

public const val CONTACTS_TAG: String = "wallet-contacts"
public const val CONTACTS_DONE_TAG: String = "wallet-contacts-done"
public const val CONTACTS_ADD_TAG: String = "wallet-contacts-add"
public const val CONTACTS_EMPTY_TAG: String = "wallet-contacts-empty"
public const val CONTACTS_ISSUE_TAG: String = "wallet-contacts-issue"
public const val CONTACTS_CHECKED_TAG: String = "wallet-contacts-checked"
public const val CONTACT_COPY_TAG: String = "wallet-contact-copy"
public const val CONTACT_EDIT_TAG: String = "wallet-contact-edit"
public const val CONTACT_DELETE_TAG: String = "wallet-contact-delete"
public const val CONTACT_DELETE_CONFIRM_TAG: String = "wallet-contact-delete-confirm"
public const val CONTACT_EDITOR_TAG: String = "wallet-contact-editor"
public const val CONTACT_CANCEL_TAG: String = "wallet-contact-cancel"
public const val CONTACT_SAVE_TAG: String = "wallet-contact-save"
public const val CONTACT_ISSUE_TAG: String = "wallet-contact-issue"
public const val CONTACT_DISCARD_TAG: String = "wallet-contact-discard"

public fun contactTag(id: String): String = "wallet-contact-$id"

public fun contactMenuTag(id: String): String = "wallet-contact-menu-$id"

public fun contactFieldTag(field: WalletAddressBookModel.Field): String = "wallet-contact-${field.name.lowercase()}"

public fun contactNetworkTag(network: String): String = "wallet-contact-network-$network"

/**
 * The address book, as the iOS sheet: the saved contacts with their network
 * and address, a menu on each to copy, edit or delete it, and the editor
 * drawn over the list for a new contact or a change.
 */
@Composable
internal fun WalletAddressBookScreen(model: WalletAddressBookModel, onClose: () -> Unit, onLock: () -> Unit) {
    CoversTabBar()
    val state by model.state.collectAsStateWithLifecycle()
    BackHandler(enabled = state.draft == null) { if (state.canDismiss) onClose() }
    val ready = state.phase == WalletAddressBookModel.Phase.READY
    val idle = state.mutation == WalletAddressBookModel.Mutation.IDLE
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Air.colors.canvas)
            .pointerInput(Unit) { detectTapGestures {} }
            .testTag(CONTACTS_TAG),
    ) {
        AirScreen(
            title = stringResource(R.string.wallet_address_book),
            leading = {
                DoneButton(
                    stringResource(R.string.tags_done),
                    onClick = { if (state.canDismiss) onClose() },
                    modifier = Modifier.testTag(CONTACTS_DONE_TAG),
                )
            },
            actions = {
                PillIcon(
                    Icons.Rounded.Add,
                    stringResource(R.string.wallet_add_contact),
                    onClick = model::add,
                    enabled = ready && idle,
                    modifier = Modifier.testTag(CONTACTS_ADD_TAG),
                )
                PillIcon(Icons.Outlined.Lock, stringResource(R.string.vault_lock), onClick = onLock)
            },
        ) {
            if (state.mutation == WalletAddressBookModel.Mutation.WORKING) {
                item(key = "saving") { Loading(R.string.wallet_contacts_saving) }
            }
            val issue = state.issue
            if (issue != null && state.draft == null) {
                item(key = "issue") {
                    AirSection(modifier = Modifier.testTag(CONTACTS_ISSUE_TAG)) {
                        AirRow(title = stringResource(contactIssueText(issue)), titleColor = Air.colors.danger)
                        if (state.mutation == WalletAddressBookModel.Mutation.UNCERTAIN) {
                            RowDivider()
                            ActionRow(
                                stringResource(R.string.wallet_contacts_checked),
                                onClick = model::acknowledgeReconciliation,
                                enabled = ready,
                                modifier = Modifier.testTag(CONTACTS_CHECKED_TAG),
                            )
                        }
                    }
                }
            }
            when (state.phase) {
                WalletAddressBookModel.Phase.LOADING -> item(key = "loading") {
                    Loading(R.string.wallet_contacts_loading)
                }
                WalletAddressBookModel.Phase.FAILED -> item(key = "failed") {
                    StatusBlock(
                        stringResource(R.string.wallet_contacts_failed),
                        action = stringResource(R.string.vault_try_again),
                        onAction = model::reload,
                    )
                }
                WalletAddressBookModel.Phase.REVOKED -> item(key = "revoked") {
                    StatusBlock(stringResource(R.string.gen_issue_revoked))
                }
                WalletAddressBookModel.Phase.READY -> if (state.entries.isEmpty()) {
                    item(key = "empty") {
                        StatusBlock(
                            stringResource(R.string.wallet_contacts_empty),
                            message = stringResource(R.string.wallet_contacts_empty_text),
                            icon = Icons.Outlined.Contacts,
                            modifier = Modifier.testTag(CONTACTS_EMPTY_TAG),
                        )
                    }
                } else {
                    item(key = "entries") {
                        AirSection {
                            state.entries.forEachIndexed { index, entry ->
                                if (index > 0) RowDivider()
                                ContactRow(model, entry, copied = state.copiedId == entry.entryID, enabled = idle)
                            }
                        }
                    }
                }
            }
        }
    }
    if (state.draft != null) ContactEditor(model, state)
    state.pendingDeletion?.let { entry ->
        AlertDialog(
            onDismissRequest = model::cancelDeletion,
            title = { Text(stringResource(R.string.wallet_delete_contact_title)) },
            text = {
                Text(listOf(entry.label, WalletNetwork.displayName(entry.network), entry.address).joinToString("\n"))
            },
            confirmButton = {
                TextButton(onClick = model::confirmDeletion, modifier = Modifier.testTag(CONTACT_DELETE_CONFIRM_TAG)) {
                    Text(stringResource(R.string.wallet_delete_contact), color = Air.colors.danger)
                }
            },
            dismissButton = {
                TextButton(onClick = model::cancelDeletion) { Text(stringResource(R.string.form_cancel)) }
            },
        )
    }
}

@Composable
private fun ContactRow(
    model: WalletAddressBookModel,
    entry: WalletAddressBookEntry,
    copied: Boolean,
    enabled: Boolean,
) {
    val colors = Air.colors
    var menu by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled, role = Role.Button) { model.edit(entry.entryID) }
            .heightIn(min = 64.dp)
            .padding(start = 20.dp, end = 8.dp, top = 10.dp, bottom = 10.dp)
            .testTag(contactTag(entry.entryID)),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        NetworkBadge(entry.network)
        Column(
            modifier = Modifier.weight(1f).padding(start = 14.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(entry.label, style = AirType.body, color = colors.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(WalletNetwork.displayName(entry.network), style = AirType.subheadline, color = colors.textSecondary)
            Text(
                entry.address,
                style = AirType.caption.copy(fontFamily = FontFamily.Monospace),
                color = colors.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.MiddleEllipsis,
            )
            if (copied) {
                Text(stringResource(R.string.wallet_address_copied), style = AirType.caption, color = colors.accent)
            }
        }
        Box {
            RowAction(
                Icons.Rounded.MoreHoriz,
                stringResource(R.string.vault_more),
                onClick = { menu = true },
                enabled = enabled,
                modifier = Modifier.testTag(contactMenuTag(entry.entryID)),
            )
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                AirMenuItem(R.string.wallet_copy_address, Icons.Outlined.ContentCopy, CONTACT_COPY_TAG) {
                    menu = false
                    model.copyAddress(entry.entryID)
                }
                AirMenuItem(R.string.action_edit, Icons.Outlined.Edit, CONTACT_EDIT_TAG) {
                    menu = false
                    model.edit(entry.entryID)
                }
                AirMenuItem(
                    R.string.wallet_delete_contact,
                    Icons.Outlined.Delete,
                    CONTACT_DELETE_TAG,
                    destructive = true,
                ) {
                    menu = false
                    model.requestDeletion(entry.entryID)
                }
            }
        }
    }
}

/** A new contact or a change to one, drawn over the address book. */
@Composable
private fun ContactEditor(model: WalletAddressBookModel, state: WalletAddressBookModel.State) {
    val draft = state.draft ?: return
    BackHandler(onBack = model::closeEditor)
    val working = state.mutation == WalletAddressBookModel.Mutation.WORKING
    val requesters = remember { WalletAddressBookModel.Field.entries.associateWith { FocusRequester() } }
    val listState = rememberLazyListState()
    LaunchedEffect(state.focusRevision) {
        val field = state.invalidField ?: return@LaunchedEffect
        val key = when (field) {
            WalletAddressBookModel.Field.LABEL -> "name"
            WalletAddressBookModel.Field.NETWORK -> "networks"
            WalletAddressBookModel.Field.ADDRESS -> "address"
        }
        val keys = listOfNotNull(if (state.issue != null) "issue" else null, "name", "networks", "address")
        if (listState.layoutInfo.visibleItemsInfo.none { it.key == key }) {
            listState.animateScrollToItem(keys.indexOf(key))
        }
        runCatching { requesters.getValue(field).requestFocus() }
    }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Air.colors.canvas)
            .pointerInput(Unit) { detectTapGestures {} }
            .testTag(CONTACT_EDITOR_TAG),
    ) {
        AirScreen(
            title = stringResource(
                if (draft.entryId == null) R.string.wallet_add_contact else R.string.wallet_edit_contact,
            ),
            largeTitle = false,
            state = listState,
            leading = {
                DoneButton(
                    stringResource(R.string.form_cancel),
                    onClick = model::closeEditor,
                    modifier = Modifier.testTag(CONTACT_CANCEL_TAG),
                )
            },
            actions = {
                PillText(
                    stringResource(R.string.form_save),
                    onClick = model::save,
                    enabled = state.mutation == WalletAddressBookModel.Mutation.IDLE &&
                        state.phase == WalletAddressBookModel.Phase.READY,
                    emphasized = true,
                    modifier = Modifier.testTag(CONTACT_SAVE_TAG),
                )
            },
        ) {
            state.issue?.let { issue ->
                item(key = "issue") {
                    AirSection(modifier = Modifier.testTag(CONTACT_ISSUE_TAG)) {
                        AirRow(title = stringResource(contactIssueText(issue)), titleColor = Air.colors.danger)
                    }
                }
            }
            item(key = "name") {
                AirSection {
                    ContactField(
                        model,
                        state,
                        WalletAddressBookModel.Field.LABEL,
                        stringResource(R.string.form_name),
                        requesters,
                        enabled = !working,
                    )
                }
            }
            item(key = "networks") {
                val networks = state.networks + listOfNotNull(draft.network?.takeIf { it !in state.networks })
                AirSection(header = stringResource(R.string.wallet_network)) {
                    if (networks.isEmpty()) {
                        AirRow(
                            title = stringResource(R.string.wallet_choose_network),
                            titleColor = Air.colors.textSecondary,
                        )
                    }
                    val networkFocus = requesters.getValue(WalletAddressBookModel.Field.NETWORK)
                    networks.forEachIndexed { index, network ->
                        if (index > 0) RowDivider()
                        val chosen = draft.network == network
                        AirRow(
                            title = WalletNetwork.displayName(network),
                            enabled = !working && network in state.networks,
                            onClick = { model.change(WalletAddressBookModel.Field.NETWORK, network) },
                            modifier = Modifier
                                .semantics { selected = chosen }
                                .then(if (index == 0) Modifier.focusRequester(networkFocus) else Modifier)
                                .testTag(contactNetworkTag(network)),
                            trailing = {
                                if (chosen) {
                                    Icon(Icons.Rounded.Check, contentDescription = null, tint = Air.colors.accent)
                                }
                            },
                        )
                    }
                }
            }
            item(key = "address") {
                AirSection(
                    header = stringResource(R.string.wallet_address),
                    footer = stringResource(R.string.wallet_contact_footer),
                ) {
                    ContactField(
                        model,
                        state,
                        WalletAddressBookModel.Field.ADDRESS,
                        stringResource(R.string.wallet_address),
                        requesters,
                        enabled = !working,
                    )
                }
            }
            if (working) item(key = "saving") { Loading(R.string.wallet_contacts_saving) }
        }
    }
    if (state.discardRequested) {
        AlertDialog(
            onDismissRequest = model::keepEditing,
            title = { Text(stringResource(R.string.form_discard_title)) },
            confirmButton = {
                TextButton(onClick = model::discard, modifier = Modifier.testTag(CONTACT_DISCARD_TAG)) {
                    Text(stringResource(R.string.form_discard), color = Air.colors.danger)
                }
            },
            dismissButton = { TextButton(onClick = model::keepEditing) { Text(stringResource(R.string.form_keep)) } },
        )
    }
}

@Composable
private fun ContactField(
    model: WalletAddressBookModel,
    state: WalletAddressBookModel.State,
    field: WalletAddressBookModel.Field,
    label: String,
    requesters: Map<WalletAddressBookModel.Field, FocusRequester>,
    enabled: Boolean,
) {
    val value = state.value(field)
    val address = field == WalletAddressBookModel.Field.ADDRESS
    val error = state.issue?.takeIf { state.invalidField == field }?.let { stringResource(contactIssueText(it)) }
    Column(
        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 20.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Text(label, style = AirType.footnote, color = Air.colors.textSecondary)
        BasicTextField(
            value = value,
            onValueChange = { model.change(field, it) },
            enabled = enabled,
            singleLine = !address,
            textStyle = AirType.body.copy(
                color = Air.colors.text,
                fontFamily = if (address) FontFamily.Monospace else null,
            ),
            cursorBrush = SolidColor(Air.colors.accent),
            keyboardOptions = KeyboardOptions(
                capitalization = if (address) KeyboardCapitalization.None else KeyboardCapitalization.Sentences,
                autoCorrectEnabled = !address,
            ),
            modifier = Modifier
                .fillMaxWidth()
                .focusRequester(requesters.getValue(field))
                .airEditableField(label, error)
                .testTag(contactFieldTag(field)),
        )
    }
}

private fun contactIssueText(issue: WalletAddressBookModel.Issue): Int = when (issue) {
    is WalletAddressBookModel.Issue.Required -> when (issue.field) {
        WalletAddressBookModel.Field.LABEL -> R.string.wallet_contact_label_required
        WalletAddressBookModel.Field.NETWORK -> R.string.wallet_contact_network_required
        WalletAddressBookModel.Field.ADDRESS -> R.string.wallet_contact_address_required
    }
    WalletAddressBookModel.Issue.InvalidAddress -> R.string.wallet_contact_invalid_address
    WalletAddressBookModel.Issue.InvalidInput -> R.string.wallet_contact_invalid_input
    WalletAddressBookModel.Issue.Denied -> R.string.wallet_contact_denied
    WalletAddressBookModel.Issue.Unavailable -> R.string.wallet_contact_unavailable
    WalletAddressBookModel.Issue.Missing -> R.string.wallet_contact_missing
    WalletAddressBookModel.Issue.Uncertain -> R.string.wallet_contact_uncertain
}
