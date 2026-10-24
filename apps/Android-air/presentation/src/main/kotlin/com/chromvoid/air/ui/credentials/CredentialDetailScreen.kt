package com.chromvoid.air.ui.credentials

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.bridge.wire.CredentialDetail
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.ActionRow
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirToast
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.DetailRow
import com.chromvoid.air.ui.design.Monogram
import com.chromvoid.air.ui.design.PillIcon
import com.chromvoid.air.ui.design.PillText
import com.chromvoid.air.ui.design.RowAction
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.design.StatusBlock
import com.chromvoid.air.ui.design.TabBarClearance
import kotlinx.coroutines.delay

public const val DETAIL_BACK_TAG: String = "detail-back"
public const val DETAIL_TITLE_TAG: String = "detail-title"
public const val DETAIL_USERNAME_TAG: String = "detail-username"
public const val DETAIL_MISSING_TAG: String = "detail-missing"
public const val DETAIL_FAILED_TAG: String = "detail-failed"
public const val DETAIL_COPIED_TAG: String = "detail-copied"
public const val DETAIL_EDIT_TAG: String = "detail-edit"
public const val DETAIL_DELETE_TAG: String = "detail-delete"
public const val DETAIL_LIST_TAG: String = "detail-list"
public const val DETAIL_DELETE_CONFIRM_TAG: String = "detail-delete-confirm"
public const val DETAIL_LOCK_TAG: String = "detail-lock"

public fun secretValueTag(type: String): String = "detail-secret-$type"

public fun secretRevealTag(type: String): String = "detail-reveal-$type"

public fun secretCopyTag(type: String): String = "detail-copy-$type"

public fun secretIssueTag(type: String): String = "detail-issue-$type"

private const val MASK = "••••••••"

/** The record types this client can edit; other types are shown read-only. */
private val EDITABLE_TYPES = setOf("login", "payment_card")

/**
 * A record for everyday use, as the iOS credential page lays it out:
 * identity on top, the fields you sign in with, one-time codes shown live,
 * websites, card data, the private note and details, and the delete at the
 * bottom. The page only reads: every change is in Edit. Each row keeps its
 * value readable and puts its actions in a trailing strip, so copy is always
 * one tap away.
 */
@Composable
public fun CredentialDetailScreen(
    model: CredentialDetailModel,
    onBack: () -> Unit,
    onEdit: () -> Unit,
    modifier: Modifier = Modifier,
    onDeleted: () -> Unit = {},
    codes: CodesModel? = null,
    onLock: () -> Unit = {},
) {
    val state by model.state.collectAsStateWithLifecycle()
    var copied by remember { mutableStateOf(false) }
    LaunchedEffect(state.copies) {
        if (state.copies > 0) {
            copied = true
            delay(3_000)
            copied = false
        }
    }
    Box(modifier = modifier.fillMaxSize()) {
        AirScreen(
            title = stringResource(R.string.detail_title),
            largeTitle = false,
            listTag = DETAIL_LIST_TAG,
            onBack = onBack,
            backTag = DETAIL_BACK_TAG,
            backDescription = stringResource(R.string.detail_back),
            actions = {
                PillIcon(
                    Icons.Outlined.Lock,
                    stringResource(R.string.vault_lock),
                    onClick = onLock,
                    modifier = Modifier.testTag(DETAIL_LOCK_TAG),
                )
                PillText(
                    stringResource(R.string.detail_edit),
                    onClick = onEdit,
                    enabled = state.status == CredentialDetailModel.Status.READY &&
                        state.detail?.entryType in EDITABLE_TYPES,
                    modifier = Modifier.testTag(DETAIL_EDIT_TAG),
                )
            },
        ) {
            val detail = state.detail
            when (state.status) {
                CredentialDetailModel.Status.READY -> if (detail != null) page(detail, state, model, codes)
                CredentialDetailModel.Status.LOADING -> item {
                    Box(modifier = Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Air.colors.accent)
                    }
                }
                CredentialDetailModel.Status.MISSING -> item {
                    StatusBlock(
                        stringResource(R.string.detail_missing),
                        action = stringResource(R.string.detail_back_to_catalog),
                        onAction = onBack,
                        modifier = Modifier.testTag(DETAIL_MISSING_TAG),
                    )
                }
                CredentialDetailModel.Status.FAILED -> item {
                    StatusBlock(
                        stringResource(R.string.detail_failed),
                        action = stringResource(R.string.vault_try_again),
                        onAction = model::reload,
                        modifier = Modifier.testTag(DETAIL_FAILED_TAG),
                    )
                }
                // The session ended; the shell is about to show the unlock screen.
                CredentialDetailModel.Status.REVOKED -> Unit
            }
            if (state.status == CredentialDetailModel.Status.READY) {
                item(key = "delete") {
                    AirSection {
                        if (state.deleteRefused) {
                            Text(
                                stringResource(R.string.select_delete_refused),
                                style = AirType.footnote,
                                color = Air.colors.danger,
                                modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 14.dp),
                            )
                        }
                        ActionRow(
                            stringResource(R.string.detail_delete),
                            onClick = model::requestDelete,
                            icon = Icons.Rounded.DeleteOutline,
                            destructive = true,
                            enabled = !state.deleting,
                            modifier = Modifier.testTag(DETAIL_DELETE_TAG),
                        )
                    }
                }
            }
            item(key = "clearance") { TabBarClearance() }
        }
        if (copied) {
            AirToast(
                stringResource(R.string.vault_copied),
                Icons.Rounded.Check,
                tag = DETAIL_COPIED_TAG,
                modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 96.dp),
            )
        }
    }
    if (state.confirmingDelete) {
        AlertDialog(
            onDismissRequest = model::cancelDelete,
            title = { Text(stringResource(R.string.detail_delete_title)) },
            text = { Text(state.detail?.title.orEmpty() + "\n\n" + stringResource(R.string.detail_delete_text)) },
            confirmButton = {
                TextButton(
                    onClick = { model.confirmDelete(onDeleted) },
                    modifier = Modifier.testTag(DETAIL_DELETE_CONFIRM_TAG),
                ) {
                    Text(stringResource(R.string.group_delete), color = Air.colors.danger)
                }
            },
            dismissButton = {
                TextButton(onClick = model::cancelDelete) { Text(stringResource(R.string.form_keep_cancel)) }
            },
        )
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.page(
    detail: CredentialDetail,
    state: CredentialDetailModel.State,
    model: CredentialDetailModel,
    codes: CodesModel?,
) {
    val face = model.cardFace(state)
    if (face != null) {
        item(key = "identity") { CardIdentity(detail, face, state, model) }
    } else {
        item(key = "identity") { Identity(detail) }
    }
    if (detail.entryType == "login") {
        item(key = "login") {
            AirSection {
                MetadataRow(
                    R.string.detail_username,
                    detail.username,
                    onCopy = { model.copyVisible(detail.username) },
                    tag = DETAIL_USERNAME_TAG,
                )
                RowDivider()
                SecretRow(CredentialDetailModel.PASSWORD, state, model)
            }
        }
        if (codes != null) item(key = "codes") { CodesPageSection(codes) }
        if (detail.websites.isNotEmpty()) item(key = "websites") { Websites(detail.websites, model) }
    }
    val card = detail.paymentCard
    if (card != null) {
        item(key = "card") {
            AirSection(header = stringResource(R.string.detail_card_details)) {
                SecretRow(CredentialDetailModel.CARD_NUMBER, state, model)
                RowDivider()
                MetadataRow(
                    R.string.detail_cardholder,
                    card.cardholderName,
                    onCopy = { model.copyVisible(card.cardholderName) },
                )
                RowDivider()
                MetadataRow(R.string.detail_expiry, PaymentCards.display(card.expMonth, card.expYear))
            }
        }
    }
    if (CredentialDetailModel.NOTE in state.secretTypes) {
        item(key = "note") {
            AirSection(header = stringResource(R.string.detail_note)) {
                SecretRow(CredentialDetailModel.NOTE, state, model, titled = false)
            }
        }
    }
    item(key = "details") {
        AirSection(header = stringResource(R.string.detail_details)) {
            val group = detail.groupPath.takeIf { it.isNotBlank() && it != "/" }
            MetadataRow(R.string.detail_group, group ?: stringResource(R.string.detail_vault_root))
            if (detail.tags.isNotEmpty()) {
                RowDivider()
                MetadataRow(R.string.detail_tags, detail.tags.joinToString(", "))
            }
        }
    }
}

/**
 * A card is shown as the object itself, the iOS card page: the face on top
 * with its code behind an eye, the name under it. The number stays masked on
 * the face until it is revealed in Card details below.
 */
@Composable
private fun CardIdentity(
    detail: CredentialDetail,
    face: CredentialDetailModel.CardFace,
    state: CredentialDetailModel.State,
    model: CredentialDetailModel,
) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        PaymentCardFace(
            face,
            onToggleCode = { model.reveal(CredentialDetailModel.CARD_CODE) },
            codeBusy = state.loadingSecret == CredentialDetailModel.CARD_CODE,
        )
        state.issues[CredentialDetailModel.CARD_CODE]?.let { issue ->
            Text(
                stringResource(issueText(issue)),
                style = AirType.footnote,
                color = Air.colors.danger,
                modifier = Modifier.testTag(secretIssueTag(CredentialDetailModel.CARD_CODE)),
            )
        }
        Text(
            detail.title,
            style = AirType.title3,
            color = Air.colors.text,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 8.dp).testTag(DETAIL_TITLE_TAG),
        )
    }
}

/** The identity on top: monogram, name and kind, centred on the canvas. */
@Composable
private fun Identity(detail: CredentialDetail) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Monogram(detail.title, detail.entryType, size = 84.dp)
        Text(
            detail.title,
            style = AirType.title2,
            color = Air.colors.text,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 24.dp).testTag(DETAIL_TITLE_TAG),
        )
        Text(
            stringResource(
                if (detail.entryType == "payment_card") R.string.detail_kind_card else R.string.detail_kind_login,
            ),
            style = AirType.subheadline,
            color = Air.colors.textSecondary,
        )
    }
}

@Composable
private fun MetadataRow(label: Int, value: String, onCopy: (() -> Unit)? = null, tag: String? = null) {
    val caption = stringResource(label)
    DetailRow(
        label = caption,
        actions = {
            if (onCopy != null && value.isNotEmpty()) {
                RowAction(Icons.Rounded.ContentCopy, stringResource(R.string.detail_copy, caption), onClick = onCopy)
            }
        },
    ) {
        Text(
            value.ifEmpty { stringResource(R.string.detail_not_set) },
            style = AirType.body,
            color = if (value.isEmpty()) Air.colors.textSecondary else Air.colors.text,
            modifier = if (tag != null) Modifier.testTag(tag) else Modifier,
        )
    }
}

/** A protected field: dots until shown; show and copy in a fixed order, so the hand learns where copy lives. */
@Composable
private fun SecretRow(
    type: String,
    state: CredentialDetailModel.State,
    model: CredentialDetailModel,
    titled: Boolean = true,
) {
    val revealed = state.revealed[type]
    val issue = state.issues[type]
    val busy = state.loadingSecret == type
    val caption = stringResource(secretLabel(type))
    DetailRow(
        label = if (titled) caption else null,
        actions = {
            RowAction(
                if (revealed == null) Icons.Rounded.Visibility else Icons.Rounded.VisibilityOff,
                stringResource(if (revealed == null) R.string.detail_show else R.string.detail_hide, caption),
                onClick = { model.reveal(type) },
                enabled = !busy,
                modifier = Modifier.testTag(secretRevealTag(type)),
            )
            RowAction(
                Icons.Rounded.ContentCopy,
                stringResource(R.string.detail_copy, caption),
                onClick = { model.copySecret(type) },
                enabled = !busy,
                modifier = Modifier.testTag(secretCopyTag(type)),
            )
        },
    ) {
        val display = when {
            revealed == null -> MASK
            revealed.isEmpty() -> stringResource(R.string.detail_empty_value)
            type == CredentialDetailModel.CARD_NUMBER -> model.groupedNumber(revealed)
            else -> revealed
        }
        Text(
            display,
            style = AirType.body,
            fontFamily = if (type != CredentialDetailModel.NOTE) FontFamily.Monospace else null,
            color = if (revealed == null || revealed.isEmpty()) Air.colors.textSecondary else Air.colors.text,
            modifier = Modifier.testTag(secretValueTag(type)),
        )
        if (issue != null) {
            Text(
                stringResource(issueText(issue)),
                style = AirType.footnote,
                color = Air.colors.danger,
                modifier = Modifier.testTag(secretIssueTag(type)),
            )
        }
    }
}

@Composable
private fun Websites(websites: List<String>, model: CredentialDetailModel) {
    val uri = LocalUriHandler.current
    AirSection(header = stringResource(R.string.detail_websites)) {
        websites.forEachIndexed { index, website ->
            if (index > 0) RowDivider()
            DetailRow(
                label = null,
                actions = {
                    RowAction(
                        Icons.Rounded.ContentCopy,
                        stringResource(R.string.detail_copy, website),
                        onClick = { model.copyVisible(website) },
                    )
                    // Leaving for the browser is leaving the app: the vault locks
                    // behind the user, as it does for any other trip away.
                    RowAction(
                        Icons.AutoMirrored.Rounded.OpenInNew,
                        stringResource(R.string.detail_open_website),
                        onClick = { runCatching { uri.openUri(websiteUri(website)) } },
                    )
                },
            ) {
                Text(website, style = AirType.body, color = Air.colors.accent, maxLines = 1)
            }
        }
    }
}

private fun secretLabel(type: String): Int = when (type) {
    CredentialDetailModel.PASSWORD -> R.string.detail_password
    CredentialDetailModel.CARD_NUMBER -> R.string.detail_card_number
    CredentialDetailModel.CARD_CODE -> R.string.detail_card_code
    else -> R.string.detail_note
}

internal fun issueText(issue: CredentialDetailModel.FieldIssue): Int = when (issue) {
    CredentialDetailModel.FieldIssue.EMPTY -> R.string.secret_issue_empty
    CredentialDetailModel.FieldIssue.TOO_LARGE -> R.string.secret_issue_too_large
    CredentialDetailModel.FieldIssue.FAILED -> R.string.secret_issue_failed
}

/** A stored website may omit the scheme; the browser needs one. */
private fun websiteUri(website: String): String =
    if (website.contains("://")) website else "https://$website"
