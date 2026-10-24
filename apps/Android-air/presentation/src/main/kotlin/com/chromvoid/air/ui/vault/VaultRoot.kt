package com.chromvoid.air.ui.vault

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.saveable.SaveableStateHolder
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.EXPANDED_WIDTH
import com.chromvoid.air.ui.design.LocalAirWindowExpanded
import com.chromvoid.air.ui.credentials.AuditScreen
import com.chromvoid.air.ui.credentials.CatalogScreen
import com.chromvoid.air.ui.credentials.CodesCollectionScreen
import com.chromvoid.air.ui.credentials.CodesManagerScreen
import com.chromvoid.air.ui.credentials.CodesModel
import com.chromvoid.air.ui.credentials.CredentialDetailModel
import com.chromvoid.air.ui.credentials.CredentialDetailScreen
import com.chromvoid.air.ui.credentials.CredentialFormModel
import com.chromvoid.air.ui.credentials.CredentialFormScreen
import com.chromvoid.air.ui.credentials.GroupPickerSheet
import com.chromvoid.air.ui.credentials.PasswordGeneratorSheet
import com.chromvoid.air.ui.credentials.TagsSheet as TagsSheetDialog
import com.chromvoid.air.ui.credentials.WebsitesSheet
import com.chromvoid.air.ui.passkeys.PasskeysScreen
import com.chromvoid.air.ui.ssh.SshScreen
import com.chromvoid.air.ui.transfer.TransferScreen
import com.chromvoid.air.ui.wallet.WalletRoot

public const val VAULT_PANE_TAG: String = "vault-pane"
public const val VAULT_PANE_EMPTY_TAG: String = "vault-pane-empty"

/**
 * The vault root's own stack: the catalog, the record opened from it, and a
 * create or edit form above either. On a phone each takes the whole screen;
 * from [EXPANDED_WIDTH] the catalog stays on the left and the record
 * is drawn beside it. A form is a separate task on either size. The audit,
 * SSH keys and transfers replace the catalog on either size.
 * Navigation follows the scope's state, so a lock that closes the scope also
 * closes whatever was open. The catalog's saveable state - its scroll - is kept
 * while a record covers it.
 */
@Composable
public fun VaultRoot(vault: VaultScope, modifier: Modifier = Modifier, onLock: () -> Unit = {}) {
    val holder = rememberSaveableStateHolder()
    val contentState = rememberSaveableStateHolder()
    val detail by vault.detail.collectAsStateWithLifecycle()
    val form by vault.form.collectAsStateWithLifecycle()
    val tags by vault.tags.collectAsStateWithLifecycle()
    val websites by vault.websites.collectAsStateWithLifecycle()
    val audit by vault.audit.collectAsStateWithLifecycle()
    val codes by vault.codes.collectAsStateWithLifecycle()
    val ssh by vault.ssh.collectAsStateWithLifecycle()
    val transfers by vault.transfers.collectAsStateWithLifecycle()
    val codesCollection by vault.codesCollection.collectAsStateWithLifecycle()
    val codesManager by vault.codesManager.collectAsStateWithLifecycle()
    val picker by vault.picker.collectAsStateWithLifecycle()
    val generator by vault.generator.collectAsStateWithLifecycle()
    val walletModel by vault.wallet.collectAsStateWithLifecycle()
    val passkeyList by vault.passkeyList.collectAsStateWithLifecycle()
    val passkeys = passkeyList
    val keys = ssh
    val wallet = walletModel
    val moving = transfers
    val auditing = audit
    val editing = form
    val open = detail
    val collection = codesCollection
    val manager = codesManager
    val helperOpen = picker != null || generator != null || websites != null || tags != null || manager != null
    BoxWithConstraints(modifier = modifier) {
        val expanded = LocalAirWindowExpanded.current ?: (maxWidth >= EXPANDED_WIDTH)
        // Covered content leaves composition, so it has neither accessibility nor touch targets.
        // Its saveable state (including form scroll) returns when the helper closes.
        if (!helperOpen) {
            contentState.SaveableStateProvider(CONTENT_STATE_KEY) {
                when {
                    moving != null -> {
                        BackHandler(onBack = vault::closeTransfers)
                        TransferScreen(moving, onBack = vault::closeTransfers, onLock = onLock)
                    }
                    keys != null -> SshScreen(keys, onBack = vault::closeSsh, onLock = onLock)
                    wallet != null -> WalletRoot(wallet, onBack = vault::closeWallet, onLock = onLock)
                    passkeys != null -> PasskeysScreen(passkeys, onBack = vault::closePasskeys, onLock = onLock)
                    editing != null -> Form(vault, editing)
                    expanded && auditing == null && collection == null -> Row(modifier = Modifier.fillMaxSize()) {
                        Box(modifier = Modifier.weight(CATALOG_WEIGHT).fillMaxHeight()) {
                            Catalog(vault, holder, onLock, openedId = open?.id)
                        }
                        VerticalDivider(color = Air.colors.separator)
                        Box(modifier = Modifier.weight(1f - CATALOG_WEIGHT).fillMaxHeight().testTag(VAULT_PANE_TAG)) {
                            when {
                                open != null -> Detail(vault, open, codes, onLock)
                                else -> Text(
                                    stringResource(R.string.vault_pane_empty),
                                    color = Air.colors.textSecondary,
                                    modifier = Modifier
                                        .align(Alignment.Center)
                                        .padding(24.dp)
                                        .testTag(VAULT_PANE_EMPTY_TAG),
                                )
                            }
                        }
                    }
                    open != null -> Detail(vault, open, codes, onLock)
                    collection != null -> {
                        BackHandler(onBack = vault::closeCodesCollection)
                        CodesCollectionScreen(
                            collection,
                            onOpen = vault::open,
                            onBack = vault::closeCodesCollection,
                            onLock = onLock,
                        )
                    }
                    auditing != null -> {
                        BackHandler(onBack = vault::closeAudit)
                        holder.SaveableStateProvider(AUDIT_STATE_KEY) {
                            AuditScreen(auditing, onOpen = vault::open, onBack = vault::closeAudit)
                        }
                    }
                    else -> Catalog(vault, holder, onLock)
                }
            }
        }
        manager?.let {
            BackHandler(onBack = vault::closeCodesManager)
            CodesManagerScreen(it, onDone = vault::closeCodesManager)
        }
        // Helpers keep their existing scope-owned models and Back handlers.
        picker?.let {
            BackHandler(onBack = vault::closePicker)
            GroupPickerSheet(it, onChoose = { path -> vault.useGroup(path) }, onDismiss = vault::closePicker)
        }
        generator?.let { model ->
            BackHandler(onBack = vault::closeGenerator)
            PasswordGeneratorSheet(model, onDismiss = vault::closeGenerator)
        }
        websites?.let { editor ->
            BackHandler(onBack = vault::dismissWebsites)
            WebsitesSheet(editor, onDismiss = vault::dismissWebsites, onDiscard = vault::closeWebsites)
        }
        tags?.let { sheet ->
            BackHandler(onBack = vault::closeTags)
            TagsSheetDialog(
                sheet.model,
                assigning = sheet.purpose == TagsSheet.Purpose.ASSIGN,
                onChoose = vault::chooseTag,
                onDone = vault::applyTags,
                onDismiss = vault::closeTags,
            )
        }
    }
}

@Composable
private fun Form(vault: VaultScope, form: CredentialFormModel) {
    BackHandler(onBack = vault::dismissForm)
    CredentialFormScreen(
        form,
        onDismiss = vault::dismissForm,
        onDiscard = vault::discardForm,
        onChooseTags = vault::openTagChoice,
        onGenerate = vault::openGenerator,
        onEditWebsites = vault::openWebsites,
        onManageCodes = vault::openCodesManager,
        onChooseGroup = vault::chooseGroup,
    )
}

@Composable
private fun Detail(vault: VaultScope, detail: CredentialDetailModel, codes: CodesModel?, onLock: () -> Unit) {
    BackHandler(onBack = vault::closeDetail)
    CredentialDetailScreen(
        detail,
        onBack = vault::closeDetail,
        onEdit = vault::beginEdit,
        onDeleted = vault::closeDetail,
        codes = codes,
        onLock = onLock,
    )
}

@Composable
private fun Catalog(vault: VaultScope, holder: SaveableStateHolder, onLock: () -> Unit, openedId: String? = null) {
    val levels by vault.levels.collectAsStateWithLifecycle()
    val counts by vault.counts.collectAsStateWithLifecycle()
    val top = levels.last()
    BackHandler(enabled = levels.size > 1, onBack = vault::closeGroup)
    // Each level keeps its own scroll while a deeper one is shown.
    holder.SaveableStateProvider(CATALOG_STATE_KEY + top.path) {
        CatalogScreen(
            top.catalog,
            groups = top.groups,
            onOpen = vault::open,
            onOpenGroup = vault::openGroup,
            onCreate = vault::beginCreate,
            onUp = if (levels.size > 1) vault::closeGroup else null,
            onTags = vault::openTagFilter,
            onAudit = vault::openAudit,
            onSsh = vault::openSsh,
            onWallet = if (vault.offersWallet) vault::openWallet else null,
            onPasskeys = if (vault.offersPasskeys) vault::openPasskeys else null,
            onCodes = vault::openCodesCollection,
            onTransfer = vault::openTransfers,
            onLock = onLock,
            counts = counts,
            openedId = openedId,
        )
    }
}

private const val CONTENT_STATE_KEY = "vault-content"
private const val CATALOG_STATE_KEY = "catalog:"
private const val AUDIT_STATE_KEY = "audit"
private const val CATALOG_WEIGHT = 0.4f
