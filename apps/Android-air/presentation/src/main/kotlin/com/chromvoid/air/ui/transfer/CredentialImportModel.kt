package com.chromvoid.air.ui.transfer

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.bridge.wire.PassmanagerRootImportPreview
import com.chromvoid.air.ffi.BridgeException
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
 * An import: a file is chosen, Core reviews it (asking for the source's
 * password when it is encrypted), the person reads the counts and warnings,
 * and only then is it applied - after a second confirmation when it replaces
 * the credentials. A commit whose outcome is unknown is never retried here.
 */
public class CredentialImportModel(
    private val store: CredentialTransferStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
    private val onImported: () -> Unit = {},
) {
    public enum class Status {
        CHOOSING,
        PASSWORD,
        PREPARING,
        REVIEW,
        CONFIRMING,
        COMMITTING,
        FINISHED,
        FAILED,
        UNCERTAIN,
        REVOKED,
    }

    public enum class Issue { UNREADABLE, TOO_LARGE, INCOMPLETE, UNSUPPORTED, PASSWORD_INVALID, CHANGED, UNCERTAIN }

    public data class State(
        val status: Status = Status.CHOOSING,
        val replacing: Boolean = false,
        val filename: String = "",
        val preview: PassmanagerRootImportPreview? = null,
        val issue: Issue? = null,
        val sourcePassword: String = "",
    )

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()
    private var source: ImportSource? = null
    private var reviewed: ReviewedImport? = null
    private var work: Job? = null

    public fun setReplacing(replacing: Boolean) {
        val current = mutableState.value
        if (current.status == Status.CHOOSING || current.status == Status.FAILED) {
            mutableState.value = current.copy(replacing = replacing)
        }
    }

    /** Starts over from the choice of file; a review in progress is dropped. */
    public fun chooseAgain() {
        if (mutableState.value.status in setOf(Status.COMMITTING, Status.REVOKED)) return
        drop()
        mutableState.value = State(replacing = mutableState.value.replacing)
    }

    /** The person chose [chosen]; Core reviews it. */
    public fun fileChosen(chosen: ImportSource) {
        val current = mutableState.value
        if (current.status != Status.CHOOSING && current.status != Status.FAILED) return
        drop()
        source = chosen
        mutableState.value = current.copy(filename = chosen.name, preview = null, issue = null)
        prepare(null)
    }

    /** The picker could not hand over the file. */
    public fun fileUnreadable() {
        drop()
        mutableState.value = mutableState.value.copy(status = Status.FAILED, issue = Issue.UNREADABLE)
    }

    public fun setSourcePassword(password: String) {
        val current = mutableState.value
        if (current.status == Status.PASSWORD) {
            mutableState.value = current.copy(sourcePassword = password, issue = null)
        }
    }

    /** An empty password is a valid answer for some sources; Core decides. */
    public fun submitPassword() {
        val current = mutableState.value
        if (current.status != Status.PASSWORD) return
        mutableState.value = current.copy(sourcePassword = "")
        prepare(current.sourcePassword)
    }

    public fun requestImport() {
        val current = mutableState.value
        if (current.status != Status.REVIEW) return
        if (current.replacing) {
            mutableState.value = current.copy(status = Status.CONFIRMING)
        } else {
            commit()
        }
    }

    public fun cancelConfirmation() {
        val current = mutableState.value
        if (current.status == Status.CONFIRMING) mutableState.value = current.copy(status = Status.REVIEW)
    }

    public fun confirmReplacement() {
        if (mutableState.value.status == Status.CONFIRMING) commit()
    }

    public fun close() {
        drop()
        mutableState.value = State(Status.REVOKED)
    }

    private fun prepare(password: String?) {
        val chosen = source ?: return
        val replacing = mutableState.value.replacing
        mutableState.value = mutableState.value.copy(status = Status.PREPARING, issue = null)
        work = scope.launch {
            try {
                val review = store.reviewCredentialFile(chosen, replacing, password, generation)
                if (mutableState.value.status != Status.PREPARING) {
                    review.cancel()
                    return@launch
                }
                reviewed = review
                source = null
                mutableState.value = mutableState.value.copy(status = Status.REVIEW, preview = review.preview)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                refusePreparation(error)
            }
        }
    }

    private fun refusePreparation(error: Exception) {
        if (error.failureKind == FailureKind.REVOKED) {
            close()
            return
        }
        val code = (error as? CoreRefusal)?.code
        if (code == PASSWORD_REQUIRED || code == PASSWORD_INVALID) {
            mutableState.value = mutableState.value.copy(
                status = Status.PASSWORD,
                issue = if (code == PASSWORD_INVALID) Issue.PASSWORD_INVALID else null,
            )
            return
        }
        source = null
        mutableState.value = mutableState.value.copy(
            status = Status.FAILED,
            issue = when {
                error is ImportFileTooLarge || error is BridgeException.ImportTooLarge -> Issue.TOO_LARGE
                error is BridgeException.ImportLengthMismatch -> Issue.INCOMPLETE
                error is CoreRefusal -> Issue.UNSUPPORTED
                else -> Issue.UNREADABLE
            },
        )
    }

    private fun commit() {
        val review = reviewed ?: return
        mutableState.value = mutableState.value.copy(status = Status.COMMITTING)
        work = scope.launch {
            try {
                review.commit()
                reviewed = null
                mutableState.value = mutableState.value.copy(status = Status.FINISHED)
                onImported()
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                review.cancel()
                reviewed = null
                mutableState.value = when (error.failureKind) {
                    FailureKind.REVOKED -> State(Status.REVOKED)
                    FailureKind.STALE -> mutableState.value.copy(
                        status = Status.FAILED,
                        preview = null,
                        issue = Issue.CHANGED,
                    )
                    else -> mutableState.value.copy(status = Status.UNCERTAIN, issue = Issue.UNCERTAIN)
                }
            }
        }
    }

    private fun drop() {
        work?.cancel()
        reviewed?.cancel()
        reviewed = null
        source = null
    }

    private companion object {
        const val PASSWORD_REQUIRED = "CREDENTIAL_IMPORT_PASSWORD_REQUIRED"
        const val PASSWORD_INVALID = "CREDENTIAL_IMPORT_PASSWORD_INVALID"
    }
}
