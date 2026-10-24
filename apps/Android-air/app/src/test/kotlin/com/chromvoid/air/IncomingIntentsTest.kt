package com.chromvoid.air

import android.content.ClipData
import android.content.Intent
import android.net.Uri
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
public class IncomingIntentsTest {
    private val receipt = Uri.parse("content://sharing.app/receipt.pdf")
    private val photo = Uri.parse("content://sharing.app/photo.jpg")

    @Test
    public fun `a share of one or several documents is read from its stream or its clip`() {
        val one = Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, receipt)
        assertEquals(listOf(receipt), IncomingIntents.sharedDocuments(one))

        val several = Intent(Intent.ACTION_SEND_MULTIPLE)
            .putParcelableArrayListExtra(Intent.EXTRA_STREAM, arrayListOf(receipt, photo, receipt))
        assertEquals(listOf(receipt, photo), IncomingIntents.sharedDocuments(several))

        val clipped = Intent(Intent.ACTION_SEND).apply {
            clipData = ClipData.newRawUri(null, photo)
        }
        assertEquals(listOf(photo), IncomingIntents.sharedDocuments(clipped))

        val opened = Intent(Intent.ACTION_VIEW, receipt)
        assertEquals(listOf(receipt), IncomingIntents.sharedDocuments(opened))
    }

    @Test
    public fun `only documents another app grants are taken`() {
        val file = Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, Uri.parse("file:///data/data/x/secret"))
        assertEquals(emptyList<Uri>(), IncomingIntents.sharedDocuments(file))

        val text = Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_TEXT, "https://example.com")
        assertEquals(emptyList<Uri>(), IncomingIntents.sharedDocuments(text))
    }

    @Test
    public fun `the launcher and a share replayed from Recents are no share`() {
        assertNull(IncomingIntents.sharedDocuments(Intent(Intent.ACTION_MAIN)))
        val replayed = Intent(Intent.ACTION_SEND)
            .putExtra(Intent.EXTRA_STREAM, receipt)
            .addFlags(Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY)
        assertNull(IncomingIntents.sharedDocuments(replayed))
    }
}
