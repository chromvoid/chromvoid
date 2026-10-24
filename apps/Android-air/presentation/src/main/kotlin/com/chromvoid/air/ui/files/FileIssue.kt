package com.chromvoid.air.ui.files

import com.chromvoid.air.bridge.CoreRefusal

/** Why a catalog change did not happen, as the Files screens explain it; iOS names the same cases. */
public enum class FileIssue {
    /** Access to the item is denied. */
    DENIED,

    /** An item with that name already exists where it would go. */
    NAME_TAKEN,

    /** The item is no longer there; the folder should be read again. */
    MISSING,

    /** The location belongs to the vault itself. */
    MANAGED,

    /** Core refused the name. */
    INVALID_NAME,

    /** Nothing was typed. */
    EMPTY_NAME,

    /** The document on the device could not be read or written. */
    DEVICE,

    /** No app on the device can take this file. */
    NO_APP,

    /** Anything else; the folder should be read again before another try. */
    OTHER,
}

/** Core's catalog codes, mapped once for every Files screen. */
public val Throwable.fileIssue: FileIssue
    get() = when ((this as? CoreRefusal)?.code) {
        "ACCESS_DENIED" -> FileIssue.DENIED
        "NAME_EXIST" -> FileIssue.NAME_TAKEN
        "NODE_NOT_FOUND", "PATH_NOT_FOUND" -> FileIssue.MISSING
        "SYSTEM_SHARD_DENIED" -> FileIssue.MANAGED
        "EMPTY_PAYLOAD", "INVALID_NAME" -> FileIssue.INVALID_NAME
        else -> FileIssue.OTHER
    }

/**
 * Whether Core refused this item for a reason of its own. Anything else - a
 * transport failure, a cancellation - leaves the outcome unknown, and a batch
 * stops there rather than guess.
 */
internal val Throwable.isItemRefusal: Boolean
    get() = (this as? CoreRefusal)?.code in ITEM_REFUSALS

private val ITEM_REFUSALS = setOf(
    "NAME_EXIST",
    "NODE_NOT_FOUND",
    "PATH_NOT_FOUND",
    "SYSTEM_SHARD_DENIED",
    "EMPTY_PAYLOAD",
    "NOT_A_DIR",
)
