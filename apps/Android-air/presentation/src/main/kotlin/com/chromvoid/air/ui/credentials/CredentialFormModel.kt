package com.chromvoid.air.ui.credentials

import com.chromvoid.air.bridge.wire.CredentialWebsiteRule
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import com.chromvoid.air.bridge.WireEnvelope
import com.chromvoid.air.bridge.wire.CredentialDetail
import com.chromvoid.air.bridge.wire.CredentialTagSummary
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateRequest
import com.chromvoid.air.bridge.wire.PassmanagerEntryCreateSecrets
import com.chromvoid.air.bridge.wire.PassmanagerEntryUpdateRequest
import com.chromvoid.air.bridge.wire.PaymentCardMetadata
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
 * The one form for a login or a payment card, new or existing.
 *
 * A new record goes to Core in one transaction with its protected fields. An
 * existing one is saved the way Core takes it: metadata first, under the
 * revision the form was opened with, then each changed protected field. A save
 * never retries on its own; when part of it landed and the rest did not, or
 * the outcome cannot be confirmed, the form says so and asks for a fresh start
 * instead of guessing. A refusal keeps the draft.
 */
public class CredentialFormModel private constructor(
    public val kind: Kind,
    initial: CredentialDetail?,
    /** Where a new record goes; null is the vault root. */
    groupPath: String?,
    private val store: CredentialStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
    private val onSaved: (String) -> Unit,
    /** Core's card rules: the number's network, grouping, lengths and check. */
    private val cards: CardRules,
    /** A new record's starting values, such as a login another app offered to save. */
    prefill: Map<Field, String> = emptyMap(),
    prefillWebsites: List<CredentialWebsiteRule> = emptyList(),
) {
    public enum class Kind(public val wire: String) { LOGIN("login"), CARD("payment_card") }

    public enum class Field { TITLE, USERNAME, PASSWORD, CARDHOLDER, CARD_NUMBER, CARD_CODE, MONTH, YEAR, NOTE, GROUP }

    public enum class Status {
        /** Reading the protected fields of the record being edited. */
        OPENING,
        EDITING,
        SAVING,
        SAVED,

        /** The draft cannot be saved as it stands; the form must be closed and reopened. */
        NEEDS_RELOAD,
        REVOKED,
    }

    public enum class FieldError {
        REQUIRED, MONTH, YEAR, NAME_TAKEN, CARD_NUMBER, INVALID_CARD_NUMBER, INVALID_CARD_CODE, GROUP,
    }

    /** What the form explains above its fields. */
    public enum class Issue {
        OPEN_FAILED,
        INVALID,
        INVALID_CARD_NUMBER,
        INVALID_CARD_CODE,
        GROUP_FAILED,
        DENIED,
        TOO_LARGE,
        PARTIAL,
        STALE,
        GONE,
        UNCERTAIN,
    }

    public data class State(
        val status: Status,
        val values: Map<Field, String> = emptyMap(),
        val initial: Map<Field, String> = emptyMap(),
        val errors: Map<Field, FieldError> = emptyMap(),
        val issue: Issue? = null,
        /** The field that should take focus, and a counter so the same one can be asked twice. */
        val focus: Field? = null,
        val focusRequest: Int = 0,
        val confirmingDiscard: Boolean = false,
        /** The tags the record carries, and those it carried when the form opened. */
        val tags: List<CredentialTagSummary> = emptyList(),
        val initialTags: List<CredentialTagSummary> = emptyList(),
        /** Website rules for a record being created, already validated by Core. */
        val websites: List<CredentialWebsiteRule> = emptyList(),
        /** The saved record's websites, as last read; its own editor changes them. */
        val savedWebsites: List<String> = emptyList(),
        /** The group the record will be in: `/` is the vault root. */
        val group: String = GroupsModel.ROOT,
        val initialGroup: String = GroupsModel.ROOT,
        /** The record is read again after its websites or codes were saved on their own. */
        val refreshing: Boolean = false,
        /** How the card is written: the typed number's network, else the stored one. */
        val cardFormat: CardFormat? = null,
        /** Core's reading of the number as typed. */
        val numberCheck: CardNumberCheck? = null,
        /** The number field was left; a doubt about the number waits for it. */
        val numberSettled: Boolean = false,
        /** The name Core gives the card if none is typed, once there is a number to name it by. */
        val cardTitleHint: String? = null,
    ) {
        /** A number Core would store but no network issues as typed; it never blocks the save. */
        val numberWarning: Boolean get() = numberSettled && numberCheck?.doubtful == true

        val tagsChanged: Boolean get() = tags.map { it.key }.toSet() != initialTags.map { it.key }.toSet()

        val isDirty: Boolean get() = values != initial || tagsChanged || websites.isNotEmpty() || group != initialGroup

        public fun value(field: Field): String =
            if (field == Field.GROUP) group.takeUnless { it == GroupsModel.ROOT }.orEmpty() else values[field].orEmpty()
    }

    /** The fields this kind of record has, in form order. */
    public val fields: List<Field> = when (kind) {
        Kind.LOGIN -> listOf(Field.TITLE, Field.USERNAME, Field.PASSWORD, Field.NOTE, Field.GROUP)
        Kind.CARD -> listOf(
            Field.TITLE,
            Field.CARD_NUMBER,
            Field.CARDHOLDER,
            Field.CARD_CODE,
            Field.MONTH,
            Field.YEAR,
            Field.NOTE,
            Field.GROUP,
        )
    }

    /** The record as last read; its revision is the one a save names. */
    private var editing: CredentialDetail? = initial

    public val isNew: Boolean get() = editing == null

    /** The record being edited; null while one is created. */
    public val editingId: String? get() = editing?.id

    /** False when a record carries rules this client cannot edit faithfully. */
    public val websitesEditable: Boolean get() = editing?.websitesEditable ?: true

    private val entryId: String = editing?.id ?: UUID.randomUUID().toString()
    private val mutableState = MutableStateFlow(
        State(
            if (initial == null) Status.EDITING else Status.OPENING,
            values = prefill.filterKeys { it in fields },
            websites = prefillWebsites,
            group = groupPath ?: GroupsModel.ROOT,
            initialGroup = groupPath ?: GroupsModel.ROOT,
            cardFormat = if (kind == Kind.CARD) cards.format(initial?.paymentCard?.brand) else null,
        ),
    )
    public val state: StateFlow<State> = mutableState.asStateFlow()
    private var work: Job? = null

    /** The network recognised from the digits typed so far, or the stored one. */
    public val brand: String?
        get() = mutableState.value.cardFormat?.network

    /**
     * A keystroke in [field]. On the card the draft keeps what the card can
     * print: digits only, no longer than the network issues, a month written
     * as the card writes it. A field finished by typing forward hands focus
     * on, number to expiry to code, as the iOS form does.
     */
    public fun change(field: Field, value: String) {
        if (field == Field.GROUP) return setGroup(value.ifEmpty { GroupsModel.ROOT })
        val current = mutableState.value
        if (current.status != Status.EDITING || current.value(field) == value) return
        val typed = if (kind == Kind.CARD) cardTyping(field, value, current) else null
        val values = current.values + (field to (typed?.value ?: value))
        var next = current.copy(values = values, errors = current.errors - field, issue = null)
        if (field == Field.CARD_NUMBER) next = next.withNumber(values[Field.CARD_NUMBER].orEmpty())
        if (typed?.done == true) {
            next = next.copy(focus = nextCardField(field, next), focusRequest = current.focusRequest + 1)
        }
        mutableState.value = next
    }

    /** Next on the keyboard: the field after [field] in the order a card is read out. */
    public fun advance(field: Field) {
        val current = mutableState.value
        if (current.status != Status.EDITING || kind != Kind.CARD) return
        mutableState.value = current.copy(
            focus = nextCardField(field, current),
            focusRequest = current.focusRequest + 1,
        )
    }

    /** The number field gained or lost focus; its doubt shows only once it is left. */
    public fun numberFocusChanged(focused: Boolean) {
        val current = mutableState.value
        if (current.status != Status.EDITING || kind != Kind.CARD || current.numberSettled == !focused) return
        mutableState.value = current.copy(numberSettled = !focused)
    }

    private fun cardTyping(field: Field, typed: String, current: State): PaymentCardTyping.Result? {
        val previous = current.value(field)
        return when (field) {
            Field.CARD_NUMBER -> PaymentCardTyping.number(typed, previous, cards)
            Field.MONTH -> PaymentCardTyping.month(typed, previous)
            Field.YEAR -> PaymentCardTyping.year(typed, previous)
            Field.CARD_CODE -> PaymentCardTyping.code(typed, previous, current.cardFormat?.codeDigits ?: 4)
            else -> null
        }
    }

    /** Number, expiry and code; then the holder while it is empty, else the keyboard goes (null). */
    private fun nextCardField(field: Field, state: State): Field? = when (field) {
        Field.CARDHOLDER -> Field.CARD_NUMBER
        Field.CARD_NUMBER -> Field.MONTH
        Field.MONTH -> Field.YEAR
        Field.YEAR -> Field.CARD_CODE
        Field.CARD_CODE -> if (state.value(Field.CARDHOLDER).isEmpty()) Field.CARDHOLDER else null
        else -> null
    }

    /** The number's reading, the card's format and the name Core would give it, for [number]. */
    private fun State.withNumber(number: String): State {
        val check = cards.inspect(number)
        val stored = editing?.paymentCard
        val format = check.format.takeIf { it.network != null } ?: cards.format(stored?.brand)
        val digits = PaymentCardText.digits(number)
        val hint = if (check.storable) {
            cards.defaultTitle(format.network, digits.takeLast(4))
        } else {
            stored?.let { card -> card.last4?.let { cards.defaultTitle(card.brand, it) } }
        }
        return copy(numberCheck = check, cardFormat = format, cardTitleHint = hint)
    }

    /** The tags the record will carry, chosen from the tag catalog. */
    public fun setTags(tags: List<CredentialTagSummary>) {
        val current = mutableState.value
        if (current.status != Status.EDITING) return
        mutableState.value = current.copy(tags = tags, issue = null)
    }

    /** The group the record is saved into; for a saved record, a change moves it. */
    public fun setGroup(path: String) {
        val current = mutableState.value
        if (current.status == Status.EDITING) {
            mutableState.value = current.copy(group = path, errors = current.errors - Field.GROUP, issue = null)
        }
    }

    /**
     * Reads the record again after its websites or codes were saved on their
     * own, so the next save names the current revision. The draft stays as
     * typed; only the revision and the saved websites change.
     */
    public fun refreshRevision() {
        val id = editing?.id ?: return
        mutableState.value = mutableState.value.copy(refreshing = true)
        scope.launch {
            try {
                val fresh = store.credentialDetail(id, generation)
                editing = fresh
                mutableState.value = mutableState.value.copy(refreshing = false, savedWebsites = fresh.websites)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                mutableState.value = if (error.failureKind == FailureKind.REVOKED) {
                    State(Status.REVOKED)
                } else {
                    mutableState.value.copy(refreshing = false, status = Status.NEEDS_RELOAD, issue = Issue.STALE)
                }
            }
        }
    }

    /** The website rules a new record will be created with. */
    public fun setWebsites(rules: List<CredentialWebsiteRule>) {
        val current = mutableState.value
        if (current.status == Status.EDITING && editing == null) {
            mutableState.value = current.copy(websites = rules, issue = null)
        }
    }

    /** Back, predictive back or cancel: a changed draft asks before it is discarded. */
    public fun requestDismiss(): Boolean {
        val current = mutableState.value
        if (current.isDirty && current.status == Status.EDITING) {
            mutableState.value = current.copy(confirmingDiscard = true)
            return false
        }
        return true
    }

    public fun cancelDiscard() {
        mutableState.value = mutableState.value.copy(confirmingDiscard = false)
    }

    public fun save() {
        val current = mutableState.value
        // A second tap while saving is refused: one submit, one record.
        if (current.status != Status.EDITING) return
        val errors = validate(current)
        if (errors.isNotEmpty()) {
            mutableState.value = current.copy(
                errors = errors,
                issue = null,
                focus = fields.first { it in errors },
                focusRequest = current.focusRequest + 1,
            )
            return
        }
        if (!isNew && !current.isDirty) {
            onSaved(entryId)
            return
        }
        mutableState.value = current.copy(status = Status.SAVING, errors = emptyMap(), issue = null)
        work = scope.launch {
            if (!checkGroup(current)) return@launch
            if (isNew) create(current) else update(current)
        }
    }

    public fun revoke() {
        work?.cancel()
        mutableState.value = State(Status.REVOKED)
    }

    private fun open(detail: CredentialDetail) {
        work = scope.launch {
            try {
                val values = mutableMapOf(Field.TITLE to detail.title)
                when (kind) {
                    Kind.LOGIN -> values[Field.USERNAME] = detail.username
                    Kind.CARD -> detail.paymentCard?.let { card ->
                        values[Field.CARDHOLDER] = card.cardholderName
                        values[Field.MONTH] = "%02d".format(card.expMonth)
                        values[Field.YEAR] = PaymentCards.shortYear(card.expYear)
                    }
                }
                for (field in fields.filter { it in SECRET_TYPES }) {
                    values[field] = readSecretOrEmpty(field)
                }
                val tags = detail.tagKeys.zip(detail.tags).map { (key, label) ->
                    CredentialTagSummary(colorID = "", count = 0, key = key, label = label)
                }
                val group = detail.groupPath.ifBlank { GroupsModel.ROOT }
                val opened = State(
                    Status.EDITING,
                    values = values,
                    initial = values.toMap(),
                    tags = tags,
                    initialTags = tags,
                    savedWebsites = detail.websites,
                    group = group,
                    initialGroup = group,
                    cardFormat = if (kind == Kind.CARD) cards.format(detail.paymentCard?.brand) else null,
                )
                mutableState.value = if (kind == Kind.CARD) {
                    opened.withNumber(values[Field.CARD_NUMBER].orEmpty())
                } else {
                    opened
                }
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                mutableState.value = if (error.failureKind == FailureKind.REVOKED) {
                    State(Status.REVOKED)
                } else {
                    State(Status.NEEDS_RELOAD, issue = Issue.OPEN_FAILED)
                }
            }
        }
    }

    private suspend fun readSecretOrEmpty(field: Field): String = try {
        store.readCredentialSecret(entryId, SECRET_TYPES.getValue(field), generation)
    } catch (error: Exception) {
        if (error is CancellationException || error.failureKind != FailureKind.MISSING) throw error
        ""
    }

    /** Core checks the destination without creating it; the record transaction remains its only writer. */
    private suspend fun checkGroup(draft: State): Boolean {
        if (draft.group == GroupsModel.ROOT || draft.group == draft.initialGroup) return true
        return try {
            store.groupPage(draft.group, offset = 0, generation = generation)
            true
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (error: Exception) {
            when (error.failureKind) {
                // Core validates the path before looking it up, so missing means a valid new destination.
                FailureKind.MISSING -> return true
                FailureKind.INVALID_INPUT -> refuseField(Field.GROUP, FieldError.GROUP)
                FailureKind.REVOKED -> revoke()
                FailureKind.DENIED -> settle(Status.EDITING, Issue.DENIED)
                else -> settle(Status.EDITING, Issue.GROUP_FAILED)
            }
            false
        }
    }

    private suspend fun create(draft: State) {
        try {
            val saved = store.createCredential(createRequest(draft), generation)
            // Core answering for another record is no proof this one exists.
            if (saved.entryID != entryId) {
                settle(Status.NEEDS_RELOAD, Issue.UNCERTAIN)
                return
            }
            mutableState.value = State(Status.SAVED)
            onSaved(entryId)
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (error: Exception) {
            refused(error, landed = false, writing = null)
        }
    }

    private suspend fun update(draft: State) {
        val detail = checkNotNull(editing)
        var landed = false
        var writing: Field? = null
        try {
            val metadata = updateRequest(detail, draft)
            if (metadata != null) {
                val saved = store.updateCredential(metadata, generation)
                if (saved.entryID != entryId) {
                    settle(Status.NEEDS_RELOAD, Issue.UNCERTAIN)
                    return
                }
                landed = true
            }
            for (field in fields.filter { it in SECRET_TYPES && draft.value(it) != draft.initial[it].orEmpty() }) {
                writing = field
                store.saveCredentialSecret(entryId, SECRET_TYPES.getValue(field), draft.value(field), generation)
                landed = true
            }
            mutableState.value = State(Status.SAVED)
            onSaved(entryId)
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (error: Exception) {
            refused(error, landed, writing)
        }
    }

    private fun refused(error: Exception, landed: Boolean, writing: Field?) {
        val kind = error.failureKind
        when {
            kind == FailureKind.REVOKED -> revoke()
            // Part of the save is in the vault and part is not: the draft no
            // longer describes one state, so it is not offered for another try.
            landed -> settle(Status.NEEDS_RELOAD, Issue.PARTIAL)
            kind == FailureKind.CONFLICT -> refuseField(Field.TITLE, FieldError.NAME_TAKEN)
            kind == FailureKind.INVALID_INPUT -> when (writing) {
                Field.CARD_NUMBER -> refuseField(writing, FieldError.INVALID_CARD_NUMBER, Issue.INVALID_CARD_NUMBER)
                Field.CARD_CODE -> refuseField(writing, FieldError.INVALID_CARD_CODE, Issue.INVALID_CARD_CODE)
                else -> settle(Status.EDITING, Issue.INVALID)
            }
            kind == FailureKind.DENIED -> settle(Status.EDITING, Issue.DENIED)
            kind == FailureKind.TOO_LARGE -> settle(Status.EDITING, Issue.TOO_LARGE)
            kind == FailureKind.STALE -> settle(Status.NEEDS_RELOAD, Issue.STALE)
            kind == FailureKind.MISSING && !isNew -> settle(Status.NEEDS_RELOAD, Issue.GONE)
            // A transport failure is no proof the transaction did not commit.
            else -> settle(Status.NEEDS_RELOAD, Issue.UNCERTAIN)
        }
    }

    private fun refuseField(field: Field, error: FieldError, issue: Issue? = null) {
        val current = mutableState.value
        mutableState.value = current.copy(
            status = Status.EDITING,
            errors = mapOf(field to error),
            issue = issue,
            focus = field,
            focusRequest = current.focusRequest + 1,
        )
    }

    private fun settle(status: Status, issue: Issue) {
        mutableState.value = mutableState.value.copy(status = status, issue = issue)
    }

    private fun validate(draft: State): Map<Field, FieldError> {
        val required = when (kind) {
            Kind.LOGIN -> listOf(Field.TITLE)
            // A card needs no name: Core names it from its network and last four digits.
            Kind.CARD -> listOf(Field.CARDHOLDER, Field.CARD_NUMBER, Field.MONTH, Field.YEAR)
        }
        val errors = required.filter { draft.value(it).isBlank() }.associateWith { FieldError.REQUIRED }.toMutableMap()
        if (kind == Kind.CARD) {
            // Core stores 12 to 19 digits; a shorter number is refused before the save.
            if (Field.CARD_NUMBER !in errors && !cards.inspect(draft.value(Field.CARD_NUMBER)).storable) {
                errors[Field.CARD_NUMBER] = FieldError.CARD_NUMBER
            }
            if (Field.MONTH !in errors && PaymentCards.month(draft.value(Field.MONTH)) == null) {
                errors[Field.MONTH] = FieldError.MONTH
            }
            if (Field.YEAR !in errors && PaymentCards.year(draft.value(Field.YEAR)) == null) {
                errors[Field.YEAR] = FieldError.YEAR
            }
        }
        return errors
    }

    private fun createRequest(draft: State): PassmanagerEntryCreateRequest {
        fun optional(field: Field) = draft.value(field).ifEmpty { null }
        val card = kind == Kind.CARD
        val metadata = if (card) {
            WireEnvelope.json.encodeToJsonElement(
                PaymentCardMetadata.serializer(),
                PaymentCardMetadata(
                    brand = brand ?: "unknown",
                    cardholderName = draft.value(Field.CARDHOLDER),
                    expMonth = checkNotNull(PaymentCards.month(draft.value(Field.MONTH))),
                    expYear = checkNotNull(PaymentCards.year(draft.value(Field.YEAR))),
                ),
            )
        } else {
            null
        }
        return PassmanagerEntryCreateRequest(
            entryID = entryId,
            entryType = kind.wire,
            groupPath = draft.group.takeIf { it != GroupsModel.ROOT },
            paymentCard = metadata,
            secrets = PassmanagerEntryCreateSecrets(
                cardCvv = if (card) optional(Field.CARD_CODE) else null,
                cardPan = if (card) draft.value(Field.CARD_NUMBER) else null,
                note = optional(Field.NOTE),
                password = if (card) null else optional(Field.PASSWORD),
            ),
            title = draft.value(Field.TITLE),
            username = if (card) null else draft.value(Field.USERNAME),
            tagKeys = draft.tags.map { it.key }.ifEmpty { null },
            urls = if (card || draft.websites.isEmpty()) {
                null
            } else {
                JsonArray(
                    draft.websites.map { rule ->
                        buildJsonObject {
                            put("value", rule.value)
                            put("match", rule.matchMode)
                        }
                    },
                )
            },
        )
    }

    /** Only what changed, under the revision the form opened with; null when nothing did. */
    private fun updateRequest(detail: CredentialDetail, draft: State): PassmanagerEntryUpdateRequest? {
        fun changed(field: Field) = draft.value(field).takeIf { it != draft.initial[field].orEmpty() }
        val title = changed(Field.TITLE)
        val username = changed(Field.USERNAME)
        val cardholder = changed(Field.CARDHOLDER)
        val month = changed(Field.MONTH)?.let(PaymentCards::month)
        val year = changed(Field.YEAR)?.let(PaymentCards::year)
        val tagKeys = if (draft.tagsChanged) draft.tags.map { it.key } else null
        // A move keeps the record's id; it only changes the group it is listed under.
        val group = draft.group.takeIf { it != draft.initialGroup }
        if (listOf(title, username, cardholder, month, year, tagKeys, group).all { it == null }) return null
        return PassmanagerEntryUpdateRequest(
            entryID = entryId,
            revision = detail.revision,
            title = title,
            username = username,
            cardholderName = cardholder,
            expMonth = month,
            expYear = year,
            tagKeys = tagKeys,
            groupPath = group,
        )
    }

    public companion object {
        /** The protected fields and the Core secret types they are stored as. */
        public val SECRET_TYPES: Map<Field, String> = mapOf(
            Field.PASSWORD to CredentialDetailModel.PASSWORD,
            Field.CARD_NUMBER to CredentialDetailModel.CARD_NUMBER,
            Field.CARD_CODE to CredentialDetailModel.CARD_CODE,
            Field.NOTE to CredentialDetailModel.NOTE,
        )


        public fun create(
            kind: Kind,
            store: CredentialStore,
            generation: ULong,
            scope: CoroutineScope,
            groupPath: String? = null,
            prefill: Map<Field, String> = emptyMap(),
            prefillWebsites: List<CredentialWebsiteRule> = emptyList(),
            cards: CardRules = CoreCardRules,
            onSaved: (String) -> Unit,
        ): CredentialFormModel =
            CredentialFormModel(
                kind,
                null,
                groupPath,
                store,
                generation,
                scope,
                onSaved,
                cards,
                prefill,
                prefillWebsites,
            )

        /** Opens [detail] for editing; its protected fields are read first. */
        public fun edit(
            detail: CredentialDetail,
            store: CredentialStore,
            generation: ULong,
            scope: CoroutineScope,
            cards: CardRules = CoreCardRules,
            onSaved: (String) -> Unit,
        ): CredentialFormModel? {
            val kind = Kind.entries.firstOrNull { it.wire == detail.entryType } ?: return null
            return CredentialFormModel(kind, detail, null, store, generation, scope, onSaved, cards).also {
                it.open(detail)
            }
        }
    }
}
