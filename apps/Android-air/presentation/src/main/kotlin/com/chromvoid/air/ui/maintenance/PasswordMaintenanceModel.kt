package com.chromvoid.air.ui.maintenance

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.bridge.wire.MasterRekeyRequest
import com.chromvoid.air.bridge.wire.VaultRekeyRequest
import com.chromvoid.air.ui.support.FailureKind
import com.chromvoid.air.ui.support.failureKind
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Changing one of the two passwords. The draft lives only while the screen
 * does; a change that could not be confirmed says so rather than inviting a
 * second write, because a repeat over a half-applied change is not safe.
 */
public class PasswordMaintenanceModel(
    public val kind: Kind,
    private val store: MaintenanceStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
) {
    public enum class Kind { VAULT, ADMINISTRATOR }

    public enum class Status { EDITING, WORKING, DONE, UNCERTAIN, REVOKED }

    public enum class Field { CURRENT, NEW, CONFIRMATION }

    public enum class Issue { CURRENT_REQUIRED, NEW_REQUIRED, MISMATCH, SAME, REAUTHENTICATION, POLICY, CANCELLED }

    public data class State(
        val current: String = "",
        val replacement: String = "",
        val confirmation: String = "",
        val status: Status = Status.EDITING,
        val issue: Issue? = null,
        val invalidField: Field? = null,
        /** Rises each refusal so focus follows the field the message is about. */
        val focusRevision: Int = 0,
        val backupRecommended: Boolean = false,
    )

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()
    private var work: Job? = null

    public fun change(field: Field, value: String) {
        val current = mutableState.value
        if (current.status != Status.EDITING) return
        mutableState.value = when (field) {
            Field.CURRENT -> current.copy(current = value)
            Field.NEW -> current.copy(replacement = value)
            Field.CONFIRMATION -> current.copy(confirmation = value)
        }.copy(issue = null, invalidField = null)
    }

    public fun submit() {
        val state = mutableState.value
        if (state.status != Status.EDITING) return
        when {
            state.current.isEmpty() -> return refuse(Issue.CURRENT_REQUIRED, Field.CURRENT)
            state.replacement.isEmpty() -> return refuse(Issue.NEW_REQUIRED, Field.NEW)
            state.replacement == state.current -> return refuse(Issue.SAME, Field.NEW)
            state.replacement != state.confirmation -> return refuse(Issue.MISMATCH, Field.CONFIRMATION)
        }
        // The current password leaves the draft as the request is made: it is
        // needed once, and a refusal must not keep it on screen.
        mutableState.value = state.copy(current = "", status = Status.WORKING, issue = null, invalidField = null)
        work = scope.launch {
            try {
                val recommended = withContext(NonCancellable) {
                    when (kind) {
                        Kind.VAULT -> store.rekeyVault(
                            VaultRekeyRequest(currentPassword = state.current, newPassword = state.replacement),
                            generation,
                        ).backupRecommended
                        Kind.ADMINISTRATOR -> store.rekeyMaster(
                            MasterRekeyRequest(
                                currentPassword = state.current,
                                newMasterPassword = state.replacement,
                            ),
                            generation,
                        ).backupRecommended
                    }
                }
                mutableState.value = State(status = Status.DONE, backupRecommended = recommended)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                receive(error)
            }
        }
    }

    private fun receive(error: Exception) {
        if (error.failureKind == FailureKind.REVOKED) {
            revoke()
            return
        }
        when ((error as? CoreRefusal)?.code) {
            "REKEY_INVALID_CURRENT_PASSWORD", "MASTER_REKEY_INVALID_CURRENT_PASSWORD" ->
                refuse(Issue.REAUTHENTICATION, Field.CURRENT)
            "REKEY_PASSWORD_POLICY", "MASTER_REKEY_PASSWORD_POLICY" -> refuse(Issue.POLICY, Field.NEW)
            "REKEY_CANCELLED" -> refuse(Issue.CANCELLED, Field.CURRENT)
            // A transport failure or an interrupted commit is not permission to
            // write again: the screen says so and asks for the access to be checked.
            else -> mutableState.value = State(status = Status.UNCERTAIN)
        }
    }

    private fun refuse(issue: Issue, field: Field) {
        val current = mutableState.value
        mutableState.value = current.copy(
            status = Status.EDITING,
            issue = issue,
            invalidField = field,
            focusRevision = current.focusRevision + 1,
        )
    }

    /** The session ended, or the screen closed: no password stays behind. */
    public fun revoke() {
        work?.cancel()
        mutableState.value = State(status = Status.REVOKED)
    }
}
