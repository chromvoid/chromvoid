package com.chromvoid.app.nativebridge

import android.content.Context
import android.net.Uri
import android.os.Build
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.Q])
class NativeUriFileMetadataResolverTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun resolve_prefersExplicitMetadata() {
        val metadata = resolve(
            uri = Uri.parse("content://com.example.files/raw/report.pdf"),
            displayName = "  explicit.txt  ",
            size = 42,
            mimeType = "  text/plain  ",
            fallbackName = "fallback.bin",
            defaultMimeType = "application/octet-stream",
            guessMimeTypeFromUriPath = true,
        )

        assertEquals("explicit.txt", metadata.name)
        assertEquals(42L, metadata.size)
        assertEquals("text/plain", metadata.mimeType)
    }

    @Test
    fun resolve_guessesShareMimeTypeFromUriPath() {
        val metadata = resolve(
            uri = Uri.parse("content://com.example.files/raw/report.pdf"),
            displayName = null,
            size = null,
            mimeType = null,
            fallbackName = "shared-file-1",
            defaultMimeType = null,
            guessMimeTypeFromUriPath = true,
        )

        assertEquals("shared-file-1", metadata.name)
        assertNull(metadata.size)
        assertEquals("application/pdf", metadata.mimeType)
    }

    @Test
    fun resolve_usesUploadDefaultMimeTypeWhenUriPathGuessDisabled() {
        val metadata = resolve(
            uri = Uri.parse("content://com.example.files/raw/report.pdf"),
            displayName = null,
            size = null,
            mimeType = null,
            fallbackName = "shared-file-1",
            defaultMimeType = "application/octet-stream",
            guessMimeTypeFromUriPath = false,
        )

        assertEquals("shared-file-1", metadata.name)
        assertNull(metadata.size)
        assertEquals("application/octet-stream", metadata.mimeType)
    }

    private fun resolve(
        uri: Uri,
        displayName: String?,
        size: Long?,
        mimeType: String?,
        fallbackName: String,
        defaultMimeType: String?,
        guessMimeTypeFromUriPath: Boolean,
    ): NativeUriFileMetadata =
        NativeUriFileMetadataResolver.resolve(
            context = context,
            uri = uri,
            displayName = displayName,
            size = size,
            mimeType = mimeType,
            fallbackName = fallbackName,
            defaultMimeType = defaultMimeType,
            guessMimeTypeFromUriPath = guessMimeTypeFromUriPath,
            queryFailureLog = { _, _ -> },
            sizeFailureLog = { _, _ -> },
        )
}
