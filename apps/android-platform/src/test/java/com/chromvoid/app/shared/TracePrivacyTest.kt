package com.chromvoid.app.shared

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class TracePrivacyTest {
    @Test
    fun redactIdentifierDoesNotExposeRawSuffix() {
        val redacted = TracePrivacy.redactIdentifier("native-session-42")

        assertEquals(redacted, TracePrivacy.redactIdentifier("native-session-42"))
        assertTrue(redacted!!.startsWith("17:"))
        assertFalse(redacted.contains("session"))
        assertFalse(redacted.contains("42"))
    }

    @Test
    fun redactIdentifierReturnsNullForBlankInput() {
        assertNull(TracePrivacy.redactIdentifier(null))
        assertNull(TracePrivacy.redactIdentifier("   "))
    }

    @Test
    fun redactUriPreservesOnlyCoarseShapeAndHash() {
        val redacted = TracePrivacy.redactUri("content://provider/root/private-folder/secret.json")

        assertTrue(redacted!!.contains("scheme=content"))
        assertTrue(redacted.contains("authority=provider"))
        assertFalse(redacted.contains("private-folder"))
        assertFalse(redacted.contains("secret.json"))
    }

    @Test
    fun redactDisplayNamePreservesSafeExtensionOnly() {
        val redacted = TracePrivacy.redactDisplayName("family backup 2026.json")

        assertTrue(redacted!!.contains(":ext=json"))
        assertFalse(redacted.contains("family"))
        assertFalse(redacted.contains("backup"))
    }

    @Test
    fun traceValueSanitizesControlCharacters() {
        assertEquals("line one line two", TracePrivacy.traceValue("line one\nline two"))
    }

    @Test
    fun differentIdentifiersHaveDifferentHashes() {
        assertNotEquals(
            TracePrivacy.redactIdentifier("native-session-42"),
            TracePrivacy.redactIdentifier("native-session-43"),
        )
    }
}
