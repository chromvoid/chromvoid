package com.chromvoid.air.bridge

import com.chromvoid.air.bridge.wire.MarkdownDocument
import com.chromvoid.air.ffi.parseAirMarkdown
import com.chromvoid.air.ffi.toggleAirMarkdownTask

/**
 * Core's Markdown, through air-ffi: the one parser and the one task editor,
 * shared with iOS so a note reads the same on both and a task names the
 * source position Core computed. Pure transformations of text already opened;
 * nothing here reads or saves the vault.
 */
public object MarkdownProcessor {
    public fun parse(source: String): MarkdownDocument {
        val bytes = parseAirMarkdown(source)
        try {
            return WireEnvelope.json.decodeFromString(MarkdownDocument.serializer(), bytes.decodeToString())
        } finally {
            bytes.fill(0)
        }
    }

    /** The source with one task's box ticked or cleared; refused when [sourceDigest] is stale. */
    public fun toggleTask(source: String, sourceDigest: String, markerStart: Long, checked: Boolean): String =
        toggleAirMarkdownTask(source, sourceDigest, markerStart.toUInt(), checked)
}
