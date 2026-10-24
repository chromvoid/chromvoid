package com.chromvoid.air.ui.maintenance

/** How deleting all local data ended, as Rust's receipt says. */
public enum class EraseOutcome {
    COMPLETED,

    /** Some data or device keys could not be removed. */
    INCOMPLETE,

    /** Neither the reply nor Rust could say how it ended. */
    UNCONFIRMED,
}

/** An erase Core has reviewed; nothing is deleted until [commit]. */
public interface EraseReview {
    /**
     * Deletes everything and says how that ended. A wrong administrative
     * password is thrown as Core's refusal and leaves the review usable.
     */
    public suspend fun commit(masterPassword: String): EraseOutcome

    public fun cancel()
}

/** Beginning an erase; the review needs no password, the deletion does. */
public interface EraseStore {
    public suspend fun reviewErase(generation: ULong): EraseReview
}
