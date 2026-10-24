package com.chromvoid.air.ui.ssh

import com.chromvoid.air.bridge.wire.PassmanagerSSHImportRequest
import com.chromvoid.air.bridge.wire.PassmanagerSSHKeygenRequest
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
 * Adds one SSH key: Core generates a new one, or parses a private key pasted
 * or read from a file (with its passphrase). A refusal keeps the form; a save
 * whose outcome is unknown clears the key text and asks for a check of the
 * list before another try, so a key is never added twice by accident.
 */
public class SshCreationModel(
    private val store: SshStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
    private val onSaved: () -> Unit,
) {
    public enum class Mode { GENERATE, IMPORT }

    public enum class Status { EDITING, SAVING, UNCERTAIN, REVOKED }

    public enum class Field(internal val limitBytes: Int) {
        NAME(256),
        COMMENT(1024),
        PRIVATE_KEY(SSH_KEY_FILE_LIMIT_BYTES),
        PASSPHRASE(1024),
    }

    public enum class Algorithm(public val wire: String) { ED25519("ed25519"), RSA("rsa"), ECDSA("ecdsa") }

    public enum class Issue { KEY_REQUIRED, TOO_LONG, REFUSED, FILE_UNREADABLE, UNCERTAIN }

    public data class State(
        val status: Status = Status.EDITING,
        val mode: Mode = Mode.GENERATE,
        val algorithm: Algorithm = Algorithm.ED25519,
        val values: Map<Field, String> = emptyMap(),
        val issue: Issue? = null,
        val errors: Map<Field, Issue> = emptyMap(),
        val focus: Field? = null,
        val focusRequest: Int = 0,
        val confirmingDiscard: Boolean = false,
    ) {
        public fun value(field: Field): String = values[field].orEmpty()

        public val isDirty: Boolean get() = values.values.any { it.isNotEmpty() }
    }

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()
    private var save: Job? = null

    public fun change(field: Field, value: String) {
        val current = mutableState.value
        if (current.status != Status.EDITING) return
        mutableState.value = current.copy(
            values = current.values + (field to value),
            issue = null,
            errors = current.errors - field,
        )
    }

    /** Switching mode drops the key text and passphrase of the other mode. */
    public fun setMode(mode: Mode) {
        val current = mutableState.value
        if (current.status != Status.EDITING || current.mode == mode) return
        mutableState.value = current.copy(
            mode = mode,
            values = current.values - Field.PRIVATE_KEY - Field.PASSPHRASE,
            issue = null,
            errors = emptyMap(),
            focus = null,
        )
    }

    public fun setAlgorithm(algorithm: Algorithm) {
        if (mutableState.value.status == Status.EDITING) {
            mutableState.value = mutableState.value.copy(algorithm = algorithm)
        }
    }

    /** A key file's text, read by the screen; null when it could not be read or was too large. */
    public fun fileRead(text: String?) {
        val current = mutableState.value
        if (current.status != Status.EDITING || current.mode != Mode.IMPORT) return
        mutableState.value = if (text == null) {
            current.copy(
                issue = Issue.FILE_UNREADABLE,
                errors = current.errors + (Field.PRIVATE_KEY to Issue.FILE_UNREADABLE),
            )
        } else {
            current.copy(
                values = current.values + (Field.PRIVATE_KEY to text),
                issue = null,
                errors = current.errors - Field.PRIVATE_KEY,
            )
        }
    }

    /** Back or cancel: a filled form asks first. Returns true when it may close now. */
    public fun requestClose(): Boolean {
        val current = mutableState.value
        if (current.status == Status.SAVING || (current.status == Status.EDITING && current.isDirty)) {
            mutableState.value = current.copy(confirmingDiscard = true)
            return false
        }
        return true
    }

    public fun cancelDiscard() {
        mutableState.value = mutableState.value.copy(confirmingDiscard = false)
    }

    public fun submit() {
        val current = mutableState.value
        if (current.status != Status.EDITING) return
        val fields = if (current.mode == Mode.GENERATE) {
            listOf(Field.NAME, Field.COMMENT)
        } else {
            listOf(Field.NAME, Field.PRIVATE_KEY, Field.PASSPHRASE)
        }
        val errors = buildMap {
            fields.forEach { field ->
                when {
                    field == Field.PRIVATE_KEY && current.value(field).isBlank() -> put(field, Issue.KEY_REQUIRED)
                    current.value(field).toByteArray().size > field.limitBytes -> put(field, Issue.TOO_LONG)
                }
            }
        }
        if (errors.isNotEmpty()) {
            val field = fields.first { it in errors }
            mutableState.value = current.copy(
                issue = errors.getValue(field),
                errors = errors,
                focus = field,
                focusRequest = current.focusRequest + 1,
            )
            return
        }
        mutableState.value = current.copy(status = Status.SAVING, issue = null, errors = emptyMap())
        save = scope.launch {
            try {
                if (current.mode == Mode.GENERATE) {
                    store.generateSsh(
                        PassmanagerSSHKeygenRequest(
                            comment = current.value(Field.COMMENT),
                            keyType = current.algorithm.wire,
                            name = current.value(Field.NAME),
                        ),
                        generation,
                    )
                } else {
                    store.importSsh(
                        PassmanagerSSHImportRequest(
                            name = current.value(Field.NAME),
                            passphrase = current.value(Field.PASSPHRASE).ifEmpty { null },
                            privateKey = current.value(Field.PRIVATE_KEY),
                        ),
                        generation,
                    )
                }
                mutableState.value = mutableState.value.copy(values = emptyMap())
                onSaved()
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                val after = mutableState.value
                mutableState.value = when (error.failureKind) {
                    FailureKind.REVOKED -> State(Status.REVOKED)
                    FailureKind.INVALID_INPUT, FailureKind.MISSING, FailureKind.DENIED -> {
                        val field = if (current.mode == Mode.IMPORT) Field.PRIVATE_KEY else Field.NAME
                        after.copy(
                            status = Status.EDITING,
                            issue = Issue.REFUSED,
                            errors = mapOf(field to Issue.REFUSED),
                            focus = field,
                            focusRequest = after.focusRequest + 1,
                        )
                    }
                    else -> after.copy(status = Status.UNCERTAIN, values = emptyMap(), issue = Issue.UNCERTAIN)
                }
            }
        }
    }

    public fun close() {
        save?.cancel()
        mutableState.value = State(Status.REVOKED)
    }
}
