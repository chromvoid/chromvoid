package com.chromvoid.air.ui.vault

import com.chromvoid.air.bridge.wire.CredentialTagSummary
import com.chromvoid.air.bridge.wire.CredentialWebsiteRule
import com.chromvoid.air.bridge.wire.PassmanagerEntryPageRequest
import com.chromvoid.air.bridge.wire.PassmanagerSSHPageRequest
import com.chromvoid.air.ui.credentials.AuditModel
import com.chromvoid.air.ui.credentials.CatalogModel
import com.chromvoid.air.ui.credentials.CatalogOptions
import com.chromvoid.air.ui.credentials.CodesCollection
import com.chromvoid.air.ui.credentials.CodesModel
import com.chromvoid.air.ui.credentials.CollectionCounts
import com.chromvoid.air.ui.credentials.CredentialClipboard
import com.chromvoid.air.ui.credentials.CardRules
import com.chromvoid.air.ui.credentials.CoreCardRules
import com.chromvoid.air.ui.credentials.CredentialDetailModel
import com.chromvoid.air.ui.credentials.CredentialFormModel
import com.chromvoid.air.ui.credentials.CredentialIconCache
import com.chromvoid.air.ui.credentials.CredentialStore
import com.chromvoid.air.ui.credentials.GroupPickerModel
import com.chromvoid.air.ui.credentials.GroupsModel
import com.chromvoid.air.ui.credentials.OfferedLogin
import com.chromvoid.air.ui.credentials.OtpScanner
import com.chromvoid.air.ui.credentials.PasswordGeneratorModel
import com.chromvoid.air.ui.credentials.TagsModel
import com.chromvoid.air.ui.credentials.WebsitesModel
import com.chromvoid.air.ui.passkeys.PasskeyStore
import com.chromvoid.air.ui.passkeys.PasskeysModel
import com.chromvoid.air.ui.ssh.SshModel
import com.chromvoid.air.ui.transfer.ImportSource
import com.chromvoid.air.ui.transfer.TransferMode
import com.chromvoid.air.ui.transfer.TransferTools
import com.chromvoid.air.ui.wallet.WalletModel
import com.chromvoid.air.ui.wallet.WalletStore
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** One level of the catalog: a group's records and its subgroups. */
public class CatalogLevel(public val catalog: CatalogModel, public val groups: GroupsModel) {
    /** The group this level shows; `/` is the vault root. */
    public val path: String get() = groups.parent

    internal fun reload() {
        catalog.reload()
        groups.reload()
    }

    internal fun close() {
        catalog.close()
        groups.close()
    }
}

/** The tag catalog, opened to narrow the list or to choose a record's tags. */
public class TagsSheet(public val model: TagsModel, public val purpose: Purpose) {
    public enum class Purpose { FILTER, ASSIGN }
}

/**
 * Everything the vault root shows for one unlocked generation: the catalog
 * levels opened into groups, the record opened from the top one, a form above
 * either, and the group picker a move uses. It is created when the session
 * unlocks and closed when it stops being unlocked, so a lock leaves no list,
 * query, record or draft behind, whatever still holds a reference to it.
 */
public class VaultScope(
    private val store: CredentialStore,
    public val generation: ULong,
    private val clipboard: CredentialClipboard,
    dispatcher: CoroutineDispatcher = Dispatchers.Main.immediate,
    private val searchDelayMillis: Long = CatalogModel.SEARCH_DELAY_MILLIS,
    private val scanner: OtpScanner? = null,
    /** The wallet's store; null where this client offers no wallet (tests, previews). */
    private val wallets: WalletStore? = null,
    /** The vault's passkeys; null where this client offers none (tests, previews). */
    private val passkeys: PasskeyStore? = null,
    /** Core's card rules; JVM tests, which have no native library, pass a fake. */
    private val cards: CardRules = CoreCardRules,
) {
    private val scope = CoroutineScope(SupervisorJob() + dispatcher)

    /**
     * The entry icons of this generation; every list and the record page draw from it. Declared
     * before the levels: the root level is built right below and takes the cache as it is then.
     */
    public val icons: CredentialIconCache = CredentialIconCache(store, generation, scope)

    private val mutableLevels = MutableStateFlow(listOf(level(GroupsModel.ROOT)))

    /** The vault root first, then each group opened from it. */
    public val levels: StateFlow<List<CatalogLevel>> = mutableLevels.asStateFlow()

    /** The vault root's catalog. */
    public val catalog: CatalogModel get() = mutableLevels.value.first().catalog

    private val mutableDetail = MutableStateFlow<CredentialDetailModel?>(null)

    /** The record opened from the catalog; null while the catalog is shown. */
    public val detail: StateFlow<CredentialDetailModel?> = mutableDetail.asStateFlow()

    private val mutableCodes = MutableStateFlow<CodesModel?>(null)

    /** The one-time codes of the open record. */
    public val codes: StateFlow<CodesModel?> = mutableCodes.asStateFlow()

    private val mutableForm = MutableStateFlow<CredentialFormModel?>(null)

    /** The create or edit form, drawn above the record or the catalog; null when none is open. */
    public val form: StateFlow<CredentialFormModel?> = mutableForm.asStateFlow()

    private val mutablePicker = MutableStateFlow<GroupPickerModel?>(null)

    /** Choosing where the open record moves; null when no move is in progress. */
    public val picker: StateFlow<GroupPickerModel?> = mutablePicker.asStateFlow()

    private val mutableCounts = MutableStateFlow(CollectionCounts())

    /** How many records carry codes, SSH keys and passkeys there are, for the root tiles. */
    public val counts: StateFlow<CollectionCounts> = mutableCounts.asStateFlow()

    /** Reads the tile counts again; a failure leaves the previous counts. */
    public fun refreshCounts() {
        scope.launch {
            val codes = runCatching {
                store.credentialPage(
                    PassmanagerEntryPageRequest(
                        limit = 1,
                        offset = 0,
                        query = "",
                        entryType = "login",
                        quickFilters = listOf("otp"),
                        sort = CatalogOptions.Sort.NAME.wire,
                    ),
                    generation,
                ).totalCount
            }.getOrNull()
            val ssh = runCatching {
                store.sshPage(PassmanagerSSHPageRequest(limit = 1, offset = 0), generation).totalCount
            }.getOrNull()
            val keys = passkeys?.let { store ->
                runCatching { store.listPasskeys(generation).passkeys.size.toLong() }.getOrNull()
            }
            mutableCounts.value = CollectionCounts(
                codes = codes ?: mutableCounts.value.codes,
                ssh = ssh ?: mutableCounts.value.ssh,
                passkeys = keys ?: mutableCounts.value.passkeys,
            )
        }
    }

    init {
        refreshCounts()
    }

    private val mutableCodesCollection = MutableStateFlow<CodesCollection?>(null)

    /** The Codes collection opened from its root tile: every login with codes, each code live. */
    public val codesCollection: StateFlow<CodesCollection?> = mutableCodesCollection.asStateFlow()

    public fun openCodesCollection() {
        if (mutableCodesCollection.value == null) {
            mutableCodesCollection.value =
                CodesCollection(store, generation, scope, clipboard, icons, searchDelayMillis)
        }
    }

    public fun closeCodesCollection() {
        mutableCodesCollection.value?.close()
        mutableCodesCollection.value = null
    }

    private val mutableCodesManager = MutableStateFlow<CodesModel?>(null)

    /** The code manager opened from the edit form of a saved login. */
    public val codesManager: StateFlow<CodesModel?> = mutableCodesManager.asStateFlow()

    public fun openCodesManager() {
        val form = mutableForm.value ?: return
        val id = form.editingId ?: return
        if (mutableCodesManager.value == null) {
            mutableCodesManager.value = CodesModel(id, store, generation, scope, clipboard, scanner)
        }
    }

    /** Codes are saved as they change; the form and the page read the record again. */
    public fun closeCodesManager() {
        val manager = mutableCodesManager.value ?: return
        manager.close()
        mutableCodesManager.value = null
        mutableForm.value?.refreshRevision()
        mutableCodes.value?.reload()
        mutableDetail.value?.reload()
    }

    private val mutableGenerator = MutableStateFlow<PasswordGeneratorModel?>(null)

    /** The password generator opened from the edit form of a login. */
    public val generator: StateFlow<PasswordGeneratorModel?> = mutableGenerator.asStateFlow()

    public fun openGenerator() {
        val form = mutableForm.value ?: return
        if (form.kind != CredentialFormModel.Kind.LOGIN || mutableGenerator.value != null) return
        mutableGenerator.value = PasswordGeneratorModel(store, generation, scope) { password ->
            // The candidate reaches the draft, not storage: the form's save keeps it.
            mutableForm.value?.change(CredentialFormModel.Field.PASSWORD, password)
            closeGenerator()
        }
    }

    public fun closeGenerator() {
        mutableGenerator.value?.close()
        mutableGenerator.value = null
    }

    private val mutableAudit = MutableStateFlow<AuditModel?>(null)

    /** The security audit, drawn in place of the catalog; records open above it. */
    public val audit: StateFlow<AuditModel?> = mutableAudit.asStateFlow()

    public fun openAudit() {
        if (mutableAudit.value == null) mutableAudit.value = AuditModel(store, generation, scope)
    }

    public fun closeAudit() {
        mutableAudit.value?.close()
        mutableAudit.value = null
    }

    private val mutableSsh = MutableStateFlow<SshModel?>(null)

    /** The SSH keys collection, drawn in place of the catalog. */
    public val ssh: StateFlow<SshModel?> = mutableSsh.asStateFlow()

    public fun openSsh() {
        if (mutableSsh.value == null) mutableSsh.value = SshModel(store, generation, scope, clipboard)
    }

    private val mutablePasskeys = MutableStateFlow<PasskeysModel?>(null)

    /** The passkeys page, pushed over the catalog while open. */
    public val passkeyList: StateFlow<PasskeysModel?> = mutablePasskeys.asStateFlow()

    /** Whether the Passkeys tile leads anywhere in this client. */
    public val offersPasskeys: Boolean get() = passkeys != null

    public fun openPasskeys() {
        val store = passkeys ?: return
        if (mutablePasskeys.value != null) return
        mutablePasskeys.value = PasskeysModel(store, generation, scope).also { model ->
            synchronizedSequence?.let(model::synchronize)
            model.reload()
        }
    }

    public fun closePasskeys() {
        mutablePasskeys.value?.revoke()
        mutablePasskeys.value = null
        refreshCounts()
    }

    private val mutableWallet = MutableStateFlow<WalletModel?>(null)

    /** The wallet, pushed over the catalog while open. */
    public val wallet: StateFlow<WalletModel?> = mutableWallet.asStateFlow()

    /** Whether the Wallet tile leads anywhere in this client. */
    public val offersWallet: Boolean get() = wallets != null

    public fun openWallet() {
        val store = wallets ?: return
        if (mutableWallet.value != null) return
        mutableWallet.value = WalletModel(store, generation, scope, clipboard).also { model ->
            synchronizedSequence?.let(model::synchronize)
            model.reload()
        }
    }

    public fun closeWallet() {
        mutableWallet.value?.revoke()
        mutableWallet.value = null
    }

    public fun closeSsh() {
        mutableSsh.value?.close()
        mutableSsh.value = null
    }

    private val mutableTransfers = MutableStateFlow<TransferTools?>(null)

    /** Import, export and clear, drawn in place of the catalog. */
    public val transfers: StateFlow<TransferTools?> = mutableTransfers.asStateFlow()

    public fun openTransfers(mode: TransferMode) {
        if (mutableTransfers.value == null) {
            mutableTransfers.value = TransferTools(mode, store, generation, scope, clipboard)
        }
    }

    public fun closeTransfers() {
        mutableTransfers.value?.close()
        mutableTransfers.value = null
    }

    /**
     * A credential export another app shared: the import opens with it
     * chosen, and Core reviews it before anything changes. An export or a
     * clear left open gives way; an import already under way is kept.
     */
    public fun importShared(source: ImportSource) {
        val open = mutableTransfers.value
        if (open != null && open.mode != TransferMode.IMPORT) closeTransfers()
        openTransfers(TransferMode.IMPORT)
        mutableTransfers.value?.import?.fileChosen(source)
    }

    private val mutableWebsites = MutableStateFlow<WebsitesModel?>(null)

    /** The website rules being edited, for the form's new record or the open saved one. */
    public val websites: StateFlow<WebsitesModel?> = mutableWebsites.asStateFlow()

    /**
     * A new record's rules are only validated and go back to the form; a
     * saved record's are stored by Core at once and the record reads again.
     */
    public fun openWebsites() {
        if (mutableWebsites.value != null) return
        val form = mutableForm.value ?: return
        val id = form.editingId
        mutableWebsites.value = if (id == null) {
            WebsitesModel(store, generation, scope, entryId = null, rules = form.state.value.websites) { rules ->
                form.setWebsites(rules)
                closeWebsites()
            }
        } else {
            // A saved record's rules are stored at once; the form keeps its draft and
            // takes the record's new revision, and the page behind it reads again.
            WebsitesModel(store, generation, scope, entryId = id) {
                closeWebsites()
                form.refreshRevision()
                mutableDetail.value?.reload()
            }
        }
    }

    /** Back or cancel on the websites editor: a changed list asks first. */
    public fun dismissWebsites() {
        val model = mutableWebsites.value ?: return
        if (model.requestDismiss()) closeWebsites()
    }

    public fun closeWebsites() {
        mutableWebsites.value?.close()
        mutableWebsites.value = null
    }

    private val mutableTags = MutableStateFlow<TagsSheet?>(null)

    /** The tag catalog, when open. */
    public val tags: StateFlow<TagsSheet?> = mutableTags.asStateFlow()

    private var synchronizedSequence: ULong? = null

    /**
     * The runtime reported a change. Every level and the open record read
     * again; the first call only records where this scope starts.
     */
    public fun synchronize(sequence: ULong) {
        val previous = synchronizedSequence
        synchronizedSequence = sequence
        if (previous == null || previous == sequence) return
        mutableLevels.value.forEach(CatalogLevel::reload)
        mutableDetail.value?.reload()
        mutableCodes.value?.reload()
        mutableAudit.value?.reload()
        mutableSsh.value?.reload()
        mutableCodesCollection.value?.reload()
        mutableWallet.value?.synchronize(sequence)
        mutablePasskeys.value?.synchronize(sequence)
        refreshCounts()
    }

    /** Opens the tag catalog to narrow the top level's list to one tag. */
    public fun openTagFilter() {
        if (mutableTags.value != null) return
        val current = mutableLevels.value.last().catalog.state.value.tag
        val model = TagsModel(store, generation, scope, listOfNotNull(current))
        mutableTags.value = TagsSheet(model, TagsSheet.Purpose.FILTER)
    }

    /** Opens the tag catalog to choose the tags of the record in the form. */
    public fun openTagChoice() {
        val form = mutableForm.value ?: return
        if (mutableTags.value != null) return
        val chosen = form.state.value.tags
        mutableTags.value = TagsSheet(TagsModel(store, generation, scope, chosen), TagsSheet.Purpose.ASSIGN)
    }

    /** A filter takes the tag tapped; a choice takes every tag ticked. */
    public fun chooseTag(tag: CredentialTagSummary) {
        val sheet = mutableTags.value ?: return
        when (sheet.purpose) {
            TagsSheet.Purpose.FILTER -> {
                mutableLevels.value.last().catalog.filterTag(tag)
                closeTags()
            }
            TagsSheet.Purpose.ASSIGN -> sheet.model.toggle(tag)
        }
    }

    /** Applies a choice of tags to the form and closes the catalog. */
    public fun applyTags() {
        val sheet = mutableTags.value ?: return
        if (sheet.purpose == TagsSheet.Purpose.ASSIGN) mutableForm.value?.setTags(sheet.model.state.value.selected)
        closeTags()
    }

    public fun closeTags() {
        mutableTags.value?.model?.close()
        mutableTags.value = null
    }

    /** Shows a subgroup as a new level; back returns to the one below. */
    public fun openGroup(path: String) {
        if (mutableDetail.value != null || mutableForm.value != null) return
        mutableLevels.value = mutableLevels.value + level(path)
    }

    /** Back from a group level; the vault root stays. */
    public fun closeGroup() {
        val levels = mutableLevels.value
        if (levels.size <= 1) return
        levels.last().close()
        mutableLevels.value = levels.dropLast(1)
    }

    public fun open(id: String) {
        mutableDetail.value?.close()
        mutableCodes.value?.close()
        mutableDetail.value = CredentialDetailModel(id, store, generation, scope, clipboard, cards)
        mutableCodes.value = CodesModel(id, store, generation, scope, clipboard, scanner)
    }

    /** Back to the catalog, which kept its query, entries and scroll. */
    public fun closeDetail() {
        closeWebsites()
        closePicker()
        mutableDetail.value?.close()
        mutableDetail.value = null
        mutableCodes.value?.close()
        mutableCodes.value = null
    }

    /** A new record goes into the group the top level shows. */
    public fun beginCreate(kind: CredentialFormModel.Kind) {
        if (mutableForm.value != null) return
        val group = mutableLevels.value.last().path.takeIf { it != GroupsModel.ROOT }
        mutableForm.value = CredentialFormModel.create(kind, store, generation, scope, group, cards = cards) { id ->
            formSaved(id, created = true)
        }
    }

    /** How the form of an offered login ended, told once; null while no such form is open. */
    private var offerAnswer: ((Boolean) -> Unit)? = null

    /**
     * A login another app offered to save opens as a new record, filled with what was typed
     * there and its site, in the vault root; the person edits and saves it or lets it go, and
     * [onAnswered] hears which, once. Refused while another form is open: the offer waits.
     */
    public fun offerLogin(login: OfferedLogin, onAnswered: (saved: Boolean) -> Unit): Boolean {
        if (mutableForm.value != null) return false
        closeDetail()
        offerAnswer = onAnswered
        mutableForm.value = CredentialFormModel.create(
            CredentialFormModel.Kind.LOGIN,
            store,
            generation,
            scope,
            prefill = mapOf(
                CredentialFormModel.Field.TITLE to login.title,
                CredentialFormModel.Field.USERNAME to login.username,
                CredentialFormModel.Field.PASSWORD to login.password,
            ),
            prefillWebsites = listOfNotNull(
                login.website.takeIf { it.isNotBlank() }?.let {
                    CredentialWebsiteRule(matchMode = WebsitesModel.DEFAULT_MODE, value = it)
                },
            ),
            cards = cards,
        ) { id -> formSaved(id, created = true) }
        return true
    }

    private fun answerOffer(saved: Boolean) {
        val answer = offerAnswer ?: return
        offerAnswer = null
        answer(saved)
    }

    /** Opens the record on screen for editing; revealed values are hidden first. */
    public fun beginEdit() {
        if (mutableForm.value != null) return
        val page = mutableDetail.value ?: return
        val detail = page.state.value.detail ?: return
        page.hideSecrets()
        mutableForm.value = CredentialFormModel.edit(detail, store, generation, scope, cards) { id ->
            formSaved(id, created = false)
        }
    }

    /** Back, predictive back or cancel on the form: a changed draft asks first. */
    public fun dismissForm() {
        val form = mutableForm.value ?: return
        if (form.requestDismiss()) closeForm()
    }

    /** The user confirmed discarding the draft. */
    public fun discardForm(): Unit = closeForm()

    /** Starts choosing the group of the record in the form, beginning where it is now. */
    public fun chooseGroup() {
        val form = mutableForm.value ?: return
        if (mutablePicker.value != null) return
        mutablePicker.value = GroupPickerModel(form.state.value.group, store, generation, scope)
    }

    public fun closePicker() {
        mutablePicker.value?.close()
        mutablePicker.value = null
    }

    /**
     * The form takes the chosen group, by default the level the picker shows.
     * Nothing is saved yet: the form's save moves the record, keeping its id.
     */
    public fun useGroup(path: String? = null) {
        val picker = mutablePicker.value ?: return
        mutableForm.value?.setGroup(path ?: picker.level.value.parent)
        closePicker()
    }

    /**
     * The app left the foreground with the vault still open: what was
     * revealed - secrets, codes, a pasted key or a prepared export - is
     * hidden again, so returning shows nothing that was on screen before.
     */
    public fun coverSensitiveValues() {
        mutableDetail.value?.hideSecrets()
        mutableCodes.value?.hideShown()
        mutableCodesManager.value?.hideShown()
        mutableGenerator.value?.close()
        mutableGenerator.value = null
        mutableSsh.value?.coverSensitiveValues()
        mutableWallet.value?.coverSensitiveValues()
    }

    /** The session ended: drop what was read and take back what was copied. */
    public fun close() {
        icons.close()
        closeGenerator()
        mutableCodesManager.value?.close()
        mutableCodesManager.value = null
        closeCodesCollection()
        closeWebsites()
        closeTransfers()
        closeWallet()
        mutablePasskeys.value?.revoke()
        mutablePasskeys.value = null
        closeSsh()
        closeAudit()
        closeTags()
        closePicker()
        mutableForm.value?.revoke()
        mutableForm.value = null
        // A lock lets an offered login go; the other app's page still holds what was typed.
        answerOffer(saved = false)
        closeDetail()
        mutableLevels.value.forEach(CatalogLevel::close)
        scope.cancel()
        clipboard.clearOwned()
    }

    private fun closeForm() {
        closeTags()
        closeWebsites()
        val form = mutableForm.value ?: return
        mutableForm.value = null
        // Part of a save may have landed; the record behind the form reads again.
        val stale = form.state.value.status == CredentialFormModel.Status.NEEDS_RELOAD
        form.revoke()
        answerOffer(saved = false)
        if (stale) mutableDetail.value?.reload()
    }

    /**
     * A new record opens in place of the form, so Back from it returns to the
     * catalog rather than to an empty form; an edited one shows its new state.
     * The catalog reads again when the runtime reports the change.
     */
    private fun formSaved(id: String, created: Boolean) {
        closeTags()
        mutableForm.value?.revoke()
        mutableForm.value = null
        answerOffer(saved = true)
        if (created) open(id) else mutableDetail.value?.reload()
    }

    private fun level(path: String): CatalogLevel {
        val group = path.takeIf { it != GroupsModel.ROOT }
        val catalog = CatalogModel(store, generation, scope, clipboard, icons, searchDelayMillis, group)
        return CatalogLevel(catalog, GroupsModel(path, store, generation, scope, onChanged = { catalog.reload() }))
    }
}
