package com.chromvoid.air.ui.transfer

import com.chromvoid.air.bridge.wire.PassmanagerRootImportPreview
import java.io.InputStream

/** A file the person chose. It can be read again, since a password retry reads it from the start. */
public interface ImportSource {
    public val name: String

    public fun open(): InputStream
}

/** Core's review of one file, held in Rust until it is committed or cancelled. */
public interface ReviewedImport {
    public val preview: PassmanagerRootImportPreview

    /** Applies exactly what was reviewed; the review is spent afterwards, whatever the outcome. */
    public suspend fun commit()

    public fun cancel()
}

/** The chosen file is larger than one import may be. */
public class ImportFileTooLarge : Exception("credential import is too large")

/**
 * Moving credentials in and out of the vault. The document is never modelled
 * here: bytes go to Rust, Core answers with a review, and only an explicit
 * commit applies it. An export is read in full under one generation.
 */
public interface CredentialTransferStore {
    public suspend fun reviewCredentialFile(
        source: ImportSource,
        replacing: Boolean,
        sourcePassword: String?,
        generation: ULong,
    ): ReviewedImport

    public suspend fun exportCredentialDocument(generation: ULong): ByteArray

    public suspend fun clearCredentials(generation: ULong)
}
