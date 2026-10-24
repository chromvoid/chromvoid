package com.chromvoid.air.ui

import kotlinx.coroutines.flow.StateFlow

/** What the shell may render. Nothing here carries vault content. */
public sealed interface AirSessionState {
    public data object Starting : AirSessionState

    /** The runtime could not be opened. [code] is a bridge error name for support. */
    public data class Unavailable(val code: String, val adoption: AdoptionIssue? = null) : AirSessionState

    /** First run: the administrative password is not set yet. */
    public data object NeedsAdministrator : AirSessionState

    public data object Locked : AirSessionState

    public data class Unlocked(val generation: ULong) : AirSessionState
}

/** A transfer outcome the shell can explain without exposing storage paths. */
public enum class AdoptionIssue {
    BLOCKED,
    PEPPER_UNAVAILABLE,
    LEGACY_ROOT_OUTSIDE_DATA_DIR,
    LEGACY_ROOT_UNAVAILABLE,
    STORAGE_UNAVAILABLE,
    ACTION_FORBIDDEN,
}

/** The outcome of one access attempt, in the terms the screen can explain. */
public sealed interface AccessOutcome {
    public data object Accepted : AccessOutcome

    /** The input never reached Core. */
    public data class Rejected(val reason: AccessInputProblem) : AccessOutcome

    /** Core or the bridge refused. [code] is theirs, not ours. */
    public data class Refused(val code: String) : AccessOutcome
}

public enum class AccessInputProblem {
    EMPTY_PASSWORD,
    EMPTY_CONFIRMATION,
    CONFIRMATION_MISMATCH,
}

/**
 * The part of the session the access screens may use. The application's
 * session coordinator implements it; state holders never see the runtime.
 */
public interface AccessSession {
    public val state: StateFlow<AirSessionState>

    /**
     * Advances whenever the runtime reports a change - of the vault's content
     * or of the session. A state holder that read under an older value reads
     * again.
     */
    public val sequence: StateFlow<ULong>

    /**
     * The generation device administration runs under - backup, restore,
     * erase, the administrative password - or null while Core admits none of
     * it: it needs the vault locked or open, not leaving the foreground, gone
     * or still cleaning up.
     */
    public val administration: StateFlow<ULong?>

    public suspend fun setUpAdministrator(password: String, confirmation: String): AccessOutcome

    public suspend fun unlock(password: String): AccessOutcome

    /** Locks the vault now; what the shell shows follows the state Rust reports. */
    public suspend fun lock()

    /** Reads the session again, after an operation that replaced the storage under it. */
    public suspend fun refresh()
}

/**
 * The form rules for access input, owned here so there is one of them. The
 * session coordinator applies them before anything reaches Core, which is what
 * guarantees an empty or mismatched password is never sent.
 */
public object AccessInput {
    public fun administratorProblem(password: String, confirmation: String): AccessInputProblem? = when {
        password.isEmpty() -> AccessInputProblem.EMPTY_PASSWORD
        confirmation.isEmpty() -> AccessInputProblem.EMPTY_CONFIRMATION
        password != confirmation -> AccessInputProblem.CONFIRMATION_MISMATCH
        else -> null
    }

    public fun unlockProblem(password: String): AccessInputProblem? =
        if (password.isEmpty()) AccessInputProblem.EMPTY_PASSWORD else null
}
