package com.chromvoid.air.ui.wallet

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.rounded.Autorenew
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.bridge.wire.WalletBackupExportResponse
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.ActionRow
import com.chromvoid.air.ui.design.AirRow
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.DoneButton
import com.chromvoid.air.ui.design.PillIcon
import com.chromvoid.air.ui.design.PrimaryButton
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.design.SectionFooter
import com.chromvoid.air.ui.design.airEditableField
import com.chromvoid.air.ui.root.CoversTabBar

public const val RECOVERY_TAG: String = "wallet-recovery"
public const val RECOVERY_LIST_TAG: String = "wallet-recovery-list"
public const val RECOVERY_CLOSE_TAG: String = "wallet-recovery-close"
public const val RECOVERY_PASSWORD_TAG: String = "wallet-recovery-password"
public const val RECOVERY_SHOW_TAG: String = "wallet-recovery-show"
public const val RECOVERY_ROTATE_TAG: String = "wallet-recovery-rotate"
public const val RECOVERY_ISSUE_TAG: String = "wallet-recovery-issue"
public const val RECOVERY_PHRASE_TAG: String = "wallet-recovery-phrase"
public const val RECOVERY_ROTATION_TAG: String = "wallet-recovery-rotation"
public const val RECOVERY_COPY_TAG: String = "wallet-recovery-copy"
public const val RECOVERY_COPY_FIRST_TAG: String = "wallet-recovery-copy-first"
public const val RECOVERY_PASSPHRASE_TAG: String = "wallet-recovery-passphrase"
public const val RECOVERY_HIDE_TAG: String = "wallet-recovery-hide"

/** One word of the shown phrase, by its number from 1. */
public fun recoveryWordTag(number: Int): String = "wallet-recovery-word-$number"

/**
 * An HD wallet's recovery, as the iOS sheet: the administrative password
 * first, then the phrase as numbered words - a rotated TON phrase split into
 * the 12 every wallet reads and the 12 only Telegram Wallet needs - and a
 * signing-key rotation for a TON account that has one.
 */
@Composable
internal fun WalletRecoveryScreen(model: WalletRecoveryModel, onClose: () -> Unit, onLock: () -> Unit) {
    CoversTabBar()
    BackHandler(onBack = onClose)
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(state.phase) { if (state.phase == WalletRecoveryModel.Phase.REVOKED) onClose() }
    val password = remember { FocusRequester() }
    val listState = rememberLazyListState()
    LaunchedEffect(state.passwordFocusRevision) {
        if (state.passwordFocusRevision == 0) return@LaunchedEffect
        if (listState.layoutInfo.visibleItemsInfo.none { it.key == "password" }) {
            listState.animateScrollToItem(if (state.issue != null) 2 else 1)
        }
        runCatching { password.requestFocus() }
    }
    val recovery = state.recovery
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Air.colors.canvas)
            .pointerInput(Unit) { detectTapGestures {} }
            .testTag(RECOVERY_TAG),
    ) {
        AirScreen(
            title = stringResource(R.string.wallet_recovery),
            largeTitle = false,
            state = listState,
            listTag = RECOVERY_LIST_TAG,
            leading = {
                DoneButton(
                    stringResource(R.string.form_close),
                    onClick = onClose,
                    modifier = Modifier.testTag(RECOVERY_CLOSE_TAG),
                )
            },
            actions = { PillIcon(Icons.Outlined.Lock, stringResource(R.string.vault_lock), onClick = onLock) },
        ) {
            item(key = "wallet") {
                AirSection(footer = stringResource(R.string.wallet_recovery_warning)) {
                    AirRow(title = stringResource(R.string.vault_wallet), value = model.walletName)
                }
            }
            state.issue?.let { issue ->
                item(key = "issue") {
                    AirSection(modifier = Modifier.testTag(RECOVERY_ISSUE_TAG)) {
                        AirRow(
                            title = stringResource(recoveryIssueText(issue)),
                            icon = Icons.Rounded.WarningAmber,
                            iconTint = Air.colors.danger,
                            titleColor = Air.colors.danger,
                        )
                    }
                }
            }
            if (recovery != null && state.phase == WalletRecoveryModel.Phase.REVEALED) {
                revealed(model, state, recovery)
            } else if (state.phase != WalletRecoveryModel.Phase.REVOKED) {
                authorization(model, state, password)
            }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.authorization(
    model: WalletRecoveryModel,
    state: WalletRecoveryModel.State,
    requester: FocusRequester,
) {
    val loading = state.phase == WalletRecoveryModel.Phase.LOADING
    item(key = "password") {
        val focus = LocalFocusManager.current
        val label = stringResource(R.string.backup_password)
        val error = state.issue?.takeIf {
            it == WalletRecoveryModel.Issue.PASSWORD_REQUIRED || it == WalletRecoveryModel.Issue.REAUTHENTICATION
        }?.let { stringResource(recoveryIssueText(it)) }
        AirSection(footer = stringResource(R.string.wallet_recovery_password_text)) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 56.dp)
                    .padding(horizontal = 20.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                Text(label, style = AirType.footnote, color = Air.colors.textSecondary)
                BasicTextField(
                    value = state.password,
                    onValueChange = model::changePassword,
                    enabled = !loading,
                    singleLine = true,
                    textStyle = AirType.body.copy(color = Air.colors.text),
                    cursorBrush = SolidColor(Air.colors.accent),
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, autoCorrectEnabled = false),
                    modifier = Modifier
                        .fillMaxWidth()
                        .focusRequester(requester)
                        .airEditableField(label, error)
                        .testTag(RECOVERY_PASSWORD_TAG),
                )
            }
        }
        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
            PrimaryButton(
                stringResource(R.string.wallet_show_recovery),
                onClick = {
                    focus.clearFocus()
                    model.reveal()
                },
                enabled = !loading,
                busy = loading,
                modifier = Modifier.fillMaxWidth().testTag(RECOVERY_SHOW_TAG),
            )
        }
    }
    if (model.canRotate) {
        item(key = "rotate") {
            val focus = LocalFocusManager.current
            Spacer(Modifier.height(16.dp))
            AirSection(footer = stringResource(R.string.wallet_rotate_footer)) {
                ActionRow(
                    stringResource(R.string.wallet_rotate_key),
                    onClick = {
                        focus.clearFocus()
                        model.rotateKey()
                    },
                    icon = Icons.Rounded.Autorenew,
                    enabled = !loading,
                    modifier = Modifier.testTag(RECOVERY_ROTATE_TAG),
                )
            }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.revealed(
    model: WalletRecoveryModel,
    state: WalletRecoveryModel.State,
    recovery: WalletBackupExportResponse,
) {
    state.rotation?.let { rotation ->
        item(key = "rotation") {
            AirSection(
                header = stringResource(R.string.wallet_rotation),
                footer = stringResource(R.string.wallet_rotation_text),
                modifier = Modifier.testTag(RECOVERY_ROTATION_TAG),
            ) {
                AirRow(
                    title = stringResource(R.string.wallet_rotation_broadcast),
                    icon = Icons.Rounded.Autorenew,
                )
                RowDivider()
                AirRow(title = stringResource(R.string.wallet_sequence_number), value = rotation.seqno.toString())
            }
        }
    }
    item(key = "phrase") {
        val footer = when {
            state.rotated -> stringResource(R.string.wallet_words_rotated_text)
            recovery.mnemonicStandard == "rotation" -> stringResource(R.string.wallet_words_rotation_text)
            else -> null
        }
        AirSection(
            header = stringResource(R.string.wallet_recovery_phrase),
            footer = footer,
            modifier = Modifier.testTag(RECOVERY_PHRASE_TAG),
        ) {
            AirRow(
                title = stringResource(R.string.wallet_mnemonic_standard),
                value = standardName(recovery.mnemonicStandard),
            )
            RowDivider()
            if (state.rotated) {
                WordsHeading(stringResource(R.string.wallet_words_every))
                WordGrid(recovery.mnemonic.take(ANCHOR), offset = 0)
                RowDivider()
                WordsHeading(stringResource(R.string.wallet_words_telegram))
                WordGrid(recovery.mnemonic.drop(ANCHOR), offset = ANCHOR)
            } else {
                WordGrid(recovery.mnemonic, offset = 0)
            }
            RowDivider()
            CopyRow(
                R.string.wallet_copy_phrase,
                copied = state.copied == WalletRecoveryModel.CopyField.MNEMONIC,
                tag = RECOVERY_COPY_TAG,
            ) { model.copy(WalletRecoveryModel.CopyField.MNEMONIC) }
            if (state.rotated) {
                RowDivider()
                CopyRow(
                    R.string.wallet_copy_first_words,
                    copied = state.copied == WalletRecoveryModel.CopyField.ANCHOR_WORDS,
                    tag = RECOVERY_COPY_FIRST_TAG,
                ) { model.copy(WalletRecoveryModel.CopyField.ANCHOR_WORDS) }
            }
        }
    }
    recovery.bip39Passphrase?.takeIf { it.isNotEmpty() }?.let { passphrase ->
        item(key = "passphrase") {
            AirSection(
                header = stringResource(R.string.wallet_bip39_passphrase),
                footer = stringResource(R.string.wallet_passphrase_text),
                modifier = Modifier.testTag(RECOVERY_PASSPHRASE_TAG),
            ) {
                AirRow(title = passphrase, titleFamily = FontFamily.Monospace)
                RowDivider()
                CopyRow(
                    R.string.wallet_copy_passphrase,
                    copied = state.copied == WalletRecoveryModel.CopyField.PASSPHRASE,
                    tag = null,
                ) { model.copy(WalletRecoveryModel.CopyField.PASSPHRASE) }
            }
        }
    }
    item(key = "hide") {
        AirSection {
            ActionRow(
                stringResource(R.string.wallet_hide_recovery),
                onClick = model::hideValues,
                modifier = Modifier.testTag(RECOVERY_HIDE_TAG),
            )
        }
    }
}

@Composable
private fun WordsHeading(text: String) {
    Text(
        text,
        style = AirType.footnote.copy(fontWeight = FontWeight.SemiBold),
        color = Air.colors.textSecondary,
        modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 12.dp),
    )
}

/** Numbered words in two columns, read across then down as they are written. */
@Composable
private fun WordGrid(words: List<String>, offset: Int) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        words.chunked(COLUMNS).forEachIndexed { row, pair ->
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                pair.forEachIndexed { column, word ->
                    val number = offset + row * COLUMNS + column + 1
                    Text(
                        buildAnnotatedString {
                            withStyle(SpanStyle(color = Air.colors.textSecondary)) { append("$number. ") }
                            append(word)
                        },
                        style = AirType.body.copy(fontFamily = FontFamily.Monospace),
                        color = Air.colors.text,
                        modifier = Modifier.weight(1f).testTag(recoveryWordTag(number)),
                    )
                }
                repeat(COLUMNS - pair.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun CopyRow(label: Int, copied: Boolean, tag: String?, onClick: () -> Unit) {
    ActionRow(
        stringResource(label),
        onClick = onClick,
        modifier = if (tag != null) Modifier.testTag(tag) else Modifier,
    )
    if (copied) SectionFooter(stringResource(R.string.wallet_copied))
}

private fun standardName(value: String): String = when (value) {
    "ton_native" -> "TON"
    "rotation" -> "Telegram Wallet"
    "bip39" -> "BIP39"
    else -> value
}

private fun recoveryIssueText(issue: WalletRecoveryModel.Issue): Int = when (issue) {
    WalletRecoveryModel.Issue.PASSWORD_REQUIRED -> R.string.wallet_issue_password
    WalletRecoveryModel.Issue.REAUTHENTICATION -> R.string.wallet_recovery_reauth
    WalletRecoveryModel.Issue.DENIED -> R.string.wallet_issue_access
    WalletRecoveryModel.Issue.UNSUPPORTED -> R.string.wallet_export_unavailable
    WalletRecoveryModel.Issue.FAILED -> R.string.wallet_recovery_failed
    WalletRecoveryModel.Issue.ROTATION_PENDING -> R.string.wallet_rotation_pending
    WalletRecoveryModel.Issue.ROTATION_UNAVAILABLE -> R.string.wallet_rotation_unavailable
}

private const val ANCHOR = 12
private const val COLUMNS = 2
