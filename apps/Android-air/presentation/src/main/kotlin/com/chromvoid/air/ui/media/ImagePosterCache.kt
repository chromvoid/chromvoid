package com.chromvoid.air.ui.media

import android.graphics.Bitmap

/**
 * Decoded images of this session, so a folder's images open at once the
 * second time. Keyed by the source revision, so a changed file never shows
 * its old picture; the least recently shown go first once [maximumBytes] of
 * pixels are held, and everything goes when the session closes.
 */
public class ImagePosterCache(private val maximumBytes: Long = DEFAULT_BYTES) {
    public data class Key(val nodeId: Long, val sourceRevision: Long)

    public class Poster(public val bitmap: Bitmap, public val details: ImageDetails?)

    private val posters = LinkedHashMap<Key, Poster>(INITIAL_CAPACITY, LOAD_FACTOR, true)
    private var bytes = 0L

    @Synchronized
    public fun poster(key: Key): Poster? = posters[key]

    @Synchronized
    public fun store(key: Key, poster: Poster) {
        posters.put(key, poster)?.let { bytes -= it.bitmap.allocationByteCount }
        bytes += poster.bitmap.allocationByteCount
        val eldest = posters.entries.iterator()
        while (bytes > maximumBytes && eldest.hasNext()) {
            val entry = eldest.next()
            if (entry.key == key) continue
            bytes -= entry.value.bitmap.allocationByteCount
            eldest.remove()
        }
    }

    @Synchronized
    public fun clear() {
        posters.clear()
        bytes = 0
    }

    private companion object {
        const val DEFAULT_BYTES = 48L * 1024 * 1024
        const val INITIAL_CAPACITY = 16
        const val LOAD_FACTOR = 0.75f
    }
}
