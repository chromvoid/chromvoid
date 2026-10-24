package com.chromvoid.air.session

import com.chromvoid.air.bridge.AirSessionRuntime
import com.chromvoid.air.bridge.perform
import com.chromvoid.air.bridge.wire.CatalogAttachmentRequest
import com.chromvoid.air.bridge.wire.CatalogAttachmentResponse
import com.chromvoid.air.bridge.wire.CatalogDocumentLinkKind
import com.chromvoid.air.bridge.wire.CatalogDocumentLinkRequest
import com.chromvoid.air.bridge.wire.CatalogDocumentLinkResponse
import com.chromvoid.air.bridge.wire.CatalogFolderPageRequest
import com.chromvoid.air.bridge.wire.CatalogFolderPageResponse
import com.chromvoid.air.bridge.wire.NodeCreatedResponse
import com.chromvoid.air.bridge.wire.SourceMetadataResponse
import com.chromvoid.air.bridge.wire.UploadResponse
import com.chromvoid.air.ffi.AirFileWriteTarget
import com.chromvoid.air.ffi.AirPhase
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.files.DerivativeTier
import com.chromvoid.air.ui.files.FileChanged
import com.chromvoid.air.ui.files.FileContent
import com.chromvoid.air.ui.files.FileDestination
import com.chromvoid.air.ui.files.FileReader
import com.chromvoid.air.ui.files.FileSource
import com.chromvoid.air.ui.files.FileStore
import com.chromvoid.air.ui.files.FileTooLarge
import com.chromvoid.air.ui.files.NotText
import com.chromvoid.air.ui.files.OpenedDocument
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The catalog commands over the session's runtime, with the requests iOS
 * sends. It holds nothing: each call names its generation, and Rust refuses
 * one that is no longer current.
 */
internal class SessionFileStore(
    private val runtime: () -> AirSessionRuntime?,
) : FileStore {
    override suspend fun filePage(request: CatalogFolderPageRequest, generation: ULong): CatalogFolderPageResponse =
        current().perform<CatalogFolderPageRequest, CatalogFolderPageResponse>(
            "catalog:folder:list",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun createFolder(name: String, parent: String, generation: ULong) {
        current().perform<JsonObject, NodeCreatedResponse>(
            "catalog:createDir",
            buildJsonObject {
                put("name", name)
                put("parent_path", parent)
            },
            AirPhase.UNLOCKED,
            generation,
        )
    }

    override suspend fun renameFile(id: Long, name: String, generation: ULong) {
        current().perform<JsonObject, JsonElement>(
            "catalog:rename",
            buildJsonObject {
                put("node_id", id)
                put("new_name", name)
            },
            AirPhase.UNLOCKED,
            generation,
        )
    }

    override suspend fun moveFile(id: Long, parent: String, generation: ULong) {
        current().perform<JsonObject, JsonElement>(
            "catalog:move",
            buildJsonObject {
                put("node_id", id)
                put("new_parent_path", parent)
                put("replace_existing", false)
            },
            AirPhase.UNLOCKED,
            generation,
        )
    }

    override suspend fun deleteFile(id: Long, generation: ULong) {
        current().perform<JsonObject, JsonElement>(
            "catalog:delete",
            buildJsonObject { put("node_id", id) },
            AirPhase.UNLOCKED,
            generation,
        )
    }

    override suspend fun fileInfo(id: Long, generation: ULong): SourceMetadataResponse =
        current().perform<JsonObject, SourceMetadataResponse>(
            "catalog:source:metadata",
            buildJsonObject { put("node_id", id) },
            AirPhase.UNLOCKED,
            generation,
        )

    override val documentByteLimit: Long
        get() = current().fileTransferLimits().documentBytes.toLong()

    override suspend fun importFile(
        source: FileSource,
        parent: String,
        generation: ULong,
        progress: (Long, Long) -> Unit,
    ): UploadResponse {
        val runtime = current()
        try {
            val info = source.open()
            val saved = upload(
                runtime,
                AirFileWriteTarget(parent, info.name, info.mimeType, info.size.toULong()),
                generation,
                read = { maximum -> source.read(maximum) },
                progress = { sent -> progress(sent, info.size) },
            )
            return saved
        } finally {
            source.close()
        }
    }

    override suspend fun importAttachment(
        source: FileSource,
        folder: String,
        generation: ULong,
        progress: (Long, Long) -> Unit,
    ): String {
        val runtime = current()
        try {
            val info = source.open()
            val destination = runtime.perform<CatalogAttachmentRequest, CatalogAttachmentResponse>(
                "catalog:attachment:prepare",
                CatalogAttachmentRequest(fileName = info.name, folderPath = folder, mimeType = info.mimeType.orEmpty()),
                AirPhase.UNLOCKED,
                generation,
            )
            upload(
                runtime,
                AirFileWriteTarget(destination.parentPath, destination.name, destination.mimeType, info.size.toULong()),
                generation,
                read = { maximum -> source.read(maximum) },
                progress = { sent -> progress(sent, info.size) },
            )
            return destination.markdown
        } finally {
            source.close()
        }
    }

    override suspend fun createNote(name: String, text: String, parent: String, generation: ULong): UploadResponse {
        val bytes = text.encodeToByteArray()
        try {
            var offset = 0
            return upload(
                current(),
                AirFileWriteTarget(parent, name, MARKDOWN, bytes.size.toULong()),
                generation,
                read = { maximum ->
                    val end = minOf(bytes.size, offset + maximum)
                    bytes.copyOfRange(offset, end).also { offset = end }
                },
                progress = {},
            )
        } finally {
            bytes.fill(0)
        }
    }

    override suspend fun readFile(
        id: Long,
        generation: ULong,
        maximumBytes: Long,
        head: (ByteArray) -> Unit,
    ): FileContent {
        val reader = current().beginFileRead(id, generation)
        var data: ByteArray? = null
        try {
            var filled = 0
            var source: SourceMetadataResponse? = null
            while (true) {
                val chunk = reader.read(filled.toLong(), reader.maximumChunkBytes)
                try {
                    val metadata = chunk.metadata
                    source?.let { first ->
                        if (first.nodeID != metadata.nodeID ||
                            first.sourceRevision != metadata.sourceRevision ||
                            first.size != metadata.size
                        ) {
                            throw FileChanged()
                        }
                    }
                    source = metadata
                    if (metadata.size > maximumBytes || metadata.size > Int.MAX_VALUE) throw FileTooLarge()
                    val buffer = data ?: ByteArray(metadata.size.toInt()).also { data = it }
                    if (chunk.bytes.size > buffer.size - filled) throw BridgeException.InvalidFileReadState()
                    chunk.bytes.copyInto(buffer, filled)
                    filled += chunk.bytes.size
                    if (filled == buffer.size) return FileContent(metadata, buffer)
                    if (chunk.bytes.isEmpty()) throw BridgeException.InvalidFileReadState()
                    if (filled == chunk.bytes.size) head(buffer.copyOf(filled))
                } finally {
                    chunk.bytes.fill(0)
                }
            }
        } catch (error: Throwable) {
            data?.fill(0)
            throw error
        } finally {
            reader.cancel()
        }
    }

    override suspend fun readDocument(id: Long, generation: ULong): OpenedDocument {
        val content = readFile(id, generation, documentByteLimit)
        try {
            val decoder = Charsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
            val text = try {
                decoder.decode(ByteBuffer.wrap(content.bytes)).toString()
            } catch (_: CharacterCodingException) {
                throw NotText()
            }
            if (text.contains('\u0000')) throw NotText()
            val metadata = content.metadata
            return OpenedDocument(id, metadata.sourceRevision, metadata.name, text, metadata.mimeType)
        } finally {
            content.bytes.fill(0)
        }
    }

    override suspend fun saveDocument(id: Long, sourceRevision: Long, text: String, generation: ULong): Long {
        val bytes = text.encodeToByteArray()
        try {
            return current().saveDocument(id, sourceRevision, bytes, generation).sourceRevision
        } finally {
            bytes.fill(0)
        }
    }

    override suspend fun resolveLink(
        sourceId: Long,
        path: String,
        kind: CatalogDocumentLinkKind,
        generation: ULong,
    ): CatalogDocumentLinkResponse = current().perform<CatalogDocumentLinkRequest, CatalogDocumentLinkResponse>(
        "catalog:document:resolve-link",
        CatalogDocumentLinkRequest(kind, path, sourceId),
        AirPhase.UNLOCKED,
        generation,
    )

    override fun openReader(id: Long, generation: ULong): FileReader {
        val reader = current().beginFileRead(id, generation)
        return object : FileReader {
            override val maximumChunkBytes: Long = reader.maximumChunkBytes

            override suspend fun read(offset: Long, length: Long): FileContent =
                reader.read(offset, length).let { FileContent(it.metadata, it.bytes) }

            override fun cancel() {
                reader.cancel()
            }
        }
    }

    override suspend fun readHead(id: Long, generation: ULong): ByteArray {
        val reader = current().beginFileRead(id, generation)
        try {
            return reader.read(0, reader.maximumChunkBytes).bytes
        } finally {
            reader.cancel()
        }
    }

    override suspend fun derivative(
        id: Long,
        sourceRevision: Long,
        tier: DerivativeTier,
        ensure: Boolean,
        generation: ULong,
    ): ByteArray = current().derivative(id, sourceRevision, tier.wire, ensure, generation)

    override suspend fun exportFile(
        id: Long,
        destination: FileDestination,
        generation: ULong,
        progress: (Long, Long) -> Unit,
    ): SourceMetadataResponse {
        val reader = current().beginFileRead(id, generation)
        try {
            var offset = 0L
            var metadata: SourceMetadataResponse? = null
            while (true) {
                val chunk = reader.read(offset, reader.maximumChunkBytes)
                val source = metadata ?: chunk.metadata.also { metadata = it }
                try {
                    if (chunk.bytes.isEmpty()) break
                    destination.write(chunk.bytes)
                    offset += chunk.bytes.size
                } finally {
                    chunk.bytes.fill(0)
                }
                progress(offset, source.size)
                if (offset >= source.size) break
            }
            val source = checkNotNull(metadata)
            if (offset != source.size) throw BridgeException.InvalidFileReadState()
            destination.finish()
            return source
        } catch (error: Throwable) {
            withContext(NonCancellable) { runCatching { destination.abandon() } }
            throw error
        } finally {
            reader.cancel()
        }
    }

    /**
     * Streams chunks from [read] into a new catalog file. Only a confirmed
     * finish counts; on any failure the writer is released - awaited, because
     * another write may not start over a live one - before the error goes up.
     */
    private suspend fun upload(
        runtime: AirSessionRuntime,
        target: AirFileWriteTarget,
        generation: ULong,
        read: suspend (Int) -> ByteArray,
        progress: (Long) -> Unit,
    ): UploadResponse {
        val writer = runtime.beginFileWrite(target, generation)
        try {
            val chunkBytes = runtime.fileTransferLimits().writeChunkBytes.toInt()
            var sent = 0L
            progress(0)
            while (true) {
                val chunk = read(chunkBytes)
                if (chunk.isEmpty()) break
                try {
                    sent += chunk.size
                    // The picked document is held to the size it declared; Core checks it too.
                    if (sent.toULong() > target.byteCount) throw IOException("The file grew while it was read")
                    val staged = writer.append(chunk)
                    progress(staged.uploadedBytes)
                } finally {
                    chunk.fill(0)
                }
            }
            return writer.finish()
        } catch (error: Throwable) {
            writer.close()
            throw error
        }
    }

    private fun current(): AirSessionRuntime = runtime() ?: throw BridgeException.SessionRevoked()

    private companion object {
        const val MARKDOWN = "text/markdown"
    }
}
