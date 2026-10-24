package com.chromvoid.air.ui.wallet

import com.chromvoid.air.bridge.wire.WalletHDCreateRequest
import com.chromvoid.air.bridge.wire.WalletHDGenerateMnemonicRequest
import com.chromvoid.air.bridge.wire.WalletHDGenerateMnemonicResponse
import com.chromvoid.air.bridge.wire.WalletImportCreateRequest
import com.chromvoid.air.bridge.wire.WalletStatusResponse
import com.chromvoid.air.ui.support.FailureKind
import com.chromvoid.air.ui.support.failureKind
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * A new, restored or imported wallet, as the iOS setup form makes one. Core
 * owns phrase and key validation, derivation and the atomic save. A new
 * wallet never shows its phrase here: it lives in the encrypted vault, and
 * its words can be exported from the wallet at any time. What was typed is
 * cleared once the wallet is saved, when the form closes, and when a save
 * cannot be confirmed.
 */
public class WalletSetupModel(
    public val intent: Intent,
    status: WalletStatusResponse,
    private val store: WalletStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
    private val now: () -> Long = System::currentTimeMillis,
    private val requestId: () -> String = { UUID.randomUUID().toString() },
    private val onSaved: (walletId: String, accountId: String?) -> Unit,
) {
    public enum class Intent { CREATE, RESTORE, IMPORT_KEY }

    public enum class Phase { EDITING, GENERATING, SAVING, SAVED, UNCERTAIN, REVOKED }

    public enum class Field { LABEL, MNEMONIC, PASSPHRASE, PRIVATE_KEY }

    public enum class Issue {
        UNAVAILABLE,
        CHOOSE_NETWORK,
        EXPIRED_PHRASE,
        INVALID_INPUT,
        DENIED,
        GENERATION_FAILED,
        UNCERTAIN_SAVE,
    }

    /** The phrase a wallet grows from; only the universal wallet is ever created new. */
    public enum class RecoveryProfile(internal val walletMode: String, internal val standard: String) {
        MULTICHAIN("multichain", "bip39"),

        /** One Telegram Wallet phrase (12 words, 24 after a key rotation) for every network. */
        TELEGRAM_MULTICHAIN("multichain", "rotation"),

        /** Telegram Wallet alone: the TEP-0003 rotation phrase. */
        TON_ONLY("ton_only", "rotation"),

        /** The legacy 24-word TON phrase of wallet.ton.org and Tonkeeper. */
        TON_LEGACY("ton_only", "ton_native"),
        ;

        public val isTonOnly: Boolean get() = this == TON_ONLY || this == TON_LEGACY

        public val allowsCreate: Boolean get() = this == TELEGRAM_MULTICHAIN

        public val allowsPassphrase: Boolean get() = !isTonOnly

        internal val fixedWordCount: Int?
            get() = when (this) {
                MULTICHAIN -> null
                TELEGRAM_MULTICHAIN, TON_ONLY -> 12
                TON_LEGACY -> 24
            }

        public companion object {
            public fun available(intent: Intent): List<RecoveryProfile> =
                entries.filter { intent != Intent.CREATE || it.allowsCreate }
        }
    }

    /** The networks a private key can be imported for, with the encodings the form offers. */
    public enum class ImportNetwork(
        public val wire: String,
        public val encodings: List<String>,
        internal val curve: String,
    ) {
        BITCOIN("bitcoin", listOf("wif"), "secp256k1"),
        ETHEREUM("ethereum", listOf("hex"), "secp256k1"),
        SOLANA("solana", listOf("base58_keypair"), "ed25519"),
        TON("ton", listOf("hex", "base64"), "ed25519"),
        ;

        public companion object {
            public fun of(network: String): ImportNetwork? = entries.firstOrNull { it.wire == network }
        }
    }

    public data class State(
        val phase: Phase = Phase.EDITING,
        val profile: RecoveryProfile,
        val wordCount: Int = 12,
        val selectedNetworks: Set<String> = emptySet(),
        val importNetwork: ImportNetwork? = null,
        val encoding: String = "",
        val usePassphrase: Boolean = false,
        val values: Map<Field, String> = emptyMap(),
        val revealed: Set<Field> = emptySet(),
        val missing: Set<Field> = emptySet(),
        val issue: Issue? = null,
        /** The field to focus; [focusRevision] makes a repeated request a new one. */
        val focus: Field? = null,
        val focusRevision: Int = 0,
        val confirmingDiscard: Boolean = false,
    ) {
        public fun value(field: Field): String = values[field].orEmpty()
    }

    private val networks = status.networks
    private val enabled = status.enabled
    private val enabledNetworks = networks.filter { it.enabled }.map { it.network }

    /** The networks a key can be imported for in this runtime. */
    public val importNetworks: List<ImportNetwork> = enabledNetworks.mapNotNull(ImportNetwork::of)

    private val mutableState = MutableStateFlow(
        State(
            profile = if (intent == Intent.CREATE) RecoveryProfile.TELEGRAM_MULTICHAIN else RecoveryProfile.MULTICHAIN,
            selectedNetworks = enabledNetworks.toSet(),
            importNetwork = importNetworks.firstOrNull(),
            encoding = importNetworks.firstOrNull()?.encodings?.first().orEmpty(),
        ),
    )
    public val state: StateFlow<State> = mutableState.asStateFlow()

    /** A draft Core generated for a new wallet; its words are never shown here. */
    private var phrase: WalletHDGenerateMnemonicResponse? = null
    private var work: Job? = null

    public val isDirty: Boolean
        get() = phrase != null || mutableState.value.values.values.any { it.isNotEmpty() }

    public fun change(field: Field, value: String) {
        val current = mutableState.value
        if (current.phase != Phase.EDITING) return
        mutableState.value = current.copy(
            values = current.values + (field to value),
            missing = current.missing - field,
            issue = null,
        )
    }

    public fun selectProfile(profile: RecoveryProfile) {
        val current = mutableState.value
        if (intent == Intent.IMPORT_KEY || current.profile == profile) return
        if (current.phase != Phase.EDITING && current.phase != Phase.GENERATING) return
        if (intent == Intent.CREATE && !profile.allowsCreate) return
        work?.cancel()
        phrase = null
        mutableState.value = current.copy(
            phase = Phase.EDITING,
            profile = profile,
            values = current.values - Field.MNEMONIC - Field.PASSPHRASE,
            revealed = emptySet(),
            usePassphrase = false,
            selectedNetworks = enabledNetworks.filter { !profile.isTonOnly || it == "ton" }.toSet(),
            issue = null,
            missing = emptySet(),
        )
    }

    public fun selectImportNetwork(network: ImportNetwork) {
        val current = mutableState.value
        if (current.phase != Phase.EDITING || network !in importNetworks || current.importNetwork == network) return
        mutableState.value = current.copy(
            importNetwork = network,
            encoding = network.encodings.first(),
            values = current.values - Field.PRIVATE_KEY,
            revealed = current.revealed - Field.PRIVATE_KEY,
            issue = null,
        )
    }

    public fun selectEncoding(encoding: String) {
        val current = mutableState.value
        if (current.phase != Phase.EDITING || current.importNetwork?.encodings?.contains(encoding) != true) return
        mutableState.value = current.copy(encoding = encoding, issue = null)
    }

    public fun setPassphraseEnabled(enabled: Boolean) {
        val current = mutableState.value
        if (current.phase != Phase.EDITING || !current.profile.allowsPassphrase) return
        mutableState.value = if (enabled) {
            current.copy(usePassphrase = true)
        } else {
            current.copy(
                usePassphrase = false,
                values = current.values - Field.PASSPHRASE,
                revealed = current.revealed - Field.PASSPHRASE,
            )
        }
    }

    public fun toggleVisibility(field: Field) {
        val current = mutableState.value
        if (current.phase != Phase.EDITING || field == Field.LABEL) return
        val revealed = if (field in current.revealed) current.revealed - field else current.revealed + field
        mutableState.value = current.copy(revealed = revealed, focus = field, focusRevision = current.focusRevision + 1)
    }

    /** The app left the foreground: nothing typed stays readable on screen. */
    public fun hideValues() {
        mutableState.value = mutableState.value.copy(revealed = emptySet())
    }

    public fun submit() {
        submit(regenerated = false)
    }

    /** Cancel or Back: a form with anything in it asks first. Returns whether it may close now. */
    public fun requestDismiss(): Boolean {
        val current = mutableState.value
        if (current.phase == Phase.SAVING) return false
        if (!isDirty || current.phase == Phase.UNCERTAIN) return true
        mutableState.value = current.copy(confirmingDiscard = true)
        return false
    }

    public fun cancelDiscard() {
        mutableState.value = mutableState.value.copy(confirmingDiscard = false)
    }

    public fun revoke() {
        work?.cancel()
        phrase = null
        mutableState.value = State(phase = Phase.REVOKED, profile = mutableState.value.profile)
    }

    private fun submit(regenerated: Boolean) {
        val current = mutableState.value
        if (current.phase != Phase.EDITING) return
        if (!enabled) {
            mutableState.value = current.copy(issue = Issue.UNAVAILABLE, missing = emptySet())
            return
        }
        val required = buildList {
            add(Field.LABEL)
            when (intent) {
                Intent.RESTORE -> add(Field.MNEMONIC)
                Intent.IMPORT_KEY -> add(Field.PRIVATE_KEY)
                Intent.CREATE -> Unit
            }
            // An enabled but empty passphrase is a mistake to notice, not a silent default.
            if (intent != Intent.IMPORT_KEY && current.usePassphrase) add(Field.PASSPHRASE)
        }
        val missing = required.filter { current.value(it).isBlank() }.toSet()
        if (missing.isNotEmpty()) {
            mutableState.value = current.copy(
                missing = missing,
                issue = null,
                focus = required.first { it in missing },
                focusRevision = current.focusRevision + 1,
            )
            return
        }
        val chosen = when (intent) {
            Intent.IMPORT_KEY -> current.importNetwork != null
            else -> current.selectedNetworks.isNotEmpty()
        }
        if (!chosen) {
            mutableState.value = current.copy(issue = Issue.CHOOSE_NETWORK, missing = emptySet())
            return
        }
        if (intent == Intent.CREATE) {
            // A draft that expired is regenerated once; a missing one is generated on the way.
            phrase?.let { draft ->
                if (draft.expiresAt <= now()) {
                    phrase = null
                    if (regenerated) {
                        mutableState.value = current.copy(issue = Issue.EXPIRED_PHRASE, missing = emptySet())
                        return
                    }
                }
            }
            if (phrase == null) {
                generate(current) { submit(regenerated = true) }
                return
            }
        }
        save(current)
    }

    private fun generate(current: State, then: () -> Unit) {
        val profile = current.profile
        val request = WalletHDGenerateMnemonicRequest(
            mnemonicStandard = profile.standard,
            walletMode = profile.walletMode,
            wordCount = (profile.fixedWordCount ?: current.wordCount).toLong(),
            wordlist = WORDLIST,
        )
        mutableState.value = current.copy(phase = Phase.GENERATING, issue = null, missing = emptySet())
        work = scope.launch {
            try {
                val draft = store.generateWalletMnemonic(request, generation)
                if (mutableState.value.phase != Phase.GENERATING) return@launch
                phrase = draft
                mutableState.value = mutableState.value.copy(phase = Phase.EDITING)
                then()
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                if (error.failureKind == FailureKind.REVOKED) {
                    revoke()
                    return@launch
                }
                mutableState.value = mutableState.value.copy(phase = Phase.EDITING, issue = Issue.GENERATION_FAILED)
            }
        }
    }

    private fun save(current: State) {
        val label = current.value(Field.LABEL).trim()
        val id = requestId()
        val submission: suspend () -> Pair<String, String?> = if (intent == Intent.IMPORT_KEY) {
            val network = current.importNetwork ?: return
            val request = WalletImportCreateRequest(
                clientRequestID = id,
                curve = network.curve,
                encoding = current.encoding,
                label = label,
                network = network.wire,
                privateKey = current.value(Field.PRIVATE_KEY).trim(),
            );
            {
                val result = store.importWallet(request, generation)
                result.walletID to result.accountID
            }
        } else {
            val request = WalletHDCreateRequest(
                bip39Passphrase = if (current.usePassphrase) current.value(Field.PASSPHRASE) else null,
                clientRequestID = id,
                label = label,
                mnemonic = if (intent == Intent.RESTORE) words(current.value(Field.MNEMONIC)) else null,
                mnemonicDraftID = if (intent == Intent.CREATE) phrase?.mnemonicDraftID else null,
                mnemonicStandard = current.profile.standard,
                supportedNetworks = networks.map { it.network }.filter { it in current.selectedNetworks },
                walletMode = current.profile.walletMode,
                wordlist = WORDLIST,
            );
            {
                val result = store.createHdWallet(request, generation)
                result.walletID to result.accounts.firstOrNull()?.accountID
            }
        }
        mutableState.value = current.copy(phase = Phase.SAVING, issue = null, missing = emptySet())
        work = scope.launch {
            try {
                val (walletId, accountId) = submission()
                phrase = null
                mutableState.value = State(phase = Phase.SAVED, profile = mutableState.value.profile)
                onSaved(walletId, accountId)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                val kind = error.failureKind
                if (kind == FailureKind.REVOKED) {
                    revoke()
                    return@launch
                }
                val issue = when (kind) {
                    FailureKind.INVALID_INPUT -> Issue.INVALID_INPUT
                    FailureKind.UNAVAILABLE -> Issue.UNAVAILABLE
                    FailureKind.DENIED -> Issue.DENIED
                    else -> null
                }
                mutableState.value = if (issue != null) {
                    mutableState.value.copy(phase = Phase.EDITING, issue = issue)
                } else {
                    // The save may have happened: nothing secret stays while the wallets are checked.
                    phrase = null
                    val after = mutableState.value
                    after.copy(
                        phase = Phase.UNCERTAIN,
                        issue = Issue.UNCERTAIN_SAVE,
                        values = after.values - Field.MNEMONIC - Field.PASSPHRASE - Field.PRIVATE_KEY,
                        revealed = emptySet(),
                        usePassphrase = false,
                    )
                }
            }
        }
    }

    private fun words(phrase: String): List<String> = phrase.trim().split(Regex("\\s+"))

    private companion object {
        const val WORDLIST = "english"
    }
}
