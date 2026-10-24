package com.chromvoid.air.ui.maintenance

/** One file of a backup, in the order Core writes them. */
public data class BackupArtifact(val name: String, val byteCount: Long)

/** A backup Core has prepared: its files, read chunk by chunk. */
public interface BackupRun {
    public fun artifacts(): List<BackupArtifact>

    /** The next chunk of one artifact; empty means that artifact is complete. */
    public suspend fun read(artifact: Int): ByteArray

    /** Waits for Rust to unwind, so another attempt may start. */
    public suspend fun close()
}

/** Preparing a backup; the administrative password is what authorizes it. */
public interface BackupStore {
    public suspend fun prepareBackup(masterPassword: String, generation: ULong): BackupRun
}

/**
 * Where a backup is written. The platform owns the folder the person chose
 * and how bytes reach it; nothing about the format is decided here.
 */
public interface BackupDestination {
    /** What to show once the backup is saved, such as the folder's name. */
    public val label: String

    /**
     * Writes one file of the backup, taking chunks from [next] until it
     * returns none. An implementation must remove a partial file if it throws.
     */
    public suspend fun writeArtifact(name: String, next: suspend () -> ByteArray)

    /** Removes what an interrupted backup left behind. */
    public suspend fun discard()
}
