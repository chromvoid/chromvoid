package com.chromvoid.air.ui.credentials

import com.chromvoid.air.bridge.wire.CredentialOtpSummary
import com.chromvoid.air.bridge.wire.PassmanagerOtpRecordRequest
import com.chromvoid.air.bridge.wire.PassmanagerOtpRecordSaveRequest
import com.chromvoid.air.ui.support.FailureKind
import com.chromvoid.air.ui.support.failureKind
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * The one-time codes of one record. Core computes every code - there is no
 * TOTP in Kotlin - and says how long it stays valid; a shown code is dropped
 * when it expires rather than left on screen wrong. Adding a code takes a
 * setup key typed by hand or a QR code, which Core parses; a camera refusal
 * returns to the same manual draft.
 */
public class CodesModel(
    private val entryId: String,
    private val store: CredentialStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
    private val clipboard: CredentialClipboard,
    private val scanner: OtpScanner?,
    /** Monotonic milliseconds; replaceable so tests control expiry. */
    private val now: () -> Long = { System.nanoTime() / 1_000_000 },
) {
    public enum class Status { LOADING, READY, FAILED, REVOKED }

    public enum class DraftError { LABEL_REQUIRED, KEY_REQUIRED, KEY_INVALID, PERIOD_INVALID }

    public enum class Issue {
        DENIED,
        INVALID,
        STALE,
        FAILED,
        CODE_FAILED,
        CODE_EXPIRED,
        SCAN_UNREADABLE,
        CAMERA_DENIED,
        CAMERA_UNAVAILABLE,
    }

    public data class Draft(
        val label: String = "",
        val secret: String = "",
        val period: String = "30",
        val digits: Long = 6,
        val algorithm: String = "SHA1",
        val otpType: String = "TOTP",
        val errors: Set<DraftError> = emptySet(),
    )

    /** A code on screen and the moment (elapsed ms) it stops being valid; a counter-based code has none. */
    public data class Shown(val code: String, val expiresAt: Long?)

    public data class State(
        val status: Status = Status.LOADING,
        val records: List<CredentialOtpSummary> = emptyList(),
        val shown: Map<String, Shown> = emptyMap(),
        val draft: Draft? = null,
        val deleting: String? = null,
        val busy: Boolean = false,
        val issue: Issue? = null,
        val copies: Int = 0,
    )

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()
    private var revision = ""
    private var load: Job? = null
    private val expiries = mutableMapOf<String, Job>()

    init {
        reload()
    }

    public fun reload() {
        if (mutableState.value.status == Status.REVOKED) return
        load?.cancel()
        load = scope.launch {
            try {
                val result = store.otpRecords(entryId, generation)
                revision = result.revision
                mutableState.value = mutableState.value.copy(status = Status.READY, records = result.records)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                if (error.failureKind == FailureKind.REVOKED) {
                    close()
                } else {
                    mutableState.value = mutableState.value.copy(status = Status.FAILED, records = emptyList())
                }
            }
        }
    }

    /**
     * Asks Core for the record's current code and shows it until it expires; optionally copies it.
     * A time-based code asked for in its last second is already too late to type: as iOS does, the
     * model waits that second out and asks once more rather than show a code that is gone at once.
     */
    public fun show(label: String, copy: Boolean = false) {
        if (mutableState.value.status != Status.READY) return
        scope.launch {
            try {
                val request = PassmanagerOtpRecordRequest(entryId, label, revision)
                var started = now()
                var result = store.otpCode(request, generation)
                if (result.leftSeconds > 0 && deadline(started, result.leftSeconds) <= now()) {
                    delay(MARGIN_MILLIS)
                    started = now()
                    result = store.otpCode(request, generation)
                }
                // A counter-based code has no deadline; it stays until the page lets it go.
                val expiresAt = if (result.leftSeconds > 0) deadline(started, result.leftSeconds) else null
                if (expiresAt != null && expiresAt <= now()) {
                    mutableState.value = mutableState.value.copy(issue = Issue.CODE_EXPIRED)
                    return@launch
                }
                mutableState.value = mutableState.value.copy(
                    shown = mutableState.value.shown + (label to Shown(result.otp, expiresAt)),
                    issue = null,
                )
                if (copy) copyShown(label)
                if (expiresAt != null) expire(label, expiresAt)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                refuse(error, Issue.CODE_FAILED)
            }
        }
    }

    public fun copyShown(label: String) {
        val code = mutableState.value.shown[label]?.code ?: return
        clipboard.copy(code, sensitive = true)
        mutableState.value = mutableState.value.copy(copies = mutableState.value.copies + 1)
    }

    public fun beginAdd() {
        if (mutableState.value.status == Status.READY && !mutableState.value.busy) {
            mutableState.value = mutableState.value.copy(draft = Draft(), issue = null)
        }
    }

    public fun changeDraft(update: (Draft) -> Draft) {
        val draft = mutableState.value.draft ?: return
        mutableState.value = mutableState.value.copy(draft = update(draft).copy(errors = emptySet()))
    }

    public fun cancelDraft() {
        mutableState.value = mutableState.value.copy(draft = null, issue = null)
    }

    /**
     * Fills the draft from a QR code. Core parses the URI; a refused camera or
     * an unreadable code leaves the draft as it was, to be typed by hand.
     */
    public fun scan() {
        val camera = scanner ?: run {
            mutableState.value = mutableState.value.copy(issue = Issue.CAMERA_UNAVAILABLE)
            return
        }
        if (mutableState.value.draft == null) beginAdd()
        scope.launch {
            val result = camera.scan()
            val issue = when (result) {
                is OtpScanner.Result.Scanned -> try {
                    val parsed = store.parseOtpUri(result.text, generation)
                    changeDraft {
                        it.copy(
                            label = parsed.settings.label.ifEmpty { parsed.issuer.ifEmpty { parsed.account } },
                            secret = parsed.secret,
                            period = parsed.settings.period.toString(),
                            digits = parsed.settings.digits,
                            algorithm = parsed.settings.algorithm,
                            otpType = parsed.settings.otpType,
                        )
                    }
                    null
                } catch (cancellation: CancellationException) {
                    throw cancellation
                } catch (error: Exception) {
                    if (error.failureKind == FailureKind.REVOKED) {
                        close()
                        return@launch
                    }
                    Issue.SCAN_UNREADABLE
                }
                OtpScanner.Result.Cancelled -> null
                OtpScanner.Result.PermissionDenied -> Issue.CAMERA_DENIED
                OtpScanner.Result.Unavailable -> Issue.CAMERA_UNAVAILABLE
            }
            mutableState.value = mutableState.value.copy(issue = issue)
        }
    }

    public fun saveDraft() {
        val current = mutableState.value
        val draft = current.draft ?: return
        if (current.busy) return
        val secret = draft.secret.filterNot(Char::isWhitespace).uppercase()
        val errors = buildSet {
            if (draft.label.isBlank()) add(DraftError.LABEL_REQUIRED)
            if (secret.isEmpty()) add(DraftError.KEY_REQUIRED)
            // A mistyped key would be stored and every code from it would be wrong.
            else if (!secret.trimEnd('=').all { it in BASE32 }) add(DraftError.KEY_INVALID)
            val period = draft.period.toLongOrNull()
            if (draft.otpType == "TOTP" && (period == null || period !in 10..120)) add(DraftError.PERIOD_INVALID)
        }
        if (errors.isNotEmpty()) {
            mutableState.value = current.copy(draft = draft.copy(errors = errors))
            return
        }
        val request = PassmanagerOtpRecordSaveRequest(
            entryID = entryId,
            revision = revision,
            secret = secret,
            settings = CredentialOtpSummary(
                algorithm = draft.algorithm,
                digits = draft.digits,
                encoding = "base32",
                label = draft.label.trim(),
                otpType = draft.otpType,
                period = draft.period.toLong(),
            ),
        )
        mutate { store.saveOtp(request, generation) }
    }

    public fun requestDelete(label: String) {
        if (!mutableState.value.busy) mutableState.value = mutableState.value.copy(deleting = label)
    }

    public fun cancelDelete() {
        mutableState.value = mutableState.value.copy(deleting = null)
    }

    public fun confirmDelete() {
        val label = mutableState.value.deleting ?: return
        mutableState.value = mutableState.value.copy(deleting = null)
        mutate { store.deleteOtp(PassmanagerOtpRecordRequest(entryId, label, revision), generation) }
    }

    /** Forgets every shown code; the page asks Core again when it is next drawn. */
    public fun hideShown() {
        expiries.values.forEach(Job::cancel)
        expiries.clear()
        mutableState.value = mutableState.value.copy(shown = emptyMap())
    }

    public fun close() {
        load?.cancel()
        expiries.values.forEach(Job::cancel)
        expiries.clear()
        mutableState.value = State(Status.REVOKED)
    }

    private fun mutate(action: suspend () -> Unit) {
        mutableState.value = mutableState.value.copy(busy = true, issue = null)
        scope.launch {
            try {
                action()
                mutableState.value = mutableState.value.copy(busy = false, draft = null, shown = emptyMap())
                reload()
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                mutableState.value = mutableState.value.copy(busy = false)
                refuse(error, Issue.FAILED)
                if (error.failureKind == FailureKind.STALE) reload()
            }
        }
    }

    private fun refuse(error: Exception, otherwise: Issue) {
        val issue = when (error.failureKind) {
            FailureKind.REVOKED -> {
                close()
                return
            }
            FailureKind.DENIED -> Issue.DENIED
            FailureKind.INVALID_INPUT -> Issue.INVALID
            FailureKind.STALE, FailureKind.MISSING -> Issue.STALE
            else -> otherwise
        }
        mutableState.value = mutableState.value.copy(issue = issue)
    }

    /** A margin before Core's deadline: a code shown for its last instant is typed too late. */
    private fun deadline(started: Long, leftSeconds: Long): Long = started + leftSeconds * 1000 - MARGIN_MILLIS

    private fun expire(label: String, expiresAt: Long) {
        expiries.remove(label)?.cancel()
        expiries[label] = scope.launch {
            delay((expiresAt - now()).coerceAtLeast(0))
            val shown = mutableState.value.shown
            if (shown[label]?.expiresAt == expiresAt) {
                mutableState.value = mutableState.value.copy(shown = shown - label)
            }
        }
    }

    private companion object {
        const val BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
        const val MARGIN_MILLIS = 1_000L
    }
}
