package com.chromvoid.air.ui.wallet

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.bridge.wire.WalletBackupExportRequest
import com.chromvoid.air.bridge.wire.WalletBackupExportResponse
import com.chromvoid.air.bridge.wire.WalletTonRotateKeyRequest
import com.chromvoid.air.bridge.wire.WalletTonRotateKeyResponse
import com.chromvoid.air.ui.credentials.CredentialClipboard
import com.chromvoid.air.ui.support.FailureKind
import com.chromvoid.air.ui.support.failureKind
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * One HD wallet's recovery material, as the iOS recovery sheet shows it:
 * the administrative password asks Core for the phrase, which stays on this
 * screen only until it is hidden, covered or locked. A TON account made from
 * a rotation phrase can have its signing key rotated from here as well.
 */
public class WalletRecoveryModel(
    public val walletId: String,
    public val walletName: String,
    /** The TON account whose signing key can be rotated, if the wallet has one. */
    public val tonAccountId: String?,
    private val store: WalletStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
    private val clipboard: CredentialClipboard,
) {
    public enum class Phase { EDITING, LOADING, REVEALED, REVOKED }

    public enum class Issue {
        PASSWORD_REQUIRED,
        REAUTHENTICATION,
        DENIED,
        UNSUPPORTED,
        FAILED,
        ROTATION_PENDING,
        ROTATION_UNAVAILABLE,
    }

    /** [ANCHOR_WORDS] copies words 1-12 of a rotated phrase: the part every other wallet uses. */
    public enum class CopyField { MNEMONIC, ANCHOR_WORDS, PASSPHRASE }

    public data class State(
        val phase: Phase = Phase.EDITING,
        val password: String = "",
        val recovery: WalletBackupExportResponse? = null,
        val rotation: WalletTonRotateKeyResponse? = null,
        val issue: Issue? = null,
        val passwordFocusRevision: Int = 0,
        val copied: CopyField? = null,
    ) {
        /** A rotated TON phrase: 24 words, of which the first 12 are what other wallets read. */
        val rotated: Boolean
            get() = recovery?.let { it.mnemonicStandard == ROTATION && it.mnemonic.size == ROTATED_WORDS } == true
    }

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()

    private var work: Job? = null

    public val canRotate: Boolean get() = tonAccountId != null

    public fun changePassword(value: String) {
        val current = mutableState.value
        if (current.phase != Phase.EDITING) return
        mutableState.value = current.copy(password = value, issue = null)
    }

    public fun reveal() {
        val password = takePassword() ?: return
        start(
            read = {
                val result = store.exportWalletRecovery(WalletBackupExportRequest(password, walletId), generation)
                val usable = result.walletID == walletId &&
                    result.exportKind == "mnemonic" &&
                    result.mnemonic.isNotEmpty()
                if (usable) result to null else null
            },
            issue = { error ->
                if ((error as? CoreRefusal)?.code == "UNSUPPORTED_EXPORT_KIND") Issue.UNSUPPORTED else null
            },
        )
    }

    /**
     * Rotates the TON signing key. Core keeps the new signing half before it
     * broadcasts and the previous phrase valid until the rotation lands, so
     * the new 24 words can be written down without a race.
     */
    public fun rotateKey() {
        val accountId = tonAccountId ?: return
        val password = takePassword() ?: return
        start(
            read = {
                val result = store.rotateTonSigningKey(WalletTonRotateKeyRequest(accountId, password), generation)
                if (result.walletID != walletId || result.mnemonic.size != ROTATED_WORDS) return@start null
                val recovery = WalletBackupExportResponse(
                    exportKind = "mnemonic",
                    mnemonic = result.mnemonic,
                    mnemonicStandard = result.mnemonicStandard,
                    walletID = result.walletID,
                    walletMode = "ton_only",
                    wordlist = result.wordlist,
                )
                recovery to result
            },
            issue = { error ->
                when {
                    (error as? CoreRefusal)?.code == "UNSUPPORTED_EXPORT_KIND" -> Issue.ROTATION_UNAVAILABLE
                    error.failureKind == FailureKind.INVALID_INPUT -> Issue.ROTATION_PENDING
                    error.failureKind == FailureKind.UNAVAILABLE && (error as? CoreRefusal)?.code != WALLET_DISABLED ->
                        Issue.ROTATION_UNAVAILABLE
                    else -> null
                }
            },
        )
    }

    /** The typed password, taken off the screen as the request leaves; null asks for it. */
    private fun takePassword(): String? {
        val current = mutableState.value
        if (current.phase != Phase.EDITING) return null
        if (current.password.isEmpty()) {
            mutableState.value = current.copy(
                issue = Issue.PASSWORD_REQUIRED,
                passwordFocusRevision = current.passwordFocusRevision + 1,
            )
            return null
        }
        mutableState.value = current.copy(password = "", issue = null, phase = Phase.LOADING)
        return current.password
    }

    private fun start(
        read: suspend () -> Pair<WalletBackupExportResponse, WalletTonRotateKeyResponse?>?,
        issue: (Exception) -> Issue?,
    ) {
        work?.cancel()
        work = scope.launch {
            try {
                val result = read()
                mutableState.value = if (result == null) {
                    mutableState.value.copy(phase = Phase.EDITING, issue = Issue.FAILED)
                } else {
                    mutableState.value.copy(phase = Phase.REVEALED, recovery = result.first, rotation = result.second)
                }
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                val kind = error.failureKind
                if (kind == FailureKind.REVOKED) {
                    revoke()
                    return@launch
                }
                val current = mutableState.value
                val next = issue(error) ?: when {
                    kind == FailureKind.REAUTH_REQUIRED -> Issue.REAUTHENTICATION
                    kind == FailureKind.DENIED -> Issue.DENIED
                    // This screen has no "unavailable": a disabled wallet reads as denied here.
                    (error as? CoreRefusal)?.code == WALLET_DISABLED -> Issue.DENIED
                    else -> Issue.FAILED
                }
                mutableState.value = current.copy(
                    phase = Phase.EDITING,
                    issue = next,
                    passwordFocusRevision = current.passwordFocusRevision +
                        if (next == Issue.REAUTHENTICATION) 1 else 0,
                )
            }
        }
    }

    public fun copy(field: CopyField) {
        val current = mutableState.value
        val recovery = current.recovery ?: return
        if (current.phase != Phase.REVEALED) return
        val value = when (field) {
            CopyField.MNEMONIC -> recovery.mnemonic.joinToString(" ")
            CopyField.ANCHOR_WORDS ->
                if (current.rotated) recovery.mnemonic.take(ANCHOR_WORDS).joinToString(" ") else null
            CopyField.PASSPHRASE -> recovery.bip39Passphrase
        }
        if (value.isNullOrEmpty()) return
        clipboard.copy(value, sensitive = true)
        mutableState.value = current.copy(copied = field)
    }

    /** A cover also drops a read still on its way; showing the phrase again asks for the password. */
    public fun hideValues() {
        if (mutableState.value.phase == Phase.REVOKED) return
        work?.cancel()
        clipboard.clearOwned()
        mutableState.value = State(passwordFocusRevision = mutableState.value.passwordFocusRevision)
    }

    public fun revoke() {
        work?.cancel()
        clipboard.clearOwned()
        mutableState.value = State(phase = Phase.REVOKED)
    }

    private companion object {
        const val ROTATION = "rotation"
        const val ROTATED_WORDS = 24
        const val ANCHOR_WORDS = 12
        const val WALLET_DISABLED = "WALLET_DISABLED"
    }
}
