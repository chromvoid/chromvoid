package com.chromvoid.air.ui.maintenance

/** One file of a backup as Core expects it: its name in the folder, its size limit, and whether it may be absent. */
public data class RestoreArtifact(val name: String, val maximumBytes: Long, val required: Boolean)

/** What Core found in a backup it checked. */
public data class RestorePreview(val byteCount: Long)

/**
 * A restore Core has begun: the files it takes, in order, and the steps from
 * receiving them to the one transaction that replaces the empty storage.
 */
public interface RestoreRun {
    public val artifacts: List<RestoreArtifact>

    /** The largest chunk Core accepts in one append. */
    public val chunkBytes: Int

    /** One chunk of [artifact]; an empty chunk says a present file is complete. */
    public suspend fun append(artifact: Int, bytes: ByteArray)

    /** Core's check of everything appended, opened with the backup's administrative password. */
    public suspend fun review(masterPassword: String): RestorePreview

    public suspend fun commit()

    /** Stops at once; [close] waits for Rust to let go. */
    public fun cancel()

    public suspend fun close()
}

/** Beginning a restore; the backup's own administrative password is what opens it. */
public interface RestoreStore {
    public suspend fun beginRestore(generation: ULong): RestoreRun
}

/**
 * The backup folder the person chose. The platform owns how its files are
 * reached; the order, the limits and the format are Core's.
 */
public interface RestoreSource {
    /** What to show for the chosen folder, such as its name. */
    public val label: String

    /**
     * Opens each of [artifacts] in the folder and returns their total size.
     * An absent file that may be absent is skipped; an absent required file,
     * or one over its limit, fails before anything reaches Core.
     */
    public suspend fun open(artifacts: List<RestoreArtifact>): Long

    /**
     * The next chunk of at most [maximum] bytes of [artifact]: null when the
     * file was absent, empty once a present file has been read to its end.
     */
    public suspend fun read(artifact: Int, maximum: Int): ByteArray?

    public suspend fun close()
}
